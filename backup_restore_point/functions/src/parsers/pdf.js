const pdfParse = require("pdf-parse");

/**
 * Parser de PDF.
 * Extrai texto bruto, número de páginas e metadados.
 */
async function parse(buffer, filename) {
  let data;
  try {
    data = await pdfParse(buffer);
  } catch (err) {
    throw Object.assign(
      new Error(`Falha ao ler PDF "${filename}": ${err.message}`),
      { code: "PDF_PARSE_ERROR", status: 422 }
    );
  }

  const rawText = data.text || "";

  // Extrai tabelas simples (linhas com separadores consistentes)
  const tables = extractTablesFromText(rawText);

  // Extrai campos comuns de documentos fiscais
  const fields = extractCommonFields(rawText);

  return {
    type:   "pdf",
    text:   rawText,
    tables,
    fields,
    meta: {
      pages:    data.numpages,
      info:     data.info,
      hasText:  rawText.trim().length > 0,
      isScanned: rawText.trim().length < 50 && data.numpages > 0
    }
  };
}

/** Tenta extrair tabelas de texto com espaçamento tabular */
function extractTablesFromText(text) {
  const tables = [];
  const lines  = text.split("\n").filter(l => l.trim());

  let currentTable = [];
  let inTable      = false;

  for (const line of lines) {
    // Heurística: linha com 2+ colunas separadas por >=2 espaços ou tabs
    const cols = line.trim().split(/\s{2,}|\t/).filter(Boolean);
    if (cols.length >= 2) {
      currentTable.push(cols);
      inTable = true;
    } else {
      if (inTable && currentTable.length >= 2) {
        tables.push(buildTable(currentTable));
      }
      currentTable = [];
      inTable      = false;
    }
  }

  if (inTable && currentTable.length >= 2) {
    tables.push(buildTable(currentTable));
  }

  return tables;
}

/** Converte array de linhas em objeto de tabela com header */
function buildTable(rows) {
  const headers = rows[0];
  const data    = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ""; });
    return obj;
  });
  return { headers, rows: data };
}

/** Extrai campos comuns: CNPJ, CPF, datas, valores, chave NFe etc. */
function extractCommonFields(text) {
  const fields = {};

  // CNPJ
  const cnpjMatch = text.match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[\-\s]?\d{2}/g);
  if (cnpjMatch) fields.cnpj = [...new Set(cnpjMatch)];

  // CPF
  const cpfMatch = text.match(/\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\s]?\d{2}/g);
  if (cpfMatch) fields.cpf = [...new Set(cpfMatch)];

  // Datas dd/mm/aaaa ou aaaa-mm-dd
  const dateMatch = text.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}/g);
  if (dateMatch) fields.dates = [...new Set(dateMatch)];

  // Valores monetários R$
  const valueMatch = text.match(/R\$\s*[\d.,]+/g);
  if (valueMatch) fields.monetaryValues = [...new Set(valueMatch)];

  // Chave de acesso NFe (44 dígitos)
  const nfeKey = text.match(/\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}/);
  if (nfeKey) fields.nfeKey = nfeKey[0].replace(/\s/g, "");

  // Números de documento (NF, pedido, etc.)
  const docNum = text.match(/(?:N[°º\.ú]\s*|NF[- ]?|N[uú]m(?:ero)?[\s:]*)\d{1,10}/gi);
  if (docNum) fields.documentNumbers = [...new Set(docNum)];

  // ICMS, IPI, PIS, COFINS
  ["ICMS", "IPI", "PIS", "COFINS", "ISS"].forEach(tax => {
    const m = text.match(new RegExp(`${tax}[:\\s]+R?\\$?\\s*[\\d.,]+`, "gi"));
    if (m) fields[tax.toLowerCase()] = m[0];
  });

  return fields;
}

module.exports = { parse };
