const _ = require("lodash");

/**
 * Compara duas tabelas ou conjuntos de campos e retorna divergências.
 * Suporta comparação por: nome de coluna, posição ou chave informada.
 */
function compareTables(tableA, tableB, options = {}) {
  const {
    matchBy    = "column_name", // "column_name" | "position" | "key"
    keyField   = null,          // campo-chave para join (ex: "CNPJ", "Item")
    tolerance  = 0,             // tolerância numérica (ex: 0.01 para centavos)
    ignoreFields = []           // campos a ignorar na comparação
  } = options;

  const rowsA = normalizeTable(tableA);
  const rowsB = normalizeTable(tableB);

  if (matchBy === "key" && keyField) {
    return compareByKey(rowsA, rowsB, keyField, tolerance, ignoreFields);
  }

  if (matchBy === "position") {
    return compareByPosition(rowsA, rowsB, tolerance, ignoreFields);
  }

  // Default: compara por nome de coluna (acha colunas em comum)
  return compareByColumnName(rowsA, rowsB, tolerance, ignoreFields);
}

/** Compara tabelas alinhando por campo-chave (ex: número do item, CNPJ) */
function compareByKey(rowsA, rowsB, keyField, tolerance, ignoreFields) {
  const mapA = _.keyBy(rowsA, r => String(r[keyField] || "").trim());
  const mapB = _.keyBy(rowsB, r => String(r[keyField] || "").trim());

  const allKeys   = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])];
  const matches   = [];
  const divergences = [];
  const onlyInA  = [];
  const onlyInB  = [];

  for (const key of allKeys) {
    const rowA = mapA[key];
    const rowB = mapB[key];

    if (!rowA) { onlyInB.push({ key, row: rowB }); continue; }
    if (!rowB) { onlyInA.push({ key, row: rowA }); continue; }

    const diff = compareRows(rowA, rowB, tolerance, ignoreFields);
    if (diff.length === 0) {
      matches.push({ key });
    } else {
      divergences.push({ key, differences: diff });
    }
  }

  return buildComparisonResult(matches, divergences, onlyInA, onlyInB);
}

/** Compara linha a linha por posição */
function compareByPosition(rowsA, rowsB, tolerance, ignoreFields) {
  const maxLen    = Math.max(rowsA.length, rowsB.length);
  const matches   = [];
  const divergences = [];
  const onlyInA  = rowsA.slice(rowsB.length).map((row, i) => ({ key: `linha_${rowsB.length + i + 1}`, row }));
  const onlyInB  = rowsB.slice(rowsA.length).map((row, i) => ({ key: `linha_${rowsA.length + i + 1}`, row }));

  for (let i = 0; i < Math.min(rowsA.length, rowsB.length); i++) {
    const diff = compareRows(rowsA[i], rowsB[i], tolerance, ignoreFields);
    if (diff.length === 0) {
      matches.push({ key: `linha_${i + 1}` });
    } else {
      divergences.push({ key: `linha_${i + 1}`, differences: diff });
    }
  }

  return buildComparisonResult(matches, divergences, onlyInA, onlyInB);
}

/** Compara por nome de coluna, ignora colunas sem par */
function compareByColumnName(rowsA, rowsB, tolerance, ignoreFields) {
  if (rowsA.length === 0 || rowsB.length === 0) {
    return buildComparisonResult([], [], rowsA.map((r, i) => ({ key: `A_${i}`, row: r })), rowsB.map((r, i) => ({ key: `B_${i}`, row: r })));
  }

  const colsA = Object.keys(rowsA[0]);
  const colsB = Object.keys(rowsB[0]);

  // Encontra colunas em comum (case-insensitive)
  const commonCols = colsA.filter(c =>
    colsB.some(b => normalizeKey(b) === normalizeKey(c))
  );

  if (commonCols.length === 0) {
    return {
      matches: [], divergences: [],
      onlyInA: [], onlyInB: [],
      summary: {
        totalA: rowsA.length, totalB: rowsB.length,
        matched: 0, divergent: 0,
        conformityRate: 0,
        warning: "Nenhuma coluna em comum encontrada entre as tabelas."
      }
    };
  }

  // Rebuildas as linhas com apenas as colunas em comum
  const normalizedA = rowsA.map(r => pickNormalized(r, commonCols, colsA));
  const normalizedB = rowsB.map(r => pickNormalized(r, commonCols, colsB));

  return compareByPosition(normalizedA, normalizedB, tolerance, ignoreFields);
}

