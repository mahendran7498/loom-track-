const multer = require("multer");
const path = require("path");

// Store the file in memory (req.file.buffer) instead of writing it to disk.
// The buffer is streamed straight to Cloudinary, which also works on Vercel's
// read-only serverless filesystem.
const storage = multer.memoryStorage();

const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|xlsx|xls|csv|doc|docx/;

const fileFilter = (req, file, cb) => {
  const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  if (ext) return cb(null, true);
  cb(new Error("Unsupported file type"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
});

module.exports = upload;
