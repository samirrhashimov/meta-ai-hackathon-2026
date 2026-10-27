import { useCallback, useRef } from "react";

// Thin drag handle between panes. Reports horizontal drag distance.
export default function Resizer({ onResize }) {
  const drag = useRef(null);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    drag.current = { startX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const finish = useCallback(() => {
    drag.current = null;
  }, []);

  const onPointerMove = useCallback(
    (e) => {
      if (!drag.current) return;
      onResize(e.clientX - drag.current.startX);
      drag.current.startX = e.clientX;
    },
    [onResize]
  );

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      className="w-1 shrink-0 cursor-col-resize rounded transition-colors hover:bg-cyan-400/50 active:bg-cyan-400/70"
      style={{ touchAction: "none" }}
    />
  );
}
