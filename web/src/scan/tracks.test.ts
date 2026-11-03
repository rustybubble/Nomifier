import { describe, expect, it } from "vitest";
import type { Track } from "../types";
import { DisplayedTracks } from "./tracks";

const T = (id: number, box: [number, number, number, number]): Track => ({
  id,
  box,
  status: "named",
  product_id: null,
  family: null,
  similarity: 0.9,
  age: 1,
});
const id = (b: number[]) =>
  [b[0], b[1], b[2], b[3]] as [number, number, number, number];

describe("DisplayedTracks", () => {
  it("new tracks appear at target and fade in over 150 ms", () => {
    const s = new DisplayedTracks();
    s.update([T(1, [10, 10, 50, 50])], 0);
    s.step(0, 16);
    expect(s.list()[0].box).toEqual([10, 10, 50, 50]);
    expect(s.list()[0].opacity).toBe(0);
    s.step(75, 16);
    expect(s.list()[0].opacity).toBeCloseTo(0.5);
    s.step(150, 16);
    expect(s.list()[0].opacity).toBe(1);
  });

  it("eases 35% per 60fps frame and converges, frame-rate independent", () => {
    const a = new DisplayedTracks();
    a.update([T(1, [0, 0, 100, 100])], 0);
    a.update([T(1, [100, 0, 200, 100])], 1);
    a.step(1, 1000 / 60);
    expect(a.list()[0].box[0]).toBeCloseTo(35);
    // two half-length steps == one full step
    const b = new DisplayedTracks();
    b.update([T(1, [0, 0, 100, 100])], 0);
    b.update([T(1, [100, 0, 200, 100])], 1);
    b.step(1, 1000 / 120);
    b.step(2, 1000 / 120);
    expect(b.list()[0].box[0]).toBeCloseTo(35);
    for (let i = 0; i < 40; i++) a.step(2 + i, 1000 / 60);
    expect(a.list()[0].box[0]).toBeCloseTo(100, 3);
  });

  it("missing tracks fade out over 400 ms then are removed", () => {
    const s = new DisplayedTracks();
    s.update([T(1, [0, 0, 10, 10])], 0);
    s.step(200, 16); // fully visible
    s.update([], 200);
    s.step(400, 16);
    expect(s.list()[0].opacity).toBeCloseTo(0.5);
    expect(s.list()[0].track.id).toBe(1); // last known data kept
    s.step(600, 16);
    expect(s.list()).toHaveLength(0);
  });

  it("track reappearing cancels fade-out", () => {
    const s = new DisplayedTracks();
    s.update([T(1, [0, 0, 10, 10])], 0);
    s.step(200, 16);
    s.update([], 200);
    s.step(300, 16);
    s.update([T(1, [0, 0, 10, 10])], 300);
    s.step(700, 16);
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0].opacity).toBe(1);
  });

  it("hit test returns topmost with slop", () => {
    const s = new DisplayedTracks();
    s.update([T(1, [0, 0, 100, 100]), T(2, [50, 50, 150, 150])], 0);
    expect(s.hitTest(75, 75, id)?.id).toBe(2);
    expect(s.hitTest(25, 25, id)?.id).toBe(1);
    expect(s.hitTest(105, 20, id)?.id).toBe(1); // within 8px slop
    expect(s.hitTest(120, 20, id)).toBeNull();
  });
});
