import { io } from 'socket.io-client';

// Automatically detect host IP of the machine and target port 3000 (Gateway)
// This is critical for multi-device distributed deployments.
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || `http://${window.location.hostname}:3000`;

console.log(`[Socket] Connecting to Gateway at: ${GATEWAY_URL}`);

export const socket = io(GATEWAY_URL, {
  autoConnect: false,
});
