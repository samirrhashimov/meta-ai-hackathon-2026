// Pending chat attachments: files from + or drag-drop live ONLY here
// (never in the folder tree) until the AI places them with saveUpload.
const store = new Map(); // id -> { id, name, mimeType, size, data, createdAt }
let seq = 0;

const TTL_MS = 30 * 60 * 1000;
const sweep = setInterval(() => {
  const cut = Date.now() - TTL_MS;
  for (const [id, u] of store) if (u.createdAt < cut) store.delete(id);
}, 5 * 60 * 1000);
if (sweep && typeof sweep.unref === "function") sweep.unref();

function publicMeta(u) {
  return { id: u.id, name: u.name, mimeType: u.mimeType, size: u.size };
}

export function stashUpload({ name, mimeType, size, data, userId }) {
  const id = `up_${Date.now().toString(36)}_${(seq++).toString(36)}${Math.floor(
    Math.random() * 1e6
  ).toString(36)}`;
  store.set(id, { id, name, mimeType, size, data, userId, createdAt: Date.now() });
  return publicMeta(store.get(id));
}

function owned(id, userId) {
  const u = store.get(id);
  if (!u) return null;
  if (u.userId && String(u.userId) !== String(userId)) return null;
  return u;
}

export function peekUpload(id, userId) {
  return owned(id, userId);
}

// Consumes the upload (one-shot): placing it twice is not possible.
export function takeUpload(id, userId) {
  const u = owned(id, userId);
  if (u) store.delete(id);
  return u || null;
}
