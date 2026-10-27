import { useEffect, useRef, useState } from "react";
import HyperMD from "hypermd";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "hypermd/mode/hypermd.css";
// Language modes for fenced code blocks (no CDN needed this way).
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/python/python";
import "codemirror/mode/xml/xml";
import "codemirror/mode/css/css";
import "codemirror/mode/clike/clike";
import "codemirror/mode/shell/shell";
import "codemirror/mode/sql/sql";
// Rendered math ($...$) and diagrams (```mermaid).
import "katex/dist/katex.min.css";
import "hypermd/powerpack/fold-math-with-katex";
// Mermaid is bundled (no <script> tag, no global timing issues).
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "dark" });

// Own mermaid renderer: force-registered so no script load order can break it.
let mermaidSeq = 0;
function MermaidCardRenderer(code) {
  const el = document.createElement("div");
  try {
    mermaid.render("mmd" + Date.now().toString(36) + (mermaidSeq++).toString(36), code, (svg) => {
      el.innerHTML = svg;
    });
  } catch (e) {
    console.warn("[notes] mermaid render failed:", (e && e.message) || e);
    return null; // leave the source visible so it can be fixed
  }
  return el;
}
if (HyperMD.FoldCode && HyperMD.FoldCode.registerRenderer) {
  HyperMD.FoldCode.registerRenderer(
    { name: "mermaid", pattern: /^mermaid$/i, renderer: MermaidCardRenderer, suggested: true },
    true
  );
}

