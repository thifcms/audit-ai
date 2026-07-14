const _ = require("lodash");

/**
 * Motor de Conciliação de Pacientes
 *
 * Compara:
 *   - Tabela de Pacientes (ex: planilha do convênio / secretaria)
 *   - Relatório do Hospital (ex: faturamento, TISS, SADT)
 *
 * Localiza cada paciente por número de atendimento E/OU nome,
 * e classifica cada um como: PAGO, PENDENTE, PARCIAL, NÃO ENCONTRADO, GLOSA.
 */

// ── STATUS POSSÍVEIS ─────────────────────────────────────────────────────────
const STATUS = {
  PAGO:           "PAGO",
  PENDENTE:       "PENDENTE",
  PARCIAL:        "PARCIAL",
  GLOSA:          "GLOSA",
  NAO_ENCONTRADO: "NÃO ENCONTRADO",
  DUPLICADO:      "DUPLICADO"
};

// ── CAMPOS QUE A IA TENTA DETECTAR AUTOMATICAMENTE ──────────────────────────
const FIELD_ALIASES = {
  // Número de atendimento
  numeroAtendimento: [
    "numero_atendimento", "num_atendimento", "atendimento", "nr_atendimento",
    "n_atendimento", "cod_atendimento", "codigo_atendimento", "id_atendimento",
    "numero atendimento", "nº atendimento", "atend", "attend", "admission",
    "internacao", "nr_internacao", "protocolo", "guia", "nr_guia",
    "numero_guia", "guia_atendimento", "numero guia", "id"
  ],
  // Nome do paciente
  nomePaciente: [
    "nome_paciente", "nome paciente", "paciente", "patient", "nome",
    "beneficiario", "beneficiário", "segurado", "titular", "name",
    "razao_social", "associado", "cliente"
  ],
  // Valor cobrado
  valorCobrado: [
    "valor_cobrado", "valor cobrado", "valor", "valor_total", "total",
    "valor_procedimento", "vl_cobrado", "vl_total", "amount", "value",
    "valor_faturado", "faturado", "vl_faturado", "preco", "preço"
  ],
  // Valor pago
  valorPago: [
    "valor_pago", "valor pago", "pago", "vl_pago", "paid", "valor_liberado",
    "liberado", "aprovado", "valor_aprovado", "vl_aprovado", "vl_liberado",
    "vl_repasse", "vl.repasse", "repasse", "valor_repasse", "vl repasse"
  ],
  // Status de pagamento
  statusPagamento: [
    "status", "situacao", "situação", "status_pagamento", "pagamento",
    "status_financeiro", "financeiro", "payment_status", "situacao_financeiro"
  ],
  // Data do atendimento
  dataAtendimento: [
    "data_atendimento", "data atendimento", "data", "date", "dt_atendimento",
    "data_internacao", "dt_internacao", "data_entrada", "admissao", "admissão"
  ],
  // Convênio / Plano
  convenio: [
    "convenio", "convênio", "plano", "operadora", "seguradora",
    "insurance", "plan", "health_plan", "plano_saude"
  ],
  // Procedimento
  procedimento: [
    "procedimento", "procedure", "servico", "serviço", "tuss",
    "codigo_procedimento", "cod_procedimento", "descricao", "descrição"
  ],
  // Número da guia / autorização
  numeroGuia: [
    "numero_guia", "nr_guia", "guia", "autorizacao", "autorização",
    "authorization", "numero_autorizacao", "nr_autorizacao"
  ]
};

/**
 * Função principal: reconcilia lista de pacientes com relatório do hospital.
 *
 * @param {object} tablePatients  — tabela de pacientes (do convênio / secretaria)
 * @param {object} tableHospital  — relatório do hospital (faturamento)
 * @param {object} options
 * @returns {PatientReconciliationResult}
 */
