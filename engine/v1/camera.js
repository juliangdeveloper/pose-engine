export const FACING = Object.freeze({ USER: "user", ENVIRONMENT: "environment" });
export const LENS = Object.freeze({ WIDE: "wide", NORMAL: "normal" });
export const CAMERA_RELEASE_MS = 250;
export const CAMERA_ERROR = Object.freeze({
  DENIED: "camera-denied",
  NOT_FOUND: "camera-not-found",
  BUSY: "camera-busy",
  INSECURE: "insecure-context",
  UNSUPPORTED: "camera-unsupported",
  UNKNOWN: "camera-error",
});

const FRAME_RATE = 30;
const SENSOR_LONG_EDGE = 1440;
const ASPECT_TALL = 3 / 4;
const ASPECT_WIDE = 4 / 3;
const RESIZE_NONE = "none";
const ZOOM_ONE = 1;
const FACING_FIT = Object.freeze({ EXACT: "exact", IDEAL: "ideal" });
const VIDEO_INPUT = "videoinput";
const FRONT_LABEL = /front|user|face|selfie|frontal/i;
const BACK_LABEL = /back|rear|environment|trasera|posterior|world/i;
const EXTRA_LENS = /ultra|tele|depth|wide|angular/i;
const ULTRA_LABEL = /ultra[\s-]*wide|ultra gran angular|\bultra\b/i;
const EMPTY_CAPABILITIES = Object.freeze({ zoom: null, ultraWide: false, canWiden: false });

