import { useEffect, useState } from "react";

// All app settings live in one localStorage object for now
// (moves per-account untouched when auth arrives).
const KEY = "ui.settings";

// Live in-memory copy: reads see the newest value immediately,
// even before the persist effect runs (avoids one-step-behind UI).
let live = null;

export const DEFAULT_SETTINGS = {
  // API connection: empty = use the backend .env key.
  apiKey: "",
  apiBase: "",
  customModel: "",
  defaultModel: "",
  // Automation
  autoSort: true,
  autoTag: true,
  // Appearance
  editorFont: "m", // s | m | l
  accent: "cyan", // cyan | emerald | amber | rose | #rrggbb
  theme: "dark", // dark | light (light coming soon)
  // Chat
  showChatAttachments: true,
};

export function loadSettings() {
  if (live) return live;
  try {
    const raw = localStorage.getItem(KEY);
    live = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    live = { ...DEFAULT_SETTINGS };
  }
  return live;
}

export function saveSettings(next) {
  live = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked: settings just don't persist
  }
}

export function updateSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  saveSettings(next);
  return next;
}

// Reactive hook for components. The modal writes through this.
export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  return [settings, setSettings];
}

// Headers every /api/ai/* call carries: custom credentials when set,
// plus the auto-tag toggle the backend background jobs honor.
export function aiHeaders() {
  const s = loadSettings();
  const h = {};
  if (s.apiKey.trim()) h["x-meta-key"] = s.apiKey.trim();
  if (s.apiBase.trim()) h["x-meta-base"] = s.apiBase.trim().replace(/\/+$/, "");
  if (s.customModel.trim()) h["x-meta-model"] = s.customModel.trim();
  if (!s.autoTag) h["x-meta-tags"] = "off";
  return h;
}

export function hasCustomKey() {
  return loadSettings().apiKey.trim().length > 0;
}
