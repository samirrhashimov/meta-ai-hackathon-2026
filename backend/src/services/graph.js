import { Folder } from "../models/Folder.js";
import { Note } from "../models/Note.js";
import { Insight } from "../models/Insight.js";
import { aiEnabled, chatJson } from "./ai.js";

// Builds the knowledge-graph payload:
// nodes (notes + folders) and links of four kinds:
// - "folder": note→folder / folder→parent containment
// - "wikilink": explicit [[Note Title]] references
// - "tag": notes sharing at least one tag
// - "ai": model-suggested topical links (cached until notes change)
export async function buildGraph({ refresh = false } = {}) {
  const [notes, folders] = await Promise.all([Note.find().lean(), Folder.find().lean()]);

  const fid = (v) => (v ? String(v._id || v) : null);
  const nodes = [
    ...folders.map((f) => ({
      id: String(f._id),
      kind: "folder",
      label: f.name,
      parentId: fid(f.parentId),
    })),
    ...notes.map((n) => ({
      id: String(n._id),
      kind: "note",
      label: n.title,
      folderId: fid(n.folderId),
      tags: n.tags || [],
    })),
  ];

  const links = [];
  const seen = new Set();
  function addLink(source, target, type) {
    if (!source || !target || source === target) return;
    const key = [source, target].sort().join("|") + ":" + type;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source, target, type });
  }

  // Containment: note→folder, folder→parent.
  for (const n of notes) {
    const f = fid(n.folderId);
    if (f) addLink(String(n._id), f, "folder");
  }
  for (const f of folders) {
    const p = fid(f.parentId);
    if (p) addLink(String(f._id), p, "folder");
  }

  // WikiLinks: [[Title]], [[Title#heading]], [[Title|alias]].
  const byTitle = new Map();
  for (const n of notes) byTitle.set((n.title || "").trim().toLowerCase(), String(n._id));
  const WL = /\[\[([^\]|#]+)(?:#[^\]]*)?(?:\|[^\]]*)?\]\]/g;
  for (const n of notes) {
    const text = n.content || "";
    WL.lastIndex = 0;
    for (const m of text.matchAll(WL)) {
      const target = byTitle.get((m[1] || "").trim().toLowerCase());
      if (target) addLink(String(n._id), target, "wikilink");
    }
  }

  // Shared tags: notes with at least one common tag (capped pairwise).
  const tagged = notes.filter((n) => (n.tags || []).length > 0);
  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      const a = new Set((tagged[i].tags || []).map((t) => t.toLowerCase()));
      if ((tagged[j].tags || []).some((t) => a.has(t.toLowerCase()))) {
        addLink(String(tagged[i]._id), String(tagged[j]._id), "tag");
      }
    }
    if (links.length > 2000) break;
  }

  // AI topical links, cached by the newest note change.
  const stamp = notes.reduce(
    (max, n) => {
      const t = n.updatedAt ? new Date(n.updatedAt).getTime() : 0;
      return t > max ? t : max;
    },
    0
  );
  let aiLinks = [];
  try {
    const cached = await Insight.findOne({ key: "graph-ai-links" }).lean();
    if (cached?.data?.stamp === stamp && Array.isArray(cached.data.links)) {
      aiLinks = cached.data.links;
    } else if (aiEnabled() && notes.length > 1) {
      // Never block the graph on the model: serve stale (or empty) AI links
      // now and refresh the cache in the background for the next open.
      if (Array.isArray(cached?.data?.links)) aiLinks = cached.data.links;
      refreshAiLinks(notes, stamp).catch(() => {});
    }
  } catch {
    aiLinks = [];
  }
  for (const l of aiLinks) addLink(l.source, l.target, "ai");

  return { nodes, links };
}

// One background regeneration at a time; failures retry on the next open.
let aiRefreshing = false;
async function refreshAiLinks(notes, stamp) {
  if (aiRefreshing) return;
  aiRefreshing = true;
  try {
    const links = await suggestLinks(notes.slice(0, 60));
    await Insight.findOneAndUpdate(
      { key: "graph-ai-links" },
      { key: "graph-ai-links", data: { stamp, links }, generatedAt: new Date() },
      { upsert: true }
    );
  } finally {
    aiRefreshing = false;
  }
}

const LINK_SYSTEM = `You find topical connections between notes. Return ONLY JSON, no other text.
Format: { "links": [{ "a": "<exact note title>", "b": "<exact note title>", "reason": "<five words or less>" }] }
Rules:
- Link notes about the same topic, project, or person even without shared words.
- Use the exact titles given. At most 25 links, strongest first.
- No links when nothing is related: { "links": [] }.`;

async function suggestLinks(notes) {
  const list = notes
    .map(
      (n, i) =>
        `${i + 1}. "${n.title}" [tags: ${(n.tags || []).join(", ") || "none"}] ${(n.content || "").slice(0, 150).replace(/\s+/g, " ")}`
    )
    .join("\n");
  const out = await chatJson(LINK_SYSTEM, `Notes:\n${list}`);
  const byTitle = new Map();
  for (const n of notes) byTitle.set((n.title || "").trim().toLowerCase(), String(n._id));
  const links = [];
  for (const l of out.links || []) {
    const a = byTitle.get(String(l.a || "").trim().toLowerCase());
    const b = byTitle.get(String(l.b || "").trim().toLowerCase());
    if (a && b && a !== b) links.push({ source: a, target: b, reason: String(l.reason || "").slice(0, 60) });
  }
  return links.slice(0, 25);
}
