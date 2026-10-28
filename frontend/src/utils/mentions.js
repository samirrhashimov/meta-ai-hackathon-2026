// Pure @-mention helpers (shared, unit-testable).
export function detectMention(value, pos) {
  const m = value.slice(0, pos).match(/@([\p{L}\p{N}._-]*)$/u);
  return m ? m[1] : null;
}

// Inserts "@label " at the index (clamped); returns the text and new caret.
export function insertTag(value, index, label) {
  const tag = `@${label}`;
  const i = Math.max(0, Math.min(index ?? value.length, value.length));
  const before = value.slice(0, i);
  const after = value.slice(i).replace(/^ /, "");
  const gap = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
  const head = `${before}${gap}${tag} `;
  return { text: `${head}${after}`, caret: head.length };
}
