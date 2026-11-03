import { SIDE, SIDE_JOINTS, landmarkIndex, hasSides } from "./landmarks.js";

export const MEASURE = Object.freeze({ ANGLE: "angle", INCLINE: "incline", OFFSET: "offset", LINE_OFFSET: "lineOffset" });
export const SPACE = Object.freeze({ WORLD: "world", IMAGE: "image" });

const RAD_TO_DEG = 180 / Math.PI;
const SIDE_SWITCH_MARGIN = 0.15;
const DEFAULT_MIN_VISIBILITY = 0.5;
const FRAME_MARGIN = 0.05;

function vis(p) {
  return p && p.visibility !== undefined ? p.visibility : 1;
}

function scaled(p, w, h) {
  return { x: p.x * w, y: p.y * h, z: (p.z || 0) * w };
}

function finitePoint(p) {
  return p && isFinite(p.x) && isFinite(p.y);
}

function angleAt(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y, v1z = (a.z || 0) - (b.z || 0);
  const v2x = c.x - b.x, v2y = c.y - b.y, v2z = (c.z || 0) - (b.z || 0);
  const n1 = Math.hypot(v1x, v1y, v1z);
  const n2 = Math.hypot(v2x, v2y, v2z);
  if (!n1 || !n2) return NaN;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y + v1z * v2z) / (n1 * n2)));
  return Math.acos(cos) * RAD_TO_DEG;
}

function worldOf(world, i) {
  const p = world && world[i];
  return finitePoint(p) ? p : null;
}

function inFrame(p, min) {
  if (!p || vis(p) < min) return false;
  return p.x >= -FRAME_MARGIN && p.x <= 1 + FRAME_MARGIN && p.y >= -FRAME_MARGIN && p.y <= 1 + FRAME_MARGIN;
}

export function createSideTracker() {
  let current = SIDE.LEFT;
  return {
    update(landmarks) {
      if (!landmarks) return current;
      const score = (side) => SIDE_JOINTS.reduce((s, j) => s + vis(landmarks[landmarkIndex(j, side)]), 0) / SIDE_JOINTS.length;
      const left = score(SIDE.LEFT);
      const right = score(SIDE.RIGHT);
      if (current === SIDE.LEFT && right > left + SIDE_SWITCH_MARGIN) current = SIDE.RIGHT;
      else if (current === SIDE.RIGHT && left > right + SIDE_SWITCH_MARGIN) current = SIDE.LEFT;
      return current;
    },
    get() {
      return current;
    },
    reset() {
      current = SIDE.LEFT;
    },
  };
}

function candidateSides(spec) {
  const named = spec.side;
  if (named === SIDE.LEFT || named === SIDE.RIGHT) return [named];
  if (!spec.points || !spec.points.some((n) => hasSides(n))) return [SIDE.LEFT];
  return [SIDE.LEFT, SIDE.RIGHT];
}

function measureOne(spec, side, ctx, minVis) {
  const idx = spec.points.map((n) => landmarkIndex(n, hasSides(n) ? side : SIDE.LEFT));
  const visibility = Math.min.apply(null, idx.map((i) => vis(ctx.landmarks[i])));
  const at = spec.type === MEASURE.ANGLE ? idx[1] : idx[0];
  if (!(visibility >= minVis)) return { value: NaN, visibility, at, side, label: spec.label };
  const worldPts = idx.map((i) => worldOf(ctx.world, i));
  const useWorld = (spec.space || SPACE.WORLD) === SPACE.WORLD && worldPts.every(Boolean);
  const img = idx.map((i) => scaled(ctx.landmarks[i], ctx.width, ctx.height));
  const pts = useWorld ? worldPts : img;
  let value = NaN;
  if (spec.type === MEASURE.ANGLE) {
    const flat = (p) => (useWorld ? p : { x: p.x, y: p.y });
    value = angleAt(flat(pts[0]), flat(pts[1]), flat(pts[2]));
  } else if (spec.type === MEASURE.INCLINE) {
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dz = useWorld ? (pts[1].z || 0) - (pts[0].z || 0) : 0;
    value = Math.atan2(Math.abs(dy), Math.hypot(dx, dz)) * RAD_TO_DEG;
  } else if (spec.type === MEASURE.OFFSET) {
    const scale = useWorld ? ctx.torsoWorld : ctx.torsoPx;
    value = (pts[1].y - pts[0].y) / (scale || 1);
  } else if (spec.type === MEASURE.LINE_OFFSET) {
    const [p, a, b] = pts;
    const abx = b.x - a.x, aby = b.y - a.y, abz = (b.z || 0) - (a.z || 0);
    const apx = p.x - a.x, apy = p.y - a.y, apz = (p.z || 0) - (a.z || 0);
    const len = Math.hypot(abx, aby, abz) || 1;
    const cx = aby * apz - abz * apy;
    const cy = abz * apx - abx * apz;
    const cz = abx * apy - aby * apx;
    const dist = Math.hypot(cx, cy, cz) / len;
    const t = (apx * abx + apy * aby + apz * abz) / (len * len);
    const yLine = a.y + aby * t;
    const sign = p.y > yLine ? -1 : 1;
    value = sign * dist / len;
  }
  return { value, visibility, at, side, label: spec.label };
}

