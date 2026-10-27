import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { aiEnabled, organizeNote } from "../services/ai.js";
import { runChat } from "../services/chat.js";
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

// POST /api/ai/chat — { message }: chat turn with tool-calling.
router.post("/chat", async (req, res, next) => {
  try {
    if (!aiEnabled()) {
      return res
        .status(503)
        .json({ error: "AI key is not set (backend/.env → META_API_KEY)" });
    }
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }
    const result = await runChat(message.trim());
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
