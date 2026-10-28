// The only place that talks to the backend. Address: VITE_API_URL (or localhost:5000).
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
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

  chat: (message, model, attachments) =>
    request("/api/ai/chat", { method: "POST", body: JSON.stringify({ message, model, attachments }) }),
  chatModels: () => request("/api/ai/models"),
  revert: (messageId) =>
    request("/api/ai/revert", { method: "POST", body: JSON.stringify({ messageId }) }),

  // Temp chat attachment: lives only in memory until the AI places it.
  attachUpload: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/ai/attachments`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
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
    const res = await fetch(`${API_BASE}/api/ai/transcribe`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Transcription failed");
    return data;
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
      const res = await fetch(`${API_BASE}/api/files`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      out.push(data);
    }
    return out;
  },

  // Uploads a file; with noteId it is appended to that note's attachments.
  upload: async (file, noteId) => {
    const form = new FormData();
    form.append("file", file);
    if (noteId) form.append("noteId", noteId);
    const res = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },
};

// Turns a backend "/uploads/..." path into a full URL.
export const fileUrl = (path) => `${API_BASE}${path}`;

// Raw bytes URL of a MongoDB-stored file (for img / pdf viewers).
export const fileContentUrl = (id) => `${API_BASE}/api/files/${id}/content`;
