const express = require("express");
const admin = require("firebase-admin");
const { getDB, serverTimestamp } = require("../utils/db");
const { v4: uuidv4 }       = require("uuid");
const { upload }           = require("../utils/upload");
const { saveToStorage }    = require("../utils/storage");
const { parseDocument }    = require("../parsers");
const { analyzeDocument }  = require("../engine/analyzer");
const { compareTables, compareFields } = require("../engine/comparator");
const { runCalculations }  = require("../engine/calculator");

const router = express.Router();

/**
 * POST /audit
 * Pipeline completo: lê, compara, calcula e retorna auditoria em uma chamada.
 *
 * multipart/form-data:
 *   files[]       — 1 ou mais arquivos
 *   calculations  — JSON array de IDs de cálculos
 *   customCalcs   — JSON array de cálculos customizados
 *   rules         — JSON array de regras de validação customizadas
 *   matchBy       — método de comparação (quando 2+ arquivos)
 *   keyField      — campo chave (quando matchBy=key)
 *   tolerance     — tolerância numérica
 *   outputFormat  — "json" (padrão) | "summary"
 *   saveFiles     — "true"|"false"
 */
router.post("/", upload.array("files", 20), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error:   "Envie ao menos um arquivo no campo 'files[]'.",
        code:    "NO_FILES"
      });
    }

    const { appId } = req.appContext;
    const auditId   = uuidv4();
    const startTime = Date.now();

    const {
      matchBy    = "column_name",
      keyField   = null,
      tolerance  = "0",
      saveFiles  = "true",
      outputFormat = "json"
    } = req.body;

    let calculations = [];
    let customCalcs  = [];
    let rules        = [];
    try { calculations = JSON.parse(req.body.calculations || "[]"); } catch (_) {}
    try { customCalcs  = JSON.parse(req.body.customCalcs  || "[]"); } catch (_) {}
    try { rules        = JSON.parse(req.body.rules        || "[]"); } catch (_) {}

    // ── FASE 1: Parse e análise de todos os documentos ───────────────
    const parsedDocs = await Promise.all(
      files.map(f => parseDocument(f.buffer, f.originalname, f.mimetype))
    );

    const analyses = await Promise.all(
      parsedDocs.map(p => analyzeDocument(p, { appId, useAI: true }))
    );

    // ── FASE 2: Comparações (quando 2+ arquivos) ──────────────────────
    let comparisons = [];
    if (files.length >= 2) {
      for (let i = 1; i < parsedDocs.length; i++) {
        const tableA = parsedDocs[0].tables?.[0];
        const tableB = parsedDocs[i].tables?.[0];

        const tableComp = (tableA && tableB)
          ? compareTables(tableA, tableB, {
              matchBy,
              keyField: keyField || null,
              tolerance: parseFloat(tolerance) || 0
            })
          : null;

        const fieldComp = compareFields(
          analyses[0].analysis.financials || {},
          analyses[i].analysis.financials || {},
          { tolerance: parseFloat(tolerance) || 0 }
        );

        comparisons.push({
          between:        [files[0].originalname, files[i].originalname],
          tableComparison: tableComp,
          fieldComparison: fieldComp,
          status: (
            (!tableComp || tableComp.summary.status === "OK") &&
            fieldComp.summary.status === "OK"
          ) ? "OK" : "DIVERGENTE"
        });
      }
    }

    // ── FASE 3: Cálculos ──────────────────────────────────────────────
    let calcResults = null;
    if (calculations.length > 0 || customCalcs.length > 0) {
      // Usa dados do primeiro documento como base
      const baseData = {
        ...analyses[0].analysis,
        tables: parsedDocs[0].tables,
        raw:    analyses[0].raw
      };
      calcResults = runCalculations(calculations, baseData, customCalcs);
    }

    // ── FASE 4: Validação de regras customizadas ──────────────────────
    const violations = validateRules(rules, analyses, comparisons, calcResults);

    // ── FASE 5: Salvar arquivos no Storage ────────────────────────────
    if (saveFiles !== "false") {
      await Promise.allSettled(
        files.map(f => saveToStorage(f.buffer, f.originalname, appId, auditId))
      );
    }

    // ── FASE 6: Determinar status geral ──────────────────────────────
    const hasDivergences = comparisons.some(c => c.status === "DIVERGENTE");
    const hasViolations  = violations.length > 0;
    const hasCalcErrors  = calcResults?.summary.failed > 0;

    const overallStatus = (!hasDivergences && !hasViolations && !hasCalcErrors)
      ? "OK"
      : (hasDivergences || hasViolations)
        ? "DIVERGENTE"
        : "PARCIAL";

    // ── FASE 7: Registrar no Firestore ────────────────────────────────
    const record = {
      auditId,
      appId,
      type:          "audit",
      fileCount:     files.length,
      filenames:     files.map(f => f.originalname),
      docTypes:      analyses.map(a => a.analysis.documentType),
      status:        overallStatus,
      divergences:   comparisons.reduce((acc, c) => acc + (c.tableComparison?.summary.divergent || 0), 0),
      violations:    violations.length,
      calcStatus:    calcResults ? (calcResults.summary.failed === 0 ? "OK" : "PARCIAL") : "N/A",
      processingMs:  Date.now() - startTime,
      createdAt:     serverTimestamp()
    };
    await getDB().collection("audits").doc(auditId).set(record);

    // ── RESPOSTA ──────────────────────────────────────────────────────
    const response = {
      success:       true,
      auditId,
      status:        overallStatus,
      processingMs:  Date.now() - startTime,
      documents:     analyses.map((a, i) => ({
        filename:  files[i].originalname,
        fileSize:  files[i].size,
        ...a
      })),
      comparisons:   comparisons.length > 0 ? comparisons : undefined,
      calculations:  calcResults || undefined,
      violations:    violations.length > 0 ? violations : undefined,
      summary: {
        fileCount:         files.length,
        docTypes:          [...new Set(analyses.map(a => a.analysis.documentType))],
        totalDivergences:  comparisons.reduce((acc, c) => acc + (c.tableComparison?.summary.divergent || 0), 0),
        violations:        violations.length,
        calcsFailed:       calcResults?.summary.failed || 0,
        overallStatus
      }
    };

    // Modo resumido (para apps que precisam só do essencial)
    if (outputFormat === "summary") {
      return res.status(200).json({
        success:  true,
        auditId,
        status:   overallStatus,
        summary:  response.summary,
        violations
      });
    }

    return res.status(200).json(response);

  } catch (err) {
    next(err);
  }
});

/** Valida regras de negócio customizadas */
function validateRules(rules, analyses, comparisons, calcResults) {
  const violations = [];

  for (const rule of rules) {
    try {
      const { name, type, field, operator, value } = rule;

      let actual = null;

      // Resolve o valor do campo
      if (type === "financial") {
        actual = analyses[0]?.analysis?.financials?.[field];
      } else if (type === "calculation") {
        actual = calcResults?.summary?.values?.[field];
      } else if (type === "divergence") {
        actual = comparisons[0]?.tableComparison?.summary?.divergent;
      }

      if (actual === null || actual === undefined) continue;

      let violated = false;
      switch (operator) {
        case "eq":  violated = actual !== value; break;
        case "neq": violated = actual === value; break;
        case "gt":  violated = actual <= value;  break;
        case "lt":  violated = actual >= value;  break;
        case "gte": violated = actual < value;   break;
        case "lte": violated = actual > value;   break;
      }

      if (violated) {
        violations.push({
          rule: name,
          field,
          operator,
          expected: value,
          actual,
          message: `Regra "${name}": esperado ${field} ${operator} ${value}, encontrado: ${actual}`
        });
      }
    } catch (_) {}
  }

  return violations;
}

module.exports = router;
