import Tesseract from "tesseract.js";
import { findBestMatch, compareTwoStrings } from "string-similarity";

export const validarPension = async (fileBuffer, nombreEsperado, cedulaLimpia) => {
  // --- OCR con configuración mejorada
  const resultPension = await Tesseract.recognize(fileBuffer, "spa", {
    tessedit_pageseg_mode: 6, // análisis semiautomático de líneas
  });
  const textoPension = (resultPension.data.text || "").replace(/\u00A0/g, " ");

  // console.log("🔍 OCR Pensión:", textoPension);

  // --- Normalizaciones previas
  const nombreEsperadoNorm = (nombreEsperado || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const cedulaEsperadaClean = (cedulaLimpia || "").replace(/\D/g, "");

  const textoPlanoPension = textoPension
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const textoForExtraction = textoPlanoPension
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // ---------- 1) Intentar extraer nombre por anclas
  let nombreCandidato = null;
  const anchorMatch = textoForExtraction.match(/\b(?:senor|senora|sr|sra)\b/);
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

  // ---------- 2) Sliding windows si no hubo candidato por ancla
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
  let nombreEncontradoPension = false;
  let similitudPension = 0;

  if (nombreCandidato) {
    similitudPension = compareTwoStrings(nombreEsperadoNorm, nombreCandidato);
    nombreEncontradoPension =
      similitudPension > 0.5 ||
      nombreEsperadoNorm.split(/\s+/).every(tok => nombreCandidato.includes(tok));
  } else if (bestCandidate) {
    similitudPension = bestRating;
    nombreEncontradoPension =
      bestRating > 0.55 ||
      nombreEsperadoNorm.split(/\s+/).every(tok => bestCandidate.includes(tok));
  } else {
    const allTokensInText = nombreEsperadoNorm.split(/\s+/).every(tok => textoForExtraction.includes(tok));
    nombreEncontradoPension = allTokensInText;
  }

  // ---------- 4) Validar cédula
  const cedulaRegex = /(\d{1,3}(?:\.\d{3}){1,2}|\d{7,12})/g;
  const matches = textoPension.match(cedulaRegex) || [];
  const posiblesCedulasPension = matches.map(m => m.replace(/\D/g, "")).filter(Boolean);
  const cedulaEncontradaPension = posiblesCedulasPension.includes(cedulaEsperadaClean);

  // ---------- 5) Validar fecha de expedición
  const keywords = [
    "expedicion", "expedida", "expedido", "expide",
    "generacion", "generado", "generada",
    "emision", "emitido", "emitida"
  ];
  const kwRegex = new RegExp(`\\b(${keywords.join("|")})\\b`);
  const kwMatch = kwRegex.exec(textoPlanoPension);

  const reNum = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/g;
  const reText =
  /(\d{1,2})\s*(?:de)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)\s*(?:de|del)?\s*(\d{2,4})/gi;


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
  }

  // --- Primero: buscar alrededor de la keyword
  if (kwMatch) {
    const start = kwMatch.index;
    const windowText = textoPlanoPension.slice(start, start + 240);
    const mNum = reNum.exec(windowText);
    const mText = reText.exec(windowText);
    if (mNum) {
      const parts = mNum[1].includes("/") ? mNum[1].split("/") : mNum[1].split("-");
      let dia = parseInt(parts[0], 10);
      let mes = parseInt(parts[1], 10) - 1;
      let anio = parts[2].length === 2 ? parseInt("20" + parts[2], 10) : parseInt(parts[2], 10);
      evaluarFecha(dia, mes, anio);
    } else if (mText) {
      let dia = parseInt(mText[1], 10);
      let mesNombre = mText[2].toLowerCase();
      let mesNum = monthMap[mesNombre] !== undefined ? monthMap[mesNombre] : null;
      let anioStr = (mText[3] || "").replace(/\D/g, "");
      let anio = anioStr.length === 2 ? parseInt("20" + anioStr, 10) : parseInt(anioStr, 10);
      if (mesNum !== null && !isNaN(anio)) {
        evaluarFecha(dia, mesNum, anio);
      }
    }
  }

  // --- Fallback: buscar en todo el texto si no hubo keyword o no detectó fecha
  if (!fechaDetectada) {
    const fechasNum = [...textoPlanoPension.matchAll(reNum)];
    const fechasTxt = [...textoPlanoPension.matchAll(reText)];
    const todasFechas = [
      ...fechasNum.map(m => m[1]),
      ...fechasTxt.map(m => m[0])
    ];
    if (todasFechas.length > 0) {
      const ultima = todasFechas[todasFechas.length - 1];
      let mNum = reNum.exec(ultima);
      let mText = reText.exec(ultima);
      if (mNum) {
        const parts = mNum[1].includes("/") ? mNum[1].split("/") : mNum[1].split("-");
        let dia = parseInt(parts[0], 10);
        let mes = parseInt(parts[1], 10) - 1;
        let anio = parts[2].length === 2 ? parseInt("20" + anio, 10) : parseInt(parts[2], 10);
        evaluarFecha(dia, mes, anio);
      } else if (mText) {
        let dia = parseInt(mText[1], 10);
        let mesNombre = mText[2].toLowerCase();
        let mesNum = monthMap[mesNombre] !== undefined ? monthMap[mesNombre] : null;
        let anioStr = (mText[3] || "").replace(/\D/g, "");
        let anio = anioStr.length === 2 ? parseInt("20" + anioStr, 10) : parseInt(anioStr, 10);
        if (mesNum !== null && !isNaN(anio)) {
          evaluarFecha(dia, mesNum, anio);
        }
      }
    }
  }

  // ---------- 6) Palabras clave adicionales
  const contieneAfiliado = textoPlanoPension.includes("afiliado");

  return {
    nombreEncontrado: nombreEncontradoPension,
    cedulaEncontrada: cedulaEncontradaPension,
    fechaDetectada,
    fechaValida,
    diffDias,
    palabrasClave: { afiliado: contieneAfiliado },
    texto: textoPension,
  };
};

