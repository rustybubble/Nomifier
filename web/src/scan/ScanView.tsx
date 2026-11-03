import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "../types";
import { ScanSocket, type ScanStatus } from "../api";
import { CameraError, startCamera, stopCamera } from "./camera";
import { boxToScreen, coverMapping, encodeSize, type Mapping } from "./coords";
import {
  defaultStyleFor,
  draw,
  type ScreenTrack,
  type TrackStyle,
} from "./overlay";
import { DisplayedTracks } from "./tracks";

export type { TrackStyle } from "./overlay";

export interface ScanViewProps {
  styleFor?: (t: Track) => TrackStyle;
  onTapTrack?: (t: Track, still: HTMLCanvasElement | null) => void;
  paused?: boolean;
  drawExtras?: (
    ctx: CanvasRenderingContext2D,
    displayed: ReadonlyArray<ScreenTrack>,
  ) => void;
  onTracks?: (tracks: Track[]) => void;
  showHud?: boolean;
  socketRef?: React.MutableRefObject<ScanSocket | null>;
  /** The live <video> element (null before the camera starts / after unmount). Barcode lock reads it. */
  onVideo?: (video: HTMLVideoElement | null) => void;
  /** Long-press (500 ms) on a box: CV HUD details. */
  onLongPressTrack?: (t: Track) => void;
}

type Phase = "idle" | "starting" | "live" | "error";
interface Hud {
  fps: number;
  rtt: number;
  proc: number;
  n: number;
}

const fill: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};
const pillStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(var(--sat, env(safe-area-inset-top)) + 8px)",
  left: "50%",
  transform: "translateX(-50%)",
  padding: "6px 14px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.65)",
  color: "#fff",
  font: "600 13px -apple-system, system-ui, sans-serif",
  pointerEvents: "none",
};

