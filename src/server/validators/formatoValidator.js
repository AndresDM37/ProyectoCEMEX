import Tesseract from "tesseract.js";
import { compareTwoStrings } from "string-similarity";
import pdf from "pdf-poppler";
import fs from "fs";
import path from "path";
import os from "os";

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
    
    console.log("🔄 Convirtiendo PDF formato a imagen...");
    
    // Convertir PDF a imagen
    const result = await pdf.convert(tempPDFPath, options);
    
    // Buscar el archivo generado
    const files = fs.readdirSync(outputDir);
    const imageFile = files.find(file => file.startsWith('page') && file.endsWith('.png'));
    
    if (!imageFile) {
      throw new Error('No se pudo generar la imagen del PDF de formato');
    }
    
    const imagePath = path.join(outputDir, imageFile);
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Limpiar archivos temporales
    fs.unlinkSync(tempPDFPath);
    fs.rmSync(outputDir, { recursive: true, force: true });
    
    console.log("✅ PDF formato convertido exitosamente a imagen");
    return imageBuffer;
    
  } catch (error) {
    // Limpiar archivos temporales en caso de error
    if (fs.existsSync(tempPDFPath)) {
      fs.unlinkSync(tempPDFPath);
    }
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    throw new Error(`Error convirtiendo PDF formato con poppler: ${error.message}`);
  }
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
  try {
    let bufferParaOCR = fileBuffer;
    let tipoDocumento = "imagen";
    
    // Detectar si es PDF y convertir a imagen
    if (isPDF(fileBuffer)) {
      console.log("📄 Detectado PDF formato, convirtiendo con poppler...");
      tipoDocumento = "PDF formato convertido con poppler";
      
      try {
        bufferParaOCR = await convertPDFToImage(fileBuffer);
        console.log("✅ PDF formato convertido exitosamente");
      } catch (pdfError) {
        console.error("❌ Error convirtiendo PDF formato:", pdfError.message);
        throw new Error(`No se pudo procesar el PDF formato: ${pdfError.message}`);
      }
    }

    // Configuración optimizada de OCR
    const ocrOptions = {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Formato Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
      tessedit_pageseg_mode: '1',
      tessedit_ocr_engine_mode: '2',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ0123456789 .-',
      preserve_interword_spaces: '1'
    };

    const result = await Tesseract.recognize(bufferParaOCR, "spa", ocrOptions);
    const texto = result.data.text || "";
    
    // Si el texto es muy corto, intentar con otros idiomas
    let textoFinal = texto;
    if (texto.length < 50) {
      console.log("⚠️ Texto formato muy corto, intentando con inglés...");
      const result2 = await Tesseract.recognize(bufferParaOCR, "eng", ocrOptions);
      const texto2 = result2.data.text || "";
      if (texto2.length > texto.length) {
        textoFinal = texto2;
      }
    }

    const textoPlano = normalizeText(textoFinal);

    // --- 1) Validar código transportador
    const codigosRaw = textoFinal.match(/.{0,5}\d{5,10}.{0,5}/g) || []; 
    // buscamos 5-10 dígitos rodeados de hasta 5 caracteres para atrapar basura del OCR

    console.log("🔍 OCR formato bruto:", textoFinal.substring(0, 200));
    console.log("📌 Codigos RAW encontrados:", codigosRaw);

    const codigos = codigosRaw.map(c => c.replace(/[^\d]/g, "")); // limpiar todo lo que no sea número
    console.log("📌 Codigos limpios:", codigos, "| Esperado:", codigoTransportadorInput);

    const codigoEncontrado = codigos.find(c => c === codigoTransportadorInput);

    console.log("✅ Código transportador encontrado:", codigoEncontrado);

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
    const cedulas = (textoFinal.match(/\d[\d'.-]{6,15}\d/g) || []).map(c =>
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

      console.log("Nombre conductor encontrado:", nombreConductorNorm, similitudConductor);
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
      textoOCR: textoFinal,
      tipoDocumento: tipoDocumento,
      debug: {
        longitudTexto: textoFinal.length,
        calidadOCR: textoFinal.length > 100 ? "alta" : textoFinal.length > 50 ? "media" : "baja",
        entorno: "Node.js con pdf-poppler formato"
      }
    };

  } catch (error) {
    console.error("❌ Error en validación de formato:", error);
    
    return {
      codigoTransportador: {
        esperado: codigoTransportadorInput,
        encontrado: null,
        coincide: false,
      },
      transportador: {
        esperado: nombreTransportadorInput,
        similitud: 0,
        coincide: false,
      },
      conductor: {
        cedula: {
          esperado: cedulaConductorInput,
          encontrado: [],
          coincide: false,
        },
        nombre: {
          esperado: nombreConductorInput,
          similitud: 0,
          coincide: false,
        },
      },
      textoOCR: "",
      tipoDocumento: "error",
      debug: {
        error: error.message,
        entorno: "Node.js con pdf-poppler formato (Error)"
      }
    };
  }
};