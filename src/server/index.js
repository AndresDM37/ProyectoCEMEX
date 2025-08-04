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

app.post("/validar", upload.single("documento"), async (req, res) => {
  console.log("📩 Recibí solicitud POST /validar");
  console.log("📄 Archivo recibido:", req.file);
  console.log("📝 Datos del formulario:", req.body);

  const { sap, nombreTransportador, cedula, nombreConductor } = req.body;
  const fileBuffer = req.file.buffer;

  if (!fileBuffer) {
    console.log("⛔ No se recibió ningún archivo");
    return res.status(400).json({ error: "No se recibió ningún documento" });
  }

  try {
    const result = await Tesseract.recognize(fileBuffer, "spa", {
      logger: (m) => console.log(m),
    });

    const textoOriginal = result.data.text;
    const textoNormalizado = textoOriginal.toLowerCase();

    // Validar cédula
    const cedulaLimpia = cedula.replace(/\D/g, "");
    const textoSinEspacios = textoNormalizado.replace(/\s/g, "");

    const posiblesCedulasRaw =
      textoOriginal.match(/\d{2,3}\.?\d{3}\.?\d{3}[^0-9]*/g) || [];

    const posiblesCedulas = posiblesCedulasRaw.map(
      (c) => c.replace(/\D/g, "") // Quitar todo lo que no sea número
    );

    console.log("🔍 CÉDULAS DETECTADAS OCR:", posiblesCedulasRaw);
    console.log("🔍 CÉDULAS NORMALIZADAS OCR:", posiblesCedulas);

    const cedulaEncontrada = posiblesCedulas.includes(cedulaLimpia);

    console.log("🔍 TEXTO OCR COMPLETO:\n", textoOriginal);
    console.log("🔍 CÉDULA LIMPIA (INPUT):", cedulaLimpia);
    console.log("🔍 CÉDULAS DETECTADAS OCR:", posiblesCedulasRaw);
    console.log("🔍 CÉDULAS NORMALIZADAS OCR:", posiblesCedulas);
    console.log("✅ ¿CÉDULA ENCONTRADA?:", cedulaEncontrada);

    // Validar nombre del conductor
    const nombreEsperado = nombreConductor
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const textoPlano = textoOriginal
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const lineas = textoPlano.split(/\n/).filter(Boolean);
    const similitud = stringSimilarity.findBestMatch(nombreEsperado, lineas)
      .bestMatch.rating;
    const nombreEncontrado = similitud > 0.5;

    // Extraer fecha de nacimiento y calcular edad
    const regexFecha = /(\d{2}\/\d{2}\/\d{4})/g;
    const fechas = textoNormalizado.match(regexFecha);
    let edadValida = false;
    let edad = "No detectada";

    if (fechas && fechas.length > 0) {
      const [dia, mes, anio] = fechas[0].split("/");
      const fechaNacimiento = new Date(`${anio}-${mes}-${dia}`);
      const hoy = new Date();

      let calculoEdad = hoy.getFullYear() - fechaNacimiento.getFullYear();
      const mesDiferencia = hoy.getMonth() - fechaNacimiento.getMonth();

      if (
        mesDiferencia < 0 ||
        (mesDiferencia === 0 && hoy.getDate() < fechaNacimiento.getDate())
      ) {
        calculoEdad--;
      }

      edad = calculoEdad;
      edadValida = calculoEdad >= 26 && calculoEdad <= 65;
    }

    res.json({
      texto: textoOriginal,
      coincidencias: {
        cedula: cedulaEncontrada,
        nombre: nombreEncontrado,
      },
      edadDetectada: edad,
      edadValida,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al procesar el documento." });
  }
});

app.listen(port, () =>
  console.log(`🧠 Servidor OCR activo en http://localhost:${port}`)
);
