import { Router } from "express";
import { eraseUserData, requireAuth, verifyPassword } from "../services/auth.js";

const router = Router();

router.use(requireAuth);

// DELETE /api/reset — erase the logged-in account's own data only.
// Needs { password } in the body. Other accounts are never touched.
router.delete("/", async (req, res, next) => {
  try {
    await verifyPassword(req.userId, req.body?.password);
    await eraseUserData(req.userId);
    res.json({ ok: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
