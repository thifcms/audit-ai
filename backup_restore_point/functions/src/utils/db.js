const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const firebaseConfig = require("../../../firebase-applet-config.json");

let _db = null;

function getDB() {
  if (!_db) {
    console.log('[DB] Initializing with Project:', firebaseConfig.projectId, 'Database:', firebaseConfig.firestoreDatabaseId);
    const app = admin.apps.length ? admin.apps[0] : admin.initializeApp({ projectId: firebaseConfig.projectId });
    _db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
  return _db;
}

module.exports = { getDB };
