const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const admin     = require("firebase-admin");
const express   = require("express");
const cors      = require("cors");

// ── Init Firebase ──────────────────────────────────────────
admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "50mb" }));

// ── Health check (Public) ──────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "2.0.0",
    name: "DocEngine API (V2)",
    timestamp: new Date().toISOString()
  });
});

// ── Middleware ─────────────────────────────────────────────
const { authMiddleware } = require("./middleware/auth");
const { logMiddleware }  = require("./middleware/logger");

app.use(logMiddleware);
app.use(authMiddleware);

// ── Routes ─────────────────────────────────────────────────
const readRoute       = require("./routes/read");
const compareRoute    = require("./routes/compare");
const calculateRoute  = require("./routes/calculate");
const auditRoute      = require("./routes/audit");
const historyRoute    = require("./routes/history");
const trainRoute      = require("./routes/train");
const keysRoute       = require("./routes/keys");
const reconcileRoute  = require("./routes/reconcile");
const externalRoute   = require("./routes/external");

app.use("/read",       readRoute);
app.use("/compare",    compareRoute);
app.use("/calculate",  calculateRoute);
app.use("/audit",      auditRoute);
app.use("/history",    historyRoute);
app.use("/train",      trainRoute);
app.use("/keys",       keysRoute);
app.use("/reconcile",  reconcileRoute);
app.use("/external",   externalRoute);

// ── Error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[DocEngine Error]", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Erro interno do servidor",
    code: err.code || "INTERNAL_ERROR"
  });
});

// ── Export ─────────────────────────────────────────────────
setGlobalOptions({ 
  region: "us-central1",
  timeoutSeconds: 300,
  memory: "1GiB",
  maxInstances: 10
});

exports.api = onRequest(app);
