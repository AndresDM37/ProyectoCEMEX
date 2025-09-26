import express, { json } from "express";
import multer, { memoryStorage } from "multer";
import cors from "cors";
import { validarFormatoTransportador } from "./validators/formatoValidator.js";
import { validarCedula } from "./validators/cedulaValidator.js";
import { validarLicencia } from "./validators/licenciaValidator.js";
import { validarEPS } from "./validators/epsValidator.js";
import { validarARL } from "./validators/arlValidator.js";
import { validarPension } from "./validators/pensionValidator.js";
import { validarPoder } from "./validators/poderValidator.js";
import { validarCertificadoLicencia } from "./validators/certfLiceValidator.js";
import { verificarPoppler } from "./utils/verificarPoppler.js";
// import { consultarCedulaViaPython } from "";
const app = express();
const port = 5000;

app.use(cors());
app.use(json());

// Configuración de multer con límites más altos para PDFs
const storage = memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB límite
  },
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];

    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
    }
  },
});

// ==========================================
// ENDPOINT PRINCIPAL
// ==========================================

app.post(
  "/validar",
  upload.fields([
    { name: "formatoCreacion", maxCount: 1 }, // Formato de creación
    { name: "licenciaConduccion", maxCount: 1 }, // Licencia de conducción
    { name: "documento", maxCount: 1 }, // Cédula
    { name: "certificadoEPS", maxCount: 1 }, // EPS
    { name: "certificadoARL", maxCount: 1 }, // ARL
    { name: "certificadoPension", maxCount: 1 }, // PENSION
    { name: "formatoPoder", maxCount: 1 }, // PODER
    { name: "certificadoLicencia", maxCount: 1 }, // CERTIFICADO LICENCIA
  ]),
  async (req, res) => {
    console.log("📩 Recibí solicitud POST /validar");
    console.log("📄 Archivos recibidos:", req.files);
    console.log("📝 Datos del formulario:", req.body);

    const {
      codigoTransportador,
      nombreTransportador,
      cedula,
      nombreConductor,
    } = req.body;

      // ================================
      // 1. CONSULTA EN SNOWFLAKE
      // ================================

      let validacionBD = null;
      try {
        console.log("🐍 Iniciando consulta via servicio Python...");

        validacionBD = await consultarCedulaViaPython(cedula);
      } catch (err) {
        console.error("❌ Error en consulta via Python:", err.message);
        validacionBD = {
          existe: false,
          mensaje:
            "⚠️ No se pudo consultar la cédula en SAP - Servicio no disponible",
          error: err.message,
        };
      }

      console.log("🔗 Iniciando consulta mejorada en Snowflake...");
      try {
      // Verificar que el archivo documento existe
      if (!req.files.documento || !req.files.documento[0]) {
        return res.status(400).json({
          error: "Archivo de documento (cédula) es requerido",
        });
      }

      const archivoDocumento = req.files.documento[0];
      console.log(
        `📄 Procesando archivo: ${archivoDocumento.originalname} (${archivoDocumento.mimetype})`
      );

      // ================================
      // 2. PROCESAR FORMATO
      // ================================

      let resultadoFormato = null;
      if (req.files.formatoCreacion && req.files.formatoCreacion[0]) {
        resultadoFormato = await validarFormatoTransportador(
          req.files.formatoCreacion[0].buffer,
          codigoTransportador,
          nombreTransportador,
          cedula,
          nombreConductor
        );
      }

      // ================================
      // 3. PROCESAR CÉDULA
      // ================================

      const resultadoCedula = await validarCedula(
        archivoDocumento.buffer,
        cedula,
        nombreConductor
      );

      // Verificar calidad del procesamiento
      if (
        resultadoCedula.debug?.error &&
        resultadoCedula.debug.error.includes("poppler")
      ) {
        console.warn(
          "⚠️ Error específico de poppler, sugiriendo alternativas..."
        );
        return res.status(422).json({
          error: "Error procesando PDF",
          detalle:
            "No se pudo convertir el PDF. Por favor, intenta con una imagen JPG o PNG del documento.",
          sugerencia:
            "Convierte el PDF a imagen o usa un archivo de imagen directamente",
        });
      }

      // ================================
      // 4. PROCESAR LICENCIA DE CONDUCCIÓN
      // ================================

      let resultadoLicencia = null;
      if (req.files.licenciaConduccion && req.files.licenciaConduccion[0]) {
        resultadoLicencia = await validarLicencia(
          req.files.licenciaConduccion[0].buffer,
          nombreConductor,
          cedula
        );
      }

      // ================================
      // 5. PROCESAR CERTIFICADO EPS
      // ================================

      let resultadoEPS = null;
      if (req.files.certificadoEPS && req.files.certificadoEPS[0]) {
        resultadoEPS = await validarEPS(
          req.files.certificadoEPS[0].buffer,
          nombreConductor,
          cedula
        );
      }

      // ================================
      // 6. PROCESAR CERTIFICADO ARL
      // ================================

      let resultadoARL = null;
      if (req.files.certificadoARL && req.files.certificadoARL[0]) {
        resultadoARL = await validarARL(
          req.files.certificadoARL[0].buffer,
          nombreConductor,
          cedula
        );
      }

      // ================================
      // 7. PROCESAR CERTIFICADO PENSION
      // ================================

      let resultadoPension = null;
      if (req.files.certificadoPension && req.files.certificadoPension[0]) {
        resultadoPension = await validarPension(
          req.files.certificadoPension[0].buffer,
          nombreConductor,
          cedula
        );
      }

      // ================================
      // 8. PROCESAR FORMATO PODER
      // ================================

      let resultadoPoder = null;
      if (req.files.formatoPoder && req.files.formatoPoder[0]) {
        resultadoPoder = await validarPoder(
          req.files.formatoPoder[0].buffer,
          nombreTransportador,
          nombreConductor,
          cedula
        );
      }

      // ================================
      // 9. PROCESAR CERTIFICADO LICENCIA
      // ================================

      let resultadoCertificadoLicencia = null;
      if (req.files.certificadoLicencia && req.files.certificadoLicencia[0]) {
        resultadoCertificadoLicencia = await validarCertificadoLicencia(
          req.files.certificadoLicencia[0].buffer,
          nombreConductor,
          cedula
        );
      }

      // ================================
      // RESPUESTA FINAL
      // ================================

      res.json({
        validacionBD,
        documentoFormato: resultadoFormato,
        coincidencias: {
          cedula: resultadoCedula.coincidencias.cedula,
          nombre: resultadoCedula.coincidencias.nombre,
        },
        documentoLicencia: resultadoLicencia,
        documentoEPS: resultadoEPS,
        documentoARL: resultadoARL,
        documentoPension: resultadoPension,
        documentoPoder: resultadoPoder,
        documentoCertificadoLicencia: resultadoCertificadoLicencia,
        textoCedula: resultadoCedula.textoCedula,
      });
    } catch (err) {
      console.error("❌ Error procesando documentos:", err);

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: "Archivo demasiado grande. Máximo 10MB permitido.",
        });
      }

      res.status(500).json({
        error: "Error al procesar el documento.",
        detalle: err.message,
      });
    }
  }
);

// ==========================================
// MIDDLEWARE PARA ERRORES
// ==========================================

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "Archivo demasiado grande. Máximo 10MB permitido.",
      });
    }
  }

  if (error.message.includes("Tipo de archivo no permitido")) {
    return res.status(400).json({
      error: error.message,
    });
  }

  next(error);
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

app.listen(port, async () => {
  console.log(`🧠 Servidor OCR activo en http://localhost:${port}`);

  // Verificar dependencias al iniciar
  await verificarPoppler();

  console.log("🔐 Configuración SSL aplicada para Windows");
  console.log(
    "📡 Sistema listo para procesar documentos y consultar Snowflake"
  );
});
