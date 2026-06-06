const express = require("express");
const admin   = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

/**
 * POST /keys — cria nova API Key
 * Body JSON: { appId, appName, role }
 */
router.post("/", express.json(), async (req, res, next) => {
  try {
    const { appId, appName, role = "app" } = req.body;
    if (!appId || !appName) {
      return res.status(400).json({ success: false, error: "appId e appName são obrigatórios." });
    }

    const key    = `dk_${role === "admin" ? "admin" : "app"}_${uuidv4().replace(/-/g, "")}`;
    const docRef = await admin.firestore().collection("api_keys").add({
      key,
      appId,
      appName,
      role,
      active:    true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUsedAt: null
    });

    res.json({ success: true, keyId: docRef.id, key, appId, appName, role,
      warning: "Guarde esta chave com segurança. Ela não será exibida novamente." });
  } catch (err) { next(err); }
});

/**
 * GET /keys — lista chaves (sem mostrar o valor)
 */
router.get("/", async (req, res, next) => {
  try {
    const snap = await admin.firestore().collection("api_keys").orderBy("createdAt", "desc").get();
    const keys = snap.docs.map(d => ({
      id:        d.id,
      appId:     d.data().appId,
      appName:   d.data().appName,
      role:      d.data().role,
      active:    d.data().active,
      key:       `${d.data().key?.substring(0, 12)}...`,
      createdAt: d.data().createdAt?.toDate?.()?.toISOString(),
      lastUsedAt:d.data().lastUsedAt?.toDate?.()?.toISOString()
    }));
    res.json({ success: true, count: keys.length, keys });
  } catch (err) { next(err); }
});

/**
 * DELETE /keys/:keyId — desativa uma chave
 */
router.delete("/:keyId", async (req, res, next) => {
  try {
    await admin.firestore().collection("api_keys").doc(req.params.keyId).update({ active: false });
    res.json({ success: true, message: "Chave desativada com sucesso." });
  } catch (err) { next(err); }
});

module.exports = router;
