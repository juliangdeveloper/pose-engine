import { LANDMARK } from "./landmarks.js";
import { bodyFrame, isTPose, LIMB_SEGMENTS, MATCH_TOLERANCE } from "./features.js";

export const CALIBRATION_VERSION = 1;
export const CALIBRATION_STATE = Object.freeze({ IDLE: "idle", WAITING: "waiting", HOLDING: "holding" });
export const CALIBRATION_RESULT = Object.freeze({ CALIBRATED: "calibrated" });
export const CALIBRATION_DEFAULTS = Object.freeze({ holdMs: 1500, maxMotion: 0.11, minNoseDepth: 0.02 });
export const BODY_PART = Object.freeze({ LEFT_ARM: "leftArm", RIGHT_ARM: "rightArm", LEFT_LEG: "leftLeg", RIGHT_LEG: "rightLeg" });

const PART_SEGMENTS = Object.freeze({
  [BODY_PART.LEFT_ARM]: ["leftUpperArm", "leftForearm"],
  [BODY_PART.RIGHT_ARM]: ["rightUpperArm", "rightForearm"],
  [BODY_PART.LEFT_LEG]: ["leftThigh", "leftShin"],
  [BODY_PART.RIGHT_LEG]: ["rightThigh", "rightShin"],
});
const SHOULDERS = [LANDMARK.left_shoulder, LANDMARK.right_shoulder];
const HIPS = [LANDMARK.left_hip, LANDMARK.right_hip];
const ROUND = 1000;

function round(v) {
  return Math.round(v * ROUND) / ROUND;
}

function finite(p) {
  return !!p && isFinite(p.x) && isFinite(p.y);
}

function mid(points, ids) {
  const a = points[ids[0]];
  const b = points[ids[1]];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function median(list) {
  const s = list.filter(isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}

export function missingParts(features, minVis) {
  const v = typeof minVis === "number" ? minVis : MATCH_TOLERANCE.minVisibility;
  if (!features) return Object.values(BODY_PART);
  return Object.keys(PART_SEGMENTS).filter((part) => PART_SEGMENTS[part].some((name) => !features.seg[name] || !(features.vis[name] >= v)));
}

export function computeCalibration(samples, options) {
  const o = Object.assign({}, CALIBRATION_DEFAULTS, options);
  const frames = (samples || []).filter((s) => s && s.world && s.landmarks && SHOULDERS.concat(HIPS).every((i) => finite(s.world[i])));
  if (!frames.length) return null;
  let dx = 0, dy = 0, dz = 0, nose = 0, noseN = 0;
  frames.forEach((s) => {
    const frame = bodyFrame(s.world);
    if (!frame) return;
    dx -= frame.up.x; dy -= frame.up.y; dz -= frame.up.z;
    const n = s.world[LANDMARK.nose];
    if (finite(n) && (s.landmarks[LANDMARK.nose].visibility === undefined || s.landmarks[LANDMARK.nose].visibility >= MATCH_TOLERANCE.minVisibility)) {
      const m = mid(s.world, SHOULDERS);
      nose += (n.x - m.x) * frame.forward.x + (n.y - m.y) * frame.forward.y + ((n.z || 0) - m.z) * frame.forward.z;
      noseN++;
    }
  });
  const dn = Math.hypot(dx, dy, dz);
  if (!dn) return null;
  const noseDepth = noseN ? nose / noseN : 0;
  const len = {};
  const vis = {};
  LIMB_SEGMENTS.forEach(([name, a, b]) => {
    const seen = frames.filter((s) => Math.min(s.landmarks[a].visibility ?? 1, s.landmarks[b].visibility ?? 1) >= MATCH_TOLERANCE.minVisibility && finite(s.world[a]) && finite(s.world[b]));
    vis[name] = round(seen.length / frames.length);
    if (seen.length * 2 >= frames.length) len[name] = round(median(seen.map((s) => dist(s.world[a], s.world[b]))));
  });
  const shoulderWidth = median(frames.map((s) => dist(s.world[SHOULDERS[0]], s.world[SHOULDERS[1]])));
  const hipWidth = median(frames.map((s) => dist(s.world[HIPS[0]], s.world[HIPS[1]])));
  const torso = median(frames.map((s) => dist(mid(s.world, SHOULDERS), mid(s.world, HIPS))));
  const body = { shoulderWidth: round(shoulderWidth), hipWidth: round(hipWidth), torso: round(torso) };
  return {
    v: CALIBRATION_VERSION,
    down: [round(dx / dn), round(dy / dn), round(dz / dn)],
    chirality: noseDepth < -o.minNoseDepth ? -1 : 1,
    len,
    vis,
    body,
    missing: Object.keys(PART_SEGMENTS).filter((part) => PART_SEGMENTS[part].some((name) => !(name in len))),
  };
}

export function validCalibration(c) {
  return !!c && c.v === CALIBRATION_VERSION && Array.isArray(c.down) && c.down.length === 3 && c.down.every(isFinite)
    && (c.chirality === 1 || c.chirality === -1) && !!c.len && typeof c.len === "object";
}

export function createCalibrationFlow(options) {
  const o = Object.assign({}, CALIBRATION_DEFAULTS, options);
  let state = CALIBRATION_STATE.IDLE;
  let heldSince = 0;
  let samples = [];
  let anchor = null;
  let missing = [];

  function snapshot(t) {
    const progress = state === CALIBRATION_STATE.HOLDING ? Math.min(1, (t - heldSince) / o.holdMs) : 0;
    return { state, progress, missing: missing.slice() };
  }

  function start() {
    state = CALIBRATION_STATE.WAITING;
    samples = [];
    anchor = null;
    missing = [];
  }

  function cancel() {
    state = CALIBRATION_STATE.IDLE;
    samples = [];
    anchor = null;
    missing = [];
  }

  function moved(world) {
    if (!anchor || !world) return false;
    const m = mid(world, SHOULDERS);
    const torso = dist(mid(world, SHOULDERS), mid(world, HIPS));
    if (!(torso > 0)) return false;
    return dist(m, anchor) / torso > o.maxMotion;
  }

  function update(features, landmarks, world, t) {
    if (state === CALIBRATION_STATE.IDLE) return { snapshot: snapshot(t), result: null };
    missing = features ? missingParts(features) : [];
    const tpose = isTPose(features) && !!world && SHOULDERS.concat(HIPS).every((i) => finite(world[i]));
    let result = null;
    if (state === CALIBRATION_STATE.WAITING) {
      if (tpose) { state = CALIBRATION_STATE.HOLDING; heldSince = t; samples = []; anchor = mid(world, SHOULDERS); }
    } else if (state === CALIBRATION_STATE.HOLDING) {
      if (!tpose || moved(world)) { state = CALIBRATION_STATE.WAITING; samples = []; anchor = null; }
    }
    if (state === CALIBRATION_STATE.HOLDING) {
      samples.push({ landmarks, world });
      if (t - heldSince >= o.holdMs) {
        const calibration = computeCalibration(samples, o);
        if (calibration) {
          result = { type: CALIBRATION_RESULT.CALIBRATED, calibration };
          state = CALIBRATION_STATE.IDLE;
          samples = [];
          anchor = null;
        } else {
          state = CALIBRATION_STATE.WAITING;
          samples = [];
        }
      }
    }
    return { snapshot: snapshot(t), result };
  }

  return { start, cancel, update, state: () => state, active: () => state !== CALIBRATION_STATE.IDLE };
}
