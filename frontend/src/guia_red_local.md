# 🌐 Guía de Despliegue en Red Local (3 Laptops)

Para ejecutar el sistema distribuido utilizando **3 laptops** en la misma red local (Wi-Fi o cable Ethernet), sigue detalladamente estos pasos:

---

## 🛠️ Paso 1: Conexión y Obtención de IPs

1. **Conecta las 3 laptops a la misma red** (el mismo módem de Wi-Fi o router Ethernet).
2. Abre la consola de comandos (`cmd` o `PowerShell`) en cada laptop y corre el comando:
   ```cmd
   ipconfig
   ```
3. Busca la línea que dice **Dirección IPv4** (suele tener el formato `192.168.1.X` o `192.168.100.X`).
4. Anota las IPs de las 3 laptops:
   - **LAPTOP 1** (Frontend + Gateway): `IP_DE_LA_LAP_1`
   - **LAPTOP 2** (Servicio de Equipos): `IP_DE_LA_LAP_2`
   - **LAPTOP 3** (Servicio de Alumnos): `IP_DE_LA_LAP_3`

---

## 📁 Paso 2: Distribución de Archivos

Copia las carpetas del proyecto a cada laptop correspondiente. Asegúrate de incluir la carpeta de interfaces gRPC `shared-proto` al mismo nivel:

### En la LAPTOP 1 (Gateway y Vista Principal)
- Carpeta `frontend/`
- Carpeta `gateway/`
- Carpeta `shared-proto/`

### En la LAPTOP 2 (Servicio de Equipos)
- Carpeta `team-service/`
- Carpeta `shared-proto/`

### En la LAPTOP 3 (Servicio de Alumnos)
- Carpeta `student-service/`
- Carpeta `shared-proto/`

> [!IMPORTANT]
> La carpeta `shared-proto/` debe quedar exactamente al mismo nivel relativo de las carpetas de servicios en cada laptop, ya que es requerida por los cargadores gRPC (`../shared-proto/classroom.proto`).

---

## ⚙️ Paso 3: Configuración de Variables de Entorno (`.env`)

Debes crear archivos `.env` para enlazar las laptops utilizando sus IPs de red local:

### 1. En la LAPTOP 3 (Servicio de Alumnos)
Crea un archivo llamado `.env` dentro de la carpeta `student-service/`:
```env
TEAM_SERVICE_HOST=IP_DE_LA_LAP_2
TEAM_SERVICE_PORT=50051
```
*(Reemplaza `IP_DE_LA_LAP_2` por la IP real de la Laptop 2, por ejemplo: `192.168.1.15`)*

### 2. En la LAPTOP 1 (Gateway)
Crea un archivo llamado `.env` dentro de la carpeta `gateway/`:
```env
TEAM_SERVICE_HOST=IP_DE_LA_LAP_2
TEAM_SERVICE_PORT=50051
STUDENT_SERVICE_HOST=IP_DE_LA_LAP_3
STUDENT_SERVICE_PORT=50052
```
*(Reemplaza `IP_DE_LA_LAP_2` y `IP_DE_LA_LAP_3` por las IPs reales anotadas en el Paso 1)*

---

## 🚀 Paso 4: Iniciar los Servicios en Orden

En cada laptop, abre la consola en la carpeta correspondiente y ejecuta:

### 1º LAPTOP 2 (Servicio de Equipos)
```bash
cd team-service
npm start
```
*Mensaje esperado:* `[Team Service] Running on gRPC port 50051`

### 2º LAPTOP 3 (Servicio de Alumnos)
```bash
cd student-service
npm start
```
*Mensaje esperado:* `[Student Service] Running on gRPC port 50052`

### 3º LAPTOP 1 (Gateway)
```bash
cd gateway
npm start
```
*Mensaje esperado:* `[Gateway] Server listening on port 3000`

### 4º LAPTOP 1 (Frontend)
```bash
cd frontend
npm run dev
```
*Mensaje esperado:*
```text
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://IP_DE_LA_LAP_1:5173/
```

---

## 🎯 Paso 5: Cómo Acceder y Usar la Aplicación

- **El Docente (desde la Laptop 1)**: Abre [http://localhost:5173](http://localhost:5173).
- **Los Alumnos (desde cualquier otra laptop, celular o tablet en la misma red)**:
  Abren el navegador e ingresan a la URL de red de la Laptop 1:
  `http://IP_DE_LA_LAP_1:5173`

*Nota: La interfaz del Frontend detectará automáticamente la dirección de la Laptop 1 conectada al Gateway (`http://IP_DE_LA_LAP_1:3000`) de forma dinámica, por lo que no es necesario realizar ninguna configuración en el código del cliente.*
