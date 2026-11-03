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
const FACING_FIT = Object.freeze({ EXACT: "exact", IDEAL: "ideal" });
const VIDEO_INPUT = "videoinput";
const FRONT_LABEL = /front|user|face|selfie|frontal/i;
const BACK_LABEL = /back|rear|environment|trasera|posterior|world/i;
const EXTRA_LENS = /ultra|tele|depth|wide|angular/i;

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

function denied(e) {
  const n = e && e.name;
  return n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError";
}

function stopTracks(stream) {
  if (stream && stream.getTracks) stream.getTracks().forEach((track) => track.stop());
}

function sizeConstraints(o) {
  return {
    width: { ideal: o.width },
    height: { ideal: o.height },
    frameRate: { ideal: o.frameRate },
  };
}

function trackFacing(stream) {
  const tracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
  const track = tracks[0];
  if (!track || !track.getSettings) return "";
  const settings = track.getSettings();
  return settings && settings.facingMode ? settings.facingMode : "";
}

function scoreDevice(device, facing) {
  const label = device.label || "";
  if (!label) return 0;
  const wantBack = facing === FACING.ENVIRONMENT;
  let score = 0;
  if (wantBack && BACK_LABEL.test(label)) score += 4;
  if (!wantBack && FRONT_LABEL.test(label)) score += 4;
  if (EXTRA_LENS.test(label)) score -= 1;
  return score;
}

async function deviceIdFor(facing, currentDeviceId) {
  let listed = [];
  try {
    listed = await navigator.mediaDevices.enumerateDevices();
  } catch (e) {
    return "";
  }
  const videos = listed.filter((d) => d.kind === VIDEO_INPUT && d.deviceId);
  if (!videos.length) return "";
  const ranked = videos.map((d) => ({ d, score: scoreDevice(d, facing) }));
  ranked.sort((a, b) => b.score - a.score);
  if (ranked[0].score > 0) return ranked[0].d.deviceId;
  const pool = currentDeviceId ? videos.filter((d) => d.deviceId !== currentDeviceId) : videos;
  const choices = pool.length ? pool : videos;
  const unlabeled = !videos.some((d) => d.label);
  if (unlabeled && choices.length > 1 && facing === FACING.ENVIRONMENT) return choices[choices.length - 1].deviceId;
  return choices[0].deviceId;
}

async function requestVideo(constraints) {
  return navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
}

async function acquireStream(o) {
  const facing = o.facingMode || FACING.USER;
  const size = sizeConstraints(o);
  const attempts = [
    Object.assign({}, size, { facingMode: { [FACING_FIT.EXACT]: facing } }),
    Object.assign({}, size, { facingMode: { [FACING_FIT.IDEAL]: facing } }),
  ];
  let lastError = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const stream = await requestVideo(attempts[i]);
      const got = trackFacing(stream);
      if (got && got !== facing) {
        stopTracks(stream);
        lastError = new Error("facing-mismatch");
        continue;
      }
      return stream;
    } catch (e) {
      if (denied(e)) throw new CameraError(CAMERA_ERROR.DENIED, e);
      lastError = e;
    }
  }
  const deviceId = await deviceIdFor(facing, o.currentDeviceId || "");
  if (deviceId) {
    try {
      return await requestVideo(Object.assign({}, size, { deviceId: { exact: deviceId } }));
    } catch (e) {
      if (denied(e)) throw new CameraError(CAMERA_ERROR.DENIED, e);
      lastError = e;
    }
  }
  throw new CameraError(mapError(lastError), lastError);
}

export async function openCamera(video, options) {
  const o = Object.assign({}, CAMERA_DEFAULTS, options);
  if (typeof window !== "undefined" && window.isSecureContext === false) throw new CameraError(CAMERA_ERROR.INSECURE);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new CameraError(CAMERA_ERROR.UNSUPPORTED);
  const stream = await acquireStream(o);
  video.setAttribute("playsinline", "");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
  try { await video.play(); } catch (e) { stopTracks(stream); throw new CameraError(CAMERA_ERROR.UNKNOWN, e); }
  return stream;
}

export function closeCamera(video, stream) {
  stopTracks(stream);
  if (video && video.srcObject === stream) video.srcObject = null;
}
