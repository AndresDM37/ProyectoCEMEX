import Tesseract from "tesseract.js";
import { compareTwoStrings } from "string-similarity";

function normalizeText(s) {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ") // quitar caracteres raros tipo ', . -
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// busca coincidencia aproximada en fragmentos de texto
function fuzzyFind(textoPlano, termino, threshold = 0.7) {
  const palabras = textoPlano.split(" ");
  for (let i = 0; i < palabras.length; i++) {
    const ventana = palabras.slice(i, i + termino.split(" ").length + 2).join(" ");
    const score = compareTwoStrings(ventana, termino);
    if (score >= threshold) return { match: ventana, score };
  }
  return null;
}

export const validarFormatoTransportador = async (
  fileBuffer,
  codigoTransportadorInput,
  nombreTransportadorInput,
  cedulaConductorInput,
  nombreConductorInput
) => {
  const result = await Tesseract.recognize(fileBuffer, "spa");
  const texto = result.data.text || "";
  const textoPlano = normalizeText(texto);

  // --- 1) Validar código transportador
    const codigosRaw = texto.match(/.{0,5}\d{5,10}.{0,5}/g) || []; 
    // buscamos 5-10 dígitos rodeados de hasta 5 caracteres para atrapar basura del OCR

    // console.log("🔍 OCR bruto:", texto);
    // console.log("📌 Codigos RAW encontrados:", codigosRaw);

    const codigos = codigosRaw.map(c => c.replace(/[^\d]/g, "")); // limpiar todo lo que no sea número
    // console.log("📌 Codigos limpios:", codigos, "| Esperado:", codigoTransportadorInput);

    const codigoEncontrado = codigos.find(c => c === codigoTransportadorInput);

// console.log("✅ Código transportador encontrado:", codigoEncontrado);

  // --- 2) Validar transportador (razón social)
  let transportadorEncontrado = false;
  let similitudTransportador = 0;
  if (nombreTransportadorInput) {
    const nombreNorm = normalizeText(nombreTransportadorInput);
    const encontrado = fuzzyFind(textoPlano, nombreNorm, 0.65);
    if (encontrado) {
      transportadorEncontrado = true;
      similitudTransportador = encontrado.score;
    }
  }

  // --- 3) Validar cédula del conductor
  const cedulas = (texto.match(/\d[\d'.-]{6,15}\d/g) || []).map(c =>
    c.replace(/[^\d]/g, "")
  );
  const cedulaEncontrada = cedulas.includes(cedulaConductorInput);

  // --- 4) Validar nombre del conductor
  let conductorEncontrado = false;
  let similitudConductor = 0;
  if (nombreConductorInput) {
    const nombreConductorNorm = normalizeText(nombreConductorInput);
    const encontrado = fuzzyFind(textoPlano, nombreConductorNorm, 0.65);
    if (encontrado) {
      conductorEncontrado = true;
      similitudConductor = encontrado.score;
    }

    // console.log("Nombre conductor encontrado:", nombreConductorNorm, similitudConductor);

  }

  return {
    codigoTransportador: {
      esperado: codigoTransportadorInput,
      encontrado: codigoEncontrado || null,
      coincide: Boolean(codigoEncontrado),
    },
    transportador: {
      esperado: nombreTransportadorInput,
      similitud: similitudTransportador,
      coincide: transportadorEncontrado,
    },
    conductor: {
      cedula: {
        esperado: cedulaConductorInput,
        encontrado: cedulas,
        coincide: cedulaEncontrada,
      },
      nombre: {
        esperado: nombreConductorInput,
        similitud: similitudConductor,
        coincide: conductorEncontrado,
      },
    },
    textoOCR: texto,
  };
};
