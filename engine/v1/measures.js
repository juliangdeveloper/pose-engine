import { SIDE, SIDE_JOINTS, landmarkIndex, hasSides } from "./landmarks.js";

export const MEASURE = Object.freeze({ ANGLE: "angle", INCLINE: "incline", OFFSET: "offset", LINE_OFFSET: "lineOffset" });
export const SPACE = Object.freeze({ WORLD: "world", IMAGE: "image" });

const RAD_TO_DEG = 180 / Math.PI;
const SIDE_SWITCH_MARGIN = 0.15;
const DEFAULT_MIN_VISIBILITY = 0.5;

function vis(p) {
  return p && p.visibility !== undefined ? p.visibility : 1;
}

function scaled(p, w, h) {
  return { x: p.x * w, y: p.y * h, z: (p.z || 0) * w };
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

function angle2d(a, b, c) {
  return angleAt({ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: c.x, y: c.y });
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

function sidesFor(spec, dominant) {
  const s = spec.side || SIDE.BEST;
  if (s === SIDE.MEAN) return [SIDE.LEFT, SIDE.RIGHT];
  if (s === SIDE.BEST) return [dominant];
  return [s];
}

function measureOne(spec, side, ctx) {
  const idx = spec.points.map((n) => landmarkIndex(n, side));
  const img = idx.map((i) => scaled(ctx.landmarks[i], ctx.width, ctx.height));
  const useWorld = (spec.space || SPACE.WORLD) === SPACE.WORLD && ctx.world;
  let value = NaN;
  if (spec.type === MEASURE.ANGLE) {
    value = useWorld ? angleAt(ctx.world[idx[0]], ctx.world[idx[1]], ctx.world[idx[2]]) : angle2d(img[0], img[1], img[2]);
  } else if (spec.type === MEASURE.INCLINE) {
    const dx = img[1].x - img[0].x;
    const dy = img[1].y - img[0].y;
    value = Math.atan2(Math.abs(dy), Math.abs(dx)) * RAD_TO_DEG;
  } else if (spec.type === MEASURE.OFFSET) {
    value = (img[1].y - img[0].y) / ctx.torsoPx;
  } else if (spec.type === MEASURE.LINE_OFFSET) {
    const [p, a, b] = img;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const dist = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
    const t = dx ? (p.x - a.x) / dx : 0;
    const yLine = a.y + dy * t;
    value = (yLine >= p.y ? 1 : -1) * dist / len;
  }
  const minVis = Math.min.apply(null, idx.map((i) => vis(ctx.landmarks[i])));
  const at = spec.type === MEASURE.ANGLE ? idx[1] : spec.type === MEASURE.LINE_OFFSET ? idx[0] : idx[0];
  return { value, visibility: minVis, at };
}

export function computeMeasures(specs, landmarks, world, width, height, dominant) {
  const out = {};
  if (!landmarks) return out;
  const sh = scaled(landmarks[landmarkIndex("shoulder", dominant)], width, height);
  const hp = scaled(landmarks[landmarkIndex("hip", dominant)], width, height);
  const torsoPx = Math.hypot(sh.x - hp.x, sh.y - hp.y) || 1;
  const ctx = { landmarks, world, width, height, torsoPx };
  for (const name of Object.keys(specs || {})) {
    const spec = specs[name];
    const sides = sidesFor(spec, dominant);
    const parts = sides.map((s) => measureOne(spec, s, ctx)).filter((r) => isFinite(r.value));
    if (!parts.length) {
      out[name] = { value: NaN, visibility: 0, at: -1, side: sides[0] };
      continue;
    }
    const value = parts.reduce((s, r) => s + r.value, 0) / parts.length;
    const visibility = Math.min.apply(null, parts.map((r) => r.visibility));
    out[name] = { value, visibility, at: parts[0].at, side: sides.length > 1 ? SIDE.MEAN : sides[0], type: spec.type };
  }
  return out;
}

export function requiredVisible(names, landmarks, dominant, minVisibility) {
  if (!landmarks) return false;
  const min = minVisibility === undefined ? DEFAULT_MIN_VISIBILITY : minVisibility;
  return (names || []).every((n) => {
    const p = landmarks[landmarkIndex(n, hasSides(n) ? dominant : SIDE.LEFT)];
    return p && vis(p) >= min && p.x > -0.05 && p.x < 1.05 && p.y > -0.05 && p.y < 1.05;
  });
}
