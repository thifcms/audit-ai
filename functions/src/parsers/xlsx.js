const XLSX = require("xlsx");

/**
 * Parser de planilhas Excel (xlsx, xls, xlsm).
 * Extrai todas as abas como tabelas independentes.
 */
async function parse(buffer, filename) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type:       "buffer",
      cellDates:  true,
      cellNF:     true,
      cellStyles: false
    });
  } catch (err) {
    throw Object.assign(
      new Error(`Falha ao ler planilha "${filename}": ${err.message}`),
      { code: "XLSX_PARSE_ERROR", status: 422 }
    );
  }

  const tables = [];
  const allFields = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    // Converte para JSON (primeira linha = headers)
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header:   1,
      defval:   "",
      blankrows: false
    });

    if (!rawRows || rawRows.length === 0) continue;

    // Primeira linha não vazia = headers
    const headerIdx = findHeaderRow(rawRows);
    const headers   = rawRows[headerIdx].map(h => String(h).trim()).filter(Boolean);
    const dataRows  = rawRows.slice(headerIdx + 1);

    const rows = dataRows
      .filter(r => r.some(cell => cell !== "" && cell !== null && cell !== undefined))
      .map(r => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = formatCellValue(r[i]);
        });
        return obj;
      });

    // Extrai campos numéricos para análise
    const numericFields = extractNumericSummary(rows, headers);

    tables.push({
      sheetName,
      headers,
      rows,
      summary: {
        totalRows:    rows.length,
        totalColumns: headers.length,
        numericFields
      }
    });

    // Agrega campos especiais
    Object.assign(allFields, extractFieldsFromSheet(rows, headers));
  }

  return {
    type: "xlsx",
    tables,
    fields: allFields,
    text:  tablesToText(tables),
    meta: {
      sheets:       workbook.SheetNames,
      totalSheets:  workbook.SheetNames.length,
      filename
    }
  };
}

/** Encontra a linha que parece ser o cabeçalho (mais texto, menos vazio) */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i];
    const hasText = row.filter(c => c !== "" && c !== null && isNaN(Number(c))).length;
    if (hasText >= 2) return i;
  }
  return 0;
}

/** Formata valores de células: datas, números, strings */
function formatCellValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : parseFloat(value.toFixed(4));
  }
  return String(value).trim();
}

/** Extrai sumário de colunas numéricas (soma, média, min, max) */
function extractNumericSummary(rows, headers) {
  const summary = {};
  for (const header of headers) {
    const values = rows
      .map(r => parseFloat(String(r[header]).replace(/[R$\s.,]/g, "").replace(",", ".")))
      .filter(v => !isNaN(v) && isFinite(v));

    if (values.length >= rows.length * 0.5) {
      const sum = values.reduce((a, b) => a + b, 0);
      summary[header] = {
        sum:   parseFloat(sum.toFixed(2)),
        avg:   parseFloat((sum / values.length).toFixed(2)),
        min:   Math.min(...values),
        max:   Math.max(...values),
        count: values.length
      };
    }
  }
  return summary;
}

/** Extrai campos especiais das linhas (CNPJ, datas, valores) */
function extractFieldsFromSheet(rows, headers) {
  const fields = {};
  const allText = rows.map(r => Object.values(r).join(" ")).join(" ");

  const cnpj = allText.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g);
  if (cnpj) fields.cnpj = [...new Set(cnpj)];

  const dates = allText.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/g);
  if (dates) fields.dates = [...new Set(dates)];

  return fields;
}

/** Converte tabelas para texto legível (para o engine de IA) */
function tablesToText(tables) {
  return tables.map(t =>
    `[Aba: ${t.sheetName}]\n` +
    t.headers.join(" | ") + "\n" +
    t.rows.map(r => t.headers.map(h => r[h] || "").join(" | ")).join("\n")
  ).join("\n\n");
}

module.exports = { parse };
