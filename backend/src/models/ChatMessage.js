import { Schema, model } from "mongoose";

// One chat turn with the AI (single-user demo, no sessions).
const chatMessageSchema = new Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

export const ChatMessage = model("ChatMessage", chatMessageSchema);
