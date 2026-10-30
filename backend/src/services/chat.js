import { isValidObjectId } from "mongoose";
import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { File } from "../models/File.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { aiConfig, modelError, tagFileInBackground, tagNoteInBackground } from "./ai.js";
import { opAfter, revertCheckpoint, saveCheckpoint, snapshotBefore } from "./checkpoints.js";
import { peekUpload, takeUpload } from "./pending.js";

export { revertCheckpoint };

// Tools the chat model may call (OpenAI function-calling format).
const TOOLS = [
  {
    type: "function",
    function: {
      name: "listFolders",
      description: "List all folders with their ids and names.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "createFolder",
      description: "Create a folder.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Folder name" },
          parentId: { type: "string", description: "Parent folder id, or null for root" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listNotes",
      description: "List notes (titles only) with optional folder/search filter.",
      parameters: {
        type: "object",
        properties: {
          folderId: { type: "string", description: "Only notes in this folder" },
          search: { type: "string", description: "Full-text search in title and content" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getNote",
      description: "Read one note with its full content.",
      parameters: {
        type: "object",
        properties: { noteId: { type: "string" } },
        required: ["noteId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createNote",
      description: "Create a note.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string", description: "Markdown content" },
          folderId: { type: "string", description: "Folder id, or null for unfiled" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateNote",
      description: "Update a note's title and/or content.",
      parameters: {
        type: "object",
        properties: {
          noteId: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
        },
        required: ["noteId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "moveNote",
      description: "Move a note into a folder (null = unfiled).",
      parameters: {
        type: "object",
        properties: {
          noteId: { type: "string" },
          folderId: { type: "string", description: "Folder id, or null for unfiled" },
        },
        required: ["noteId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteNote",
      description: "Delete a note permanently.",
      parameters: {
        type: "object",
        properties: { noteId: { type: "string" } },
        required: ["noteId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listFiles",
      description: "List uploaded files (images, pdfs) with ids, names, types and folder placement.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getFile",
      description: "Read an uploaded file's metadata and, for text files, its content.",
      parameters: {
        type: "object",
        properties: { fileId: { type: "string" } },
        required: ["fileId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "moveFile",
      description: "Move an uploaded file into a folder (null = unfiled).",
      parameters: {
        type: "object",
        properties: {
          fileId: { type: "string" },
          folderId: { type: "string", description: "Folder id, or null for unfiled" },
        },
        required: ["fileId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readUpload",
      description:
        "Read a +/dropped chat attachment's metadata and, for text files, its content.",
      parameters: {
        type: "object",
        properties: { attachmentId: { type: "string" } },
        required: ["attachmentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "saveUpload",
      description:
        "Place a +/dropped chat attachment into the library: a folder's file, or a real note for markdown. Consumes the attachment.",
      parameters: {
        type: "object",
        properties: {
          attachmentId: { type: "string" },
          folderId: { type: "string", description: "Folder id, or null for unfiled" },
          name: { type: "string", description: "File/note name override" },
        },
        required: ["attachmentId"],
      },
    },
  },
];

function brief(note) {
  return { _id: note._id, title: note.title, folderId: note.folderId, tags: note.tags };
}

// Runs one tool call and returns a JSON-able result.
async function runTool(name, args, creds, userId) {
  switch (name) {
    case "listFolders": {
      const folders = await Folder.find({ userId }).sort({ createdAt: 1 });
      return folders.map((f) => ({ _id: f._id, name: f.name, parentId: f.parentId }));
    }
    case "createFolder": {
      if (!args.name) throw new Error("name is required");
      const parentId = args.parentId || null;
      if (parentId && !isValidObjectId(parentId)) throw new Error("Invalid parentId");
      const folder = await Folder.create({ name: args.name, parentId, userId });
      return { _id: folder._id, name: folder.name, parentId: folder.parentId };
    }
    case "listNotes": {
      const filter = { userId };
      if (args.folderId) {
        if (!isValidObjectId(args.folderId)) throw new Error("Invalid folderId");
        filter.folderId = args.folderId;
      }
      if (args.search) filter.$text = { $search: args.search };
      const notes = await Note.find(filter).sort({ updatedAt: -1 }).limit(50);
      return notes.map(brief);
    }
    case "getNote": {
      if (!isValidObjectId(args.noteId)) throw new Error("Invalid noteId");
      const note = await Note.findOne({ _id: args.noteId, userId });
      if (!note) throw new Error("Note not found");
      return { ...brief(note), content: note.content, aiSummary: note.aiSummary };
    }
    case "createNote": {
      if (!args.title) throw new Error("title is required");
      const folderId = args.folderId || null;
      if (folderId && !isValidObjectId(folderId)) throw new Error("Invalid folderId");
      const note = await Note.create({
        title: args.title,
        content: args.content || "",
        folderId,
        userId,
      });
      return brief(note);
    }
    case "updateNote": {
      if (!isValidObjectId(args.noteId)) throw new Error("Invalid noteId");
      const updates = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.content !== undefined) updates.content = args.content;
      const note = await Note.findOneAndUpdate({ _id: args.noteId, userId }, updates, {
        new: true,
      });
      if (!note) throw new Error("Note not found");
      return brief(note);
    }
    case "moveNote": {
      if (!isValidObjectId(args.noteId)) throw new Error("Invalid noteId");
      const folderId = args.folderId || null;
      if (folderId) {
        if (!isValidObjectId(folderId)) throw new Error("Invalid folderId");
        if (!(await Folder.findOne({ _id: folderId, userId }))) throw new Error("Folder not found");
      }
      const note = await Note.findOneAndUpdate({ _id: args.noteId, userId }, { folderId }, {
        new: true,
      });
      if (!note) throw new Error("Note not found");
      return brief(note);
    }
    case "deleteNote": {
      if (!isValidObjectId(args.noteId)) throw new Error("Invalid noteId");
      const note = await Note.findOneAndDelete({ _id: args.noteId, userId });
      if (!note) throw new Error("Note not found");
      return { deleted: args.noteId };
    }
    case "listFiles": {
      const files = await File.find({ userId })
        .select("-data")
        .sort({ updatedAt: -1 })
        .limit(100);
      return files.map((f) => ({
        _id: f._id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        folderId: f.folderId,
        tags: f.tags,
      }));
    }
    case "getFile": {
      if (!isValidObjectId(args.fileId)) throw new Error("Invalid fileId");
      const file = await File.findOne({ _id: args.fileId, userId });
      if (!file) throw new Error("File not found");
      const out = {
        _id: file._id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        folderId: file.folderId,
        tags: file.tags,
      };
      const textual =
        (file.mimeType || "").startsWith("text/") || /\.md$/i.test(file.name || "");
      if (textual && file.data) out.content = file.data.toString("utf8").slice(0, 4000);
      return out;
    }
    case "moveFile": {
      if (!isValidObjectId(args.fileId)) throw new Error("Invalid fileId");
      const folderId = args.folderId || null;
      if (folderId) {
        if (!isValidObjectId(folderId)) throw new Error("Invalid folderId");
        if (!(await Folder.findOne({ _id: folderId, userId }))) throw new Error("Folder not found");
      }
      const file = await File.findOneAndUpdate({ _id: args.fileId, userId }, { folderId }, {
        new: true,
      });
      if (!file) throw new Error("File not found");
      return { _id: file._id, name: file.name, folderId: file.folderId };
    }
    case "readUpload": {
      const up = peekUpload(args.attachmentId, userId);
      if (!up) throw new Error("Attachment not found or expired");
      const out = { id: up.id, name: up.name, mimeType: up.mimeType, size: up.size };
      const textual =
        (up.mimeType || "").startsWith("text/") || /\.md$/i.test(up.name || "");
      if (textual && up.data) out.content = up.data.toString("utf8").slice(0, 4000);
      return out;
    }
    case "saveUpload": {
      const up = takeUpload(args.attachmentId, userId);
      if (!up) throw new Error("Attachment not found or expired");
      const folderId = args.folderId || null;
      if (folderId) {
        if (!isValidObjectId(folderId)) throw new Error("Invalid folderId");
        if (!(await Folder.findOne({ _id: folderId, userId }))) throw new Error("Folder not found");
      }
      const name = (args.name || up.name || "upload").trim() || "upload";
      if (up.mimeType === "text/markdown" || /\.md$/i.test(name)) {
        const base = name.replace(/\.md$/i, "");
        const note = await Note.create({
          title: (base.trim() || "Untitled Note").slice(0, 200),
          content: (up.data || Buffer.alloc(0)).toString("utf8"),
          folderId,
          tags: [],
          userId,
        });
        tagNoteInBackground(note._id, creds, userId);
        return { _id: note._id, kind: "note", name: note.title, folderId };
      }
      const file = await File.create({
        name,
        folderId,
        mimeType: up.mimeType,
        size: up.size,
        data: up.data,
        tags: [],
        userId,
      });
      tagFileInBackground(file._id, creds, userId);
      return { _id: file._id, kind: "file", name: file.name, folderId };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const CHAT_SYSTEM = `You are the assistant of a note-taking app. You manage the user's notes and folders with tools.
Rules:
- To act on existing notes/folders, first look at the current state with listNotes/listFolders. Never invent ids.
- After acting, briefly confirm what you did (note titles and folder names, not ids).
- Keep answers short. Respond in the user's language.
- Never use em dashes (—) or long dashes in your replies. Use commas, colons, or short sentences instead.
- Attached items appear under "Attachments": @-mentioned notes/folders/files already live in the library (use listNotes/getNote/listFiles/getFile/moveFile). Files added with + or drag-drop arrive as [upload]: they live only in this chat, so read them with readUpload and place them with saveUpload (markdown becomes a real note).`;

// Safety net for the no-em-dash rule: rewrite any that slip through.
function cleanReply(text) {
  return (text || "")
    .replace(/[ \t]+—[ \t]+/g, ", ")
    .replace(/—/g, ",")
    .replace(/ ,/g, ",")
    .replace(/,{2,}/g, ",")
    .replace(/^,\s*/gm, "");
}

// Chat-capable models the user may pick in the Assistant header.
// Extend/override with backend/.env: META_MODELS="muse-spark-1.3,other-model".
// Contributor tiers are cheaper but Meta may train on your content.
const ALLOWED_MODELS = (
  process.env.META_MODELS ||
  "muse-spark-1.3,muse-spark-1.3-contributor,muse-spark-1.2,muse-spark-1.2-contributor,muse-spark-1.1,muse-wonder-1.0"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function availableModels() {
  return ALLOWED_MODELS;
}

async function chatCompletion(messages, model, creds) {
  const env = aiConfig();
  const { key = env.key, base = env.base } = creds || {};
  // A custom Settings key may serve models outside the backend allowlist.
  const customKey = key && key !== env.key;
  const fallback = (creds && creds.model) || env.model;
  const useModel = customKey || ALLOWED_MODELS.includes(model) ? model : fallback;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: useModel, temperature: 0.3, messages, tools: TOOLS }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw modelError("AI request", res.status, body);
  }
  const data = await res.json();
  return data.choices?.[0]?.message;
}

// One chat turn: saves the user message, runs the tool loop, saves and returns the reply.
// attachments: [{ kind: "note"|"folder"|"file", id }] referenced with @ or +.
export async function runChat(userText, model, attachments = [], creds, userId) {
  const attachLines = [];
  for (const a of attachments || []) {
    try {
      if (!a || !a.id) continue;
      if (a.kind === "upload") {
        const u = peekUpload(a.id, userId);
        if (u)
          attachLines.push(
            `- [upload] "${u.name}" (${u.mimeType || "file"}, id ${u.id}, ${u.size || 0} bytes)`
          );
        continue;
      }
      if (!isValidObjectId(a.id)) continue;
      if (a.kind === "note") {
        const n = await Note.findOne({ _id: a.id, userId }).lean();
        if (n) attachLines.push(`- [note] "${n.title}" (id ${n._id}, folder ${n.folderId || "unfiled"})`);
      } else if (a.kind === "folder") {
        const f = await Folder.findOne({ _id: a.id, userId }).lean();
        if (f) attachLines.push(`- [folder] "${f.name}" (id ${f._id})`);
      } else if (a.kind === "file") {
        const f = await File.findOne({ _id: a.id, userId }).select("-data").lean();
        if (f)
          attachLines.push(
            `- [file] "${f.name}" (${f.mimeType || "file"}, id ${f._id}, ${f.folderId ? `folder ${f.folderId}` : "unfiled"})`
          );
      }
    } catch {
      // skip unresolvable attachments
    }
  }
  const fullText =
    attachLines.length > 0
      ? `${userText}\n\nAttachments the user referenced with @:\n${attachLines.join("\n")}`
      : userText;
  await ChatMessage.create({ role: "user", content: userText, userId });
  const history = await ChatMessage.find({ userId }).sort({ createdAt: 1 }).limit(50);
  const messages = [
    { role: "system", content: CHAT_SYSTEM },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  if (attachLines.length > 0) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) lastUser.content = fullText;
  }

  const actions = [];
  const pendingOps = []; // undo ops for this answer's checkpoint
  for (let i = 0; i < 6; i++) {
    const msg = await chatCompletion(messages, model, creds);
    if (!msg) throw new Error("Empty AI response");
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = cleanReply(msg.content || "");
      const replyDoc = await ChatMessage.create({ role: "assistant", content: reply, userId });
      const checkpoint = pendingOps.length > 0;
      if (checkpoint) await saveCheckpoint(replyDoc._id, pendingOps, userId);
      return { reply, actions, checkpoint, messageId: replyDoc._id };
    }
    messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function.arguments || "{}");
        const snap = await snapshotBefore(call.function.name, args, userId);
        result = await runTool(call.function.name, args, creds, userId);
        const op = opAfter(call.function.name, args, result, snap);
        if (op) pendingOps.push(op);
        actions.push({ tool: call.function.name, args });
      } catch (err) {
        result = { error: err.message };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  const reply = "I ran several steps but could not finish. Please rephrase your request.";
  const replyDoc = await ChatMessage.create({ role: "assistant", content: reply, userId });
  const checkpoint = pendingOps.length > 0;
  if (checkpoint) await saveCheckpoint(replyDoc._id, pendingOps, userId);
  return { reply, actions, checkpoint, messageId: replyDoc._id };
}
