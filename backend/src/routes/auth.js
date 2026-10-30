import { Router } from "express";
import {
  deleteAccount,
  loginUser,
  publicUser,
  registerUser,
  requireAuth,
} from "../services/auth.js";
import { User } from "../models/User.js";

const router = Router();

// POST /api/auth/register — { email, password, name? } → { user, token }
router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    res.status(201).json(await registerUser(email, password, name));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/auth/login — { email, password } → { user, token }
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    res.json(await loginUser(email, password));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/auth/me — the logged-in account (needs the Bearer token)
// DELETE /api/auth/account — { password } → wipes data + deletes the account
router.delete("/account", requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    res.json(await deleteAccount(req.userId, password));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: "Login required" });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
