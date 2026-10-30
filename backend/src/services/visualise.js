import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { Insight } from "../models/Insight.js";
import { computeStats } from "./insights.js";
import { aiEnabled, chatJson, modelError } from "./ai.js";

const VIS_KEY = "visualise";
const VIS_TTL_MS = 60 * 60 * 1000; // 1 hour

const VIS_SYSTEM = `You turn a user's notes into a personal visual dashboard. Return ONLY JSON, no other text. Format:
{
  "title": "short dashboard title, 2-4 words",
  "summary": "2-3 sentences: what this dashboard shows and the main takeaway",
  "score": 72,
  "coverPrompt": "short visual description for a cover illustration, no text, no people",
  "widgets": [
    { "type": "stats", "title": "section title", "items": [{ "label": "name", "value": "short value" }] },
    { "type": "goals", "title": "section title", "items": [{ "label": "goal", "percent": 40, "detail": "one line" }] },
    { "type": "timeline", "title": "section title", "items": [{ "date": "Dec 31", "label": "event", "detail": "one line" }] },
    { "type": "bars", "title": "section title", "items": [{ "label": "category", "value": 3 }] },
    { "type": "notes", "title": "section title", "items": [{ "id": "note id from the list", "title": "note title", "reason": "why it matters" }] }
  ]
}
Rules: at most 5 widgets, each type at most once, ordered from most to least insightful. Use only widget types that fit the content (a timeline needs dated events, goals need plans with progress, bars need countable categories). percents are 0-100 integers. score is 0-100: the user's overall momentum across these notes. coverPrompt describes the mood in 8-12 words. Note ids must come verbatim from the provided note list. Base everything strictly on the given notes; never invent facts.`;

// Keep the spec safe to render: known types only, capped sizes, sane values.
function sanitizeSpec(spec, validIds) {
  if (!spec || typeof spec !== "object") return null;
  const str = (v, n = 120) => (typeof v === "string" ? v.slice(0, n) : "");
  const widgets = [];
  const seen = new Set();
  for (const w of Array.isArray(spec.widgets) ? spec.widgets.slice(0, 5) : []) {
    if (!w || seen.has(w.type)) continue;
    if (w.type === "stats") {
      const items = (Array.isArray(w.items) ? w.items : [])
        .slice(0, 4)
        .map((i) => ({ label: str(i?.label, 40), value: str(String(i?.value ?? ""), 40) }))
        .filter((i) => i.label && i.value);
      if (items.length > 0) {
        widgets.push({ type: "stats", title: str(w.title, 60), items });
        seen.add("stats");
      }
    } else if (w.type === "goals") {
      const items = (Array.isArray(w.items) ? w.items : [])
        .slice(0, 6)
        .map((i) => ({
          label: str(i?.label, 60),
          percent: Math.max(0, Math.min(100, Math.round(Number(i?.percent) || 0))),
          detail: str(i?.detail, 120),
        }))
        .filter((i) => i.label);
      if (items.length > 0) {
        widgets.push({ type: "goals", title: str(w.title, 60), items });
        seen.add("goals");
      }
    } else if (w.type === "timeline") {
      const items = (Array.isArray(w.items) ? w.items : [])
        .slice(0, 8)
        .map((i) => ({ date: str(i?.date, 24), label: str(i?.label, 80), detail: str(i?.detail, 140) }))
        .filter((i) => i.label);
      if (items.length > 0) {
        widgets.push({ type: "timeline", title: str(w.title, 60), items });
        seen.add("timeline");
      }
    } else if (w.type === "bars") {
      const items = (Array.isArray(w.items) ? w.items : [])
        .slice(0, 8)
        .map((i) => ({ label: str(i?.label, 40), value: Math.max(0, Number(i?.value) || 0) }))
        .filter((i) => i.label);
      if (items.length > 0) {
        widgets.push({ type: "bars", title: str(w.title, 60), items });
        seen.add("bars");
      }
    } else if (w.type === "notes") {
      const items = (Array.isArray(w.items) ? w.items : [])
        .slice(0, 5)
        .map((i) => ({ id: String(i?.id || ""), title: str(i?.title, 80), reason: str(i?.reason, 140) }))
        .filter((i) => validIds.has(i.id) && i.title);
      if (items.length > 0) {
        widgets.push({ type: "notes", title: str(w.title, 60), items });
        seen.add("notes");
      }
    }
  }
  if (widgets.length === 0) return null;
  return {
    title: str(spec.title, 60) || "Overview",
    summary: str(spec.summary, 400),
    score: Math.max(0, Math.min(100, Math.round(Number(spec.score) || 0))),
    coverPrompt: str(spec.coverPrompt, 200),
    widgets,
  };
}