function usable(spec, ctx, minVis) {
  const sides = candidateSides(spec);
  const primary = sides.map((s) => measureOne(spec, s, ctx, minVis)).filter((r) => isFinite(r.value));
  if (primary.length) return primary;
  if (!spec.fallback) return [];
  return sides.map((s) => measureOne(spec.fallback, s, ctx, minVis)).filter((r) => isFinite(r.value));
}

export function computeMeasures(specs, landmarks, world, width, height, dominant) {
  const out = {};
  if (!landmarks) return out;
  const minVis = DEFAULT_MIN_VISIBILITY;
  const sh = landmarks[landmarkIndex("shoulder", dominant)] || landmarks[landmarkIndex("shoulder", SIDE.LEFT)];
  const hp = landmarks[landmarkIndex("hip", dominant)] || landmarks[landmarkIndex("hip", SIDE.LEFT)];
  const shS = sh ? scaled(sh, width, height) : { x: 0, y: 0 };
  const hpS = hp ? scaled(hp, width, height) : { x: 0, y: 1 };
  const torsoPx = Math.hypot(shS.x - hpS.x, shS.y - hpS.y) || 1;
  const shW = sh ? worldOf(world, landmarkIndex("shoulder", dominant)) : null;
  const hpW = hp ? worldOf(world, landmarkIndex("hip", dominant)) : null;
  const torsoWorld = shW && hpW ? Math.hypot(shW.x - hpW.x, shW.y - hpW.y, (shW.z || 0) - (hpW.z || 0)) || 1 : 1;
  const ctx = { landmarks, world, width, height, torsoPx, torsoWorld };
  for (const name of Object.keys(specs || {})) {
    const spec = specs[name];
    const parts = usable(spec, ctx, minVis);
    if (!parts.length) {
      out[name] = { value: NaN, visibility: 0, at: -1, side: candidateSides(spec)[0], label: spec.label, type: spec.type };
      continue;
    }
    const weight = parts.reduce((s, r) => s + r.visibility, 0);
    const value = parts.reduce((s, r) => s + r.value * r.visibility, 0) / weight;
    const best = parts.slice().sort((a, b) => b.visibility - a.visibility)[0];
    out[name] = {
      value,
      visibility: best.visibility,
      at: best.at,
      side: parts.length > 1 ? SIDE.MEAN : best.side,
      label: best.label || spec.label,
      type: spec.type,
    };
  }
  return out;
}

function groupVisible(names, landmarks, min, dominant) {
  if (!names || !names.length) return true;
  const sided = names.some((n) => hasSides(n));
  const check = (side) => names.every((n) => inFrame(landmarks[landmarkIndex(n, hasSides(n) ? side : SIDE.LEFT)], min));
  if (!sided) return check(SIDE.LEFT);
  const order = dominant === SIDE.RIGHT ? [SIDE.RIGHT, SIDE.LEFT] : [SIDE.LEFT, SIDE.RIGHT];
  return order.some(check);
}

export function requiredVisible(requires, landmarks, dominant, minVisibility) {
  if (!landmarks) return false;
  const min = minVisibility === undefined ? DEFAULT_MIN_VISIBILITY : minVisibility;
  if (!requires) return true;
  if (Array.isArray(requires)) return groupVisible(requires, landmarks, min, dominant);
  if (Array.isArray(requires.any)) return requires.any.some((group) => groupVisible(group, landmarks, min, dominant));
  if (Array.isArray(requires.all)) return requires.all.every((group) => groupVisible(group, landmarks, min, dominant));
  return false;
}
