import { useEffect, useRef, useState, type ReactNode } from "react";

export type Detent = "half" | "full";

interface Props {
  open: boolean;
  onClose: () => void;
  detent?: Detent;
  title?: string;
  children: ReactNode;
}

/** iOS-style bottom sheet. Drag the grabber/title between half and full; swipe down to close. */
export default function Sheet({
  open,
  onClose,
  detent = "half",
  title,
  children,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [cur, setCur] = useState<Detent>(detent);
  const [drag, setDrag] = useState<number | null>(null); // live translateY while dragging
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef({ y: 0, base: 0, t: 0 });
  const returnFocus = useRef<Element | null>(null);

  // Mount, then flip `shown` on the next frame so the enter transition runs; reverse on close.
  useEffect(() => {
    if (open) {
      returnFocus.current = document.activeElement;
      setCur(detent);
      setMounted(true);
      const r = requestAnimationFrame(() =>
        requestAnimationFrame(() => setShown(true)),
      );
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 450);
    return () => window.clearTimeout(t);
  }, [open, detent]);

  useEffect(() => {
    if (shown) ref.current?.focus();
    else if (returnFocus.current instanceof HTMLElement)
      returnFocus.current.focus();
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const h = ref.current?.offsetHeight ?? 600;
  const base = cur === "half" ? h * 0.5 : 0;
  const y = !shown ? h : (drag ?? base);

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, base, t: e.timeStamp };
    setDrag(base);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    setDrag(Math.max(0, start.current.base + e.clientY - start.current.y));
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag === null) return;
    const dy = e.clientY - start.current.y;
    const v = dy / Math.max(1, e.timeStamp - start.current.t); // px/ms, +down
    const p = drag + v * 150; // project forward a little
    setDrag(null);
    if (p > h * 0.78) onClose();
    else setCur(p > h * 0.25 ? "half" : "full");
  };

  return (
    <>
      <div
        className={`sheet-backdrop${shown ? " shown" : ""}`}
        onClick={onClose}
      />
      <div
        ref={ref}
        className={`sheet${drag !== null ? " dragging" : ""}`}
        style={{ transform: `translateY(${y}px)` }}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Details"}
        tabIndex={-1}
      >
        <div
          className="sheet-head chrome"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="sheet-grab-hit">
            <div
              className="sheet-grabber"
              style={{ flex: 1, maxWidth: 36, margin: "0 auto" }}
            />
          </div>
          {title && <h2 className="sheet-title">{title}</h2>}
        </div>
        <div
          className="sheet-body"
          style={
            cur === "half"
              ? {
                  paddingBottom: `calc(${Math.round(h * 0.5)}px + var(--sab, env(safe-area-inset-bottom)))`,
                }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </>
  );
}
