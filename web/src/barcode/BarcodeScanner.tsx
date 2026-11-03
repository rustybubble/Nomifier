import { useEffect, useRef, useState } from "react";
import type { AppData, Product } from "../types";
import { CameraError, startCamera, stopCamera } from "../scan/camera";
import { decode, grabFrame } from "./decode";
import { resolveBarcode } from "./resolve";
import "./barcode.css";

interface Props {
  open: boolean;
  onClose: () => void;
  data: AppData | null;
  onProduct: (p: Product) => void;
}

const SCAN_INTERVAL_MS = 300;

/** Full-screen manual barcode scan with its own camera. Works with no recognition server. */
export default function BarcodeScanner({ open, onClose, data, onProduct }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cb = useRef({ data, onProduct });
  cb.current = { data, onProduct };

  const stop = () => {
    stopCamera(videoRef.current, streamRef.current);
    streamRef.current = null;
    setLive(false);
  };

  // Release the camera whenever the scanner closes or unmounts.
  useEffect(() => {
    if (!open) return;
    setMsg(null);
    return stop;
  }, [open]);

  const start = async () => {
    const v = videoRef.current;
    if (!v) return;
    setMsg(null);
    try {
      streamRef.current = await startCamera(v);
      setLive(true);
    } catch (e) {
      setMsg(e instanceof CameraError ? e.message : "Couldn't start the camera.");
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!open || !live || !v) return;
    const canvas = document.createElement("canvas");
    let stopped = false;
    const id = window.setInterval(async () => {
      const d = cb.current.data;
      if (!d || v.paused || v.readyState < 2) return;
      const img = grabFrame(v, canvas);
      if (!img) return;
      let hits;
      try {
        hits = await decode(img);
      } catch {
        return;
      }
      if (stopped || !hits?.length) return;
      for (const h of hits) {
        const r = resolveBarcode(h.text, d.productsByNdc);
        if ("product" in r) {
          setMsg(null);
          cb.current.onProduct(r.product);
          return;
        }
        if (r.status === "not_in_catalog") setMsg(`Not in our catalog yet (${h.text})`);
        else if (r.status === "not_ndc") setMsg("That barcode isn't a medicine.");
        else setMsg("Couldn't read that barcode clearly. Hold steady.");
      }
    }, SCAN_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [open, live]);

  if (!open) return null;
  return (
    <div className="bc-scanner" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <video ref={videoRef} className="bc-video" playsInline muted autoPlay />
      <button className="bc-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      {live && <div className="bc-aim" aria-hidden="true" />}
      <div className="bc-bottom">
        {!live && (
          <button className="btn-tint" onClick={() => void start()}>
            Tap to start the camera
          </button>
        )}
        <p className="bc-msg" role="status" aria-live="polite">
          {msg ?? (live ? "Line up the barcode inside the box" : "Scan a barcode")}
        </p>
      </div>
    </div>
  );
}
