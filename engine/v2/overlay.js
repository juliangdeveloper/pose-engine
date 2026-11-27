import { LANDMARK } from "./landmarks.js";
import { PREVIEW_JOINTS, LIMB_SEGMENTS, SEGMENT, HAND_BONES } from "./features.js";

const RAD_TO_DEG = 180 / Math.PI;
const EPS = 1e-6;
const TAU = Math.PI * 2;
const HUNDRED = 100;
const ZERO3 = 0;

export const OVERLAY_DEFAULTS = Object.freeze({
  arcRadiusPx: 16,
  arcWidthPx: 2,
  fontPx: 11,
  labelOffsetPx: 10,
  textOutlinePx: 3,
  baseWidthPx: 4,
  maxBonePx: 10,
  jointRadiusPx: 4,
  maxAngVel: 360,
  alphaBase: 0.55,
  alphaGain: 0.45,
  matchTolDeg: 30,
  depthBasePx: 4,
  depthGrowPx: 10,
  matchJointPx: 6,
  pctFontPx: 13,
  pctPadPx: 12,
  minVisibility: 0.4,
});

export const DETAIL_JOINTS = Object.freeze([
  Object.freeze({ joint: "left_elbow", a: "left_shoulder", b: "left_elbow", c: "left_wrist" }),
  Object.freeze({ joint: "right_elbow", a: "right_shoulder", b: "right_elbow", c: "right_wrist" }),
  Object.freeze({ joint: "left_knee", a: "left_hip", b: "left_knee", c: "left_ankle" }),
  Object.freeze({ joint: "right_knee", a: "right_hip", b: "right_knee", c: "right_ankle" }),
  Object.freeze({ joint: "left_shoulder", a: "left_hip", b: "left_shoulder", c: "left_elbow" }),
  Object.freeze({ joint: "right_shoulder", a: "right_hip", b: "right_shoulder", c: "right_elbow" }),
  Object.freeze({ joint: "left_hip", a: "left_shoulder", b: "left_hip", c: "left_knee" }),
  Object.freeze({ joint: "right_hip", a: "right_shoulder", b: "right_hip", c: "right_knee" }),
]);

const ARM_SEGMENTS = Object.freeze([
  Object.freeze({ segment: SEGMENT.LEFT_UPPER_ARM, a: "left_shoulder", b: "left_elbow" }),
  Object.freeze({ segment: SEGMENT.LEFT_FOREARM, a: "left_elbow", b: "left_wrist" }),
  Object.freeze({ segment: SEGMENT.RIGHT_UPPER_ARM, a: "right_shoulder", b: "right_elbow" }),
  Object.freeze({ segment: SEGMENT.RIGHT_FOREARM, a: "right_elbow", b: "right_wrist" }),
]);

const NAME_BY_LANDMARK = new Map();
Object.keys(LANDMARK).forEach((name) => {
  NAME_BY_LANDMARK.set(LANDMARK[name], name);
});

const SEGMENT_BY_CONNECTION = new Map();
LIMB_SEGMENTS.forEach(([name, a, b]) => {
  const na = NAME_BY_LANDMARK.get(a);
  const nb = NAME_BY_LANDMARK.get(b);
  if (!na || !nb) return;
  const key = na < nb ? na + "-" + nb : nb + "-" + na;
  SEGMENT_BY_CONNECTION.set(key, name);
});

function connectionName(endpoint) {
  if (typeof endpoint === "string") return endpoint;
  if (typeof endpoint === "number") return NAME_BY_LANDMARK.get(endpoint) || null;
  return null;
}

function finitePoint(p) {
  return !!p && isFinite(p.x) && isFinite(p.y);
}

function withZ(p) {
  return p && typeof p.z === "number" && isFinite(p.z);
}

function clamp01(v) {
  return v < ZERO3 ? ZERO3 : v > 1 ? 1 : v;
}

function angleOfVectors(ux, uy, uz, vx, vy, vz) {
  const mu = Math.hypot(ux, uy, uz);
  const mv = Math.hypot(vx, vy, vz);
  if (!(mu > EPS) || !(mv > EPS)) return null;
  const d = (ux * vx + uy * vy + uz * vz) / (mu * mv);
  return Math.acos(Math.min(1, Math.max(-1, d))) * RAD_TO_DEG;
}

export function angleAt(a, b, c) {
  if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c)) return null;
  if (withZ(a) && withZ(b) && withZ(c)) {
    return angleOfVectors(a.x - b.x, a.y - b.y, (a.z || ZERO3) - (b.z || ZERO3), c.x - b.x, c.y - b.y, (c.z || ZERO3) - (b.z || ZERO3));
  }
  return angleOfVectors(a.x - b.x, a.y - b.y, ZERO3, c.x - b.x, c.y - b.y, ZERO3);
}

