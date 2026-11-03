import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanSocket, type WsCtor, type WsLike } from "../api";
import type { FrameHeader } from "../types";

class FakeWs implements WsLike {
  static all: FakeWs[] = [];
  binaryType = "";
  readyState = 0;
  onopen: WsLike["onopen"] = null;
  onclose: WsLike["onclose"] = null;
  onerror: WsLike["onerror"] = null;
  onmessage: WsLike["onmessage"] = null;
  sent: unknown[] = [];
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeWs.all.push(this);
  }
  send(d: unknown) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  reply(m: object) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

const hdr = (n: number): FrameHeader => ({
  type: "frame",
  frame_id: n,
  w: 640,
  h: 360,
  ts: 0,
});
const blob = new Blob(["x"]);
const tracksMsg = (n: number) => ({
  type: "tracks",
  frame_id: n,
  proc_ms: 1,
  fps: 10,
  tracks: [],
});

let s: ScanSocket;
let ws: FakeWs;
beforeEach(() => {
  vi.useFakeTimers();
  FakeWs.all = [];
  s = new ScanSocket("ws://x/ws/scan", FakeWs as unknown as WsCtor);
  s.connect();
  ws = FakeWs.all[0];
  ws.open();
});
afterEach(() => vi.useRealTimers());

describe("ScanSocket", () => {
  it("refuses a second frame while one is in flight; frees on matching reply", () => {
    expect(s.sendFrame(hdr(0), blob)).toBe(true);
    expect(ws.sent).toHaveLength(2); // header + binary
    expect(s.sendFrame(hdr(1), blob)).toBe(false);
    ws.reply(tracksMsg(5)); // wrong frame id
    expect(s.sendFrame(hdr(1), blob)).toBe(false);
    vi.advanceTimersByTime(40);
    ws.reply(tracksMsg(0));
    expect(s.rttMs).toBe(40);
    expect(s.sendFrame(hdr(1), blob)).toBe(true);
  });

  it("frees after 1500 ms timeout", () => {
    s.sendFrame(hdr(0), blob);
    vi.advanceTimersByTime(1499);
    expect(s.sendFrame(hdr(1), blob)).toBe(false);
    vi.advanceTimersByTime(2);
    expect(s.sendFrame(hdr(1), blob)).toBe(true);
  });

  it("error for the in-flight frame frees it", () => {
    s.sendFrame(hdr(0), blob);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    ws.reply({ type: "error", frame_id: 0, message: "bad" });
    expect(s.sendFrame(hdr(1), blob)).toBe(true);
  });

  it("reconnects with backoff 0.5s, 1s, ... capped at 5s; resets on open", () => {
    const seen: string[] = [];
    s.onStatus = (x) => seen.push(x);
    ws.drop();
    expect(s.status).toBe("reconnecting");
    vi.advanceTimersByTime(499);
    expect(FakeWs.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWs.all).toHaveLength(2);
    FakeWs.all[1].drop();
    vi.advanceTimersByTime(999);
    expect(FakeWs.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWs.all).toHaveLength(3);
    let n = 3;
    for (const d of [2000, 4000, 5000, 5000]) {
      FakeWs.all[n - 1].drop();
      vi.advanceTimersByTime(d);
      expect(FakeWs.all).toHaveLength(++n);
    }
    FakeWs.all[n - 1].open();
    expect(s.status).toBe("open");
    FakeWs.all[n - 1].drop();
    vi.advanceTimersByTime(500);
    expect(FakeWs.all).toHaveLength(n + 1);
  });

  it("close() stops reconnecting", () => {
    s.close();
    expect(s.status).toBe("closed");
    vi.advanceTimersByTime(10000);
    expect(FakeWs.all).toHaveLength(1);
  });

  it("requestCrop resolves on matching crop, rejects after 5 s", async () => {
    const p = s.requestCrop(12);
    expect(JSON.parse(ws.sent[0] as string)).toEqual({
      type: "crop_request",
      track_id: 12,
    });
    ws.reply({ type: "crop", track_id: 12, crop_url: "/media/c.jpg" });
    await expect(p).resolves.toBe("/media/c.jpg");
    const q = s.requestCrop(13);
    const assertion = expect(q).rejects.toThrow("timeout");
    vi.advanceTimersByTime(5000);
    await assertion;
  });

  it("sendPin sends the pin message", () => {
    s.sendPin(7, "50580044902");
    expect(JSON.parse(ws.sent[0] as string)).toEqual({
      type: "pin",
      track_id: 7,
      product_id: "50580044902",
    });
  });
});
