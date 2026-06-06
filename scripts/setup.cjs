/**
 * SCRIPT DE SETUP INICIAL
 * Execute UMA VEZ após o primeiro deploy:
 *   node scripts/setup.js
 */

const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

let serviceAccount = null;
try {
  serviceAccount = require("../service-account.json");
} catch (e) {
  console.log("⚠️ service-account.json não encontrado. Utilizando credenciais padrão do ambiente (Application Default Credentials).");
}

if (serviceAccount) {
  admin.initializeApp({
    credential:    admin.credential.cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.appspot.com`
  });
} else {
  admin.initializeApp({
    projectId: "spherical-leaf-vr5vm"
  });
}

// Importa o knowledge builtin para salvar no Firestore como referência
const { BUILTIN_KNOWLEDGE } = require("../functions/src/engine/knowledge");

async function setup() {
  const db = admin.firestore();
  console.log("\n🚀 DocEngine — Setup Inicial\n");

  // ── 1. Cria API Keys ─────────────────────────────────────────────────────
  const apps = [
    { appId: "admin", appName: "Admin",     role: "admin" },
    { appId: "app1",  appName: "Meu App 1", role: "app"   },
    { appId: "app2",  appName: "Meu App 2", role: "app"   }
  ];

  const createdKeys = [];
  let dbFailed = false;
  
  for (const app of apps) {
    const prefix = app.role === "admin" ? "dk_admin_" : "dk_app_";
    const key    = `${prefix}${uuidv4().replace(/-/g, "")}`;
    try {
      await db.collection("api_keys").add({
        key, appId: app.appId, appName: app.appName,
        role: app.role, active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUsedAt: null
      });
      console.log(`✅ ${app.appName} (${app.role}) gravado no Firestore: ${key}`);
    } catch (dbErr) {
      dbFailed = true;
      console.log(`⚠️ Falha ao salvar ${app.appName} no Firestore (rodando localmente): ${key}`);
    }
    createdKeys.push({ ...app, key });
  }

  // ── 2. Salva knowledge builtin no Firestore ──────────────────────────────
  // A IA já funciona sem isso (usa o arquivo knowledge.js direto),
  // mas salvar no Firestore permite ver/editar pelo Console Firebase.
  if (!dbFailed) {
    try {
      await db.collection("knowledge_base").doc("global").set({
        ...BUILTIN_KNOWLEDGE,
        savedAt: admin.firestore.FieldValue.serverTimestamp(),
        note: "Base builtin — a IA já vem treinada para todos os tipos de documento."
      });
      console.log("\n✅ Knowledge base builtin registrada no Firestore");
    } catch (dbErr) {
      console.log("\n⚠️ Falha ao registrar Knowledge base no Firestore.");
    }
  } else {
    console.log("\n⚠️ Devido à falta de credenciais do Firestore na CLI local, as chaves de API foram geradas em memória para você.");
  }

  // Salva no arquivo local para posterior referência ou fallback
  const fs = require("fs");
  const path = require("path");
  fs.writeFileSync(path.join(__dirname, "api_keys.json"), JSON.stringify(createdKeys, null, 2));
  console.log("✅ Chaves de API salvas localmente em scripts/api_keys.json");

  // ── 3. Instruções finais ─────────────────────────────────────────────────
  console.log("\n" + "─".repeat(55));
  console.log("⚠️  GUARDE ESTAS CHAVES — não serão exibidas de novo!\n");
  createdKeys.forEach(k => console.log(`  ${k.appName}: ${k.key}`));
  console.log("\n" + "─".repeat(55));
  console.log("\n📋 A IA JÁ ESTÁ PRONTA para ler:");
  console.log("   NFe, CTe, Extratos, Boletos, Holerites, Balancetes,");
  console.log("   Contratos, Planilhas, Imagens, XML Fiscal e muito mais.");
  console.log("\n   Sem precisar de /train!");
  console.log("\n   Use /train apenas para adicionar padrões");
  console.log("   específicos do seu negócio.\n");
  process.exit(0);
}

setup().catch(err => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
