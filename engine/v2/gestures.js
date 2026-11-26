import { TASKS_VISION_URL, WASM_BASE, DELEGATE } from "./detector.js";
import { LANDMARK } from "./landmarks.js";

export const GESTURE = Object.freeze({ OPEN_PALM: "Open_Palm", THUMB_UP: "Thumb_Up", VICTORY: "Victory", POINTING_UP: "Pointing_Up" });
export const GESTURES = Object.freeze([GESTURE.OPEN_PALM, GESTURE.THUMB_UP, GESTURE.VICTORY, GESTURE.POINTING_UP]);
export const GESTURE_LABEL = Object.freeze({
  [GESTURE.OPEN_PALM]: "Mano abierta",
  [GESTURE.THUMB_UP]: "Pulgar arriba",
  [GESTURE.VICTORY]: "Victoria",
  [GESTURE.POINTING_UP]: "Índice arriba",
});
export const GESTURE_STATE = Object.freeze({ OFF: "off", LOADING: "loading", FAR: "far", NEAR: "near", FAILED: "failed" });
export const GESTURE_EVENT = Object.freeze({ ENTER: "enter", LEAVE: "leave" });
export const GESTURE_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
export const GESTURE_DEFAULTS = Object.freeze({
  everyFrames: 3,
  minScore: 0.6,
  holdMs: 500,
  releaseMs: 300,
  nearOn: 0.24,
  farOff: 0.18,
  dwellMs: 500,
  minVisibility: 0.5,
});

export function isGesture(id) {
  return GESTURES.indexOf(id) !== -1;
}

export function bodyScale(landmarks, width, height, minVisibility) {
  if (!landmarks || !width || !height) return null;
  const a = landmarks[LANDMARK.left_shoulder];
  const b = landmarks[LANDMARK.right_shoulder];
  const min = minVisibility === undefined ? GESTURE_DEFAULTS.minVisibility : minVisibility;
  if (!a || !b) return null;
  if ((a.visibility !== undefined && a.visibility < min) || (b.visibility !== undefined && b.visibility < min)) return null;
  const px = Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  return px / Math.min(width, height);
}

export function createDistanceGate(options) {
  const o = Object.assign({}, GESTURE_DEFAULTS, options);
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

export function createGestureTracker(options) {
  const o = Object.assign({}, GESTURE_DEFAULTS, options);
  let active = null;
  let activeScore = 0;
  let pending = null;
  let pendingSince = 0;
  let lastSeen = 0;
  return {
    update(id, score, t) {
      const out = { left: null, entered: null };
      const seen = id && score >= o.minScore ? id : null;
      if (active && seen === active) lastSeen = t;
      if (active && seen !== active && t - lastSeen >= o.releaseMs) {
        out.left = { id: active, score: activeScore };
        active = null;
      }
      if (!seen || seen === active) {
        pending = null;
        return out;
      }
      if (seen !== pending) {
        pending = seen;
        pendingSince = t;
      }
      if (!active && t - pendingSince >= o.holdMs) {
        active = seen;
        activeScore = score;
        lastSeen = t;
        pending = null;
        out.entered = { id: active, score };
      }
      return out;
    },
    active: () => active,
    release() {
      const left = active ? { id: active, score: activeScore } : null;
      active = null;
      pending = null;
      return left;
    },
  };
}

export function createGestureRecognizer(options) {
  const o = Object.assign({ delegate: DELEGATE.GPU, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }, options);
  let vision = null;
  let fileset = null;
  let recognizer = null;
  let delegate = null;
  let lastTs = -1;

  function build(d) {
    return vision.GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.modelUrl || GESTURE_MODEL, delegate: d },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: o.minHandDetectionConfidence,
      minHandPresenceConfidence: o.minHandPresenceConfidence,
      minTrackingConfidence: o.minTrackingConfidence,
    });
  }

  async function toCpu() {
    try { if (recognizer) recognizer.close(); } catch (e) { recognizer = null; }
    recognizer = await build(DELEGATE.CPU);
    delegate = DELEGATE.CPU;
    lastTs = -1;
  }

  return {
    async init() {
      if (recognizer) return { delegate };
      vision = await import(o.tasksVisionUrl || TASKS_VISION_URL);
      fileset = await vision.FilesetResolver.forVisionTasks(o.wasmBase || WASM_BASE);
      if (o.delegate === DELEGATE.GPU) {
        try {
          recognizer = await build(DELEGATE.GPU);
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
    recognize(source, tMs) {
      if (!recognizer) return null;
      const ts = Math.max(Math.round(tMs), lastTs + 1);
      lastTs = ts;
      const r = recognizer.recognizeForVideo(source, ts);
      const top = r && r.gestures && r.gestures[0] && r.gestures[0][0];
      return top ? { id: top.categoryName, score: top.score } : { id: null, score: 0 };
    },
    get delegate() {
      return delegate;
    },
    close() {
      try { if (recognizer) recognizer.close(); } catch (e) { recognizer = null; }
      recognizer = null;
    },
  };
}
