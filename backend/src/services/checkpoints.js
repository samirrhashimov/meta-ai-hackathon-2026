import { isValidObjectId } from "mongoose";
import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { ChatCheckpoint } from "../models/ChatCheckpoint.js";

// Fields restored on revert (everything else, e.g. ids/timestamps, is kept).
const NOTE_FIELDS = ["title", "content", "folderId", "tags", "aiSummary"];
const FOLDER_FIELDS = ["name", "parentId"];

function pick(doc, fields) {
  const out = {};
  for (const f of fields) out[f] = doc[f];
  return out;
}

function modelFor(collection) {
  return collection === "notes" ? Note : Folder;
}

function fieldsFor(collection) {
  return collection === "notes" ? NOTE_FIELDS : FOLDER_FIELDS;
}

// Captured BEFORE a mutating tool runs. Best-effort: never breaks the turn.
export async function snapshotBefore(name, args) {
  try {
    if ((name === "updateNote" || name === "moveNote") && isValidObjectId(args.noteId)) {
      const note = await Note.findById(args.noteId).lean();
      if (note) return { kind: "notes", id: note._id, before: pick(note, NOTE_FIELDS) };
    }
    if (name === "deleteNote" && isValidObjectId(args.noteId)) {
      const note = await Note.findById(args.noteId).lean();
      if (note)
        return { kind: "notes", id: note._id, before: pick(note, NOTE_FIELDS), deleted: true };
    }
  } catch {
    // no checkpoint rather than a failed turn
  }
  return null;
}

// Called AFTER a successful tool call; returns an undo op or null.
export function opAfter(name, args, result, snap) {
  if (name === "createNote" && result?._id)
    return { kind: "notes", id: result._id, before: null };
  if (name === "createFolder" && result?._id)
    return { kind: "folders", id: result._id, before: null };
  if (snap) return snap; // update/move/delete carried its before-state
  return null;
}

export async function saveCheckpoint(messageId, ops) {
  if (!ops.length) return null;
  return ChatCheckpoint.create({ messageId, ops });
}

// Restores notes/folders to the checkpoint, newest op first. One-shot.
export async function revertCheckpoint(messageId) {
  const cp = await ChatCheckpoint.findOne({ messageId });
  if (!cp) {
    const err = new Error("No checkpoint for this message");
    err.status = 404;
    throw err;
  }
  let restored = 0;
  for (const op of [...cp.ops].reverse()) {
    const Model = modelFor(op.kind);
    const fields = fieldsFor(op.kind);
    if (!op.before) {
      if (op.kind === "folders") {
        // Mirror the app's folder delete: contents stay, become unfiled.
        await Note.updateMany({ folderId: op.id }, { folderId: null });
      }
      await Model.deleteOne({ _id: op.id });
    } else if (op.deleted) {
      const exists = await Model.findById(op.id);
      if (!exists) await Model.create({ _id: op.id, ...op.before });
    } else {
      const doc = await Model.findById(op.id);
      if (doc) {
        for (const f of fields) doc[f] = op.before[f];
        await doc.save();
      } else {
        await Model.create({ _id: op.id, ...op.before });
      }
    }
    restored++;
  }
  await ChatCheckpoint.deleteOne({ _id: cp._id });
  return { restored };
}
