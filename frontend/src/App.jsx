import React, { useState, useEffect } from 'react';
import { socket } from './socket';

function App() {
  const [role, setRole] = useState('select');
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
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    socket.connect();
    socket.on('connect', () => console.log('Connected to socket gateway'));
    socket.on('teams-updated', (data) => {
      setRoomState(data);
      if (data.roomCode) setRoomCode(data.roomCode);
    });
    socket.on('disconnect', () => console.log('Disconnected'));
    return () => {
      socket.off('connect');
      socket.off('teams-updated');
      socket.off('disconnect');
      socket.disconnect();
    };
  }, []);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (teamsInput <= 0) {
      setError('Por favor, selecciona al menos 1 equipo.');
      return;
    }
    setError('');
    setLoading(true);

    socket.emit('create-room', { teams: teamsInput, maxStudents: maxStudentsInput }, (response) => {
      setLoading(false);
      if (response && response.success) {
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

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!studentName.trim() || !roomCodeInput.trim()) {
      setError('Por favor, completa todos los campos.');
      return;
    }
    setError('');
    setLoading(true);

    const code = roomCodeInput.toUpperCase().trim();

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

      socket.emit('add-student', { roomCode: code, studentName: studentName.trim() }, (addResponse) => {
        setLoading(false);
        if (addResponse.success) {
          setAssignedTeam(addResponse.assignedTeam);
          setJoinedRoom(true);
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
    setRoomState({ roomCode: '', teams: 0, maxStudents: 0, students: [] });
  };

  const teamsMap = {};
  for (let i = 1; i <= roomState.teams; i++) teamsMap[i] = [];
  roomState.students.forEach((s) => {
    if (teamsMap[s.assignedTeam]) teamsMap[s.assignedTeam].push(s.name);
  });

  return (
    <div>
      <header>
        <h1>TeamGenerator</h1>
        <p>Sistema Distribuido Educativo</p>
        {role !== 'select' && <button onClick={resetAll}>Volver al Inicio</button>}
      </header>

      <hr />

      <main>
        {role === 'select' && (
          <div>
            <h2>Selecciona tu rol</h2>
            <button onClick={() => setRole('teacher')}>Docente / Coordinador</button>
            <button onClick={() => setRole('student')}>Alumno / Participante</button>
          </div>
        )}

        {error && <p className="error-message">{error}</p>}

        {role === 'teacher' && !roomCode && (
          <div>
            <h3>Crear Nueva Sala</h3>
            <form onSubmit={handleCreateRoom}>
              <div>
                <label>Nº Equipos:</label>
                <input type="number" value={teamsInput} onChange={(e) => setTeamsInput(parseInt(e.target.value) || '')} required />
              </div>
              <div>
                <label>Max Alumnos:</label>
                <input type="number" value={maxStudentsInput} onChange={(e) => setMaxStudentsInput(e.target.value === '' ? '' : parseInt(e.target.value))} required />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Creando...' : 'Generar Sala'}
              </button>
            </form>
          </div>
        )}

        {role === 'teacher' && roomCode && (
          <div>
            <h3>Sala Activa: {roomCode}</h3>
            <p>Total Alumnos: {roomState.students.length} / {roomState.maxStudents > 0 ? roomState.maxStudents : 'Ilimitado'}</p>
            
            <div>
              {Object.keys(teamsMap).map((teamNum) => (
                <div key={teamNum} className="team-container">
                  <h4>Equipo {teamNum} ({teamsMap[teamNum].length} miembros)</h4>
                  <ul>
                    {teamsMap[teamNum].map((name, idx) => (
                      <li key={idx}>{name}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {role === 'student' && !joinedRoom && (
          <div>
            <h3>Entrar a una Sala</h3>
            <form onSubmit={handleJoinRoom}>
              <div>
                <label>Tu Nombre:</label>
                <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} required />
              </div>
              <div>
                <label>Código de Sala:</label>
                <input type="text" value={roomCodeInput} onChange={(e) => setRoomCodeInput(e.target.value)} required />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Conectando...' : 'Entrar'}
              </button>
            </form>
          </div>
        )}

        {role === 'student' && joinedRoom && (
          <div>
            <h3>¡Registro Exitoso, {studentName}!</h3>
            <p>Has sido asignado al <strong>Equipo {assignedTeam}</strong></p>
            
            <div className="team-container">
              <h4>Miembros de tu equipo:</h4>
              <ul>
                {teamsMap[assignedTeam]?.map((name, idx) => (
                  <li key={idx}>{name} {name === studentName ? '(Tú)' : ''}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
