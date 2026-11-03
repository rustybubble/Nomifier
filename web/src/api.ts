// The app's ONE network module (WebSocket + REST).
// PRIVACY: never put profile / persona / condition / medication data in any payload here.
import type {
  FrameHeader,
  PinMsg,
  CropRequestMsg,
  ServerMsg,
  TracksMsg,
} from "./types";

export function serverBase(): string {
  return (
    (import.meta.env.VITE_SERVER_URL as string | undefined) || location.origin
  );
}

export function wsUrl(): string {
  return serverBase().replace(/^http/, "ws").replace(/\/$/, "") + "/ws/scan";
}

// ---------------- /ws/scan ----------------
export type ScanStatus = "connecting" | "open" | "reconnecting" | "closed";

export const BACKOFF_MIN_MS = 500;
export const BACKOFF_MAX_MS = 5000;
export const INFLIGHT_TIMEOUT_MS = 1500;
export const CROP_TIMEOUT_MS = 5000;

/** The subset of WebSocket we use (lets tests inject a fake). */
export interface WsLike {
  binaryType: string;
  readyState: number;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send(data: string | Blob): void;
  close(): void;
}
export type WsCtor = new (url: string) => WsLike;

const WS_OPEN = 1;

export class ScanSocket {
  status: ScanStatus = "closed";
  /** Last round-trip (send -> tracks reply), ms. */
  rttMs = 0;
  lastTracks: TracksMsg | null = null;
  onTracks: ((m: TracksMsg, rttMs: number) => void) | null = null;
  onCrop: ((trackId: number, cropUrl: string) => void) | null = null;
  onStatus: ((s: ScanStatus) => void) | null = null;

  private ws: WsLike | null = null;
  private url: string;
  private Ctor: WsCtor;
  private wantOpen = false;
  private backoff = BACKOFF_MIN_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: {
    id: number;
    sentAt: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private crops = new Map<
    number,
    {
      resolve: (u: string) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }[]
  >();

  // ttsr-ignore: ts/no-double-assertion (DOM WebSocket handler types are narrower than WsLike on purpose)
  constructor(
    url: string = wsUrl(),
    Ctor: WsCtor = WebSocket as unknown as WsCtor,
  ) {
    this.url = url;
    this.Ctor = Ctor;
  }

  connect(): void {
    this.wantOpen = true;
    this.open(this.status === "reconnecting" ? "reconnecting" : "connecting");
  }

  close(): void {
    this.wantOpen = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearInflight();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
    }
    for (const id of [...this.crops.keys()])
      this.failCrops(id, new Error("socket closed"));
    this.setStatus("closed");
  }

  /** Returns false (and sends nothing) if a frame is in flight or the socket isn't open. */
  sendFrame(header: FrameHeader, blob: Blob): boolean {
    if (this.inflight || !this.ws || this.ws.readyState !== WS_OPEN)
      return false;
    this.ws.send(JSON.stringify(header));
    this.ws.send(blob);
    const id = header.frame_id;
    this.inflight = {
      id,
      sentAt: Date.now(),
      timer: setTimeout(() => this.clearInflight(), INFLIGHT_TIMEOUT_MS),
    };
    return true;
  }

  get frameInFlight(): boolean {
    return this.inflight !== null;
  }

  sendPin(trackId: number, productId: string): void {
    const m: PinMsg = { type: "pin", track_id: trackId, product_id: productId };
    this.sendJson(m);
  }

  requestCrop(trackId: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const list =
          this.crops.get(trackId)?.filter((w) => w.timer !== timer) ?? [];
        if (list.length) this.crops.set(trackId, list);
        else this.crops.delete(trackId);
        reject(new Error("crop timeout"));
      }, CROP_TIMEOUT_MS);
      const list = this.crops.get(trackId) ?? [];
      list.push({ resolve, reject, timer });
      this.crops.set(trackId, list);
      const m: CropRequestMsg = { type: "crop_request", track_id: trackId };
      if (!this.sendJson(m))
        this.failCrops(trackId, new Error("socket not open"));
    });
  }

  private sendJson(m: PinMsg | CropRequestMsg): boolean {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return false;
    this.ws.send(JSON.stringify(m));
    return true;
  }

  private failCrops(trackId: number, err: Error): void {
    for (const w of this.crops.get(trackId) ?? []) {
      clearTimeout(w.timer);
      w.reject(err);
    }
    this.crops.delete(trackId);
  }

  private open(status: ScanStatus): void {
    if (this.ws) return;
    this.setStatus(status);
    const ws = new this.Ctor(this.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = BACKOFF_MIN_MS;
      this.setStatus("open");
    };
    ws.onmessage = (ev) => this.handle(ev.data);
    ws.onerror = () => {}; // onclose follows
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearInflight();
      if (!this.wantOpen) return;
      this.setStatus("reconnecting");
      const delay = this.backoff;
      this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.wantOpen) this.open("reconnecting");
      }, delay);
    };
  }

  private handle(data: unknown): void {
    if (typeof data !== "string") return;
    let m: ServerMsg;
    try {
      m = JSON.parse(data) as ServerMsg;
    } catch {
      return;
    }
    if (m.type === "tracks") {
      let rtt = this.rttMs;
      if (this.inflight && this.inflight.id === m.frame_id) {
        rtt = this.rttMs = Date.now() - this.inflight.sentAt;
        this.clearInflight();
      }
      this.lastTracks = m;
      this.onTracks?.(m, rtt);
    } else if (m.type === "crop") {
      for (const w of this.crops.get(m.track_id) ?? []) {
        clearTimeout(w.timer);
        w.resolve(m.crop_url);
      }
      this.crops.delete(m.track_id);
      this.onCrop?.(m.track_id, m.crop_url);
    } else if (m.type === "error") {
      console.warn("[scan] server error", m.message);
      if (this.inflight && m.frame_id === this.inflight.id)
        this.clearInflight();
    }
  }

  private clearInflight(): void {
    if (this.inflight) clearTimeout(this.inflight.timer);
    this.inflight = null;
  }

  private setStatus(s: ScanStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.onStatus?.(s);
  }
}

// ---------------- REST (C9) ----------------
// (nothing yet: /api/find, /api/unknown, polling /api/finds/{id}, /api/unknowns/{id} land with C9)
