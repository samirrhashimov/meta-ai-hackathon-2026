import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { requireAuth } from "../services/auth.js";
import { Note } from "../models/Note.js";
import { Folder } from "../models/Folder.js";
import { aiEnabled, aiFromReq, organizeNote, tagNoteInBackground } from "../services/ai.js";

const router = Router();

router.use(requireAuth);

// GET /api/notes — all notes (filterable with ?folderId=... and ?search=...)
router.get("/", async (req, res, next) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.folderId !== undefined) {
      if (req.query.folderId === "null" || req.query.folderId === "")
        filter.folderId = null;
      else if (isValidObjectId(req.query.folderId)) filter.folderId = req.query.folderId;
      else return res.status(400).json({ error: "Invalid folderId" });
    }
    if (req.query.search) filter.$text = { $search: req.query.search };
    const notes = await Note.find(filter)
      .populate("folderId", "name")
      .sort({ updatedAt: -1 });
    res.json(notes);
  } catch (err) {
    next(err);
  }
});

// POST /api/notes — new note { title, content?, folderId?, tags?, autoSort? }
router.post("/", async (req, res, next) => {
  try {
    const { title, content = "", folderId = null, tags = [], autoSort = false } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "Note title is required" });
    if (folderId !== null) {
      if (!isValidObjectId(folderId)) return res.status(400).json({ error: "Invalid folderId" });
      const folder = await Folder.findOne({ _id: folderId, userId: req.userId });
      if (!folder) return res.status(404).json({ error: "Folder not found" });
    }
    let note = await Note.create({
      title: title.trim(),
      content,
      folderId,
      tags,
      userId: req.userId,
    });
    const creds = aiFromReq(req);
    // AI tags every note in the background; the save itself stays fast.
    tagNoteInBackground(note._id, creds, req.userId);
    // autoSort: AI picks/creates a matching folder. The note stays as-is on failure.
    if (autoSort && aiEnabled(creds)) {
      try {
        note = (await organizeNote(note._id, creds, req.userId)).note;
      } catch (err) {
        console.error("Auto-sort failed:", err.message);
      }
    }
    res.status(201).json(await note.populate("folderId", "name"));
  } catch (err) {
    next(err);
  }
});

// GET /api/notes/:id — one note
router.get("/:id", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const note = await Note.findOne({ _id: req.params.id, userId: req.userId }).populate(
      "folderId",
      "name"
    );
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json(note);
  } catch (err) {
    next(err);
  }
});

// PUT /api/notes/:id — update { title?, content?, folderId?, tags? }
router.put("/:id", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const updates = {};
    if (req.body.title !== undefined) {
      if (!req.body.title.trim()) return res.status(400).json({ error: "Title cannot be empty" });
      updates.title = req.body.title.trim();
    }
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.tags !== undefined) updates.tags = req.body.tags;
    if (req.body.locked !== undefined) updates.locked = !!req.body.locked;
    if (req.body.attachments !== undefined) updates.attachments = req.body.attachments;
    if (req.body.folderId !== undefined) {
      const folderId = req.body.folderId;
      if (folderId !== null) {
        if (!isValidObjectId(folderId)) return res.status(400).json({ error: "Invalid folderId" });
        const folder = await Folder.findOne({ _id: folderId, userId: req.userId });
        if (!folder) return res.status(404).json({ error: "Folder not found" });
      }
      updates.folderId = folderId;
    }
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updates,
      { new: true, runValidators: true }
    ).populate("folderId", "name");
    if (!note) return res.status(404).json({ error: "Note not found" });
    // Changed text gets fresh AI tags in the background (manual tags are kept).
    if (req.body.title !== undefined || req.body.content !== undefined) {
      tagNoteInBackground(note._id, aiFromReq(req), req.userId);
    }
    res.json(note);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notes/:id — delete
router.delete("/:id", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const note = await Note.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!note) return res.status(404).json({ error: "Note not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
