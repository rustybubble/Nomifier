// AR extras drawn after the overlay: safer-pick arrows, best-pick star, red-alert pulse.
import { scoreMemo } from "../scoring/memo";
import { alternatives } from "../scoring/alternatives";
import type { AppData, Tier, UserProfile } from "../types";
import type { Box } from "../scan/coords";
import { COLORS, type ScreenTrack } from "../scan/overlay";

export interface Pulse {
  trackId: number;
  until: number; // performance.now() timebase
}

export interface ExtrasOptions {
  data: AppData;
  profile: UserProfile;
  useFilter?: string[] | null;
  focusNdc?: string | null;
  pulse?: Pulse | null;
}

export interface Item {
  trackId: number;
  ndc: string;
  box: Box;
}
export interface Arrow {
  from: Box;
  to: Box;
  fromId: number;
  toId: number;
}
export type ScoreFn = (ndc: string) => { tier: Tier; score: number } | null;

export const MAX_ARROWS = 2;
const GOLD = "#FFD60A";

/** Where a line from the box center toward `toward` exits the box. */
export function edgePoint(
  box: Box,
  toward: [number, number],
): [number, number] {
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const t = Math.min(
    dx === 0 ? Infinity : (box[2] - box[0]) / 2 / Math.abs(dx),
    dy === 0 ? Infinity : (box[3] - box[1]) / 2 / Math.abs(dy),
  );
  return [cx + dx * t, cy + dy * t];
}

const center = (b: Box): [number, number] => [
  (b[0] + b[2]) / 2,
  (b[1] + b[3]) / 2,
];

/**
 * Sources are red products (lowest score first) plus the focused one (any tier, first).
 * altFn(ndc) returns the best strictly-better in-view alternative ndc, or null.
 */
export function pickArrows(
  items: Item[],
  scoreFn: ScoreFn,
  altFn: (ndc: string) => string | null,
  focusNdc?: string | null,
): Arrow[] {
  const sources = items
    .map((it) => ({ it, r: scoreFn(it.ndc) }))
    .filter(({ it, r }) => it.ndc === focusNdc || r?.tier === "red")
    .sort(
      (a, b) =>
        Number(b.it.ndc === focusNdc) - Number(a.it.ndc === focusNdc) ||
        (a.r?.score ?? 0) - (b.r?.score ?? 0),
    );
  const out: Arrow[] = [];
  const seen = new Set<string>();
  for (const { it } of sources) {
    if (out.length >= MAX_ARROWS) break;
    if (seen.has(it.ndc)) continue;
    seen.add(it.ndc);
    const target = altFn(it.ndc);
    const to = target && items.find((x) => x.ndc === target);
    if (to && to.trackId !== it.trackId)
      out.push({
        from: it.box,
        to: to.box,
        fromId: it.trackId,
        toId: to.trackId,
      });
  }
  return out;
}

/** Highest-scoring item sharing any of `uses`. scoreFn returns null for unrated / hard-stopped. */
export function bestForUse<T extends { ndc: string; uses: string[] }>(
  items: T[],
  scoreFn: (ndc: string) => number | null,
  uses: string[],
): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const it of items) {
    if (!it.uses.some((u) => uses.includes(u))) continue;
    const s = scoreFn(it.ndc);
    if (s !== null && s > bestScore) {
      best = it;
      bestScore = s;
    }
  }
  return best;
}

