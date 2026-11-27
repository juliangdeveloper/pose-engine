import { TASKS_VISION_URL, WASM_BASE, DELEGATE } from "./detector.js";
import { LANDMARK } from "./landmarks.js";

export const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
export const HAND_STATE = Object.freeze({ OFF: "off", LOADING: "loading", FAR: "far", NEAR: "near", FAILED: "failed" });
export const HAND_DEFAULTS = Object.freeze({
  everyFrames: 2,
  numHands: 2,
  nearOn: 0.12,
  farOff: 0.08,
  dwellMs: 300,
  minVisibility: 0.4,
  minHandDetectionConfidence: 0.3,
  minHandPresenceConfidence: 0.3,
  minTrackingConfidence: 0.3,
  cropMinPx: 384,
  cropPadRatio: 0.35,
  cropMinRatio: 0.18,
});

const WRISTS = [LANDMARK.left_wrist, LANDMARK.right_wrist];

export function bodyScale(landmarks, width, height, minVisibility) {
  if (!landmarks || !width || !height) return null;
  const a = landmarks[LANDMARK.left_shoulder];
  const b = landmarks[LANDMARK.right_shoulder];
  const min = minVisibility === undefined ? HAND_DEFAULTS.minVisibility : minVisibility;
  if (!a || !b) return null;
  if ((a.visibility !== undefined && a.visibility < min) || (b.visibility !== undefined && b.visibility < min)) return null;
  const px = Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  return px / Math.min(width, height);
}

export function wristCrop(landmarks, width, height, minVisibility, options) {
  const o = Object.assign({}, HAND_DEFAULTS, options || {});
  if (!landmarks || !(width > 0) || !(height > 0)) return null;
  const min = minVisibility === undefined ? o.minVisibility : minVisibility;
  const pts = WRISTS.map((i) => landmarks[i]).filter((p) => p && isFinite(p.x) && isFinite(p.y) && (p.visibility === undefined || p.visibility >= min));
  if (!pts.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  pts.forEach((p) => {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  });
  const pad = Math.max(x1 - x0, y1 - y0, o.cropMinRatio) * (o.cropPadRatio / 2);
  const nx0 = Math.max(0, x0 - pad);
  const ny0 = Math.max(0, y0 - pad);
  const nx1 = Math.min(1, x1 + pad);
  const ny1 = Math.min(1, y1 + pad);
  return { sx: nx0 * width, sy: ny0 * height, sw: Math.max(1, (nx1 - nx0) * width), sh: Math.max(1, (ny1 - ny0) * height), nx: nx0, ny: ny0, nw: nx1 - nx0, nh: ny1 - ny0 };
}

export function remapHandLandmarks(landmarks, crop) {
  if (!landmarks || !crop) return landmarks;
  return landmarks.map((p) => {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) return p;
    return Object.assign({}, p, { x: crop.nx + p.x * crop.nw, y: crop.ny + p.y * crop.nh });
  });
}

export function createDistanceGate(options) {
  const o = Object.assign({}, HAND_DEFAULTS, options);
  let near = false;
  let since = null;
  return {
    update(scale, t) {
      const want = near ? !(scale === null || scale <= o.farOff) : scale !== null && scale >= o.nearOn;
      if (want === near) {
        since = null;
        return near;
      }
      if (since === null) since = t;
      if (t - since >= o.dwellMs) {
        near = want;
        since = null;
      }
      return near;
    },
    near: () => near,
    reset() {
      near = false;
      since = null;
    },
  };
}

function cropCanvas(source, crop, o) {
  const srcW = source.videoWidth || source.width;
  const srcH = source.videoHeight || source.height;
  if (!srcW || !srcH) return null;
  const sw = Math.min(crop.sw, srcW - crop.sx);
  const sh = Math.min(crop.sh, srcH - crop.sy);
  if (!(sw > 0) || !(sh > 0)) return null;
  const scale = Math.max(1, o.cropMinPx / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const c = canvas.getContext("2d", { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(source, crop.sx, crop.sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { canvas, crop: { nx: crop.sx / srcW, ny: crop.sy / srcH, nw: sw / srcW, nh: sh / srcH } };
}

export function createHandLandmarker(options) {
  const o = Object.assign({ delegate: DELEGATE.GPU }, options);
  let vision = null;
  let fileset = null;
  let landmarker = null;
  let delegate = null;
  let lastTs = -1;

  function build(d) {
    return vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.modelUrl || HAND_MODEL, delegate: d },
      runningMode: "VIDEO",
      numHands: o.numHands === undefined ? HAND_DEFAULTS.numHands : o.numHands,
      minHandDetectionConfidence: o.minHandDetectionConfidence === undefined ? HAND_DEFAULTS.minHandDetectionConfidence : o.minHandDetectionConfidence,
      minHandPresenceConfidence: o.minHandPresenceConfidence === undefined ? HAND_DEFAULTS.minHandPresenceConfidence : o.minHandPresenceConfidence,
      minTrackingConfidence: o.minTrackingConfidence === undefined ? HAND_DEFAULTS.minTrackingConfidence : o.minTrackingConfidence,
    });
  }

  async function toCpu() {
    try { if (landmarker) landmarker.close(); } catch (e) { landmarker = null; }
    landmarker = await build(DELEGATE.CPU);
    delegate = DELEGATE.CPU;
    lastTs = -1;
  }

  function run(source, tMs) {
    if (!landmarker) return null;
    const ts = Math.max(Math.round(tMs), lastTs + 1);
    lastTs = ts;
    const r = landmarker.detectForVideo(source, ts);
    if (!r || !r.landmarks || !r.landmarks.length) return { landmarks: null, worldLandmarks: null };
    return { landmarks: r.landmarks[0], worldLandmarks: r.worldLandmarks && r.worldLandmarks[0] ? r.worldLandmarks[0] : null };
  }

  return {
    async init() {
      if (landmarker) return { delegate };
      vision = await import(o.tasksVisionUrl || TASKS_VISION_URL);
      fileset = await vision.FilesetResolver.forVisionTasks(o.wasmBase || WASM_BASE);
      if (o.delegate === DELEGATE.GPU) {
        try {
          landmarker = await build(DELEGATE.GPU);
          delegate = DELEGATE.GPU;
        } catch (e) {
          await toCpu();
        }
      } else {
        await toCpu();
      }
      return { delegate };
    },
    async recover() {
      if (delegate !== DELEGATE.GPU) return false;
      await toCpu();
      return true;
    },
    detect(source, tMs, crop) {
      if (!landmarker || !source) return null;
      if (crop) {
        try {
          const built = cropCanvas(source, crop, Object.assign({}, HAND_DEFAULTS, o));
          if (built) {
            const first = run(built.canvas, tMs);
            if (first && first.landmarks) {
              return { landmarks: remapHandLandmarks(first.landmarks, built.crop), worldLandmarks: first.worldLandmarks };
            }
          }
        } catch (e) {}
      }
      try {
        return run(source, tMs);
      } catch (e) {
        return null;
      }
    },
    get delegate() {
      return delegate;
    },
    close() {
      try { if (landmarker) landmarker.close(); } catch (e) { landmarker = null; }
      landmarker = null;
    },
  };
}
