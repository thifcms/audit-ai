const express = require("express");
const admin = require("firebase-admin");
const { getDB } = require("../utils/db");
const { v4: uuidv4 }      = require("uuid");
const { upload }          = require("../utils/upload");
const { parseDocument }   = require("../parsers");
const { analyzeDocument } = require("../engine/analyzer");
const { compareTables, compareFields } = require("../engine/comparator");

const router = express.Router();

/**
 * POST /compare
 * Compara dois documentos e retorna divergências.
 *
 * multipart/form-data:
 *   docA        — arquivo A (obrigatório)
 *   docB        — arquivo B (obrigatório)
 *   matchBy     — "column_name" | "position" | "key" (padrão: column_name)
 *   keyField    — campo-chave para match (quando matchBy=key)
 *   tolerance   — tolerância numérica (padrão: 0)
 *   ignoreFields— campos a ignorar (JSON array string)
 *   tableIndex  — índice da tabela a comparar (padrão: 0)
 */
router.post("/", upload.fields([
  { name: "docA", maxCount: 1 },
  { name: "docB", maxCount: 1 }
]), async (req, res, next) => {
  try {
    const fileA = req.files?.docA?.[0];
    const fileB = req.files?.docB?.[0];

    if (!fileA || !fileB) {
      return res.status(400).json({
        success: false,
        error:   "Envie dois arquivos: docA e docB.",
        code:    "MISSING_FILES"
      });
    }

    const { appId } = req.appContext;
    const auditId   = uuidv4();

    const {
      matchBy      = "column_name",
      keyField     = null,
      tolerance    = "0",
      tableIndex   = "0"
    } = req.body;

    let ignoreFields = [];
    try { ignoreFields = JSON.parse(req.body.ignoreFields || "[]"); } catch (_) {}

    // 1. Parse dos dois documentos
    const [parsedA, parsedB] = await Promise.all([
      parseDocument(fileA.buffer, fileA.originalname, fileA.mimetype),
      parseDocument(fileB.buffer, fileB.originalname, fileB.mimetype)
    ]);

    // 2. Análise inteligente dos dois
    const [analysisA, analysisB] = await Promise.all([
      analyzeDocument(parsedA, { appId, useAI: true }),
      analyzeDocument(parsedB, { appId, useAI: true })
    ]);

    // 3. Comparação de tabelas (se existirem)
    const tblIdx    = parseInt(tableIndex) || 0;
    const tableA    = parsedA.tables?.[tblIdx];
    const tableB    = parsedB.tables?.[tblIdx];

    let tableComparison = null;
    if (tableA && tableB) {
      tableComparison = compareTables(tableA, tableB, {
        matchBy,
        keyField:     keyField || null,
        tolerance:    parseFloat(tolerance) || 0,
        ignoreFields
      });
    }

    // 4. Comparação de campos financeiros
    const fieldComparison = compareFields(
      analysisA.analysis.financials || {},
      analysisB.analysis.financials || {},
      { tolerance: parseFloat(tolerance) || 0, ignoreFields }
    );

    // 5. Status geral
    const overallStatus = (
      (!tableComparison || tableComparison.summary.status === "OK") &&
      fieldComparison.summary.status === "OK"
    ) ? "OK" : "DIVERGENTE";

    // 6. Registrar
    const record = {
      auditId,
      appId,
      type:       "compare",
      fileA:      fileA.originalname,
      fileB:      fileB.originalname,
      docTypeA:   analysisA.analysis.documentType,
      docTypeB:   analysisB.analysis.documentType,
      status:     overallStatus,
      divergences: (tableComparison?.summary.divergent || 0) + (fieldComparison.summary.divergent || 0),
      createdAt:  admin.firestore.FieldValue.serverTimestamp()
    };
    await getDB().collection("audits").doc(auditId).set(record);

    return res.status(200).json({
      success: true,
      auditId,
      status:  overallStatus,
      documentA: {
        filename: fileA.originalname,
        type:     analysisA.analysis.documentType,
        summary:  analysisA.analysis.summary,
        financials: analysisA.analysis.financials
      },
      documentB: {
        filename: fileB.originalname,
        type:     analysisB.analysis.documentType,
        summary:  analysisB.analysis.summary,
        financials: analysisB.analysis.financials
      },
      tableComparison,
      fieldComparison,
      overallSummary: {
        tableDivergences: tableComparison?.summary.divergent || 0,
        fieldDivergences: fieldComparison.summary.divergent  || 0,
        totalDivergences: (tableComparison?.summary.divergent || 0) + (fieldComparison.summary.divergent || 0),
        conformityRate:   Math.min(
          tableComparison?.summary.conformityRate ?? 100,
          fieldComparison.summary.conformityRate
        ),
        status: overallStatus
      }
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
