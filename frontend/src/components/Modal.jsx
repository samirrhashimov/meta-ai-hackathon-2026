import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Keyboard hint chip shown inside modal buttons (desktop only — hidden on
// touch devices via CSS). Usage: <button>Delete <Kbd>Enter</Kbd></button>
export function Kbd({ children }) {
  return <kbd className="kbd-hint">{children}</kbd>;
}

// Stack of open modals so nested modals (e.g. accent picker over settings)
// only let the topmost one answer to the keyboard.
const stack = [];

// Smooth modal shell: the backdrop fades and the panel rises in on mount;
// dismissing animates out before the parent unmounts it. Children are a
// render prop receiving an animated `close` — action buttons (Delete...)
// should call the parent's onClose directly to skip the fade-out.
//
// Keyboard: Escape closes the top modal; Enter clicks its
// [data-modal-primary] button (e.g. Delete), unless focus is inside a text
// field. Modals opt into Enter by marking their primary button.
export default function Modal({ onClose, children }) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  closeRef.current = () => {
    setClosing(true);
    window.setTimeout(onClose, 160);
  };
  function close() {
    closeRef.current();
  }
  useEffect(() => {
    stack.push(panelRef);
    // Move focus into the modal on open: the click that opened it left focus
    // on a button behind the modal, where Enter would re-trigger that button
    // instead of the modal's primary action. Only steals focus when it is
    // currently outside the modal (e.g. Tags' own autofocused search keeps it).
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const primary = panel.querySelector("[data-modal-primary]:not([disabled])");
      if (primary) primary.focus();
    }
    function onKey(e) {
      if (stack[stack.length - 1] !== panelRef) return; // nested: top modal only
      const panel = panelRef.current;
      if (!panel) return;
      // No focus check here: right after a modal opens, focus is still on
      // <body> (nothing inside is focused yet) and the shortcuts must work.
      // Typing areas are guarded per-key below instead.
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key === "Enter") {
        const t = e.target;
        if (
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            t.tagName === "BUTTON" || // focused button: native Enter already clicks it
            t.isContentEditable)
        )
          return;
        const primary = panel.querySelector("[data-modal-primary]:not([disabled])");
        if (primary) {
          e.preventDefault();
          primary.click();
        }
      }
    }
    // Capture phase: runs before any in-app handler (editor, menus) that
    // might stop the event's propagation.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const i = stack.indexOf(panelRef);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
  return createPortal(
    <div
      className={`modal-backdrop fixed inset-0 z-50 flex items-center justify-center ${
        closing ? "is-closing" : ""
      }`}
      onClick={close}
    >
      <div
        ref={panelRef}
        className={`modal-panel flex w-full justify-center p-4 ${closing ? "is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children(close)}
      </div>
    </div>,
    document.body
  );
}
