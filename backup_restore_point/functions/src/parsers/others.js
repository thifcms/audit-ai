// ── CSV / TSV ──────────────────────────────────────────────────────────────
const Papa = require("papaparse");

async function parseCsv(buffer, filename) {
  const text   = buffer.toString("utf-8");
  const isTab  = filename.endsWith(".tsv");
  const result = Papa.parse(text, {
    header:         true,
    skipEmptyLines: true,
    delimiter:      isTab ? "\t" : "",  // auto-detect se não for TSV
    dynamicTyping:  true,
    transformHeader: h => h.trim()
  });

  const rows    = result.data || [];
  const headers = result.meta?.fields || [];
  const fields  = {};

  const allText = rows.map(r => Object.values(r).join(" ")).join(" ");
  const cnpj    = allText.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g);
  if (cnpj) fields.cnpj = [...new Set(cnpj)];

  return {
    type: "csv",
    text,
    tables: [{
      sheetName: filename,
      headers,
      rows,
      summary: { totalRows: rows.length, totalColumns: headers.length, numericFields: {} }
    }],
    fields,
    meta: { delimiter: result.meta?.delimiter, encoding: "UTF-8" }
  };
}

// ── DOCX / TXT ────────────────────────────────────────────────────────────
const mammoth = require("mammoth");

async function parseDocx(buffer, filename) {
  let text = "";
  const isTxt = filename.endsWith(".txt");

  if (isTxt) {
    text = buffer.toString("utf-8");
  } else {
    try {
      const result = await mammoth.extractRawText({ buffer });
      text         = result.value || "";
    } catch (err) {
      throw Object.assign(
        new Error(`Falha ao ler DOCX "${filename}": ${err.message}`),
        { code: "DOCX_PARSE_ERROR", status: 422 }
      );
    }
  }

  // Extrai campos comuns
  const fields = {};
  const cnpj   = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g);
  if (cnpj) fields.cnpj = [...new Set(cnpj)];
  const dates  = text.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/g);
  if (dates) fields.dates = [...new Set(dates)];
  const values = text.match(/R\$\s*[\d.,]+/g);
  if (values) fields.monetaryValues = [...new Set(values)];

  return {
    type: isTxt ? "txt" : "docx",
    text,
    tables: [],
    fields,
    meta: { wordCount: text.split(/\s+/).filter(Boolean).length }
  };
}

// ── ZIP ───────────────────────────────────────────────────────────────────
const AdmZip   = require("adm-zip");

async function parseZip(buffer, filename) {
  const indexModule = require("./index");
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (err) {
    throw Object.assign(
      new Error(`Falha ao abrir ZIP "${filename}": ${err.message}`),
      { code: "ZIP_PARSE_ERROR", status: 422 }
    );
  }

  const entries  = zip.getEntries().filter(e => !e.isDirectory);
  const results  = [];
  const allTables = [];
  const allFields = {};

  for (const entry of entries) {
    try {
      const entryBuffer = entry.getData();
      const parsed      = await indexModule.parseDocument(entryBuffer, entry.entryName);
      results.push({ file: entry.entryName, ...parsed });
      allTables.push(...(parsed.tables || []));
      Object.assign(allFields, parsed.fields || {});
    } catch (err) {
      results.push({ file: entry.entryName, error: err.message });
    }
  }

  return {
    type:   "zip",
    text:   results.map(r => `[${r.file}]\n${r.text || ""}`).join("\n\n"),
    tables: allTables,
    fields: allFields,
    files:  results,
    meta:   { fileCount: entries.length, files: entries.map(e => e.entryName) }
  };
}

// ── JSON ──────────────────────────────────────────────────────────────────
async function parseJson(buffer, filename) {
  let data;
  try {
    data = JSON.parse(buffer.toString("utf-8"));
  } catch (err) {
    throw Object.assign(
      new Error(`JSON inválido em "${filename}": ${err.message}`),
      { code: "JSON_PARSE_ERROR", status: 422 }
    );
  }

  const tables = [];
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
    const headers = [...new Set(data.flatMap(r => Object.keys(r)))];
    tables.push({
      sheetName: filename,
      headers,
      rows: data,
      summary: { totalRows: data.length, totalColumns: headers.length, numericFields: {} }
    });
  }

  return {
    type:   "json",
    text:   JSON.stringify(data, null, 2),
    tables,
    fields: Array.isArray(data) ? {} : flattenObject(data),
    meta:   { isArray: Array.isArray(data), itemCount: Array.isArray(data) ? data.length : 1 }
  };
}

function flattenObject(obj, prefix = "", result = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenObject(v, key, result);
    else result[key] = v;
  }
  return result;
}

module.exports = {
  csv:  { parse: parseCsv },
  docx: { parse: parseDocx },
  zip:  { parse: parseZip },
  json: { parse: parseJson }
};
