import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { isValidObjectId } from "mongoose";
import { Note } from "../models/Note.js";

const router = Router();

// Uploaded files live under backend/uploads/ and are served
// publicly at GET /uploads/<file> (see index.js).
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = new Set(["application/pdf", "text/markdown", "text/plain"]);

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith("image/") || ALLOWED_TYPES.has(file.mimetype) || ext === ".md") {
    return cb(null, true);
  }
  cb(new Error("Unsupported file type (images, pdf, md only)"));
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/upload — form-data: file + noteId?
// With noteId the file is appended to that note's attachments.
router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const info = {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
    };
    const { noteId } = req.body;
    if (noteId) {
      if (!isValidObjectId(noteId)) return res.status(400).json({ error: "Invalid noteId" });
      const note = await Note.findByIdAndUpdate(
        noteId,
        { $push: { attachments: info } },
        { new: true }
      ).populate("folderId", "name");
      if (!note) return res.status(404).json({ error: "Note not found" });
      return res.status(201).json({ file: info, note });
    }
    res.status(201).json({ file: info });
  } catch (err) {
    next(err);
  }
});

export default router;
