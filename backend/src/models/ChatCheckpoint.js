import { Schema, model } from "mongoose";

// Undo snapshot for one assistant message: the inverse ops needed to put
// notes/folders back the way they were before that answer's tool calls.
// op.before == null  → the doc was created by the turn → delete it on revert.
// op.deleted         → the doc was deleted by the turn → recreate it on revert.
// otherwise          → restore the stored fields on revert.
const opSchema = new Schema(
  {
    kind: { type: String, enum: ["notes", "folders", "files"], required: true },
    id: { type: Schema.Types.ObjectId, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    deleted: { type: Boolean, default: false },
  },
  { _id: false }
);

const chatCheckpointSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, ref: "ChatMessage", required: true, index: true },
    ops: { type: [opSchema], default: [] },
  },
  { timestamps: true }
);

export const ChatCheckpoint = model("ChatCheckpoint", chatCheckpointSchema);
