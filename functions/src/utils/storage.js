const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

/**
 * Salva um arquivo no Firebase Storage e retorna a URL.
 */
async function saveToStorage(buffer, filename, appId, auditId) {
  try {
    const bucket   = admin.storage().bucket();
    const ext      = filename.split(".").pop();
    const filePath = `docs/${appId}/${auditId}/${uuidv4()}.${ext}`;
    const file     = bucket.file(filePath);

    await file.save(buffer, {
      metadata: {
        contentType: getMimeType(ext),
        metadata: { originalName: filename, appId, auditId }
      }
    });

    // URL assinada válida por 7 dias
    const [url] = await file.getSignedUrl({
      action:  "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    return { filePath, url };
  } catch (err) {
    console.warn("[Storage] Falha ao salvar arquivo:", err.message);
    return { filePath: null, url: null };
  }
}

function getMimeType(ext) {
  const map = {
    pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    xml: "application/xml", zip: "application/zip", json: "application/json",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain"
  };
  return map[ext?.toLowerCase()] || "application/octet-stream";
}

module.exports = { saveToStorage };
