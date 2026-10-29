import { Router } from "express";
import multer from "multer";
import path from "path";
import { isValidObjectId } from "mongoose";
import { File } from "../models/File.js";
import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { aiFromReq, tagFileInBackground, tagNoteInBackground } from "../services/ai.js";

const router = Router();

// Same accepted types as the note-attachment upload endpoint, plus
// Excalidraw scenes (JSON text, matched by extension).
const ALLOWED_TYPES = new Set(["application/pdf", "text/markdown", "text/plain"]);

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (
    file.mimetype.startsWith("image/") ||
    ALLOWED_TYPES.has(file.mimetype) ||
    ext === ".md" ||
    ext === ".excalidraw"
  ) {
    return cb(null, true);
  }
  cb(new Error("Unsupported file type (images, pdf, md, excalidraw only)"));
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
    tags: doc.tags || [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Trims, dedupes and caps a user-supplied tag list.
function sanitizeTags(tags) {
  return [...new Set(tags.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean))].slice(0, 10);
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
// Markdown never stays a file: earlier .md uploads are unified into notes here.
router.get("/", async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.folderId !== undefined) {
      if (req.query.folderId === "null" || req.query.folderId === "") filter.folderId = null;
      else if (isValidObjectId(req.query.folderId)) filter.folderId = req.query.folderId;
      else return res.status(400).json({ error: "Invalid folderId" });
    }
    const mdCandidates = await File.find({
      ...filter,
      $or: [{ mimeType: "text/markdown" }, { name: /\.md$/i }],
    }).select("_id");
    for (const c of mdCandidates) {
      // Atomic claim: a concurrent list call can only convert each file once.
      const doc = await File.findOneAndDelete({ _id: c._id });
      if (!doc) continue;
      const base = (doc.name || "note").replace(/\.md$/i, "");
      const note = await Note.create({
        title: (base.trim() || "Untitled Note").slice(0, 200),
        content: (doc.data || Buffer.alloc(0)).toString("utf8"),
        folderId: doc.folderId || null,
        tags: doc.tags || [],
      });
      tagNoteInBackground(note._id, aiFromReq(req));
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
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (req.file.mimetype === "text/markdown" || ext === ".md") {
      // Markdown uploads become real notes: filename (without .md) is the
      // title, the text is the content — identical to a created note.
      const base = path.basename(req.file.originalname, ext);
      const note = await Note.create({
        title: (base.trim() || "Untitled Note").slice(0, 200),
        content: (req.file.buffer || Buffer.alloc(0)).toString("utf8"),
        folderId,
        tags: [],
      });
      tagNoteInBackground(note._id, aiFromReq(req));
      return res.status(201).json({ note: await note.populate("folderId", "name") });
    }
    const doc = await File.create({
      name: req.file.originalname,
      folderId,
      mimeType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
    });
    // AI tags every upload in the background; the upload itself stays fast.
    tagFileInBackground(doc._id, aiFromReq(req));
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
    if (req.body.tags !== undefined) {
      if (!Array.isArray(req.body.tags))
        return res.status(400).json({ error: "Tags must be an array" });
      doc.tags = sanitizeTags(req.body.tags);
    }
    if (req.body.content !== undefined) {
      if (typeof req.body.content !== "string")
        return res.status(400).json({ error: "File content must be text" });
      const editable =
        (doc.mimeType || "").startsWith("text/") ||
        /\.md$/i.test(doc.name || "") ||
        /\.excalidraw$/i.test(doc.name || "");
      if (!editable)
        return res.status(400).json({ error: "Only text and drawing files can be edited" });
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
