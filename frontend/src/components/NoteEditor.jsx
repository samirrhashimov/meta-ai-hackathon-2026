import { useEffect, useRef, useState } from "react";
import HyperMD from "hypermd";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/material-darker.css";
import "hypermd/mode/hypermd.css";
import { fileUrl } from "../api";
import { LuCheck, LuTrash2, LuX } from "react-icons/lu";

// Center area: edit + preview the selected note + attachments.
// The parent passes a different key per note, so draft state resets on switch.
export default function NoteEditor({ note, onSave, onDelete, onAttach, onDetach }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || "");
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  async function attach(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await onAttach(note._id, file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Title row */}
      <div className="flex items-center gap-2 border-b border-white/10 p-3">
        <input
          value={title}
          onChange={touch((e) => setTitle(e.target.value))}
          placeholder="Note title"
          className="w-full bg-transparent text-lg font-semibold text-neutral-100 placeholder:text-neutral-700 focus:outline-none"
        />
        <button
          onClick={() => onDelete(note._id, note.title)}
          title="Delete note"
          className="flex items-center rounded-md px-2 py-1 text-neutral-500 hover:bg-white/5 hover:text-red-300"
        >
          <LuTrash2 size={15} />
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            dirty
              ? "bg-cyan-400 text-[#06202a] hover:bg-cyan-300"
              : "cursor-default bg-white/5 text-neutral-600"
          }`}
        >
          {dirty ? "Save" : (<span className="inline-flex items-center gap-1">Saved <LuCheck size={13} /></span>)}
        </button>
      </div>

      {/* Live markdown (Obsidian logic): marks show on the cursor line, hide elsewhere */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        <HyperEditor
          initialValue={content}
          onChange={(md) => {
            if (md !== content) {
              setDirty(true);
              setContent(md);
            }
          }}
        />
      </div>

      {/* Attachments */}
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-400">
            Attachments ({note.attachments?.length || 0})
          </p>
          <label className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-neutral-300 hover:bg-white/5">
            {uploading ? "Uploading..." : "+ Attach file (image/pdf/md)"}
            <input type="file" onChange={attach} className="hidden" disabled={uploading} />
          </label>
        </div>
        {(note.attachments?.length || 0) === 0 ? (
          <p className="text-xs text-neutral-600">No attachments yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {note.attachments.map((a) => (
              <Attachment key={a.url} file={a} onDetach={() => onDetach(note._id, a.url)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// CodeMirror 5 + HyperMD: formatting marks hide on inactive lines
// and reappear on the cursor line (Obsidian live-preview behavior).
function HyperEditor({ initialValue, onChange }) {
  const hostRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const cm = HyperMD.fromTextArea(hostRef.current, {
      mode: "hypermd",
      theme: "material-darker",
      lineNumbers: false,
      lineWrapping: true,
      viewportMargin: Infinity,
    });
    cm.on("change", () => onChangeRef.current(cm.getValue()));
    return () => {
      cm.toTextArea();
    };
  }, []);

  return (
    <div className="md-hypermd min-h-72">
      <textarea ref={hostRef} defaultValue={initialValue} style={{ display: "none" }} />
    </div>
  );
}

function Attachment({ file, onDetach }) {
  const url = fileUrl(file.url);
  const isImage = file.mimetype?.startsWith("image/");
  const isPdf = file.mimetype === "application/pdf";

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="mb-1 flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex-1 truncate text-sm text-cyan-200 hover:underline"
        >
          {file.filename}
        </a>
        <span className="text-xs text-neutral-600">{Math.round((file.size || 0) / 1024)} KB</span>
        <button
          onClick={onDetach}
          title="Remove attachment"
          className="flex items-center rounded px-1 text-sm text-neutral-500 hover:bg-white/10 hover:text-red-300"
        >
          <LuX size={14} />
        </button>
      </div>
      {isImage && (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={file.filename} className="max-h-64 rounded-md" />
        </a>
      )}
      {isPdf && <iframe src={url} title={file.filename} className="h-96 w-full rounded-md bg-white" />}
    </div>
  );
}
