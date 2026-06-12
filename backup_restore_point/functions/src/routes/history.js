// ── history.js ────────────────────────────────────────────────────────────
const express   = require("express");
const admin     = require("firebase-admin");
const { getDB } = require("../utils/db");
const histRouter= express.Router();

/**
 * GET /history
 * Retorna histórico de auditorias do app autenticado.
 * Query params: limit (padrão 50), type, status, startDate, endDate
 */
histRouter.get("/", async (req, res, next) => {
  try {
    const { appId } = req.appContext;
    const { limit = "50", type, status, startDate, endDate } = req.query;

    let query = getDB()
      .collection("audits")
      .where("appId", "==", appId)
      .orderBy("createdAt", "desc")
      .limit(Math.min(parseInt(limit) || 50, 200));

    if (type)   query = query.where("type",   "==", type);
    if (status) query = query.where("status", "==", status);

    const snapshot = await query.get();
    const audits   = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null
    }));

    res.json({ success: true, count: audits.length, audits });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /history/:auditId
 * Retorna detalhes de uma auditoria específica.
 */
histRouter.get("/:auditId", async (req, res, next) => {
  try {
    const { appId }   = req.appContext;
    const { auditId } = req.params;

    const doc = await getDB().collection("audits").doc(auditId).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: "Auditoria não encontrada." });

    const data = doc.data();
    if (data.appId !== appId) return res.status(403).json({ success: false, error: "Acesso negado." });

    res.json({ success: true, audit: { id: doc.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() } });
  } catch (err) {
    next(err);
  }
});

module.exports = histRouter;