function reconcilePatients(tablePatients, tableHospital, options = {}) {
  const {
    matchByAtendimento = true,   // tenta match por número de atendimento
    matchByName        = true,   // tenta match por nome (fuzzy)
    nameSimilarity     = 0.75,   // threshold similaridade de nome (0-1)
    tolerance          = 0.01,   // tolerância de valor em R$ (centavos)
    currency           = "BRL"
  } = options;

  // 1. Normaliza as duas tabelas
  const patients  = normalizeTable(tablePatients);
  const hospital  = normalizeTable(tableHospital);

  // 2. Detecta os campos automaticamente em cada tabela
  const patientFields  = detectFields(patients[0] || {});
  const hospitalFields = detectFields(hospital[0] || {});

  // 3. Indexa hospital por número de atendimento e por nome
  const hospitalByAtend = buildIndex(hospital, hospitalFields.numeroAtendimento);
  const hospitalByName  = buildNameIndex(hospital, hospitalFields.nomePaciente);

  // 4. Processa cada paciente
  const results        = [];
  const matchedHospIds = new Set(); // controla duplicatas

  for (const patient of patients) {
    const result = processPatient(
      patient, patientFields,
      hospital, hospitalFields,
      hospitalByAtend, hospitalByName,
      matchedHospIds,
      { matchByAtendimento, matchByName, nameSimilarity, tolerance, currency }
    );
    results.push(result);
    if (result.hospitalRecord) matchedHospIds.add(result.hospitalRecord._rowIndex);
  }

  // 5. Pacientes no hospital que NÃO existem na lista de pacientes (extras)
  const notInPatientList = hospital
    .filter((_, i) => !matchedHospIds.has(i))
    .map(h => ({
      status:         STATUS.NAO_ENCONTRADO,
      source:         "hospital_only",
      numeroAtendimento: getValue(h, hospitalFields.numeroAtendimento),
      nomePaciente:   getValue(h, hospitalFields.nomePaciente),
      valorCobrado:   toNumber(getValue(h, hospitalFields.valorCobrado)),
      dataAtendimento:getValue(h, hospitalFields.dataAtendimento),
      observation:    "Consta no relatório do hospital mas não está na lista de pacientes",
      hospitalRecord: h
    }));

  // 6. Estatísticas
  const summary = buildSummary(results, notInPatientList, currency);

  return {
    detectedFields: { patients: patientFields, hospital: hospitalFields },
    results,
    notInPatientList,
    summary
  };
}

