const _ = require("lodash");

// Cálculos pré-definidos disponíveis
const PRESET_CALCULATIONS = {
  margem_bruta: {
    name:        "Margem Bruta",
    description: "Receita menos Custo das Mercadorias Vendidas",
    formula:     "(receita - cmv) / receita * 100",
    unit:        "%",
    requiredFields: ["receita", "cmv"]
  },
  margem_liquida: {
    name:        "Margem Líquida",
    description: "Lucro Líquido / Receita Total",
    formula:     "(receita - custos_totais) / receita * 100",
    unit:        "%",
    requiredFields: ["receita", "custos_totais"]
  },
  icms_devido: {
    name:        "ICMS Devido",
    description: "Base de Cálculo × Alíquota ICMS",
    formula:     "base_calculo * (aliquota_icms / 100)",
    unit:        "BRL",
    requiredFields: ["base_calculo", "aliquota_icms"]
  },
  variacao_percentual: {
    name:        "Variação Percentual",
    description: "Variação entre período atual e anterior",
    formula:     "((atual - anterior) / anterior) * 100",
    unit:        "%",
    requiredFields: ["atual", "anterior"]
  },
  saldo_divergente: {
    name:        "Saldo Divergente",
    description: "Diferença entre dois valores",
    formula:     "valor_a - valor_b",
    unit:        "BRL",
    requiredFields: ["valor_a", "valor_b"]
  },
  total_tributos: {
    name:        "Total de Tributos",
    description: "Soma de todos os tributos",
    formula:     "icms + ipi + pis + cofins + iss",
    unit:        "BRL",
    requiredFields: ["icms", "ipi", "pis", "cofins", "iss"]
  },
  carga_tributaria: {
    name:        "Carga Tributária",
    description: "Total de tributos sobre valor do produto",
    formula:     "(total_tributos / valor_produto) * 100",
    unit:        "%",
    requiredFields: ["total_tributos", "valor_produto"]
  },
  soma_coluna: {
    name:        "Soma de Coluna",
    description: "Soma todos os valores de uma coluna",
    formula:     "SUM(column)",
    unit:        "BRL",
    requiredFields: ["column"]
  },
  media_coluna: {
    name:        "Média de Coluna",
    description: "Média aritmética de uma coluna",
    formula:     "AVG(column)",
    unit:        "",
    requiredFields: ["column"]
  }
};

/**
 * Executa uma lista de cálculos sobre os dados extraídos do documento.
 * @param {string[]} calculationIds — IDs de cálculos preset ou custom
 * @param {object}   data           — dados extraídos (financials, tables, fields)
 * @param {object[]} customCalcs    — cálculos customizados [{name, formula, variables}]
 */
function runCalculations(calculationIds = [], data = {}, customCalcs = []) {
  const results = [];

  // Executa cálculos pré-definidos
  for (const id of calculationIds) {
    const preset = PRESET_CALCULATIONS[id];
    if (!preset) {
      results.push({ id, name: id, status: "ERROR", error: `Cálculo "${id}" não encontrado.` });
      continue;
    }

    const result = executePreset(id, preset, data);
    results.push(result);
  }

  // Executa cálculos customizados
  for (const calc of customCalcs) {
    const result = executeCustom(calc, data);
    results.push(result);
  }

  // Resumo
  const successful = results.filter(r => r.status === "OK");
  const failed     = results.filter(r => r.status !== "OK");

  return {
    results,
    summary: {
      total:      results.length,
      successful: successful.length,
      failed:     failed.length,
      values:     Object.fromEntries(successful.map(r => [r.id || r.name, r.result]))
    }
  };
}

