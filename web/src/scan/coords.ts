// Pure frame <-> screen mapping for a <video> shown with object-fit: cover.
// "frame" = the 640px-wide encode sent to the server; "screen" = CSS px inside the video element.

export type Box = [number, number, number, number];

export interface Mapping {
  scale: number; // frame px -> CSS px
  ox: number; // screen x of frame x = 0 (<= 0 when cropped)
  oy: number;
}

export const ENCODE_WIDTH = 640;

/** Size of the encode for a video of the given intrinsic size. */
export function encodeSize(
  videoW: number,
  videoH: number,
  width = ENCODE_WIDTH,
): { w: number; h: number } {
  return { w: width, h: Math.max(1, Math.round((width * videoH) / videoW)) };
}

/**
 * Mapping for object-fit: cover. The video (vw x vh) is scaled uniformly to fill the element
 * (ew x eh) and centered; the frame is a uniformly downscaled copy of the whole video.
 */
export function coverMapping(
  video: { w: number; h: number },
  el: { w: number; h: number },
  frame: { w: number; h: number },
): Mapping {
  const s = Math.max(el.w / video.w, el.h / video.h); // video px -> CSS px
  const scale = (s * video.w) / frame.w;
  return {
    scale,
    ox: (el.w - video.w * s) / 2,
    oy: (el.h - video.h * s) / 2,
  };
}

export function frameToScreen(
  m: Mapping,
  x: number,
  y: number,
): [number, number] {
  return [x * m.scale + m.ox, y * m.scale + m.oy];
}

export function screenToFrame(
  m: Mapping,
  x: number,
  y: number,
): [number, number] {
  return [(x - m.ox) / m.scale, (y - m.oy) / m.scale];
}

export function boxToScreen(m: Mapping, b: Box): Box {
  const [x1, y1] = frameToScreen(m, b[0], b[1]);
  const [x2, y2] = frameToScreen(m, b[2], b[3]);
  return [x1, y1, x2, y2];
}
