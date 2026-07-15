const { initializeApp } = require("firebase/app");
const { 
  getFirestore, collection, doc, getDocs, getDoc, 
  setDoc, updateDoc, deleteDoc, addDoc, query, where, 
  limit, serverTimestamp, orderBy, writeBatch 
} = require("firebase/firestore");
const firebaseConfig = require("../../../firebase-applet-config.json");

const app = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);

class QueryProxy {
  constructor(ref) {
    this.ref = ref;
  }
  where(field, op, val) {
    return new QueryProxy(query(this.ref, where(field, op, val)));
  }
  limit(n) {
    return new QueryProxy(query(this.ref, limit(n)));
  }
  orderBy(field, dir) {
    return new QueryProxy(query(this.ref, orderBy(field, dir)));
  }
  async get() {
    const snap = await getDocs(this.ref);
    return {
      empty: snap.empty,
      size: snap.size,
      docs: snap.docs.map(d => ({
        id: d.id,
        ref: new DocProxy(doc(firestoreDb, d.ref.path)),
        data: () => d.data()
      })),
      forEach: (cb) => {
        snap.docs.forEach(d => {
          cb({
            id: d.id,
            ref: new DocProxy(doc(firestoreDb, d.ref.path)),
            data: () => d.data()
          });
        });
      }
    };
  }
}

class DocProxy {
  constructor(ref) {
    this.ref = ref;
    this.id = ref.id;
  }
  async get() {
    const snap = await getDoc(this.ref);
    return {
      exists: snap.exists(),
      id: snap.id,
      data: () => snap.data()
    };
  }
  async set(data) {
     await setDoc(this.ref, data);
  }
  async update(data) {
     await updateDoc(this.ref, data);
  }
  async delete() {
     await deleteDoc(this.ref);
  }
}

class CollectionProxy extends QueryProxy {
  constructor(path) {
    super(collection(firestoreDb, path));
    this.path = path;
  }
  doc(id) {
    if (id) {
      return new DocProxy(doc(firestoreDb, this.path, id));
    } else {
      return new DocProxy(doc(collection(firestoreDb, this.path)));
    }
  }
  async add(data) {
    const dRef = await addDoc(collection(firestoreDb, this.path), data);
    return new DocProxy(dRef);
  }
}

const dbProxy = {
  collection: (path) => new CollectionProxy(path),
  batch: () => {
    const wb = writeBatch(firestoreDb);
    return {
      update: (docProxy, data) => wb.update(docProxy.ref, data),
      set: (docProxy, data) => wb.set(docProxy.ref, data),
      delete: (docProxy) => wb.delete(docProxy.ref),
      commit: async () => await wb.commit()
    };
  }
};

function getDB() {
  return dbProxy;
}

module.exports = { getDB, serverTimestamp };