// CodeMirror 5 overlays must be stateless (no startState). Role of each mark
// is derived from the == / [[ ]] parity before it on the same line.
function countMarks(haystack, needle) {
  let count = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

function advanceTo(stream, idx) {
  if (idx === -1) stream.skipToEnd();
  else while (stream.pos < idx) stream.next();
}

// ==highlight== overlay: marks get "formatting-highlight", content "highlight".
const highlightOverlay = {
  token(stream) {
    const line = stream.string;
    const pos = stream.pos;
    if (line.startsWith("==", pos)) {
      const before = countMarks(line.slice(0, pos), "==");
      stream.match("==");
      if (before % 2 === 0) {
        // opener only when a closer follows; lone == stays plain
        if (line.indexOf("==", pos + 2) !== -1) return "formatting-highlight";
        return null;
      }
      return "formatting-highlight"; // closer
    }
    if (countMarks(line.slice(0, pos), "==") % 2 === 1) {
      advanceTo(stream, line.indexOf("==", pos)); // inside: consume to closer/EOL
      return "highlight";
    }
    advanceTo(stream, line.indexOf("==", pos));
    return null;
  },
};

// External-link card: folds [text](https://...) into a rich card
// (favicon + text + domain). Anything else delegates to the built-in folder.
const LINK_RE = /^\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/;
function LinkCardFolder(stream, token) {
  const cm = stream.cm;
  if (
    !(token.string === "[" &&
      token.state &&
      token.state.linkText &&
      !token.state.linkTitle &&
      !/\bimage\b/.test(token.type || ""))
  )
    return null;
  const rest = cm.getLine(stream.lineNo).slice(token.start);
  const m = LINK_RE.exec(rest);
  if (!m || !/^https?:\/\//i.test(m[2])) {
    return HyperMD.FoldLink.LinkFolder(stream, token);
  }
  const url = m[2];
  const from = { line: stream.lineNo, ch: token.start };
  const to = { line: stream.lineNo, ch: token.start + m[0].length };
  if (stream.requestRange(from, to) !== HyperMD.Fold.RequestRangeResult.OK) return null;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const el = document.createElement("a");
  el.className = "hmd-linkcard";
  el.href = url;
  el.target = "_blank";
  el.rel = "noreferrer";
  el.title = url + " (Alt+click to edit)";
  if (host) {
    const fav = document.createElement("img");
    fav.className = "hmd-linkcard-favicon";
    fav.alt = "";
    fav.addEventListener("error", () => fav.remove());
    fav.src = "https://" + host + "/favicon.ico";
    el.appendChild(fav);
  }
  const body = document.createElement("span");
  body.className = "hmd-linkcard-body";
  const title = document.createElement("span");
  title.className = "hmd-linkcard-title";
  title.textContent = m[1] || url;
  const domain = document.createElement("span");
  domain.className = "hmd-linkcard-domain";
  domain.textContent = host || url;
  body.appendChild(title);
  body.appendChild(domain);
  el.appendChild(body);
  el.addEventListener("mousedown", (ev) => ev.stopPropagation());
  const marker = cm.markText(from, to, { collapsed: true, replacedWith: el });
  el.addEventListener("click", (ev) => {
    if (ev.altKey) {
      ev.preventDefault();
      HyperMD.Fold.breakMark(cm, marker);
    }
  });
  return marker;
}
if (HyperMD.Fold && !HyperMD.Fold.suggestedOption.linkcard) {
  HyperMD.Fold.registerFolder("linkcard", LinkCardFolder, true);
}

// [[WikiLink]] overlay: marks get "formatting-wikilink", title "wikilink".
const wikiOverlay = {
  token(stream) {
    const line = stream.string;
    const pos = stream.pos;
    if (line.startsWith("[[", pos)) {
      const opens = countMarks(line.slice(0, pos), "[[");
      const closes = countMarks(line.slice(0, pos), "]]");
      stream.match("[[");
      if (opens === closes && line.indexOf("]]", pos + 2) !== -1) return "formatting-wikilink";
      return null;
    }
    if (line.startsWith("]]", pos)) {
      const opens = countMarks(line.slice(0, pos), "[[");
      const closes = countMarks(line.slice(0, pos), "]]");
      stream.match("]]");
      if (opens > closes) return "formatting-wikilink";
      return null;
    }
    const before = line.slice(0, pos);
    if (countMarks(before, "[[") > countMarks(before, "]]")) {
      advanceTo(stream, line.indexOf("]]", pos)); // inside: consume to closer/EOL
      return "wikilink";
    }
    const n1 = line.indexOf("[[", pos);
    const n2 = line.indexOf("]]", pos);
    advanceTo(stream, n1 === -1 ? n2 : n2 === -1 ? n1 : Math.min(n1, n2));
    return null;
  },
};

// Center area: edit the selected note. Images pasted with Ctrl+V upload
// and land in the text as markdown.
export default function NoteEditor({ note, active, onSave, onDelete, onAttach, onDirtyChange, onOpenWikiLink }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || "");
  const [dirty, setDirty] = useState(false);
  const titleRef = useRef(null);

  // Report unsaved state so tabs can show a dot.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty]);

  const saveRef = useRef(null);
  saveRef.current = save;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Ctrl+S / Cmd+S saves the active note instead of opening the browser dialog.
  useEffect(() => {
    if (!active) return;
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirtyRef.current) saveRef.current?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Sidebar rename (or AI edit) changes the title while the note is open:
  // adopt it unless the user is typing in the title field right now.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(note.title);
  }, [note.title]);

  function touch(fn) {
    return (...args) => {
      setDirty(true);
      fn(...args);
    };
  }

  async function save() {
    await onSave(note._id, { title: title.trim() || "Untitled Note", content });
    setDirty(false);
  }

  // Uploads a pasted image and returns the markdown to insert (or null).
  async function pasteImage(file) {
    const updated = await onAttach(note._id, file);
    const att = updated?.attachments?.[updated.attachments.length - 1];
    if (!att) return null;
    return `![${att.filename}](${att.url})`;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Title row */}
      <div className="flex items-center gap-2 border-b border-white/10 p-3">
        <input
          ref={titleRef}
          value={title}
          onChange={touch((e) => setTitle(e.target.value))}
          placeholder="Note title"
          className="w-full bg-transparent text-lg font-semibold text-neutral-100 placeholder:text-neutral-700 focus:outline-none"
        />
        <button
          onClick={() => onDelete(note._id, note.title)}
          title="Delete note"
          className="min-w-16 rounded-md px-3 py-1 text-center text-sm font-medium text-neutral-500 hover:bg-red-400/10 hover:text-red-300"
        >
          Delete
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className={`min-w-16 rounded-md px-3 py-1 text-center text-sm font-medium ${
            dirty
              ? "bg-cyan-400 text-[#06202a] hover:bg-cyan-300"
              : "cursor-default bg-white/5 text-neutral-600"
          }`}
        >
          {dirty ? "Save" : "Saved"}
        </button>
      </div>

      {/* Live markdown (Obsidian logic): marks show on the cursor line, hide elsewhere */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        <HyperEditor
          active={active}
          initialValue={content}
          onChange={(md) => {
            if (md !== content) {
              setDirty(true);
              setContent(md);
            }
          }}
          onPasteImage={pasteImage}
          onWikiLink={onOpenWikiLink}
        />
      </div>

      {/* Word count in the corner of the file window */}
      <div className="flex justify-end border-t border-white/10 px-3 py-1 text-xs text-neutral-600">
        <span>
          {content.split(/\s+/).filter(Boolean).length} words · {content.length} characters
        </span>
      </div>
    </div>
  );
}

