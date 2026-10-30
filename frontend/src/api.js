// The only place that talks to the backend. Address: VITE_API_URL (or localhost:5000).
import { aiHeaders } from "./settings";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const TOKEN_KEY = "flama.token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: session just won't persist
  }
}

function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Fired when the backend rejects the session; App listens and returns to landing.
function sessionExpired() {
  setToken("");
  window.dispatchEvent(new Event("flama:logout"));
}

async function request(path, options = {}) {
  const extra = path.startsWith("/api/ai") ? aiHeaders() : {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...extra,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && getToken()) sessionExpired();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// FormData requests skip the JSON content type but still carry the session.
async function formRequest(path, form) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...authHeader(), ...aiHeaders() },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && getToken()) sessionExpired();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}

export const api = {
  register: (email, password, name) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email, password) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/api/auth/me"),

  listFolders: () => request("/api/folders"),
  createFolder: (name, parentId) =>
    request("/api/folders", {
      method: "POST",
      body: JSON.stringify({ name, parentId: parentId || null }),
    }),
  deleteFolder: (id) => request(`/api/folders/${id}`, { method: "DELETE" }),
  updateFolder: (id, payload) =>
    request(`/api/folders/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  listNotes: () => request("/api/notes"),
  getNote: (id) => request(`/api/notes/${id}`),
  createNote: (payload) =>
    request("/api/notes", { method: "POST", body: JSON.stringify(payload) }),
  updateNote: (id, payload) =>
    request(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteNote: (id) => request(`/api/notes/${id}`, { method: "DELETE" }),

  organize: (noteId) =>
    request("/api/ai/organize", { method: "POST", body: JSON.stringify({ noteId }) }),
  organizeFile: (fileId) =>
    request("/api/ai/organize-file", { method: "POST", body: JSON.stringify({ fileId }) }),
  undoOrganize: (payload) =>
    request("/api/ai/organize/undo", { method: "POST", body: JSON.stringify(payload) }),

  chat: (message, model, attachments) =>
    request("/api/ai/chat", { method: "POST", body: JSON.stringify({ message, model, attachments }) }),
  chatModels: () => request("/api/ai/models"),
  testKey: () => request("/api/ai/test", { method: "POST" }),
  visualise: (refresh) => request(`/api/ai/visualise${refresh ? "?refresh=1" : ""}`),
  resetData: (password) =>
    request("/api/reset", { method: "DELETE", body: JSON.stringify({ password }) }),
  deleteAccount: (password) =>
    request("/api/auth/account", { method: "DELETE", body: JSON.stringify({ password }) }),
  revert: (messageId) =>
    request("/api/ai/revert", { method: "POST", body: JSON.stringify({ messageId }) }),

  // Temp chat attachment: lives only in memory until the AI places it.
  attachUpload: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const data = await formRequest("/api/ai/attachments", form);
    return data.attachment;
  },
  chatHistory: () => request("/api/ai/chat"),
  clearChat: () => request("/api/ai/chat", { method: "DELETE" }),

  insights: (refresh = false) => request(`/api/ai/insights${refresh ? "?refresh=1" : ""}`),

  // Knowledge-graph nodes + links (wikilink/tag/folder fresh; AI cached).
  graph: (refresh = false) => request(`/api/ai/graph${refresh ? "?refresh=1" : ""}`),

  // Sends a WAV recording to Muse Voice Transcribe; resolves { transcript }.
  transcribe: async (wavBlob) => {
    const form = new FormData();
    form.append("audio", wavBlob, "recording.wav");
    return formRequest("/api/ai/transcribe", form);
  },

  listFiles: () => request("/api/files"),
  updateFile: (id, payload) =>
    request(`/api/files/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteFile: (id) => request(`/api/files/${id}`, { method: "DELETE" }),

  // Uploads one or more files into a folder (folderId null = unfiled).
  // Binaries are stored in MongoDB. Markdown uploads come back as notes
  // ({ note }); everything else as file metadata ({ file }).
  uploadFiles: async (fileList, folderId) => {
    const out = [];
    for (const file of fileList) {
      const form = new FormData();
      form.append("file", file);
      if (folderId) form.append("folderId", folderId);
      out.push(await formRequest("/api/files", form));
    }
    return out;
  },

  // Uploads a file; with noteId it is appended to that note's attachments.
  upload: async (file, noteId) => {
    const form = new FormData();
    form.append("file", file);
    if (noteId) form.append("noteId", noteId);
    return formRequest("/api/upload", form);
  },
};

// Turns a backend "/uploads/..." path into a full URL.
export const fileUrl = (path) => `${API_BASE}${path}`;

// Raw bytes URL of a MongoDB-stored file (for img / pdf viewers).
export const fileContentUrl = (id) => `${API_BASE}/api/files/${id}/content`;
