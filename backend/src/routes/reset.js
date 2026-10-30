import { Router } from "express";
import { requireAuth } from "../services/auth.js";
import { ChatCheckpoint } from "../models/ChatCheckpoint.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { File } from "../models/File.js";
import { Folder } from "../models/Folder.js";
import { Insight } from "../models/Insight.js";
import { Note } from "../models/Note.js";

const router = Router();

router.use(requireAuth);

// DELETE /api/reset — erase the logged-in account's own data only.
// Other accounts are never touched.
router.delete("/", async (req, res, next) => {
  try {
    await Promise.all([
      Note.deleteMany({ userId: req.userId }),
      Folder.deleteMany({ userId: req.userId }),
      File.deleteMany({ userId: req.userId }),
      ChatMessage.deleteMany({ userId: req.userId }),
      ChatCheckpoint.deleteMany({ userId: req.userId }),
      Insight.deleteMany({ userId: req.userId }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