function drawArrow(ctx: CanvasRenderingContext2D, a: Arrow, now: number): void {
  const p0 = edgePoint(a.from, center(a.to));
  const p1 = edgePoint(a.to, center(a.from));
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  if (len < 12) return;
  // Bulge perpendicular to the line, toward the top of the screen so it stays off the labels below boxes.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) ((nx = -nx), (ny = -ny));
  const cp: [number, number] = [
    (p0[0] + p1[0]) / 2 + nx * len * 0.25,
    (p0[1] + p1[1]) / 2 + ny * len * 0.25,
  ];
  // Stop the curve a little short so the head tip lands on the box edge.
  const ang = Math.atan2(p1[1] - cp[1], p1[0] - cp[0]);
  const head = 14;
  const end: [number, number] = [
    p1[0] - Math.cos(ang) * head * 0.6,
    p1[1] - Math.sin(ang) * head * 0.6,
  ];

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const curve = () => {
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.quadraticCurveTo(cp[0], cp[1], end[0], end[1]);
  };
  curve();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 8;
  ctx.stroke();
  curve();
  ctx.setLineDash([12, 9]);
  ctx.lineDashOffset = -((now / 30) % 21); // flows toward the target
  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p1[0], p1[1]);
  for (const s of [-1, 1])
    ctx.lineTo(
      p1[0] - Math.cos(ang + s * 0.5) * head,
      p1[1] - Math.sin(ang + s * 0.5) * head,
    );
  ctx.closePath();
  ctx.fillStyle = COLORS.white;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, box: Box): void {
  const x = box[2] - 4;
  const y = box[1] + 4;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x - 13, y + 13, 14, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.font = "20px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★", x - 13, y + 14);
  ctx.restore();
}

function drawPulse(ctx: CanvasRenderingContext2D, box: Box, now: number): void {
  const ph = (now % 700) / 700;
  const g = ph * 26;
  ctx.save();
  ctx.globalAlpha = 1 - ph;
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(
    box[0] - g,
    box[1] - g,
    box[2] - box[0] + 2 * g,
    box[3] - box[1] + 2 * g,
    10 + g,
  );
  ctx.stroke();
  ctx.restore();
}

export function makeDrawExtras(opts: ExtrasOptions) {
  const { data, profile, useFilter, focusNdc, pulse } = opts;
  const scoreFn: ScoreFn = (ndc) => {
    const p = data.productsByNdc.get(ndc);
    if (!p) return null;
    const r = scoreMemo(p, profile, data);
    return r.status === "scored" ? { tier: r.tier, score: r.score } : null;
  };

  const altCache = new Map<string, string | null>(); // lives as long as this closure (rebuilt when data/profile change)

  return (
    ctx: CanvasRenderingContext2D,
    displayed: ReadonlyArray<ScreenTrack>,
  ): void => {
    const now = performance.now();
    const items: Array<Item & { uses: string[] }> = [];
    const inView = new Set<string>();
    for (const d of displayed) {
      const ndc = d.track.product_id;
      const p =
        d.track.status === "named" && ndc && data.productsByNdc.get(ndc);
      if (!p) continue;
      items.push({
        trackId: d.track.id,
        ndc: p.ndc11,
        box: d.screenBox,
        uses: p.uses,
      });
      inView.add(p.ndc11);
    }

    // alternatives() rescoring the whole catalog is not memoized; cache per (source, in-view set).
    const viewKey = [...inView].sort().join(",");
    const altFn = (ndc: string): string | null => {
      const key = `${ndc}|${viewKey}`;
      if (altCache.has(key)) return altCache.get(key) ?? null;
      const p = data.productsByNdc.get(ndc);
      const hit = p
        ? (alternatives(p, profile, data, inView).find((a) => a.inView)
            ?.ndc11 ?? null)
        : null;
      altCache.set(key, hit);
      return hit;
    };
    for (const a of pickArrows(items, scoreFn, altFn, focusNdc))
      drawArrow(ctx, a, now);

    if (useFilter?.length) {
      const best = bestForUse(
        items,
        (n) => {
          const p = data.productsByNdc.get(n);
          const r = p && scoreMemo(p, profile, data);
          return r && r.status === "scored" && !r.hard_stops_triggered.length
            ? r.score
            : null;
        },
        useFilter,
      );
      if (best) drawStar(ctx, best.box);
    }

    if (pulse && pulse.until > now) {
      const d = displayed.find((x) => x.track.id === pulse.trackId);
      if (d) drawPulse(ctx, d.screenBox, now);
    }
  };
}
