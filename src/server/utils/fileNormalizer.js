import fs from "fs/promises";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createRequire } from "module";
import { createCanvas } from "canvas";
import { pathToFileURL } from "url";

const require = createRequire(import.meta.url);
const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

// Desactivar worker en Node.js (usa null o URL válido)
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

/**
 * Convierte PDF o imagen a PNG lista para OCR
 */
export const normalizeToImage = async (filePath, mimetype) => {
  const tempDir = "./uploads/temp";
  await fs.mkdir(tempDir, { recursive: true });

  if (mimetype === "application/pdf") {
    console.log("🔍 Ejecutando OCR con sintaxis mínima...");
    const data = new Uint8Array(await fs.readFile(filePath));

    const pdf = await pdfjsLib.getDocument({ data }).promise;
    console.log(`✅ PDF cargado con ${pdf.numPages} páginas`);

    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });

    // Renderizar con node-canvas
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    await page.render({ canvasContext: context, viewport }).promise;

    // Guardar imagen temporal
    const filename = `pdf_${Date.now()}.png`;
    const outPath = path.join(tempDir, filename);
    await fs.writeFile(outPath, canvas.toBuffer("image/png"));

    return outPath;
  }

  // Caso: imagen directa (png/jpg/jpeg)
  const ext = mimetype.includes("png") ? "png" : "jpg";
  const filename = `temp_${Date.now()}.${ext}`;
  const outPath = path.join(tempDir, filename);

  const buffer = await fs.readFile(filePath);
  await fs.writeFile(outPath, buffer);

  return outPath;
};
