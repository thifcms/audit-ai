const path = require("path");

const pdfParser   = require("./pdf");
const xlsxParser  = require("./xlsx");
const imageParser = require("./image");
const xmlParser   = require("./xml");
const csvParser   = require("./csv");
const docxParser  = require("./docx");
const zipParser   = require("./zip");
const jsonParser  = require("./json");

// Mapa de extensão → parser
const PARSERS = {
  ".pdf":  pdfParser,
  ".xlsx": xlsxParser,
  ".xls":  xlsxParser,
  ".xlsm": xlsxParser,
  ".csv":  csvParser,
  ".tsv":  csvParser,
  ".png":  imageParser,
  ".jpg":  imageParser,
  ".jpeg": imageParser,
  ".webp": imageParser,
  ".bmp":  imageParser,
  ".tiff": imageParser,
  ".tif":  imageParser,
  ".xml":  xmlParser,
  ".nfe":  xmlParser,
  ".docx": docxParser,
  ".doc":  docxParser,
  ".txt":  docxParser,
  ".zip":  zipParser,
  ".json": jsonParser
};

// Mapa de MIME type → extensão
const MIME_MAP = {
  "application/pdf":                                                    ".pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel":                                           ".xls",
  "text/csv":                                                            ".csv",
  "text/plain":                                                          ".txt",
  "image/png":                                                           ".png",
  "image/jpeg":                                                          ".jpg",
  "image/webp":                                                          ".webp",
  "image/bmp":                                                           ".bmp",
  "image/tiff":                                                          ".tiff",
  "application/xml":                                                     ".xml",
  "text/xml":                                                            ".xml",
  "application/zip":                                                     ".zip",
  "application/json":                                                    ".json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx"
};

/**
 * Parser universal: detecta formato e extrai dados.
 * @param {Buffer} buffer  — conteúdo do arquivo
 * @param {string} filename — nome original (para pegar extensão)
 * @param {string} mimeType — MIME type (fallback)
 * @returns {Promise<ParsedDocument>}
 */
async function parseDocument(buffer, filename = "", mimeType = "") {
  // 1. Tenta pela extensão do nome do arquivo
  let ext = path.extname(filename).toLowerCase();

  // 2. Fallback para MIME type
  if (!ext || !PARSERS[ext]) {
    ext = MIME_MAP[mimeType] || detectFromBuffer(buffer);
  }

  const parser = PARSERS[ext];

  if (!parser) {
    throw Object.assign(
      new Error(`Formato não suportado: ${ext || mimeType || "desconhecido"}`),
      { code: "UNSUPPORTED_FORMAT", status: 422 }
    );
  }

  const startTime = Date.now();
  const result    = await parser.parse(buffer, filename);

  return {
    ...result,
    meta: {
      ...result.meta,
      filename,
      format:      ext.replace(".", "").toUpperCase(),
      parsedIn:    Date.now() - startTime,
      parserVersion: "1.0.0"
    }
  };
}

/** Detecta formato pelos primeiros bytes (magic numbers) */
function detectFromBuffer(buffer) {
  if (!buffer || buffer.length < 4) return null;

  const hex = buffer.slice(0, 4).toString("hex");
  const txt = buffer.slice(0, 5).toString("ascii");

  if (hex.startsWith("25504446"))  return ".pdf";   // %PDF
  if (hex.startsWith("504b0304"))  return ".zip";   // PK.. (zip/xlsx/docx)
  if (hex.startsWith("ffd8ff"))    return ".jpg";
  if (hex.startsWith("89504e47")) return ".png";
  if (txt.startsWith("<?xml") || txt.startsWith("<NFe")) return ".xml";
  if (txt.startsWith("{") || txt.startsWith("["))  return ".json";

  // Xlsx/Docx são zips com estrutura interna — verificar depois do zip check
  return ".txt";
}

module.exports = { parseDocument, PARSERS, MIME_MAP };
