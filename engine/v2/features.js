import { LANDMARK, scalePointsAround } from "./landmarks.js";

export const FEATURES_VERSION = 3;
export const SEGMENT = Object.freeze({
  LEFT_UPPER_ARM: "leftUpperArm",
  LEFT_FOREARM: "leftForearm",
  RIGHT_UPPER_ARM: "rightUpperArm",
  RIGHT_FOREARM: "rightForearm",
  LEFT_THIGH: "leftThigh",
  LEFT_SHIN: "leftShin",
  RIGHT_THIGH: "rightThigh",
  RIGHT_SHIN: "rightShin",
  SHOULDER_LINE: "shoulderLine",
  HIP_LINE: "hipLine",
  GRAVITY: "gravity",
  PALM_INDEX: "palmIndex",
  PALM_MIDDLE: "palmMiddle",
  PALM_RING: "palmRing",
  PALM_PINKY: "palmPinky",
  THUMB_PROXIMAL: "thumbProximal",
  THUMB_MIDDLE: "thumbMiddle",
  THUMB_DISTAL: "thumbDistal",
  INDEX_PROXIMAL: "indexProximal",
  INDEX_MIDDLE: "indexMiddle",
  INDEX_DISTAL: "indexDistal",
  MIDDLE_PROXIMAL: "middleProximal",
  MIDDLE_MIDDLE: "middleMiddle",
  MIDDLE_DISTAL: "middleDistal",
  RING_PROXIMAL: "ringProximal",
  RING_MIDDLE: "ringMiddle",
  RING_DISTAL: "ringDistal",
  PINKY_PROXIMAL: "pinkyProximal",
  PINKY_MIDDLE: "pinkyMiddle",
  PINKY_DISTAL: "pinkyDistal",
});
export const SEGMENT_NAMES = Object.freeze(Object.values(SEGMENT));
export const HAND_PREVIEW_COUNT = 21;
export const HAND_BONES = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 9], [9, 13], [13, 17],
]);
export const MATCH_TOLERANCE = Object.freeze({ rmsDeg: 60, minShared: 3, minSharedRatio: 0.5, minVisibility: 0.5 });
export const TPOSE_MAX_DEG = 28;
export const PREVIEW_JOINTS = Object.freeze([
  "nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
  "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
]);

const LIMBS = Object.freeze([
  [SEGMENT.LEFT_UPPER_ARM, "left_shoulder", "left_elbow"],
  [SEGMENT.LEFT_FOREARM, "left_elbow", "left_wrist"],
  [SEGMENT.RIGHT_UPPER_ARM, "right_shoulder", "right_elbow"],
  [SEGMENT.RIGHT_FOREARM, "right_elbow", "right_wrist"],
  [SEGMENT.LEFT_THIGH, "left_hip", "left_knee"],
  [SEGMENT.LEFT_SHIN, "left_knee", "left_ankle"],
  [SEGMENT.RIGHT_THIGH, "right_hip", "right_knee"],
  [SEGMENT.RIGHT_SHIN, "right_knee", "right_ankle"],
]);
const TORSO = Object.freeze(["left_shoulder", "right_shoulder", "left_hip", "right_hip"]);
const LINES = Object.freeze([
  [SEGMENT.SHOULDER_LINE, "left_shoulder", "right_shoulder"],
  [SEGMENT.HIP_LINE, "left_hip", "right_hip"],
]);
const HAND_SEGMENTS = Object.freeze([
  [SEGMENT.PALM_INDEX, 0, 5],
  [SEGMENT.PALM_MIDDLE, 0, 9],
  [SEGMENT.PALM_RING, 0, 13],
  [SEGMENT.PALM_PINKY, 0, 17],
  [SEGMENT.THUMB_PROXIMAL, 1, 2],
  [SEGMENT.THUMB_MIDDLE, 2, 3],
  [SEGMENT.THUMB_DISTAL, 3, 4],
  [SEGMENT.INDEX_PROXIMAL, 5, 6],
  [SEGMENT.INDEX_MIDDLE, 6, 7],
  [SEGMENT.INDEX_DISTAL, 7, 8],
  [SEGMENT.MIDDLE_PROXIMAL, 9, 10],
  [SEGMENT.MIDDLE_MIDDLE, 10, 11],
  [SEGMENT.MIDDLE_DISTAL, 11, 12],
  [SEGMENT.RING_PROXIMAL, 13, 14],
  [SEGMENT.RING_MIDDLE, 14, 15],
  [SEGMENT.RING_DISTAL, 15, 16],
  [SEGMENT.PINKY_PROXIMAL, 17, 18],
  [SEGMENT.PINKY_MIDDLE, 18, 19],
  [SEGMENT.PINKY_DISTAL, 19, 20],
]);
const HAND_WRIST = 0;
const HAND_INDEX_MCP = 5;
const HAND_MIDDLE_MCP = 9;
const HAND_PINKY_MCP = 17;
export const LIMB_SEGMENTS = Object.freeze(LIMBS.map(([name, a, b]) => Object.freeze([name, LANDMARK[a], LANDMARK[b]])));
export const DEPTH_GAIN_MAX = 2.5;
const GRAVITY_DOWN = Object.freeze({ x: 0, y: 1, z: 0 });
const LEFT_OUT = Object.freeze([-1, 0, 0]);
const RIGHT_OUT = Object.freeze([1, 0, 0]);
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const ROUND = 1000;
const PREVIEW_PAD = 0.14;
const EPS = 1e-6;

