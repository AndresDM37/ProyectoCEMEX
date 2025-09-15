import Tesseract from "tesseract.js";
import stringSimilarity from "string-similarity";

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9\s]/g, " ") // limpiar símbolos raros
    .replace(/\s+/g, " ")
    .trim();
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
    // === MÉTODO MÁS BÁSICO POSIBLE ===
    console.log("🔍 Ejecutando OCR con sintaxis mínima...");

    const result = await Tesseract.recognize(fileBufferCedula, "spa");

    let textoCedula = result.data.text || "";

    console.log("OCR Extraido: ", textoCedula);

    console.log("✅ OCR completado");
    console.log("📝 Longitud del texto:", textoCedula.length);
    console.log(
      "🔍 OCR bruto:",
      textoCedula.substring(0, 200) + (textoCedula.length > 200 ? "..." : "")
    );

    // Si el texto es muy corto, intentar con inglés también
    if (textoCedula.length < 10) {
      console.log("⚠️ Texto muy corto, intentando con inglés...");

      const result2 = await Tesseract.recognize(fileBufferCedula, "eng");

      const texto2 = result2.data.text || "";
      if (texto2.length > textoCedula.length) {
        textoCedula = texto2;
        console.log("✅ Inglés funcionó mejor");
        console.log(
          "🔍 Nuevo texto:",
          texto2.substring(0, 200) + (texto2.length > 200 ? "..." : "")
        );
      }
    }

    // Si aún es corto, intentar con idioma combinado
    if (textoCedula.length < 10) {
      console.log("⚠️ Aún muy corto, intentando con esp+eng...");

      const result3 = await Tesseract.recognize(fileBufferCedula, "spa+eng");

      const texto3 = result3.data.text || "";
      if (texto3.length > textoCedula.length) {
        textoCedula = texto3;
        console.log("✅ Idioma combinado funcionó mejor");
        console.log(
          "🔍 Nuevo texto:",
          texto3.substring(0, 200) + (texto3.length > 200 ? "..." : "")
        );
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
    const cedulaLimpia = (cedula || "").replace(/\D/g, ""); // quitar todo menos dígitos
    console.log("🎯 Buscando cédula:", cedulaLimpia);

    // Extraer números del OCR, pero normalizando puntos y comas
    let numerosEnTexto = (textoCedula.match(/[\d\.\,]+/g) || []).map(
      (n) => n.replace(/[\.,\s]/g, "") // quitar separadores
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
        if (similitud > 0.65) {
          cedulaEncontrada = true;
          mejorCoincidencia = numero;
          tipoCoincidencia = `fuzzy (${Math.round(similitud * 100)}%)`;
          break;
        }
      }
    }

    // 4. Coincidencia tolerando diferencia de longitud
    if (!cedulaEncontrada) {
      for (let numero of numerosLargos) {
        if (
          Math.abs(numero.length - cedulaLimpia.length) <= 2 &&
          numero.startsWith(cedulaLimpia.slice(0, 4))
        ) {
          cedulaEncontrada = true;
          mejorCoincidencia = numero;
          tipoCoincidencia = "longitud cercana con prefijo igual";
          break;
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

      // Búsqueda fuzzy
      const palabrasTexto = textoPlanoCedula.split(/\s+/);
      for (let palabraTexto of palabrasTexto) {
        if (palabraTexto.length >= 3) {
          const similitud = stringSimilarity.compareTwoStrings(
            palabra,
            palabraTexto
          );
          if (similitud > 0.6) {
            palabrasEncontradas.push({
              palabra,
              tipo: `fuzzy (${Math.round(similitud * 100)}%)`,
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
      },
      debug: {
        nombreEsperado,
        palabrasNombre,
        palabrasEncontradasDetalle: palabrasEncontradas,
        cedulaLimpia,
        numerosEncontrados: numerosLargos,
        mejorCoincidenciaCedula: mejorCoincidencia,
        tipoCoincidencia,
        longitudTextoOriginal: textoCedula.length,
        entorno: "Node.js Simple",
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
        edad: null,
        fechaNacimiento: null,
      },
      debug: {
        error: error.message,
        stack: error.stack,
        entorno: "Node.js Simple (Error)",
      },
    };
  }
};
