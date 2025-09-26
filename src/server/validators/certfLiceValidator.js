import Tesseract from "tesseract.js";
import { compareTwoStrings } from "string-similarity";
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
  const tempPDFPath = path.join(
    tempDir,
    `temp_certificado_licencia_${Date.now()}.pdf`
  );
  const outputDir = path.join(
    tempDir,
    `certificado_licencia_images_${Date.now()}`
  );

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
      out_prefix: "certificado_page",
      page: 1, // Solo convertir la primera página
      single_file: true,
      print_command: false,
      density: 300, // DPI alta para mejor calidad OCR
      size: "2000x2000", // Tamaño máximo
    };

    console.log("🔄 Convirtiendo PDF Certificado Licencia a imagen...");

    // Convertir PDF a imagen
    const result = await pdf.convert(tempPDFPath, options);

    // Buscar el archivo generado
    const files = fs.readdirSync(outputDir);
    const imageFile = files.find(
      (file) => file.startsWith("certificado_page") && file.endsWith(".png")
    );

    if (!imageFile) {
      throw new Error(
        "No se pudo generar la imagen del PDF Certificado Licencia"
      );
    }

    const imagePath = path.join(outputDir, imageFile);
    const imageBuffer = fs.readFileSync(imagePath);

    // Limpiar archivos temporales
    fs.unlinkSync(tempPDFPath);
    fs.rmSync(outputDir, { recursive: true, force: true });

    console.log("✅ PDF Certificado Licencia convertido exitosamente a imagen");
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
      `Error convirtiendo PDF Certificado Licencia: ${error.message}`
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

// Función para parsear fechas
function parsearFecha(fechaTexto) {
  try {
    // Intentar diferentes formatos: DD/MM/YYYY, DD-MM-YYYY
    let [d, m, y] = fechaTexto.replace(/-/g, "/").split("/");

    if (!d || !m || !y) return null;

    // Asegurar formato de 4 dígitos para el año
    if (y.length === 2) {
      y = parseInt(y) < 50 ? `20${y}` : `19${y}`;
    }

    const fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));

    // Validar que la fecha sea válida
    if (
      fecha.getFullYear() != y ||
      fecha.getMonth() != parseInt(m) - 1 ||
      fecha.getDate() != parseInt(d)
    ) {
      return null;
    }

    return fecha;
  } catch (error) {
    console.warn("⚠️ Error parseando fecha:", fechaTexto, error.message);
    return null;
  }
}