function vis(p) {
  return p && typeof p.visibility === "number" ? p.visibility : 1;
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function unit(a) {
  const n = Math.hypot(a.x, a.y, a.z);
  return n > EPS ? scale(a, 1 / n) : null;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function finite(p) {
  return !!p && isFinite(p.x) && isFinite(p.y);
}

function round(v) {
  return Math.round(v * ROUND) / ROUND;
}

function hasWorld(world) {
  return !!world && TORSO.every((n) => finite(world[LANDMARK[n]]));
}

function vec(a) {
  return Array.isArray(a) && a.length === 3 && a.every(isFinite) ? unit({ x: a[0], y: a[1], z: a[2] }) : null;
}

function deepen(d, len) {
  if (!(len > 0)) return d;
  const z = d.z || 0;
  const need = len * len - d.x * d.x - d.y * d.y;
  if (need <= z * z) return d;
  const gain = Math.min(DEPTH_GAIN_MAX, Math.sqrt(need) / Math.max(Math.abs(z), EPS));
  return { x: d.x, y: d.y, z: z * gain };
}

function correct(points, cal) {
  const body = cal.body || {};
  const len = cal.len || {};
  const out = points.slice();
  const at = (q) => ({ x: q.x, y: q.y, z: q.z || 0 });
  const P = (n) => at(points[LANDMARK[n]]);
  const set = (n, q) => { out[LANDMARK[n]] = Object.assign({}, points[LANDMARK[n]], q); };
  const midHip = scale(add(P("left_hip"), P("right_hip")), 0.5);
  const midShoulder = scale(add(P("left_shoulder"), P("right_shoulder")), 0.5);
  const halfHip = deepen(scale(sub(P("right_hip"), P("left_hip")), 0.5), body.hipWidth / 2);
  set("right_hip", add(midHip, halfHip));
  set("left_hip", sub(midHip, halfHip));
  const shoulderMid = add(midHip, deepen(sub(midShoulder, midHip), body.torso));
  const halfShoulder = deepen(scale(sub(P("right_shoulder"), P("left_shoulder")), 0.5), body.shoulderWidth / 2);
  set("right_shoulder", add(shoulderMid, halfShoulder));
  set("left_shoulder", sub(shoulderMid, halfShoulder));
  LIMBS.forEach(([name, a, b]) => {
    const pa = out[LANDMARK[a]];
    if (!finite(pa) || !finite(points[LANDMARK[a]]) || !finite(points[LANDMARK[b]])) return;
    set(b, add(at(pa), deepen(sub(P(b), P(a)), len[name])));
  });
  return out;
}

export function upgradeFeatures(f) {
  if (!f || !f.seg || typeof f.seg !== "object") return f;
  if (typeof f.v === "number" && f.v >= FEATURES_VERSION) return f;
  if (typeof f.v === "number" && f.v === 2) return Object.assign({}, f, { v: FEATURES_VERSION });
  const seg = {};
  Object.keys(f.seg).forEach((name) => {
    const d = f.seg[name];
    seg[name] = Array.isArray(d) && d.length === 3 ? [d[0], d[1], d[2] === 0 ? 0 : -d[2]] : d;
  });
  return Object.assign({}, f, { v: FEATURES_VERSION, seg });
}

export function bodyFrame(points, chirality) {
  if (!points || !TORSO.every((n) => finite(points[LANDMARK[n]]))) return null;
  const p = (n) => Object.assign({ z: 0 }, points[LANDMARK[n]]);
  const midShoulder = scale(add(p("left_shoulder"), p("right_shoulder")), 0.5);
  const midHip = scale(add(p("left_hip"), p("right_hip")), 0.5);
  const up = unit(sub(midShoulder, midHip));
  const across = unit(add(sub(p("right_shoulder"), p("left_shoulder")), sub(p("right_hip"), p("left_hip"))));
  if (!up || !across) return null;
  const right = unit(sub(across, scale(up, dot(across, up))));
  if (!right) return null;
  const forward = cross(up, right);
  return { up, right, forward: chirality < 0 ? scale(forward, -1) : forward };
}

function local(frame, d) {
  return [dot(d, frame.right), dot(d, frame.up), dot(d, frame.forward)];
}

function normalizeToCalibration(points, cal) {
  const torso = cal && cal.body && cal.body.torso;
  if (!(torso > 0) || !TORSO.every((n) => finite(points[LANDMARK[n]]))) return points;
  const P = (n) => points[LANDMARK[n]];
  const midShoulder = scale(add(P("left_shoulder"), P("right_shoulder")), 0.5);
  const midHip = scale(add(P("left_hip"), P("right_hip")), 0.5);
  const current = dist(midShoulder, midHip);
  if (!(current > EPS)) return points;
  return scalePointsAround(points, torso / current, midHip);
}

function preview(landmarks, mirrored) {
  const pts = PREVIEW_JOINTS.map((n) => {
    const q = landmarks[LANDMARK[n]];
    if (!finite(q)) return null;
    return { x: mirrored ? 1 - q.x : q.x, y: q.y, v: vis(q) };
  });
  const seen = pts.filter(Boolean);
  if (!seen.length) return [];
  const xs = seen.map((q) => q.x);
  const ys = seen.map((q) => q.y);
  const xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
  const yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
  const box = (Math.max(xMax - xMin, yMax - yMin) || 1) * (1 + 2 * PREVIEW_PAD);
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  return pts.map((q) => (q ? [round((q.x - cx) / box + 0.5), round((q.y - cy) / box + 0.5), round(q.v)] : null));
}

export function poseFeatures(landmarks, world, options) {
  if (!landmarks) return null;
  const metric = hasWorld(world);
  const cal = options && options.calibration;
  const base = metric ? normalizeToCalibration(world, cal) : landmarks;
  const points = metric ? (cal && cal.len ? correct(base, cal) : base) : landmarks;
  const frame = bodyFrame(points, cal && cal.chirality);
  if (!frame) return null;
  const seg = {};
  const visOut = {};
  LIMBS.concat(LINES).forEach(([name, a, b]) => {
    const pa = points[LANDMARK[a]];
    const pb = points[LANDMARK[b]];
    if (!finite(pa) || !finite(pb)) return;
    const d = unit(sub(pb, pa));
    if (!d) return;
    seg[name] = local(frame, d);
    visOut[name] = Math.min(vis(landmarks[LANDMARK[a]]), vis(landmarks[LANDMARK[b]]));
  });
  seg[SEGMENT.GRAVITY] = local(frame, (cal && vec(cal.down)) || GRAVITY_DOWN);
  visOut[SEGMENT.GRAVITY] = Math.min.apply(null, TORSO.map((n) => vis(landmarks[LANDMARK[n]])));
  return { v: FEATURES_VERSION, seg, vis: visOut, pts: preview(landmarks, !!(options && options.mirrored)) };
}

function handPreview(landmarks, mirrored) {
  const pts = landmarks.map((q) => {
    if (!finite(q)) return null;
    return { x: mirrored ? 1 - q.x : q.x, y: q.y, v: vis(q) };
  });
  const seen = pts.filter(Boolean);
  if (!seen.length) return [];
  const xs = seen.map((q) => q.x);
  const ys = seen.map((q) => q.y);
  const xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
  const yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
  const box = (Math.max(xMax - xMin, yMax - yMin) || 1) * (1 + 2 * PREVIEW_PAD);
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  return pts.map((q) => (q ? [round((q.x - cx) / box + 0.5), round((q.y - cy) / box + 0.5), round(q.v)] : null));
}

function handFrame(points) {
  const wrist = points[HAND_WRIST];
  const middle = points[HAND_MIDDLE_MCP];
  const index = points[HAND_INDEX_MCP];
  const pinky = points[HAND_PINKY_MCP];
  if (!finite(wrist) || !finite(middle) || !finite(index) || !finite(pinky)) return null;
  const up = unit(sub(middle, wrist));
  if (!up) return null;
  let right = unit(sub(index, pinky));
  if (!right) return null;
  right = unit(sub(right, scale(up, dot(right, up))));
  if (!right) return null;
  return { up, right, forward: cross(up, right) };
}

export function handFeatures(landmarks, world, options) {
  if (!landmarks || landmarks.length < HAND_PREVIEW_COUNT) return null;
  const pts = world && world.length >= HAND_PREVIEW_COUNT ? world : landmarks;
  const frame = handFrame(pts);
  if (!frame) return null;
  const seg = {};
  const visOut = {};
  HAND_SEGMENTS.forEach(([name, a, b]) => {
    const pa = pts[a];
    const pb = pts[b];
    if (!finite(pa) || !finite(pb)) return;
    const d = unit(sub(pb, pa));
    if (!d) return;
    seg[name] = local(frame, d);
    visOut[name] = 1;
  });
  if (!Object.keys(seg).length) return null;
  return { v: FEATURES_VERSION, seg, vis: visOut, pts: handPreview(landmarks, !!(options && options.mirrored)) };
}

export function isHandFeature(f) {
  if (!f || !f.seg || typeof f.seg !== "object") return false;
  return HAND_SEGMENTS.some(([name]) => Array.isArray(f.seg[name]));
}

export function averageFeatures(list) {
  const items = (list || []).filter(Boolean);
  if (!items.length) return null;
  const seg = {};
  const visOut = {};
  SEGMENT_NAMES.forEach((name) => {
    let sx = 0, sy = 0, sz = 0, sv = 0, n = 0;
    items.forEach((f) => {
      const d = f.seg[name];
      if (!d) return;
      const w = Math.max(f.vis[name] || 0, EPS);
      sx += d[0] * w; sy += d[1] * w; sz += d[2] * w; sv += f.vis[name] || 0; n++;
    });
    if (!n) return;
    const u = unit({ x: sx, y: sy, z: sz });
    if (!u) return;
    seg[name] = [round(u.x), round(u.y), round(u.z)];
    visOut[name] = round(sv / n);
  });
  return { v: FEATURES_VERSION, seg, vis: visOut, pts: items[items.length - 1].pts || [] };
}

function usableSegment(f, name, minVis) {
  const d = f && f.seg && f.seg[name];
  return Array.isArray(d) && d.length === 3 && (f.vis && typeof f.vis[name] === "number" ? f.vis[name] : 1) >= minVis;
}

function swapSide(name) {
  return /^left/.test(name) ? name.replace(/^left/, "right") : /^right/.test(name) ? name.replace(/^right/, "left") : name;
}

function mirrorSegment(name, d) {
  if (!Array.isArray(d) || d.length !== 3) return d;
  if (name === SEGMENT.SHOULDER_LINE || name === SEGMENT.HIP_LINE) return [d[0], -d[1], -d[2]];
  return [-d[0], d[1], d[2]];
}

function mirrorTarget(target) {
  const seg = {};
  Object.keys(target.seg || {}).forEach((name) => {
    seg[swapSide(name)] = mirrorSegment(name, target.seg[name]);
  });
  return { seg, vis: swapVis(target.vis) };
}

function swapVis(vis) {
  if (!vis) return vis;
  const out = {};
  Object.keys(vis).forEach((name) => { out[swapSide(name)] = vis[name]; });
  return out;
}

function compareTerms(current, target, tol) {
  if (!current || !target || !target.seg) return null;
  let sum = 0, weight = 0, shared = 0, wanted = 0;
  SEGMENT_NAMES.forEach((name) => {
    if (!usableSegment(target, name, tol.minVisibility)) return;
    wanted++;
    if (!usableSegment(current, name, tol.minVisibility)) return;
    const a = current.seg[name];
    const b = target.seg[name];
    const c = Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ((Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2])) || 1)));
    const angle = Math.acos(c) * RAD_TO_DEG;
    const w = Math.min(current.vis[name], target.vis ? target.vis[name] : 1);
    sum += w * angle * angle;
    weight += w;
    shared++;
  });
  if (shared < Math.min(tol.minShared, wanted) || shared < tol.minSharedRatio * wanted || weight <= 0) return null;
  const error = Math.sqrt(sum / weight);
  return { proximity: Math.max(0, 1 - error / tol.rmsDeg), error, shared };
}

