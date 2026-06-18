const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function generateIcons() {
  const source = "src/assets/images/audit_ai_icon_1781732574781.jpg";
  const publicDir = path.join(process.cwd(), "public");

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
  }

  console.log(`Using source: ${source}`);

  // Create 192x192
  await sharp(source)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, "icon-192.png"));
  console.log("Created icon-192.png");

  // Create 512x512
  await sharp(source)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, "icon-512.png"));
  console.log("Created icon-512.png");

  console.log("PWA Icons generated successfully!");
}

generateIcons().catch(err => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
