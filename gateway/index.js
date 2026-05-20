const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

// Config for gRPC endpoints
const TEAM_SERVICE_HOST = process.env.TEAM_SERVICE_HOST || 'localhost';
const TEAM_SERVICE_PORT = process.env.TEAM_SERVICE_PORT || '50051';
const STUDENT_SERVICE_HOST = process.env.STUDENT_SERVICE_HOST || 'localhost';
const STUDENT_SERVICE_PORT = process.env.STUDENT_SERVICE_PORT || '50052';

const PROTO_PATH = path.join(__dirname, '../shared-proto/classroom.proto');

// Load protobuf definitions
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const classroomProto = protoDescriptor.classroom;

// gRPC Clients
const teamClient = new classroomProto.TeamService(
  `${TEAM_SERVICE_HOST}:${TEAM_SERVICE_PORT}`,
  grpc.credentials.createInsecure()
);

const studentClient = new classroomProto.StudentService(
  `${STUDENT_SERVICE_HOST}:${STUDENT_SERVICE_PORT}`,
  grpc.credentials.createInsecure()
);

// Express Setup
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: '*', // Allow any origin for simple distributed testing
    methods: ['GET', 'POST'],
  },
});

// Simple healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Gateway is running' });
});

// Helper functions for gRPC to avoid callback hell inside socket event handlers
function gRPC_CreateRoom(teams, maxStudents) {
  return new Promise((resolve, reject) => {
    teamClient.createRoom({ teams, maxStudents }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

function gRPC_GetRoom(roomCode) {
  return new Promise((resolve, reject) => {
    teamClient.getRoom({ roomCode }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

function gRPC_AddStudent(roomCode, studentName) {
  return new Promise((resolve, reject) => {
    studentClient.addStudent({ roomCode, studentName }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

function gRPC_GetStudents(roomCode) {
  return new Promise((resolve, reject) => {
    studentClient.getStudents({ roomCode }, (err, response) => {
      if (err) reject(err);
      resolve(response ? response.students : []);
    });
  });
}

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`[Gateway] Client connected: ${socket.id}`);

  // Event: create-room
  // Args: data = { teams: number }, callback
  socket.on('create-room', async (data, callback) => {
    try {
      const teams = parseInt(data.teams, 10);
      const maxStudents = parseInt(data.maxStudents, 10) || 0;
      if (isNaN(teams) || teams <= 0) {
        return callback({ success: false, message: 'Invalid number of teams' });
      }

      console.log(`[Gateway] Requesting room creation for ${teams} teams with limit ${maxStudents}...`);
      const response = await gRPC_CreateRoom(teams, maxStudents);
      console.log(`[Gateway] Room created successfully: ${response.roomCode}`);
      
      callback({ success: true, roomCode: response.roomCode });
    } catch (err) {
      console.error(`[Gateway] Create room failed: ${err.message}`);
      callback({ success: false, message: 'Failed to communicate with Team Service' });
    }
  });

  // Event: join-room
  // Args: data = { roomCode: string }, callback
  socket.on('join-room', async (data, callback) => {
    try {
      const roomCode = data.roomCode ? data.roomCode.toUpperCase().trim() : '';
      if (!roomCode) {
        return callback({ success: false, message: 'Room code is required' });
      }

      console.log(`[Gateway] Client ${socket.id} joining room: ${roomCode}`);

      // Verify room exists in Team Service
      const roomInfo = await gRPC_GetRoom(roomCode);
      if (!roomInfo.exists) {
        console.log(`[Gateway] Room join failed: ${roomCode} does not exist`);
        return callback({ success: false, message: `Room ${roomCode} not found` });
      }

      // Join the room in Socket.IO
      socket.join(roomCode);

      // Get current students list
      const students = await gRPC_GetStudents(roomCode);

      // Respond to client
      callback({
        success: true,
        roomCode,
        teams: roomInfo.teams,
        maxStudents: roomInfo.maxStudents,
        students,
      });

      // Also send a direct update back to confirm current list
      socket.emit('teams-updated', {
        roomCode,
        teams: roomInfo.teams,
        maxStudents: roomInfo.maxStudents,
        students,
      });

    } catch (err) {
      console.error(`[Gateway] Join room failed: ${err.message}`);
      callback({ success: false, message: 'Failed to query room state' });
    }
  });

  // Event: add-student
  // Args: data = { roomCode: string, studentName: string }, callback
  socket.on('add-student', async (data, callback) => {
    try {
      const roomCode = data.roomCode ? data.roomCode.toUpperCase().trim() : '';
      const studentName = data.studentName ? data.studentName.trim() : '';

      if (!roomCode || !studentName) {
        return callback({ success: false, message: 'Room code and student name are required' });
      }

      console.log(`[Gateway] Adding student "${studentName}" to room: ${roomCode}`);

      // Call Student Service via gRPC
      const response = await gRPC_AddStudent(roomCode, studentName);

      if (!response.success) {
        console.log(`[Gateway] AddStudent gRPC call failed: ${response.message}`);
        return callback({ success: false, message: response.message });
      }

      console.log(`[Gateway] Student "${studentName}" added. Assigned team: ${response.assignedTeam}`);

      // Return result to the specific user who joined
      callback({
        success: true,
        assignedTeam: response.assignedTeam,
      });

      // Get the updated list of students and details for this room
      const students = await gRPC_GetStudents(roomCode);
      const roomInfo = await gRPC_GetRoom(roomCode);

      // Broadcast the update to EVERYONE in this room
      io.to(roomCode).emit('teams-updated', {
        roomCode,
        teams: roomInfo.teams,
        maxStudents: roomInfo.maxStudents,
        students,
      });

    } catch (err) {
      console.error(`[Gateway] Add student failed: ${err.message}`);
      callback({ success: false, message: 'Failed to communicate with Student Service' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Gateway] Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`[Gateway] Server listening on port ${PORT}`);
  console.log(`[Gateway] gRPC Team Service configured at ${TEAM_SERVICE_HOST}:${TEAM_SERVICE_PORT}`);
  console.log(`[Gateway] gRPC Student Service configured at ${STUDENT_SERVICE_HOST}:${STUDENT_SERVICE_PORT}`);
});
