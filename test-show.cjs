const firebase = require("firebase/compat/app").default || require("firebase/compat/app");
require("firebase/compat/firestore");
const fs = require('fs');

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

async function run() {
  try {
    const snap = await db.collection("learned_examples").limit(2).get();
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
