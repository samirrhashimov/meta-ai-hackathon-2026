import { Schema, model } from "mongoose";

// A folder. A set parentId makes it a subfolder, null means a root folder.
const folderSchema = new Schema(
  {
    name: { type: String, required: [true, "Folder name is required"], trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Folder", default: null },
    locked: { type: Boolean, default: false }, // locked folders are skipped by AI sorting
  },
  { timestamps: true }
);

export const Folder = model("Folder", folderSchema);
