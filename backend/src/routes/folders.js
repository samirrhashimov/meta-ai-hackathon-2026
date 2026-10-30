import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { requireAuth } from "../services/auth.js";
import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";

const router = Router();

router.use(requireAuth);

// GET /api/folders — all folders (filterable with ?parentId)
router.get("/", async (req, res, next) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.parentId !== undefined) {
      if (req.query.parentId === "null" || req.query.parentId === "") filter.parentId = null;
      else if (isValidObjectId(req.query.parentId)) filter.parentId = req.query.parentId;
      else return res.status(400).json({ error: "Invalid parentId" });
    }
    const folders = await Folder.find(filter).sort({ createdAt: 1 });
    res.json(folders);
  } catch (err) {
    next(err);
  }
});

// POST /api/folders — new folder { name, parentId? }
router.post("/", async (req, res, next) => {
  try {
    const { name, parentId = null } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Folder name is required" });
    if (parentId !== null) {
      if (!isValidObjectId(parentId)) return res.status(400).json({ error: "Invalid parentId" });
      const parent = await Folder.findOne({ _id: parentId, userId: req.userId });
      if (!parent) return res.status(404).json({ error: "Parent folder not found" });
    }
    const folder = await Folder.create({ name: name.trim(), parentId, userId: req.userId });
    res.status(201).json(folder);
  } catch (err) {
    next(err);
  }
});

// GET /api/folders/:id — one folder
router.get("/:id", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const folder = await Folder.findOne({ _id: req.params.id, userId: req.userId });
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (err) {
    next(err);
  }
});

// PUT /api/folders/:id — update { name?, parentId? }
router.put("/:id", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const updates = {};
    if (req.body.name !== undefined) {
      if (!req.body.name.trim()) return res.status(400).json({ error: "Folder name cannot be empty" });
      updates.name = req.body.name.trim();
    }
    if (req.body.locked !== undefined) updates.locked = !!req.body.locked;
    if (req.body.parentId !== undefined) {
      const parentId = req.body.parentId;
      if (parentId !== null) {
        if (!isValidObjectId(parentId)) return res.status(400).json({ error: "Invalid parentId" });
        if (parentId === req.params.id)
          return res.status(400).json({ error: "A folder cannot be moved under itself" });
        const parent = await Folder.findOne({ _id: parentId, userId: req.userId });
        if (!parent) return res.status(404).json({ error: "Parent folder not found" });
        // Cycle guard: the new parent must not be a descendant of the moved folder.
        let cur = parent;
        while (cur) {
          if (String(cur._id) === req.params.id)
            return res.status(400).json({ error: "A folder cannot be moved into its own subfolder" });
          cur = cur.parentId
            ? await Folder.findOne({ _id: cur.parentId, userId: req.userId }).select("parentId")
            : null;
        }
      }
      updates.parentId = parentId;
    }
    const folder = await Folder.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/folders/:id — delete; contents become unfiled (not deleted)
router.delete("/:id", async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
    const folder = await Folder.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    await Folder.updateMany({ parentId: folder._id, userId: req.userId }, { parentId: null });
    await Note.updateMany({ folderId: folder._id, userId: req.userId }, { folderId: null });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
