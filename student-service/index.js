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

    // Añadir al nuevo estudiante (equipo temporal, se recalcula enseguida)
    studentsByRoom[sanitizedRoom].push({
      name: sanitizedName,
      assignedTeam: 1
    });

    // REBALANCEO DINÁMICO
    balanceTeams(sanitizedRoom);

    // Encontrar qué equipo le tocó al estudiante recién añadido
    const me = studentsByRoom[sanitizedRoom].find(
      (s) => s.name.toLowerCase() === sanitizedName.toLowerCase()
    );

    console.log(
      `[Student Service] Estudiante registrado "${sanitizedName}" en Equipo ${me.assignedTeam} - Sala ${sanitizedRoom}`
    );

    // Enviar respuesta exitosa con el número de equipo
    callback(null, {
      success: true,
      assignedTeam: me.assignedTeam,
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
  
  console.log(`[Student Service] Consultando estudiantes de la Sala ${roomCode}. Encontrados: ${studentsByRoom[roomCode] ? studentsByRoom[roomCode].length : 0}`);
  // Devolver los estudiantes encontrados
  callback(null, { students: studentsByRoom[roomCode] || [] });
}

/**
 * Elimina a todos los estudiantes de una sala (cuando el docente la cierra)
 */
function clearStudents(call, callback) {
  const roomCode = call.request.roomCode?.toUpperCase();
  if (studentsByRoom[roomCode]) {
    delete studentsByRoom[roomCode];
    console.log(`[Student Service] Estudiantes de la sala ${roomCode} eliminados.`);
    callback(null, { success: true, message: 'Estudiantes eliminados' });
  } else {
    callback(null, { success: true, message: 'No había estudiantes que eliminar' });
  }
}

/**
 * Elimina a un estudiante en específico (cuando decide salir)
 */
function removeStudent(call, callback) {
  const roomCode = call.request.roomCode?.toUpperCase();
  const studentName = call.request.studentName?.trim();

  if (studentsByRoom[roomCode]) {
    const initialLength = studentsByRoom[roomCode].length;
    studentsByRoom[roomCode] = studentsByRoom[roomCode].filter(
      (s) => s.name.toLowerCase() !== studentName.toLowerCase()
    );
    
    if (studentsByRoom[roomCode].length < initialLength) {
      // REBALANCEO DINÁMICO TRAS SALIDA
      balanceTeams(roomCode);
      console.log(`[Student Service] Alumno "${studentName}" eliminado de la sala ${roomCode}`);
      return callback(null, { success: true, message: 'Alumno eliminado exitosamente' });
    }
  }
  
  console.log(`[Student Service] Intento de eliminar alumno fallido: "${studentName}" no estaba en ${roomCode}`);
  callback(null, { success: false, message: 'El alumno no se encontró en la sala' });
}

/**
 * Función Auxiliar: Balanceo Dinámico de Equipos
 * Reparte a todos los alumnos de la sala equitativamente usando el cálculo ceil(Total / 3).
 */
function balanceTeams(roomCode) {
  const students = studentsByRoom[roomCode];
  if (!students || students.length === 0) return;

  const numTeams = Math.max(1, Math.ceil(students.length / 3));
  
  // Repartir en orden (1, 2, 3, 1, 2, 3...) asegurando la distribución equitativa (ej. 3, 3, 2)
  students.forEach((student, index) => {
    student.assignedTeam = (index % numTeams) + 1;
  });
}

// ==========================================
// Inicio del Servidor
// ==========================================

/**
 * Función principal que configura e inicia el servidor gRPC de Student Service.
 */
function main() {
  const server = new grpc.Server();
  
  // Registrar las funciones del servicio
  server.addService(classroomProto.StudentService.service, {
    addStudent: addStudent,
    getStudents: getStudents,
    clearStudents: clearStudents,
    removeStudent: removeStudent,
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
