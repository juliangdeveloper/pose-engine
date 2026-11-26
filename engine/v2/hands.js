import { TASKS_VISION_URL, WASM_BASE, DELEGATE } from "./detector.js";
import { LANDMARK } from "./landmarks.js";

export const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
export const HAND_STATE = Object.freeze({ OFF: "off", LOADING: "loading", FAR: "far", NEAR: "near", FAILED: "failed" });
export const HAND_DEFAULTS = Object.freeze({
  everyFrames: 3,
  nearOn: 0.24,
  farOff: 0.18,
  dwellMs: 500,
  minVisibility: 0.5,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

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
      numHands: 1,
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
    detect(source, tMs) {
      if (!landmarker) return null;
      const ts = Math.max(Math.round(tMs), lastTs + 1);
      lastTs = ts;
      const r = landmarker.detectForVideo(source, ts);
      if (!r || !r.landmarks || !r.landmarks.length) return { landmarks: null, worldLandmarks: null };
      return { landmarks: r.landmarks[0], worldLandmarks: r.worldLandmarks && r.worldLandmarks[0] ? r.worldLandmarks[0] : null };
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
