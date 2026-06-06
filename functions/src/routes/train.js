const express = require("express");
const { upload }          = require("../utils/upload");
const { parseDocument }   = require("../parsers");
const { trainFromDocuments } = require("../training/trainer");

const router = express.Router();

/**
 * POST /train
 * Treina a IA com documentos de exemplo usando Gemini.
 * Requer API Key com role=admin.
 *
 * multipart/form-data:
 *   files[]      — documentos de exemplo (1 a 20)
 *   appId        — ID do app a ser treinado (ou "global")
 *   domain       — domínio: "fiscal","financeiro","logistica","multiplos"
 *   customRules  — regras customizadas em texto livre
 *   reset        — "true" para zerar conhecimento anterior
 */
router.post("/", upload.array("files", 20), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error:   "Envie ao menos um arquivo de exemplo em 'files[]'.",
        code:    "NO_FILES"
      });
    }

    const {
      appId        = "global",
      domain       = "multiplos",
      customRules  = "",
      reset        = "false"
    } = req.body;

    // Parse todos os documentos de exemplo
    const parsedDocs = await Promise.all(
      files.map(f => parseDocument(f.buffer, f.originalname, f.mimetype))
    );

    // Treina com Gemini
    const result = await trainFromDocuments(parsedDocs, appId, {
      domain,
      customRules,
      resetExisting: reset === "true"
    });

    res.json({ success: true, ...result });

  } catch (err) {
    next(err);
  }
});

/**
 * GET /train/status/:appId
 * Retorna status do treinamento de um app.
 */
router.get("/status/:appId", async (req, res, next) => {
  try {
    const admin  = require("firebase-admin");
    const appId  = req.params.appId;
    const doc    = await admin.firestore().collection("knowledge_base").doc(appId).get();

    if (!doc.exists) {
      return res.json({ success: true, trained: false, appId });
    }

    const data = doc.data();
    res.json({
      success:       true,
      trained:       true,
      appId,
      documentTypes: data.documentTypes || [],
      keyFields:     Object.keys(data.keyFields || {}),
      sampleCount:   data.sampleCount || 0,
      trainedAt:     data.trainedAt,
      version:       data.version
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
