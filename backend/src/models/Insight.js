import { Schema, model } from "mongoose";

// Cached AI output for the dashboard, keyed by purpose (e.g. "ai_digest").
const insightSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    key: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One cache row per purpose per user: the same key repeats across accounts.
insightSchema.index({ userId: 1, key: 1 }, { unique: true });

export const Insight = model("Insight", insightSchema);
