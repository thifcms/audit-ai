const admin = require("firebase-admin");
const { getDB, serverTimestamp } = require("../utils/db");

async function logMiddleware(req, res, next) {
  const start = Date.now();

  res.on("finish", async () => {
    const duration = Date.now() - start;
    const log = {
      method:    req.method,
      path:      req.path,
      status:    res.statusCode,
      duration,
      appId:     req.appContext?.appId || "unknown",
      timestamp: serverTimestamp()
    };

    // Salva log em background
    try {
      await getDB().collection("request_logs").add(log);
    } catch (_) {}

    console.log(`[${log.appId}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
  });

  next();
}

module.exports = { logMiddleware };
