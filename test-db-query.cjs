const dbUtils = require("./functions/src/utils/db.js");
const db = dbUtils.getDB();

async function run() {
  try {
    const verifiedSnap = await db.collection("learned_examples")
      .where("hospital", "==", "BARTIRA")
      .where("verified_by_user", "==", true)
      .get();
    
    console.log("verifiedCount via getDB():", verifiedSnap.size);
    console.log("Is verifiedCount >= 10?", verifiedSnap.size >= 10);
    
    // Let's print the docs' data
    verifiedSnap.forEach(doc => {
      console.log("Doc ID:", doc.id, "Data:", doc.data());
    });
    
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}
run();