export default function ScanView(props: ScanViewProps) {
  const { paused = false, showHud = false, socketRef } = props;
  const propsRef = useRef(props);
  propsRef.current = props; // loops read the latest callbacks without restarting

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sockRef = useRef<ScanSocket | null>(null);
  const store = useRef(new DisplayedTracks());
  const mappingRef = useRef<Mapping | null>(null);
  const frameSize = useRef({ w: 640, h: 480 });

  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<CameraError | null>(null);
  const [status, setStatus] = useState<ScanStatus>("connecting");
  const [hud, setHud] = useState<Hud>({ fps: 0, rtt: 0, proc: 0, n: 0 });

  // Socket lifecycle.
  useEffect(() => {
    const s = new ScanSocket();
    sockRef.current = s;
    if (socketRef) socketRef.current = s;
    s.onStatus = setStatus;
    s.onTracks = (m, rtt) => {
      store.current.update(m.tracks, performance.now());
      propsRef.current.onTracks?.(m.tracks);
      setHud({ fps: m.fps, rtt, proc: m.proc_ms, n: m.tracks.length });
    };
    s.connect();
    return () => {
      s.close();
      sockRef.current = null;
      if (socketRef) socketRef.current = null;
    };
  }, [socketRef]);

  // Camera cleanup on unmount.
  useEffect(
    () => () => {
      stopCamera(videoRef.current, streamRef.current);
      streamRef.current = null;
      propsRef.current.onVideo?.(null);
    },
    [],
  );

  // Freeze / unfreeze the picture with `paused`.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || phase !== "live") return;
    if (paused) v.pause();
    else void v.play().catch(() => {});
  }, [paused, phase]);

  // Streaming + render loop.
  useEffect(() => {
    if (phase !== "live") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const off = document.createElement("canvas");
    const offCtx = off.getContext("2d");
    let raf = 0;
    let last = performance.now();
    let frameId = 0;
    let encoding = false;

    const grab = () => {
      const sock = sockRef.current;
      if (
        !sock ||
        !offCtx ||
        encoding ||
        sock.frameInFlight ||
        sock.status !== "open"
      )
        return;
      if (propsRef.current.paused || document.hidden || video.videoWidth === 0)
        return;
      const { w, h } = encodeSize(video.videoWidth, video.videoHeight);
      if (off.width !== w || off.height !== h) {
        off.width = w;
        off.height = h;
      }
      offCtx.drawImage(video, 0, 0, w, h);
      frameSize.current = { w, h };
      encoding = true;
      off.toBlob(
        (blob) => {
          encoding = false;
          if (!blob) return;
          sockRef.current?.sendFrame(
            { type: "frame", frame_id: frameId++, w, h, ts: Date.now() },
            blob,
          );
        },
        "image/jpeg",
        0.7,
      );
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(now - last, 100);
      last = now;
      const cssW = video.clientWidth;
      const cssH = video.clientHeight;
      if (!cssW || !cssH || !video.videoWidth) return;
      const dpr = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(cssW * dpr) ||
        canvas.height !== Math.round(cssH * dpr)
      ) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      grab();
      if (propsRef.current.paused) return; // overlay frozen
      store.current.step(now, dt);
      const m = coverMapping(
        { w: video.videoWidth, h: video.videoHeight },
        { w: cssW, h: cssH },
        frameSize.current,
      );
      mappingRef.current = m;
      draw(
        ctx,
        store.current.list(),
        propsRef.current.styleFor ?? defaultStyleFor,
        m,
        propsRef.current.drawExtras,
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setPhase("starting");
    try {
      streamRef.current = await startCamera(video);
      setPhase("live");
      propsRef.current.onVideo?.(video);
    } catch (e) {
      setErr(
        e instanceof CameraError
          ? e
          : new CameraError("other", "Couldn't start the camera."),
      );
      setPhase("error");
    }
  }, []);

  const hitAt = (clientX: number, clientY: number) => {
    const m = mappingRef.current;
    const root = rootRef.current;
    if (!m || !root) return null;
    const r = root.getBoundingClientRect();
    return store.current.hitTest(clientX - r.left, clientY - r.top, (b) =>
      boxToScreen(m, b),
    );
  };

  // Long-press: 500 ms without moving more than 10 px. Suppresses the click that follows.
  const press = useRef<{
    x: number;
    y: number;
    timer: number;
    fired: boolean;
  } | null>(null);
  const onPointerDown = (ev: React.PointerEvent) => {
    if (!propsRef.current.onLongPressTrack) return;
    const { clientX: x, clientY: y } = ev;
    const timer = window.setTimeout(() => {
      const hit = hitAt(x, y);
      if (hit && press.current) {
        press.current.fired = true;
        propsRef.current.onLongPressTrack?.(hit.track);
      }
    }, 500);
    press.current = { x, y, timer, fired: false };
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 10)
      window.clearTimeout(p.timer);
  };
  const onPointerUp = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };

  const onTap = (ev: React.MouseEvent) => {
    if (press.current?.fired) {
      press.current = null;
      return;
    }
    const video = videoRef.current;
    const m = mappingRef.current;
    const root = rootRef.current;
    if (!video || !m || !root || !propsRef.current.onTapTrack) return;
    const r = root.getBoundingClientRect();
    const hit = store.current.hitTest(
      ev.clientX - r.left,
      ev.clientY - r.top,
      (b) => boxToScreen(m, b),
    );
    if (!hit) return;
    let still: HTMLCanvasElement | null = null;
    if (video.videoWidth) {
      still = document.createElement("canvas");
      still.width = video.clientWidth;
      still.height = video.clientHeight;
      const s = Math.max(
        video.clientWidth / video.videoWidth,
        video.clientHeight / video.videoHeight,
      );
      const sw = video.clientWidth / s;
      const sh = video.clientHeight / s;
      still
        .getContext("2d")
        ?.drawImage(
          video,
          (video.videoWidth - sw) / 2,
          (video.videoHeight - sh) / 2,
          sw,
          sh,
          0,
          0,
          still.width,
          still.height,
        );
    }
    propsRef.current.onTapTrack(hit.track, still);
  };

  const centered: React.CSSProperties = {
    ...fill,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
    textAlign: "center",
    color: "#fff",
    background: "#111",
    font: "16px -apple-system, system-ui, sans-serif",
  };

  return (
    <div
      ref={rootRef}
      onClick={onTap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ ...fill, objectFit: "cover" }}
      />
      <canvas ref={canvasRef} style={{ ...fill, pointerEvents: "none" }} />

      {phase !== "live" && (
        <div style={centered}>
          {phase === "error" && err ? (
            <>
              <h2 style={{ margin: 0 }}>
                {err.kind === "insecure"
                  ? "Secure page needed"
                  : err.kind === "denied"
                    ? "Camera access blocked"
                    : "Camera unavailable"}
              </h2>
              <p style={{ maxWidth: 320, margin: 0, opacity: 0.85 }}>
                {err.message}
              </p>
              <button onClick={start} style={btn}>
                Try again
              </button>
            </>
          ) : (
            <>
              <h2 style={{ margin: 0 }}>Scan your shelf</h2>
              <p style={{ maxWidth: 320, margin: 0, opacity: 0.85 }}>
                Nomifier needs your camera to recognize medicine boxes and rate
                them for you. Video stays between your phone and your own
                laptop.
              </p>
              <button
                onClick={start}
                disabled={phase === "starting"}
                style={btn}
              >
                {phase === "starting" ? "Starting…" : "Tap to start camera"}
              </button>
            </>
          )}
        </div>
      )}

      {phase === "live" && status !== "open" && (
        <div style={pillStyle}>
          {status === "connecting"
            ? "Connecting…"
            : status === "reconnecting"
              ? "Reconnecting…"
              : "Offline"}
        </div>
      )}
      {phase === "live" && showHud && (
        <div
          style={{
            ...pillStyle,
            top: "calc(var(--sat, env(safe-area-inset-top)) + 44px)",
            fontWeight: 400,
            fontSize: 11,
            whiteSpace: "nowrap",
          }}
        >
          {hud.fps.toFixed(1)} fps · rtt {Math.round(hud.rtt)} ms · proc{" "}
          {Math.round(hud.proc)} ms · {hud.n} tracks
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "18px 32px",
  fontSize: 20,
  fontWeight: 700,
  borderRadius: 16,
  border: "none",
  background: "#16A34A",
  color: "#fff",
};
