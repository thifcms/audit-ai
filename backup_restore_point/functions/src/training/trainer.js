const admin  = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");

/**
 * Módulo de treinamento.
 * Usa Gemini para analisar documentos de exemplo e gerar
 * o conhecimento base que a IA usará nas extrações futuras.
 */
async function trainFromDocuments(parsedDocs, appId, options = {}) {
  const {
    domain       = "multiplos",
    customRules  = "",
    resetExisting = false
  } = options;

  const apiKey = process.env.V2_Gemini_API_Key || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("A chave Gemini não está configurada (V2_Gemini_API_Key ou GEMINI_API_KEY).");

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Prepara amostras dos documentos
  const samples = parsedDocs.map(doc => ({
    type:   doc.type,
    text:   doc.text?.substring(0, 3000) || "",
    tables: (doc.tables || []).map(t => ({
      name:    t.sheetName,
      headers: t.headers,
      sample:  t.rows.slice(0, 3)
    })),
    fields: doc.fields || {}
  }));

  const trainingPrompt = `
Você é um especialista em IA para leitura de documentos empresariais.
Analise os ${samples.length} documento(s) de exemplo abaixo e gere um knowledge base
para uma IA especialista em extração de dados destes tipos de documento.

DOMÍNIO DO APP: ${domain}
REGRAS CUSTOMIZADAS: ${customRules || "Nenhuma"}

DOCUMENTOS DE EXEMPLO:
${JSON.stringify(samples, null, 2)}

Gere um JSON com a seguinte estrutura (retorne APENAS o JSON, sem explicações):
{
  "domain": "${domain}",
  "documentTypes": [
    "lista dos tipos de documento identificados"
  ],
  "systemPrompt": "prompt de sistema completo para extração, incluindo: conhecimento sobre os layouts desses documentos, campos esperados, padrões de formatação identificados, regras de validação observadas. Seja específico e detalhado.",
  "domainRules": "regras de negócio específicas observadas nos documentos",
  "keyFields": {
    "campo_nome": {
      "description": "o que é este campo",
      "location": "onde costuma aparecer no documento",
      "format": "formato esperado",
      "required": true
    }
  },
  "examples": [
    {
      "input": "trecho de texto de exemplo",
      "output": { "campo": "valor extraído" }
    }
  ],
  "validationRules": [
    "regra de validação 1",
    "regra de validação 2"
  ],
  "commonPatterns": {
    "dateFormats": ["formatos de data encontrados"],
    "currencyFormats": ["formatos de moeda"],
    "documentIdentifiers": ["como identificar cada tipo de doc"]
  }
}`;

  let knowledge;
  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [{ role: "user", parts: [{ text: trainingPrompt }] }],
      config: {
        temperature:      0.2,
        responseMimeType: "application/json",
        maxOutputTokens:  8192
      }
    });

    const text = result.text;
    knowledge  = safeParseJSON(text);
  } catch (err) {
    throw new Error(`Falha no treinamento com Gemini: ${err.message}`);
  }

  if (!knowledge || Object.keys(knowledge).length === 0) {
    throw new Error("Gemini não retornou conhecimento válido.");
  }

  // Adiciona metadados
  knowledge.trainedAt    = new Date().toISOString();
  knowledge.sampleCount  = parsedDocs.length;
  knowledge.appId        = appId;
  knowledge.version      = Date.now();

  // Salva no Firestore
  const db      = admin.firestore();
  const docRef  = db.collection("knowledge_base").doc(appId);

  if (resetExisting) {
    await docRef.set(knowledge);
  } else {
    // Merge: preserva conhecimento anterior, adiciona novo
    const existing = await docRef.get();
    if (existing.exists) {
      const prev = existing.data();
      knowledge  = mergeKnowledge(prev, knowledge);
    }
    await docRef.set(knowledge, { merge: true });
  }

  // Salva histórico de treinos
  await db.collection("training_history").add({
    appId,
    trainedAt:   admin.firestore.FieldValue.serverTimestamp(),
    sampleCount: parsedDocs.length,
    docTypes:    knowledge.documentTypes || [],
    domain,
    version:     knowledge.version
  });

  return {
    success:       true,
    appId,
    documentTypes: knowledge.documentTypes || [],
    keyFields:     Object.keys(knowledge.keyFields || {}),
    sampleCount:   parsedDocs.length,
    message:       `Treinamento concluído. IA especializada em ${(knowledge.documentTypes || []).join(", ")}.`
  };
}

/** Faz merge inteligente de dois knowledge bases */
function mergeKnowledge(existing, newKnowledge) {
  return {
    ...existing,
    ...newKnowledge,
    documentTypes: [...new Set([
      ...(existing.documentTypes || []),
      ...(newKnowledge.documentTypes || [])
    ])],
    keyFields: {
      ...(existing.keyFields || {}),
      ...(newKnowledge.keyFields || {})
    },
    examples: [
      ...(existing.examples || []),
      ...(newKnowledge.examples || [])
    ].slice(-50), // mantém os 50 mais recentes
    validationRules: [...new Set([
      ...(existing.validationRules || []),
      ...(newKnowledge.validationRules || [])
    ])]
  };
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { return {}; }
    }
    return {};
  }
}

module.exports = { trainFromDocuments };
