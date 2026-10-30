import { isValidObjectId } from "mongoose";
import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { File } from "../models/File.js";
import { ChatCheckpoint } from "../models/ChatCheckpoint.js";

// Fields restored on revert (everything else, e.g. ids/timestamps/binaries, is kept).
const NOTE_FIELDS = ["title", "content", "folderId", "tags", "aiSummary"];
const FOLDER_FIELDS = ["name", "parentId"];
const FILE_FIELDS = ["name", "folderId", "tags"];

function pick(doc, fields) {
  const out = {};
  for (const f of fields) out[f] = doc[f];
  return out;
}

function modelFor(kind) {
  return kind === "notes" ? Note : kind === "files" ? File : Folder;
}

function fieldsFor(kind) {
  return kind === "notes" ? NOTE_FIELDS : kind === "files" ? FILE_FIELDS : FOLDER_FIELDS;
}

// Captured BEFORE a mutating tool runs. Best-effort: never breaks the turn.
export async function snapshotBefore(name, args, userId) {
  try {
    if ((name === "updateNote" || name === "moveNote") && isValidObjectId(args.noteId)) {
      const note = await Note.findOne({ _id: args.noteId, userId }).lean();
      if (note) return { kind: "notes", id: note._id, before: pick(note, NOTE_FIELDS) };
    }
    if (name === "deleteNote" && isValidObjectId(args.noteId)) {
      const note = await Note.findOne({ _id: args.noteId, userId }).lean();
      if (note)
        return { kind: "notes", id: note._id, before: pick(note, NOTE_FIELDS), deleted: true };
    }
    if (name === "moveFile" && isValidObjectId(args.fileId)) {
      const file = await File.findOne({ _id: args.fileId, userId }).lean();
      if (file) return { kind: "files", id: file._id, before: pick(file, FILE_FIELDS) };
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
  if (name === "saveUpload" && result?._id)
    return { kind: result.kind === "note" ? "notes" : "files", id: result._id, before: null };
  if (snap) return snap; // update/move/delete carried its before-state
  return null;
}

export async function saveCheckpoint(messageId, ops, userId) {
  if (!ops.length) return null;
  return ChatCheckpoint.create({ messageId, ops, userId });
}

// Restores notes/folders to the checkpoint, newest op first. One-shot.
export async function revertCheckpoint(messageId, userId) {
  const cp = await ChatCheckpoint.findOne({ messageId, userId });
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
        await Note.updateMany({ folderId: op.id, userId }, { folderId: null });
      }
      await Model.deleteOne({ _id: op.id, userId });
    } else if (op.deleted) {
      const exists = await Model.findOne({ _id: op.id, userId });
      if (!exists) await Model.create({ _id: op.id, userId, ...op.before });
    } else {
      const doc = await Model.findOne({ _id: op.id, userId });
      if (doc) {
        for (const f of fields) doc[f] = op.before[f];
        await doc.save();
      } else {
        await Model.create({ _id: op.id, userId, ...op.before });
      }
    }
    restored++;
  }
  await ChatCheckpoint.deleteOne({ _id: cp._id });
  return { restored };
}
