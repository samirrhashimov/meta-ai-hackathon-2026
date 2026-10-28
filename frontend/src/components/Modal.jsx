import { useState } from "react";
import { createPortal } from "react-dom";

// Smooth modal shell: the backdrop fades and the panel rises in on mount;
// dismissing animates out before the parent unmounts it. Children are a
// render prop receiving an animated `close` — action buttons (Delete...)
// should call the parent's onClose directly to skip the fade-out.
export default function Modal({ onClose, children }) {
  const [closing, setClosing] = useState(false);
  function close() {
    setClosing(true);
    window.setTimeout(onClose, 160);
  }
  return createPortal(
    <div
      className={`modal-backdrop fixed inset-0 z-50 flex items-center justify-center ${
        closing ? "is-closing" : ""
      }`}
      onClick={close}
    >
      <div
        className={`modal-panel flex w-full justify-center p-4 ${closing ? "is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children(close)}
      </div>
    </div>,
    document.body
  );
}
