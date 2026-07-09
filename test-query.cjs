const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, query, where } = require("firebase/firestore");
const fs = require('fs');

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  try {
    const q = query(collection(firestoreDb, "learned_examples"), where("hospital", "==", "BARTIRA"), where("verified_by_user", "==", true));
    const snap = await getDocs(q);
    console.log(`BARTIRA verified count: ${snap.size}`);
    if (snap.size > 0) {
      console.log("Sample BARTIRA document data:");
      console.log(JSON.stringify(snap.docs[0].data(), null, 2));
    }
    process.exit(0);
  } catch(e) {
    console.error("Firebase Error:", e);
    process.exit(1);
  }
}
run();
