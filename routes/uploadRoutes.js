const express = require("express");
const asyncHandler = require("express-async-handler");
const router = express.Router();
const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { cloudinary, isConfigured } = require("../config/cloudinary");

router.use(protect);

const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "mms",
        resource_type: "auto",
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(file.buffer);
  });

const toUploadResponse = (file, result) => ({
  originalName: file.originalname,
  url: result.secure_url,
  publicId: result.public_id,
  resourceType: result.resource_type,
  mimetype: file.mimetype,
  size: file.size,
});

const assertCloudinaryConfigured = (res) => {
  if (isConfigured()) return;
  res.status(503);
  throw new Error("Cloudinary upload storage is not configured");
};

// Single file: field name "file"
router.post("/", upload.single("file"), asyncHandler(async (req, res) => {
  assertCloudinaryConfigured(res);
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded");
  }
  const result = await uploadToCloudinary(req.file);
  res.status(201).json({
    success: true,
    data: toUploadResponse(req.file, result),
  });
}));

// Multiple files: field name "files"
router.post("/multiple", upload.array("files", 10), asyncHandler(async (req, res) => {
  assertCloudinaryConfigured(res);
  if (!req.files?.length) {
    res.status(400);
    throw new Error("No files uploaded");
  }
  const files = await Promise.all(
    req.files.map(async (file) => toUploadResponse(file, await uploadToCloudinary(file)))
  );
  res.status(201).json({ success: true, data: files });
}));

module.exports = router;
