// Camera access. startCamera must be called from a user gesture (iOS).

export type CameraFailure =
  "denied" | "notfound" | "insecure" | "unsupported" | "other";

export class CameraError extends Error {
  kind: CameraFailure;
  constructor(kind: CameraFailure, message: string) {
    super(message);
    this.kind = kind;
  }
}

export async function startCamera(
  video: HTMLVideoElement,
): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new CameraError(
      "insecure",
      "The camera only works on a secure (https) page. Open the https://...ts.net address instead of the plain IP.",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      "unsupported",
      "This browser can't access the camera.",
    );
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError")
      throw new CameraError(
        "denied",
        "Camera permission was denied. Allow camera access for this site in Settings, then reload.",
      );
    if (name === "NotFoundError" || name === "OverconstrainedError")
      throw new CameraError("notfound", "No camera was found on this device.");
    throw new CameraError(
      "other",
      `Couldn't start the camera (${name ?? "unknown error"}).`,
    );
  }
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    /* autoplay attributes usually start it; ignore */
  }
  return stream;
}

export function stopCamera(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
): void {
  stream?.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}
