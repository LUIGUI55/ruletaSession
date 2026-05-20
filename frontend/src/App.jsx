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

function App() {
  const [role, setRole] = useState('select'); // 'select' | 'teacher' | 'student'
  const [teamsInput, setTeamsInput] = useState(3);
  const [maxStudentsInput, setMaxStudentsInput] = useState(30);
  const [roomCode, setRoomCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  
  const [joinedRoom, setJoinedRoom] = useState(false);
  const [assignedTeam, setAssignedTeam] = useState(null);
  
  const [roomState, setRoomState] = useState({
    roomCode: '',
    teams: 0,
    maxStudents: 0,
    students: []
  });
  
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Handle real-time updates via WebSockets
  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      console.log('Connected to socket gateway');
    });

    socket.on('teams-updated', (data) => {
      console.log('Received teams-updated event:', data);
      setRoomState(data);
      if (data.roomCode) {
        setRoomCode(data.roomCode);
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from socket gateway');
    });

    return () => {
      socket.off('connect');
      socket.off('teams-updated');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, []);

  // Copy Room Code to clipboard
  const handleCopyCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // TEACHER: Create a room
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (teamsInput <= 0 || teamsInput > 20) {
      setError('Por favor, selecciona entre 1 y 20 equipos.');
      return;
    }
    setError('');
    setLoading(true);

    socket.emit('create-room', { teams: teamsInput, maxStudents: maxStudentsInput }, (response) => {
      setLoading(false);
      if (response && response.success) {
        setRoomCode(response.roomCode);
        // Connect/Join room to receive updates
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

  // STUDENT: Join room and register
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

    const code = roomCodeInput.toUpperCase().trim();

    // First join the room room
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

      // Now add student
      socket.emit('add-student', { roomCode: code, studentName: studentName.trim() }, (addResponse) => {
        setLoading(false);
        if (addResponse.success) {
          setAssignedTeam(addResponse.assignedTeam);
          setJoinedRoom(true);
          // Trigger confetti
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

  // Group students by team
  const teamsMap = {};
  for (let i = 1; i <= roomState.teams; i++) {
    teamsMap[i] = [];
  }
  roomState.students.forEach((s) => {
    if (teamsMap[s.assignedTeam]) {
      teamsMap[s.assignedTeam].push(s.name);
    }
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 md:p-8">
      
      {/* Header */}
      <header className="w-full max-w-6xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-3 cursor-pointer" onClick={resetAll}>
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center animate-glow">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl md:text-2xl bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
              TeamGenerator
            </h1>
            <p className="text-xs text-slate-400 tracking-wider font-semibold uppercase">Distributed Classroom</p>
          </div>
        </div>

        {role !== 'select' && (
          <button 
            onClick={resetAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition duration-300"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver</span>
          </button>
        )}
      </header>

      {/* Main Container */}
      <main className="w-full max-w-6xl flex-grow flex items-center justify-center py-4">
        
        {/* ROLE SELECTION PAGE */}
        {role === 'select' && (
          <div className="w-full max-w-2xl text-center space-y-8 animate-slide-up">
            <div className="space-y-4">
              <span className="px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase">
                Sistema Distribuido gRPC + WebSockets
              </span>
              <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">
                Generación Automática de <br/>
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Equipos en Tiempo Real
                </span>
              </h2>
              <p className="text-slate-400 max-w-lg mx-auto text-base md:text-lg">
                Crea una sala como docente o únete a una como alumno para ser asignado instantáneamente.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              
              {/* Teacher Button Card */}
              <button 
                onClick={() => setRole('teacher')}
                className="glass-panel p-8 rounded-3xl text-left hover:border-indigo-500/50 group transition-all duration-500 hover:-translate-y-2 flex flex-col justify-between h-64 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-600/10 rounded-full blur-2xl group-hover:bg-indigo-600/20 transition-all duration-500"></div>
                <div className="bg-indigo-600/10 border border-indigo-500/20 p-4 rounded-2xl w-fit group-hover:scale-110 transition duration-500">
                  <Users className="h-8 w-8 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2 group-hover:text-indigo-400 transition">Docente / Coordinador</h3>
                  <p className="text-slate-400 text-sm">
                    Configura la cantidad de equipos, genera el código de sala y proyecta la asignación en tiempo real.
                  </p>
                </div>
              </button>

              {/* Student Button Card */}
              <button 
                onClick={() => setRole('student')}
                className="glass-panel p-8 rounded-3xl text-left hover:border-pink-500/50 group transition-all duration-500 hover:-translate-y-2 flex flex-col justify-between h-64 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-pink-600/10 rounded-full blur-2xl group-hover:bg-pink-600/20 transition-all duration-500"></div>
                <div className="bg-pink-600/10 border border-pink-500/20 p-4 rounded-2xl w-fit group-hover:scale-110 transition duration-500">
                  <UserPlus className="h-8 w-8 text-pink-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2 group-hover:text-pink-400 transition">Alumno / Participante</h3>
                  <p className="text-slate-400 text-sm">
                    Ingresa tu nombre y el código de la sala para descubrir a qué equipo has sido asignado.
                  </p>
                </div>
              </button>
              
            </div>
          </div>
        )}

        {/* TEACHER WORKFLOW */}
        {role === 'teacher' && !roomCode && (
          <div className="w-full max-w-md glass-panel p-8 rounded-3xl shadow-2xl animate-pop-in border border-white/10">
            <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <Users className="text-indigo-400 h-6 w-6" />
              Crear Nueva Sala
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              Elige en cuántos equipos se distribuirán los alumnos que se unan a la sala.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-300">
                    Nº Equipos
                  </label>
                  <input 
                    type="number"
                    min="2"
                    max="20"
                    value={teamsInput}
                    onChange={(e) => setTeamsInput(parseInt(e.target.value, 10) || '')}
                    className="w-full px-4 py-3 rounded-xl glass-input text-lg font-bold text-center"
                    placeholder="3"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-300">
                    Max Alumnos
                  </label>
                  <input 
                    type="number"
                    min="0"
                    max="200"
                    value={maxStudentsInput}
                    onChange={(e) => setMaxStudentsInput(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full px-4 py-3 rounded-xl glass-input text-lg font-bold text-center"
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 transition duration-300 flex items-center justify-center gap-2 hover:-translate-y-0.5"
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

        {/* TEACHER DASHBOARD (LIVE VIEW) */}
        {role === 'teacher' && roomCode && (
          <div className="w-full space-y-6 animate-slide-up">
            
            {/* Top Stats Banner */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Room Code Card */}
              <div className="lg:col-span-2 glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Código de Sala Activa</span>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-4xl md:text-5xl font-black tracking-wider text-indigo-400 bg-indigo-500/10 px-4 py-1.5 rounded-2xl border border-indigo-500/20">
                      {roomCode}
                    </span>
                    <button 
                      onClick={handleCopyCode}
                      className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition duration-300"
                      title="Copiar código"
                    >
                      {copied ? <Check className="h-6 w-6 text-emerald-400" /> : <Copy className="h-6 w-6 text-slate-300" />}
                    </button>
                  </div>
                </div>
                <div className="text-center md:text-right">
                  <p className="text-sm text-slate-400">Comparte este código con tus alumnos</p>
                  <p className="text-xs text-indigo-300 font-medium mt-1">Se unirán automáticamente en tiempo real</p>
                </div>
              </div>

              {/* Total Students Counter */}
              <div className="glass-panel p-6 rounded-3xl flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Total Alumnos</span>
                  <h4 className="text-4xl md:text-5xl font-black mt-1 text-white">
                    {roomState.students.length}
                    {roomState.maxStudents > 0 && (
                      <span className="text-xl md:text-2xl text-slate-400 font-medium">
                        /{roomState.maxStudents}
                      </span>
                    )}
                  </h4>
                </div>
                <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl">
                  <User className="h-8 w-8 text-indigo-400 animate-float" />
                </div>
              </div>

            </div>

            {/* Team Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.keys(teamsMap).map((teamNum) => {
                const members = teamsMap[teamNum];
                const teamColorIdx = ((parseInt(teamNum, 10) - 1) % 10) + 1;
                
                return (
                  <div 
                    key={teamNum} 
                    className={`glass-panel border-l-4 team-color-${teamColorIdx} p-6 rounded-3xl flex flex-col justify-between min-h-[16rem] transition duration-300 hover:shadow-indigo-500/5`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-extrabold text-xl text-white">Equipo {teamNum}</h4>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold team-badge-${teamColorIdx}`}>
                          {members.length} {members.length === 1 ? 'miembro' : 'miembros'}
                        </span>
                      </div>

                      {members.length === 0 ? (
                        <p className="text-sm text-slate-500 italic mt-6 text-center">Esperando alumnos...</p>
                      ) : (
                        <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {members.map((name, idx) => (
                            <li 
                              key={idx} 
                              className="text-slate-300 text-sm bg-white/5 border border-white/5 px-3 py-2 rounded-xl flex items-center gap-2 animate-pop-in"
                            >
                              <div className={`h-2 w-2 rounded-full bg-current team-badge-${teamColorIdx}`} />
                              <span className="font-medium">{name}</span>
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

        {/* STUDENT WORKFLOW */}
        {role === 'student' && !joinedRoom && (
          <div className="w-full max-w-md glass-panel p-8 rounded-3xl shadow-2xl animate-pop-in border border-white/10">
            <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
              <UserPlus className="text-pink-400 h-6 w-6" />
              Entrar a una Sala
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              Ingresa tus datos para registrarte y unirte al sorteo de equipos.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-300">
                  Tu Nombre
                </label>
                <input 
                  type="text"
                  maxLength="25"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl glass-input text-base"
                  placeholder="Ej. Luisa Ortega"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5 text-slate-300">
                  Código de Sala
                </label>
                <input 
                  type="text"
                  maxLength="4"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl glass-input text-center text-xl font-bold uppercase tracking-widest"
                  placeholder="ABCD"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 mt-2 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 disabled:from-pink-800 disabled:to-indigo-800 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition duration-300 flex items-center justify-center gap-2 hover:-translate-y-0.5"
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

        {/* STUDENT ASSIGNED VIEW */}
        {role === 'student' && joinedRoom && (
          <div className="w-full max-w-2xl space-y-6 animate-slide-up">
            
            {/* Success Card */}
            <div className="glass-panel p-8 rounded-3xl shadow-2xl text-center relative overflow-hidden border border-white/10">
              
              <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-pink-500/10 rounded-full blur-3xl"></div>
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl"></div>
              
              <span className="px-4 py-1.5 rounded-full text-xs font-bold tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 uppercase mb-4 inline-block">
                ¡Registro Exitoso!
              </span>

              <h3 className="text-2xl font-bold text-slate-300 mb-1">¡Hola, {studentName}!</h3>
              <p className="text-slate-400 text-sm mb-6">Tu equipo ha sido asignado aleatoriamente</p>
              
              <div className="my-8 inline-block animate-pop-in">
                <div className={`px-12 py-8 rounded-3xl border-2 team-color-${((assignedTeam - 1) % 10) + 1} shadow-xl flex flex-col items-center justify-center gap-2`}>
                  <Trophy className={`h-12 w-12 team-badge-${((assignedTeam - 1) % 10) + 1} p-2 rounded-xl`} />
                  <span className="text-sm text-slate-400 font-bold uppercase tracking-wider">Perteneces al</span>
                  <span className="text-5xl font-black text-white">
                    Equipo {assignedTeam}
                  </span>
                </div>
              </div>

              <div className="text-slate-400 text-xs mt-4">
                Sala: <span className="text-indigo-400 font-bold tracking-wider">{roomCode}</span> • Tu docente está proyectando el tablero principal
              </div>
            </div>

            {/* Team Roster details for student (Nice touch) */}
            <div className="glass-panel p-6 rounded-3xl">
              <h4 className="font-extrabold text-lg text-white mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-400" />
                Miembros de tu equipo ({teamsMap[assignedTeam]?.length || 0})
              </h4>
              
              {teamsMap[assignedTeam] && teamsMap[assignedTeam].length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {teamsMap[assignedTeam].map((name, idx) => (
                    <div 
                      key={idx} 
                      className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 ${
                        name.toLowerCase() === studentName.toLowerCase() 
                          ? 'border-indigo-500/40 bg-indigo-500/10 font-bold text-white' 
                          : 'border-white/5 bg-white/5 text-slate-300'
                      }`}
                    >
                      <div className={`h-2 w-2 rounded-full ${
                        name.toLowerCase() === studentName.toLowerCase() ? 'bg-indigo-400' : 'bg-slate-500'
                      }`} />
                      <span>{name} {name.toLowerCase() === studentName.toLowerCase() && '(Tú)'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Eres el primer integrante en este equipo.</p>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full text-center py-4 mt-8 border-t border-white/5 text-xs text-slate-500">
        <div>Sistema Distribuido Educativo con gRPC (Servicio Equipos + Servicio Alumnos) & WebSockets.</div>
        <div className="mt-1 text-slate-600">Creado para entornos de red local (PCs conectadas a la misma red wifi/ethernet).</div>
      </footer>

    </div>
  );
}

export default App;
