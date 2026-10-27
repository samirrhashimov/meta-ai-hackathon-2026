import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { LuPanelRightClose, LuSend, LuSparkles } from "react-icons/lu";

const HINTS = [
  "Create a Sports folder and move my gym note into it.",
  "Find all my notes about travel.",
  "Summarize my meeting notes from this week.",
  "File my unfiled notes into folders.",
  "What did I write about books?",
];

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
  const [hintIdx, setHintIdx] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const bottomRef = useRef(null);
  const taRef = useRef(null);

  // Auto-grow the input as the message gets longer. The scrollbar stays
  // hidden until the box hits its max height (also kills the phantom
  // 1px scrollbar from subpixel rounding on an empty box).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    if (el.scrollHeight > 160) {
      el.style.height = "160px";
      el.style.overflowY = "auto";
    } else {
      el.style.height = el.scrollHeight + "px";
    }
  }, [input]);

  // Rotate example prompts while the chat is empty.
  useEffect(() => {
    if (messages.length > 0) return;
    const t = setInterval(() => {
      setHintVisible(false);
      setTimeout(() => {
        setHintIdx((i) => (i + 1) % HINTS.length);
        setHintVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(t);
  }, [messages.length]);

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

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !sending && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
              <LuSparkles size={19} />
            </span>
            <p className="text-sm font-medium text-neutral-300">
              Ask me to find, create, move, or organize your notes
            </p>
            <button
              onClick={() => setInput(HINTS[hintIdx])}
              title="Click to try it"
              className={`mt-2 max-w-full text-sm text-neutral-500 transition-all duration-300 hover:text-cyan-200 ${
                hintVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              “{HINTS[hintIdx]}”
            </button>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m._id} className="mb-2.5 flex justify-end">
              <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md border border-cyan-300/25 bg-cyan-400/15 px-3.5 py-2 text-sm leading-relaxed text-cyan-50">
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          ) : (
            <div key={m._id} className="mb-2.5 flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-cyan-300">
                <LuSparkles size={12} />
              </span>
              <div className="max-w-[85%] min-w-0 rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2 text-sm leading-relaxed text-neutral-300">
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          )
        )}
        {sending && (
          <div className="mb-2 flex items-center gap-1.5 px-1 py-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-cyan-300">
              <LuSparkles size={12} />
            </span>
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  style={{ animationDelay: `${d}ms` }}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300/70"
                />
              ))}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2">
        <form onSubmit={send} className="relative flex-1">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            placeholder="Ask Assistant..."
            className="md-chat-scroll block max-h-40 w-full resize-none overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.03] py-2.5 pl-4 pr-12 text-sm leading-relaxed placeholder:text-neutral-600 focus:border-cyan-400/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            title="Send"
            className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-[#06202a] hover:bg-cyan-300 disabled:cursor-default disabled:opacity-40"
          >
            <LuSend size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}


