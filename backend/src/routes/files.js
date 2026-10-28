import { Router } from "express";
import multer from "multer";
import path from "path";
import { isValidObjectId } from "mongoose";
import { File } from "../models/File.js";
import { Folder } from "../models/Folder.js";

const router = Router();

// Same accepted types as the note-attachment upload endpoint.
const ALLOWED_TYPES = new Set(["application/pdf", "text/markdown", "text/plain"]);

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith("image/") || ALLOWED_TYPES.has(file.mimetype) || ext === ".md") {
    return cb(null, true);
  }
  cb(new Error("Unsupported file type (images, pdf, md only)"));
}

// Memory storage: the buffer goes straight into MongoDB (no disk copy).
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Metadata without the binary payload.
function toMeta(doc) {
  return {
    _id: doc._id,
    name: doc.name,
    folderId: doc.folderId,
    mimeType: doc.mimeType,
    size: doc.size,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function assertFolder(folderId) {
  if (folderId === null || folderId === undefined || folderId === "") return null;
  if (!isValidObjectId(folderId)) {
    const err = new Error("Invalid folderId");
    err.status = 400;
    throw err;
  }
  const folder = await Folder.findById(folderId);
  if (!folder) {
    const err = new Error("Folder not found");
    err.status = 404;
    throw err;
  }
  return folder._id;
}

// GET /api/files — all file metadata (filterable with ?folderId=...)
router.get("/", async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.folderId !== undefined) {
      if (req.query.folderId === "null" || req.query.folderId === "") filter.folderId = null;
      else if (isValidObjectId(req.query.folderId)) filter.folderId = req.query.folderId;
      else return res.status(400).json({ error: "Invalid folderId" });
    }
    const files = await File.find(filter).select("-data").sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    next(err);
  }
});

// POST /api/files — form-data: file + folderId? (binary stored in MongoDB)
router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    let folderId = null;
    try {
      folderId = await assertFolder(req.body.folderId ?? null);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const doc = await File.create({
      name: req.file.originalname,
      folderId,
      mimeType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
    });
    res.status(201).json({ file: toMeta(doc) });
  } catch (err) {
    next(err);
  }
});

// GET /api/files/:id/content — raw bytes with the stored content type
router.get("/:id/content", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const doc = await File.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "File not found" });
    res.set("Content-Type", doc.mimeType || "application/octet-stream");
    res.set("Content-Length", String(doc.data.length));
    res.set("Content-Disposition", `inline; filename="${doc.name.replace(/"/g, "")}"`);
    res.send(doc.data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/files/:id — rename / move / edit text { name?, folderId?, content? }
router.put("/:id", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const doc = await File.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "File not found" });
    if (req.body.name !== undefined) {
      if (!req.body.name || !req.body.name.trim())
        return res.status(400).json({ error: "File name is required" });
      doc.name = req.body.name.trim();
    }
    if (req.body.folderId !== undefined) {
      try {
        doc.folderId = await assertFolder(req.body.folderId);
      } catch (err) {
        return res.status(err.status || 400).json({ error: err.message });
      }
    }
    if (req.body.content !== undefined) {
      if (typeof req.body.content !== "string")
        return res.status(400).json({ error: "File content must be text" });
      const editable =
        (doc.mimeType || "").startsWith("text/") || /\.md$/i.test(doc.name || "");
      if (!editable)
        return res.status(400).json({ error: "Only text files can be edited" });
      doc.data = Buffer.from(req.body.content, "utf8");
      doc.size = doc.data.length;
    }
    await doc.save();
    res.json(toMeta(doc));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/files/:id — remove the file and its binary
router.delete("/:id", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const doc = await File.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "File not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
