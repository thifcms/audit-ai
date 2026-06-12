const multer = require("multer");

// Armazena em memória (buffer) — não salva em disco local
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB por arquivo
    files:    50                 // máximo 50 arquivos por request
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv", "text/plain",
      "image/png", "image/jpeg", "image/webp", "image/bmp", "image/tiff",
      "application/xml", "text/xml",
      "application/zip",
      "application/json",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|xlsx|xls|csv|png|jpg|jpeg|xml|zip|json|docx|txt|nfe|tsv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}`), false);
    }
  }
});

module.exports = { upload };
