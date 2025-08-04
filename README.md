# Validador de Documentos CEMEX

Sistema automatizado para validar documentos de transportadores usando OCR y validaciones específicas.

## 🚀 Instalación y Setup

### Prerrequisitos
- Node.js 16+ 
- NPM o Yarn
- 10GB de espacio libre (para librerías OCR)

### 1. Clonar e instalar dependencias

```bash
# Clonar el proyecto
git clone <tu-repo>
cd cemex-document-validator

# Instalar frontend
cd frontend
npm install

# Instalar backend
cd ../backend
npm install
```

### 2. Configurar variables de entorno

```bash
# En la carpeta backend, copia el archivo .env
cp .env.example .env

# Edita las variables según tu entorno
```

### 3. Ejecutar el proyecto

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

La aplicación estará disponible en:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## 📋 Documentos Soportados

1. **Formato de Creación CEMEX** - Documento oficial de la empresa
2. **Fotocopia de Cédula** - Identificación del conductor
3. **Licencia de Conducción** - Permiso de conducir vigente
4. **Afiliación EPS** - Seguridad social en salud
5. **Afiliación ARL** - Riesgos laborales
6. **Afiliación Pensión** - Fondo de pensiones
7. **Poder al Conductor** - Autorización legal
8. **Certificado de Licencia** - Validación RUNT

## 🔧 Funcionalidades

### ✅ Implementado
- Upload de documentos (PDF, JPG, PNG)
- OCR con Tesseract.js
- Extracción de datos específicos por tipo
- Validaciones de formato y campos obligatorios
- Dashboard con resultados
- Exportar reportes en JSON
- Sistema de confiabilidad (scoring)

### 🚧 En Desarrollo (Para implementar)
- Validación con APIs gubernamentales (RUNT, ADRES)
- Web scraping para verificaciones
- Validación cruzada entre documentos
- Almacenamiento en base de datos
- Autenticación de usuarios
- Reportes en PDF/Excel

## 🏗️ Arquitectura

```
Frontend (React)
├── DocumentUpload - Subida de archivos
├── ValidationResults - Mostrar resultados
└── Dashboard - Estadísticas

Backend (Node.js/Express)
├── OCR Service - Extracción de texto
├── Document Service - Parseo específico
├── Validation Service - Reglas de negocio
└── API Routes - Endpoints REST
```

## 📊 Flujo de Validación

1. **Upload** → Usuario sube documentos
2. **OCR** → Extrae texto con Tesseract
3. **Parse** → Extrae datos específicos por tipo
4. **Validate** → Aplica reglas de negocio
5. **Score** → Calcula confiabilidad
6. **Report** → Muestra resultados al usuario

## 🔍 Tipos de Validación

### Cédula
- Formato de número válido
- Nombres y apellidos legibles
- Lugar de expedición
- ❌ Validación Registraduría (pendiente API)

### Licencia
- Número de licencia válido
- Categorías de conducción
- Vigencia actual
- Datos del conductor
- ❌ Validación RUNT (pendiente API)

### EPS/ARL/Pensión
- Entidad reconocida
- Estado de afiliación activo
- Datos del afiliado
- ❌ Validación ADRES (pendiente API)

## 🐛 Debugging

### Ver logs del backend:
```bash
cd backend
npm run dev
# Los logs aparecen en consola
```

### Verificar archivos OCR:
- Los archivos se guardan temporalmente en `backend/uploads/`
- Se eliminan automáticamente después de 5 segundos

### Problemas comunes:

1. **OCR no funciona:**
   - Verificar que Tesseract.js se instaló correctamente
   - Probar con imágenes de mejor calidad
   - Verificar el idioma (configurado para español)

2. **Frontend no conecta al backend:**
   - Verificar que el backend esté corriendo en puerto 5000
   - Revisar configuración CORS

3. **Archivos muy grandes:**
   - Límite actual: 10MB
   - Cambiar en `backend/server.js` si es necesario

## 📈 Métricas de Confiabilidad

- **90-100%**: Documento completamente válido
- **70-89%**: Válido con observaciones menores
- **50-69%**: Requiere revisión manual
- **0-49%**: Documento inválido o ilegible

## 🔜 Próximos Pasos (Semanas 2-4)

1. **Semana 2:**
   - Implementar web scraping RUNT
   - Mejorar validaciones específicas
   - Agregar más tipos de documentos

2. **Semana 3:**
   - Base de datos para persistencia
   - Validación cruzada entre documentos
   - Mejoras en UI/UX

3. **Semana 4:**
   - Deploy en servidor
   - Testing y optimización
   - Documentación final

## 📞 Soporte

Si encuentras problemas:
1. Revisa los logs en consola
2. Verifica que todas las dependencias estén instaladas
3. Asegúrate de que ambos servidores estén corriendo

¡Vamos a completar este proyecto juntos! 🚀