const express = require("express");
const admin   = require("firebase-admin");
const { getDB } = require("../utils/db");
const { v4: uuidv4 }        = require("uuid");
const { upload }            = require("../utils/upload");
const { saveToStorage }     = require("../utils/storage");
const { parseDocument }     = require("../parsers");
const { analyzeDocument }   = require("../engine/analyzer");

const router = express.Router();

/**
 * POST /read
 * Lê e analisa um documento.
 *
 * multipart/form-data:
 *   file          — arquivo (obrigatório)
 *   useAI         — "true"|"false" (padrão: true)
 *   extractSchema — JSON string com schema de extração customizado
 *   saveFile      — "true"|"false" (padrão: true) — salva no Storage
 */
router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    let fileBuffer;
    let filename;
    let mimetype;

    // 1. Obter arquivo (Multipart ou JSON Base64/URL)
    if (req.file) {
      fileBuffer = req.file.buffer;
      filename = req.file.originalname;
      mimetype = req.file.mimetype;
    } else {
      const { file, fileBase64, url, fileName, filename: bodyFilename, mimeType, mimetype: bodyMimetype } = req.body;
      const targetFilename = fileName || bodyFilename || "arquivo_analisado";
      const targetMimetype = mimeType || bodyMimetype || "application/octet-stream";

      if (fileBase64 || file) {
        const base64Data = (fileBase64 || file).replace(/^data:.*;base64,/, "");
        fileBuffer = Buffer.from(base64Data, "base64");
        filename = targetFilename;
        mimetype = targetMimetype;
      } else if (url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Falha ao baixar arquivo da URL: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        filename = targetFilename || url.split("/").pop().split("?")[0] || "downloaded_file";
        mimetype = response.headers.get("content-type") || targetMimetype;
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({
        success: false,
        error:   "Nenhum arquivo enviado. Use o campo 'file' (Multipart) ou 'fileBase64'/'url' (JSON).",
        code:    "NO_FILE"
      });
    }

    const { appId } = req.appContext;
    const auditId   = uuidv4();
    const { useAI = "true", saveFile = "true" } = req.body;

    let extractionSchema = null;
    if (req.body.extractSchema) {
      try { 
        extractionSchema = typeof req.body.extractSchema === 'string' 
          ? JSON.parse(req.body.extractSchema) 
          : req.body.extractSchema; 
      } catch (_) {}
    }

    // 2. Parse do documento
    const parsed = await parseDocument(
      fileBuffer,
      filename,
      mimetype
    );

    // 3. Análise inteligente
    const analysis = await analyzeDocument(parsed, {
      appId,
      extractionSchema,
      useAI: useAI !== "false"
    });

    // 4. Salvar no Storage (em background)
    let storageInfo = {};
    if (saveFile !== "false") {
      try {
        storageInfo = await saveToStorage(
          fileBuffer,
          filename,
          appId,
          auditId
        );
      } catch (storageErr) {
        console.warn("[Read] Falha ao salvar no Storage (continuando):", storageErr.message);
      }
    }

    // 5. Registrar no Firestore
    try {
      const record = {
        auditId,
        appId,
        type:       "read",
        filename:   filename,
        fileSize:   fileBuffer.length,
        docType:    analysis.analysis.documentType,
        summary:    analysis.analysis.summary,
        status:     "OK",
        storageUrl: storageInfo.url || null,
        storagePath:storageInfo.filePath || null,
        createdAt:  admin.firestore.FieldValue.serverTimestamp()
      };

      await getDB().collection("audits").doc(auditId).set(record);
    } catch (saveErr) {
      console.warn("[Read] Falha ao registrar log no Firestore (continuando):", saveErr.message);
    }

    // 6. Resposta
    return res.status(200).json({
      success:  true,
      auditId,
      filename: filename,
      fileSize: fileBuffer.length,
      ...analysis
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
