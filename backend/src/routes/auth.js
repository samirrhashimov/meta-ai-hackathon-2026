import { Router } from "express";
import {
  deleteAccount,
  loginUser,
  publicUser,
  registerUser,
  requireAuth,
} from "../services/auth.js";
import { User } from "../models/User.js";
import {
  googleAuthUrl,
  googleCallback,
  googleDest,
  peekGoogleMode,
} from "../services/google.js";

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

// GET /api/auth/google?mode=web|app -> 302 to the Google consent screen.
// mode=web returns to the site, mode=app returns to the flama:// deep link.
router.get("/google", (req, res, next) => {
  try {
    res.redirect(googleAuthUrl(req.query.mode === "app" ? "app" : "web"));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/auth/google/callback?code&state -> 302 with ?token= or ?error=.
router.get("/google/callback", async (req, res, next) => {
  try {
    const { token, mode } = await googleCallback(req.query.code, req.query.state);
    res.redirect(googleDest(mode, token, ""));
  } catch (err) {
    const mode = err.mode || peekGoogleMode(req.query.state);
    try {
      res.redirect(googleDest(mode, "", err.message || "Google login failed"));
    } catch {
      next(err);
    }
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
