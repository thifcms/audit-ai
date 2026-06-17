const firebase = require("firebase/compat/app").default || require("firebase/compat/app");
require("firebase/compat/firestore");
const { getFirestore } = require("firebase/firestore");
const fs = require('fs');

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = firebase.initializeApp(firebaseConfig);

// Initialize modular firestore with database ID specifically
const _modularDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Get the compat instance. Does it pick up the named database?
const db = firebase.firestore();

async function run() {
  try {
    const snap = await db.collection("learned_examples").limit(2).get();
    console.log("Success with COMPAT! Docs:", snap.docs.length);
  } catch(e) {
    console.error("Firebase Error:", e);
  }
}
run();
