const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
require('dotenv').config(); // Cargar variables de entorno

const PORT = process.env.PORT || 3000;

// ==========================================
// Configuración de endpoints gRPC
// ==========================================
// Extraídos desde las variables de entorno para soportar la ejecución distribuida (múltiples laptops)
const TEAM_SERVICE_HOST = process.env.TEAM_SERVICE_HOST || 'localhost';
const TEAM_SERVICE_PORT = process.env.TEAM_SERVICE_PORT || '50051';
const STUDENT_SERVICE_HOST = process.env.STUDENT_SERVICE_HOST || 'localhost';
const STUDENT_SERVICE_PORT = process.env.STUDENT_SERVICE_PORT || '50052';

// Ruta al archivo de definición de interfaces Protobuf
const PROTO_PATH = path.join(__dirname, '../shared-proto/classroom.proto');

// ==========================================
// Carga de las definiciones de Protobuf
// ==========================================
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const classroomProto = protoDescriptor.classroom;

// ==========================================
// Instanciación de Clientes gRPC
// ==========================================
// Estos clientes permitirán que el Gateway actúe como consumidor de los microservicios backend.

// Cliente para conectarse al TeamService
const teamClient = new classroomProto.TeamService(
  `${TEAM_SERVICE_HOST}:${TEAM_SERVICE_PORT}`,
  grpc.credentials.createInsecure()
);

// Cliente para conectarse al StudentService
const studentClient = new classroomProto.StudentService(
  `${STUDENT_SERVICE_HOST}:${STUDENT_SERVICE_PORT}`,
  grpc.credentials.createInsecure()
);

// ==========================================
// Configuración de Express y Socket.IO
// ==========================================

const app = express();
app.use(cors()); // Permitir peticiones Cross-Origin
app.use(express.json());

const server = http.createServer(app);

// Inicializar Servidor de WebSockets (Socket.IO)
const io = new Server(server, {
  cors: {
    origin: '*', // Permitir cualquier origen para facilitar las pruebas en red local
    methods: ['GET', 'POST'],
  },
});

// Endpoint básico para revisar el estado del Gateway
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'El Gateway está en funcionamiento' });
});

// ==========================================
// Funciones Auxiliares (Wrappers) para gRPC
// ==========================================
// Se envuelven las llamadas basadas en callbacks de gRPC en Promesas nativas, 
// lo que permite el uso de 'async/await' y evita el 'callback hell' dentro de los sockets.

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

// ==========================================
// Manejador de Conexiones de WebSockets
// ==========================================

