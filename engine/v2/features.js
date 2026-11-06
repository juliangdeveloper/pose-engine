import { LANDMARK } from "./landmarks.js";

export const FEATURES_VERSION = 1;
export const SEGMENT = Object.freeze({
  LEFT_UPPER_ARM: "leftUpperArm",
  LEFT_FOREARM: "leftForearm",
  RIGHT_UPPER_ARM: "rightUpperArm",
  RIGHT_FOREARM: "rightForearm",
  LEFT_THIGH: "leftThigh",
  LEFT_SHIN: "leftShin",
  RIGHT_THIGH: "rightThigh",
  RIGHT_SHIN: "rightShin",
  GRAVITY: "gravity",
});
export const SEGMENT_NAMES = Object.freeze(Object.values(SEGMENT));
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

function finite(p) {
  return !!p && isFinite(p.x) && isFinite(p.y);
}

function round(v) {
  return Math.round(v * ROUND) / ROUND;
}

function pointsOf(landmarks, world) {
  if (world && TORSO.every((n) => finite(world[LANDMARK[n]]))) return world;
  return landmarks;
}

export function bodyFrame(points) {
  if (!points || !TORSO.every((n) => finite(points[LANDMARK[n]]))) return null;
  const p = (n) => Object.assign({ z: 0 }, points[LANDMARK[n]]);
  const midShoulder = scale(add(p("left_shoulder"), p("right_shoulder")), 0.5);
  const midHip = scale(add(p("left_hip"), p("right_hip")), 0.5);
  const up = unit(sub(midShoulder, midHip));
  const across = unit(add(sub(p("right_shoulder"), p("left_shoulder")), sub(p("right_hip"), p("left_hip"))));
  if (!up || !across) return null;
  const right = unit(sub(across, scale(up, dot(across, up))));
  if (!right) return null;
  return { up, right, forward: cross(right, up) };
}

function local(frame, d) {
  return [dot(d, frame.right), dot(d, frame.up), dot(d, frame.forward)];
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
  const points = pointsOf(landmarks, world);
  const frame = bodyFrame(points);
  if (!frame) return null;
  const seg = {};
  const visOut = {};
  LIMBS.forEach(([name, a, b]) => {
    const pa = points[LANDMARK[a]];
    const pb = points[LANDMARK[b]];
    const d = finite(pa) && finite(pb) ? unit(sub(pb, pa)) : null;
    if (!d) return;
    seg[name] = local(frame, d);
    visOut[name] = Math.min(vis(landmarks[LANDMARK[a]]), vis(landmarks[LANDMARK[b]]));
  });
  seg[SEGMENT.GRAVITY] = local(frame, GRAVITY_DOWN);
  visOut[SEGMENT.GRAVITY] = Math.min.apply(null, TORSO.map((n) => vis(landmarks[LANDMARK[n]])));
  return { v: FEATURES_VERSION, seg, vis: visOut, pts: preview(landmarks, !!(options && options.mirrored)) };
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

export function compareFeatures(current, target, tolerance) {
  const tol = Object.assign({}, MATCH_TOLERANCE, tolerance);
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
  if (shared < tol.minShared || shared < tol.minSharedRatio * wanted || weight <= 0) return null;
  const error = Math.sqrt(sum / weight);
  return { proximity: Math.max(0, 1 - error / tol.rmsDeg), error, shared };
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
