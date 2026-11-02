export const FACING = Object.freeze({ USER: "user", ENVIRONMENT: "environment" });
export const CAMERA_ERROR = Object.freeze({
  DENIED: "camera-denied",
  NOT_FOUND: "camera-not-found",
  BUSY: "camera-busy",
  INSECURE: "insecure-context",
  UNSUPPORTED: "camera-unsupported",
  UNKNOWN: "camera-error",
});

const CAMERA_DEFAULTS = Object.freeze({ width: 640, height: 480, frameRate: 30 });

export class CameraError extends Error {
  constructor(code, cause) {
    super(code);
    this.code = code;
    this.cause = cause;
  }
}

function mapError(e) {
  const n = e && e.name;
  if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") return CAMERA_ERROR.DENIED;
  if (n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError") return CAMERA_ERROR.NOT_FOUND;
  if (n === "NotReadableError" || n === "AbortError" || n === "TrackStartError") return CAMERA_ERROR.BUSY;
  return CAMERA_ERROR.UNKNOWN;
}

export async function openCamera(video, options) {
  const o = Object.assign({}, CAMERA_DEFAULTS, options);
  if (typeof window !== "undefined" && window.isSecureContext === false) throw new CameraError(CAMERA_ERROR.INSECURE);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new CameraError(CAMERA_ERROR.UNSUPPORTED);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: o.facingMode || FACING.USER, width: { ideal: o.width }, height: { ideal: o.height }, frameRate: { ideal: o.frameRate } },
    });
  } catch (e) {
    throw new CameraError(mapError(e), e);
  }
  video.setAttribute("playsinline", "");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
  try { await video.play(); } catch (e) { stream.getTracks().forEach((t) => t.stop()); throw new CameraError(CAMERA_ERROR.UNKNOWN, e); }
  return stream;
}

export function closeCamera(video, stream) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (video && video.srcObject === stream) video.srcObject = null;
}