export class CameraError extends Error {
  constructor(code, cause) {
    super(code);
    this.code = code;
    this.cause = cause;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function videoTrack(stream) {
  const tracks = stream && stream.getVideoTracks ? stream.getVideoTracks() : [];
  return tracks[0] || null;
}

function isPortrait(o) {
  if (o && typeof o.portrait === "boolean") return o.portrait;
  if (typeof window !== "undefined" && window.innerWidth && window.innerHeight) return window.innerHeight >= window.innerWidth;
  return true;
}

function frameConstraints(o) {
  const portrait = isPortrait(o);
  const shortEdge = Math.round(SENSOR_LONG_EDGE * ASPECT_TALL);
  const aspect = portrait ? ASPECT_TALL : ASPECT_WIDE;
  return {
    width: { ideal: portrait ? shortEdge : SENSOR_LONG_EDGE },
    height: { ideal: portrait ? SENSOR_LONG_EDGE : shortEdge },
    aspectRatio: { ideal: aspect },
    resizeMode: RESIZE_NONE,
    frameRate: { ideal: o.frameRate || FRAME_RATE },
  };
}

function trackFacing(stream) {
  const track = videoTrack(stream);
  if (!track || !track.getSettings) return "";
  const settings = track.getSettings();
  return settings && settings.facingMode ? settings.facingMode : "";
}

function deviceIdOf(track) {
  if (!track || !track.getSettings) return "";
  const settings = track.getSettings();
  return settings && settings.deviceId ? settings.deviceId : "";
}

function zoomRange(track) {
  if (!track || !track.getCapabilities) return null;
  const caps = track.getCapabilities();
  const zoom = caps && caps.zoom;
  if (!zoom || typeof zoom.min !== "number") return null;
  return {
    min: zoom.min,
    max: typeof zoom.max === "number" ? zoom.max : zoom.min,
    step: typeof zoom.step === "number" ? zoom.step : 0,
  };
}

function zoomValue(track) {
  if (!track || !track.getSettings) return null;
  const settings = track.getSettings();
  return settings && typeof settings.zoom === "number" ? settings.zoom : null;
}

function zoomCanWiden(range) {
  return !!(range && range.min < ZOOM_ONE && range.min < range.max);
}

function shouldApplyMinZoom(range, facing) {
  if (!range || !(range.min < range.max)) return false;
  if (range.min < ZOOM_ONE) return true;
  return facing === FACING.USER;
}

async function applyZoomValue(track, value) {
  if (!track || !track.applyConstraints || typeof value !== "number") return false;
  try {
    await track.applyConstraints({ advanced: [{ zoom: value }] });
    return true;
  } catch (e) {
    return false;
  }
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

async function listedVideos() {
  try {
    const listed = await navigator.mediaDevices.enumerateDevices();
    return listed.filter((d) => d.kind === VIDEO_INPUT && d.deviceId);
  } catch (e) {
    return [];
  }
}

async function deviceIdFor(facing, currentDeviceId) {
  const videos = await listedVideos();
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

async function findUltraWideId() {
  const videos = await listedVideos();
  const match = videos.find((d) => ULTRA_LABEL.test(d.label || ""));
  return match ? match.deviceId : "";
}

async function requestVideo(constraints) {
  return navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
}

async function acquireStream(o) {
  const facing = o.facingMode || FACING.USER;
  const size = frameConstraints(o);
  if (o.deviceId) {
    return requestVideo(Object.assign({}, size, { deviceId: { exact: o.deviceId } }));
  }
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

async function replaceStream(video, stream, constraints) {
  if (video && video.pause) video.pause();
  stopTracks(stream);
  if (video && video.srcObject === stream) video.srcObject = null;
  await wait(CAMERA_RELEASE_MS);
  return requestVideo(constraints);
}

async function withLens(video, stream, o, allowSwap) {
  const wantWide = o.lens === LENS.WIDE;
  const facing = o.facingMode || FACING.USER;
  const track = videoTrack(stream);
  const range = zoomRange(track);
  if (wantWide && shouldApplyMinZoom(range, facing)) {
    const applied = await applyZoomValue(track, range.min);
    if (applied || facing === FACING.USER) return stream;
  }
  if (allowSwap && facing === FACING.ENVIRONMENT) {
    const currentId = deviceIdOf(track);
    const ultraId = await findUltraWideId();
    if (wantWide && ultraId && ultraId !== currentId && !zoomCanWiden(range)) {
      const next = await replaceStream(video, stream, Object.assign({}, frameConstraints(o), { deviceId: { exact: ultraId } }));
      return withLens(video, next, o, false);
    }
    if (!wantWide && ultraId && currentId === ultraId) {
      const next = await replaceStream(video, stream, Object.assign({}, frameConstraints(o), { facingMode: { [FACING_FIT.EXACT]: facing } }));
      return withLens(video, next, Object.assign({}, o, { lens: LENS.NORMAL }), false);
    }
  }
  if (!wantWide && range && range.min <= ZOOM_ONE && range.max >= ZOOM_ONE && zoomValue(track) !== ZOOM_ONE) {
    await applyZoomValue(track, ZOOM_ONE);
  }
  return stream;
}

async function attachStream(video, stream) {
  video.setAttribute("playsinline", "");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
  try {
    await video.play();
  } catch (e) {
    stopTracks(stream);
    throw new CameraError(CAMERA_ERROR.UNKNOWN, e);
  }
  return stream;
}

function guard() {
  if (typeof window !== "undefined" && window.isSecureContext === false) throw new CameraError(CAMERA_ERROR.INSECURE);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new CameraError(CAMERA_ERROR.UNSUPPORTED);
}

export async function openCamera(video, options) {
  const o = Object.assign({ frameRate: FRAME_RATE, lens: LENS.NORMAL }, options);
  guard();
  let stream = await acquireStream(o);
  try {
    stream = await withLens(video, stream, o, true);
  } catch (e) {
    stopTracks(stream);
    throw e instanceof CameraError ? e : new CameraError(mapError(e), e);
  }
  return attachStream(video, stream);
}

export async function retuneLens(video, stream, options) {
  const o = Object.assign({ frameRate: FRAME_RATE, lens: LENS.NORMAL }, options);
  guard();
  const next = await withLens(video, stream, o, true);
  if (next !== stream) await attachStream(video, next);
  return next;
}

export async function readCameraState(stream, facing) {
  const track = videoTrack(stream);
  const zoom = zoomRange(track);
  const value = zoomValue(track);
  const mode = facing || trackFacing(stream) || FACING.USER;
  const ultraId = mode === FACING.ENVIRONMENT ? await findUltraWideId() : "";
  const ultraWide = !!ultraId;
  return {
    zoom: value,
    capabilities: {
      zoom,
      ultraWide,
      canWiden: zoomCanWiden(zoom) || ultraWide,
    },
  };
}

export function emptyCameraState() {
  return { zoom: null, lens: LENS.NORMAL, capabilities: EMPTY_CAPABILITIES };
}

export function closeCamera(video, stream) {
  stopTracks(stream);
  if (video && video.srcObject === stream) video.srcObject = null;
}
