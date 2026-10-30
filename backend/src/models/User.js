import { Schema, model } from "mongoose";

// One account. Every note, folder, file, chat message, checkpoint and AI
// cache row carries this account's id, so users only ever see their own data.
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email is not valid"],
    },
    name: { type: String, default: "", trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

export const User = model("User", userSchema);
