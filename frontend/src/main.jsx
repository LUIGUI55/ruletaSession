import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Punto de entrada principal de la aplicación React.
// Se encarga de montar el componente principal <App /> en el elemento con id 'root'.
createRoot(document.getElementById('root')).render(
  // StrictMode ayuda a detectar problemas potenciales en la aplicación 
  // ejecutando comprobaciones adicionales en desarrollo.
  <StrictMode>
    <App />
  </StrictMode>,
)
