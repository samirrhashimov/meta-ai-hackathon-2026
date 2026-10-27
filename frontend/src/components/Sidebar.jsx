import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuFileText,
  LuFolder,
  LuFolderOpen,
  LuPanelLeftClose,
  LuSearch,
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
  onOpenDashboard,
  showingDashboard,
  onCollapse,
  onSortAll,
  sorting,
}) {
  const [search, setSearch] = useState("");
  const [rootName, setRootName] = useState("");
  const [addingId, setAddingId] = useState(null); // 'root' | folderId | null
  const [menu, setMenu] = useState(null); // { x, y, items }

  const q = search.trim().toLowerCase();
  const visibleNotes = q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes;

  const notesByFolder = {};
  for (const n of visibleNotes) {
    const key = n.folderId?._id || n.folderId || "unfiled";
    if (!notesByFolder[key]) notesByFolder[key] = [];
    notesByFolder[key].push(n);
  }

  const rootFolders = folders.filter((f) => !f.parentId);
  const unfiled = notesByFolder.unfiled || [];
  const unfiledCount = unfiled.length;

  function submitFolder(parentId, name) {
    onNewFolder(parentId, name);
    setAddingId(null);
  }

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
    { label: "New Folder", action: () => setAddingId("root") },
  ];

  const folderMenu = (folder) => [
    { label: "New Note Here", action: () => onNewNote(folder._id) },
    { label: "New Subfolder", action: () => setAddingId(folder._id) },
    { label: "Delete Folder", danger: true, action: () => onDeleteFolder(folder._id, folder.name) },
  ];

  const noteMenu = (note) => [
    { label: "Open", action: () => onSelectNote(note._id) },
    { label: "Delete Note", danger: true, action: () => onDeleteNote(note._id, note.title) },
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => openMenu(e, blankMenu)}>
      <div className="border-b border-white/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-wide text-neutral-100">My Notes</h1>
          <button
            onClick={onCollapse}
            title="Close sidebar"
            className="rounded-md p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
          >
            <LuPanelLeftClose size={15} />
          </button>
        </div>
        <button
          onClick={onOpenDashboard}
          className={`mb-2 w-full rounded-md px-2 py-1.5 text-left text-sm ${
            showingDashboard ? "bg-cyan-400/15 text-cyan-100" : "text-neutral-400 hover:bg-white/5"
          }`}
        >
          Dashboard
        </button>
        <div className="relative">
          <LuSearch
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full rounded-md border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-cyan-400/50 focus:outline-none"
          />
        </div>
        <button
          onClick={onSortAll}
          disabled={sorting !== null || unfiledCount === 0}
          title="File all unfiled notes into folders with AI"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-cyan-300/30 px-2 py-1.5 text-sm text-cyan-200 hover:bg-cyan-400/10 disabled:cursor-default disabled:opacity-40"
        >
          <LuSparkles size={14} />
          {sorting
            ? `Sorting ${sorting.done}/${sorting.total}...`
            : `AI Sort All${unfiledCount > 0 ? ` (${unfiledCount})` : ""}`}
        </button>
        {addingId === "root" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!rootName.trim()) return;
              submitFolder(null, rootName.trim());
              setRootName("");
            }}
            className="mt-2 flex gap-1"
          >
            <input
              autoFocus
              value={rootName}
              onChange={(e) => setRootName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAddingId(null);
              }}
              placeholder="Folder name"
              className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-sm focus:border-cyan-400/50 focus:outline-none"
            />
            <button type="submit" className="flex items-center rounded-md px-2 text-sm text-cyan-300 hover:bg-white/5">
              <LuCheck size={14} />
            </button>
          </form>
        )}
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
                  : "text-neutral-200 hover:bg-cyan-400/10"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {q ? (
          // While searching: flat result list
          <div>
            <p className="px-2 pb-1 text-xs text-neutral-500">{visibleNotes.length} results</p>
            {visibleNotes.map((n) => (
              <NoteRow key={n._id} note={n} selected={n._id === selectedNoteId} onSelect={onSelectNote} onMenu={(e, note) => openMenu(e, noteMenu(note))} />
            ))}
          </div>
        ) : (
          <>
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
                addingId={addingId}
                onSubmitFolder={submitFolder}
                onCancelAdd={() => setAddingId(null)}
              />
            ))}
            {unfiled.length > 0 && (
              <div className="mt-2">
                <p className="px-2 pb-1 text-xs text-neutral-500">Unfiled</p>
                {unfiled.map((n) => (
                  <NoteRow key={n._id} note={n} selected={n._id === selectedNoteId} onSelect={onSelectNote} onMenu={(e, note) => openMenu(e, noteMenu(note))} />
                ))}
              </div>
            )}
            {folders.length === 0 && notes.length === 0 && (
              <p className="px-2 pt-4 text-sm text-neutral-500">
                No notes yet. Right-click anywhere here for New Note / New Folder.
              </p>
            )}
          </>
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
  addingId,
  onSubmitFolder,
  onCancelAdd,
}) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");

  const kids = folders.filter((f) => String(f.parentId || "") === String(folder._id));
  const notes = notesByFolder[folder._id] || [];

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmitFolder(folder._id, name.trim());
    setName("");
  }

  return (
    <div>
      <div
        onClick={() => setOpen(!open)}
        onContextMenu={(e) => onFolderMenu(e, folder)}
        className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 hover:bg-white/5"
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
        <span className="flex-1 truncate text-sm font-medium text-neutral-200">{folder.name}</span>
        <span className="text-xs text-neutral-600">{notes.length}</span>
      </div>

      {addingId === folder._id && (
        <form onSubmit={submit} className="flex gap-1 pr-2" style={{ paddingLeft: `${24 + depth * 12}px` }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancelAdd();
            }}
            placeholder="Subfolder name"
            className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-sm focus:border-cyan-400/50 focus:outline-none"
          />
          <button type="submit" className="flex items-center rounded-md px-2 text-sm text-cyan-300 hover:bg-white/5">
            <LuCheck size={14} />
          </button>
        </form>
      )}

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
              addingId={addingId}
              onSubmitFolder={onSubmitFolder}
              onCancelAdd={onCancelAdd}
            />
          ))}
          <div style={{ paddingLeft: `${24 + depth * 12}px` }}>
            {notes.map((n) => (
              <NoteRow key={n._id} note={n} selected={n._id === selectedNoteId} onSelect={onSelectNote} onMenu={onNoteMenu} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, selected, onSelect, onMenu }) {
  return (
    <button
      onClick={() => onSelect(note._id)}
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