// ============== NUEVAS FUNCIONES PARA VALIDAR DOCUMENTO PROTECCIÓN ==============

export const validarProteccion = async (fileBuffer, nombreEsperado, cedulaLimpia) => {
  // --- OCR con configuración optimizada para documentos Protección
  const resultProteccion = await Tesseract.recognize(fileBuffer, "spa", {
    tessedit_pageseg_mode: 6,
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,()/-: áéíóúñüÁÉÍÓÚÑÜ',
  });
  
  const textoProteccion = (resultProteccion.data.text || "").replace(/\u00A0/g, " ");
  
  // --- Normalizaciones
  const nombreEsperadoNorm = (nombreEsperado || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const cedulaEsperadaClean = (cedulaLimpia || "").replace(/\D/g, "");

  const textoPlanoProteccion = textoProteccion
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // ---------- VALIDACIÓN DE NOMBRE ----------
  const nombreEncontrado = validarNombreProteccion(textoPlanoProteccion, nombreEsperadoNorm);
  
  // ---------- VALIDACIÓN DE CÉDULA ----------
  const cedulaEncontrada = validarCedulaProteccion(textoProteccion, cedulaEsperadaClean);
  
  // ---------- VALIDACIÓN DE FECHA ----------
  const fechaInfo = validarFechaProteccion(textoPlanoProteccion);
  
  // ---------- VALIDACIONES ESPECÍFICAS PROTECCIÓN ----------
  const validacionesProteccion = validarEspecificosProteccion(textoPlanoProteccion);

  return {
    nombreEncontrado: nombreEncontrado.encontrado,
    similitudNombre: nombreEncontrado.similitud,
    cedulaEncontrada: cedulaEncontrada.encontrada,
    cedulasDetectadas: cedulaEncontrada.cedulasDetectadas,
    fechaDetectada: fechaInfo.fechaDetectada,
    fechaValida: fechaInfo.fechaValida,
    diffDias: fechaInfo.diffDias,
    esDocumentoProteccion: validacionesProteccion.esProteccion,
    tipoDocumento: validacionesProteccion.tipoDocumento,
    palabrasClave: validacionesProteccion.palabrasClave,
    texto: textoProteccion,
  };
};

// Función para validar nombre específicamente en documentos Protección
const validarNombreProteccion = (textoPlano, nombreEsperado) => {
  const textoForExtraction = textoPlano
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let nombreCandidato = null;
  let similitud = 0;

  // 1. Buscar después de patrones específicos de Protección
  const patrones = [
    /\b(?:senor|senora|sr|sra)\s*(?:a)?\s*/,
    /\b(?:identificado|identificada)\s*(?:a)?\s*/,
    /\bcon\s*cc\s*numero\s*/,
    /\bse\s*encuentra\s*afiliado\s*/
  ];

  for (const patron of patrones) {
    const match = textoForExtraction.match(patron);
    if (match) {
      const idx = textoForExtraction.indexOf(match[0]) + match[0].length;
      const after = textoForExtraction.slice(idx, idx + 200).trim();
      
      const stopWords = new Set([
        "identificado", "identificada", "con", "cc", "cedula", "numero", 
        "documento", "se", "encuentra", "afiliado", "afiliada", "a", "en",
        "pensiones", "obligatorias", "proteccion", "desde", "el", "dia"
      ]);
      
      const tokens = after.split(/\s+/);
      const nameTokens = [];
      
      for (const token of tokens) {
        if (stopWords.has(token) || /^\d+$/.test(token)) break;
        if (token.length > 1) {
          nameTokens.push(token);
        }
        if (nameTokens.length >= 6) break;
      }
      
      if (nameTokens.length >= 2) {
        nombreCandidato = nameTokens.join(" ");
        similitud = compareTwoStrings(nombreEsperado, nombreCandidato);
        if (similitud > 0.6) break;
      }
    }
  }

  // 2. Fallback con sliding windows si no encontró candidato fuerte
  if (!nombreCandidato || similitud < 0.6) {
    const words = textoForExtraction.split(/\s+/).filter(w => w.length > 1 && !/^\d+$/.test(w));
    const windows = [];
    
    for (let i = 0; i < words.length; i++) {
      for (let size = 2; size <= 5; size++) {
        if (i + size <= words.length) {
          windows.push(words.slice(i, i + size).join(" "));
        }
      }
    }
    
    if (nombreEsperado && windows.length > 0) {
      const bestMatch = findBestMatch(nombreEsperado, windows);
      if (bestMatch.bestMatch.rating > similitud) {
        nombreCandidato = bestMatch.bestMatch.target;
        similitud = bestMatch.bestMatch.rating;
      }
    }
  }

  // 3. Verificación final
  const encontrado = similitud > 0.55 || 
    (nombreEsperado && nombreEsperado.split(/\s+/).every(tok => 
      tok.length > 2 && textoForExtraction.includes(tok)
    ));

  return {
    encontrado,
    similitud,
    candidato: nombreCandidato
  };
};

// Función para validar cédula específicamente en documentos Protección
const validarCedulaProteccion = (texto, cedulaEsperada) => {
  // Patrones más específicos para Protección
  const patronesCedula = [
    /cc\s*numero\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{7,12})/gi,
    /cc\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{7,12})/gi,
    /cedula\s*(?:numero)?\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{7,12})/gi,
    /numero\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{7,12})/gi,
    /(\d{1,3}(?:\.\d{3}){2,3})/g, // Formato con puntos
    /(\d{8,12})/g // Números largos sin puntos
  ];

  const cedulasDetectadas = new Set();
  
  for (const patron of patronesCedula) {
    let match;
    while ((match = patron.exec(texto)) !== null) {
      const cedula = match[1] ? match[1].replace(/\D/g, "") : match[0].replace(/\D/g, "");
      if (cedula.length >= 7 && cedula.length <= 12) {
        cedulasDetectadas.add(cedula);
      }
    }
  }

  const cedulasArray = Array.from(cedulasDetectadas);
  const encontrada = cedulasArray.includes(cedulaEsperada);

  return {
    encontrada,
    cedulasDetectadas: cedulasArray
  };
};

