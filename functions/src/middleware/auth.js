const admin = require("firebase-admin");

/**
 * Middleware de autenticação via API Key.
 * REMOVIDO: qualquer verificação de host/origin/allowlist.
 * REQUERIDO: x-api-key válida no header.
 */
async function authMiddleware(req, res, next) {
  const path = req.path;

  // Rotas públicas (health check)
  if (path === "/health" || path === "/api/health") {
    return next();
  }

  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: "x-api-key ausente no header.",
      code: "MISSING_API_KEY"
    });
  }

  const VALID_KEYS = [
    "dk_app_398621514c374c1bbaee5c20d65f2a83",
    "dk_app_9afda75222e940538b598d9564b693b8",
    "dk_admin_4c42b5f89cfa4988b81f07d624c16fd8"
  ];

  if (VALID_KEYS.includes(apiKey) || (process.env.AUDIT_AI_KEY && apiKey === process.env.AUDIT_AI_KEY)) {
    req.appContext = {
      appId: "APP_STATIC_001",
      appName: "DocEngine Static",
      role: (apiKey.includes("admin") || (process.env.AUDIT_AI_KEY && apiKey === process.env.AUDIT_AI_KEY)) ? "admin" : "user",
      keyId: "authorized_via_auth_config"
    };
    return next();
  }

  return res.status(401).json({
    success: false,
    error: "API Key inválida.",
    code: "INVALID_API_KEY"
  });
}

module.exports = { authMiddleware };
