// Canvas drawing of the AR overlay. Scoring plugs in through styleFor(track) -> TrackStyle.
import type { Track } from "../types";
import { boxToScreen, type Box, type Mapping } from "./coords";
import type { Displayed } from "./tracks";

export interface TrackStyle {
  color: string;
  lineWidth: number;
  dash?: number[];
  badge?: { text: string; icon?: string };
  label?: string;
  chips?: string[];
  dim?: boolean;
  hidden?: boolean;
}

export interface ScreenTrack {
  track: Track;
  screenBox: Box;
  opacity: number;
}

export const COLORS = {
  green: "#16A34A",
  orange: "#F97316",
  red: "#DC2626",
  gray: "#9CA3AF",
  white: "#FFFFFF",
  amber: "#F59E0B",
};
export const TIER_ICON = { green: "✓", yellow: "!", red: "✕" } as const;

/** Status-only styling, used until scoring is wired in. */
export function defaultStyleFor(t: Track): TrackStyle {
  switch (t.status) {
    case "named":
      return {
        color: COLORS.white,
        lineWidth: 4,
        badge: { text: `${Math.round(t.similarity * 100)}%` },
      };
    case "family":
      return {
        color: COLORS.gray,
        lineWidth: 4,
        dash: [10, 8],
        label: t.family
          ? `${t.family}: turn to show the barcode`
          : "Turn to show the barcode",
      };
    case "unknown":
      return { color: COLORS.gray, lineWidth: 1.5, label: "Unknown" };
    default:
      return { color: COLORS.gray, lineWidth: 0, hidden: true };
  }
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  fg: string,
  font: string,
  viewW = Infinity,
): number {
  ctx.font = font;
  const padX = 8;
  const h = 22;
  const w = ctx.measureText(text).width + padX * 2;
  x = fitX(x, w, viewW);
  ctx.fillStyle = fill;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 0.5);
  return w;
}

/** Keeps a w-wide label inside the view (4px margin) so labels near the edge aren't clipped. */
export function fitX(x: number, w: number, viewW: number): number {
  return Math.max(4, Math.min(x, viewW - w - 4));
}

/** Draws all displayed tracks. Canvas backing store must be cssW*dpr x cssH*dpr. */
export function draw(
  ctx: CanvasRenderingContext2D,
  displayed: ReadonlyArray<Displayed>,
  styleFor: (t: Track) => TrackStyle,
  mapping: Mapping,
  extras?: (ctx: CanvasRenderingContext2D, list: ScreenTrack[]) => void,
): void {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const viewW = ctx.canvas.width / dpr;

  const shown: ScreenTrack[] = [];
  for (const d of displayed) {
    const s = styleFor(d.track);
    if (s.hidden || d.opacity <= 0) continue;
    const [x1, y1, x2, y2] = boxToScreen(mapping, d.box);
    shown.push({
      track: d.track,
      screenBox: [x1, y1, x2, y2],
      opacity: d.opacity,
    });

    ctx.save();
    ctx.globalAlpha = d.opacity * (s.dim ? 0.3 : 1);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.lineWidth;
    ctx.setLineDash(s.dash ?? []);
    rr(ctx, x1, y1, x2 - x1, y2 - y1, 10);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!s.dim) {
      if (s.badge) {
        const text = s.badge.icon
          ? `${s.badge.icon} ${s.badge.text}`
          : s.badge.text;
        pill(
          ctx,
          text,
          x1 + 4,
          y1 + 4,
          s.color,
          "#fff",
          "bold 14px -apple-system, system-ui, sans-serif",
          viewW,
        );
      }
      let y = y2 + 6;
      if (s.label) {
        ctx.font = "600 13px -apple-system, system-ui, sans-serif";
        const w = ctx.measureText(s.label).width + 12;
        const lx = fitX(x1, w, viewW);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        rr(ctx, lx, y, w, 20, 6);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(s.label, lx + 6, y + 10.5);
        y += 24;
      }
      // One chip per row so long chips ("Also acetaminophen", "⚠ Label updated") never run off screen.
      for (const c of s.chips ?? []) {
        pill(
          ctx,
          c,
          x1,
          y,
          COLORS.amber,
          "#1F1300",
          "600 12px -apple-system, system-ui, sans-serif",
          viewW,
        );
        y += 26;
      }
    }
    ctx.restore();
  }
  extras?.(ctx, shown);
}
