import Tesseract from "tesseract.js";
import pdf from "pdf-poppler";
import fs from "fs";
import path from "path";
import os from "os";

// Detectar si el buffer es un PDF
function isPDF(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer.toString("utf8", 0, 4).toUpperCase() === "%PDF";
}

// Convertir PDF a imagen usando pdf-poppler
async function convertPDFToImage(pdfBuffer) {
  const tempDir = os.tmpdir();
  const tempPDFPath = path.join(tempDir, `temp_licencia_${Date.now()}.pdf`);
  const outputDir = path.join(tempDir, `licencia_imgs_${Date.now()}`);

  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    fs.writeFileSync(tempPDFPath, pdfBuffer);

    const options = {
      format: "png",
      out_dir: outputDir,
      out_prefix: "licencia",
      page: 1,
      single_file: true,
      density: 300,
      size: "2000x2000",
    };

    await pdf.convert(tempPDFPath, options);

    const files = fs.readdirSync(outputDir);
    const imageFile = files.find((f) => f.endsWith(".png"));

    if (!imageFile) throw new Error("No se pudo generar la imagen del PDF");

    return fs.readFileSync(path.join(outputDir, imageFile));
  } catch (error) {
    throw new Error(`Error convirtiendo PDF Licencia: ${error.message}`);
  } finally {
    if (fs.existsSync(tempPDFPath)) fs.unlinkSync(tempPDFPath);
    if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

// Parsear fechas (dd/mm/yyyy o dd-mm-yyyy)
function parsearFecha(fechaTexto) {
  try {
    const partes = fechaTexto.replace(/[-.]/g, "/").split("/");
    if (partes.length < 3) return null;

    let [d, m, y] = partes;
    if (!y) return null;

    if (y.length === 2) y = `20${y}`;
    const fecha = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00`);

    const ahora = new Date();
    const hace10 = new Date(ahora.getFullYear() - 10, ahora.getMonth(), ahora.getDate());
    const en10 = new Date(ahora.getFullYear() + 10, ahora.getMonth(), ahora.getDate());

    return fecha >= hace10 && fecha <= en10 ? fecha : null;
  } catch {
    return null;
  }
}

// Validar licencia de conducción
export const validarLicencia = async (fileBuffer) => {
  try {
    let bufferParaOCR = fileBuffer;
    let tipoDocumento = "imagen";

    if (isPDF(fileBuffer)) {
      console.log("📄 PDF Licencia detectado, convirtiendo...");
      bufferParaOCR = await convertPDFToImage(fileBuffer);
      tipoDocumento = "pdf-convertido";
    }

    const ocrOptions = {
      tessedit_pageseg_mode: 6,
      tessedit_ocr_engine_mode: 1,
      preserve_interword_spaces: "1",
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(`OCR Licencia: ${Math.round(m.progress * 100)}%`);
        }
      },
    };

    let { data } = await Tesseract.recognize(bufferParaOCR, "spa", ocrOptions);
    let texto = data.text || "";

    if (texto.length < 50) {
      console.log("⚠️ OCR débil, probando eng+spa...");
      const retry = await Tesseract.recognize(bufferParaOCR, "eng+spa", ocrOptions);
      if ((retry.data.text || "").length > texto.length) texto = retry.data.text;
    }

    console.log("🔍 OCR resultado:", texto.slice(0, 200));

    const categorias = [];
    const fechasVigencia = [];
    const lineas = texto.split("\n");

    for (const linea of lineas) {
      const upper = linea.toUpperCase();

      if (/C[23]/.test(upper)) {
        const cats = upper.match(/C[23]/g);
        for (const cat of cats) {
          if (!categorias.includes(cat)) categorias.push(cat);

          const fechaMatch = linea.match(/(\d{2}[-/]\d{2}[-/]\d{2,4})/);
          if (fechaMatch) {
            const fecha = parsearFecha(fechaMatch[1]);
            if (fecha) {
              fechasVigencia.push({ categoria: cat, fechaTexto: fechaMatch[1], fecha });
            }
          }
        }
      }
    }

    if (fechasVigencia.length === 0 && categorias.length > 0) {
      const todas = texto.match(/\d{2}[-/]\d{2}[-/]\d{2,4}/g) || [];
      for (const ft of todas) {
        const fecha = parsearFecha(ft);
        if (fecha && fecha > new Date()) {
          fechasVigencia.push({ categoria: "GENERAL", fechaTexto: ft, fecha });
        }
      }
    }

    let fechaVigencia = null;
    if (fechasVigencia.length > 0) {
      fechaVigencia = new Date(Math.max(...fechasVigencia.map((f) => f.fecha.getTime())));
    }

    const tieneCategoriasRequeridas = categorias.some((c) => ["C2", "C3"].includes(c));
    const vigente = fechaVigencia ? fechaVigencia > new Date() : null;

    return {
      categorias: categorias.length > 0 ? categorias : null,
      tieneCategoriasRequeridas,
      fechaVigencia: fechaVigencia ? fechaVigencia.toISOString().split("T")[0] : null,
      vigente,
      diasParaVencimiento: fechaVigencia
        ? Math.ceil((fechaVigencia - new Date()) / (1000 * 60 * 60 * 24))
        : null,
      categoriasConFechas: fechasVigencia,
      textoOCR: texto,
      tipoDocumento,
      debug: {
        longitudTexto: texto.length,
        categoriasDetectadas: categorias,
        fechasDetectadas: fechasVigencia.map((f) => `${f.categoria}: ${f.fechaTexto}`),
        lineasAnalizadas: lineas.length,
        calidadOCR: texto.length > 100 ? "alta" : texto.length > 50 ? "media" : "baja",
      },
    };
  } catch (error) {
    console.error("❌ Error en validación de Licencia:", error.message);
    return {
      categorias: null,
      tieneCategoriasRequeridas: false,
      fechaVigencia: null,
      vigente: false,
      diasParaVencimiento: null,
      categoriasConFechas: [],
      textoOCR: "",
      tipoDocumento: "error",
      debug: { error: error.message },
    };
  }
};