/** Processa um paciente individualmente */
function processPatient(
  patient, pFields,
  hospital, hFields,
  byAtend, byName,
  matchedIds,
  opts
) {
  const patAtend = normalizeAtendimento(getValue(patient, pFields.numeroAtendimento));
  const patName  = normalizeName(getValue(patient, pFields.nomePaciente));
  const patValue = toNumber(getValue(patient, pFields.valorCobrado));
  const patDate  = getValue(patient, pFields.dataAtendimento);
  const patGuia  = getValue(patient, pFields.numeroGuia);
  const patConv  = getValue(patient, pFields.convenio);
  const patProc  = getValue(patient, pFields.procedimento);

  let hospRecord   = null;
  let matchMethod  = null;
  let confidence   = 0;

  // ── Tentativa 1: match por número de atendimento (mais confiável) ────────
  if (opts.matchByAtendimento && patAtend) {
    const candidates = byAtend[patAtend] || [];
    if (candidates.length > 0) {
      hospRecord  = candidates[0];
      matchMethod = "numero_atendimento";
      confidence  = 1.0;
    }
  }

  // ── Tentativa 2: match por nome (fuzzy) ──────────────────────────────────
  if (!hospRecord && opts.matchByName && patName) {
    const nameMatch = findByName(patName, byName, opts.nameSimilarity, patDate);
    if (nameMatch) {
      hospRecord  = nameMatch.record;
      matchMethod = "nome_paciente";
      confidence  = nameMatch.score;
    }
  }

  // ── Paciente não encontrado ───────────────────────────────────────────────
  if (!hospRecord) {
    return {
      status:         STATUS.PENDENTE,
      matchMethod:    null,
      confidence:     0,
      numeroAtendimento: patAtend || getValue(patient, pFields.numeroAtendimento),
      nomePaciente:   patName   || getValue(patient, pFields.nomePaciente),
      valorCobrado:   patValue,
      valorPago:      null,
      diferenca:      patValue,
      dataAtendimento:patDate,
      guia:           patGuia,
      convenio:       patConv,
      procedimento:   patProc,
      observation:    "Paciente não encontrado no relatório do hospital",
      patientRecord:  patient,
      hospitalRecord: null
    };
  }

  // ── Detecta duplicata ─────────────────────────────────────────────────────
  if (matchedIds.has(hospRecord._rowIndex)) {
    return {
      status:         STATUS.DUPLICADO,
      matchMethod,
      confidence,
      numeroAtendimento: patAtend,
      nomePaciente:   patName,
      valorCobrado:   patValue,
      valorPago:      toNumber(getValue(hospRecord, hFields.valorPago)),
      diferenca:      null,
      dataAtendimento:patDate,
      observation:    "⚠️ Atenção: este atendimento já foi vinculado a outro paciente na lista",
      patientRecord:  patient,
      hospitalRecord: hospRecord
    };
  }

  // ── Determina status financeiro ───────────────────────────────────────────
  const hospStatus = getValue(hospRecord, hFields.statusPagamento);
  const hospPaid   = toNumber(getValue(hospRecord, hFields.valorPago));
  const hospBilled = toNumber(getValue(hospRecord, hFields.valorCobrado)) ?? patValue;

  const financialStatus = determineFinancialStatus(
    patValue, hospPaid, hospBilled, hospStatus, opts.tolerance
  );

  return {
    status:         financialStatus.status,
    matchMethod,
    confidence:     parseFloat(confidence.toFixed(2)),
    numeroAtendimento: patAtend || getValue(patient, pFields.numeroAtendimento),
    nomePaciente:   normalizeName(getValue(hospRecord, hFields.nomePaciente)) || patName,
    valorCobrado:   patValue   ?? hospBilled,
    valorPago:      hospPaid,
    diferenca:      financialStatus.diferenca,
    percentPago:    financialStatus.percentPago,
    dataAtendimento:patDate || getValue(hospRecord, hFields.dataAtendimento),
    guia:           patGuia  || getValue(hospRecord, hFields.numeroGuia),
    convenio:       patConv  || getValue(hospRecord, hFields.convenio),
    procedimento:   patProc  || getValue(hospRecord, hFields.procedimento),
    observation:    financialStatus.observation,
    patientRecord:  patient,
    hospitalRecord: hospRecord
  };
}

