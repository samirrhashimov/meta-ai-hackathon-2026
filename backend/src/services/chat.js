import { isValidObjectId } from "mongoose";
import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { aiConfig } from "./ai.js";
import { opAfter, revertCheckpoint, saveCheckpoint, snapshotBefore } from "./checkpoints.js";

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
];

function brief(note) {
  return { _id: note._id, title: note.title, folderId: note.folderId, tags: note.tags };
}

// Runs one tool call and returns a JSON-able result.
async function runTool(name, args) {
  switch (name) {
    case "listFolders": {
      const folders = await Folder.find().sort({ createdAt: 1 });
      return folders.map((f) => ({ _id: f._id, name: f.name, parentId: f.parentId }));
    }
    case "createFolder": {
      if (!args.name) throw new Error("name is required");
      const parentId = args.parentId || null;
      if (parentId && !isValidObjectId(parentId)) throw new Error("Invalid parentId");
      const folder = await Folder.create({ name: args.name, parentId });
      return { _id: folder._id, name: folder.name, parentId: folder.parentId };
    }
    case "listNotes": {
      const filter = {};
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
      const note = await Note.findById(args.noteId);
      if (!note) throw new Error("Note not found");
      return { ...brief(note), content: note.content, aiSummary: note.aiSummary };
    }
    case "createNote": {
      if (!args.title) throw new Error("title is required");
      const folderId = args.folderId || null;
      if (folderId && !isValidObjectId(folderId)) throw new Error("Invalid folderId");
      const note = await Note.create({ title: args.title, content: args.content || "", folderId });
      return brief(note);
    }
    case "updateNote": {
      if (!isValidObjectId(args.noteId)) throw new Error("Invalid noteId");
      const updates = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.content !== undefined) updates.content = args.content;
      const note = await Note.findByIdAndUpdate(args.noteId, updates, { new: true });
      if (!note) throw new Error("Note not found");
      return brief(note);
    }
    case "moveNote": {
      if (!isValidObjectId(args.noteId)) throw new Error("Invalid noteId");
      const folderId = args.folderId || null;
      if (folderId) {
        if (!isValidObjectId(folderId)) throw new Error("Invalid folderId");
        if (!(await Folder.findById(folderId))) throw new Error("Folder not found");
      }
      const note = await Note.findByIdAndUpdate(args.noteId, { folderId }, { new: true });
      if (!note) throw new Error("Note not found");
      return brief(note);
    }
    case "deleteNote": {
      if (!isValidObjectId(args.noteId)) throw new Error("Invalid noteId");
      const note = await Note.findByIdAndDelete(args.noteId);
      if (!note) throw new Error("Note not found");
      return { deleted: args.noteId };
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
- Never use em dashes (—) or long dashes in your replies. Use commas, colons, or short sentences instead.`;

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

async function chatCompletion(messages, model) {
  const { key, base } = aiConfig();
  const useModel = ALLOWED_MODELS.includes(model) ? model : aiConfig().model;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: useModel, temperature: 0.3, messages, tools: TOOLS }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message;
}

// One chat turn: saves the user message, runs the tool loop, saves and returns the reply.
export async function runChat(userText, model) {
  await ChatMessage.create({ role: "user", content: userText });
  const history = await ChatMessage.find().sort({ createdAt: 1 }).limit(50);
  const messages = [
    { role: "system", content: CHAT_SYSTEM },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const actions = [];
  const pendingOps = []; // undo ops for this answer's checkpoint
  for (let i = 0; i < 6; i++) {
    const msg = await chatCompletion(messages, model);
    if (!msg) throw new Error("Empty AI response");
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = cleanReply(msg.content || "");
      const replyDoc = await ChatMessage.create({ role: "assistant", content: reply });
      const checkpoint = pendingOps.length > 0;
      if (checkpoint) await saveCheckpoint(replyDoc._id, pendingOps);
      return { reply, actions, checkpoint, messageId: replyDoc._id };
    }
    messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function.arguments || "{}");
        const snap = await snapshotBefore(call.function.name, args);
        result = await runTool(call.function.name, args);
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
  const replyDoc = await ChatMessage.create({ role: "assistant", content: reply });
  const checkpoint = pendingOps.length > 0;
  if (checkpoint) await saveCheckpoint(replyDoc._id, pendingOps);
  return { reply, actions, checkpoint, messageId: replyDoc._id };
}