// Builds the AI dashboard spec from current notes (folders give context).
async function generateVisualise(creds, userId) {
  const [notes, folders] = await Promise.all([
    Note.find({ userId }).sort({ updatedAt: -1 }).limit(60),
    Folder.find({ userId }),
  ]);
  if (notes.length === 0) return null;
  const folderOf = Object.fromEntries(folders.map((f) => [String(f._id), f.name]));
  const list = notes
    .map(
      (n) =>
        `- [${n._id}] ${n.title} (${n.folderId ? folderOf[String(n.folderId)] || "a folder" : "unsorted"}): ${(n.aiSummary || n.content || "").slice(0, 300)}`
    )
    .join("\n");
  const raw = await chatJson(VIS_SYSTEM, `Notes:\n${list}`, creds);
  return sanitizeSpec(raw, new Set(notes.map((n) => String(n._id))));
}

// Generates a cover illustration for the dashboard (512px, cached with it).
async function generateCover(creds, prompt) {
  const { key, base } = creds;
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "muse-image-1.0",
      prompt: prompt || "abstract flowing shapes",
      size: "512x512",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw modelError("Image generation", res.status, body);
  }
  const body = await res.json();
  const b64 = body?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image");
  return `data:image/webp;base64,${b64}`;
}

// Reads the cache, accepting the pre-cover shape (bare spec) too.
function readCache(record) {
  const d = record?.data;
  if (!d) return { spec: null, cover: null, legacy: false };
  if (Array.isArray(d.widgets)) return { spec: d, cover: null, legacy: true };
  return { spec: d.spec || null, cover: d.cover || null, legacy: false };
}

// Full visualise payload: cached (or fresh) AI dashboard spec + cover art.
// Stats always ride along so one request paints the whole page.
export async function getVisualise({ refresh = false } = {}, creds, userId) {
  const stats = await computeStats(userId);
  if (!aiEnabled(creds)) {
    const cached = readCache(await Insight.findOne({ key: VIS_KEY, userId }));
    return {
      spec: cached.spec,
      cover: cached.cover,
      stats,
      stale: true,
      error: "AI key is not set (Settings → API Connection)",
    };
  }
  let record = await Insight.findOne({ key: VIS_KEY, userId });
  const cached = readCache(record);
  const fresh =
    record && !cached.legacy && Date.now() - new Date(record.generatedAt).getTime() < VIS_TTL_MS;
  if (!record || !fresh || refresh) {
    const spec = await generateVisualise(creds, userId);
    let cover = cached.cover;
    // New cover when rebuilding, or when an old cache predates cover art.
    if (spec && (refresh || !record?.data || !cover)) {
      try {
        cover = await generateCover(creds, spec.coverPrompt);
      } catch (err) {
        console.error("Cover generation failed:", err.message);
        cover = null;
      }
    }
    record = await Insight.findOneAndUpdate(
      { key: VIS_KEY, userId },
      { data: { spec, cover }, generatedAt: new Date() },
      { upsert: true, new: true }
    );
    return { spec, cover, stats, stale: false, error: null };
  }
  return {
    spec: cached.spec,
    cover: cached.cover,
    stats,
    stale: false,
    error: null,
  };
}
