import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import confetti from 'canvas-confetti';
import { 
  Users, 
  User, 
  ArrowLeft, 
  Copy, 
  Check, 
  Sparkles, 
  UserPlus, 
  ShieldAlert, 
  Trophy,
  Loader2
} from 'lucide-react';

/**
 * Componente Principal de la Aplicación.
 * Maneja tanto la interfaz del docente (creador de sala) como la del alumno (quien se une).
 */
function App() {
  // ==========================================
  // Estados de la Interfaz de Usuario
  // ==========================================
  // Determina el flujo actual: 'select' (menú principal), 'teacher' (vista de profesor) o 'student' (vista de alumno).
  const [role, setRole] = useState('select'); 
  
  // Variables de entrada para el Docente
  const [teamsInput, setTeamsInput] = useState(3);       // Cantidad de equipos a crear
  const [maxStudentsInput, setMaxStudentsInput] = useState(30); // Límite de alumnos permitidos
  
  // Variables generales de la sesión
  const [roomCode, setRoomCode] = useState('');          // Código generado (para docente) o en uso
  const [studentName, setStudentName] = useState('');    // Nombre del alumno a registrarse
  const [roomCodeInput, setRoomCodeInput] = useState('');// Código ingresado por el alumno
  
  // Estados para alumnos
  const [joinedRoom, setJoinedRoom] = useState(false);   // Indica si el alumno logró unirse exitosamente
  const [assignedTeam, setAssignedTeam] = useState(null);// Equipo al que fue sorteado
  
  // Estado general de la sala (Datos en vivo)
  const [roomState, setRoomState] = useState({
    roomCode: '',
    teams: 0,
    maxStudents: 0,
    students: [] // Arreglo de alumnos registrados en la sala
  });
  
  // Estados de utilidad UI
  const [copied, setCopied] = useState(false);           // Animación para el botón de copiar código
  const [error, setError] = useState('');                // Mensajes de error para mostrar al usuario
  const [loading, setLoading] = useState(false);         // Estado de carga (loaders) mientras responde el backend

  // ==========================================
  // Ciclo de Vida: Conexión de WebSockets
  // ==========================================
  useEffect(() => {
    // Iniciar conexión al Gateway al cargar el componente
    socket.connect();

    socket.on('connect', () => {
      console.log('Conectado al Gateway de Sockets');
    });

    // Escuchar actualizaciones en vivo de la sala. 
    // Esto se dispara cada vez que alguien nuevo se registra.
    socket.on('teams-updated', (data) => {
      console.log('Evento teams-updated recibido:', data);
      setRoomState(data);
      if (data.roomCode) {
        setRoomCode(data.roomCode);
      }
    });

    socket.on('disconnect', () => {
      console.log('Desconectado del Gateway de Sockets');
    });

    // Limpieza al desmontar el componente: apagar los listeners y desconectar.
    return () => {
      socket.off('connect');
      socket.off('teams-updated');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, []);

  // ==========================================
  // Manejadores de Eventos (Handlers)
  // ==========================================

  /**
   * Copia el código de la sala al portapapeles.
   */
  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    // Reiniciar icono de check tras 2 segundos
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * ACCIÓN DEL DOCENTE: Crear una nueva sala.
   * Envía la configuración al Gateway mediante Sockets.
   */
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (teamsInput <= 0 || teamsInput > 20) {
      setError('Por favor, selecciona entre 1 y 20 equipos.');
      return;
    }
    setError('');
    setLoading(true);

    // Emitir evento para crear sala con el número de equipos y el límite de alumnos
    socket.emit('create-room', { teams: teamsInput, maxStudents: maxStudentsInput }, (response) => {
      setLoading(false);
      if (response && response.success) {
        // Al tener éxito, guardar código y unirse a ella para recibir las actualizaciones
        setRoomCode(response.roomCode);
        socket.emit('join-room', { roomCode: response.roomCode }, (joinResponse) => {
          if (joinResponse.success) {
            setRoomState({
              roomCode: joinResponse.roomCode,
              teams: joinResponse.teams,
              maxStudents: joinResponse.maxStudents,
              students: joinResponse.students
            });
          }
        });
      } else {
        setError(response?.message || 'Error al crear la sala');
      }
    });
  };

  /**
   * ACCIÓN DEL ALUMNO: Unirse a una sala y registrarse.
   * Valida nombre, código, e inicia el proceso de join y asignación.
   */
  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setError('Por favor, ingresa tu nombre.');
      return;
    }
    if (!roomCodeInput.trim()) {
      setError('Por favor, ingresa el código de sala.');
      return;
    }
    
    setError('');
    setLoading(true);

    // Estandarizar código
    const code = roomCodeInput.toUpperCase().trim();

    // Primero unirse al "canal de la sala" para recibir broadcast
    socket.emit('join-room', { roomCode: code }, (joinResponse) => {
      if (!joinResponse.success) {
        setLoading(false);
        setError(joinResponse.message || 'No se pudo conectar a la sala');
        return;
      }

      setRoomState({
        roomCode: joinResponse.roomCode,
        teams: joinResponse.teams,
        maxStudents: joinResponse.maxStudents,
        students: joinResponse.students
      });
      setRoomCode(code);

      // Ahora registrar al estudiante y obtener su equipo asignado
      socket.emit('add-student', { roomCode: code, studentName: studentName.trim() }, (addResponse) => {
        setLoading(false);
        if (addResponse.success) {
          setAssignedTeam(addResponse.assignedTeam);
          setJoinedRoom(true);
          // Disparar animación de celebración (Confetti) al asignarse con éxito
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
          });
        } else {
          setError(addResponse.message || 'Error al registrar al alumno');
        }
      });
    });
  };

  /**
   * Reinicia la aplicación a su estado inicial, volviendo al menú de roles.
   */
  const resetAll = () => {
    setRole('select');
    setRoomCode('');
    setStudentName('');
    setRoomCodeInput('');
    setJoinedRoom(false);
    setAssignedTeam(null);
    setError('');
    setRoomState({
      roomCode: '',
      teams: 0,
      maxStudents: 0,
      students: []
    });
  };

  // ==========================================
  // Transformación de Datos para la Interfaz
  // ==========================================
  // Agrupar a los estudiantes de la lista general en sus respectivos equipos
  const teamsMap = {};
  for (let i = 1; i <= roomState.teams; i++) {
    teamsMap[i] = [];
  }
  roomState.students.forEach((s) => {
    if (teamsMap[s.assignedTeam]) {
      teamsMap[s.assignedTeam].push(s.name);
    }
  });

  // ==========================================
  // Renderizado (UI)
  // ==========================================
  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8">
      
      {/* Botón de Volver al menú principal */}
      <header className="w-full max-w-6xl flex items-center justify-end mb-8">
        {role !== 'select' && (
          <button 
            onClick={resetAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition duration-200 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver</span>
          </button>
        )}
      </header>

      {/* Contenedor Principal */}
      <main className="w-full max-w-6xl flex-grow flex items-center justify-center py-4">
        
        {/* ================= PANTALLA: SELECCIÓN DE ROL ================= */}
        {role === 'select' && (
          <div className="w-full max-w-2xl text-center space-y-8 animate-slide-up">
            <div className="space-y-4">
              <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
                Sistema de Equipos
              </span>
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-800">
                Generación de Equipos
              </h2>
              <p className="text-slate-600 max-w-lg mx-auto text-base md:text-lg">
                Crea una sala como docente o únete a una como alumno para ser asignado de manera equitativa.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {/* Tarjeta de Docente */}
              <button 
                onClick={() => setRole('teacher')}
                className="glass-panel p-8 rounded-2xl text-left hover:-translate-y-1 transition duration-200 flex flex-col justify-between h-60 cursor-pointer"
              >
                <div className="bg-slate-100 p-4 rounded-2xl w-fit">
                  <Users className="h-8 w-8 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2 text-slate-800">Docente / Coordinador</h3>
                  <p className="text-slate-500 text-sm">
                    Configura la cantidad de equipos, genera el código de sala y proyecta la asignación en tiempo real.
                  </p>
                </div>
              </button>

              {/* Tarjeta de Alumno */}
              <button 
                onClick={() => setRole('student')}
                className="glass-panel p-8 rounded-2xl text-left hover:-translate-y-1 transition duration-200 flex flex-col justify-between h-60 cursor-pointer"
              >
                <div className="bg-slate-100 p-4 rounded-2xl w-fit">
                  <UserPlus className="h-8 w-8 text-pink-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2 text-slate-800">Alumno / Participante</h3>
                  <p className="text-slate-500 text-sm">
                    Ingresa tu nombre y el código de la sala para descubrir a qué equipo has sido asignado.
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ================= FLUJO: DOCENTE - CREAR SALA ================= */}
        {role === 'teacher' && !roomCode && (
          <div className="w-full max-w-md glass-panel p-8 rounded-2xl animate-pop-in">
            <h3 className="text-2xl font-bold mb-2 flex items-center gap-2 text-slate-800">
              <Users className="text-indigo-600 h-6 w-6" />
              Crear Nueva Sala
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Elige en cuántos equipos se distribuirán los alumnos que se unan a la sala.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm flex items-center gap-2 animate-pop-in">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2 text-slate-600">
                    Nº Equipos
                  </label>
                  <input 
                    type="number"
                    min="2"
                    max="20"
                    value={teamsInput}
                    onChange={(e) => setTeamsInput(parseInt(e.target.value, 10) || '')}
                    className="w-full px-4 py-3 rounded-xl bg-slate-100 text-slate-800 text-lg font-bold text-center border-0 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                    placeholder="3"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2 text-slate-600">
                    Max Alumnos
                  </label>
                  <input 
                    type="number"
                    min="0"
                    max="200"
                    value={maxStudentsInput}
                    onChange={(e) => setMaxStudentsInput(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full px-4 py-3 rounded-xl bg-slate-100 text-slate-800 text-lg font-bold text-center border-0 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white rounded-xl font-bold transition duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>Generar Sala de Equipos</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ================= FLUJO: DOCENTE - DASHBOARD EN VIVO ================= */}
        {role === 'teacher' && roomCode && (
          <div className="w-full space-y-6 animate-slide-up">
            
            {/* Cabecera de Estadísticas Generales */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Tarjeta del Código de Sala */}
              <div className="lg:col-span-2 glass-panel p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Código de Sala Activa</span>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-4xl md:text-5xl font-extrabold tracking-wider text-indigo-600 bg-slate-100 px-4 py-1.5 rounded-xl">
                      {roomCode}
                    </span>
                    <button 
                      onClick={handleCopyCode}
                      className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition duration-200 cursor-pointer text-slate-600"
                      title="Copiar código"
                    >
                      {copied ? <Check className="h-6 w-6 text-emerald-600" /> : <Copy className="h-6 w-6" />}
                    </button>
                  </div>
                </div>
                <div className="text-center md:text-right">
                  <p className="text-sm text-slate-600 font-medium">Comparte este código con tus alumnos</p>
                  <p className="text-xs text-indigo-600 font-semibold mt-1">Se unirán automáticamente en tiempo real</p>
                </div>
              </div>

              {/* Contador Total de Alumnos */}
              <div className="glass-panel p-6 rounded-2xl flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Total Alumnos</span>
                  <h4 className="text-4xl md:text-5xl font-extrabold mt-1.5 text-slate-800">
                    {roomState.students.length}
                    {roomState.maxStudents > 0 && (
                      <span className="text-xl md:text-2xl text-slate-400 font-medium">
                        /{roomState.maxStudents}
                      </span>
                    )}
                  </h4>
                </div>
                <div className="bg-slate-100 p-4 rounded-2xl">
                  <User className="h-8 w-8 text-indigo-600" />
                </div>
              </div>

            </div>

            {/* Rejilla de Equipos Múltiples */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.keys(teamsMap).map((teamNum) => {
                const members = teamsMap[teamNum];
                const teamColorIdx = ((parseInt(teamNum, 10) - 1) % 10) + 1; // Para alternar temas de colores CSS
                
                return (
                  <div 
                    key={teamNum} 
                    className={`glass-panel team-color-${teamColorIdx} p-6 rounded-2xl flex flex-col justify-between min-h-[16rem] transition duration-200`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-xl text-slate-800">Equipo {teamNum}</h4>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold team-badge-${teamColorIdx}`}>
                          {members.length} {members.length === 1 ? 'miembro' : 'miembros'}
                        </span>
                      </div>

                      {/* Lista Interna de Participantes */}
                      {members.length === 0 ? (
                        <p className="text-sm text-slate-400 italic mt-6 text-center">Esperando alumnos...</p>
                      ) : (
                        <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {members.map((name, idx) => (
                            <li 
                              key={idx} 
                              className="text-slate-700 text-sm bg-white/90 px-3 py-2 rounded-lg flex items-center gap-2 animate-pop-in"
                            >
                              <div className={`h-2 w-2 rounded-full bg-current team-badge-${teamColorIdx}`} />
                              <span className="font-semibold">{name}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= FLUJO: ALUMNO - UNIRSE A SALA ================= */}
        {role === 'student' && !joinedRoom && (
          <div className="w-full max-w-md glass-panel p-8 rounded-2xl animate-pop-in">
            <h3 className="text-2xl font-bold mb-2 flex items-center gap-2 text-slate-800">
              <UserPlus className="text-pink-500 h-6 w-6" />
              Entrar a una Sala
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              Ingresa tus datos para registrarte y unirte al sorteo de equipos.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm flex items-center gap-2 animate-pop-in">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1.5 text-slate-600">
                  Tu Nombre
                </label>
                <input 
                  type="text"
                  maxLength="25"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 text-slate-800 text-base border-0 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                  placeholder="Ej. Luisa Ortega"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5 text-slate-600">
                  Código de Sala
                </label>
                <input 
                  type="text"
                  maxLength="4"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 text-slate-800 text-center text-xl font-bold uppercase tracking-widest border-0 outline-none focus:ring-2 focus:ring-indigo-100 transition"
                  placeholder="ABCD"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white rounded-xl font-bold transition duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span>Entrar y Asignar Equipo</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ================= FLUJO: ALUMNO - VISTA ASIGNADA ================= */}
        {role === 'student' && joinedRoom && (
          <div className="w-full max-w-2xl space-y-6 animate-slide-up">
            
            {/* Tarjeta de Celebración de Éxito */}
            <div className="glass-panel p-8 rounded-2xl text-center relative overflow-hidden">
              <span className="px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-emerald-50 text-emerald-700 uppercase mb-4 inline-block">
                ¡Registro Exitoso!
              </span>

              <h3 className="text-2xl font-bold text-slate-800 mb-1">¡Hola, {studentName}!</h3>
              <p className="text-slate-500 text-sm mb-6">Tu equipo ha sido asignado de forma equitativa</p>
              
              {/* Equipo Destacado */}
              <div className="my-8 inline-block animate-pop-in">
                <div className={`px-12 py-8 rounded-2xl team-color-${((assignedTeam - 1) % 10) + 1} flex flex-col items-center justify-center gap-2`}>
                  <Trophy className="h-12 w-12 text-slate-700" />
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Has sido asignado al</span>
                  <span className="text-5xl font-black text-slate-800">
                    Equipo {assignedTeam}
                  </span>
                </div>
              </div>

              <div className="text-slate-500 text-xs mt-4">
                Sala: <span className="text-indigo-600 font-bold tracking-wider">{roomCode}</span> • Tu docente está proyectando el tablero principal
              </div>
            </div>

            {/* Listado de Compañeros de Equipo (Vista Parcial para Alumno) */}
            <div className="glass-panel p-6 rounded-2xl">
              <h4 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-600" />
                Miembros de tu equipo ({teamsMap[assignedTeam]?.length || 0})
              </h4>
              
              {teamsMap[assignedTeam] && teamsMap[assignedTeam].length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {teamsMap[assignedTeam].map((name, idx) => (
                    <div 
                      key={idx} 
                      className={`px-4 py-2.5 rounded-lg flex items-center gap-2 ${
                        name.toLowerCase() === studentName.toLowerCase() 
                          ? 'bg-indigo-100 font-bold text-indigo-700' // Resalta el propio usuario
                          : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className={`h-2 w-2 rounded-full ${
                        name.toLowerCase() === studentName.toLowerCase() ? 'bg-indigo-500' : 'bg-slate-400'
                      }`} />
                      <span>{name} {name.toLowerCase() === studentName.toLowerCase() && '(Tú)'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Eres el primer integrante en este equipo.</p>
              )}
            </div>

          </div>
        )}

      </main>

    </div>
  );
}

export default App;
