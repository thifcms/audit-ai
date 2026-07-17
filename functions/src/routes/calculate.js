const express = require("express");
const admin = require("firebase-admin");
const { getDB, serverTimestamp } = require("../utils/db");
const { v4: uuidv4 }       = require("uuid");
const { upload }           = require("../utils/upload");
const { parseDocument }    = require("../parsers");
const { analyzeDocument }  = require("../engine/analyzer");
const { runCalculations, PRESET_CALCULATIONS } = require("../engine/calculator");

const router = express.Router();

/**
 * POST /calculate
 * Executa cálculos sobre dados de um documento.
 *
 * multipart/form-data:
 *   file         — arquivo (opcional se data for enviado)
 *   calculations — JSON array de IDs pré-definidos (ex: ["margem_bruta","icms_devido"])
 *   customCalcs  — JSON array de cálculos customizados [{name, formula, variables, unit}]
 *   data         — JSON string com dados manuais (alternativa ao arquivo)
 *
 * GET /calculate/presets — lista cálculos disponíveis
 */
router.get("/presets", (req, res) => {
  res.json({
    success: true,
    presets: Object.entries(PRESET_CALCULATIONS).map(([id, calc]) => ({
      id,
      name:           calc.name,
      description:    calc.description,
      formula:        calc.formula,
      unit:           calc.unit,
      requiredFields: calc.requiredFields
    }))
  });
});

router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const { appId } = req.appContext;
    const auditId   = uuidv4();

    let calculations = [];
    let customCalcs  = [];
    try { calculations = JSON.parse(req.body.calculations || "[]"); } catch (_) {}
    try { customCalcs  = JSON.parse(req.body.customCalcs  || "[]"); } catch (_) {}

    if (calculations.length === 0 && customCalcs.length === 0) {
      return res.status(400).json({
        success: false,
        error:   "Informe ao menos um cálculo em 'calculations' ou 'customCalcs'.",
        code:    "NO_CALCULATIONS"
      });
    }

    let data = {};

    if (req.file) {
      // Processa arquivo enviado
      const parsed   = await parseDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
      const analysis = await analyzeDocument(parsed, { appId, useAI: true });
      data = {
        ...analysis.analysis,
        tables: parsed.tables,
        raw:    analysis.raw
      };
    } else if (req.body.data) {
      // Dados manuais enviados diretamente
      try { data = JSON.parse(req.body.data); } catch {
        return res.status(400).json({
          success: false,
          error:   "Campo 'data' deve ser um JSON válido.",
          code:    "INVALID_DATA"
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error:   "Envie um 'file' ou um JSON em 'data'.",
        code:    "NO_INPUT"
      });
    }

    // Executa cálculos
    const calcResults = runCalculations(calculations, data, customCalcs);

    // Registrar
    await getDB().collection("audits").doc(auditId).set({
      auditId,
      appId,
      type:        "calculate",
      filename:    req.file?.originalname || "dados_manuais",
      calculations,
      customCount: customCalcs.length,
      status:      calcResults.summary.failed === 0 ? "OK" : "PARCIAL",
      createdAt:   serverTimestamp()
    });

    return res.status(200).json({
      success: true,
      auditId,
      ...calcResults
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
