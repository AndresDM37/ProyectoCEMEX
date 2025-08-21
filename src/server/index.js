import express, { json } from "express";
import multer, { memoryStorage } from "multer";
import cors from "cors";
import Tesseract from "tesseract.js";
import stringSimilarity from "string-similarity";

const app = express();
const port = 5000;

app.use(cors());
app.use(json());

const storage = memoryStorage();
const upload = multer({ storage });

app.post(
  "/validar",
  upload.fields([
    { name: "documento", maxCount: 1 }, // Cédula
    { name: "certificadoEPS", maxCount: 1 }, // EPS
    { name: "certificadoARL", maxCount: 1 }, // ARL
  ]),
  async (req, res) => {
    console.log("📩 Recibí solicitud POST /validar");
    console.log("📄 Archivos recibidos:", req.files);
    console.log("📝 Datos del formulario:", req.body);

    const { cedula, nombreConductor } = req.body;

    try {
      // ================================
      // 1. PROCESAR CÉDULA
      // ================================
      const fileBufferCedula = req.files.documento[0].buffer;
      const resultCedula = await Tesseract.recognize(fileBufferCedula, "spa");
      const textoCedula = resultCedula.data.text;

      // --- Validación cédula
      const cedulaLimpia = cedula.replace(/\D/g, "");
      const posiblesCedulasRaw =
        textoCedula.match(/\d{2,3}\.?\d{3}\.?\d{3}[^0-9]*/g) || [];
      const posiblesCedulas = posiblesCedulasRaw.map((c) =>
        c.replace(/\D/g, "")
      );
      const cedulaEncontrada = posiblesCedulas.includes(cedulaLimpia);

      // Nombre en cédula
      const nombreEsperado = nombreConductor
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const textoPlanoCedula = textoCedula
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const lineasCedula = textoPlanoCedula.split(/\n/).filter(Boolean);
      let similitudCedula = 0;
      if (lineasCedula.length > 0) {
        similitudCedula = stringSimilarity.findBestMatch(
          nombreEsperado,
          lineasCedula
        ).bestMatch.rating;
      }
      const nombreEncontradoCedula = similitudCedula > 0.5;

      // ================================
      // 2. PROCESAR CERTIFICADO EPS
      // ================================
      let resultadoEPS = null;

      if (req.files.certificadoEPS) {
        const fileBufferEPS = req.files.certificadoEPS[0].buffer;
        const resultEPS = await Tesseract.recognize(fileBufferEPS, "spa");
        const textoEPS = resultEPS.data.text;

        // --- Validar nombre
        const textoPlanoEPS = textoEPS
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const lineasEPS = textoPlanoEPS.split(/\n/).filter(Boolean);
        let similitudEPS = 0;
        if (lineasEPS.length > 0) {
          similitudEPS = stringSimilarity.findBestMatch(
            nombreEsperado,
            lineasEPS
          ).bestMatch.rating;
        }
        const nombreEncontradoEPS = similitudEPS > 0.5;

        // --- Validar cédula
        const posiblesCedulasEPSRaw =
          textoEPS.match(/\d{2,3}\.?\d{3}\.?\d{3}[^0-9]*/g) || [];
        const posiblesCedulasEPS = posiblesCedulasEPSRaw.map((c) =>
          c.replace(/\D/g, "")
        );
        const cedulaEncontradaEPS = posiblesCedulasEPS.includes(cedulaLimpia);

        // --- Validar fecha expedición (dd/mm/yyyy o dd-mm-yyyy)
        const regexFecha = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/g;
        const fechasEncontradas = textoEPS.match(regexFecha) || [];
        let fechaValida = false;
        let fechaDetectada = null;

        if (fechasEncontradas.length > 0) {
          fechaDetectada = fechasEncontradas[0]; // tomar primera
          let partes = fechaDetectada.includes("/")
            ? fechaDetectada.split("/")
            : fechaDetectada.split("-");

          // Normalizar año (puede venir en 2 dígitos)
          let dia = parseInt(partes[0]);
          let mes = parseInt(partes[1]) - 1;
          let anio = parseInt(
            partes[2].length === 2 ? "20" + partes[2] : partes[2]
          );

          const fechaDoc = new Date(anio, mes, dia);
          const hoy = new Date();
          const diffDias = Math.floor((hoy - fechaDoc) / (1000 * 60 * 60 * 24));
          fechaValida = diffDias <= 30;
        }

        // --- Palabras clave
        const contieneAfiliado = textoPlanoEPS.includes("afiliado");
        const contieneVinculado = textoPlanoEPS.includes("vinculado");
        const contieneHabilitado = textoPlanoEPS.includes("habilitado");
        const contieneActivo = textoPlanoEPS.includes("activo");
        const contieneVigente = textoPlanoEPS.includes("vigente");

        resultadoEPS = {
          nombreEncontrado: nombreEncontradoEPS,
          cedulaEncontrada: cedulaEncontradaEPS,
          fechaDetectada,
          fechaValida,
          palabrasClave: {
            afiliado: contieneAfiliado,
            vinculado: contieneVinculado,
            habilitado: contieneHabilitado,
            activo: contieneActivo,
            vigente: contieneVigente,
          },
          texto: textoEPS,
        };
      }

      // ================================
      // 3. PROCESAR CERTIFICADO ARL
      // ================================

      const textoPlanoARL = dataARL.text.toUpperCase();
      const lineasARL = textoPlanoARL
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      // --- Validación del nombre (igual que EPS)
      let similitudARL = 0;
      if (lineasARL.length > 0) {
        similitudARL = stringSimilarity.findBestMatch(nombreEsperado, lineasARL)
          .bestMatch.rating;
      }
      const nombreEncontradoARL = similitudARL > 0.5;

      // --- Validación de la CLASE DE RIESGO
      let cumpleRiesgo = false;
      let riesgoEncontrado = null;

      for (const linea of lineasARL) {
        if (linea.includes("CLASE DE RIESGO") || linea.startsWith("CLASE")) {
          const match = linea.match(/\d+/); // Buscar el número en la línea
          if (match) {
            riesgoEncontrado = parseInt(match[0], 10);
            cumpleRiesgo = riesgoEncontrado >= 4;
          }
          break; // salir del loop porque ya lo encontramos
        }
      }

      // --- Resultado ARL
      const resultadoARL = {
        nombreEncontrado: nombreEncontradoARL,
        riesgoEncontrado,
        cumpleRiesgo,
      };

      // ================================
      // RESPUESTA
      // ================================
      res.json({
        coincidencias: {
          cedula: cedulaEncontrada,
          nombre: nombreEncontradoCedula,
        },
        documentoEPS: resultadoEPS,
        textoCedula,
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
