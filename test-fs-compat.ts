import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

async function run() {
  try {
    const snap = await db.collection("learned_examples").limit(1).get();
    console.log("Success! Docs:", snap.docs.length);
    if(snap.docs.length > 0) {
        console.log("First Doc Data:", snap.docs[0].data());
    }
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
