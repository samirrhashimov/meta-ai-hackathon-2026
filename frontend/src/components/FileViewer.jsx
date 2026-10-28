import { useEffect, useRef, useState } from "react";
import { LuFile, LuFileImage, LuFileText } from "react-icons/lu";
import { fileContentUrl } from "../api";
import { HyperEditor } from "./NoteEditor";
import { currentAccent } from "../accent";
import TagEditor from "./TagEditor";

// Icon for a stored file, shared by the tree, tabs and the viewer header.
export function FileTypeIcon({ mime, size = 14, className = "text-neutral-500" }) {
  const cls = `shrink-0 ${className}`;
  if ((mime || "").startsWith("image/")) return <LuFileImage size={size} className={cls} />;
  if (!mime || mime === "application/octet-stream") return <LuFile size={size} className={cls} />;
  return <LuFileText size={size} className={cls} />;
}

function isTextual(file) {
  const mime = file.mimeType || "";
  return mime.startsWith("text/") || /\.md$/i.test(file.name || "");
}

// Center-area tab content for an uploaded file.
// Text files (.md / .txt) open in the shared live editor with Save;
// images and pdfs are previewed; actions live in the right-click menu.
export default function FileViewer({ file, active, onSaveContent, onSaveTags, onDelete }) {
  const textual = isTextual(file);
  const mime = file.mimeType || "";
  const [text, setText] = useState(null); // original source (null = loading/failed)
  const [content, setContent] = useState(""); // edited value
  const [dirty, setDirty] = useState(false);
  const [tags, setTags] = useState(file.tags || []);
  const [tagsTouched, setTagsTouched] = useState(false);

  // Fresh file (or background AI tags): adopt unless the user edited them.
  useEffect(() => {
    setTags(file.tags || []);
    setTagsTouched(false);
  }, [file._id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tagsTouched) setTags(file.tags || []);
  }, [file.tags]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tag edits save immediately and adopt the stored value back.
  async function changeTags(t) {
    setTags(t);
    setTagsTouched(true);
    const updated = await onSaveTags(file._id, t);
    if (updated) {
      setTags(updated.tags || []);
      setTagsTouched(false);
    }
  }

  // Load the text source when the file changes.
  useEffect(() => {
    if (!textual) return;
    let alive = true;
    setText(null);
    setContent("");
    setDirty(false);
    fetch(fileContentUrl(file._id))
      .then((r) => {
        if (!r.ok) throw new Error("Load failed");
        return r.text();
      })
      .then((t) => {
        if (alive) {
          setText(t);
          setContent(t);
        }
      })
      .catch(() => {
        if (alive) setText(null);
      });
    return () => {
      alive = false;
    };
  }, [file._id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    await onSaveContent(file._id, content);
    setText(content);
    setDirty(false);
  }

  // Ctrl+S / Cmd+S saves the active text file instead of the browser dialog.
  const saveRef = useRef(null);
  saveRef.current = save;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!active || !textual) return;
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirtyRef.current) saveRef.current?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, textual]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Title row (same h-12 header line as the other panes) */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <FileTypeIcon mime={mime} size={15} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
          {file.name}
        </span>
        <button
          onClick={() => onDelete(file._id, file.name)}
          title="Delete file"
          className="min-w-16 shrink-0 rounded-md px-3 py-1 text-center text-sm font-medium text-neutral-500 hover:bg-red-400/10 hover:text-red-300"
        >
          Delete
        </button>
        {textual && (
          <button
            onClick={save}
            disabled={!dirty}
            className={`min-w-16 shrink-0 rounded-md px-3 py-1 text-center text-sm font-medium ${
              dirty
                ? currentAccent().solid
                : "cursor-default bg-white/5 text-neutral-600"
            }`}
          >
            {dirty ? "Save" : "Saved"}
          </button>
        )}
      </div>

      {/* Tags: AI-generated, manually editable (save instantly) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <TagEditor tags={tags} onChange={changeTags} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {textual ? (
          text === null ? (
            <p className="p-4 text-sm text-neutral-500">Could not load the file preview.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
              <HyperEditor
                active={active}
                initialValue={text}
                onChange={(md) => {
                  if (md !== content) {
                    setContent(md);
                    setDirty(md !== text);
                  }
                }}
              />
            </div>
          )
        ) : mime.startsWith("image/") ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
            <img
              src={fileContentUrl(file._id)}
              alt={file.name}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        ) : mime === "application/pdf" ? (
          <embed
            src={fileContentUrl(file._id)}
            type="application/pdf"
            className="min-h-0 flex-1"
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <LuFile size={40} className="text-neutral-600" />
            <p className="text-sm text-neutral-400">
              No inline preview for this file type. Right-click the file in the
              sidebar to download it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
