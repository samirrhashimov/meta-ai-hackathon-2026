import { useState } from "react";
import { LuX } from "react-icons/lu";
import { currentAccent } from "../accent";

// Compact tag chips with an inline add field. Tags are stored plain
// (no "#"); the chip renders the Obsidian-style "#" prefix.
export default function TagEditor({ tags, onChange }) {
  const acc = currentAccent();
  const [value, setValue] = useState("");

  function add(raw) {
    const t = (raw || "").trim().replace(/^#+/, "");
    if (!t) {
      setValue("");
      return;
    }
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      onChange([...tags, t].slice(0, 10));
    }
    setValue("");
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className={`flex items-center gap-1 rounded-full border ${acc.softBorder} ${acc.softBg} px-2 py-0.5 text-xs ${acc.softText}`}
        >
          #{t}
          <button
            onClick={() => onChange(tags.filter((x) => x !== t))}
            title={`Remove tag ${t}`}
            className={`${acc.textDim} ${acc.softTextHover}`}
          >
            <LuX size={12} />
          </button>
        </span>
      ))}
      <input
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",") || v.endsWith(" ")) add(v.slice(0, -1));
          else setValue(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(value);
          }
        }}
        placeholder={tags.length === 0 ? "Add tags..." : "Add tag..."}
        className="min-w-24 flex-1 bg-transparent text-xs text-neutral-300 placeholder:text-neutral-600 focus:outline-none"
      />
    </div>
  );
}
