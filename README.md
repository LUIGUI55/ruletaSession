# 🎓 TeamGenerator: Sistema Distribuido de Equipos Escolares 🚀

[![gRPC](https://img.shields.io/badge/gRPC-v1.60-blueviolet?logo=grpc&logoColor=white)](https://grpc.io/)
[![Socket.io](https://img.shields.io/badge/Socket.io-v4.8-black?logo=socketdotio)](https://socket.io/)
[![React](https://img.shields.io/badge/React-v19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-v6.0-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.0-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)

Un sistema interactivo en tiempo real diseñado para entornos educativos que distribuye de manera **equitativa** e instantánea a los alumnos en equipos de trabajo mediante una arquitectura distribuida de microservicios con **gRPC**, **WebSockets (Socket.IO)** y un frontend premium en **React**.

---

## 🗺️ Arquitectura del Sistema

El sistema está diseñado para ejecutarse de forma distribuida en múltiples computadoras conectadas a la misma red local:

```mermaid
graph TD
    %% PCs y Componentes
    subgraph PC_1 [PC 1: Interface & Gateway]
        FE[React Frontend SPA]
        GW[Gateway Socket.IO + Express]
    end

    subgraph PC_2 [PC 2: Servicio de Equipos]
        TS[Team Service gRPC Server]
    end

    subgraph PC_3 [PC 3: Servicio de Alumnos]
        SS[Student Service gRPC Server]
    end

    %% Conexiones e Interacciones
    FE <-->|WebSockets / Puerto 3000| GW
    GW <-->|gRPC / Puerto 50051| TS
    GW <-->|gRPC / Puerto 50052| SS
    SS <-->|gRPC / Puerto 50051| TS

    %% Estilos Visuales
    style PC_1 fill:#1e1e2f,stroke:#6366f1,stroke-width:2px,color:#fff
    style PC_2 fill:#1a1c23,stroke:#a855f7,stroke-width:2px,color:#fff
    style PC_3 fill:#1e1b29,stroke:#ec4899,stroke-width:2px,color:#fff
    style FE fill:#61DAFB,stroke:#fff,stroke-width:1px,color:#000
    style GW fill:#333,stroke:#fff,stroke-width:1px,color:#fff
    style TS fill:#a855f7,stroke:#fff,stroke-width:1px,color:#fff
    style SS fill:#ec4899,stroke:#fff,stroke-width:1px,color:#fff
```

---

## ✨ Características Principales

*   **⚡ Asignación en Tiempo Real:** Los alumnos ingresan el código de sala y son asignados de inmediato. El tablero del docente se actualiza sin recargar la página.
*   **⚖️ Distribución Equitativa Inteligente:** Algoritmo que calcula el tamaño actual de los equipos y asigna a los nuevos estudiantes únicamente a los equipos con menos integrantes. ¡Diferencia máxima de 1 alumno entre equipos!
*   **🚫 Control de Capacidad (Límites):** Permite configurar un límite máximo de alumnos al crear la sala. Si se alcanza, el sistema rechaza los registros avisando de forma interactiva.
*   **📡 Arquitectura Híbrida gRPC + WebSockets:** La interfaz cliente se comunica con el servidor Gateway mediante WebSockets bidireccionales, y este escala internamente hacia microservicios desacoplados vía gRPC.

---

## 🛠️ Tecnologías Utilizadas

*   **Frontend:** React (Vite), Tailwind CSS v4, Lucide Icons, Canvas Confetti.
*   **Gateway Backend:** Node.js, Express, Socket.IO, `@grpc/grpc-js`.
*   **Microservicios Backend:** Node.js, gRPC, Protobuf (`classroom.proto`).

---

## 📁 Estructura del Proyecto

```text
├── shared-proto/
│   └── classroom.proto        # Definición de interfaces gRPC e intercambio de datos
├── team-service/
│   ├── index.js               # Servidor gRPC para la creación y consulta de salas
│   └── package.json
├── student-service/
│   ├── index.js               # Servidor gRPC de alumnos y algoritmo de distribución
│   └── package.json
├── gateway/
│   ├── index.js               # Servidor Express + WebSockets (Socket.IO) -> Cliente gRPC
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx            # Interfaz de usuario (Docente / Alumno)
    │   └── index.css          # Estilos CSS y Tailwind CSS v4
    └── package.json
```

---

## 🚀 Guía de Despliegue

### Opción A: Modo Local (En una sola computadora)

1.  **Instalar dependencias** en las 4 carpetas:
    ```bash
    cd team-service && npm install
    cd ../student-service && npm install
    cd ../gateway && npm install
    cd ../frontend && npm install
    ```
2.  **Iniciar los servicios en segundo plano** (abre terminales dedicadas para cada uno):
    *   **Servicio de Equipos:** `cd team-service && npm start`
    *   **Servicio de Alumnos:** `cd student-service && npm start`
    *   **Gateway:** `cd gateway && npm start`
    *   **Frontend:** `cd frontend && npm run dev`
3.  **Probar:** Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

---

### Opción B: Modo Distribuido (Múltiples Computadoras)

*Requisito: Todas las laptops deben estar en la misma red Wi-Fi.*

1.  **Identificar las IPs locales** de cada laptop corriendo `ipconfig` (ej: `192.168.2.X`).
2.  **Copiar los proyectos** correspondientes a cada laptop (asegurándote de incluir la carpeta `shared-proto` en el mismo nivel relativo):
    *   **PC 1 (Gateway + Frontend):** Carpetas `/gateway`, `/frontend`, `/shared-proto`
    *   **PC 2 (Team Service):** Carpetas `/team-service`, `/shared-proto`
    *   **PC 3 (Student Service):** Carpetas `/student-service`, `/shared-proto`
3.  **Crear archivos de entorno `.env`:**
    *   **En la PC 3 (Student Service):** Crea `.env` dentro de `student-service/`:
        ```env
        TEAM_SERVICE_HOST=IP_DE_LA_PC_2
        TEAM_SERVICE_PORT=50051
        ```
    *   **En la PC 1 (Gateway):** Crea `.env` dentro de `gateway/`:
        ```env
        TEAM_SERVICE_HOST=IP_DE_LA_PC_2
        TEAM_SERVICE_PORT=50051
        STUDENT_SERVICE_HOST=IP_DE_LA_PC_3
        STUDENT_SERVICE_PORT=50052
        ```
4.  **Iniciar servicios:** Corre `npm start` (o `npm run dev` en el frontend) en sus respectivas computadoras.
5.  **Unirse:** Abre en cualquier celular o laptop el enlace: `http://IP_DE_LA_PC_1:5173`.

---

## 🎨 Capturas del Diseño Premium

El frontend implementa una estética de **diseño oscuro futurista** con efecto de vidrio esmerilado (Glassmorphism), micro-animaciones en los botones, glows interactivos en tiempo real y efectos de confeti al unirse satisfactoriamente.

---

Desarrollado con ❤️ para distribución local. ¡Que comience el sorteo! 🎲
