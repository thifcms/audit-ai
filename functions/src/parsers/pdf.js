const pdfParse = require("pdf-parse");

/** Tenta extrair tabela especializada do formato SOULMV repasse médico */
function extractSoulmvTable(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const rows = [];
  
  // Padrão de linha SOULMV:
  // Remessa Conta Atendimento Paciente CP Atividade Convênio Data Quant Qt.CH Vl.Repasse [asterisco]
  const soulmvRegex = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s+([A-Z0-9])\s+(CLINICO|CLÍNICO|CIRURGIAO|CIRURGIÃO|CIRURGICO|CIRÚRGICO|PRIMEIRO AUXILIAR|SEGUNDO AUXILIAR|TERCEIRO AUXILIAR|ANESTESISTA|INSTRUMENTADOR)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d+)\s+(\d+)\s+([\d.,]+)\s*(\*)?\s*$/i;
  
  // Padrão genérico de fallback para registrar atividades desconhecidas em log
  const soulmvGenericRegex = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s+([A-Z0-9])\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d+)\s+(\d+)\s+([\d.,]+)\s*(\*)?\s*$/i;

  for (const line of lines) {
    const match = line.match(soulmvRegex);
    if (match) {
      const remessa = match[1];
      const conta = match[2];
      const atendimento = match[3];
      const paciente = match[4].trim();
      const cp = match[5];
      const atividade = match[6].trim().toUpperCase();
      const convenio = match[7].trim();
      const data = match[8];
      const quant = match[9];
      const qtCh = match[10];
      const vlRepasse = match[11];
      const hasAsterisk = !!match[12];

      rows.push({
        "Remessa": remessa,
        "Conta": conta,
        "Atendimento": atendimento,
        "Paciente": paciente,
        "CP": cp,
        "Atividade": atividade,
        "Convênio": convenio,
        "Data": data,
        "Quant.": quant,
        "Qt.CH": qtCh,
        "Vl.Repasse": vlRepasse,
        "Status": hasAsterisk ? "Asterisco" : ""
      });
    } else if (line.match(soulmvGenericRegex)) {
      console.warn(`[SOULMV Parser] Linha ignorada por Atividade não reconhecida: "${line.trim()}"`);
    }
  }

  if (rows.length > 0) {
    return {
      sheetName: "Relatório SOULMV",
      headers: [
        "Remessa", "Conta", "Atendimento", "Paciente", "CP", "Atividade", 
        "Convênio", "Data", "Quant.", "Qt.CH", "Vl.Repasse", "Status"
      ],
      rows: rows
    };
  }

  return null;
}

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
  let tables = extractTablesFromText(rawText);

  // Se for um formato SOULMV, tenta extração especializada
  const soulmvTable = extractSoulmvTable(rawText);
  if (soulmvTable) {
    tables = [soulmvTable, ...tables];
    console.log(`[SOULMV Parser] Tabela SOULMV identificada e extraída com ${soulmvTable.rows.length} registros.`);
  }

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

module.exports = { parse, extractSoulmvTable };
