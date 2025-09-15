// import sharp from "sharp";
// import Tesseract from "tesseract.js";

// // Recortar parte trasera (aprox en % de la imagen completa)
// async function extractBackPart(buffer) {
//   const metadata = await sharp(buffer).metadata();

//   // Recorte: parte inferior (50% hacia abajo)
//   const height = Math.floor(metadata.height / 2);
//   return await sharp(buffer)
//     .extract({ left: 0, top: height, width: metadata.width, height })
//     .grayscale()
//     .threshold(150)
//     .normalize()
//     .toBuffer();
// }

// export const validarLicencia = async (fileBuffer) => {
//   const backBuffer = await extractBackPart(fileBuffer);

//   const result = await Tesseract.recognize(backBuffer, "eng+spa", {
//     tessedit_pageseg_mode: 6,
//     tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-. ",
//   });

//   const texto = result.data.text || "";
//   console.log("🔍 OCR Parte trasera:", texto);

//   // Buscar categorías (C2 o C3, con fallback OCR 83→C3, 02→C2)
//   const categoriaRegex = /(C[23]|83|02)/gi;
//   const categorias = [];
//   let match;
//   while ((match = categoriaRegex.exec(texto)) !== null) {
//     let cat = match[0].toUpperCase();
//     if (cat === "83") cat = "C3";
//     if (cat === "02") cat = "C2";
//     categorias.push(cat);
//   // }

//   // Buscar fechas
//   const fechaRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/g;
//   const fechas = texto.match(fechaRegex) || [];

//   let fechaVigencia = null;
//   if (fechas.length > 0) {
//     const fechasParseadas = fechas.map((f) => {
//       const [d, m, y] = f.replace(/-/g, "/").split("/");
//       if (!y) return null;
//       const yyyy = y.length === 2 ? `20${y}` : y;
//       return new Date(`${yyyy}-${m}-${d}T00:00:00`);
//     }).filter(Boolean);

//     if (fechasParseadas.length > 0) {
//       fechaVigencia = new Date(Math.max(...fechasParseadas.map(f => f.getTime())));
//     }
//   }

//   return {
//     categorias,
//     fechaVigencia,
//     vigente: fechaVigencia ? fechaVigencia > new Date() : false,
//     textoOCR: texto,
//   };
// };
