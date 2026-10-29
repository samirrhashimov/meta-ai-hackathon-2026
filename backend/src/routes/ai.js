import { Router } from "express";
import { isValidObjectId } from "mongoose";
import multer from "multer";
import { aiEnabled, aiFromReq, organizeFile, organizeNote, transcribeAudio } from "../services/ai.js";
import { availableModels, revertCheckpoint, runChat } from "../services/chat.js";
import { stashUpload } from "../services/pending.js";
import { buildGraph } from "../services/graph.js";
import { getInsights } from "../services/insights.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { Note } from "../models/Note.js";
import { Folder } from "../models/Folder.js";
import { File } from "../models/File.js";

const router = Router();

// POST /api/ai/organize — { noteId }: file the note into a folder with AI.
router.post("/organize", async (req, res, next) => {
  try {
    const creds = aiFromReq(req);
    if (!aiEnabled(creds)) {
      return res
        .status(503)
        .json({ error: "AI key is not set (Settings → API Connection, or backend/.env → META_API_KEY)" });
    }
    const { noteId } = req.body;
    if (!noteId || !isValidObjectId(noteId)) {
      return res.status(400).json({ error: "Invalid noteId" });
    }
    const result = await organizeNote(noteId, creds);
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// POST /api/ai/organize/undo — { noteId, folderId?, deleteFolder? }: undo an
// AI filing. The note goes back to unfiled; an AI-created folder is removed
// only when it stayed empty (no notes, files, or subfolders inside).
router.post("/organize/undo", async (req, res, next) => {
  try {
    const { noteId, folderId = null, deleteFolder = false } = req.body;
    if (!noteId || !isValidObjectId(noteId)) {
      return res.status(400).json({ error: "Invalid noteId" });
    }
    const note = await Note.findById(noteId);
    if (!note) return res.status(404).json({ error: "Note not found" });
    note.folderId = null;
    await note.save();
    let removedFolder = false;
    if (deleteFolder && folderId && isValidObjectId(folderId)) {
      const [noteCount, fileCount, kidCount] = await Promise.all([
        Note.countDocuments({ folderId }),
        File.countDocuments({ folderId }),
        Folder.countDocuments({ parentId: folderId }),
      ]);
      if (noteCount === 0 && fileCount === 0 && kidCount === 0) {
        await Folder.findByIdAndDelete(folderId);
        removedFolder = true;
      }
    }
    res.json({ note: await note.populate("folderId", "name"), removedFolder });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/models — chat-capable models for the Assistant picker.
router.get("/models", (req, res) => {
  res.json({ models: availableModels() });
});

// POST /api/ai/chat — { message, model? }: chat turn with tool-calling.
router.post("/chat", async (req, res, next) => {
  try {
    const creds = aiFromReq(req);
    if (!aiEnabled(creds)) {
      return res
        .status(503)
        .json({ error: "AI key is not set (Settings → API Connection, or backend/.env → META_API_KEY)" });
    }
    const { message, model, attachments } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    const result = await runChat(message.trim(), model, attachments, creds);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/chat — chat history.
router.get("/chat", async (req, res, next) => {
  try {
    const messages = await ChatMessage.find().sort({ createdAt: 1 }).limit(100);
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/organize-file — { fileId }: file the upload into a folder with AI.
router.post("/organize-file", async (req, res, next) => {
  try {
    const creds = aiFromReq(req);
    if (!aiEnabled(creds)) {
      return res
        .status(503)
        .json({ error: "AI key is not set (Settings → API Connection, or backend/.env → META_API_KEY)" });
    }
    const { fileId } = req.body;
    if (!fileId || !isValidObjectId(fileId)) {
      return res.status(400).json({ error: "Invalid fileId" });
    }
    const result = await organizeFile(fileId, creds);
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

const attachUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /api/ai/attachments — form-data: file → temp chat attachment { attachment }.
// Lives only in memory (30 min) until the AI places it with saveUpload.
router.post("/attachments", attachUpload.single("file"), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const attachment = stashUpload({
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
    });
    res.status(201).json({ attachment });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/graph[?refresh=1] — knowledge-graph nodes + links
// (wikilink/tag/folder always fresh; AI links cached until notes change).
router.get("/graph", async (req, res, next) => {
  try {
    res.json(await buildGraph({ refresh: req.query.refresh === "1" }, aiFromReq(req)));
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/test — minimal model call proving the Settings key works.
router.post("/test", async (req, res, next) => {
  try {
    const creds = aiFromReq(req);
    if (!creds.key) return res.status(400).json({ error: "No API key configured" });
    const r = await fetch(`${creds.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.key}` },
      body: JSON.stringify({
        model: creds.model,
        temperature: 0,
        max_tokens: 5,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return res.status(502).json({ error: `Model unreachable (${r.status}): ${body.slice(0, 160)}` });
    }
    res.json({ ok: true, model: creds.model });
  } catch (err) {
    next(err);
  }
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /api/ai/transcribe — form-data: audio (wav) → { transcript }.
router.post("/transcribe", audioUpload.single("audio"), async (req, res, next) => {
  try {
    const creds = aiFromReq(req);
    if (!aiEnabled(creds)) {
      return res
        .status(503)
        .json({ error: "AI key is not set (Settings → API Connection, or backend/.env → META_API_KEY)" });
    }
    if (!req.file) return res.status(400).json({ error: "No audio uploaded" });
    const transcript = await transcribeAudio(req.file.buffer, creds);
    res.json({ transcript });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/revert — { messageId }: undo that answer's note/folder changes.
router.post("/revert", async (req, res, next) => {
  try {
    const { messageId } = req.body;
    if (!messageId || !isValidObjectId(messageId)) {
      return res.status(400).json({ error: "Invalid messageId" });
    }
    const result = await revertCheckpoint(messageId);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/ai/chat — clear chat history.
router.delete("/chat", async (req, res, next) => {
  try {
    await ChatMessage.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/insights — dashboard data (?refresh=1 regenerates the AI digest).
router.get("/insights", async (req, res, next) => {
  try {
    const result = await getInsights({ refresh: req.query.refresh === "1" }, aiFromReq(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
