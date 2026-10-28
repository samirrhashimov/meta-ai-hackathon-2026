import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { File } from "../models/File.js";

// The Meta Model API is OpenAI-compatible: POST {BASE}/chat/completions
function config() {
  return {
    key: process.env.META_API_KEY || "",
    base: process.env.META_API_BASE_URL || "https://api.meta.ai/v1",
    model: process.env.META_MODEL || "muse-spark-1.3-contributor",
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

// Muse Voice Transcribe (speech-to-text) over the Model API file endpoint.
const TRANSCRIBE_MODEL = process.env.MUSE_TRANSCRIBE_MODEL || "muse-voice-transcribe-1.0";

// Sends a WAV recording to Muse Voice Transcribe, returns the text.
// Language is autodetected (supports 25 languages with code-switching).
export async function transcribeAudio(wavBuffer) {
  const { key, base } = config();
  const form = new FormData();
  form.append(
    "request",
    new Blob(
      [JSON.stringify({ mode: "PUSH_TO_TALK", model: TRANSCRIBE_MODEL, audioEncoding: "WAV" })],
      { type: "application/json" }
    )
  );
  form.append("audio", new Blob([wavBuffer], { type: "audio/wav" }), "recording.wav");
  const res = await fetch(`${base}/asr/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Transcription failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.transcript || "").trim();
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

const TAG_SYSTEM = `You suggest tags for notes and uploaded files. Return ONLY JSON, no other text. Format:
{ "tags": ["at most 5 tags"] }
Rules:
- short, lowercase tags, single words when possible (e.g. "sports", "meal-plan")
- use the item's own language
- describe what the item is about, not its file type`;

// Suggests tags for a title + text hint. Never throws — returns [] instead.
export async function generateTags(title, hint) {
  if (!aiEnabled()) return [];
  try {
    const out = await chatJson(
      TAG_SYSTEM,
      `Title: ${title}\nHint:\n${(hint || "").slice(0, 2000)}`
    );
    if (!Array.isArray(out.tags)) return [];
    return [
      ...new Set(
        out.tags
          .filter((t) => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      ),
    ].slice(0, 5);
  } catch (err) {
    console.error("Tag generation failed:", err.message);
    return [];
  }
}

function mergeTags(current, fresh) {
  return [...new Set([...(current || []), ...fresh])].slice(0, 10);
}

// Fire-and-forget: enriches a note with AI tags without slowing the response.
// Re-reads the note first so concurrent saves (e.g. organize) are not lost.
export function tagNoteInBackground(noteId) {
  if (!aiEnabled()) return;
  (async () => {
    const note = await Note.findById(noteId);
    if (!note) return;
    const fresh = await generateTags(note.title, note.content);
    if (fresh.length === 0) return;
    const latest = await Note.findById(noteId);
    if (!latest) return;
    latest.tags = mergeTags(latest.tags, fresh);
    await latest.save();
  })().catch((e) => console.error("Background note tagging failed:", e.message));
}

const FILE_SYSTEM = `You are a file-organizing assistant. You receive a file description and the current folder list.
Return ONLY JSON, no other text. Format:
{ "folderId": "<matching folder id or null>", "newFolderName": "<new folder name or null>", "tags": ["at most 3 tags"] }
Rules:
- If the file fits an existing folder, put its id in folderId and null in newFolderName.
- If no folder fits, put null in folderId and a short name in newFolderName (e.g. "Images").
- Folder name and tags must be in the file name's language (default English).`;

// Files an upload with AI: picks/creates a folder, merges tags.
// Text files contribute a content sample; images/pdfs are judged by name + type.
export async function organizeFile(fileId) {
  const file = await File.findById(fileId);
  if (!file) {
    const err = new Error("File not found");
    err.status = 404;
    throw err;
  }
  const folders = await Folder.find().sort({ createdAt: 1 });
  let hint = `Name: ${file.name}\nType: ${file.mimeType || "unknown"}\nSize: ${file.size || 0} bytes`;
  if ((file.mimeType || "").startsWith("text/") && file.data) {
    hint += `\nContent:\n${file.data.toString("utf8").slice(0, 2000)}`;
  }
  const list = folders.map((f) => `- ${f._id}: ${f.name}`).join("\n") || "(no folders)";
  const result = await chatJson(FILE_SYSTEM, `Folders:\n${list}\n\n${hint}`);
  // Safety: the AI may return a made-up id, so verify it.
  if (result.folderId && !folders.some((f) => String(f._id) === String(result.folderId))) {
    result.folderId = null;
    if (!result.newFolderName) result.newFolderName = "General";
  }
  if (!result.folderId && !result.newFolderName) result.newFolderName = "General";

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

  file.folderId = folder._id;
  if (Array.isArray(result.tags) && result.tags.length > 0) {
    file.tags = [...new Set([...(file.tags || []), ...result.tags])].slice(0, 10);
  }
  await file.save();
  // Never leak the binary payload in the JSON response.
  const plain = file.toObject();
  delete plain.data;
  return { file: plain, folder, created };
}

// Fire-and-forget: enriches an uploaded file with AI tags from its name.
export function tagFileInBackground(fileId) {
  if (!aiEnabled()) return;
  (async () => {
    const f = await File.findById(fileId);
    if (!f) return;
    const fresh = await generateTags(
      f.name,
      `A ${f.mimeType || "file"} named "${f.name}" (${f.size || 0} bytes)`
    );
    if (fresh.length === 0) return;
    const latest = await File.findById(fileId);
    if (!latest) return;
    latest.tags = mergeTags(latest.tags, fresh);
    await latest.save();
  })().catch((e) => console.error("Background file tagging failed:", e.message));
}