/** Determina status financeiro comparando valores */
function determineFinancialStatus(cobrado, pago, faturado, statusText, tolerance) {
  // Detecta status por texto primeiro (campo status do relatório)
  if (statusText) {
    const s = String(statusText).toLowerCase().trim();
    if (["pago", "quitado", "liquidado", "paid", "aprovado", "liberado"].some(k => s.includes(k))) {
      return { status: STATUS.PAGO, diferenca: 0, percentPago: 100, observation: "Pago conforme relatório do hospital" };
    }
    if (["glosa", "glosado", "negado", "negativo", "recusado", "denied"].some(k => s.includes(k))) {
      return { status: STATUS.GLOSA, diferenca: cobrado, percentPago: 0, observation: "Glosa registrada no relatório" };
    }
    if (["pendente", "aberto", "em_aberto", "aguardando", "pending", "open"].some(k => s.includes(k))) {
      return { status: STATUS.PENDENTE, diferenca: cobrado, percentPago: 0, observation: "Pendente conforme relatório do hospital" };
    }
    if (["parcial", "partial", "parcialmente"].some(k => s.includes(k))) {
      return { status: STATUS.PARCIAL, diferenca: cobrado - (pago ?? 0), percentPago: pago ? parseFloat(((pago / cobrado) * 100).toFixed(1)) : null, observation: "Pagamento parcial registrado" };
    }
  }

  // Determina por valores numéricos
  const ref = cobrado ?? faturado;

  if (pago === null || pago === undefined) {
    return { status: STATUS.PENDENTE, diferenca: ref, percentPago: 0, observation: "Sem valor pago registrado no relatório" };
  }
  if (pago <= tolerance) {
    return { status: STATUS.PENDENTE, diferenca: ref, percentPago: 0, observation: `Valor pago R$ ${pago?.toFixed(2)} — considerado não pago` };
  }
  if (ref && Math.abs(pago - ref) <= tolerance) {
    return { status: STATUS.PAGO, diferenca: 0, percentPago: 100, observation: "Valor pago confere com valor cobrado" };
  }
  if (ref && pago > 0 && pago < ref - tolerance) {
    const diff = parseFloat((ref - pago).toFixed(2));
    const pct  = parseFloat(((pago / ref) * 100).toFixed(1));
    return { status: STATUS.PARCIAL, diferenca: diff, percentPago: pct, observation: `Pago R$ ${pago?.toFixed(2)} de R$ ${ref?.toFixed(2)} — faltam R$ ${diff?.toFixed(2)}` };
  }
  if (ref && pago > ref + tolerance) {
    return { status: STATUS.PAGO, diferenca: parseFloat((pago - ref).toFixed(2)) * -1, percentPago: 100, observation: `⚠️ Valor pago R$ ${pago?.toFixed(2)} excede o cobrado R$ ${ref?.toFixed(2)}` };
  }

  return { status: STATUS.PENDENTE, diferenca: ref, percentPago: 0, observation: "Status não determinado — verificar manualmente" };
}

// ── DETECÇÃO AUTOMÁTICA DE CAMPOS ────────────────────────────────────────────

/** Detecta quais colunas correspondem a cada campo-chave */
function detectFields(sampleRow) {
  const cols    = Object.keys(sampleRow || {});
  const detected = {};

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    detected[field] = findColumn(cols, aliases);
  }

  return detected;
}

/** Encontra coluna pelo nome (case-insensitive, sem acentos) */
function findColumn(columns, aliases) {
  for (const col of columns) {
    const norm = normalizeKey(col);
    for (const alias of aliases) {
      if (norm === normalizeKey(alias) || norm.includes(normalizeKey(alias))) {
        return col;
      }
    }
  }
  return null;
}

// ── INDEXAÇÃO ────────────────────────────────────────────────────────────────

function buildIndex(rows, field) {
  const index = {};
  if (!field) return index;
  rows.forEach((row, i) => {
    const key = normalizeAtendimento(row[field]);
    if (key) {
      if (!index[key]) index[key] = [];
      index[key].push({ ...row, _rowIndex: i });
    }
  });
  return index;
}

function buildNameIndex(rows, field) {
  if (!field) return [];
  return rows.map((row, i) => ({
    name:      normalizeName(row[field]),
    record:    { ...row, _rowIndex: i },
    original:  row[field]
  })).filter(r => r.name);
}

/** Busca paciente por nome com similaridade fuzzy */
function findByName(targetName, nameIndex, threshold, targetDate) {
  let best = null;
  let bestScore = 0;

  for (const entry of nameIndex) {
    let score = nameSimilarity(targetName, entry.name);

    // Bonus se a data também bate
    if (targetDate && entry.record._date === targetDate) score = Math.min(1, score + 0.1);

    if (score >= threshold && score > bestScore) {
      bestScore = score;
      best      = entry;
    }
  }

  return best ? { record: best.record, score: bestScore } : null;
}

// ── SIMILARIDADE DE NOMES ────────────────────────────────────────────────────

