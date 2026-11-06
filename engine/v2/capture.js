import { averageFeatures, isTPose } from "./features.js";

export const CAPTURE_STATE = Object.freeze({ IDLE: "idle", WAITING: "waiting", HOLDING: "holding", COUNTDOWN: "countdown" });
export const CAPTURE_RESULT = Object.freeze({ CAPTURED: "captured", NO_BODY: "no-body" });
export const CAPTURE_DEFAULTS = Object.freeze({ countdownMs: 3000, triggerHoldMs: 500, windowMs: 300 });
const MS_PER_S = 1000;

export function createCaptureFlow(options) {
  const o = Object.assign({}, CAPTURE_DEFAULTS, options);
  let state = CAPTURE_STATE.IDLE;
  let heldSince = 0;
  let endsAt = 0;
  let needsRelease = false;
  let buffer = [];

  function snapshot(t) {
    const remainingMs = state === CAPTURE_STATE.COUNTDOWN ? Math.max(0, endsAt - t) : 0;
    const holdProgress = state === CAPTURE_STATE.HOLDING ? Math.min(1, (t - heldSince) / o.triggerHoldMs) : 0;
    return { state, remainingMs, seconds: Math.ceil(remainingMs / MS_PER_S), holdProgress, needsRelease };
  }

  function start() {
    state = CAPTURE_STATE.WAITING;
    needsRelease = false;
    buffer = [];
  }

  function cancel() {
    state = CAPTURE_STATE.IDLE;
    buffer = [];
  }

  function update(features, t) {
    if (state === CAPTURE_STATE.IDLE) return { snapshot: snapshot(t), result: null };
    buffer.push({ t, features });
    buffer = buffer.filter((b) => t - b.t <= o.windowMs);
    let result = null;
    const tpose = isTPose(features);
    if (state === CAPTURE_STATE.WAITING) {
      if (!tpose) needsRelease = false;
      else if (!needsRelease) { state = CAPTURE_STATE.HOLDING; heldSince = t; }
    } else if (state === CAPTURE_STATE.HOLDING) {
      if (!tpose) state = CAPTURE_STATE.WAITING;
      else if (t - heldSince >= o.triggerHoldMs) { state = CAPTURE_STATE.COUNTDOWN; endsAt = t + o.countdownMs; }
    } else if (state === CAPTURE_STATE.COUNTDOWN && t >= endsAt) {
      const features = averageFeatures(buffer.map((b) => b.features));
      result = features ? { type: CAPTURE_RESULT.CAPTURED, features } : { type: CAPTURE_RESULT.NO_BODY, features: null };
      state = CAPTURE_STATE.WAITING;
      needsRelease = true;
      buffer = [];
    }
    return { snapshot: snapshot(t), result };
  }

  return { start, cancel, update, state: () => state, active: () => state !== CAPTURE_STATE.IDLE };
}
