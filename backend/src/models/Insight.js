import { Schema, model } from "mongoose";

// Cached AI output for the dashboard, keyed by purpose (e.g. "ai_digest").
const insightSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    data: { type: Schema.Types.Mixed, default: {} },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Insight = model("Insight", insightSchema);