// Función para validar fecha específicamente en documentos Protección
const validarFechaProteccion = (textoPlano) => {
  const keywordsProteccion = [
    "expedicion", "expedida", "expedido", "expide",
    "constancia", "se", "expide", "peticion",
    "interesado", "dia"
  ];

  const reNum = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g;
  const reText = /(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*de\s*(\d{4})/gi;
  
  const monthMap = {
    enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5,
    julio:6, agosto:7, septiembre:8, octubre:9, noviembre:10, diciembre:11
  };

  let fechaDetectada = null;
  let fechaValida = false;
  let diffDias = null;

  function evaluarFecha(dia, mes, anio) {
    if (String(anio).length === 2) anio = parseInt("20" + anio, 10);
    const fechaDoc = new Date(anio, mes, dia);
    const hoy = new Date();
    fechaDoc.setHours(0,0,0,0);
    hoy.setHours(0,0,0,0);
    diffDias = Math.floor((hoy - fechaDoc) / (1000 * 60 * 60 * 24));
    fechaValida = diffDias <= 30 && diffDias >= 0;
    fechaDetectada = `${String(dia).padStart(2,"0")}/${String(mes+1).padStart(2,"0")}/${anio}`;
  }

  // Buscar fechas cerca de keywords de expedición
  for (const keyword of keywordsProteccion) {
    const kwRegex = new RegExp(`\\b${keyword}\\b`, "i");
    const kwMatch = kwRegex.exec(textoPlano);
    
    if (kwMatch) {
      const start = Math.max(0, kwMatch.index - 50);
      const end = Math.min(textoPlano.length, kwMatch.index + 200);
      const windowText = textoPlano.slice(start, end);
      
      // Buscar fecha numérica
      let match = reNum.exec(windowText);
      if (match) {
        let dia = parseInt(match[1], 10);
        let mes = parseInt(match[2], 10) - 1;
        let anio = parseInt(match[3], 10);
        evaluarFecha(dia, mes, anio);
        if (fechaValida) break;
      }
      
      // Buscar fecha textual
      reText.lastIndex = 0;
      match = reText.exec(windowText);
      if (match) {
        let dia = parseInt(match[1], 10);
        let mesNombre = match[2].toLowerCase();
        let anio = parseInt(match[3], 10);
        let mesNum = monthMap[mesNombre];
        if (mesNum !== undefined) {
          evaluarFecha(dia, mesNum, anio);
          if (fechaValida) break;
        }
      }
    }
  }

  // Fallback: buscar la última fecha en el documento
  if (!fechaDetectada) {
    const todasFechas = [];
    
    let match;
    while ((match = reNum.exec(textoPlano)) !== null) {
      todasFechas.push({
        fecha: match[0],
        dia: parseInt(match[1], 10),
        mes: parseInt(match[2], 10) - 1,
        anio: parseInt(match[3], 10)
      });
    }
    
    reText.lastIndex = 0;
    while ((match = reText.exec(textoPlano)) !== null) {
      const mesNum = monthMap[match[2].toLowerCase()];
      if (mesNum !== undefined) {
        todasFechas.push({
          fecha: match[0],
          dia: parseInt(match[1], 10),
          mes: mesNum,
          anio: parseInt(match[3], 10)
        });
      }
    }
    
    if (todasFechas.length > 0) {
      const ultimaFecha = todasFechas[todasFechas.length - 1];
      evaluarFecha(ultimaFecha.dia, ultimaFecha.mes, ultimaFecha.anio);
    }
  }

  return {
    fechaDetectada,
    fechaValida,
    diffDias
  };
};

// Función para validaciones específicas de documentos Protección
const validarEspecificosProteccion = (textoPlano) => {
  const palabrasClaveProteccion = {
    proteccion: textoPlano.includes("proteccion"),
    fondoPensiones: textoPlano.includes("fondo") && textoPlano.includes("pensiones"),
    obligatorias: textoPlano.includes("obligatorias"),
    afiliado: textoPlano.includes("afiliado") || textoPlano.includes("afiliada"),
    constancia: textoPlano.includes("constancia"),
    nit: textoPlano.includes("nit"),
    expedicion: textoPlano.includes("expedicion") || textoPlano.includes("expide")
  };

  // Detectar si es documento de Protección
  const esProteccion = (
    palabrasClaveProteccion.proteccion ||
    (palabrasClaveProteccion.fondoPensiones && palabrasClaveProteccion.obligatorias)
  );

  // Determinar tipo de documento
  let tipoDocumento = "desconocido";
  if (esProteccion) {
    if (palabrasClaveProteccion.constancia) {
      tipoDocumento = "constancia_afiliacion";
    } else if (palabrasClaveProteccion.afiliado) {
      tipoDocumento = "certificado_pensiones";
    } else {
      tipoDocumento = "documento_proteccion";
    }
  }

  return {
    esProteccion,
    tipoDocumento,
    palabrasClave: palabrasClaveProteccion
  };
};

// Función wrapper para determinar automáticamente el tipo de documento
export const validarDocumentoPension = async (fileBuffer, nombreEsperado, cedulaLimpia) => {
  try {
    // Hacer OCR inicial rápido para detectar tipo
    const resultInicial = await Tesseract.recognize(fileBuffer, "spa", {
      tessedit_pageseg_mode: 6,
    });
    
    const textoInicial = (resultInicial.data.text || "").toLowerCase();
    
    // Detectar si es documento de Protección
    const esProteccion = textoInicial.includes("proteccion") || 
                        textoInicial.includes("fondo de pensiones obligatorias");
    
    if (esProteccion) {
      return await validarProteccion(fileBuffer, nombreEsperado, cedulaLimpia);
    } else {
      // Usar la función original para otros tipos
      return await validarPension(fileBuffer, nombreEsperado, cedulaLimpia);
    }
    
  } catch (error) {
    console.error("Error en validación de documento:", error);
    return {
      error: true,
      mensaje: "Error al procesar el documento",
      nombreEncontrado: false,
      cedulaEncontrada: false,
      fechaValida: false
    };
  }
};