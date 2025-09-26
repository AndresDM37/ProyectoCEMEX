import Tesseract from "tesseract.js";
import { findBestMatch, compareTwoStrings } from "string-similarity";
import pdf from "pdf-poppler";
import fs from "fs";
import path from "path";
import os from "os";

// Función para detectar si el buffer es un PDF
function isPDF(buffer) {
  return buffer.slice(0, 4).toString() === "%PDF";
}

// Función para convertir PDF a imagen usando pdf-poppler
async function convertPDFToImage(pdfBuffer) {
  const tempDir = os.tmpdir();
  const tempPDFPath = path.join(tempDir, `temp_poder_pdf_${Date.now()}.pdf`);
  const outputDir = path.join(tempDir, `poder_pdf_images_${Date.now()}`);

  try {
    // Crear directorio para las imágenes
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Escribir el buffer a un archivo temporal
    fs.writeFileSync(tempPDFPath, pdfBuffer);

    // Configurar opciones de conversión
    const options = {
      format: "png",
      out_dir: outputDir,
      out_prefix: "poder_page",
      page: 1, // Solo convertir la primera página
      single_file: true,
      print_command: false,
      density: 300, // DPI alta para mejor calidad OCR
      size: "2000x2000", // Tamaño máximo
    };

    console.log("🔄 Convirtiendo PDF Poder a imagen...");

    // Convertir PDF a imagen
    const result = await pdf.convert(tempPDFPath, options);

    // Buscar el archivo generado
    const files = fs.readdirSync(outputDir);
    const imageFile = files.find(
      (file) => file.startsWith("poder_page") && file.endsWith(".png")
    );

    if (!imageFile) {
      throw new Error("No se pudo generar la imagen del PDF Poder");
    }

    const imagePath = path.join(outputDir, imageFile);
    const imageBuffer = fs.readFileSync(imagePath);

    // Limpiar archivos temporales
    fs.unlinkSync(tempPDFPath);
    fs.rmSync(outputDir, { recursive: true, force: true });

    console.log("✅ PDF Poder convertido exitosamente a imagen");
    return imageBuffer;
  } catch (error) {
    // Limpiar archivos temporales en caso de error
    if (fs.existsSync(tempPDFPath)) {
      fs.unlinkSync(tempPDFPath);
    }
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    throw new Error(
      `Error convirtiendo PDF Poder con poppler: ${error.message}`
    );
  }
}

// Función para normalizar texto
function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9\s]/g, " ") // limpiar símbolos raros
    .replace(/\s+/g, " ")
    .trim();
}

// Extraer transportador (intenta varios patrones)
function extraerTransportador(texto) {
  const t = texto || "";

  // 1) patrón "Representante legal de X (con NIT/...)" - flexible
  let m = t.match(
    /representante\s+legal\s+de[_\s]*([A-ZÁÉÍÓÚÑÜ0-9\.\-&\s]{3,200}?)\s*(?=(?:con\s+ni|con\s+nit|nit|n°|nº|,|\n|$))/i
  );
  if (m && m[1]) {
    return m[1].trim().replace(/\s+/g, " ");
  }

  // 2) sección SEÑORES: tomar el bloque siguiente (priorizar empresas que no sean "Ciudad")
  m = t.match(/señores[:\s]*([\s\S]{0,300})/i);
  if (m && m[1]) {
    const lines = m[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      // ignorar líneas cortas o que contienen "Ciudad"
      if (/ciudad/i.test(line)) continue;
      if (line.length < 4) continue;
      // devolver primera linea que parezca razón social
      if (/[A-ZÁÉÍÓÚÑÜ0-9]/.test(line)) return line.replace(/\s+/g, " ");
    }
  }

  // 3) Buscar NIT y devolver la frase previa corta (fallback)
  m = t.match(
    /([A-ZÁÉÍÓÚÑÜ0-9\.\s]{2,120}?)\s+(?:nit|n°|nº|ni)\s*[:\.\-]?\s*([0-9\.\-]{6,20})/i
  );
  if (m && m[1]) {
    return m[1].trim().replace(/\s+/g, " ");
  }

  // 4) Detectar nombres de empresas comunes (CEMEX, TRANSPORTES, LTDA, S.A.)
  m = t.match(
    /((?:[A-ZÁÉÍÓÚÑÜ]+(?:\s+[A-ZÁÉÍÓÚÑÜ0-9\.\-&]+){1,5})\s*(?:S\.A\.|LTDA|TRANSPORTES|ADMINISTRACIONES|COLOMBIA|CEMEX))/i
  );
  if (m && m[1]) {
    return m[1].trim().replace(/\s+/g, " ");
  }

  return null;
}

