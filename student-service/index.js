const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
require('dotenv').config(); // Cargar variables de entorno

// Ruta al archivo Protobuf
const PROTO_PATH = path.join(__dirname, '../shared-proto/classroom.proto');
// Puerto por el que escuchará el Student Service (por defecto 50052)
const PORT = process.env.PORT || 50052;

// ==========================================
// Configuración de gRPC Clients
// ==========================================
// Se necesita conocer dónde está el Team Service para poder validar las salas
const TEAM_SERVICE_HOST = process.env.TEAM_SERVICE_HOST || 'localhost';
const TEAM_SERVICE_PORT = process.env.TEAM_SERVICE_PORT || '50051';

// Cargar definición Protobuf
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
// Conexión como Cliente al Team Service
// ==========================================
// Este servicio necesita comunicarse con el Team Service de forma interna (inter-service communication).
const teamServiceClient = new classroomProto.TeamService(
  `${TEAM_SERVICE_HOST}:${TEAM_SERVICE_PORT}`,
  grpc.credentials.createInsecure() // Credenciales inseguras (sin TLS) para entorno de desarrollo local
);

// ==========================================
// Almacenamiento en Memoria
// ==========================================
// Diccionario que agrupa estudiantes por sala.
// Estructura: { 'ABCD': [ { name: 'Juan', assignedTeam: 2 }, ... ] }
const studentsByRoom = {};

// ==========================================
// Implementación de los Servicios gRPC
// ==========================================

/**
 * Servicio gRPC: AddStudent
 * Agrega a un estudiante a una sala y le asigna un equipo equitativamente.
 * Realiza una llamada interna a TeamService para validar la sala.
 * 
 * @param {object} call - Objeto de la llamada.
 * @param {function} callback - Función para enviar la respuesta.
 */
function addStudent(call, callback) {
  const { roomCode, studentName } = call.request;
  
  // Limpieza y estandarización de los datos de entrada
  const sanitizedRoom = roomCode ? roomCode.toUpperCase() : '';
  const sanitizedName = studentName ? studentName.trim() : '';

  // Validación básica de campos requeridos
  if (!sanitizedRoom || !sanitizedName) {
    return callback(null, {
      success: false,
      assignedTeam: 0,
      message: 'El código de sala y nombre de estudiante son requeridos',
    });
  }

  // Llamada RPC a TeamService para verificar si la sala existe y obtener su información
  teamServiceClient.getRoom({ roomCode: sanitizedRoom }, (err, response) => {
    if (err) {
      console.error(`[Student Service] Error al llamar a Team Service: ${err.message}`);
      return callback(null, {
        success: false,
        assignedTeam: 0,
        message: 'No se pudo conectar con Team Service',
      });
    }

    // Si la sala no existe en el TeamService, rechazamos el registro
    if (!response.exists) {
      console.log(`[Student Service] AddStudent fallido: La sala ${sanitizedRoom} no existe`);
      return callback(null, {
        success: false,
        assignedTeam: 0,
        message: `La sala ${sanitizedRoom} no existe`,
      });
    }

    const teamCount = response.teams;

    // Inicializar el arreglo de estudiantes de la sala si es la primera vez
    if (!studentsByRoom[sanitizedRoom]) {
      studentsByRoom[sanitizedRoom] = [];
    }

    // Verificar si se ha superado la capacidad máxima de alumnos
    if (response.maxStudents && response.maxStudents > 0) {
      if (studentsByRoom[sanitizedRoom].length >= response.maxStudents) {
        console.log(`[Student Service] AddStudent fallido: Sala ${sanitizedRoom} está llena (${studentsByRoom[sanitizedRoom].length}/${response.maxStudents})`);
        return callback(null, {
          success: false,
          assignedTeam: 0,
          message: `La sala está llena. Capacidad máxima: ${response.maxStudents} alumnos.`,
        });
      }
    }

    // Validar si el nombre del estudiante ya se encuentra registrado en esta sala
    const exists = studentsByRoom[sanitizedRoom].some(
      (s) => s.name.toLowerCase() === sanitizedName.toLowerCase()
    );

    if (exists) {
      console.log(`[Student Service] AddStudent fallido: ${sanitizedName} ya está en la sala ${sanitizedRoom}`);
      return callback(null, {
        success: false,
        assignedTeam: 0,
        message: `El nombre "${sanitizedName}" ya está en uso en esta sala`,
      });
    }

    // ==========================================
    // Lógica de Asignación Equitativa
    // ==========================================
    
    // Contar cuántos alumnos hay actualmente por cada equipo
    const teamSizes = {};
    for (let i = 1; i <= teamCount; i++) {
      teamSizes[i] = 0;
    }
    studentsByRoom[sanitizedRoom].forEach((s) => {
      if (teamSizes[s.assignedTeam] !== undefined) {
        teamSizes[s.assignedTeam]++;
      }
    });

    // Encontrar cuál es la menor cantidad de miembros que tiene algún equipo
    let minSize = Infinity;
    for (let i = 1; i <= teamCount; i++) {
      if (teamSizes[i] < minSize) {
        minSize = teamSizes[i];
      }
    }

    // Obtener los equipos que tienen esa cantidad mínima (candidatos para asignar)
    const candidateTeams = [];
    for (let i = 1; i <= teamCount; i++) {
      if (teamSizes[i] === minSize) {
        candidateTeams.push(i);
      }
    }

    // Seleccionar aleatoriamente uno de los equipos que tienen menos integrantes
    const assignedTeam = candidateTeams[Math.floor(Math.random() * candidateTeams.length)];

    // Guardar el estudiante con su equipo asignado
    studentsByRoom[sanitizedRoom].push({
      name: sanitizedName,
      assignedTeam,
    });

    console.log(
      `[Student Service] Estudiante registrado "${sanitizedName}" en Equipo ${assignedTeam} - Sala ${sanitizedRoom}`
    );

    // Enviar respuesta exitosa con el número de equipo
    callback(null, {
      success: true,
      assignedTeam,
      message: 'Estudiante asignado exitosamente',
    });
  });
}

/**
 * Servicio gRPC: GetStudents
 * Retorna todos los estudiantes registrados en una sala.
 * 
 * @param {object} call - Objeto de la petición.
 * @param {function} callback - Función de retorno.
 */
function getStudents(call, callback) {
  const roomCode = call.request.roomCode ? call.request.roomCode.toUpperCase() : '';
  const list = studentsByRoom[roomCode] || []; // Obtener la lista o un arreglo vacío si no existe
  
  console.log(`[Student Service] Consultando estudiantes de la Sala ${roomCode}. Encontrados: ${list.length}`);
  // Devolver los estudiantes encontrados
  callback(null, { students: list });
}

// ==========================================
// Inicio del Servidor
// ==========================================

/**
 * Función principal que configura e inicia el servidor gRPC de Student Service.
 */
function main() {
  const server = new grpc.Server();
  
  server.addService(classroomProto.StudentService.service, {
    addStudent: addStudent,
    getStudents: getStudents,
  });

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(), // Credenciales de desarrollo local
    (err, port) => {
      if (err) {
        console.error(`[Student Service] Error al vincular el puerto: ${err.message}`);
        return;
      }
      console.log(`[Student Service] Corriendo en el puerto gRPC ${port}`);
    }
  );
}

main();
