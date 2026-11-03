import { describe, expect, it } from "vitest";
import {
  boxToScreen,
  coverMapping,
  encodeSize,
  frameToScreen,
  screenToFrame,
} from "./coords";

describe("coords", () => {
  it("encodeSize keeps aspect at 640 wide", () => {
    expect(encodeSize(1920, 1080)).toEqual({ w: 640, h: 360 });
    expect(encodeSize(1080, 1920)).toEqual({ w: 640, h: 1138 });
  });

  it("landscape video in portrait element: crops left/right", () => {
    const f = encodeSize(1920, 1080); // 640x360
    const m = coverMapping({ w: 1920, h: 1080 }, { w: 400, h: 800 }, f);
    expect(m.scale).toBeCloseTo(800 / 360); // height-limited
    expect(m.oy).toBeCloseTo(0);
    expect(m.ox).toBeCloseTo((400 - 640 * m.scale) / 2); // negative
    expect(m.ox).toBeLessThan(0);
    // frame center is the element center
    const [cx, cy] = frameToScreen(m, 320, 180);
    expect(cx).toBeCloseTo(200);
    expect(cy).toBeCloseTo(400);
  });

  it("portrait video in landscape element: crops top/bottom", () => {
    const f = encodeSize(1080, 1920);
    const m = coverMapping({ w: 1080, h: 1920 }, { w: 800, h: 400 }, f);
    expect(m.scale).toBeCloseTo(800 / 640); // width-limited
    expect(m.ox).toBeCloseTo(0);
    expect(m.oy).toBeLessThan(0);
    const [cx, cy] = frameToScreen(m, f.w / 2, f.h / 2);
    expect(cx).toBeCloseTo(400);
    expect(cy).toBeCloseTo(200, 0); // encode height is rounded to an integer
    // frame y at the top screen edge is inside the frame (cropped part is outside)
    const [, fy] = screenToFrame(m, 0, 0);
    expect(fy).toBeGreaterThan(0);
  });

  it("round-trips", () => {
    const m = coverMapping(
      { w: 1920, h: 1080 },
      { w: 390, h: 844 },
      { w: 640, h: 360 },
    );
    for (const [x, y] of [
      [0, 0],
      [100, 50],
      [640, 360],
    ]) {
      const [sx, sy] = frameToScreen(m, x, y);
      const [fx, fy] = screenToFrame(m, sx, sy);
      expect(fx).toBeCloseTo(x);
      expect(fy).toBeCloseTo(y);
    }
    expect(boxToScreen(m, [0, 0, 10, 10])[2]).toBeCloseTo(m.ox + 10 * m.scale);
  });
});
