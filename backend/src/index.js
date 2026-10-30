import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { connectDB } from "./config/db.js";
import authRouter from "./routes/auth.js";
import foldersRouter from "./routes/folders.js";
import notesRouter from "./routes/notes.js";
import uploadRouter from "./routes/upload.js";
import filesRouter from "./routes/files.js";
import aiRouter from "./routes/ai.js";
import resetRouter from "./routes/reset.js";

const app = express();

// The frontend (Vite, :5173) runs on another port, so CORS is open.
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/folders", foldersRouter);
app.use("/api/notes", notesRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/files", filesRouter);
app.use("/api/ai", aiRouter);
app.use("/api/reset", resetRouter);

// Uploaded files: GET /uploads/<file>
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Unknown route -> 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Central error handler: turns client errors into 400s, and honors an
// explicit status (e.g. 502 from modelError) so the real reason reaches UI.
app.use((err, req, res, next) => {
  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({ error: err.message });
  }
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.code && String(err.code).startsWith("LIMIT_")) {
    return res.status(400).json({ error: "File too large (max 10MB)" });
  }
  if (err.message && err.message.startsWith("Unsupported file type")) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const PORT = process.env.PORT || 5000;

try {
  if (!process.env.MONGODB_URI) {
    console.error("ERROR: MONGODB_URI is not set. Check backend/.env.");
    process.exit(1);
  }
  await connectDB(process.env.MONGODB_URI);
  app.listen(PORT, () => console.log(`Backend running: http://localhost:${PORT}`));
} catch (err) {
  console.error("ERROR: Could not connect to MongoDB:", err.message);
  process.exit(1);
}
