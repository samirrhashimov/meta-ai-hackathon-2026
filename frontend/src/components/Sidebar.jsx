import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuArrowDownWideNarrow,
  LuChevronDown,
  LuChevronRight,
  LuChevronsDownUp,
  LuChevronsUpDown,
  LuFileText,
  LuFolder,
  LuFolderOpen,
  LuFolderPlus,
  LuPlus,
  LuSparkles,
} from "react-icons/lu";

// Left panel: folder tree + note list + search.
// Folders and notes are managed through the right-click menu.
export default function Sidebar({
  folders,
  notes,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  onNewFolder,
  onDeleteFolder,
  onDeleteNote,
  renaming,
  onRenameStart,
  onRenameNote,
  onRenameFolder,
  onRenameCancel,
  onMove,
  onSortAll,
  sorting,
}) {
  const [menu, setMenu] = useState(null); // { x, y, items }
  const [dragOver, setDragOver] = useState(null); // folderId currently hovered while dragging
  const [sortBy, setSortBy] = useState(() => localStorage.getItem("ui.sortBy") || "created");

  useEffect(() => {
    localStorage.setItem("ui.sortBy", sortBy);
  }, [sortBy]);

  const SORTS = {
    created: { label: "Created date", fn: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) },
    updated: { label: "Last modified", fn: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) },
    az: { label: "Name A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
    za: { label: "Name Z–A", fn: (a, b) => b.title.localeCompare(a.title) },
  };

  const orderedNotes = [...notes].sort(SORTS[sortBy]?.fn || SORTS.created.fn);
  const folderFn =
    sortBy === "az"
      ? (a, b) => a.name.localeCompare(b.name)
      : sortBy === "za"
        ? (a, b) => b.name.localeCompare(a.name)
        : sortBy === "updated"
          ? (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
          : (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  const notesByFolder = {};
  for (const n of orderedNotes) {
    const key = n.folderId?._id || n.folderId || "unfiled";
    if (!notesByFolder[key]) notesByFolder[key] = [];
    notesByFolder[key].push(n);
  }

  const rootFolders = folders.filter((f) => !f.parentId).sort(folderFn);
  const unfiled = notesByFolder.unfiled || [];
  const unfiledCount = unfiled.length;

  const [treeSignal, setTreeSignal] = useState(null); // { open, n } for expand/collapse all
  const [allOpen, setAllOpen] = useState(true);
  const [reveal, setReveal] = useState(null); // { ids, n } ancestors to force open

  // Ancestor chain of a note (for reveal).
  function ancestorIds(noteId) {
    const t = notes.find((n) => n._id === noteId);
    let fid = t?.folderId?._id || t?.folderId || null;
    const ids = [];
    while (fid) {
      ids.push(String(fid));
      const f = folders.find((x) => String(x._id) === String(fid));
      fid = f?.parentId?._id || f?.parentId || null;
    }
    return ids;
  }

  // Reveal the renaming item so its input is visible (transient, always on).
  useEffect(() => {
    if (!renaming) return;
    let ids;
    if (renaming.kind === "folder") {
      const t = folders.find((f) => String(f._id) === String(renaming.id));
      let fid = t?.parentId?._id || t?.parentId || null;
      ids = [];
      while (fid) {
        ids.push(String(fid));
        const f = folders.find((x) => String(x._id) === String(fid));
        fid = f?.parentId?._id || f?.parentId || null;
      }
    } else {
      ids = ancestorIds(renaming.id);
    }
    setReveal((r) => ({ ids, n: (r?.n || 0) + 1 }));
  }, [renaming]);

  function openMenu(e, items) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - items.length * 36 - 16),
      items,
    });
  }

  function closeMenu() {
    setMenu(null);
  }

  function startDrag(e, payload) {
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  }

  function readDrop(e) {
    try {
      return JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return null;
    }
  }

  function handleFolderDragOver(e, folderId) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOver(folderId);
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
  }

  function clearDragOver() {
    setDragOver(null);
  }

  function handleFolderDrop(e, folderId) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const p = readDrop(e);
    if (!p || (p.kind === "folder" && String(p.id) === String(folderId))) return;
    onMove(p.kind, p.id, folderId);
  }

  function handleRootDrop(e) {
    e.preventDefault();
    const p = readDrop(e);
    if (!p) return;
    onMove(p.kind, p.id, null);
  }

  // Close the menu on any outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const blankMenu = [
    { label: "New Note", action: () => onNewNote(null) },
    { label: "New Folder", action: () => onNewFolder(null) },
  ];

  const folderMenu = (folder) => [
    { label: "New Note Here", action: () => onNewNote(folder._id) },
    { label: "New Subfolder", action: () => onNewFolder(folder._id) },
    { label: "Rename", action: () => onRenameStart("folder", folder._id) },
    { label: "Delete Folder", danger: true, action: () => onDeleteFolder(folder._id, folder.name) },
  ];

  const sortMenu = Object.entries(SORTS).map(([key, s]) => ({
    label: s.label,
    active: sortBy === key,
    action: () => setSortBy(key),
  }));

  const noteMenu = (note) => [
    { label: "Open", action: () => onSelectNote(note._id) },
    { label: "Rename", action: () => onRenameStart("note", note._id) },
    { label: "Delete Note", danger: true, action: () => onDeleteNote(note._id, note.title) },
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => openMenu(e, blankMenu)}>
      <div className="border-b border-white/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-wide text-neutral-100">My Notes</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNewNote(null)}
              title="New note"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              <LuPlus size={15} />
            </button>
            <button
              onClick={() => onNewFolder(null)}
              title="New folder"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              <LuFolderPlus size={15} />
            </button>
            <button
              onClick={(e) => openMenu(e, sortMenu)}
              title={`Sort notes: ${SORTS[sortBy]?.label || "Created date"}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              <LuArrowDownWideNarrow size={15} />
            </button>
            <button
              onClick={() => {
                setTreeSignal((s) => ({ open: !allOpen, n: (s?.n || 0) + 1 }));
                setAllOpen((v) => !v);
              }}
              title={allOpen ? "Collapse all folders" : "Expand all folders"}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              {allOpen ? <LuChevronsDownUp size={15} /> : <LuChevronsUpDown size={15} />}
            </button>

            <button
              onClick={onSortAll}
              disabled={sorting !== null || unfiledCount === 0}
              title={
                sorting
                  ? `Sorting ${sorting.done}/${sorting.total}...`
                  : `AI Sort All${unfiledCount > 0 ? ` (${unfiledCount} unfiled)` : ""}`
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400 text-[#06202a] hover:bg-cyan-300 disabled:cursor-default disabled:opacity-40"
            >
              <LuSparkles size={15} className={sorting ? "animate-pulse" : ""} />
            </button>
          </div>
        </div>
      </div>

      {menu && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="glass fixed z-50 w-44 overflow-hidden rounded-xl p-1 text-sm"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                closeMenu();
                item.action();
              }}
              className={`block w-full rounded-md px-3 py-1.5 text-left ${
                item.danger
                  ? "text-red-300 hover:bg-red-400/10"
                  : item.active
                    ? "bg-cyan-400/15 text-cyan-100"
                    : "text-neutral-200 hover:bg-cyan-400/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}

      <div
        className="flex-1 overflow-y-auto p-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleRootDrop}
      >
        {rootFolders.map((f) => (
              <FolderNode
                key={f._id}
                folder={f}
                folders={folders}
                notesByFolder={notesByFolder}
                depth={0}
                selectedNoteId={selectedNoteId}
                onSelectNote={onSelectNote}
                onFolderMenu={(e, folder) => openMenu(e, folderMenu(folder))}
                onNoteMenu={(e, note) => openMenu(e, noteMenu(note))}
                renaming={renaming}
                onRenameStart={onRenameStart}
                onRenameNote={onRenameNote}
                onRenameFolder={onRenameFolder}
                onRenameCancel={onRenameCancel}
                reveal={reveal}
                treeSignal={treeSignal}
                sortFn={folderFn}
                dragOver={dragOver}
                onDragStart={startDrag}
                onFolderDragOver={handleFolderDragOver}
                onDragLeaveRow={handleDragLeave}
                onDragEndRow={clearDragOver}
                onFolderDrop={handleFolderDrop}
              />
            ))}
            {unfiled.length > 0 && (
              <div className="mt-2">
                <p className="px-2 pb-1 text-xs text-neutral-500">Unfiled</p>
                {unfiled.map((n) => (
                  <NoteRow key={n._id} note={n} selected={n._id === selectedNoteId} onSelect={onSelectNote} onMenu={(e, note) => openMenu(e, noteMenu(note))} renaming={renaming} onRenameStart={onRenameStart} onRenameSubmit={onRenameNote} onRenameCancel={onRenameCancel} onDragStart={(e) => startDrag(e, { kind: "note", id: n._id })} revealN={reveal?.n} />
                ))}
              </div>
            )}
            {folders.length === 0 && notes.length === 0 && (
              <p className="px-2 pt-4 text-sm text-neutral-500">
                No notes yet. Right-click anywhere here for New Note / New Folder.
              </p>
            )}
      </div>
    </div>
  );
}

