import { randomUUID } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User.js";
import { publicUser, signToken } from "./auth.js";

// Google sign in for both surfaces:
// - web: browser tab navigates straight to Google, callback lands on #/auth/callback
// - desktop: Tauri opens the system browser (Google blocks sign in inside
//   embedded webviews), and Google redirects to the flama:// deep link.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "";
const FRONTEND_URL = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");

export function googleConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && CALLBACK_URL);
}

function client() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, CALLBACK_URL);
}

// One time login states: state -> { mode, exp }. Deleted on first use.
const states = new Map();

export function peekGoogleMode(state) {
  const entry = states.get(state);
  return entry && entry.exp > Date.now() ? entry.mode : "web";
}

export function googleAuthUrl(mode) {
  if (!googleConfigured()) {
    const err = new Error("Google sign in is not set up on this server");
    err.status = 400;
    throw err;
  }
  const m = mode === "app" ? "app" : "web";
  const state = randomUUID();
  states.set(state, { mode: m, exp: Date.now() + 10 * 60 * 1000 });
  return client().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
  });
}

export function googleDest(mode, token, error) {
  const q = error
    ? `?error=${encodeURIComponent(error)}`
    : `?token=${encodeURIComponent(token)}`;
  if (mode === "app") return `flama://auth/callback${q}`;
  return `${FRONTEND_URL}/#/auth/callback${q}`;
}

export async function googleCallback(code, state) {
  const entry = states.get(state);
  states.delete(state);
  const mode = entry && entry.exp > Date.now() ? entry.mode : "web";
  if (!entry || entry.exp <= Date.now()) {
    const err = new Error("Login session expired, please try again");
    err.status = 400;
    err.mode = mode;
    throw err;
  }
  if (!code) {
    const err = new Error("Google login was cancelled");
    err.status = 400;
    err.mode = mode;
    throw err;
  }
  let profile;
  try {
    const c = client();
    const { tokens } = await c.getToken(code);
    const ticket = await c.verifyIdToken({
      idToken: tokens.id_token,
      audience: CLIENT_ID,
    });
    profile = ticket.getPayload();
  } catch {
    const err = new Error("Google login failed, please try again");
    err.status = 401;
    err.mode = mode;
    throw err;
  }
  if (!profile || !profile.email_verified || !profile.email || !profile.sub) {
    const err = new Error("Google login failed, please try again");
    err.status = 401;
    err.mode = mode;
    throw err;
  }
  const email = profile.email.toLowerCase();
  let user = await User.findOne({
    $or: [{ googleId: profile.sub }, { email }],
  });
  if (user && !user.googleId) {
    // Same email registered with a password before: link the Google identity.
    user.googleId = profile.sub;
    if (profile.name && !user.name) user.name = String(profile.name).slice(0, 60);
    await user.save();
  }
  if (!user) {
    user = await User.create({
      email,
      name: String(profile.name || "").slice(0, 60),
      googleId: profile.sub,
    });
  }
  return { user: publicUser(user), token: signToken(user), mode };
}
