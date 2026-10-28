import { Schema, model } from "mongoose";

// A user-uploaded file (image, pdf, markdown, text) stored as binary
// directly in MongoDB. Listed in the folder tree next to notes.
const fileSchema = new Schema(
  {
    name: { type: String, required: [true, "File name is required"], trim: true },
    folderId: { type: Schema.Types.ObjectId, ref: "Folder", default: null }, // null = unfiled
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    data: { type: Buffer, required: true }, // binary content (max 10MB, see route limit)
  },
  { timestamps: true }
);

fileSchema.index({ folderId: 1 });

export const File = model("File", fileSchema);
