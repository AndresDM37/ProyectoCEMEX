# 📘 Manual Técnico – Aplicativo Web para Validación de Documentos de Conductores  

## 1. Descripción del Proyecto  
Este aplicativo web permite optimizar el proceso de validación de documentos de conductores.  

La solución está compuesta por:  
- **Frontend** en React (interfaz gráfica).  
- **Backend** en Node.js con Express (API principal y validadores).  
- **Microservicio en Python** para conexión con Snowflake (consultas a la base de datos).  

---

## 2. Requisitos Previos  

### General  
- **Git** instalado  
- **Conexión a internet** para instalación de dependencias  

### Frontend (React)  
- Node.js **v18+**  
- NPM (incluido con Node.js)  

### Backend (Node.js – Express)  
- Node.js **v18+**  

### Microservicio (Python – Snowflake)  
- Python **3.12+**  
- Dependencias incluidas en `requirements.txt`  

---

## 3. Estructura del Proyecto  
src/
├── server/ # Backend (Express)
│ ├── index.js # Entrada principal del backend
│ ├── validators/ # Validadores por documento
│ └── python-service/ # Microservicio en Python
│ ├── snowflake_service.py
│ └── requirements.txt
├── App.jsx # Frontend (React)
├── main.jsx
└── index.css

## 4. Instalación y Configuración  

### 4.1 Clonar el repositorio  
```bash
1. git clone https://github.com/AndresDM37/ProyectoCEMEX.git
2. cd ProyectoCEMEX
```
### 4.2 Backend (Node.js)
1. Entrar a la carpeta raíz del proyecto:
```bash
cd/ProyectoCEMEX
```
2. Instalar dependencias:
```bash
npm install
```
3. Ejecutar el servidor backend:
```bash
node src/server/index.js - nodemon src/server/index.js
```
4. El backend quedará corriendo en:
```bash
http://localhost:5000
```

### 4.3 Microservicio (Python – Snowflake)
1. Ir a la carpeta del microservicio:
```bash
cd src/server/python-service
```
2. Instalar dependencias:
```bash
pip install -r requirements.txt
```
3. Ejecutar el microservicio:
```bash
python snowflake_service.py
```
4. El microservicio quedará corriendo en:
```bash
http://localhost:5001
```
### 4.4 Frontend (React)
1. Entrar a la carpeta raíz del proyecto: 
```bash
cd/ProyectoCEMEX
```
2. Instalar dependencias (si no se ha hecho):
```bash
npm install
```
3. Ejecutar el servidor de desarrollo:
```bash
npm run dev
```
4. El frontend quedará corriendo en
```bash
http://localhost:5173
```

## 5. Instalación de pdf-poppler (Requisito para procesamiento de PDFs)

El proyecto utiliza **pdf-poppler** para trabajar con documentos PDF en las validaciones.  
Es necesario instalar las librerías nativas de Poppler y agregarlas al **PATH** del sistema.

### 🔹 Windows
1. Descargar el binario de Poppler desde:  
   [https://github.com/oschwartz10612/poppler-windows/releases/]  
   (descargar el `.zip` correspondiente a tu arquitectura, por ejemplo `Release 25.07.0-0.zip`).

2. Descomprimir el archivo en una ubicación de tu preferencia, por ejemplo: C:\poppler
3. Agregar Poppler al **PATH** del sistema:  
- Abrir **Configuración del sistema → Variables de entorno**.  
- En la variable `Path`, agregar:  
  ```
  C:\poppler\bin
  ```
- Guardar y reiniciar la terminal.

4. Verificar instalación ejecutando en **PowerShell o CMD**:  
```bash
pdftoppm -h
```