// Función principal de validación
export const validarCertificadoLicencia = async (
  fileBuffer,
  nombreEsperado,
  cedulaEsperada
) => {
  try {
    let bufferParaOCR = fileBuffer;
    let tipoDocumento = "imagen";

    // Detectar si es PDF y convertir a imagen
    if (isPDF(fileBuffer)) {
      console.log("📄 Detectado PDF Certificado Licencia...");
      tipoDocumento = "PDF Certificado Licencia convertido con poppler";

      try {
        bufferParaOCR = await convertPDFToImage(fileBuffer);
        console.log("✅ PDF convertido exitosamente");
      } catch (pdfError) {
        console.error("❌ Error convirtiendo PDF:", pdfError.message);
        throw new Error(`No se pudo procesar el PDF: ${pdfError.message}`);
      }
    }

    // OCR con configuración optimizada para certificados
    const ocrOptions = {
      tessedit_pageseg_mode: 6,
      tessedit_ocr_engine_mode: 2,
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ0123456789 .-/():",
      preserve_interword_spaces: "1",
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(
            `OCR Certificado Progress: ${Math.round(m.progress * 100)}%`
          );
        }
      },
    };

    const result = await Tesseract.recognize(bufferParaOCR, "spa", ocrOptions);
    let texto = result.data.text || "";

    // Fallback con inglés si el texto es muy corto
    if (texto.length < 100) {
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

    console.log("🔍 OCR Certificado completo:", texto);

    // ========== VALIDAR NOMBRE ==========
    const nombreNormalizado = normalizeText(nombreEsperado);
    const textoNormalizado = normalizeText(texto);

    const palabrasNombre = nombreNormalizado
      .split(/\s+/)
      .filter((p) => p.length >= 3);
    let palabrasEncontradas = 0;

    for (const palabra of palabrasNombre) {
      if (textoNormalizado.includes(palabra)) {
        palabrasEncontradas++;
      }
    }

    const similitudNombre =
      palabrasNombre.length > 0
        ? palabrasEncontradas / palabrasNombre.length
        : 0;
    const nombreEncontrado = similitudNombre >= 0.6; // Al menos 60% de coincidencia

    // ========== VALIDAR CÉDULA ==========
    const cedulaLimpia = cedulaEsperada.replace(/\D/g, "");
    const cedulaRegex = new RegExp(
      cedulaLimpia.split("").join("\\.?\\s*"),
      "i"
    );
    const cedulaEncontrada =
      cedulaRegex.test(texto) || texto.includes(cedulaLimpia);

    // ========== BUSCAR CATEGORÍAS Y FECHAS ==========
    const lineas = texto
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const categoriasEncontradas = [];

    // Buscar líneas que contengan categorías C2 o C3
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const lineaUpper = linea.toUpperCase();

      // Si la línea contiene C2 o C3
      if (lineaUpper.match(/\bC[23]\b/)) {
        console.log(`📋 Línea ${i + 1} con categoría:`, linea);

        // Extraer información de la línea
        const categoriaMatch = lineaUpper.match(/\b(C[23])\b/);
        if (categoriaMatch) {
          const categoria = categoriaMatch[1];

          // Buscar fechas en la línea (formato DD/MM/YYYY o DD-MM-YYYY)
          const fechaExpMatch = linea.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/g);
          let fechaExp = null;
          let fechaVig = null;

          if (fechaExpMatch && fechaExpMatch.length >= 1) {
            fechaExp = parsearFecha(fechaExpMatch[0]);
          }
          if (fechaExpMatch && fechaExpMatch.length >= 2) {
            fechaVig = parsearFecha(fechaExpMatch[1]);
          } else if (fechaExpMatch && fechaExpMatch.length === 1) {
            // Si solo hay una fecha, podría ser vigencia
            fechaVig = parsearFecha(fechaExpMatch[0]);
          }

          // Buscar estado (ACTIVA/INACTIVA)
          const estadoMatch = lineaUpper.match(
            /(ACTIVA|INACTIVA|ACTIVE|INACTIVE)/
          );
          const estado = estadoMatch ? estadoMatch[1] : null;
          const esActiva = estado && estado.includes("ACTIV");

          categoriasEncontradas.push({
            categoria,
            fechaExp,
            fechaVig,
            estado,
            esActiva,
            lineaOriginal: linea,
            numeroLinea: i + 1,
          });
        }
      }
    }

    console.log("📊 Categorías encontradas:", categoriasEncontradas);

    // ========== SELECCIONAR CATEGORÍAS RELEVANTES ==========

    // Filtrar solo C2 y C3 activas
    const categoriasC2C3 = categoriasEncontradas.filter(
      (cat) =>
        (cat.categoria === "C2" || cat.categoria === "C3") && cat.esActiva
    );

    let ultimaCategoria = null;
    let primeraCategoria = null;

    if (categoriasC2C3.length > 0) {
      // Buscar la de vigencia más lejana en el futuro (ej: 2028)
      ultimaCategoria = categoriasC2C3.reduce(
        (max, cat) =>
          !max || (cat.fechaVig && cat.fechaVig > max.fechaVig) ? cat : max,
        null
      );

      // Buscar la más antigua en expedición para esa misma categoría (ej: 2022)
      primeraCategoria = categoriasC2C3
        .filter((cat) => cat.categoria === ultimaCategoria.categoria)
        .reduce(
          (min, cat) =>
            !min || (cat.fechaExp && cat.fechaExp < min.fechaExp) ? cat : min,
          null
        );
    }

    // ========== VALIDAR ANTIGÜEDAD (MÁS DE 3 AÑOS) ==========
    let antigüedadValida = false;
    let añosAntiguedad = 0;

    if (primeraCategoria && primeraCategoria.fechaExp) {
      const ahora = new Date();
      const diferenciaMilisegundos = ahora - primeraCategoria.fechaExp;
      const años = diferenciaMilisegundos / (1000 * 60 * 60 * 24 * 365.25);
      añosAntiguedad = Math.floor(años * 10) / 10; // Redondear a 1 decimal
      antigüedadValida = años >= 3;
    }

    // ========== VALIDAR VIGENCIA ==========
    let vigente = false;
    let diasParaVencimiento = null;

    if (ultimaCategoria && ultimaCategoria.fechaVig) {
      const ahora = new Date();
      vigente = ultimaCategoria.fechaVig > ahora;
      diasParaVencimiento = Math.ceil(
        (ultimaCategoria.fechaVig - ahora) / (1000 * 60 * 60 * 24)
      );
    }

    // ========== RESULTADO FINAL ==========
    return {
      // Validaciones básicas
      nombreEncontrado,
      similitudNombre,
      cedulaEncontrada,

      // Información de categorías
      ultimaCategoria: ultimaCategoria
        ? {
            categoria: ultimaCategoria.categoria,
            fechaVigencia: ultimaCategoria.fechaVig
              ? ultimaCategoria.fechaVig.toISOString().split("T")[0]
              : null,
            esActiva: ultimaCategoria.esActiva,
            estado: ultimaCategoria.estado,
          }
        : null,

      primeraCategoria: primeraCategoria
        ? {
            categoria: primeraCategoria.categoria,
            fechaExpedicion: primeraCategoria.fechaExp
              ? primeraCategoria.fechaExp.toISOString().split("T")[0]
              : null,
          }
        : null,

      // Validaciones de cumplimiento
      tieneCategoriasRequeridas:
        ultimaCategoria &&
        (ultimaCategoria.categoria === "C2" ||
          ultimaCategoria.categoria === "C3"),
      categoriaActiva: ultimaCategoria ? ultimaCategoria.esActiva : false,
      vigente,
      diasParaVencimiento,
      antigüedadValida,
      añosAntiguedad,

      // Información adicional
      totalCategoriasEncontradas: categoriasEncontradas.length,
      todasLasCategorias: categoriasEncontradas.map((cat) => ({
        categoria: cat.categoria,
        estado: cat.estado,
        fechaExp: cat.fechaExp
          ? cat.fechaExp.toISOString().split("T")[0]
          : null,
        fechaVig: cat.fechaVig
          ? cat.fechaVig.toISOString().split("T")[0]
          : null,
        lineaOriginal: cat.lineaOriginal,
      })),

      textoOCR: texto,
      tipoDocumento,
      debug: {
        longitudTexto: texto.length,
        lineasProcesadas: lineas.length,
        palabrasNombreEncontradas: `${palabrasEncontradas}/${palabrasNombre.length}`,
        entorno: "Node.js con pdf-poppler Certificado Licencia",
      },
    };
  } catch (error) {
    console.error("❌ Error en validación de Certificado de Licencia:", error);

    return {
      // Validaciones básicas
      nombreEncontrado: false,
      similitudNombre: 0,
      cedulaEncontrada: false,

      // Información de categorías
      ultimaCategoria: null,
      primeraCategoria: null,

      // Validaciones de cumplimiento
      tieneCategoriasRequeridas: false,
      categoriaActiva: false,
      vigente: false,
      diasParaVencimiento: null,
      antigüedadValida: false,
      añosAntiguedad: 0,

      // Información adicional
      totalCategoriasEncontradas: 0,
      todasLasCategorias: [],

      textoOCR: "",
      tipoDocumento: "error",
      debug: {
        error: error.message,
        entorno: "Node.js con pdf-poppler Certificado Licencia (Error)",
      },
    };
  }
};
