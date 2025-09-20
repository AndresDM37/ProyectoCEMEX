import express, { json } from "express";
import multer, { memoryStorage } from "multer";
import cors from "cors";
import { validarFormatoTransportador } from "./validators/formatoValidator.js";
import { validarCedula } from "./validators/cedulaValidator.js";
// import { validarLicencia } from "./validators/licenciaValidator.js";
import { validarEPS } from "./validators/epsValidator.js";
import { validarARL } from "./validators/arlValidator.js";
import { validarPension } from "./validators/pensionValidator.js";
// import connection from "../database/snowflake.js";
import { verificarPoppler } from "./utils/verificarPoppler.js";    

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

// function ejecutarQuery(connection, sqlText, binds) {
//   return new Promise((resolve, reject) => {
//     connection.execute({
//       sqlText,
//       binds,
//       complete: (err, stmt, rows) => {
//         if (err) {
//           console.error("❌ Error en query:", err.message);
//           reject(err);
//         } else {
//           console.log("✅ Query ejecutado, filas:", rows.length);
//           resolve(rows);
//         }
//       },
//     });
//   });
// }

app.post(
  "/validar",
  upload.fields([
    { name: "formatoCreacion", maxCount: 1 }, // Formato de creación
    { name: "licenciaConduccion", maxCount: 1 }, // Licencia de conducción
    { name: "documento", maxCount: 1 }, // Cédula
    { name: "certificadoEPS", maxCount: 1 }, // EPS
    { name: "certificadoARL", maxCount: 1 }, // ARL
    { name: "certificadoPension", maxCount: 1 }, // PENSION
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
    let validacionBD = null;

    // ================================
    // 1. CONSULTA EN SNOWFLAKE
    // ================================

    try {
      // const query = `
      //    SELECT STCD1 AS CEDULA
      //   FROM PRD_LND_MRP_SAP.MRP500.KNA1
      //   WHERE STCD1 = ?
      // `;

      // const rows = await ejecutarQuery(connection, query, [cedula]);

      // if (rows.length > 0) {
      //   res.json({
      //     existe: true,
      //     mensaje: `✅ La cédula ${cedula} existe en SAP`,
      //     datos: rows[0],
      //   });
      // } else {
      //   res.json({
      //     existe: false,
      //     mensaje: `⚠️ La cédula ${cedula} no existe en SAP`,
      //   });
      // }

      // Verificar que el archivo documento existe
      if (!req.files.documento || !req.files.documento[0]) {
        return res.status(400).json({
          error: "No se recibió el archivo de documento de identidad",
        });
      }

      const archivoDocumento = req.files.documento[0];
      console.log(
        `📄 Procesando archivo: ${archivoDocumento.originalname} (${archivoDocumento.mimetype})`
      );

      // ================================
      // 1. PROCESAR FORMATO
      // ===============================

      const resultadoFormato = await validarFormatoTransportador(
        req.files.formatoCreacion[0].buffer,
        codigoTransportador,
        nombreTransportador,
        cedula,
        nombreConductor
      );

      // ================================
      // 2. PROCESAR CÉDULA
      // ===============================

      console.log(
        `📄 Procesando ${archivoDocumento.mimetype}: ${archivoDocumento.originalname}`
      );

      const resultadoCedula = await validarCedula(
        archivoDocumento.buffer,
        cedula,
        nombreConductor
      );

      // Verificar calidad del procesamiento
      if (resultadoCedula.debug?.error && resultadoCedula.debug.error.includes('poppler')) {
        console.warn('⚠️ Error específico de poppler, sugiriendo alternativas...');
        return res.status(422).json({
          error: "Error procesando PDF",
          detalle: "No se pudo convertir el PDF. Por favor, intenta con una imagen JPG o PNG del documento.",
          sugerencia: "Convierte el PDF a imagen o usa un archivo de imagen directamente"
        });
      }

      // ================================
      // 3. PROCESAR LICENCIA DE CONDUCCIÓN
      // ===============================

      // const resultadoLicencia = await validarLicencia(
      //   req.files.licenciaConduccion[0].buffer,
      //   cedulaLimpia,
      //   nombreEsperado
      // );

      // ================================
      // 4. PROCESAR CERTIFICADO EPS
      // ================================

      let resultadoEPS = null;
      if (req.files.certificadoEPS) {
        resultadoEPS = await validarEPS(
          req.files.certificadoEPS[0].buffer,
          nombreConductor,
          cedula
        );
      }

      // ================================
      // 5. PROCESAR CERTIFICADO ARL
      // ================================

      let resultadoARL = null;
      if (req.files.certificadoARL) {
        resultadoARL = await validarARL(
          req.files.certificadoARL[0].buffer,
          nombreConductor,
          cedula
        );
      }

      // ================================
      // 6. PROCESAR CERTIFICADO PENSION
      // ================================
      let resultadoPension = null;

      if (req.files.certificadoPension) {
        resultadoPension = await validarPension(
          req.files.certificadoPension[0].buffer,
          nombreConductor,
          cedula
        );
      }
      // ================================
      // RESPUESTA
      // ================================
      res.json({
        validacionBD,
        documentoFormato: resultadoFormato,
        coincidencias: {
          cedula: resultadoCedula.coincidencias.cedula,
          nombre: resultadoCedula.coincidencias.nombre,
        },
        // documentoLicencia: resultadoLicencia,
        documentoEPS: resultadoEPS,
        documentoARL: resultadoARL,
        documentoPension: resultadoPension,
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

// Middleware para manejar errores de multer
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

app.listen(port, async () => {
  console.log(`🧠 Servidor OCR activo en http://localhost:${port}`),

// Verificar dependencias al iniciar
  await verificarPoppler();
});
