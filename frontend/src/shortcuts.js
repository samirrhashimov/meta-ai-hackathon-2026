// Global shortcuts: one registry drives the App key handler, the Settings →
// Keyboard list, and the button tooltips. Combos use Ctrl/Alt (Cmd works too
// on macOS) so they never fire while typing plain text — and they keep
// working inside the note editor, where Ctrl+S already saves.
export const SHORTCUTS = [
  { id: "new-note", label: "New note", display: "Alt+N" },
  { id: "new-folder", label: "New folder", display: "Alt+Shift+N" },
  { id: "auto-sort", label: "Auto Sort everything", display: "Alt+S" },
  { id: "toggle-sidebar", label: "Toggle left sidebar", display: "Ctrl+B" },
  { id: "assistant", label: "Toggle Assistant panel", display: "Ctrl+J" },
  { id: "search", label: "Search notes", display: "Ctrl+K" },
  { id: "home", label: "Go Home", display: "Alt+1" },
  { id: "dashboard", label: "Open Visualise", display: "Alt+2" },
  { id: "graph", label: "Open Knowledge graph", display: "Alt+3" },
  { id: "tags", label: "Browse tags", display: "Alt+T" },
  { id: "settings", label: "Open Settings", display: "Ctrl+," },
  { id: "upload", label: "Upload file", display: "Alt+U" },
  { id: "save", label: "Save note", display: "Ctrl+S" },
];

export function shortcutTitle(label, id) {
  const s = SHORTCUTS.find((x) => x.id === id);
  return s ? `${label} (${s.display})` : label;
}
