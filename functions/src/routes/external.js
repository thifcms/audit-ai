const express = require("express");
const { upload } = require("../utils/upload");
const { parseDocument } = require("../parsers");
const { analyzeDocument } = require("../engine/analyzer");

const router = express.Router();

/**
 * GET Ping endpoints para Teste de Conexão com a IA 
 */
router.get("/", (req, res) => {
  res.json({ success: true, message: "Conexão com Audit AI Estabelecida (Rota /external)", version: "2.0" });
});

router.get("/analyze", (req, res) => {
  res.json({ success: true, message: "Conexão com Audit AI Estabelecida (Rota /external/analyze)", version: "2.0" });
});

/**
 * POST /external/analyze
 * Endpoint para apps externos (MedNote, MedReconcile) enviarem documentos para análise.
 * 
 * multipart/form-data:
 *   files[] — arquivos para análise
 */
router.post("/analyze", (req, res, next) => {
  upload.array("files", 10)(req, res, (err) => {
    if (err) {
      console.error("[External Analyze Error] Multer error:", err);
      // Fallback gracioso para Pings via POST sem payload multipart as expected by older implementations
      return res.status(200).json({ success: true, message: "Arquivo não enviado, mas conexão POST ativa." });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(200).json({ success: true, message: "Conexão com Audit AI Estabelecida. Nenhum arquivo enviado para análise." });
    }

    const { appId } = req.appContext;
    
    // Parse e Análise
    const parsedDocs = await Promise.all(
      files.map(f => parseDocument(f.buffer, f.originalname, f.mimetype))
    );

    const analyses = await Promise.all(
      parsedDocs.map(p => analyzeDocument(p, { appId, useAI: true }))
    );

    const response = {
      success: true,
      analysis: analyses.map((a, i) => ({
        filename: files[i].originalname,
        ...a
      }))
    };

    return res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
