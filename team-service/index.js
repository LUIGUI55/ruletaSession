const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
require('dotenv').config();

const PROTO_PATH = path.join(__dirname, '../shared-proto/classroom.proto');
const PORT = process.env.PORT || 50051;

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

// In-memory room storage
const rooms = {};

// Helper to generate a unique room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]); // Ensure uniqueness
  return code;
}

/**
 * gRPC Service Implementations
 */
function createRoom(call, callback) {
  const teamCount = call.request.teams;
  const maxStudents = call.request.maxStudents || 30;
  
  if (!teamCount || teamCount <= 0) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'Number of teams must be greater than 0',
    });
  }

  const roomCode = generateRoomCode();
  rooms[roomCode] = {
    teams: teamCount,
    maxStudents: maxStudents,
  };

  console.log(`[Team Service] Created Room: ${roomCode} with ${teamCount} teams and max ${maxStudents} students.`);
  callback(null, { roomCode });
}

function getRoom(call, callback) {
  const roomCode = call.request.roomCode ? call.request.roomCode.toUpperCase() : '';
  const room = rooms[roomCode];

  if (!room) {
    console.log(`[Team Service] Query for Room ${roomCode} - NOT FOUND`);
    return callback(null, {
      roomCode,
      teams: 0,
      exists: false,
      maxStudents: 0,
    });
  }

  console.log(`[Team Service] Query for Room ${roomCode} - FOUND (${room.teams} teams, max ${room.maxStudents} students)`);
  callback(null, {
    roomCode,
    teams: room.teams,
    exists: true,
    maxStudents: room.maxStudents,
  });
}

function main() {
  const server = new grpc.Server();
  server.addService(classroomProto.TeamService.service, {
    createRoom: createRoom,
    getRoom: getRoom,
  });

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error(`[Team Service] Failed to bind: ${err.message}`);
        return;
      }
      console.log(`[Team Service] Running on gRPC port ${port}`);
    }
  );
}

main();