// Función para extraer información del conductor
function extraerConductor(texto) {
  const resultado = { nombre: null, cedula: null };

  // Buscar "confiero poder ... a [NOMBRE] identificado con cédula ..."
  const patronApoderado =
    /confiero\s+poder\s+(?:amplio\s+y\s+suficiente\s+)?a\s+([A-ZÁÉÍÓÚÑÜ\s]+?)\s*,?\s+identificado\s+con\s+c[eé]dula\s+(?:de\s+ciudadan[ií]a\s+)?(?:No\.?\s*)?(\d{7,12})/i;
  const matchApoderado = patronApoderado.exec(texto);
  if (matchApoderado) {
    resultado.nombre = matchApoderado[1].trim().replace(/\s+/g, " ");
    resultado.cedula = matchApoderado[2];
    return resultado;
  }

  // Fallback → patrón original ("Yo, ... identificado con cédula ...")
  const patronOtorgante =
    /Yo,\s+([A-ZÁÉÍÓÚÑÜ\s]+?)\s+identificado\s+con\s+c[eé]dula\s+(?:No\.?\s*)?(\d{7,12})/i;
  const matchOtorgante = patronOtorgante.exec(texto);
  if (matchOtorgante) {
    resultado.nombre = matchOtorgante[1].trim().replace(/\s+/g, " ");
    resultado.cedula = matchOtorgante[2];
  }

  return resultado;
}

function normalizarNombre(nombre) {
  if (!nombre) return "";

  return nombre
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/S\.A\.?|LTDA\.?|SAS|S\.A\.S\.?/g, "") // quitar tipos de empresa
    .replace(
      /TRANSPORTADORES?|TRANSPORTE|LOGISTICA|UNIDOS|EMPRESA|COLOMBIA/g,
      ""
    ) // quitar genéricos
    .replace(/[^A-Z0-9\s]/g, "") // quitar caracteres raros
    .replace(/\s+/g, " ") // espacios múltiples → 1
    .trim();
}

function validarSimilitudNombre(nombreEncontrado, nombreEsperado) {
  if (!nombreEncontrado || !nombreEsperado) {
    return { coincide: false, similitud: 0 };
  }

  // 1️⃣ Normalizados
  const nombreEncontradoNorm = normalizarNombre(nombreEncontrado);
  const nombreEsperadoNorm = normalizarNombre(nombreEsperado);

  // 2️⃣ Similaridad general
  const similitudNormalizada = compareTwoStrings(
    nombreEncontradoNorm,
    nombreEsperadoNorm
  );

  const similitudDirectaRaw = compareTwoStrings(
    nombreEncontrado.toUpperCase(),
    nombreEsperado.toUpperCase()
  );

  // 3️⃣ Validación por palabras
  const palabrasEsperadas = nombreEsperadoNorm
    .split(/\s+/)
    .filter((p) => p.length >= 3);
  const palabrasEncontradas = palabrasEsperadas.filter((p) =>
    nombreEncontradoNorm.includes(p)
  );
  const coincidenciaPalabras =
    palabrasEsperadas.length > 0
      ? palabrasEncontradas.length / palabrasEsperadas.length
      : 0;

  // 4️⃣ Contención (nuevo)
  const contiene =
    nombreEsperadoNorm.includes(nombreEncontradoNorm) ||
    nombreEncontradoNorm.includes(nombreEsperadoNorm) ||
    nombreEsperado.toUpperCase().includes(nombreEncontrado.toUpperCase()) ||
    nombreEncontrado.toUpperCase().includes(nombreEsperado.toUpperCase());

  // 5️⃣ Similitud final
  const similitudFinal = Math.max(
    similitudNormalizada,
    coincidenciaPalabras,
    similitudDirectaRaw
  );

  const coincide =
    similitudFinal >= 0.65 || // umbral más flexible
    contiene; // ✅ válido si un nombre contiene al otro

  return {
    coincide,
    similitud: similitudFinal,
    similitudNormalizada,
    similitudRaw: similitudDirectaRaw,
    contiene,
    nombreNormalizadoEncontrado: nombreEncontradoNorm,
    nombreNormalizadoEsperado: nombreEsperadoNorm,
    nombreRawEncontrado: nombreEncontrado,
    nombreRawEsperado: nombreEsperado,
  };
}

