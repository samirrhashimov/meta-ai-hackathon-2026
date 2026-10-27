import { Schema, model } from "mongoose";

// Attachment metadata, filled by the upload endpoint.
const attachmentSchema = new Schema(
  {
    filename: String,
    mimetype: String,
    size: Number,
    url: String,
  },
  { _id: false }
);

const noteSchema = new Schema(
  {
    title: { type: String, required: [true, "Note title is required"], trim: true },
    content: { type: String, default: "" }, // markdown text
    folderId: { type: Schema.Types.ObjectId, ref: "Folder", default: null }, // null = no folder
    tags: { type: [String], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    aiSummary: { type: String, default: "" }, // filled by AI when organizing
  },
  { timestamps: true }
);

// Title+content search for the ?search= parameter.
noteSchema.index({ title: "text", content: "text" });

export const Note = model("Note", noteSchema);