export function compareFeatures(current, target, tolerance) {
  const tol = Object.assign({}, MATCH_TOLERANCE, tolerance);
  if (!current || !target || !target.seg) return null;
  const direct = compareTerms(current, target, tol);
  if (!target.alt) return direct;
  const mirrored = compareTerms(current, mirrorTarget(target), tol);
  if (!direct) return mirrored;
  if (!mirrored) return direct;
  return direct.proximity >= mirrored.proximity ? direct : mirrored;
}

function along(f, name, dir, minCos, minVis) {
  if (!usableSegment(f, name, minVis)) return false;
  const d = f.seg[name];
  return d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2] >= minCos;
}

export function isTPose(f, maxDeg) {
  if (!f) return false;
  const minCos = Math.cos((maxDeg || TPOSE_MAX_DEG) * DEG_TO_RAD);
  const minVis = MATCH_TOLERANCE.minVisibility;
  return along(f, SEGMENT.LEFT_UPPER_ARM, LEFT_OUT, minCos, minVis) && along(f, SEGMENT.LEFT_FOREARM, LEFT_OUT, minCos, minVis)
    && along(f, SEGMENT.RIGHT_UPPER_ARM, RIGHT_OUT, minCos, minVis) && along(f, SEGMENT.RIGHT_FOREARM, RIGHT_OUT, minCos, minVis);
}
