import Tesseract from "tesseract.js";
import stringSimilarity from "string-similarity";
import pdf from "pdf-poppler";
import fs from "fs";
import path from "path";
import os from "os";

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9\s]/g, " ") // limpiar símbolos raros
    .replace(/\s+/g, " ")
    .trim();
}

// Función para detectar si el buffer es un PDF
function isPDF(buffer) {
  return buffer.slice(0, 4).toString() === '%PDF';
}

// Función para convertir PDF a imagen usando pdf-poppler
async function convertPDFToImage(pdfBuffer) {
  const tempDir = os.tmpdir();
  const tempPDFPath = path.join(tempDir, `temp_pdf_${Date.now()}.pdf`);
  const outputDir = path.join(tempDir, `pdf_images_${Date.now()}`);
  
  try {
    // Crear directorio para las imágenes
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Escribir el buffer a un archivo temporal
    fs.writeFileSync(tempPDFPath, pdfBuffer);
    
    // Configurar opciones de conversión
    const options = {
      format: 'png',
      out_dir: outputDir,
      out_prefix: 'page',
      page: 1, // Solo convertir la primera página
      single_file: true,
      print_command: false,
      density: 300, // DPI alta para mejor calidad OCR
      size: '2000x2000' // Tamaño máximo
    };
    
    console.log("🔄 Convirtiendo PDF a imagen...");
    
    // Convertir PDF a imagen
    const result = await pdf.convert(tempPDFPath, options);
    
    // Buscar el archivo generado
    const files = fs.readdirSync(outputDir);
    const imageFile = files.find(file => file.startsWith('page') && file.endsWith('.png'));
    
    if (!imageFile) {
      throw new Error('No se pudo generar la imagen del PDF');
    }
    
    const imagePath = path.join(outputDir, imageFile);
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Limpiar archivos temporales
    fs.unlinkSync(tempPDFPath);
    fs.rmSync(outputDir, { recursive: true, force: true });
    
    console.log("✅ PDF convertido exitosamente a imagen");
    return imageBuffer;
    
  } catch (error) {
    // Limpiar archivos temporales en caso de error
    if (fs.existsSync(tempPDFPath)) {
      fs.unlinkSync(tempPDFPath);
    }
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    throw new Error(`Error convirtiendo PDF con poppler: ${error.message}`);
  }
}

