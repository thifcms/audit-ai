const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const targetDirs = [
  path.join(__dirname, 'src', 'assets', 'images'),
  path.join(__dirname, 'public')
];

function getImagesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getImagesRecursively(filePath, fileList);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

async function validateImages() {
  try {
    const images = [];
    for (const dir of targetDirs) {
      getImagesRecursively(dir, images);
    }

    if (images.length === 0) {
      console.log('[ImageValidator] Nenhuma imagem encontrada para validação.');
      process.exit(0);
    }

    console.log(`[ImageValidator] Iniciando validação de ${images.length} imagens...`);
    for (const filePath of images) {
      const relativePath = path.relative(__dirname, filePath);
      try {
        await sharp(filePath).metadata();
      } catch (err) {
        console.error(`\x1b[31m[ImageValidator] ERRO: O arquivo de imagem '${relativePath}' está corrompido ou é inválido.\x1b[0m`);
        console.error(err.message);
        process.exit(1);
      }
    }

    console.log(`\x1b[32m[ImageValidator] Todas as ${images.length} imagens validadas com sucesso.\x1b[0m`);
    process.exit(0);
  } catch (globalErr) {
    console.error('[ImageValidator] Erro inesperado durante a validação:', globalErr);
    process.exit(1);
  }
}

validateImages();
