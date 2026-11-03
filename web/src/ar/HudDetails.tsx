// Long-press CV details card. Tap anywhere on it to dismiss.
import type { Product, Track } from "../types";

const card: React.CSSProperties = {
  position: "absolute",
  left: 12,
  right: 12,
  bottom: "calc(var(--sab, env(safe-area-inset-bottom)) + 12px)",
  zIndex: 5,
  padding: "12px 14px",
  borderRadius: 16,
  background: "rgba(20,20,22,0.82)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  color: "#fff",
  font: "13px ui-monospace, SFMono-Regular, Menlo, monospace",
  lineHeight: 1.6,
  border: "none",
  textAlign: "left",
  width: "calc(100% - 24px)",
};

export default function HudDetails({
  track,
  product,
  onClose,
}: {
  track: Track | null;
  product?: Product;
  onClose: () => void;
}) {
  if (!track) return null;
  const rows: Array<[string, string]> = [
    ["track", `#${track.id}`],
    ["status", track.status],
    ["similarity", `${(track.similarity * 100).toFixed(1)}%`],
    ["source", track.source ?? "vision"],
    ["age", `${track.age} frames`],
  ];
  if (product) {
    rows.push(["brand", product.brand_name ?? "-"], ["ndc11", product.ndc11]);
  } else if (track.product_id) {
    rows.push(["ndc11", track.product_id]);
  }
  return (
    <button type="button" style={card} onClick={onClose} aria-label="Close details">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 12 }}>
          <span style={{ width: 82, opacity: 0.6, flex: "none" }}>{k}</span>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
        </div>
      ))}
    </button>
  );
}