io.on('connection', (socket) => {
  console.log(`[Gateway] Cliente conectado: ${socket.id}`);

  /**
   * EVENTO: 'create-room'
   * Origen: Docente.
   * Objetivo: Solicitar la creación de una sala nueva.
   */
  socket.on('create-room', async (data, callback) => {
    try {
      const teams = parseInt(data.teams, 10);
      const maxStudents = parseInt(data.maxStudents, 10) || 0;
      
      // Validación básica
      if (isNaN(teams) || teams <= 0) {
        return callback({ success: false, message: 'Número de equipos inválido' });
      }

      console.log(`[Gateway] Solicitando crear sala para ${teams} equipos con límite ${maxStudents}...`);
      
      // Esperar a que el Team Service la cree
      const response = await gRPC_CreateRoom(teams, maxStudents);
      console.log(`[Gateway] Sala creada exitosamente: ${response.roomCode}`);
      
      // Responder al cliente de frontend con el éxito y el código
      callback({ success: true, roomCode: response.roomCode });
    } catch (err) {
      console.error(`[Gateway] Fallo al crear sala: ${err.message}`);
      callback({ success: false, message: 'Fallo al comunicarse con Team Service' });
    }
  });

  /**
   * EVENTO: 'join-room'
   * Origen: Docente (al crear) o Alumno (antes de registrarse).
   * Objetivo: Suscribirse al canal de WebSockets de la sala y recibir estado inicial.
   */
  socket.on('join-room', async (data, callback) => {
    try {
      const roomCode = data.roomCode ? data.roomCode.toUpperCase().trim() : '';
      if (!roomCode) {
        return callback({ success: false, message: 'El código de sala es requerido' });
      }

      console.log(`[Gateway] Cliente ${socket.id} uniéndose a sala: ${roomCode}`);

      // Verificar en Team Service que la sala realmente existe
      const roomInfo = await gRPC_GetRoom(roomCode);
      if (!roomInfo.exists) {
        console.log(`[Gateway] Unión fallida: Sala ${roomCode} no existe`);
        return callback({ success: false, message: `Sala ${roomCode} no encontrada` });
      }

      // Añadir el socket del cliente al "room" lógico de Socket.IO
      socket.join(roomCode);

      // Obtener la lista actual de estudiantes del Student Service
      const students = await gRPC_GetStudents(roomCode);

      // Responder al cliente que acaba de unirse con el estado actual
      callback({
        success: true,
        roomCode,
        teams: roomInfo.teams,
        maxStudents: roomInfo.maxStudents,
        students,
      });

      // Emitir también un evento directo para asegurar la actualización en la UI
      socket.emit('teams-updated', {
        roomCode,
        teams: roomInfo.teams,
        maxStudents: roomInfo.maxStudents,
        students,
      });

    } catch (err) {
      console.error(`[Gateway] Fallo al unirse a sala: ${err.message}`);
      callback({ success: false, message: 'Error al consultar estado de sala' });
    }
  });

  /**
   * EVENTO: 'add-student'
   * Origen: Alumno.
   * Objetivo: Registrar al alumno y asignarlo equitativamente a un equipo.
   */
  socket.on('add-student', async (data, callback) => {
    try {
      const roomCode = data.roomCode ? data.roomCode.toUpperCase().trim() : '';
      const studentName = data.studentName ? data.studentName.trim() : '';

      if (!roomCode || !studentName) {
        return callback({ success: false, message: 'Código y nombre son requeridos' });
      }

      console.log(`[Gateway] Añadiendo estudiante "${studentName}" a sala: ${roomCode}`);

      // Llamada gRPC hacia el Student Service para la lógica de asignación
      const response = await gRPC_AddStudent(roomCode, studentName);

      // Si el servicio backend rechaza la asignación (ej. cupo lleno, nombre repetido)
      if (!response.success) {
        console.log(`[Gateway] Llamada gRPC AddStudent falló: ${response.message}`);
        return callback({ success: false, message: response.message });
      }

      console.log(`[Gateway] Alumno "${studentName}" añadido. Equipo asignado: ${response.assignedTeam}`);

      // Responder específicamente a quien originó el evento con el resultado directo de su acción
      callback({
        success: true,
        assignedTeam: response.assignedTeam,
      });

      // Luego, obtener el estado actualizado para notificar a todos los presentes
      const students = await gRPC_GetStudents(roomCode);
      const roomInfo = await gRPC_GetRoom(roomCode);

      // BROADCAST: Emitir evento 'teams-updated' a TODOS en la sala
      io.to(roomCode).emit('teams-updated', {
        roomCode,
        teams: roomInfo.teams,
        maxStudents: roomInfo.maxStudents,
        students,
      });

    } catch (err) {
      console.error(`[Gateway] Fallo al añadir estudiante: ${err.message}`);
      callback({ success: false, message: 'Fallo al comunicarse con Student Service' });
    }
  });

  // Evento estándar de desconexión
  socket.on('disconnect', () => {
    console.log(`[Gateway] Cliente desconectado: ${socket.id}`);
  });
});

// Arrancar el servidor web/socket
server.listen(PORT, () => {
  console.log(`[Gateway] Servidor escuchando en puerto ${PORT}`);
  console.log(`[Gateway] Configuración de gRPC Team Service en ${TEAM_SERVICE_HOST}:${TEAM_SERVICE_PORT}`);
  console.log(`[Gateway] Configuración de gRPC Student Service en ${STUDENT_SERVICE_HOST}:${STUDENT_SERVICE_PORT}`);
});
