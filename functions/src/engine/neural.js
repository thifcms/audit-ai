const admin = require("firebase-admin");

async function loadNeuralPatterns() {
  const db = admin.firestore();
  try {
    const defaultSnap = await db.collection("knowledge_base").doc("neural_patterns").get();
    let pat = {};
    if (defaultSnap.exists) {
      pat = defaultSnap.data().hospitals || {};
    }
    
    // Como a user quer hospital como chave, vamos buscar sub-collections ou documentos diretos na knowledge_base?
    // User request:
    // Criar coleção knowledge_base com documentos:
    // { "hospitalId": "BARTIRA", "padroes": {...}, "totalLeituras": 0, "acertos": 0, "taxaAcerto": 0, "ultimoAprendizado": "timestamp" }
    
    const snap = await db.collection("knowledge_base").where("hospitalId", "!=", null).get();
    const hospitals = {};
    snap.forEach(doc => {
      hospitals[doc.data().hospitalId] = doc.data();
    });
    return hospitals;
  } catch (err) {
    console.warn("Error loading neural patterns:", err);
    return {};
  }
}

async function testNeuralPatterns(text) {
  if (!text) return { hit: false };
  const upperText = text.toUpperCase();
  const hospitals = await loadNeuralPatterns();

  for (const [hospitalId, doc] of Object.entries(hospitals)) {
    if (!doc.padroes) continue;
    // Se o texto parece conter o hospital
    if (upperText.includes(hospitalId.toUpperCase())) {
      let extracted = {};
      let allMatched = true;
      let hasAnyMatch = false;

      for (const [key, regexStr] of Object.entries(doc.padroes)) {
        try {
          const re = new RegExp(regexStr, "i");
          const match = text.match(re);
          if (match && match[1]) {
            let fieldName = key.replace(/^regex_/, "");
            extracted[fieldName] = match[1].trim();
            hasAnyMatch = true;
          } else {
            allMatched = false;
          }
        } catch (e) {
          console.warn(`Bad regex for ${hospitalId} - ${key}:`, regexStr);
          allMatched = false;
        }
      }

      if (hasAnyMatch && allMatched) {
        return { hit: true, hospitalId, extracted };
      }
    }
  }

  return { hit: false };
}

async function incrementNeuralAccess(hospitalId, isHit) {
  const db = admin.firestore();
  try {
    const snap = await db.collection("knowledge_base").where("hospitalId", "==", hospitalId).get();
    if (snap.empty) return;

    const doc = snap.docs[0];
    const data = doc.data();
    
    const leituras = (data.totalLeituras || 0) + 1;
    const acertos = (data.acertos || 0) + (isHit ? 1 : 0);
    const taxaAcerto = (acertos / leituras) * 100;

    await doc.ref.update({
      totalLeituras: leituras,
      acertos: acertos,
      taxaAcerto: Math.round(taxaAcerto * 100) / 100
    });
  } catch (err) {
    console.warn("Failed to increment neural access", err);
  }
}

async function saveNeuralPattern(hospitalId, padroes) {
  if (!hospitalId || !padroes || Object.keys(padroes).length === 0) return;
  const db = admin.firestore();
  
  try {
    let docRef;
    const snap = await db.collection("knowledge_base").where("hospitalId", "==", hospitalId).get();
    
    if (!snap.empty) {
      docRef = snap.docs[0].ref;
      
      const data = snap.docs[0].data();
      const leituras = (data.totalLeituras || 0) + 1;
      const acertos = data.acertos || 0;
      const taxaAcerto = (acertos / leituras) * 100;
      
      await docRef.update({
        padroes,
        ultimoAprendizado: admin.firestore.FieldValue.serverTimestamp(),
        totalLeituras: leituras,
        taxaAcerto: Math.round(taxaAcerto * 100) / 100
      });
    } else {
      docRef = db.collection("knowledge_base").doc("neural_" + hospitalId.toLowerCase());
      await docRef.set({
        hospitalId,
        padroes,
        totalLeituras: 1,
        acertos: 0,
        taxaAcerto: 0,
        ultimoAprendizado: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (err) {
    console.warn("Failed to save neural pattern", err);
  }
}

module.exports = {
  loadNeuralPatterns,
  testNeuralPatterns,
  incrementNeuralAccess,
  saveNeuralPattern
};