// CodeMirror 5 + HyperMD: formatting marks hide on inactive lines
// and reappear on the cursor line (Obsidian live-preview behavior).
function HyperEditor({ active, initialValue, onChange, onPasteImage, onWikiLink }) {
  const hostRef = useRef(null);
  const cmRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPasteImageRef = useRef(onPasteImage);
  onPasteImageRef.current = onPasteImage;
  const onWikiLinkRef = useRef(onWikiLink);
  onWikiLinkRef.current = onWikiLink;

  useEffect(() => {
    const cm = HyperMD.fromTextArea(hostRef.current, {
      mode: "hypermd",
      theme: "material-darker",
      lineNumbers: false,
      lineWrapping: true,
      viewportMargin: Infinity,
      // External links fold into cards (linkcard); the built-in icon folder is off.
      hmdFold: Object.assign({}, HyperMD.Fold.suggestedOption, { link: false }),
      // Plain click (not only Ctrl+click) follows links, like the cards do.
      hmdClick: (info) => {
        if ((info.type === "link" || info.type === "url") && info.url) {
          window.open(info.url, "_blank", "noopener");
          return false;
        }
      },
    });
    cmRef.current = cm;
    cm.addOverlay(highlightOverlay);
    cm.addOverlay(wikiOverlay);
    // Make sure the bundled mermaid renderer is on for this editor.
    try {
      HyperMD.FoldCode?.getAddon?.(cm)?.setStatus?.("mermaid", true);
    } catch {
      // folding still works without it; the code block stays as text
    }
    cm.on("change", () => onChangeRef.current(cm.getValue()));
    // Click a [[WikiLink]] to open (or create) that note.
    function handleWikiClick(e) {
      if (e.target.closest("a, button")) return;
      const pos = cm.coordsChar({ left: e.clientX, top: e.clientY }, "window");
      if (!pos) return;
      const line = cm.getLine(pos.line);
      if (!line) return;
      const re = /\[\[([^\]\n]+)\]\]/g;
      let m;
      while ((m = re.exec(line))) {
        if (pos.ch >= m.index && pos.ch <= m.index + m[0].length) {
          onWikiLinkRef.current?.(m[1].trim());
          break;
        }
      }
    }
    // Ctrl+V with an image on the clipboard: upload it and insert markdown.
    // (Copied files live in clipboardData.files; copied pictures — e.g.
    // screenshots or web images — live in clipboardData.items.)
    async function handlePaste(e) {
      const items = Array.from(e.clipboardData?.items || []).filter((i) =>
        i.type.startsWith("image/")
      );
      let images = items
        .map((i) => i.getAsFile())
        .filter((f) => f && f.type.startsWith("image/"));
      if (images.length === 0) {
        images = Array.from(e.clipboardData?.files || []).filter((f) =>
          f.type.startsWith("image/")
        );
      }
      if (images.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      for (const file of images) {
        try {
          const md = await onPasteImageRef.current?.(file);
          if (md) cm.replaceSelection(md);
        } catch {
          // the upload error is already shown in the banner
        }
      }
    }
    const wrapper = cm.getWrapperElement();
    wrapper.addEventListener("paste", handlePaste);
    wrapper.addEventListener("click", handleWikiClick);
    return () => {
      wrapper.removeEventListener("paste", handlePaste);
      wrapper.removeEventListener("click", handleWikiClick);
      cm.toTextArea();
      cmRef.current = null;
    };
  }, []);

  // Hidden tabs keep stale measurements: re-measure when shown again.
  useEffect(() => {
    if (active) cmRef.current?.refresh();
  }, [active]);

  return (
    <div className="md-hypermd min-h-72">
      <textarea ref={hostRef} defaultValue={initialValue} style={{ display: "none" }} />
    </div>
  );
}