function visibilityOf(p) {
  return p && typeof p.visibility === "number" ? p.visibility : 1;
}

function xy(p) {
  return { x: p.x, y: p.y };
}

function pointOf(pt) {
  if (!pt) return null;
  if (Array.isArray(pt)) {
    if (pt.length < 2 || !isFinite(pt[0]) || !isFinite(pt[1])) return null;
    return { x: pt[0], y: pt[1] };
  }
  if (finitePoint(pt)) return xy(pt);
  return null;
}

export function jointAngles(landmarks, options) {
  if (!landmarks) return [];
  const minVis = options && typeof options.minVisibility === "number" ? options.minVisibility : null;
  const out = [];
  DETAIL_JOINTS.forEach((triple) => {
    const pa = landmarks[LANDMARK[triple.a]];
    const pb = landmarks[LANDMARK[triple.b]];
    const pc = landmarks[LANDMARK[triple.c]];
    const angleDeg = angleAt(pa, pb, pc);
    if (angleDeg === null) return;
    const vis = Math.min(visibilityOf(pa), visibilityOf(pb), visibilityOf(pc));
    if (minVis !== null && vis < minVis) return;
    out.push({
      joint: triple.joint,
      a: triple.a,
      b: triple.b,
      c: triple.c,
      angleDeg,
      vis,
      pa: xy(pa),
      pb: xy(pb),
      pc: xy(pc),
      vertex: xy(pb),
    });
  });
  return out;
}

export function targetJointAngles(pts) {
  const out = {};
  if (!pts || !pts.length) return out;
  DETAIL_JOINTS.forEach((triple) => {
    const ia = PREVIEW_JOINTS.indexOf(triple.a);
    const ib = PREVIEW_JOINTS.indexOf(triple.b);
    const ic = PREVIEW_JOINTS.indexOf(triple.c);
    const angleDeg = angleAt(pointOf(pts[ia]), pointOf(pts[ib]), pointOf(pts[ic]));
    if (angleDeg === null) return;
    out[triple.joint] = angleDeg;
  });
  return out;
}

export function angleWithin(currentDeg, targetDeg, tolDeg) {
  if (typeof currentDeg !== "number" || !isFinite(currentDeg)) return null;
  if (typeof targetDeg !== "number" || !isFinite(targetDeg)) return null;
  const tol = typeof tolDeg === "number" && isFinite(tolDeg) ? tolDeg : OVERLAY_DEFAULTS.matchTolDeg;
  return Math.abs(currentDeg - targetDeg) <= tol;
}

export function drawAngleArcs(ctx, angles, px, options) {
  const o = Object.assign({}, OVERLAY_DEFAULTS, options);
  if (!ctx || !angles || !px) return;
  ctx.save();
  ctx.lineCap = "round";
  angles.forEach((item) => {
    if (!item || typeof item.angleDeg !== "number" || !finitePoint(item.pa) || !finitePoint(item.pb) || !finitePoint(item.pc)) return;
    const A = px(item.pa);
    const B = px(item.pb);
    const C = px(item.pc);
    if (!finitePoint(A) || !finitePoint(B) || !finitePoint(C)) return;
    const start = Math.atan2(A.y - B.y, A.x - B.x);
    const end = Math.atan2(C.y - B.y, C.x - B.x);
    let diff = end - start;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    const color = o.colorFor ? o.colorFor(item) : o.color || "#ffffff";
    ctx.strokeStyle = color;
    ctx.lineWidth = o.arcWidthPx;
    ctx.beginPath();
    ctx.arc(B.x, B.y, o.arcRadiusPx, start, start + diff, diff < ZERO3);
    ctx.stroke();
    const mid = start + diff / 2;
    const lx = B.x + Math.cos(mid) * (o.arcRadiusPx + o.labelOffsetPx);
    const ly = B.y + Math.sin(mid) * (o.arcRadiusPx + o.labelOffsetPx);
    const value = Math.round(item.angleDeg) + "°";
    ctx.font = o.fontPx + "px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = o.textOutlinePx;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(value, lx, ly);
    ctx.fillStyle = color;
    ctx.fillText(value, lx, ly);
  });
  ctx.restore();
}

export function segmentForConnection(a, b) {
  const na = connectionName(a);
  const nb = connectionName(b);
  if (!na || !nb) return null;
  const key = na < nb ? na + "-" + nb : nb + "-" + na;
  return SEGMENT_BY_CONNECTION.get(key) || null;
}

