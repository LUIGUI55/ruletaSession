import { io } from 'socket.io-client';

// Detecta automáticamente la IP del host de la máquina y apunta al puerto 3000 (Gateway).
// Esto es crítico para los despliegues distribuidos en múltiples dispositivos,
// permitiendo que el Frontend sepa dónde conectarse.
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || `http://${window.location.hostname}:3000`;

console.log(`[Socket] Conectando al Gateway en: ${GATEWAY_URL}`);

// Exportamos la instancia del socket. autoConnect está en falso para 
// que nos conectemos manualmente solo cuando el componente App se monte.
export const socket = io(GATEWAY_URL, {
  autoConnect: false,
});
