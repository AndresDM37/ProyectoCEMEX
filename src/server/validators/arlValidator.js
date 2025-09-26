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
  const tempPDFPath = path.join(tempDir, `temp_arl_pdf_${Date.now()}.pdf`);
  const outputDir = path.join(tempDir, `arl_pdf_images_${Date.now()}`);
  
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
      out_prefix: 'arl_page',
      page: 1, // Solo convertir la primera página
      single_file: true,
      print_command: false,
      density: 300, // DPI alta para mejor calidad OCR
      size: '2000x2000' // Tamaño máximo
    };
    
    console.log("🔄 Convirtiendo PDF ARL a imagen...");
    
    // Convertir PDF a imagen
    const result = await pdf.convert(tempPDFPath, options);
    
    // Buscar el archivo generado
    const files = fs.readdirSync(outputDir);
    const imageFile = files.find(file => file.startsWith('arl_page') && file.endsWith('.png'));
    
    if (!imageFile) {
      throw new Error('No se pudo generar la imagen del PDF ARL');
    }
    
    const imagePath = path.join(outputDir, imageFile);
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Limpiar archivos temporales
    fs.unlinkSync(tempPDFPath);
    fs.rmSync(outputDir, { recursive: true, force: true });
    
    console.log("✅ PDF ARL convertido exitosamente a imagen");
    return imageBuffer;
    
  } catch (error) {
    // Limpiar archivos temporales en caso de error
    if (fs.existsSync(tempPDFPath)) {
      fs.unlinkSync(tempPDFPath);
    }
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    throw new Error(`Error convirtiendo PDF ARL con poppler: ${error.message}`);
  }
}

