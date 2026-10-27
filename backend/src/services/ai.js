import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";

// The Meta Model API is OpenAI-compatible: POST {BASE}/chat/completions
function config() {
  return {
    key: process.env.META_API_KEY || "",
    base: process.env.META_API_BASE_URL || "https://api.meta.ai/v1",
    model: process.env.META_MODEL || "muse-spark-1.3",
  };
}

// Without a key the AI counts as off — notes still save, they just don't sort.
export function aiEnabled() {
  return !!config().key;
}

// Shared by chat.js so both use the same key/base URL/model.
export function aiConfig() {
  return config();
}

// Extracts JSON from the AI reply (even with extra text around it).
function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI response is not JSON");
    return JSON.parse(m[0]);
  }
}

export async function chatJson(system, user) {
  const { key, base, model } = config();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return extractJson(text);
}

const SYSTEM = `You are a note-organizing assistant. You receive a note and the current folder list.
Return ONLY JSON, no other text. Format:
{ "folderId": "<matching folder id or null>", "newFolderName": "<new folder name or null>", "tags": ["at most 3 tags"], "summary": "<one-sentence summary>" }
Rules:
- If the note fits an existing folder, put its id in folderId and null in newFolderName.
- If no folder fits, put null in folderId and a short name in newFolderName (e.g. "Sports").
- Folder name and summary must be in the note's own language.`;

// Classifies a note: picks an existing folder or suggests a new one.
export async function classifyNote(note, folders) {
  const list = folders.map((f) => `- ${f._id}: ${f.name}`).join("\n") || "(no folders)";
  const user =
    `Folders:\n${list}\n\nTitle: ${note.title}\nContent:\n${(note.content || "").slice(0, 3000)}`;
  const out = await chatJson(SYSTEM, user);
  // Safety: the AI may return a made-up id, so verify it.
  if (out.folderId && !folders.some((f) => String(f._id) === String(out.folderId))) {
    out.folderId = null;
    if (!out.newFolderName) out.newFolderName = "General";
  }
  if (!out.folderId && !out.newFolderName) out.newFolderName = "General";
  return out;
}

// Files a note with AI: picks/creates a folder, writes tags and a summary.
export async function organizeNote(noteId) {
  const note = await Note.findById(noteId);
  if (!note) {
    const err = new Error("Note not found");
    err.status = 404;
    throw err;
  }
  const folders = await Folder.find().sort({ createdAt: 1 });
  const result = await classifyNote(note, folders);

  let folder = null;
  let created = false;
  if (result.folderId) folder = await Folder.findById(result.folderId);
  if (!folder) {
    // Don't duplicate a folder with the same name.
    folder = await Folder.findOne({ name: result.newFolderName });
    if (!folder) {
      folder = await Folder.create({ name: result.newFolderName });
      created = true;
    }
  }

  note.folderId = folder._id;
  if (result.summary) note.aiSummary = result.summary;
  if (Array.isArray(result.tags) && result.tags.length > 0) {
    note.tags = [...new Set([...(note.tags || []), ...result.tags])].slice(0, 10);
  }
  await note.save();
  await note.populate("folderId", "name");
  return { note, folder, created };
}
