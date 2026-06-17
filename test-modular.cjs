const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, limit, query } = require("firebase/firestore");
const fs = require('fs');

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  try {
    const snap = await getDocs(query(collection(db, "learned_examples"), limit(2)));
    console.log("Found " + snap.docs.length + " examples in 'learned_examples'.");
    snap.docs.forEach(doc => {
       console.log("Doc Data ->", doc.data());
    });
    process.exit(0);
  } catch(e) {
    console.error("Firebase Error:", e);
    process.exit(1);
  }
}
run();
