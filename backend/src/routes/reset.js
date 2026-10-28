import { Router } from "express";
import { ChatCheckpoint } from "../models/ChatCheckpoint.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { File } from "../models/File.js";
import { Folder } from "../models/Folder.js";
import { Insight } from "../models/Insight.js";
import { Note } from "../models/Note.js";

const router = Router();

// DELETE /api/reset — erase everything. Local single-user demo only:
// there is no auth, so this must go away (or be guarded) with accounts.
router.delete("/", async (req, res, next) => {
  try {
    await Promise.all([
      Note.deleteMany({}),
      Folder.deleteMany({}),
      File.deleteMany({}),
      ChatMessage.deleteMany({}),
      ChatCheckpoint.deleteMany({}),
      Insight.deleteMany({}),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
