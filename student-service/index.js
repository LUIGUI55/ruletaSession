const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
require('dotenv').config();

const PROTO_PATH = path.join(__dirname, '../shared-proto/classroom.proto');
const PORT = process.env.PORT || 50052;

// gRPC clients config
const TEAM_SERVICE_HOST = process.env.TEAM_SERVICE_HOST || 'localhost';
const TEAM_SERVICE_PORT = process.env.TEAM_SERVICE_PORT || '50051';

// Load the protobuf definition
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const classroomProto = protoDescriptor.classroom;

// Establish client connection to Team Service
const teamServiceClient = new classroomProto.TeamService(
  `${TEAM_SERVICE_HOST}:${TEAM_SERVICE_PORT}`,
  grpc.credentials.createInsecure()
);

// In-memory student storage: roomCode -> Array<{ name, assignedTeam }>
const studentsByRoom = {};

/**
 * gRPC Service Implementations
 */
function addStudent(call, callback) {
  const { roomCode, studentName } = call.request;
  const sanitizedRoom = roomCode ? roomCode.toUpperCase() : '';
  const sanitizedName = studentName ? studentName.trim() : '';

  if (!sanitizedRoom || !sanitizedName) {
    return callback(null, {
      success: false,
      assignedTeam: 0,
      message: 'Room code and student name are required',
    });
  }

  // Call TeamService to check if room exists and get team count
  teamServiceClient.getRoom({ roomCode: sanitizedRoom }, (err, response) => {
    if (err) {
      console.error(`[Student Service] Error calling Team Service: ${err.message}`);
      return callback(null, {
        success: false,
        assignedTeam: 0,
        message: 'Could not connect to Team Service',
      });
    }

    if (!response.exists) {
      console.log(`[Student Service] AddStudent failed: Room ${sanitizedRoom} does not exist`);
      return callback(null, {
        success: false,
        assignedTeam: 0,
        message: `Room ${sanitizedRoom} does not exist`,
      });
    }

    const teamCount = response.teams;

    // Check if room array initialized in memory
    if (!studentsByRoom[sanitizedRoom]) {
      studentsByRoom[sanitizedRoom] = [];
    }

    // Check if student limit exceeded
    if (response.maxStudents && response.maxStudents > 0) {
      if (studentsByRoom[sanitizedRoom].length >= response.maxStudents) {
        console.log(`[Student Service] AddStudent failed: Room ${sanitizedRoom} is full (${studentsByRoom[sanitizedRoom].length}/${response.maxStudents})`);
        return callback(null, {
          success: false,
          assignedTeam: 0,
          message: `La sala está llena. Capacidad máxima: ${response.maxStudents} alumnos.`,
        });
      }
    }

    // Check if student name already exists in this room
    const exists = studentsByRoom[sanitizedRoom].some(
      (s) => s.name.toLowerCase() === sanitizedName.toLowerCase()
    );

    if (exists) {
      console.log(`[Student Service] AddStudent failed: ${sanitizedName} already in room ${sanitizedRoom}`);
      return callback(null, {
        success: false,
        assignedTeam: 0,
        message: `Name "${sanitizedName}" is already taken in this room`,
      });
    }

    // Calculate current student counts per team to perform equitable distribution
    const teamSizes = {};
    for (let i = 1; i <= teamCount; i++) {
      teamSizes[i] = 0;
    }
    studentsByRoom[sanitizedRoom].forEach((s) => {
      if (teamSizes[s.assignedTeam] !== undefined) {
        teamSizes[s.assignedTeam]++;
      }
    });

    // Find the minimum team size
    let minSize = Infinity;
    for (let i = 1; i <= teamCount; i++) {
      if (teamSizes[i] < minSize) {
        minSize = teamSizes[i];
      }
    }

    // Find all teams that have this minimum size
    const candidateTeams = [];
    for (let i = 1; i <= teamCount; i++) {
      if (teamSizes[i] === minSize) {
        candidateTeams.push(i);
      }
    }

    // Select randomly among the candidate teams with the minimum size
    const assignedTeam = candidateTeams[Math.floor(Math.random() * candidateTeams.length)];

    studentsByRoom[sanitizedRoom].push({
      name: sanitizedName,
      assignedTeam,
    });

    console.log(
      `[Student Service] Registered student "${sanitizedName}" to Team ${assignedTeam} in Room ${sanitizedRoom}`
    );

    callback(null, {
      success: true,
      assignedTeam,
      message: 'Student assigned successfully',
    });
  });
}

function getStudents(call, callback) {
  const roomCode = call.request.roomCode ? call.request.roomCode.toUpperCase() : '';
  const list = studentsByRoom[roomCode] || [];
  
  console.log(`[Student Service] Querying students for Room ${roomCode}. Found: ${list.length}`);
  callback(null, { students: list });
}

function main() {
  const server = new grpc.Server();
  server.addService(classroomProto.StudentService.service, {
    addStudent: addStudent,
    getStudents: getStudents,
  });

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error(`[Student Service] Failed to bind: ${err.message}`);
        return;
      }
      console.log(`[Student Service] Running on gRPC port ${port}`);
    }
  );
}

main();
