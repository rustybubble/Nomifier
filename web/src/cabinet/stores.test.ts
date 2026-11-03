import { afterEach, beforeEach, expect, test, vi } from "vitest";

function fakeLS(throwing = false, seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => {
      if (throwing) throw new Error("denied");
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throwing) throw new Error("denied");
      m.set(k, v);
    },
    m,
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

test("cabinet persists and dedupes; survives restart", async () => {
  const ls = fakeLS();
  vi.stubGlobal("localStorage", ls);
  let c = await import("./store");
  c.addToCabinet("1");
  c.addToCabinet("1");
  c.addToCabinet("2");
  c.removeFromCabinet("2");
  expect(JSON.parse(ls.m.get("nomifier.cabinet.v1")!)).toHaveLength(1);
  vi.resetModules();
  c = await import("./store");
  const prods = c.cabinetProducts(
    [
      { ndc11: "1", added: "x" },
      { ndc11: "zz", added: "x" },
    ],
    { productsByNdc: new Map([["1", { ndc11: "1" } as never]]) },
  );
  expect(prods).toHaveLength(1);
});

test("storage throwing falls back to memory", async () => {
  vi.stubGlobal("localStorage", fakeLS(true));
  const c = await import("./store");
  c.addToCabinet("1");
  const s = await import("../settings/store");
  s.setSetting("largeText", true);
  expect(s.DEFAULT_SETTINGS).toEqual({
    largeText: false,
    showHud: false,
    sound: true,
  });
});

test("history dedupes within 60s and caps at 50", async () => {
  const ls = fakeLS();
  vi.stubGlobal("localStorage", ls);
  const h = await import("../history/store");
  const t0 = new Date("2026-01-01T00:00:00Z");
  const e = {
    ndc11: "1",
    score: 80,
    tier: "green" as const,
    profileName: "Me",
  };
  h.recordView(e, t0);
  h.recordView(e, new Date(t0.getTime() + 30_000));
  expect(JSON.parse(ls.m.get("nomifier.history.v1")!)).toHaveLength(1);
  h.recordView(e, new Date(t0.getTime() + 61_000));
  expect(JSON.parse(ls.m.get("nomifier.history.v1")!)).toHaveLength(2);
  for (let i = 0; i < 60; i++)
    h.recordView({ ...e, ndc11: `n${i}` }, new Date(t0.getTime() + 1e6 + i));
  expect(JSON.parse(ls.m.get("nomifier.history.v1")!)).toHaveLength(50);
  expect(
    h.relativeTime(t0.toISOString(), new Date(t0.getTime() + 300_000)),
  ).toBe("5 min ago");
});

test("dimensionName and compareRows", async () => {
  const { dimensionName, compareRows } = await import("../compare/compare");
  expect(dimensionName("gi_bleeding")).toBe("Stomach bleeding");
  expect(dimensionName("foo_bar")).toBe("Foo Bar");
  const sc = (pts: Record<string, number>) =>
    ({
      status: "scored",
      score: 50,
      tier: "yellow",
      hard_stops_triggered: [],
      explanation: [],
      contributions: Object.entries(pts).map(([dimension, points]) => ({
        dimension,
        points,
      })),
    }) as never;
  const rows = compareRows(sc({ liver: 10, kidney: 20 }), sc({ liver: 30 }));
  expect(rows.map((r) => [r.dimension, r.a, r.b, r.worse])).toEqual([
    ["liver", 10, 30, "b"],
    ["kidney", 20, 0, "a"],
  ]);
});