/** Executa um cálculo pré-definido */
function executePreset(id, preset, data) {
  // Extrai variáveis dos dados
  const vars = extractVariables(preset.requiredFields, data);

  // Verifica campos faltando
  const missing = preset.requiredFields.filter(f => vars[f] === null || vars[f] === undefined);
  if (missing.length > 0 && !["soma_coluna", "media_coluna"].includes(id)) {
    return {
      id,
      name:    preset.name,
      formula: preset.formula,
      unit:    preset.unit,
      status:  "MISSING_DATA",
      missing,
      error:   `Campos necessários não encontrados: ${missing.join(", ")}`
    };
  }

  let result = null;
  let steps  = [];

  try {
    switch (id) {
      case "margem_bruta": {
        const { receita, cmv } = vars;
        steps  = [`(${receita} - ${cmv}) / ${receita} × 100`];
        result = ((receita - cmv) / receita) * 100;
        break;
      }
      case "margem_liquida": {
        const { receita, custos_totais } = vars;
        steps  = [`(${receita} - ${custos_totais}) / ${receita} × 150`];
        result = ((receita - custos_totais) / receita) * 100;
        break;
      }
      case "icms_devido": {
        const { base_calculo, aliquota_icms } = vars;
        steps  = [`${base_calculo} × (${aliquota_icms} / 100)`];
        result = base_calculo * (aliquota_icms / 100);
        break;
      }
      case "variacao_percentual": {
        const { atual, anterior } = vars;
        steps  = [`((${atual} - ${anterior}) / ${anterior}) × 100`];
        result = ((atual - anterior) / anterior) * 100;
        break;
      }
      case "saldo_divergente": {
        const { valor_a, valor_b } = vars;
        steps  = [`${valor_a} - ${valor_b}`];
        result = valor_a - valor_b;
        break;
      }
      case "total_tributos": {
        const { icms = 0, ipi = 0, pis = 0, cofins = 0, iss = 0 } = vars;
        steps  = [`${icms} + ${ipi} + ${pis} + ${cofins} + ${iss}`];
        result = icms + ipi + pis + cofins + iss;
        break;
      }
      case "carga_tributaria": {
        const { total_tributos, valor_produto } = vars;
        steps  = [`(${total_tributos} / ${valor_produto}) × 100`];
        result = (total_tributos / valor_produto) * 100;
        break;
      }
      case "soma_coluna": {
        const values = extractColumnValues(vars.column, data);
        steps  = [`SUM de ${values.length} valores`];
        result = _.sum(values);
        break;
      }
      case "media_coluna": {
        const values = extractColumnValues(vars.column, data);
        steps  = [`AVG de ${values.length} valores`];
        result = _.mean(values);
        break;
      }
    }

    return {
      id,
      name:    preset.name,
      formula: preset.formula,
      unit:    preset.unit,
      vars,
      steps,
      result:  result !== null ? parseFloat(result.toFixed(4)) : null,
      formatted: formatResult(result, preset.unit),
      status:  "OK"
    };
  } catch (err) {
    return { id, name: preset.name, formula: preset.formula, unit: preset.unit, status: "ERROR", error: err.message };
  }
}

/** Executa cálculo customizado com fórmula em string */
function executeCustom(calc, data) {
  const { name, formula, variables = {} } = calc;

  // Substitui variáveis na fórmula
  let resolvedFormula = formula;
  const vars = { ...variables };

  // Tenta resolver variáveis dos dados
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === "string") {
      // É uma referência a um campo dos dados
      const resolved = resolveFieldPath(value, data);
      if (resolved !== null) vars[key] = resolved;
    }
  }

  let result = null;
  let steps  = [];

  try {
    // Substitui variáveis na fórmula
    let evalFormula = resolvedFormula;
    for (const [k, v] of Object.entries(vars)) {
      evalFormula = evalFormula.replace(new RegExp(`\\b${k}\\b`, "g"), v);
    }

    steps = [evalFormula];

    // Avalia expressão matemática de forma segura
    result = safeEval(evalFormula);

    return {
      id:        name,
      name,
      formula,
      resolvedFormula: evalFormula,
      vars,
      steps,
      result:    result !== null ? parseFloat(result.toFixed(4)) : null,
      formatted: formatResult(result, calc.unit || ""),
      status:    "OK"
    };
  } catch (err) {
    return { id: name, name, formula, status: "ERROR", error: err.message };
  }
}

/** Extrai variáveis dos dados do documento */
function extractVariables(fields, data) {
  const vars = {};
  const flat  = flattenData(data);

  for (const field of fields) {
    vars[field] = flat[field] ?? resolveFieldPath(field, data);
  }

  return vars;
}

/** Achata dados aninhados para busca por campo */
function flattenData(data, prefix = "") {
  const result = {};
  if (!data || typeof data !== "object") return result;

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenData(value, fullKey));
      // Também indexa a chave curta
      Object.assign(result, flattenData(value, key));
    } else if (typeof value === "number") {
      result[fullKey] = value;
      result[key]     = value; // atalho pela chave simples
    }
  }
  return result;
}

/** Resolve path de campo nos dados */
function resolveFieldPath(path, data) {
  const parts = path.split(".");
  let current = data;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    current = current[part];
  }
  return typeof current === "number" ? current : null;
}

/** Extrai valores numéricos de uma coluna de tabela */
function extractColumnValues(columnName, data) {
  const tables = data.tables || data.raw?.tables || [];
  for (const table of tables) {
    if (table.headers?.includes(columnName)) {
      return table.rows
        .map(r => parseFloat(String(r[columnName] || "").replace(/[^\d.,\-]/g, "").replace(",", ".")))
        .filter(v => !isNaN(v));
    }
  }
  return [];
}

/** Avaliação segura de expressão matemática */
function safeEval(expr) {
  // Permite apenas números, operadores, parênteses e ponto
  const clean = expr.replace(/\s/g, "");
  if (!/^[\d+\-*/().%\s]+$/.test(clean)) {
    throw new Error(`Fórmula inválida: "${expr}". Use apenas operações matemáticas básicas.`);
  }
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${clean})`)();
}

/** Formata resultado com unidade */
function formatResult(value, unit) {
  if (value === null || value === undefined) return "N/A";
  const n = parseFloat(value.toFixed(2));
  if (unit === "%")   return `${n.toFixed(2)}%`;
  if (unit === "BRL") return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  return String(n);
}

module.exports = { runCalculations, PRESET_CALCULATIONS };