/** Compara dois objetos campo a campo */
function compareRows(rowA, rowB, tolerance, ignoreFields) {
  const differences = [];
  const allKeys     = [...new Set([...Object.keys(rowA), ...Object.keys(rowB)])];

  for (const key of allKeys) {
    if (ignoreFields.includes(key)) continue;

    const valA = rowA[key];
    const valB = rowB[key];

    if (!areEqual(valA, valB, tolerance)) {
      const numA = toNumber(valA);
      const numB = toNumber(valB);

      differences.push({
        field:    key,
        valueA:   valA,
        valueB:   valB,
        diff:     (numA !== null && numB !== null) ? parseFloat((numB - numA).toFixed(4)) : null,
        diffPct:  (numA !== null && numB !== null && numA !== 0)
                    ? parseFloat(((numB - numA) / Math.abs(numA) * 100).toFixed(2))
                    : null,
        type:     (numA !== null && numB !== null) ? "numeric" : "text"
      });
    }
  }

  return differences;
}

/** Verifica igualdade com tolerância numérica */
function areEqual(a, b, tolerance = 0) {
  if (a === b) return true;
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) {
    return Math.abs(na - nb) <= tolerance;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Tenta converter para número */
function toNumber(val) {
  if (val === null || val === undefined || val === "") return null;
  const str = String(val).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n   = parseFloat(str);
  return isNaN(n) ? null : n;
}

/** Normaliza chave para comparação case-insensitive */
function normalizeKey(key) {
  return String(key).toLowerCase().trim().replace(/[\s_\-]/g, "");
}

/** Pega campos de um objeto pelos nomes normalizados */
function pickNormalized(row, targetCols, sourceCols) {
  const result = {};
  for (const col of targetCols) {
    const srcCol = sourceCols.find(s => normalizeKey(s) === normalizeKey(col)) || col;
    result[col]  = row[srcCol];
  }
  return result;
}

/** Normaliza entrada de tabela (aceita array ou objeto com .rows) */
function normalizeTable(table) {
  if (Array.isArray(table)) return table;
  if (table?.rows) return table.rows;
  return [];
}

/** Monta resultado final da comparação */
function buildComparisonResult(matches, divergences, onlyInA, onlyInB) {
  const total       = matches.length + divergences.length;
  const conformity  = total > 0 ? parseFloat(((matches.length / total) * 100).toFixed(1)) : 100;

  // Sumário das divergências por campo
  const fieldSummary = {};
  for (const d of divergences) {
    for (const diff of d.differences) {
      if (!fieldSummary[diff.field]) fieldSummary[diff.field] = { count: 0, totalDiff: 0 };
      fieldSummary[diff.field].count++;
      if (diff.diff !== null) fieldSummary[diff.field].totalDiff += diff.diff;
    }
  }

  return {
    matches,
    divergences,
    onlyInA,
    onlyInB,
    fieldSummary,
    summary: {
      totalA:         matches.length + divergences.length + onlyInA.length,
      totalB:         matches.length + divergences.length + onlyInB.length,
      matched:        matches.length,
      divergent:      divergences.length,
      onlyInA:        onlyInA.length,
      onlyInB:        onlyInB.length,
      conformityRate: conformity,
      status:         conformity === 100 ? "OK" : conformity >= 80 ? "PARCIAL" : "DIVERGENTE"
    }
  };
}

/**
 * Compara campos de dois documentos (não tabelas, mas objetos planos).
 */
function compareFields(fieldsA, fieldsB, options = {}) {
  const { tolerance = 0, ignoreFields = [] } = options;
  const differences = compareRows(fieldsA, fieldsB, tolerance, ignoreFields);

  const matches = Object.keys(fieldsA).filter(k =>
    !differences.find(d => d.field === k) && !ignoreFields.includes(k)
  );

  return {
    matches: matches.map(k => ({ field: k, value: fieldsA[k] })),
    divergences: differences,
    summary: {
      totalFields: matches.length + differences.length,
      matched:     matches.length,
      divergent:   differences.length,
      conformityRate: parseFloat(((matches.length / (matches.length + differences.length)) * 100 || 100).toFixed(1)),
      status: differences.length === 0 ? "OK" : "DIVERGENTE"
    }
  };
}

module.exports = { compareTables, compareFields, compareRows };
