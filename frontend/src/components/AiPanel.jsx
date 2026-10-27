import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { LuPanelRightClose, LuSend, LuX } from "react-icons/lu";

// Right panel: the Assistant chat.
export default function AiPanel({ onChanged, onCollapse }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <h2 className="text-sm font-semibold text-neutral-100">Assistant</h2>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Close panel"
            className="rounded-md p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
          >
            <LuPanelRightClose size={16} />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <Chat onChanged={onChanged} />
      </div>
    </div>
  );
}

// Cleared once per page load: every refresh starts with an empty chat.
let clearedOnce = false;

function Chat({ onChanged }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  // Wipe history on page load only; remounts (e.g. switching notes) keep it.
  useEffect(() => {
    if (!clearedOnce) {
      clearedOnce = true;
      api.clearChat().catch(() => {});
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const now = Date.now();
    setMessages((prev) => [...prev, { _id: `tmp-${now}`, role: "user", content: text }]);
    setSending(true);
    try {
      const { reply } = await api.chat(text);
      setMessages((prev) => [...prev, { _id: `tmp-${now}-a`, role: "assistant", content: reply }]);
      onChanged(); // the chat may have created/moved notes
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { _id: `tmp-${now}-e`, role: "assistant", content: "Error: " + err.message },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function clear() {
    await api.clearChat().catch(() => {});
    setMessages([]);
  }

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !sending && (
          <p className="rounded-lg border border-dashed border-white/10 p-4 text-sm text-neutral-500">
            Ask me to find, create, move, or organize your notes. For example: "Create a Sports
            folder and move my gym note into it."
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m._id}
            className={`mb-2 rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-8 border border-cyan-300/25 bg-cyan-400/15 text-cyan-50"
                : "mr-8 border border-white/[0.07] bg-white/[0.04] text-neutral-300"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {sending && <p className="text-sm text-neutral-500">Thinking...</p>}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <form onSubmit={send} className="flex flex-1 gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Assistant..."
            className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm placeholder:text-neutral-600 focus:border-cyan-400/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending}
            className="flex items-center rounded-md bg-cyan-400 px-3 text-sm font-medium text-[#06202a] hover:bg-cyan-300 disabled:opacity-50"
          >
            <LuSend size={15} />
          </button>
        </form>
        <button
          onClick={clear}
          title="Clear chat"
          className="flex items-center rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-white/5"
        >
          <LuX size={14} />
        </button>
      </div>
    </div>
  );
}