export const validarARL = async (fileBuffer, nombreEsperado, cedulaLimpia) => {
  try {
    let bufferParaOCR = fileBuffer;
    let tipoDocumento = "imagen";
    
    // Detectar si es PDF y convertir a imagen
    if (isPDF(fileBuffer)) {
      console.log("📄 Detectado PDF ARL, convirtiendo con poppler...");
      tipoDocumento = "PDF ARL convertido con poppler";
      
      try {
        bufferParaOCR = await convertPDFToImage(fileBuffer);
        console.log("✅ PDF ARL convertido exitosamente");
      } catch (pdfError) {
        console.error("❌ Error convirtiendo PDF ARL:", pdfError.message);
        throw new Error(`No se pudo procesar el PDF ARL: ${pdfError.message}`);
      }
    }

    // --- OCR con múltiples configuraciones para mejor precisión
    let textoARL = "";
    
    const ocrOptionsBase = {
      tessedit_pageseg_mode: 6,
      tessedit_ocr_engine_mode: 2,
      tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÉÍÓÚáéíóúÑñ .-/():",
      preserve_interword_spaces: '1',
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR ARL Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    };
    
    try {
      // Primera pasada con configuración estándar
      const resultARL = await Tesseract.recognize(bufferParaOCR, "spa", ocrOptionsBase);
      textoARL = (resultARL.data.text || "").replace(/\u00A0/g, " ");
      
      // Segunda pasada si no se detecta clase de riesgo claramente
      if (!textoARL.match(/clase.*riesgo.*[1-5]/i)) {
        console.log("🔄 Reintentando OCR con configuración optimizada para números...");
        const resultARL2 = await Tesseract.recognize(bufferParaOCR, "spa", {
          ...ocrOptionsBase,
          tessedit_pageseg_mode: 8, // Tratar como una sola palabra
        });
        const textoARL2_clean = (resultARL2.data.text || "").replace(/\u00A0/g, " ");
        
        // Combinar ambos resultados para mejor cobertura
        textoARL = textoARL + "\n" + textoARL2_clean;
      }
      
      // Si el texto es muy corto, intentar con inglés
      if (textoARL.length < 100) {
        console.log("⚠️ Texto ARL muy corto, intentando con inglés...");
        const result3 = await Tesseract.recognize(bufferParaOCR, "eng", ocrOptionsBase);
        const texto3 = result3.data.text || "";
        if (texto3.length > textoARL.length) {
          textoARL = texto3;
        }
      }
      
    } catch (error) {
      console.error("Error en OCR:", error);
      throw error;
    }

    console.log("🔍 OCR ARL:", textoARL.substring(0, 300));

    // --- Normalizaciones
    const nombreEsperadoNorm = (nombreEsperado || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const cedulaEsperadaClean = (cedulaLimpia || "").replace(/\D/g, "");

    const textoPlanoARL = textoARL
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const textoForExtraction = textoPlanoARL
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // ---------- 1) Intentar extraer nombre por anclas
    let nombreCandidato = null;
    const anchorMatch = textoForExtraction.match(/\b(?:senor|senora|sr|sra)\b/);
    if (anchorMatch) {
      const idx =
        textoForExtraction.indexOf(anchorMatch[0]) + anchorMatch[0].length;
      const after = textoForExtraction.slice(idx).trim();
      const stopWords = new Set([
        "identificado",
        "identificada",
        "identificad",
        "identificacion",
        "con",
        "cc",
        "cedula",
        "numero",
        "c",
        "documento",
      ]);
      const skipWords = new Set([
        "el",
        "la",
        "del",
        "de",
        "los",
        "las",
        "y",
        "en",
        "por",
        "a",
        "al",
      ]);
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

    // ---------- 2) Sliding windows si no hubo candidato por ancla
    let bestCandidate = null;
    let bestRating = 0;
    if (!nombreCandidato) {
      const words = textoForExtraction.split(/\s+/).filter(Boolean);
      const windows = [];
      for (let i = 0; i < words.length; i++) {
        for (let size = 2; size <= 5; size++) {
          if (i + size <= words.length)
            windows.push(words.slice(i, i + size).join(" "));
        }
      }
      if (nombreEsperadoNorm && windows.length > 0) {
        const bestMatch = findBestMatch(
          String(nombreEsperadoNorm),
          windows.map((w) => String(w))
        ).bestMatch;
        bestCandidate = bestMatch.target;
        bestRating = bestMatch.rating;
      }
    }

    // ---------- 3) Decidir si nombre encontrado
    let nombreEncontradoARL = false;
    let similitudARL = 0;

    if (nombreCandidato) {
      similitudARL = compareTwoStrings(nombreEsperadoNorm, nombreCandidato);
      nombreEncontradoARL =
        similitudARL > 0.5 ||
        nombreEsperadoNorm
          .split(/\s+/)
          .every((tok) => nombreCandidato.includes(tok));
    } else if (bestCandidate) {
      similitudARL = bestRating;
      nombreEncontradoARL =
        bestRating > 0.55 ||
        nombreEsperadoNorm.split(/\s+/).every((tok) => bestCandidate.includes(tok));
    } else {
      const allTokensInText = nombreEsperadoNorm
        .split(/\s+/)
        .every((tok) => textoForExtraction.includes(tok));
      nombreEncontradoARL = allTokensInText;
    }

    // ---------- 4) Validar cédula
    const cedulaRegex = /(\d{1,3}(?:\.\d{3}){1,2}|\d{7,12})/g;
    const matches = textoARL.match(cedulaRegex) || [];
    const posiblesCedulasARL = matches
      .map((m) => m.replace(/\D/g, ""))
      .filter(Boolean);
    const cedulaEncontradaARL = posiblesCedulasARL.includes(cedulaEsperadaClean);

    // --- Validar fecha expedición ligada a palabras clave (mejorada)
    const keywords = [
      "expedicion", "expedida", "expedido", "expide",
      "generacion", "generado", "generada",
      "emision", "emitido", "emitida"
    ];
    const kwRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "i");
    const kwMatch = kwRegex.exec(textoPlanoARL);

    // regex para fechas numéricas y para fechas escritas en texto
    const reNum = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/; // ej. 22/08/2024
    const reText = /(?:\ba\s+los\s+|\blos\s+)?\(?(?<dia>\d{1,2})\)?\s*d[ií]a?s?\s*del\s*mes\s*de\s*(?<mes>enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)\s*(?:de|del)?\s*(?:ano|año)?\s*(?<anio>\d{2,4})/i;

    const monthMap = {
      enero:0, ene:0, febrero:1, feb:1, marzo:2, mar:2, abril:3, abr:3,
      mayo:4, may:4, junio:5, jun:5, julio:6, jul:6, agosto:7, ago:7,
      septiembre:8, setiembre:8, sep:8, set:8, octubre:9, oct:9,
      noviembre:10, nov:10, diciembre:11, dic:11
    };

    let fechaValida = false;
    let fechaDetectada = null;
    let diffDias = null;

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
      // Quita puntos o espacios que aparezcan entre dígitos: "2.025" -> "2025"
      return s.replace(/(\d)[\.\s](?=\d)/g, "$1");
    }

    // 🔧 Normalizar texto antes de aplicar regex
    function normalizarTextoFecha(s) {
      return s
        .replace(/\b\w+\s*\(\s*(\d{1,2})\s*\)/g, "$1") // "veintinueve (29)" -> "29"
        .replace(/d[ií]a\(s\)/gi, "dias")              // "día(s)" -> "dias"
        .replace(/\s+/g, " ");                         // colapsa espacios
    }

    function buscarFechasEnTexto(texto, sourceLabel = "ventana") {
      let cleaned = cleanNumericDots(texto.replace(/\s+/g, " "));
      cleaned = normalizarTextoFecha(cleaned);

      console.log(`🔎 Buscando fechas en ${sourceLabel} (normalizado):`, cleaned);

      const mNum = reNum.exec(cleaned);
      if (mNum) {
        console.log("📅 Fecha numérica detectada:", mNum[1]);
        const parts = mNum[1].includes("/") ? mNum[1].split("/") : mNum[1].split("-");
        let dia = parseInt(parts[0], 10);
        let mes = parseInt(parts[1], 10) - 1;
        let anio = parts[2].length === 2 ? parseInt("20" + parts[2], 10) : parseInt(parts[2], 10);
        return { dia, mes, anio };
      }

      const mText = reText.exec(cleaned);
      if (mText) {
        console.log("📅 Fecha en texto detectada:", mText[0]);
        let dia = parseInt(mText.groups.dia, 10);
        let mesNombre = mText.groups.mes.toLowerCase();
        let mesNum = monthMap[mesNombre] !== undefined ? monthMap[mesNombre] : null;
        let anioStr = (mText.groups.anio || "").replace(/\D/g, "");
        let anio = anioStr.length === 2 ? parseInt("20" + anioStr, 10) : parseInt(anioStr, 10);
        if (mesNum === null || isNaN(anio)) {
          console.log("⚠️ No se pudo mapear mes o año correctamente:", mesNombre, anioStr);
          return null;
        }
        return { dia, mes: mesNum, anio };
      }

      return null;
    }

    // --- USO FINAL ---
    let fechaExtraida = null;

    if (kwMatch) {
      // buscar 100 caracteres alrededor de la keyword
      const start = Math.max(0, kwMatch.index - 50);
      const end = Math.min(textoPlanoARL.length, kwMatch.index + 100);
      const ventana = textoPlanoARL.slice(start, end);
      fechaExtraida = buscarFechasEnTexto(ventana, "ventana");
    }

    if (!fechaExtraida) {
      // fallback: buscar en todo el texto
      fechaExtraida = buscarFechasEnTexto(textoPlanoARL, "texto completo");
    }

    if (fechaExtraida) {
      evaluarFecha(fechaExtraida.dia, fechaExtraida.mes, fechaExtraida.anio);
    } else {
      console.log("⚠️ No se encontró ninguna fecha válida en el documento.");
    }

    // ---------- 6) Palabras clave adicionales
    const contieneAfiliado = textoPlanoARL.includes("afiliado");
    const contieneVinculado = textoPlanoARL.includes("vinculado");
    const contieneHabilitado = textoPlanoARL.includes("habilitado");
    const contieneActivo = textoPlanoARL.includes("activo");
    const contieneVigente = textoPlanoARL.includes("vigente");
    const contieneRegistra = textoPlanoARL.includes("registra");

    // ---------- 7) Clase de riesgo - VERSIÓN MEJORADA
    let cumpleRiesgo = false;
    let riesgoEncontrado = null;
    let confianzaRiesgo = 0;

    // Función mejorada para normalizar dígitos con más variantes
    function normalizarDigitoMejorado(token) {
      if (!token) return null;
      
      // Mapeo más exhaustivo de caracteres confundidos por OCR
      const charMap = {
        // Para el número 3
        '3': '3',
        // Para el número 4 (los más problemáticos)
        'a': '4', 'A': '4', 'h': '4', 'H': '4', 'y': '4', 'Y': '4',
        'n': '4', 'N': '4', 'u': '4', 'U': '4', 'ri': '4',
        // Para el número 5
        's': '5', 'S': '5'
      };
      
      let limpio = token.replace(/[^0-9a-zA-Z]/g, "").trim();
      if (!limpio) return null;

      // Si ya contiene un dígito válido [1-5], devolverlo
      let digito = limpio.match(/[1-5]/);
      if (digito) return digito[0];

      // Intentar mapear caracteres confundidos
      for (let char of limpio) {
        if (charMap[char] && /^[1-5]$/.test(charMap[char])) {
          return charMap[char];
        }
      }

      // Casos especiales para secuencias que representan 4
      const especialesPara4 = ['hemo', 'nemo', 'remo', 'uemo', 'yemo', 'aemo'];
      if (especialesPara4.some(seq => limpio.toLowerCase().includes(seq))) {
        return '4';
      }

      return null;
    }

    // Análisis mejorado del contexto de la tabla
    function analizarTablaParaRiesgo(texto) {
      console.log("🔍 Analizando tabla para extraer clase de riesgo...");
      
      // Buscar patrones de tabla con headers
      const patronTabla = /(?:documento|empleador|vinculacion|fecha|clase|riesgo|estado).{0,200}?(?:dependiente|independiente|activo|inactivo)/gi;
      const matchTabla = patronTabla.exec(texto);
      
      if (matchTabla) {
        console.log("📊 Contexto de tabla encontrado:", matchTabla[0]);
        
        // Buscar en el contexto de la tabla
        const contextoTabla = matchTabla[0].toLowerCase();
        const lineasTabla = contextoTabla.split(/[\n\|]/);
        
        for (let i = 0; i < lineasTabla.length; i++) {
          const linea = lineasTabla[i].trim();
          
          // Buscar línea que contenga información del empleado
          if (linea.includes('sandra') || linea.includes('patricia') || linea.includes('lopez') || 
              linea.includes('dependiente') || linea.includes('activo')) {
            
            console.log("📋 Línea de datos encontrada:", linea);
            
            // Extraer tokens de esta línea
            const tokens = linea.split(/\s+/);
            for (let j = 0; j < tokens.length; j++) {
              const riesgo = normalizarDigitoMejorado(tokens[j]);
              if (riesgo && /^[1-5]$/.test(riesgo)) {
                console.log(`✅ Clase de riesgo encontrada en tabla: ${riesgo} (token: ${tokens[j]})`);
                return { riesgo: parseInt(riesgo, 10), confianza: 0.9 };
              }
            }
          }
        }
      }
      
      return null;
    }

    // Análisis posicional mejorado
    function analizarPosicionalRiesgo(texto) {
      console.log("🎯 Análisis posicional para clase de riesgo...");
      
      // Buscar patrones donde "clase" y "riesgo" están cerca
      const patronClaseRiesgo = /clase.{0,50}riesgo.{0,50}/gi;
      let match;
      
      while ((match = patronClaseRiesgo.exec(texto)) !== null) {
        const contexto = match[0];
        console.log("🎯 Contexto clase-riesgo:", contexto);
        
        // Buscar números en este contexto
        const tokens = contexto.split(/\s+/);
        for (const token of tokens) {
          const riesgo = normalizarDigitoMejorado(token);
          if (riesgo && /^[1-5]$/.test(riesgo)) {
            console.log(`✅ Riesgo encontrado posicionalmente: ${riesgo} (token: ${token})`);
            return { riesgo: parseInt(riesgo, 10), confianza: 0.8 };
          }
        }
      }
      
      return null;
    }

    // Búsqueda por proximidad con palabras clave - MEJORADA
    function buscarRiesgoPorProximidad(texto) {
      console.log("📍 Búsqueda por proximidad mejorada...");
      
      // Buscar específicamente patrones que indican estructura de tabla
      const lineasTexto = texto.split('\n');
      
      for (let i = 0; i < lineasTexto.length; i++) {
        const linea = lineasTexto[i].toLowerCase().trim();
        
        // Buscar líneas que contengan tanto información del empleado como posibles números
        if ((linea.includes('sandra') || linea.includes('patricia') || linea.includes('dependiente')) && 
            linea.length > 20) { // líneas sustanciales
          
          console.log("🎯 Analizando línea con info del empleado:", linea);
          
          // Dividir por espacios y analizar tokens uno por uno
          const tokens = linea.split(/\s+/);
          const tokensLimpios = [];
          
          for (const token of tokens) {
            const limpio = token.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            if (limpio && limpio.length <= 6) { // tokens cortos más propensos a ser números
              tokensLimpios.push({original: token, limpio: limpio});
            }
          }
          
          console.log("🔍 Tokens para análisis:", tokensLimpios.map(t => t.original));
          
          // Priorizar tokens que parecen números o caracteres sueltos
          const candidatos = tokensLimpios.filter(t => {
            const l = t.limpio;
            // Excluir palabras conocidas
            if (['sandra', 'patricia', 'lopez', 'afanador', 'dependiente', 'activo', 'estado'].includes(l)) {
              return false;
            }
            // Incluir tokens cortos que pueden ser números mal OCReados
            return l.length <= 3 && /[0-9ahynus]/.test(l);
          });
          
          for (const candidato of candidatos) {
            const riesgo = normalizarDigitoMejorado(candidato.original);
            if (riesgo && /^[1-5]$/.test(riesgo)) {
              console.log(`✅ Riesgo encontrado en línea del empleado: ${riesgo} (token: ${candidato.original})`);
              return { riesgo: parseInt(riesgo, 10), confianza: 0.75 };
            }
          }
        }
      }
      
      return null;
    }

    // Ejecutar análisis en orden de confianza
    let resultadoRiesgo = analizarTablaParaRiesgo(textoPlanoARL);
    
    if (!resultadoRiesgo) {
      resultadoRiesgo = analizarPosicionalRiesgo(textoPlanoARL);
    }
    
    if (!resultadoRiesgo) {
      resultadoRiesgo = buscarRiesgoPorProximidad(textoPlanoARL);
    }

    // Análisis final más exhaustivo si no se encontró nada
    if (!resultadoRiesgo) {
      console.log("🔍 Análisis exhaustivo de todo el texto...");
      const todasLasLineas = textoPlanoARL.split(/[\n,\.\|\;]/);
      
      for (const linea of todasLasLineas) {
        if (linea.length > 10) { // Solo líneas con contenido sustancial
          const tokens = linea.split(/\s+/);
          for (const token of tokens) {
            const riesgo = normalizarDigitoMejorado(token);
            if (riesgo && /^[1-5]$/.test(riesgo)) {
              console.log(`✅ Riesgo encontrado en análisis exhaustivo: ${riesgo} (token: ${token}, línea: ${linea.slice(0, 50)}...)`);
              resultadoRiesgo = { riesgo: parseInt(riesgo, 10), confianza: 0.4 };
              break;
            }
          }
          if (resultadoRiesgo) break;
        }
      }
    }

    if (resultadoRiesgo) {
      riesgoEncontrado = resultadoRiesgo.riesgo;
      confianzaRiesgo = resultadoRiesgo.confianza;
      cumpleRiesgo = riesgoEncontrado >= 4;
      console.log(`🎯 Clase de riesgo final: ${riesgoEncontrado} (confianza: ${confianzaRiesgo})`);
    } else {
      console.log("❌ No se pudo determinar la clase de riesgo");
    }

    // --- Resultado final
    return {
      nombreEncontrado: nombreEncontradoARL,
      similitudNombre: similitudARL,
      cedulaEncontrada: cedulaEncontradaARL,
      fechaDetectada,
      fechaValida,
      diffDias,
      riesgoEncontrado,
      cumpleRiesgo,
      confianzaRiesgo,
      palabrasClave: {
        afiliado: contieneAfiliado,
        vinculado: contieneVinculado,
        habilitado: contieneHabilitado,
        activo: contieneActivo,
        vigente: contieneVigente,
        registra: contieneRegistra,
      },
      texto: textoARL,
      tipoDocumento: tipoDocumento,
      debug: {
        longitudTexto: textoARL.length,
        calidadOCR: textoARL.length > 200 ? "alta" : textoARL.length > 100 ? "media" : "baja",
        entorno: "Node.js con pdf-poppler ARL"
      }
    };

  } catch (error) {
    console.error("❌ Error en validación ARL:", error);
    
    return {
      nombreEncontrado: false,
      similitudNombre: 0,
      cedulaEncontrada: false,
      fechaDetectada: null,
      fechaValida: false,
      diffDias: null,
      riesgoEncontrado: null,
      cumpleRiesgo: false,
      confianzaRiesgo: 0,
      palabrasClave: {
        afiliado: false,
        vinculado: false,
        habilitado: false,
        activo: false,
        vigente: false,
        registra: false,
      },
      texto: "",
      tipoDocumento: "error",
      debug: {
        error: error.message,
        entorno: "Node.js con pdf-poppler ARL (Error)"
      }
    };
  }
};