export function segmentSpeeds(motion) {
  const out = {};
  if (!motion || !motion.segments) return out;
  Object.keys(motion.segments).forEach((name) => {
    const s = motion.segments[name];
    const v = s && s.angVel;
    out[name] = typeof v === "number" && isFinite(v) ? Math.abs(v) : ZERO3;
  });
  return out;
}

export function speedStyle(angVel, options) {
  const o = Object.assign({}, OVERLAY_DEFAULTS, options);
  const speed = typeof angVel === "number" && isFinite(angVel) ? clamp01(Math.abs(angVel) / o.maxAngVel) : ZERO3;
  return {
    widthPx: o.baseWidthPx + (o.maxBonePx - o.baseWidthPx) * speed,
    alpha: o.alphaBase + o.alphaGain * speed,
  };
}

export function velocityStyles(connections, motion, options) {
  const speeds = segmentSpeeds(motion);
  return (connections || []).map(([a, b]) => {
    const segment = segmentForConnection(a, b);
    const style = speedStyle(segment ? speeds[segment] || ZERO3 : ZERO3, options);
    return { a, b, segment, widthPx: style.widthPx, alpha: style.alpha };
  });
}

export function drawVelocitySkeleton(ctx, landmarks, connections, motion, px, options) {
  const o = Object.assign({}, OVERLAY_DEFAULTS, options);
  if (!ctx || !landmarks || !px) return;
  ctx.save();
  ctx.lineCap = "round";
  velocityStyles(connections, motion, options).forEach((style) => {
    const pa = landmarks[style.a];
    const pb = landmarks[style.b];
    if (!finitePoint(pa) || !finitePoint(pb)) return;
    const A = px(pa);
    const B = px(pb);
    if (!finitePoint(A) || !finitePoint(B)) return;
    const fade = o.fadeOf ? Math.min(o.fadeOf(pa), o.fadeOf(pb)) : 1;
    ctx.globalAlpha = fade * style.alpha;
    ctx.strokeStyle = o.colorForConnection ? o.colorForConnection(style.a, style.b, style.segment) : o.color || "#ffffff";
    ctx.lineWidth = style.widthPx;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  });
  ctx.fillStyle = o.jointColor || "#ffffff";
  landmarks.forEach((p) => {
    if (!finitePoint(p)) return;
    const P = px(p);
    if (!finitePoint(P)) return;
    ctx.globalAlpha = o.fadeOf ? o.fadeOf(p) : 1;
    ctx.beginPath();
    ctx.arc(P.x, P.y, o.jointRadiusPx, ZERO3, TAU);
    ctx.fill();
  });
  ctx.restore();
}

export function drawHandSkeleton(ctx, landmarks, px, options) {
  const o = Object.assign({}, OVERLAY_DEFAULTS, options);
  if (!ctx || !landmarks || !px) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  HAND_BONES.forEach(([a, b]) => {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (!finitePoint(pa) || !finitePoint(pb)) return;
    const A = px(pa);
    const B = px(pb);
    if (!finitePoint(A) || !finitePoint(B)) return;
    ctx.globalAlpha = o.fadeOf ? Math.min(o.fadeOf(pa), o.fadeOf(pb)) : 1;
    ctx.strokeStyle = o.handColor || "#ff9f43";
    ctx.lineWidth = o.handWidthPx || 3;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  });
  ctx.fillStyle = o.handJointColor || "#ff9f43";
  landmarks.forEach((p) => {
    if (!finitePoint(p)) return;
    const P = px(p);
    if (!finitePoint(P)) return;
    ctx.globalAlpha = o.fadeOf ? o.fadeOf(p) : 1;
    ctx.beginPath();
    ctx.arc(P.x, P.y, o.handJointPx || 3, ZERO3, TAU);
    ctx.fill();
  });
  ctx.restore();
}

export function depthIndicators(worldLandmarks, options) {
  const out = [];
  if (!worldLandmarks) return out;
  ARM_SEGMENTS.forEach((arm) => {
    const pa = worldLandmarks[LANDMARK[arm.a]];
    const pb = worldLandmarks[LANDMARK[arm.b]];
    if (!finitePoint(pa) || !finitePoint(pb)) return;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const dz = (pb.z || ZERO3) - (pa.z || ZERO3);
    const len = Math.hypot(dx, dy, dz);
    if (!(len > EPS)) return;
    const zToward = clamp01(-dz / len);
    const foreshort = clamp01(1 - Math.hypot(dx, dy) / len);
    out.push({
      segment: arm.segment,
      a: arm.a,
      b: arm.b,
      toward: Math.max(zToward, foreshort),
      dz,
      length: len,
      point: xy(pb),
      from: xy(pa),
    });
  });
  return out;
}

