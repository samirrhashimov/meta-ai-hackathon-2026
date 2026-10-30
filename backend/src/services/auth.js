import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "";
if (!JWT_SECRET) {
  console.warn(
    "WARNING: JWT_SECRET is not set. Using an insecure dev fallback; set JWT_SECRET in backend/.env."
  );
}
const SECRET = JWT_SECRET || "flama-dev-secret-change-me";
const EXPIRES_IN = "30d";

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), email: user.email }, SECRET, {
    expiresIn: EXPIRES_IN,
  });
}

function publicUser(user) {
  return { id: String(user._id), email: user.email, name: user.name || "" };
}

// Creates an account + returns it with a token. Throws 409 on duplicate email.
export async function registerUser(email, password, name = "") {
  const clean = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    const err = new Error("Email is not valid");
    err.status = 400;
    throw err;
  }
  if (!password || String(password).length < 6) {
    const err = new Error("Password must be at least 6 characters");
    err.status = 400;
    throw err;
  }
  const existing = await User.findOne({ email: clean });
  if (existing) {
    const err = new Error("An account with this email already exists");
    err.status = 409;
    throw err;
  }
  const user = await User.create({
    email: clean,
    name: String(name || "").trim().slice(0, 60),
    passwordHash: await hashPassword(String(password)),
  });
  return { user: publicUser(user), token: signToken(user) };
}

// Checks credentials + returns the account with a token. Throws 401 on failure.
export async function loginUser(email, password) {
  const clean = String(email || "").trim().toLowerCase();
  const user = await User.findOne({ email: clean });
  if (!user || !(await checkPassword(String(password || ""), user.passwordHash))) {
    const err = new Error("Wrong email or password");
    err.status = 401;
    throw err;
  }
  return { user: publicUser(user), token: signToken(user) };
}

// Route guard: needs `Authorization: Bearer <token>`, sets req.userId.
export function requireAuth(req, res, next) {
  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Login required" });
  try {
    const payload = jwt.verify(token, SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired, please log in again" });
  }
}

export { publicUser };
