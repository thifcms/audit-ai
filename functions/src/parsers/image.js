const Tesseract = require("tesseract.js");
const sharp     = require("sharp");

/**
 * Parser de imagens (PNG, JPG, JPEG, BMP, WEBP, TIFF).
 * Usa Tesseract.js para OCR com pré-processamento via Sharp.
 */
async function parse(buffer, filename) {
  let processedBuffer;

  // Pré-processa a imagem para melhorar qualidade do OCR
  try {
    processedBuffer = await sharp(buffer)
      .resize({ width: 2000, withoutEnlargement: true }) // aumenta resolução
      .greyscale()                                        // converte para cinza
      .normalize()                                        // melhora contraste
      .sharpen()                                          // nitidez
      .png()
      .toBuffer();
  } catch (err) {
    console.warn("[ImageParser] Falha no pré-processamento, usando buffer original:", err.message);
    processedBuffer = buffer;
  }

  // OCR com suporte a português e inglês
  let ocrResult;
  try {
    ocrResult = await Tesseract.recognize(processedBuffer, "por+eng", {
      logger: () => {} // silencia logs internos
    });
  } catch (err) {
    throw Object.assign(
      new Error(`Falha no OCR da imagem "${filename}": ${err.message}`),
      { code: "OCR_ERROR", status: 422 }
    );
  }

  const rawText   = ocrResult.data.text || "";
  const words     = ocrResult.data.words || [];
  const confidence= ocrResult.data.confidence || 0;

  // Tenta extrair tabelas da estrutura de blocos do OCR
  const tables = extractTablesFromOCR(ocrResult.data);

  // Extrai campos comuns
  const fields = extractCommonFields(rawText);

  // Metadados da imagem
  let imageMeta = {};
  try {
    const sharpMeta = await sharp(buffer).metadata();
    imageMeta = {
      width:    sharpMeta.width,
      height:   sharpMeta.height,
      format:   sharpMeta.format,
      channels: sharpMeta.channels
    };
  } catch (_) {}

  return {
    type: "image",
    text: rawText,
    tables,
    fields,
    inlineData: {
      data: processedBuffer.toString("base64"),
      mimeType: "image/png"
    },
    meta: {
      confidence:    parseFloat(confidence.toFixed(1)),
      wordCount:     words.length,
      qualityScore:  getQualityScore(confidence, rawText),
      imageMeta,
      ocrLanguages:  ["por", "eng"]
    }
  };
}

/** Extrai tabelas a partir dos blocos de linha do Tesseract */
function extractTablesFromOCR(data) {
  if (!data.lines || data.lines.length < 3) return [];

  const tables = [];
  let currentBlock = [];

  for (const line of data.lines) {
    const words = line.words || [];
    if (words.length >= 2) {
      currentBlock.push(words.map(w => w.text.trim()).filter(Boolean));
    } else {
      if (currentBlock.length >= 2) {
        tables.push(buildTable(currentBlock));
      }
      currentBlock = [];
    }
  }

  if (currentBlock.length >= 2) {
    tables.push(buildTable(currentBlock));
  }

  return tables;
}

function buildTable(rows) {
  const headers = rows[0];
  const data    = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ""; });
    return obj;
  });
  return { headers, rows: data };
}

/** Extrai campos comuns do texto extraído por OCR */
function extractCommonFields(text) {
  const fields = {};

  const cnpj = text.match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[\-\s]?\d{2}/g);
  if (cnpj) fields.cnpj = [...new Set(cnpj)];

  const dates = text.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/g);
  if (dates) fields.dates = [...new Set(dates)];

  const values = text.match(/R\$\s*[\d.,]+/g);
  if (values) fields.monetaryValues = [...new Set(values)];

  const nfeKey = text.replace(/\s/g, "").match(/\d{44}/);
  if (nfeKey) fields.nfeKey = nfeKey[0];

  return fields;
}

/** Score de qualidade baseado em confiança e quantidade de texto */
function getQualityScore(confidence, text) {
  if (confidence > 85 && text.length > 100) return "alta";
  if (confidence > 60 && text.length > 30)  return "media";
  return "baixa";
}

module.exports = { parse };
