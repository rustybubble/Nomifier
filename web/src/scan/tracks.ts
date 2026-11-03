// Displayed-track store: eased boxes, fade in/out, hit testing. Pure (time is passed in).
import type { Track } from "../types";
import type { Box } from "./coords";

export const EASE = 0.35; // per 60 fps frame
export const FADE_IN_MS = 150;
export const FADE_OUT_MS = 400;
const FRAME_MS = 1000 / 60;

export interface Displayed {
  id: number;
  track: Track; // last known data
  box: Box; // current eased box (frame px)
  target: Box;
  opacity: number; // 0..1
  born: number;
  lostAt: number | null; // when it disappeared from the latest update
  fadeFrom: number; // opacity when fade-out began
}

export class DisplayedTracks {
  private map = new Map<number, Displayed>();

  update(tracks: Track[], now: number): void {
    const seen = new Set<number>();
    for (const t of tracks) {
      seen.add(t.id);
      const d = this.map.get(t.id);
      if (d) {
        d.track = t;
        d.target = [...t.box];
        if (d.lostAt !== null) {
          d.lostAt = null;
          d.born = now - d.opacity * FADE_IN_MS; // resume fade-in from current opacity
        }
      } else {
        this.map.set(t.id, {
          id: t.id,
          track: t,
          box: [...t.box],
          target: [...t.box],
          opacity: 0,
          born: now,
          lostAt: null,
          fadeFrom: 0,
        });
      }
    }
    for (const d of this.map.values()) {
      if (!seen.has(d.id) && d.lostAt === null) {
        d.lostAt = now;
        d.fadeFrom = d.opacity;
      }
    }
  }

  step(now: number, dt: number): void {
    const alpha = 1 - Math.pow(1 - EASE, dt / FRAME_MS);
    for (const d of [...this.map.values()]) {
      for (let i = 0; i < 4; i++) d.box[i] += (d.target[i] - d.box[i]) * alpha;
      if (d.lostAt === null) {
        d.opacity = Math.min(1, (now - d.born) / FADE_IN_MS);
      } else {
        const k = (now - d.lostAt) / FADE_OUT_MS;
        if (k >= 1) {
          this.map.delete(d.id);
          continue;
        }
        d.opacity = d.fadeFrom * (1 - k);
      }
    }
  }

  /** Draw order, bottom to top. */
  list(): Displayed[] {
    return [...this.map.values()]; // Map keeps insertion order
  }

  /**
   * Topmost displayed track containing a point. `toScreen` maps a frame-space box to the
   * coordinate space of the point (screen px); slop is in that space.
   */
  hitTest(
    x: number,
    y: number,
    toScreen: (b: Box) => Box,
    slop = 8,
  ): Displayed | null {
    const l = this.list();
    for (let i = l.length - 1; i >= 0; i--) {
      const d = l[i];
      if (d.lostAt !== null) continue;
      const [x1, y1, x2, y2] = toScreen(d.box);
      if (x >= x1 - slop && x <= x2 + slop && y >= y1 - slop && y <= y2 + slop)
        return d;
    }
    return null;
  }
}