function FolderNode({
  folder,
  folders,
  notesByFolder,
  depth,
  selectedNoteId,
  onSelectNote,
  onFolderMenu,
  onNoteMenu,
  renaming,
  onRenameStart,
  onRenameNote,
  onRenameFolder,
  onRenameCancel,
  reveal,
  treeSignal,
  sortFn,
  dragOver,
  onDragStart,
  onFolderDragOver,
  onDragLeaveRow,
  onDragEndRow,
  onFolderDrop,
}) {
  const [open, setOpen] = useState(true);

  // Expand/collapse-all buttons.
  useEffect(() => {
    if (treeSignal) setOpen(treeSignal.open);
  }, [treeSignal]);

  // Auto-reveal: open the path to the renaming item / selected note.
  useEffect(() => {
    if (reveal?.ids.includes(String(folder._id))) setOpen(true);
  }, [reveal, folder._id]);

  const kids = folders.filter((f) => String(f.parentId || "") === String(folder._id)).sort(sortFn);
  const notes = notesByFolder[folder._id] || [];
  const isRenaming = renaming?.kind === "folder" && renaming.id === folder._id;

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, { kind: "folder", id: folder._id })}
        onDragEnd={onDragEndRow}
        onDragOver={(e) => onFolderDragOver(e, folder._id)}
        onDragLeave={onDragLeaveRow}
        onDrop={(e) => onFolderDrop(e, folder._id)}
        onClick={() => setOpen(!open)}
        onDoubleClick={() => {
          setOpen(true);
          onRenameStart("folder", folder._id);
        }}
        onContextMenu={(e) => onFolderMenu(e, folder)}
        className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 hover:bg-white/5 ${
          String(dragOver) === String(folder._id) ? "bg-cyan-400/10 ring-1 ring-inset ring-cyan-400/40" : ""
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="flex w-4 items-center justify-center text-neutral-500"
        >
          {open ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        </button>
        <span className="flex items-center text-neutral-500">
          {open ? <LuFolderOpen size={15} /> : <LuFolder size={15} />}
        </span>
        {isRenaming ? (
          <span className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
            <RenameInput
              initial={folder.name}
              onSubmit={(v) => onRenameFolder(folder._id, v)}
              onCancel={onRenameCancel}
            />
          </span>
        ) : (
          <span className="flex-1 truncate text-sm font-medium text-neutral-200">{folder.name}</span>
        )}
        <span className="text-xs text-neutral-600">{notes.length}</span>
      </div>

      {open && (
        <div>
          {kids.map((k) => (
            <FolderNode
              key={k._id}
              folder={k}
              folders={folders}
              notesByFolder={notesByFolder}
              depth={depth + 1}
              selectedNoteId={selectedNoteId}
              onSelectNote={onSelectNote}
              onFolderMenu={onFolderMenu}
              onNoteMenu={onNoteMenu}
              renaming={renaming}
              onRenameStart={onRenameStart}
              onRenameNote={onRenameNote}
              onRenameFolder={onRenameFolder}
              onRenameCancel={onRenameCancel}
              reveal={reveal}
              treeSignal={treeSignal}
              sortFn={sortFn}
              dragOver={dragOver}
              onDragStart={onDragStart}
              onFolderDragOver={onFolderDragOver}
              onDragLeaveRow={onDragLeaveRow}
              onDragEndRow={onDragEndRow}
              onFolderDrop={onFolderDrop}
            />
          ))}
          <div style={{ paddingLeft: `${24 + depth * 12}px` }}>
            {notes.map((n) => (
              <NoteRow key={n._id} note={n} selected={n._id === selectedNoteId} onSelect={onSelectNote} onMenu={onNoteMenu} renaming={renaming} onRenameStart={onRenameStart} onRenameSubmit={onRenameNote} onRenameCancel={onRenameCancel} onDragStart={(e) => onDragStart(e, { kind: "note", id: n._id })} revealN={reveal?.n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, selected, onSelect, onMenu, renaming, onRenameStart, onRenameSubmit, onRenameCancel, onDragStart, revealN }) {
  const isRenaming = renaming?.kind === "note" && renaming.id === note._id;
  const rowRef = useRef(null);

  // Auto-reveal: scroll the selected row into view when the target changes.
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [revealN, selected]);

  if (isRenaming) {
    return (
      <div ref={rowRef} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm">
        <LuFileText size={14} className="shrink-0 text-neutral-500" />
        <RenameInput
          initial={note.title}
          onSubmit={(v) => onRenameSubmit(note._id, v)}
          onCancel={onRenameCancel}
        />
      </div>
    );
  }
  return (
    <button
      ref={rowRef}
      draggable
      onDragStart={onDragStart}
      onClick={() => onSelect(note._id)}
      onDoubleClick={() => onRenameStart("note", note._id)}
      onContextMenu={(e) => onMenu(e, note)}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${
        selected ? "bg-cyan-400/15 text-cyan-100" : "text-neutral-400 hover:bg-white/5"
      }`}
    >
      <LuFileText size={14} className="shrink-0 text-neutral-500" />
      <span className="truncate">{note.title}</span>
    </button>
  );
}

// Inline rename field: text selected on focus, Enter or clicking away commits, Escape cancels.
function RenameInput({ initial, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function cancel() {
    if (!alive.current) return;
    onCancel();
  }
  function commit() {
    if (!alive.current) return;
    const v = value.trim();
    if (!v || v === initial) onCancel();
    else onSubmit(v);
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="w-full min-w-0 rounded-md border border-cyan-400/50 bg-white/[0.05] px-2 py-0.5 text-sm text-neutral-100 focus:outline-none"
    />
  );
}
