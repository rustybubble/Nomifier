import { useState } from "react";

const KEY = "nomifier.a2hs.dismissed";

function shouldShow(): boolean {
  try {
    if (localStorage.getItem(KEY)) return false;
  } catch {
    /* storage blocked: still show */
  }
  const ua = navigator.userAgent;
  const iOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return iOS && safari && !standalone;
}

const ShareIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label="Share"
  >
    <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

export default function AddToHomeScreenHint() {
  const [show, setShow] = useState(shouldShow);
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return (
    <div
      className="banner a2hs chrome"
      role="region"
      aria-label="Install Nomifier"
    >
      <h3>Install Nomifier</h3>
      <ol>
        <li>
          Tap <ShareIcon /> Share in Safari
        </li>
        <li>Choose Add to Home Screen</li>
        <li>Open Nomifier from your home screen</li>
      </ol>
      <button className="btn-plain" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
