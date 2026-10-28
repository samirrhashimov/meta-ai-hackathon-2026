import { useCallback, useRef } from "react";

// Thin drag handle between panes. Reports horizontal drag distance.
// onDragStart/onDragEnd let the app suspend width transitions mid-drag.
export default function Resizer({ onResize, onDragStart, onDragEnd }) {
  const drag = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      drag.current = { startX: e.clientX };
      e.currentTarget.setPointerCapture(e.pointerId);
      onDragStart?.();
    },
    [onDragStart]
  );

  const finish = useCallback(() => {
    drag.current = null;
    onDragEnd?.();
  }, [onDragEnd]);

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
      className="group flex w-[5px] shrink-0 cursor-col-resize justify-center transition-colors"
      title="Drag to resize"
      style={{ touchAction: "none" }}
    >
      <div
        className="w-px bg-white/10 transition-colors group-hover:bg-[var(--acc)] group-active:bg-[var(--acc-bright)]"
        style={{ opacity: 0.7 }}
      />
    </div>
  );
}
