const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../lib/middleware');

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../public/uploads/events');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  },
});

// POST /api/uploads/event-image
router.post('/event-image', requireAuth(['organizer']), upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file provided.' });
  }
  const url = `/uploads/events/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

// DELETE /api/uploads/event-image — cleanup uploaded file if event save fails
router.delete('/event-image', requireAuth(['organizer']), (req, res) => {
  const { filename, url } = req.body || {};
  const targetFilename = filename || (url ? path.basename(url) : null);

  if (!targetFilename) {
    return res.status(400).json({ message: 'filename or url required.' });
  }

  // Prevent path traversal
  const safeFilename = path.basename(targetFilename);
  const filePath = path.join(uploadDir, safeFilename);

  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to delete image file.' });
      }
      return res.json({ ok: true, message: 'Uploaded image file deleted.' });
    });
  } else {
    return res.json({ ok: true, message: 'File not found, nothing to delete.' });
  }
});

module.exports = router;
