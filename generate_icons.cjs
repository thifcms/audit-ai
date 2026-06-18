const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceImage = path.join(__dirname, 'src', 'assets', 'images', 'audit_ai_icon_1781732574781.jpg');
const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');

async function processIcon(size, filename) {
  try {
    const publicDest = path.join(publicDir, filename);
    const distDest = path.join(distDir, filename);

    // Ensure the public directory exists
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Generate to public folder
    await sharp(sourceImage)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 7, g: 11, b: 19, alpha: 1 } // Navy background color '#070b13'
      })
      .png()
      .toFile(publicDest);
    console.log(`[IconGen] Successfully generated ${filename} (${size}x${size}) inside public/`);

    // If dist already exists, generate there too for absolute safety
    if (fs.existsSync(distDir)) {
      await sharp(sourceImage)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 7, g: 11, b: 19, alpha: 1 }
        })
        .png()
        .toFile(distDest);
      console.log(`[IconGen] Successfully generated ${filename} (${size}x${size}) inside dist/`);
    }
  } catch (error) {
    console.error(`[IconGen] Error processing ${filename}:`, error);
  }
}

async function run() {
  if (!fs.existsSync(sourceImage)) {
    console.error(`[IconGen] ERROR: Source image not found at ${sourceImage}`);
    process.exit(1);
  }

  console.log('[IconGen] Starting PWA icon generation...');
  await processIcon(192, 'icon-192.png');
  await processIcon(512, 'icon-512.png');
  console.log('[IconGen] Completed successfully!');
}

run();
