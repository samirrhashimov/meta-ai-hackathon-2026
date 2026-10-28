import { useState } from "react";
import { LuFileText, LuSearch, LuX } from "react-icons/lu";
import { FileTypeIcon } from "./FileViewer";
import Modal from "./Modal";

// Wide tags browser: searchable + sortable tag list on the left,
// the selected tag's notes and files on the right.
export default function TagsModal({ notes, files, onOpenNote, onOpenFile, onClose }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("count"); // count | az
  const [selected, setSelected] = useState(null); // lowercased tag key

  const grouped = new Map();
  const add = (raw, kind, id) => {
    const t = (raw || "").trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (!grouped.has(key)) grouped.set(key, { label: t, notes: [], files: [] });
    grouped.get(key)[kind].push(id);
  };
  (notes || []).forEach((n) => (n.tags || []).forEach((t) => add(t, "notes", n._id)));
  (files || []).forEach((f) => (f.tags || []).forEach((t) => add(t, "files", f._id)));

  const q = query.trim().toLowerCase();
  const tags = [...grouped.values()]
    .filter((t) => !q || t.label.toLowerCase().includes(q))
    .sort((a, b) =>
      sortBy === "az"
        ? a.label.localeCompare(b.label)
        : b.notes.length + b.files.length - (a.notes.length + a.files.length) ||
          a.label.localeCompare(b.label)
    );

  const current = selected ? grouped.get(selected) : null;
  const currentNotes = (current?.notes || [])
    .map((id) => notes.find((n) => n._id === id))
    .filter(Boolean);
  const currentFiles = (current?.files || [])
    .map((id) => files.find((f) => f._id === id))
    .filter(Boolean);

  return (
    <Modal onClose={onClose}>
      {(close) => (
        <div className="glass flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl p-5">
          <div className="flex shrink-0 items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-100">Tags</h3>
            <button
              onClick={close}
              title="Close"
              className="rounded-md p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
            >
              <LuX size={16} />
            </button>
          </div>

        {grouped.size === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">
            No tags yet. The AI adds them automatically — or add your own under any note.
          </p>
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 gap-4">
            {/* Left: search + sort + tag list */}
            <div className="flex w-72 shrink-0 flex-col gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <LuSearch size={14} className="shrink-0 text-neutral-500" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tags..."
                  className="w-full bg-transparent text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    title="Clear search"
                    className="text-neutral-500 hover:text-neutral-200"
                  >
                    <LuX size={14} />
                  </button>
                )}
              </div>
              <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
                {[
                  ["count", "Most used"],
                  ["az", "A–Z"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortBy(key)}
                    className={`flex-1 rounded-md px-2 py-1 text-xs ${
                      sortBy === key
                        ? "bg-cyan-400/20 text-cyan-100"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {tags.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-neutral-600">
                    No tags match "{query}".
                  </p>
                ) : (
                  tags.map((t) => {
                    const key = t.label.toLowerCase();
                    const isActive = selected === key;
                    const total = t.notes.length + t.files.length;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelected(isActive ? null : key)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${
                          isActive
                            ? "bg-cyan-400/15 text-cyan-100"
                            : "text-neutral-300 hover:bg-white/5"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          #{t.label}
                        </span>
                        <span className="shrink-0 text-xs text-neutral-500">
                          {t.notes.length > 0 && `${t.notes.length} note${t.notes.length > 1 ? "s" : ""}`}
                          {t.notes.length > 0 && t.files.length > 0 && " · "}
                          {t.files.length > 0 && `${t.files.length} file${t.files.length > 1 ? "s" : ""}`}
                          {total === 0 && "0"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: the selected tag's assets */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-l border-white/10 pl-4">
              {!current ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  Select a tag to see its notes and files.
                </p>
              ) : (
                <>
                  <p className="px-1 pb-1 text-sm font-medium text-neutral-200">
                    #{current.label}
                  </p>
                  {currentNotes.length > 0 && (
                    <>
                      <p className="px-1 pb-1 pt-2 text-xs uppercase tracking-wide text-neutral-600">
                        Notes
                      </p>
                      {currentNotes.map((n) => (
                        <button
                          key={n._id}
                          onClick={() => onOpenNote(n._id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-300 hover:bg-cyan-400/10"
                        >
                          <LuFileText size={14} className="shrink-0 text-neutral-500" />
                          <span className="truncate">{n.title}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {currentFiles.length > 0 && (
                    <>
                      <p className="px-1 pb-1 pt-2 text-xs uppercase tracking-wide text-neutral-600">
                        Files
                      </p>
                      {currentFiles.map((f) => (
                        <button
                          key={f._id}
                          onClick={() => onOpenFile(f._id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-300 hover:bg-cyan-400/10"
                        >
                          <FileTypeIcon mime={f.mimeType} />
                          <span className="truncate">{f.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {currentNotes.length === 0 && currentFiles.length === 0 && (
                    <p className="px-1 py-2 text-sm text-neutral-500">
                      Nothing here anymore.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        </div>
      )}
    </Modal>
  );
}