// Función principal de validación
export const validarPoder = async (
  fileBuffer,
  nombreTransportadorEsperado,
  nombreConductorEsperado,
  cedulaConductorEsperada
) => {
  try {
    let bufferParaOCR = fileBuffer;
    let tipoDocumento = "imagen";

    // Detectar si es PDF y convertir a imagen
    if (isPDF(fileBuffer)) {
      console.log("📄 Detectado PDF Poder...");
      tipoDocumento = "PDF Poder convertido con poppler";

      try {
        bufferParaOCR = await convertPDFToImage(fileBuffer);
        console.log("✅ PDF Poder convertido exitosamente");
      } catch (pdfError) {
        console.error("❌ Error convirtiendo PDF Poder:", pdfError.message);
        throw new Error(
          `No se pudo procesar el PDF Poder: ${pdfError.message}`
        );
      }
    }

    // OCR con configuración optimizada para documentos legales
    const ocrOptions = {
      tessedit_pageseg_mode: 6,
      tessedit_ocr_engine_mode: 2,
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ0123456789 .-/():,",
      preserve_interword_spaces: "1",
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`OCR Poder Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    };

    const result = await Tesseract.recognize(bufferParaOCR, "spa", ocrOptions);

    let texto = result.data.text || "";
    texto = texto.replace(/[_—–-]+/g, " "); // normalizar guiones/líneas

    // Fallback con inglés si el texto es muy corto
    if (texto.length < 200) {
      console.log("⚠️ Texto muy corto, intentando con inglés+español...");
      const result2 = await Tesseract.recognize(
        bufferParaOCR,
        "eng+spa",
        ocrOptions
      );
      const texto2 = result2.data.text || "";
      if (texto2.length > texto.length) {
        texto = texto2;
      }
    }

    console.log("🔍 OCR Poder completo:", texto.substring(0, 500) + "...");

    // ========== EXTRAER INFORMACIÓN ==========
    const transportadorEncontrado = extraerTransportador(texto);
    const conductorInfo = extraerConductor(texto);

    console.log("🏢 Transportador encontrado:", transportadorEncontrado);
    console.log("👤 Conductor encontrado:", conductorInfo);

    // ========== VALIDAR TRANSPORTADOR ==========
    const validacionTransportador = validarSimilitudNombre(
      transportadorEncontrado,
      nombreTransportadorEsperado
    );

    // ========== VALIDAR CONDUCTOR ==========
    const validacionConductor = validarSimilitudNombre(
      conductorInfo.nombre,
      nombreConductorEsperado
    );

    // ========== VALIDAR CÉDULA ==========
    const cedulaEsperadaLimpia = cedulaConductorEsperada
      ? cedulaConductorEsperada.replace(/\D/g, "")
      : "";
    const cedulaCoincide = conductorInfo.cedula === cedulaEsperadaLimpia;

    // ========== VALIDACIONES ADICIONALES DEL DOCUMENTO ==========
    const contienePoderEspecifico =
      /diligencio\s+los\s+formatos\s+requeridos/i.test(texto);
    const mencionaCemex = /CEMEX/i.test(texto);
    const esPoderValido = contienePoderEspecifico && mencionaCemex;

    // ========== RESULTADO FINAL ==========
    return {
      // Información extraída
      transportadorEncontrado,
      conductorEncontrado: {
        nombre: conductorInfo.nombre,
        cedula: conductorInfo.cedula,
      },

      // Validaciones
      transportadorCoincide: validacionTransportador.coincide,
      similitudTransportador: validacionTransportador.similitud,

      conductorCoincide: validacionConductor.coincide,
      similitudConductor: validacionConductor.similitud,

      cedulaCoincide,

      // Validaciones del documento
      esPoderValido,
      contienePoderEspecifico,
      mencionaCemex,

      // Validación general
      documentoCompleto:
        validacionTransportador.coincide &&
        validacionConductor.coincide &&
        cedulaCoincide &&
        esPoderValido,

      // Información de debug
      textoOCR: texto,
      tipoDocumento,
      debug: {
        longitudTexto: texto.length,
        transportadorPalabras: `${validacionTransportador.palabrasEncontradas}/${validacionTransportador.palabrasEsperadas}`,
        conductorPalabras: `${validacionConductor.palabrasEncontradas}/${validacionConductor.palabrasEsperadas}`,
        cedulaEsperada: cedulaEsperadaLimpia,
        cedulaEncontrada: conductorInfo.cedula,
        entorno: "Node.js con pdf-poppler Poder",
      },
    };
  } catch (error) {
    console.error("❌ Error en validación de Poder:", error);

    return {
      // Información extraída
      transportadorEncontrado: null,
      conductorEncontrado: {
        nombre: null,
        cedula: null,
      },

      // Validaciones
      transportadorCoincide: false,
      similitudTransportador: 0,
      conductorCoincide: false,
      similitudConductor: 0,
      cedulaCoincide: false,

      // Validaciones del documento
      esPoderValido: false,
      contienePoderEspecifico: false,
      mencionaCemex: false,
      documentoCompleto: false,

      // Información de debug
      textoOCR: "",
      tipoDocumento: "error",
      debug: {
        error: error.message,
        entorno: "Node.js con pdf-poppler Poder (Error)",
      },
    };
  }
};
