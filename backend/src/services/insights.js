import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { Insight } from "../models/Insight.js";
import { aiEnabled, chatJson } from "./ai.js";

const DIGEST_KEY = "ai_digest";
const DIGEST_TTL_MS = 60 * 60 * 1000; // 1 hour

// Pure database stats for the dashboard (no AI needed, always available).
export async function computeStats() {
  const [totalNotes, totalFolders, folders] = await Promise.all([
    Note.countDocuments(),
    Folder.countDocuments(),
    Folder.find(),
  ]);
  const nameOf = Object.fromEntries(folders.map((f) => [String(f._id), f.name]));

  const perFolderRaw = await Note.aggregate([
    { $group: { _id: "$folderId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const perFolder = perFolderRaw.map((r) => ({
    name: r._id ? nameOf[String(r._id)] || "(deleted)" : "Unfiled",
    count: r.count,
  }));
  const unfiledCount = perFolderRaw.find((r) => r._id === null)?.count || 0;

  const topTagsRaw = await Note.aggregate([
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  const topTags = topTagsRaw.map((r) => ({ tag: r._id, count: r.count }));

  const attachmentsTotal = await Note.aggregate([
    { $project: { n: { $size: { $ifNull: ["$attachments", []] } } } },
    { $group: { _id: null, total: { $sum: "$n" } } },
  ]);

  // Notes created per day for the last 30 days.
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);
  const createdDates = await Note.find({ createdAt: { $gte: since } }, { createdAt: 1 });
  const perDay = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    const count = createdDates.filter((n) => n.createdAt.toISOString().slice(0, 10) === key).length;
    perDay.push({ date: key.slice(5), count });
  }

  return {
    totalNotes,
    totalFolders,
    unfiledCount,
    attachmentsTotal: attachmentsTotal[0]?.total || 0,
    perFolder,
    topTags,
    perDay,
  };
}

const DIGEST_SYSTEM = `You analyze a user's notes and return ONLY JSON, no other text. Format:
{ "overview": "2-3 sentences about what the user focuses on", "topics": [{ "topic": "name", "noteCount": 1 }], "suggestions": ["at most 3 short actions"] }
Base topics strictly on the given notes; noteCount is your best estimate per topic.`;

// Asks the AI for an overview of all notes.
async function generateDigest(creds) {
  const notes = await Note.find().sort({ updatedAt: -1 }).limit(50);
  if (notes.length === 0) {
    return { overview: "No notes yet.", topics: [], suggestions: ["Create your first note."] };
  }
  const list = notes
    .map((n) => `- ${n.title}: ${(n.aiSummary || n.content || "").slice(0, 200)}`)
    .join("\n");
  return chatJson(DIGEST_SYSTEM, `Notes:\n${list}`, creds);
}

// Full dashboard payload: fresh stats + cached (or fresh) AI digest.
export async function getInsights({ refresh = false } = {}, creds) {
  const stats = await computeStats();
  if (!aiEnabled(creds)) {
    const cached = await Insight.findOne({ key: DIGEST_KEY });
    return {
      stats,
      digest: cached?.data || null,
      digestStale: true,
      digestError: "AI key is not set (backend/.env → META_API_KEY)",
    };
  }
  let record = await Insight.findOne({ key: DIGEST_KEY });
  const fresh = record && Date.now() - new Date(record.generatedAt).getTime() < DIGEST_TTL_MS;
  if (!record || !fresh || refresh) {
    const data = await generateDigest(creds);
    record = await Insight.findOneAndUpdate(
      { key: DIGEST_KEY },
      { data, generatedAt: new Date() },
      { upsert: true, new: true }
    );
  }
  return { stats, digest: record.data, digestStale: false, digestError: null };
}