export const validarCedula = async (
  fileBufferCedula,
  cedula,
  nombreConductor
) => {
  console.log("🚀 Iniciando validación de cédula...");
  console.log(
    "📄 Tipo de entrada:",
    typeof fileBufferCedula,
    fileBufferCedula?.constructor?.name
  );

  try {
    let bufferParaOCR = fileBufferCedula;
    let tipoDocumento = "imagen";
    
    // Detectar si es PDF y convertir a imagen
    if (isPDF(fileBufferCedula)) {
      console.log("📄 Detectado archivo PDF, convirtiendo con poppler...");
      tipoDocumento = "PDF convertido con poppler";
      
      try {
        bufferParaOCR = await convertPDFToImage(fileBufferCedula);
        console.log("✅ PDF convertido exitosamente");
      } catch (pdfError) {
        console.error("❌ Error convirtiendo PDF:", pdfError.message);
        throw new Error(`No se pudo procesar el PDF: ${pdfError.message}`);
      }
    }

    // === CONFIGURACIÓN OPTIMIZADA DE OCR ===
    const ocrOptions = {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
      tessedit_pageseg_mode: '1', // Segmentación automática de página
      tessedit_ocr_engine_mode: '2', // Solo motor LSTM
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ0123456789 .-',
      preserve_interword_spaces: '1'
    };

    console.log("🔍 Ejecutando OCR con configuración optimizada...");

    const result = await Tesseract.recognize(bufferParaOCR, "spa", ocrOptions);
    let textoCedula = result.data.text || "";

    console.log("OCR Extraído:", textoCedula);
    console.log("✅ OCR completado");
    console.log("📝 Longitud del texto:", textoCedula.length);
    console.log(
      "🔍 OCR bruto:",
      textoCedula.substring(0, 200) + (textoCedula.length > 200 ? "..." : "")
    );

    // Si el texto es muy corto, intentar con inglés también
    if (textoCedula.length < 15) {
      console.log("⚠️ Texto muy corto, intentando con inglés...");

      const result2 = await Tesseract.recognize(bufferParaOCR, "eng", ocrOptions);
      const texto2 = result2.data.text || "";
      
      if (texto2.length > textoCedula.length) {
        textoCedula = texto2;
        console.log("✅ Inglés funcionó mejor");
      }
    }

    // Si aún es corto, intentar con idioma combinado
    if (textoCedula.length < 15) {
      console.log("⚠️ Aún muy corto, intentando con esp+eng...");

      const result3 = await Tesseract.recognize(bufferParaOCR, "spa+eng", ocrOptions);
      const texto3 = result3.data.text || "";
      
      if (texto3.length > textoCedula.length) {
        textoCedula = texto3;
        console.log("✅ Idioma combinado funcionó mejor");
      }
    }

    // === NORMALIZACIÓN ===
    const textoPlanoCedula = normalizeText(textoCedula);
    console.log(
      "🧹 Texto normalizado:",
      textoPlanoCedula.substring(0, 100) +
        (textoPlanoCedula.length > 100 ? "..." : "")
    );

    // === VALIDACIÓN DE CÉDULA ===
    const cedulaLimpia = (cedula || "").replace(/\D/g, "");
    console.log("🎯 Buscando cédula:", cedulaLimpia);

    // Extraer números del OCR, normalizando puntos y comas
    let numerosEnTexto = (textoCedula.match(/[\d\.\,\s]+/g) || []).map(
      (n) => n.replace(/[\.,\s]/g, "")
    );

    const numerosLargos = numerosEnTexto.filter((n) => n.length >= 6);

    console.log("🔢 Números encontrados (crudos):", numerosEnTexto);
    console.log("🔢 Números largos (normalizados):", numerosLargos);

    let cedulaEncontrada = false;
    let mejorCoincidencia = "";
    let tipoCoincidencia = "";

    // 1. Coincidencia exacta
    if (numerosLargos.includes(cedulaLimpia)) {
      cedulaEncontrada = true;
      mejorCoincidencia = cedulaLimpia;
      tipoCoincidencia = "exacta";
    }

    // 2. Coincidencia contenida
    if (!cedulaEncontrada) {
      for (let numero of numerosLargos) {
        if (numero.includes(cedulaLimpia) || cedulaLimpia.includes(numero)) {
          cedulaEncontrada = true;
          mejorCoincidencia = numero;
          tipoCoincidencia = "contenida";
          break;
        }
      }
    }

    // 3. Coincidencia por similitud (fuzzy)
    if (!cedulaEncontrada && numerosLargos.length > 0) {
      for (let numero of numerosLargos) {
        const similitud = stringSimilarity.compareTwoStrings(
          numero,
          cedulaLimpia
        );
        if (similitud > 0.7) {
          cedulaEncontrada = true;
          mejorCoincidencia = numero;
          tipoCoincidencia = `fuzzy (${Math.round(similitud * 100)}%)`;
          break;
        }
      }
    }

    // 4. Coincidencia parcial mejorada
    if (!cedulaEncontrada) {
      for (let numero of numerosLargos) {
        // Comparar prefijos y sufijos
        if (numero.length >= 8 && cedulaLimpia.length >= 8) {
          const prefijo = cedulaLimpia.slice(0, 6);
          const sufijo = cedulaLimpia.slice(-4);
          
          if (numero.includes(prefijo) || numero.includes(sufijo)) {
            cedulaEncontrada = true;
            mejorCoincidencia = numero;
            tipoCoincidencia = "coincidencia parcial mejorada";
            break;
          }
        }
      }
    }

    // === VALIDACIÓN DE NOMBRE ===
    const nombreEsperado = normalizeText(nombreConductor);
    const palabrasNombre = nombreEsperado
      .split(/\s+/)
      .filter((p) => p.length >= 3);

    console.log("👤 Buscando palabras del nombre:", palabrasNombre);

    let palabrasEncontradas = [];
    for (let palabra of palabrasNombre) {
      // Búsqueda directa
      if (textoPlanoCedula.includes(palabra)) {
        palabrasEncontradas.push({ palabra, tipo: "exacta" });
        continue;
      }

      // Búsqueda parcial (primeras 4 letras)
      if (palabra.length >= 4) {
        const prefijo = palabra.substring(0, 4);
        if (textoPlanoCedula.includes(prefijo)) {
          palabrasEncontradas.push({ palabra, tipo: "prefijo" });
          continue;
        }
      }

      // Búsqueda fuzzy mejorada
      const palabrasTexto = textoPlanoCedula.split(/\s+/);
      for (let palabraTexto of palabrasTexto) {
        if (palabraTexto.length >= 3) {
          const similitud = stringSimilarity.compareTwoStrings(
            palabra,
            palabraTexto
          );
          if (similitud > 0.65) {
            palabrasEncontradas.push({
              palabra,
              tipo: `fuzzy (${Math.round(similitud * 100)}%)`,
              palabraEncontrada: palabraTexto
            });
            break;
          }
        }
      }
    }

    const porcentajePalabras =
      palabrasNombre.length > 0
        ? palabrasEncontradas.length / palabrasNombre.length
        : 0;
    const nombreEncontrado =
      porcentajePalabras > 0.25 || palabrasEncontradas.length >= 1;

    console.log("📌 Palabras encontradas:", palabrasEncontradas);
    console.log(
      "📌 Porcentaje de palabras:",
      Math.round(porcentajePalabras * 100) + "%"
    );
    console.log("📌 Nombre válido:", nombreEncontrado);

    // === RESULTADO ===
    const resultado = {
      textoCedula,
      textoPlanoCedula,
      coincidencias: {
        cedula: cedulaEncontrada,
        nombre: nombreEncontrado,
      },
      metricas: {
        similitudNombre: porcentajePalabras,
        palabrasEncontradas: palabrasEncontradas.length,
        totalPalabrasEsperadas: palabrasNombre.length,
        porcentajePalabras: porcentajePalabras,
        longitudTextoOCR: textoCedula.length,
        calidadOCR: textoCedula.length > 50 ? "alta" : textoCedula.length > 20 ? "media" : "baja",
      },
      debug: {
        tipoDocumento,
        nombreEsperado,
        palabrasNombre,
        palabrasEncontradasDetalle: palabrasEncontradas,
        cedulaLimpia,
        numerosEncontrados: numerosLargos,
        mejorCoincidenciaCedula: mejorCoincidencia,
        tipoCoincidencia,
        longitudTextoOriginal: textoCedula.length,
        entorno: "Node.js con pdf-poppler",
        configOCR: "optimizada para documentos",
      },
    };

    console.log("✅ Validación completada");
    return resultado;
  } catch (error) {
    console.error("❌ Error en validación:", error);
    console.error("📍 Stack:", error.stack);

    return {
      textoCedula: "",
      textoPlanoCedula: "",
      coincidencias: {
        cedula: false,
        nombre: false,
        documentoValido: false,
        estructuraCorrecta: false,
        edadValida: false,
      },
      metricas: {
        similitudNombre: 0,
        palabrasEncontradas: 0,
        totalPalabrasEsperadas: 0,
        porcentajePalabras: 0,
        palabrasClaveDocumento: 0,
        longitudTextoOCR: 0,
        calidadOCR: "error",
      },
      debug: {
        error: error.message,
        stack: error.stack,
        entorno: "Node.js con pdf-poppler (Error)",
      },
    };
  }
};