/** Calcula similaridade entre dois nomes (0-1) usando tokens + Jaro-Winkler simplificado */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b)  return 1;

  // Token-based: divide em palavras, compara interseção
  const tokA = a.split(/\s+/).filter(t => t.length > 2);
  const tokB = b.split(/\s+/).filter(t => t.length > 2);

  if (tokA.length === 0 || tokB.length === 0) return 0;

  const inter = tokA.filter(t => tokB.some(tb => tb === t || tb.startsWith(t) || t.startsWith(tb)));
  const tokenScore = (2 * inter.length) / (tokA.length + tokB.length);

  // Char-level: Sørensen–Dice em bigramas
  const diceScore = diceSimilarity(a, b);

  return Math.max(tokenScore, diceScore);
}

function diceSimilarity(a, b) {
  const bigrams = s => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(a), bb = bigrams(b);
  let inter = 0;
  for (const g of ba) if (bb.has(g)) inter++;
  return (2 * inter) / (ba.size + bb.size) || 0;
}

// ── NORMALIZAÇÃO ─────────────────────────────────────────────────────────────

function normalizeTable(table) {
  if (Array.isArray(table)) return table;
  if (table?.rows)   return table.rows;
  if (table?.data)   return table.data;
  return [];
}

function normalizeKey(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_.\/]+/g, "_")
    .trim();
}

function normalizeName(str) {
  if (!str) return null;
  return String(str)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAtendimento(val) {
  if (!val) return null;
  return String(val).replace(/\D/g, "").trim() || String(val).trim();
}

function getValue(row, field) {
  if (!field || !row) return null;
  return row[field] ?? null;
}

function toNumber(val) {
  if (val === null || val === undefined || val === "") return null;
  const str = String(val).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n   = parseFloat(str);
  return isNaN(n) ? null : n;
}

// ── SUMÁRIO ──────────────────────────────────────────────────────────────────

function buildSummary(results, extras, currency) {
  const byStatus = _.groupBy(results, "status");

  const totalCobrado  = _.sumBy(results, r => r.valorCobrado ?? 0);
  const totalPago     = _.sumBy(results, r => r.valorPago    ?? 0);
  const totalPendente = _.sumBy(
    results.filter(r => r.status === STATUS.PENDENTE || r.status === STATUS.PARCIAL),
    r => r.diferenca ?? r.valorCobrado ?? 0
  );
  const totalGlosa = _.sumBy(
    results.filter(r => r.status === STATUS.GLOSA),
    r => r.valorCobrado ?? 0
  );

  return {
    totalPacientes:    results.length,
    pagos:            (byStatus[STATUS.PAGO]           || []).length,
    pendentes:        (byStatus[STATUS.PENDENTE]        || []).length,
    parciais:         (byStatus[STATUS.PARCIAL]         || []).length,
    glosas:           (byStatus[STATUS.GLOSA]           || []).length,
    naoEncontrados:   (byStatus[STATUS.NAO_ENCONTRADO]  || []).length,
    duplicados:       (byStatus[STATUS.DUPLICADO]       || []).length,
    extrasNoHospital: extras.length,

    financeiro: {
      currency,
      totalCobrado:    parseFloat(totalCobrado.toFixed(2)),
      totalPago:       parseFloat(totalPago.toFixed(2)),
      totalPendente:   parseFloat(totalPendente.toFixed(2)),
      totalGlosa:      parseFloat(totalGlosa.toFixed(2)),
      taxaRecebimento: totalCobrado > 0
        ? parseFloat(((totalPago / totalCobrado) * 100).toFixed(1))
        : 0
    },

    conformidade: results.length > 0
      ? parseFloat((((byStatus[STATUS.PAGO] || []).length / results.length) * 100).toFixed(1))
      : 0,

    status: (byStatus[STATUS.PENDENTE]?.length || 0) === 0 &&
            (byStatus[STATUS.GLOSA]?.length    || 0) === 0
      ? "OK" : "REQUER_ATENÇÃO"
  };
}

module.exports = { reconcilePatients, STATUS, detectFields, FIELD_ALIASES };
