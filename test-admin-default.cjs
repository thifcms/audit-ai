const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require('fs');

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = admin.initializeApp({ projectId: firebaseConfig.projectId });
const db = getFirestore(app); // No database Id! This targets (default)

async function run() {
  try {
    const snap = await db.collection("learned_examples").limit(2).get();
    console.log("Success with ADMIN DEFAULT! Docs:", snap.docs.length);
    snap.docs.forEach(doc => console.log("Doc Data ->", doc.data()));
  } catch(e) {
    console.error("Firebase Error:", e);
  }
}
run();
