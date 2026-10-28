import { Router } from "express";
import { isValidObjectId } from "mongoose";
import multer from "multer";
import { aiEnabled, organizeFile, organizeNote, transcribeAudio } from "../services/ai.js";
import { availableModels, revertCheckpoint, runChat } from "../services/chat.js";
import { getInsights } from "../services/insights.js";
import { ChatMessage } from "../models/ChatMessage.js";

const router = Router();

// POST /api/ai/organize — { noteId }: file the note into a folder with AI.
router.post("/organize", async (req, res, next) => {
  try {
    if (!aiEnabled()) {
      return res
        .status(503)
        .json({ error: "AI key is not set (backend/.env → META_API_KEY)" });
    }
    const { noteId } = req.body;
    if (!noteId || !isValidObjectId(noteId)) {
      return res.status(400).json({ error: "Invalid noteId" });
    }
    const result = await organizeNote(noteId);
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
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
    if (!aiEnabled()) {
      return res
        .status(503)
        .json({ error: "AI key is not set (backend/.env → META_API_KEY)" });
    }
    const { message, model } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    const result = await runChat(message.trim(), model);
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
    if (!aiEnabled()) {
      return res
        .status(503)
        .json({ error: "AI key is not set (backend/.env → META_API_KEY)" });
    }
    const { fileId } = req.body;
    if (!fileId || !isValidObjectId(fileId)) {
      return res.status(400).json({ error: "Invalid fileId" });
    }
    const result = await organizeFile(fileId);
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
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
    if (!aiEnabled()) {
      return res
        .status(503)
        .json({ error: "AI key is not set (backend/.env → META_API_KEY)" });
    }
    if (!req.file) return res.status(400).json({ error: "No audio uploaded" });
    const transcript = await transcribeAudio(req.file.buffer);
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
    const result = await getInsights({ refresh: req.query.refresh === "1" });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
