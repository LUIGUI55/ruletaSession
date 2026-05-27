const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
require('dotenv').config(); // Cargar variables de entorno desde el archivo .env

// Ruta absoluta al archivo Protobuf compartido
const PROTO_PATH = path.join(__dirname, '../shared-proto/classroom.proto');
// Puerto en el que correrá este servicio (por defecto 50051)
const PORT = process.env.PORT || 50051;

// ==========================================
// Configuración de gRPC y Protobuf
// ==========================================

// Cargar la definición del archivo protobuf.
// Se usan opciones para mantener el formato original y evitar transformaciones extrañas.
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

// Cargar el paquete de definición en la estructura grpc
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const classroomProto = protoDescriptor.classroom;

// ==========================================
// Almacenamiento en Memoria
// ==========================================

// Objeto que almacena la información de las salas creadas.
// Su clave es el roomCode (ej. 'ABCD') y el valor es un objeto con la cantidad de equipos y el límite de estudiantes.
const rooms = {};

/**
 * Función auxiliar para generar un código de sala único de 4 caracteres.
 * Utiliza letras mayúsculas y números.
 * Se asegura de que el código generado no exista ya en el objeto 'rooms'.
 * 
 * @returns {string} Código de sala único de 4 caracteres.
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]); // Asegurar unicidad comprobando si ya existe
  return code;
}

// ==========================================
// Implementación de los Servicios gRPC
// ==========================================

/**
 * Servicio gRPC: CreateRoom
 * Crea una nueva sala con los parámetros solicitados.
 * 
 * @param {object} call - El objeto de la llamada, que contiene los datos de la petición (request).
 * @param {function} callback - Función para enviar la respuesta de vuelta al cliente.
 */
function createRoom(call, callback) {
  const teamCount = call.request.teams;
  const maxStudents = call.request.maxStudents || 30; // 30 por defecto si no se envía
  
  // Validar que el número de equipos sea mayor que 0
  if (!teamCount || teamCount <= 0) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'El número de equipos debe ser mayor a 0',
    });
  }

  // Generar código de sala
  const roomCode = generateRoomCode();
  
  // Guardar la configuración de la sala en memoria
  rooms[roomCode] = {
    teams: teamCount,
    maxStudents: maxStudents,
  };

  console.log(`[Team Service] Sala creada: ${roomCode} con ${teamCount} equipos y máximo ${maxStudents} alumnos.`);
  
  // Enviar respuesta exitosa con el código de la sala
  callback(null, { roomCode });
}

/**
 * Servicio gRPC: GetRoom
 * Obtiene la información de una sala (si existe).
 * 
 * @param {object} call - Objeto de la llamada.
 * @param {function} callback - Función de retorno.
 */
function getRoom(call, callback) {
  // Limpiar y transformar a mayúsculas el código recibido
  const roomCode = call.request.roomCode ? call.request.roomCode.toUpperCase() : '';
  const room = rooms[roomCode];

  // Si la sala no se encuentra, devolver que no existe
  if (!room) {
    console.log(`[Team Service] Búsqueda de Sala ${roomCode} - NO ENCONTRADA`);
    return callback(null, {
      roomCode,
      teams: 0,
      exists: false,
      maxStudents: 0,
    });
  }

  // Si se encuentra, devolver la información completa
  console.log(`[Team Service] Búsqueda de Sala ${roomCode} - ENCONTRADA (${room.teams} equipos, max ${room.maxStudents} alumnos)`);
  callback(null, {
    roomCode,
    teams: room.teams,
    exists: true,
    maxStudents: room.maxStudents,
  });
}

// ==========================================
// Inicio del Servidor
// ==========================================

/**
 * Función principal que configura e inicia el servidor gRPC de Team Service.
 */
function main() {
  const server = new grpc.Server();
  
  // Añadir el servicio definiendo sus métodos manejadores
  server.addService(classroomProto.TeamService.service, {
    createRoom: createRoom,
    getRoom: getRoom,
  });

  // Vincular el servidor al puerto configurado (ej. 50051)
  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(), // Credenciales inseguras para desarrollo
    (err, port) => {
      if (err) {
        console.error(`[Team Service] Error al vincular el puerto: ${err.message}`);
        return;
      }
      console.log(`[Team Service] Corriendo en el puerto gRPC ${port}`);
    }
  );
}

// Arrancar la aplicación
main();