export function drawDepthIndicators(ctx, indicators, px, options) {
  const o = Object.assign({}, OVERLAY_DEFAULTS, options);
  if (!ctx || !indicators || !px) return;
  ctx.save();
  ctx.lineCap = "round";
  indicators.forEach((ind) => {
    if (!ind || !finitePoint(ind.point) || !finitePoint(ind.from)) return;
    const P = px(ind.point);
    const F = px(ind.from);
    if (!finitePoint(P) || !finitePoint(F)) return;
    const radius = o.depthBasePx + ind.toward * o.depthGrowPx;
    const alpha = o.alphaBase + o.alphaGain * ind.toward;
    const color = o.depthColor || "#5aa9ff";
    const dx = P.x - F.x;
    const dy = P.y - F.y;
    const len = Math.hypot(dx, dy);
    const arrowLen = radius * (1 + ind.toward * 2);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = o.arcWidthPx;
    if (len > EPS) {
      ctx.beginPath();
      ctx.moveTo(P.x, P.y);
      ctx.lineTo(P.x + (dx / len) * arrowLen, P.y + (dy / len) * arrowLen);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(P.x, P.y, radius, ZERO3, TAU);
    ctx.fill();
  });
  ctx.restore();
}

function coincidenceResult(joints) {
  const total = joints.length;
  const matched = joints.filter((j) => j.ok).length;
  return { joints, matched, total, percent: total ? (matched / total) * HUNDRED : null };
}

export function coincidenceFromMapped(mapped, landmarks, px, tolPx, options) {
  const o = Object.assign({}, OVERLAY_DEFAULTS, options);
  if (!mapped || !landmarks || !px) return { joints: [], matched: ZERO3, total: ZERO3, percent: null };
  const joints = [];
  mapped.forEach((g, i) => {
    if (!g || !finitePoint(g)) return;
    const name = PREVIEW_JOINTS[i];
    const player = landmarks[LANDMARK[name]];
    if (!finitePoint(player) || visibilityOf(player) < o.minVisibility) return;
    const P = px(player);
    const G = px(g);
    if (!finitePoint(P) || !finitePoint(G)) return;
    joints.push({ name, index: i, ok: Math.hypot(P.x - G.x, P.y - G.y) <= tolPx });
  });
  return coincidenceResult(joints);
}

export function coincidenceFromBad(mapped, bad) {
  const joints = [];
  (mapped || []).forEach((g, i) => {
    if (!g || !finitePoint(g)) return;
    joints.push({ name: PREVIEW_JOINTS[i], index: i, ok: !(bad && bad[i]) });
  });
  return coincidenceResult(joints);
}

export function drawMatchJoints(ctx, mapped, landmarks, bad, px, options) {
  const o = Object.assign({}, OVERLAY_DEFAULTS, options);
  if (!ctx || !mapped || !landmarks || !px) return;
  ctx.save();
  mapped.forEach((g, i) => {
    if (!g || !finitePoint(g)) return;
    const name = PREVIEW_JOINTS[i];
    const player = landmarks[LANDMARK[name]];
    if (!finitePoint(player) || visibilityOf(player) < o.minVisibility) return;
    const P = px(player);
    if (!finitePoint(P)) return;
    ctx.globalAlpha = o.fadeOf ? o.fadeOf(player) : 1;
    ctx.fillStyle = bad && bad[i] ? o.badColor || "#ff6b6b" : o.okColor || "#3ddc97";
    ctx.beginPath();
    ctx.arc(P.x, P.y, o.matchJointPx, ZERO3, TAU);
    ctx.fill();
  });
  ctx.restore();
}

export function drawMatchPercent(ctx, percent, options) {
  const o = Object.assign({}, OVERLAY_DEFAULTS, options);
  if (!ctx || typeof percent !== "number" || !isFinite(percent)) return;
  const value = Math.round(percent) + "%";
  ctx.save();
  ctx.font = o.pctFontPx + "px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.lineWidth = o.textOutlinePx;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.strokeText(value, o.pctPadPx, o.pctPadPx);
  ctx.fillStyle = o.pctColor || "#ffffff";
  ctx.fillText(value, o.pctPadPx, o.pctPadPx);
  ctx.restore();
}

export function buildDetail(frame, targetPts) {
  return {
    angles: jointAngles(frame && frame.landmarks),
    targetAngles: targetJointAngles(targetPts),
    speeds: segmentSpeeds(frame && frame.motion),
    depths: depthIndicators(frame && frame.worldLandmarks),
  };
}
