import express, { json } from "express";
import multer, { memoryStorage } from "multer";
import cors from "cors";
import { validarFormatoTransportador } from "./validators/formatoValidator.js";
import { validarCedula } from "./validators/cedulaValidator.js";
// import { validarLicencia } from "./validators/licenciaValidator.js";
import { validarEPS } from "./validators/epsValidator.js";
import { validarARL } from "./validators/arlValidator.js";
import { validarPension  } from "./validators/pensionValidator.js";
// import connection from "../database/snowflake.js"; 

const app = express();
const port = 5000;

app.use(cors());
app.use(json());

const storage = memoryStorage();
const upload = multer({ storage });

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

    const { codigoTransportador, nombreTransportador, cedula, nombreConductor } = req.body;
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
    const resultadoCedula = await validarCedula(
      req.files.documento[0].buffer,
      cedula,
      nombreConductor
    );


    
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
      console.error(err);
      res.status(500).json({ error: "Error al procesar el documento." });
    }
  }
);

app.listen(port, () =>
  console.log(`🧠 Servidor OCR activo en http://localhost:${port}`)
);
