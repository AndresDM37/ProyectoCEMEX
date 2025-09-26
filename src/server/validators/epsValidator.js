// src/server/epsValidator.js
import Tesseract from "tesseract.js";
import { findBestMatch, compareTwoStrings } from "string-similarity";
import pdf from "pdf-poppler";
import fs from "fs";
import path from "path";
import os from "os";

// Función para detectar si el buffer es un PDF
function isPDF(buffer) {
  return buffer.slice(0, 4).toString() === '%PDF';
}

// Función para convertir PDF a imagen usando pdf-poppler
async function convertPDFToImage(pdfBuffer) {
  const tempDir = os.tmpdir();
  const tempPDFPath = path.join(tempDir, `temp_eps_pdf_${Date.now()}.pdf`);
  const outputDir = path.join(tempDir, `eps_pdf_images_${Date.now()}`);
  
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
      out_prefix: 'eps_page',
      page: 1, // Solo convertir la primera página
      single_file: true,
      print_command: false,
      density: 300, // DPI alta para mejor calidad OCR
      size: '2000x2000' // Tamaño máximo
    };
    
    console.log("🔄 Convirtiendo PDF EPS a imagen...");
    
    // Convertir PDF a imagen
    const result = await pdf.convert(tempPDFPath, options);
    
    // Buscar el archivo generado
    const files = fs.readdirSync(outputDir);
    const imageFile = files.find(file => file.startsWith('eps_page') && file.endsWith('.png'));
    
    if (!imageFile) {
      throw new Error('No se pudo generar la imagen del PDF EPS');
    }
    
    const imagePath = path.join(outputDir, imageFile);
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Limpiar archivos temporales
    fs.unlinkSync(tempPDFPath);
    fs.rmSync(outputDir, { recursive: true, force: true });
    
    console.log("✅ PDF EPS convertido exitosamente a imagen");
    return imageBuffer;
    
  } catch (error) {
    // Limpiar archivos temporales en caso de error
    if (fs.existsSync(tempPDFPath)) {
      fs.unlinkSync(tempPDFPath);
    }
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    throw new Error(`Error convirtiendo PDF EPS con poppler: ${error.message}`);
  }
}

