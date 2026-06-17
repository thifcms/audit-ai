const sharp = require('sharp');

async function processIcons() {
  const input = "src/assets/images/audit_ai_logo_1781728511867.jpg";
  
  // To avoid cutting off an icon that might be slightly offset or larger,
  // let's crop a slightly larger area and resize.
  // Assuming icon on the left half of the 1024x1024, say from x=0 to x=600.
  // We'll extract a square of 600x600 vertically centered.
  const extracted = sharp(input).extract({ left: 0, top: 212, width: 600, height: 600 });
  
  await extracted.clone().resize(512, 512).toFile("public/icon-512.png");
  await extracted.clone().resize(192, 192).toFile("public/icon-192.png");
  
  console.log("Icons saved!");
}

processIcons().catch(console.error);