export const validarEPS = async (fileBuffer, nombreEsperado, cedulaLimpia) => {
  try {
    let bufferParaOCR = fileBuffer;
    let tipoDocumento = "imagen";
    
    // Detectar si es PDF y convertir a imagen
    if (isPDF(fileBuffer)) {
      console.log("📄 Detectado PDF EPS, convirtiendo con poppler...");
      tipoDocumento = "PDF EPS convertido con poppler";
      
      try {
        bufferParaOCR = await convertPDFToImage(fileBuffer);
        console.log("✅ PDF EPS convertido exitosamente");
      } catch (pdfError) {
        console.error("❌ Error convirtiendo PDF EPS:", pdfError.message);
        throw new Error(`No se pudo procesar el PDF EPS: ${pdfError.message}`);
      }
    }

    // --- OCR con configuración mejorada para EPS
    const ocrOptions = {
      tessedit_pageseg_mode: 6,
      tessedit_ocr_engine_mode: 2,
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ0123456789 .-/()',
      preserve_interword_spaces: '1',
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR EPS Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    };

    const resultEPS = await Tesseract.recognize(bufferParaOCR, "spa", ocrOptions);
    let textoEPS = (resultEPS.data.text || "").replace(/\u00A0/g, " ");

    // Si el texto es muy corto, intentar con inglés
    if (textoEPS.length < 50) {
      console.log("⚠️ Texto EPS muy corto, intentando con inglés...");
      const result2 = await Tesseract.recognize(bufferParaOCR, "eng", ocrOptions);
      const texto2 = result2.data.text || "";
      if (texto2.length > textoEPS.length) {
        textoEPS = texto2;
      }
    }

    console.log("🔍 OCR EPS:", textoEPS.substring(0, 300));

    // --- Normalizaciones previas
    const nombreEsperadoNorm = (nombreEsperado || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const cedulaEsperadaClean = (cedulaLimpia || "").replace(/\D/g, "");

    const textoPlanoEPS = textoEPS
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const textoForExtraction = textoPlanoEPS
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // ---------- 1) Intentar extraer nombre por anclas (señor, señor(a), etc.)
    let nombreCandidato = null;
    const anchorMatch = textoForExtraction.match(/\b(?:senor|senora|senor\(a\)|sr|sra)\b/);
    if (anchorMatch) {
      const idx = textoForExtraction.indexOf(anchorMatch[0]) + anchorMatch[0].length;
      const after = textoForExtraction.slice(idx).trim();
      const stopWords = new Set([
        "identificado","identificada","identificad","identificacion",
        "con","cc","cedula","numero","c","documento"
      ]);
      const skipWords = new Set(["el","la","del","de","los","las","y","en","por","a","al"]);
      const tokens = after.split(/\s+/);
      const nameTokens = [];
      for (const t of tokens) {
        if (stopWords.has(t)) break;
        if (skipWords.has(t)) continue;
        if (t.length <= 1) continue;
        nameTokens.push(t);
        if (nameTokens.length >= 5) break;
      }
      if (nameTokens.length > 0) {
        nombreCandidato = nameTokens.join(" ");
      }
    }

    // ---------- 2) Sliding windows si no hubo candidato
    let bestCandidate = null;
    let bestRating = 0;
    if (!nombreCandidato) {
      const words = textoForExtraction.split(/\s+/).filter(Boolean);
      const windows = [];
      for (let i = 0; i < words.length; i++) {
        for (let size = 2; size <= 5; size++) {
          if (i + size <= words.length) windows.push(words.slice(i, i + size).join(" "));
        }
      }
      if (nombreEsperadoNorm && windows.length > 0) {
        const bestMatch = findBestMatch(String(nombreEsperadoNorm), windows.map(w => String(w))).bestMatch;
        bestCandidate = bestMatch.target;
        bestRating = bestMatch.rating;
      }
    }

    // ---------- 3) Decidir si nombre encontrado
    let nombreEncontradoEPS = false;
    let similitudEPS = 0;

    if (nombreCandidato) {
      similitudEPS = compareTwoStrings(nombreEsperadoNorm, nombreCandidato);
      nombreEncontradoEPS =
        similitudEPS > 0.5 ||
        nombreEsperadoNorm.split(/\s+/).every(tok => nombreCandidato.includes(tok));
    } else if (bestCandidate) {
      similitudEPS = bestRating;
      nombreEncontradoEPS =
        bestRating > 0.55 ||
        nombreEsperadoNorm.split(/\s+/).every(tok => bestCandidate.includes(tok));
    } else {
      const allTokensInText = nombreEsperadoNorm.split(/\s+/).every(tok => textoForExtraction.includes(tok));
      nombreEncontradoEPS = allTokensInText;
    }

    // ---------- 4) Validar cédula
    const cedulaRegex = /(\d{1,3}(?:\.\d{3}){1,2}|\d{7,12})/g;
    const matches = textoEPS.match(cedulaRegex) || [];
    const posiblesCedulasEPS = matches.map(m => m.replace(/\D/g, "").trim()).filter(Boolean);
    const cedulaEncontradaEPS = posiblesCedulasEPS.some(c => {
      // compara exacto
      if (c === cedulaEsperadaClean) return true;
      // tolerancia: si la OCR metió un cero mal
      if (c.length === cedulaEsperadaClean.length) {
        const diff = [...c].filter((ch, i) => ch !== cedulaEsperadaClean[i]).length;
        if (diff <= 1) return true; // tolera 1 error de OCR
      }
      return false;
    });

    // ---------- 5) VALIDACIÓN DE FECHA EXPEDICIÓN MEJORADA
    const keywords = [
      "expedicion", "expedida", "expedido", "expide", "expedio",
      "generacion", "generado", "generada", "genera",
      "emision", "emitido", "emitida", "emite",
      "presente", "certificacion", "valida", "validez"  // añadidos para EPS
    ];

    let fechaValida = false;
    let fechaDetectada = null;
    let diffDias = null;

    const monthMap = {
      enero:0, ene:0, febrero:1, feb:1, marzo:2, mar:2, abril:3, abr:3,
      mayo:4, may:4, junio:5, jun:5, julio:6, jul:6, agosto:7, ago:7,
      septiembre:8, setiembre:8, sep:8, set:8, octubre:9, oct:9,
      noviembre:10, nov:10, diciembre:11, dic:11,
      "01":0, "02":1, "03":2, "04":3, "05":4, "06":5,
      "07":6, "08":7, "09":8, "10":9, "11":10, "12":11
    };

    function evaluarFecha(dia, mesNum, anio) {
      if (String(anio).length === 2) anio = parseInt("20" + anio, 10);
      const fechaDoc = new Date(anio, mesNum, dia);
      const hoy = new Date();
      fechaDoc.setHours(0,0,0,0);
      hoy.setHours(0,0,0,0);
      diffDias = Math.floor((hoy - fechaDoc) / (1000 * 60 * 60 * 24));
      fechaValida = diffDias <= 30 && diffDias >= 0;
      fechaDetectada = `${String(dia).padStart(2,"0")}/${String(mesNum+1).padStart(2,"0")}/${anio}`;
      console.log("📌 fechaDoc:", fechaDoc, "| hoy:", hoy, "| diffDias:", diffDias, "| fechaValida:", fechaValida);
    }

    function cleanNumericDots(s) {
      return s.replace(/(\d)[\.\s](?=\d)/g, "$1");
    }

    function normalizarTextoFecha(texto) {
      return texto
        .replace(/\b(?:veinte?|treinta?|cuarenta?|cincuenta?)\s*\w*\s*\((\d{1,2})\)/gi, "$1") // "veintisiete (27)" -> "27"
        .replace(/\b(\w+)\s*\(\s*(\d{1,2})\s*\)/g, "$2") // cualquier "palabra (número)" -> número
        .replace(/d[ií]a\(s\)/gi, "dias")
        .replace(/mes\s*de\s*(\d{2})\s*del/gi, "mes de $1 del") // normalizar "mes de 08 del"
        .replace(/\s+/g, " ");
    }

    function buscarFechasEnTexto(texto, sourceLabel = "texto") {
      let cleaned = cleanNumericDots(texto.replace(/\s+/g, " "));
      cleaned = normalizarTextoFecha(cleaned);

      console.log(`🔎 Buscando fechas en ${sourceLabel} (normalizado):`, cleaned);

      // Regex específica para documentos EPS/Famisanar
      // Detecta: "a los 27 días del mes de 08 del año 2025" o variantes
      const reEPSFormat = /(?:a\s+los\s+)?(?<dia>\d{1,2})\s*d[ií]as?\s*del\s*mes\s*de\s*(?<mes>\d{1,2}|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)\s*(?:de|del)?\s*(?:ano|año)?\s*(?<anio>\d{2,4})/i;
      
      // Regex más general para fechas escritas
      const reTextGeneral = /(?<dia>\d{1,2})\s*(?:d[ií]as?\s*)?(?:del?\s*)?(?:mes\s*de\s*)?(?<mes>enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic|\d{1,2})\s*(?:de|del)?\s*(?:ano|año)?\s*(?<anio>\d{2,4})/i;
      
      // Regex para fechas numéricas
      const reNum = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;

      // Probar formato específico EPS primero
      const mEPS = reEPSFormat.exec(cleaned);
      if (mEPS) {
        console.log("📅 Fecha formato EPS detectada:", mEPS[0]);
        let dia = parseInt(mEPS.groups.dia, 10);
        let mesStr = mEPS.groups.mes.toLowerCase();
        let mesNum = monthMap[mesStr];
        if (mesNum === undefined) {
          // Si es número, convertir
          let mesNumerico = parseInt(mesStr, 10);
          if (mesNumerico >= 1 && mesNumerico <= 12) {
            mesNum = mesNumerico - 1;
          }
        }
        let anioStr = (mEPS.groups.anio || "").replace(/\D/g, "");
        let anio = anioStr.length === 2 ? parseInt("20" + anioStr, 10) : parseInt(anioStr, 10);
        
        if (mesNum !== undefined && !isNaN(anio)) {
          return { dia, mes: mesNum, anio };
        }
      }

      // Probar formato general de texto
      const mText = reTextGeneral.exec(cleaned);
      if (mText) {
        console.log("📅 Fecha en texto general detectada:", mText[0]);
        let dia = parseInt(mText.groups.dia, 10);
        let mesStr = mText.groups.mes.toLowerCase();
        let mesNum = monthMap[mesStr];
        if (mesNum === undefined) {
          let mesNumerico = parseInt(mesStr, 10);
          if (mesNumerico >= 1 && mesNumerico <= 12) {
            mesNum = mesNumerico - 1;
          }
        }
        let anioStr = (mText.groups.anio || "").replace(/\D/g, "");
        let anio = anioStr.length === 2 ? parseInt("20" + anioStr, 10) : parseInt(anioStr, 10);
        
        if (mesNum !== undefined && !isNaN(anio)) {
          return { dia, mes: mesNum, anio };
        }
      }

      // Fallback a fecha numérica
      const mNum = reNum.exec(cleaned);
      if (mNum) {
        console.log("📅 Fecha numérica detectada:", mNum[1]);
        const parts = mNum[1].includes("/") ? mNum[1].split("/") : mNum[1].split("-");
        let dia = parseInt(parts[0], 10);
        let mes = parseInt(parts[1], 10) - 1;
        let anio = parts[2].length === 2 ? parseInt("20" + parts[2], 10) : parseInt(parts[2], 10);
        return { dia, mes, anio };
      }

      return null;
    }

    // Estrategia de búsqueda mejorada
    let encontrado = null;

    // 1. Buscar por palabras clave de expedición
    for (const keyword of keywords) {
      const kwRegex = new RegExp(`\\b${keyword}\\b`, "i");
      const kwMatch = kwRegex.exec(textoPlanoEPS);
      
      if (kwMatch) {
        console.log("🎯 Palabra clave detectada:", keyword);
        const start = Math.max(0, kwMatch.index - 50);
        const end = Math.min(textoPlanoEPS.length, kwMatch.index + 300);
        const ventana = textoPlanoEPS.slice(start, end);
        
        const resultado = buscarFechasEnTexto(ventana, `ventana-${keyword}`);
        if (resultado) {
          encontrado = resultado;
          evaluarFecha(resultado.dia, resultado.mes, resultado.anio);
          break;
        }
      }
    }

    // 2. Búsqueda específica para frases de EPS
    if (!encontrado) {
      console.log("🔍 Buscando frases específicas de certificación EPS...");
      const frasesEPS = [
        /presente.*certificaci[oó]n.*expide/i,
        /certificaci[oó]n.*validez.*mes/i,
        /solicitud.*interesado.*bogot[aá]/i,
        /quien.*interese.*d[ií]as/i
      ];

      for (const fraseRegex of frasesEPS) {
        const match = fraseRegex.exec(textoPlanoEPS);
        if (match) {
          console.log("📋 Frase EPS encontrada:", match[0].substring(0, 50) + "...");
          const start = Math.max(0, match.index - 20);
          const end = Math.min(textoPlanoEPS.length, match.index + 200);
          const contexto = textoPlanoEPS.slice(start, end);
          
          const resultado = buscarFechasEnTexto(contexto, "contexto-EPS");
          if (resultado) {
            encontrado = resultado;
            evaluarFecha(resultado.dia, resultado.mes, resultado.anio);
            break;
          }
        }
      }
    }

    // 3. Fallback: buscar en todo el texto
    if (!encontrado) {
      console.log("⚠️ Intentando búsqueda en todo el documento...");
      const resultado = buscarFechasEnTexto(textoPlanoEPS, "documento completo");
      if (resultado) {
        encontrado = resultado;
        evaluarFecha(resultado.dia, resultado.mes, resultado.anio);
      }
    }

    if (!encontrado) {
      console.log("❌ No se encontró ninguna fecha válida en el documento EPS.");
    }

    // ---------- 6) Palabras clave y estado afiliación
    const contieneAfiliado = textoPlanoEPS.includes("afiliado");
    const contieneActivo = textoPlanoEPS.includes("activo");
    const contieneVinculado = textoPlanoEPS.includes("vinculado");
    const contieneHabilitado = textoPlanoEPS.includes("habilitado");
    const contieneVigente = textoPlanoEPS.includes("vigente");

    let estadoAfiliacion = null;
    const estadoRegex = /estado\s+de\s+la\s+afiliaci[oó]n[:\s]+([a-z]+)/i;
    const estadoMatch = estadoRegex.exec(textoEPS);
    if (estadoMatch) estadoAfiliacion = estadoMatch[1].toUpperCase();

    return {
      nombreEncontrado: nombreEncontradoEPS,
      similitudNombre: similitudEPS,
      cedulaEncontrada: cedulaEncontradaEPS,
      fechaDetectada,
      fechaValida,
      diffDias,
      estadoAfiliacion,
      palabrasClave: { 
        afiliado: contieneAfiliado, 
        activo: contieneActivo, 
        vinculado: contieneVinculado, 
        habilitado: contieneHabilitado, 
        vigente: contieneVigente 
      },
      texto: textoEPS,
      tipoDocumento: tipoDocumento,
      debug: {
        longitudTexto: textoEPS.length,
        calidadOCR: textoEPS.length > 200 ? "alta" : textoEPS.length > 100 ? "media" : "baja",
        entorno: "Node.js con pdf-poppler EPS"
      }
    };

  } catch (error) {
    console.error("❌ Error en validación EPS:", error);
    
    return {
      nombreEncontrado: false,
      similitudNombre: 0,
      cedulaEncontrada: false,
      fechaDetectada: null,
      fechaValida: false,
      diffDias: null,
      estadoAfiliacion: null,
      palabrasClave: { 
        afiliado: false, 
        activo: false, 
        vinculado: false, 
        habilitado: false, 
        vigente: false 
      },
      texto: "",
      tipoDocumento: "error",
      debug: {
        error: error.message,
        entorno: "Node.js con pdf-poppler EPS (Error)"
      }
    };
  }
};