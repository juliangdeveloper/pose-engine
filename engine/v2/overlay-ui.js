import { CONNECTIONS, LANDMARK } from "./landmarks.js";
import { PREVIEW_JOINTS, HAND_BONES } from "./features.js";
import { jointAngles, targetJointAngles, angleWithin, drawAngleArcs, drawVelocitySkeleton, drawHandSkeleton, depthIndicators, drawDepthIndicators, coincidenceFromBad, drawMatchJoints, drawMatchPercent } from "./overlay.js";
import { drawSilhouette } from "./background.js";

export const OVERLAY_UI_DEFAULTS = Object.freeze({ style: "shadow" });
const JOINT_RADIUS_PX = 4;
const BONE_WIDTH_PX = 4;
const MIN_JOINT_VISIBILITY = 0.4;
const MAX_DPR = 2;
const GUIDE_BONE_PX = 5;
const GUIDE_JOINT_PX = 3.5;
const GUIDE_VISIBILITY = 0.5;
const GUIDE_H_TOL = 0.55;
const GUIDE_V_TOL = 0.45;
const GUIDE_ALPHA = 0.42;
const GHOST_BONE_PX = 3;
const GHOST_JOINT_PX = 3;
const GHOST_TOL_RATIO = 0.09;
const GHOST_ALPHA = 0.75;
const GHOST_MARGIN = 1.15;
const FADE_FLOOR = 0.18;
const OUTSIDE_FADE = 0.4;
const FRAME_MIN_HEIGHT = 0.45;
const FRAME_MAX_HEIGHT = 0.88;
const FRAME_PAD = 0.02;
const LUM_SIZE = 16;
const LUM_DARK = 34;
const LUM_CENTER_MAX = 72;
const LUM_CONTRAST = 42;
const LUM_SAMPLE_MS = 600;
const HALF = 2;
const DASH_ON_PX = 8;
const DASH_OFF_PX = 5;
const LEFT_PREFIX = "left_";
const DETAIL_ARC_PX = 16;
const DETAIL_FONT_PX = 11;
const DETAIL_MAX_BONE_PX = 10;
const DETAIL_MAX_SPEED = 360;
const DETAIL_TOL_DEG = 30;
const DETAIL_DEPTH_BASE_PX = 4;
const DETAIL_DEPTH_GROW_PX = 10;
const DETAIL_MATCH_PX = 6;
const DETAIL_PCT_PX = 13;
const DETAIL_PCT_PAD_PX = 12;
const SHADOW_ALPHA = 0.55;
const TAU = Math.PI * 2;
const HEAD_RADIUS_RATIO = 0.06;

export const T_GUIDE = Object.freeze({
  nose: [0.5, 0.09],
  left_shoulder: [0.4, 0.21],
  right_shoulder: [0.6, 0.21],
  left_elbow: [0.23, 0.21],
  right_elbow: [0.77, 0.21],
  left_wrist: [0.07, 0.21],
  right_wrist: [0.93, 0.21],
  left_hip: [0.43, 0.48],
  right_hip: [0.57, 0.48],
  left_knee: [0.43, 0.7],
  right_knee: [0.57, 0.7],
  left_ankle: [0.42, 0.92],
  right_ankle: [0.58, 0.92],
});

export const OVERLAY_COLOR = Object.freeze({
  bone: "rgba(255,255,255,0.85)",
  boneLeft: "#3ddc97",
  boneRight: "#5aa9ff",
  hand: "#ff9f43",
  joint: "#ffffff",
  guideWait: "rgba(255,255,255,0.42)",
  guideOk: "#3ddc97",
  guideBad: "#ffb547",
  ghost: "#5aa9ff",
  ghostBad: "#ff6b6b",
  shadow: "rgba(0,0,0," + SHADOW_ALPHA + ")",
});

export const OVERLAY_TEXT = Object.freeze({
  tooFar: "Al\u00e9jate un paso",
  tooNear: "Ac\u00e9rcate",
  outFrame: "Entra en el cuadro",
  dark: "Poca luz",
  backlight: "Contraluz",
});

export const GUIDE_BONES = Object.freeze([
  ["left_shoulder", "right_shoulder", "h"], ["left_shoulder", "left_hip", "v"], ["right_shoulder", "right_hip", "v"],
  ["left_shoulder", "left_elbow", "h"], ["left_elbow", "left_wrist", "h"],
  ["right_shoulder", "right_elbow", "h"], ["right_elbow", "right_wrist", "h"],
  ["left_hip", "left_knee", "v"], ["left_knee", "left_ankle", "v"],
  ["right_hip", "right_knee", "v"], ["right_knee", "right_ankle", "v"],
]);

export const GHOST_BONES = Object.freeze([
  ["left_shoulder", "right_shoulder"], ["left_hip", "right_hip"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
].map(([a, b]) => [PREVIEW_JOINTS.indexOf(a), PREVIEW_JOINTS.indexOf(b)]));

const LUM_WEIGHT = Object.freeze([0.2126, 0.7152, 0.0722]);
const LUM_CENTER = Object.freeze({ lo: 0.25, hi: 0.75 });

export function visibilityOf(p) {
  return p && typeof p.visibility === "number" ? p.visibility : 1;
}

export function pointInFrame(p) {
  if (!p || !isFinite(p.x) || !isFinite(p.y)) return false;
  return p.x >= -FRAME_PAD && p.x <= 1 + FRAME_PAD && p.y >= -FRAME_PAD && p.y <= 1 + FRAME_PAD;
}

export function fadeOf(p) {
  let a = Math.min(1, Math.max(0, visibilityOf(p)));
  if (!pointInFrame(p)) a *= OUTSIDE_FADE;
  return Math.max(FADE_FLOOR, a);
}

export function bodyHeight(lm) {
  if (!lm) return 0;
  const nose = lm[LANDMARK.nose];
  const ankleL = lm[LANDMARK.left_ankle];
  const ankleR = lm[LANDMARK.right_ankle];
  const top = nose && visibilityOf(nose) >= MIN_JOINT_VISIBILITY ? nose.y : null;
  if (top === null) return 0;
  const bottoms = [];
  if (ankleL && visibilityOf(ankleL) >= MIN_JOINT_VISIBILITY) bottoms.push(ankleL.y);
  if (ankleR && visibilityOf(ankleR) >= MIN_JOINT_VISIBILITY) bottoms.push(ankleR.y);
  if (!bottoms.length) {
    ["left_hip", "right_hip"].forEach((n) => {
      const p = lm[LANDMARK[n]];
      if (p && visibilityOf(p) >= MIN_JOINT_VISIBILITY) bottoms.push(p.y);
    });
  }
  if (!bottoms.length) return 0;
  return Math.abs(Math.max.apply(null, bottoms) - top);
}

export function feetVisible(lm) {
  if (!lm) return false;
  return ["left_ankle", "right_ankle", "left_heel", "right_heel"].every((n) => {
    const p = lm[LANDMARK[n]];
    return p && visibilityOf(p) >= MIN_JOINT_VISIBILITY && pointInFrame(p);
  });
}

export function segmentCovered(lm, aName, bName, orient) {
  const a = lm[LANDMARK[aName]];
  const b = lm[LANDMARK[bName]];
  if (!a || !b) return false;
  if (visibilityOf(a) < GUIDE_VISIBILITY || visibilityOf(b) < GUIDE_VISIBILITY) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !isFinite(len)) return false;
  if (orient === "h") return Math.abs(dy) / len <= GUIDE_H_TOL;
  return Math.abs(dx) / len <= GUIDE_V_TOL;
}

export function ghostMapped(pts, lm, mirrored) {
  if (!pts || pts.length !== PREVIEW_JOINTS.length) return null;
  const seen = [];
  for (let i = 0; i < pts.length; i++) {
    if (pts[i]) seen.push(pts[i]);
  }
  if (!seen.length) return null;
  let gx0 = Infinity;
  let gy0 = Infinity;
  let gx1 = -Infinity;
  let gy1 = -Infinity;
  seen.forEach((q) => {
    if (q[0] < gx0) gx0 = q[0];
    if (q[0] > gx1) gx1 = q[0];
    if (q[1] < gy0) gy0 = q[1];
    if (q[1] > gy1) gy1 = q[1];
  });
  const gw = Math.max(gx1 - gx0, 0.01);
  const gh = Math.max(gy1 - gy0, 0.01);
  let px0 = null;
  let py0 = null;
  let px1 = null;
  let py1 = null;
  if (lm) {
    lm.forEach((p) => {
      if (!p || visibilityOf(p) < MIN_JOINT_VISIBILITY || !isFinite(p.x) || !isFinite(p.y)) return;
      const x = mirrored ? 1 - p.x : p.x;
      if (px0 === null || x < px0) px0 = x;
      if (px1 === null || x > px1) px1 = x;
      if (py0 === null || p.y < py0) py0 = p.y;
      if (py1 === null || p.y > py1) py1 = p.y;
    });
  }
  const useBody = px0 !== null && px1 > px0 && py1 > py0;
  const bw = useBody ? (px1 - px0) * GHOST_MARGIN : gw;
  const bh = useBody ? (py1 - py0) * GHOST_MARGIN : gh;
  const bcx = useBody ? (px0 + px1) / HALF : 0.5;
  const bcy = useBody ? (py0 + py1) / HALF : 0.5;
  const gcx = (gx0 + gx1) / HALF;
  const gcy = (gy0 + gy1) / HALF;
  return pts.map((q) => {
    if (!q) return null;
    const nx = bcx + ((q[0] - gcx) * bw) / gw;
    const ny = bcy + ((q[1] - gcy) * bh) / gh;
    return { x: mirrored ? 1 - nx : nx, y: ny };
  });
}

export function createPoseOverlay(options) {
  const o = Object.assign({}, OVERLAY_UI_DEFAULTS, options || {});
  const style = o.style === "line" ? "line" : "shadow";
  const texts = Object.assign({}, OVERLAY_TEXT, o.texts || {});
  const ctx = o.canvas ? o.canvas.getContext("2d") : null;
  const leftJoints = new Set();
  Object.keys(LANDMARK).forEach((k) => { if (k.indexOf(LEFT_PREFIX) === 0) leftJoints.add(LANDMARK[k]); });
  let lumTimer = 0;
  let lumMean = null;
  let lumCenter = null;
  let lumBorder = null;
  const lumCanvas = document.createElement("canvas");
  lumCanvas.width = LUM_SIZE;
  lumCanvas.height = LUM_SIZE;
  const lumCtx = lumCanvas.getContext("2d", { willReadFrequently: true });
  let destroyed = false;

  function stageBox() {
    const el = o.stage || o.canvas;
    const w = el && el.clientWidth ? el.clientWidth : (o.canvas ? o.canvas.clientWidth : 0);
    const h = el && el.clientHeight ? el.clientHeight : (o.canvas ? o.canvas.clientHeight : 0);
    return { w: Math.max(w, 1), h: Math.max(h, 1) };
  }

  function fit(frame) {
    const size = stageBox();
    const w = size.w;
    const h = size.h;
    if (!frame || !frame.width || !frame.height) return { x: 0, y: 0, w, h };
    const s = Math.min(w / frame.width, h / frame.height);
    const dw = frame.width * s;
    const dh = frame.height * s;
    return { x: (w - dw) / HALF, y: (h - dh) / HALF, w: dw, h: dh };
  }

  function sampleLight() {
    const now = performance.now();
    if (now - lumTimer < LUM_SAMPLE_MS) return;
    lumTimer = now;
    try {
      const video = o.video;
      if (!video || video.readyState < HALF || !video.videoWidth || !video.videoHeight) return;
      lumCtx.drawImage(video, 0, 0, LUM_SIZE, LUM_SIZE);
      const data = lumCtx.getImageData(0, 0, LUM_SIZE, LUM_SIZE).data;
      let sum = 0;
      let cSum = 0;
      let cN = 0;
      let bSum = 0;
      let bN = 0;
      const lo = Math.round(LUM_CENTER.lo * LUM_SIZE);
      const hi = Math.round(LUM_CENTER.hi * LUM_SIZE);
      for (let y = 0; y < LUM_SIZE; y++) {
        for (let x = 0; x < LUM_SIZE; x++) {
          const i = (y * LUM_SIZE + x) * 4;
          const v = data[i] * LUM_WEIGHT[0] + data[i + 1] * LUM_WEIGHT[1] + data[i + 2] * LUM_WEIGHT[2];
          sum += v;
          if (x >= lo && x < hi && y >= lo && y < hi) {
            cSum += v;
            cN++;
          } else {
            bSum += v;
            bN++;
          }
        }
      }
      const total = LUM_SIZE * LUM_SIZE;
      lumMean = sum / total;
      lumCenter = cN ? cSum / cN : lumMean;
      lumBorder = bN ? bSum / bN : lumMean;
    } catch (e) {
      return;
    }
  }

  function framingAlert(frame, running) {
    if (!running || !frame || !frame.landmarks) return "";
    const lm = frame.landmarks;
    const up = ["left_shoulder", "right_shoulder"].every((n) => {
      const p = lm[LANDMARK[n]];
      return p && visibilityOf(p) >= MIN_JOINT_VISIBILITY;
    });
    const low = ["left_hip", "right_hip"].some((n) => {
      const p = lm[LANDMARK[n]];
      return p && visibilityOf(p) >= MIN_JOINT_VISIBILITY;
    });
    if (up && !low) return "";
    const h = bodyHeight(lm);
    if (!h) return texts.outFrame;
    if (h > FRAME_MAX_HEIGHT) return texts.tooFar;
    if (h < FRAME_MIN_HEIGHT) return texts.tooNear;
    return "";
  }

  function lightAlert(frame, running) {
    if (!running) return "";
    if (frame && frame.features) return "";
    if (lumMean === null || lumCenter === null || lumBorder === null) return "";
    if (lumMean < LUM_DARK) return texts.dark;
    if (lumCenter < LUM_CENTER_MAX && lumBorder - lumCenter > LUM_CONTRAST) return texts.backlight;
    return "";
  }

  function stageAlert(frame, running) {
    return lightAlert(frame, running) || framingAlert(frame, running) || "";
  }

  function boneColor(a, b) {
    return leftJoints.has(a) && leftJoints.has(b) ? OVERLAY_COLOR.boneLeft : leftJoints.has(a) || leftJoints.has(b) ? OVERLAY_COLOR.bone : OVERLAY_COLOR.boneRight;
  }

  function drawSkeletonDetail(frame, lm, px) {
    drawVelocitySkeleton(ctx, lm, CONNECTIONS, frame.motion, px, {
      baseWidthPx: BONE_WIDTH_PX,
      maxBonePx: DETAIL_MAX_BONE_PX,
      maxAngVel: DETAIL_MAX_SPEED,
      jointRadiusPx: JOINT_RADIUS_PX,
      jointColor: OVERLAY_COLOR.joint,
      colorForConnection: (a, b) => boneColor(a, b),
      fadeOf: (p) => fadeOf(p),
    });
  }

  function drawDetail(frame, px, target) {
    const angles = jointAngles(frame.landmarks, { minVisibility: MIN_JOINT_VISIBILITY });
    const targetAngles = target && target.mapped ? targetJointAngles(target.mapped) : {};
    drawAngleArcs(ctx, angles, px, {
      arcRadiusPx: DETAIL_ARC_PX,
      fontPx: DETAIL_FONT_PX,
      colorFor: (item) => {
        const ok = angleWithin(item.angleDeg, targetAngles[item.joint], DETAIL_TOL_DEG);
        return ok === null ? OVERLAY_COLOR.joint : ok ? OVERLAY_COLOR.guideOk : OVERLAY_COLOR.ghostBad;
      },
    });
    drawDepthIndicators(ctx, depthIndicators(frame.worldLandmarks), px, {
      depthBasePx: DETAIL_DEPTH_BASE_PX,
      depthGrowPx: DETAIL_DEPTH_GROW_PX,
      depthColor: OVERLAY_COLOR.ghost,
    });
    if (target && target.mapped && target.bad) {
      const coincidence = coincidenceFromBad(target.mapped, target.bad);
      drawMatchJoints(ctx, target.mapped, frame.landmarks, target.bad, px, {
        matchJointPx: DETAIL_MATCH_PX,
        minVisibility: MIN_JOINT_VISIBILITY,
        okColor: OVERLAY_COLOR.guideOk,
        badColor: OVERLAY_COLOR.ghostBad,
        fadeOf: (p) => fadeOf(p),
      });
      drawMatchPercent(ctx, coincidence.percent, {
        pctFontPx: DETAIL_PCT_PX,
        pctPadPx: DETAIL_PCT_PAD_PX,
        pctColor: OVERLAY_COLOR.joint,
      });
    }
  }

  function drawHand(hlm, px) {
    drawHandSkeleton(ctx, hlm, px, {
      handColor: OVERLAY_COLOR.hand,
      handJointColor: OVERLAY_COLOR.hand,
      handWidthPx: 3,
      handJointPx: 3,
    });
  }

  function drawSkeleton(lm, box, px) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = BONE_WIDTH_PX;
    for (const [a, b] of CONNECTIONS) {
      const pa = lm[a];
      const pb = lm[b];
      if (!pa || !pb) continue;
      const A = px(pa);
      const B = px(pb);
      ctx.globalAlpha = Math.min(fadeOf(pa), fadeOf(pb));
      ctx.strokeStyle = boneColor(a, b);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }
    ctx.fillStyle = OVERLAY_COLOR.joint;
    lm.forEach((p) => {
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
      const P = px(p);
      ctx.globalAlpha = fadeOf(p);
      ctx.beginPath();
      ctx.arc(P.x, P.y, JOINT_RADIUS_PX, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawShadow(frame, box) {
    const silhouette = frame && frame.silhouette;
    if (!silhouette || !silhouette.data) return;
    drawSilhouette(ctx, silhouette, box, {});
  }

  function drawGuideLine(frame, box, mirrored) {
    const lm = frame.landmarks;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = GUIDE_BONE_PX;
    GUIDE_BONES.forEach(([aName, bName, orient]) => {
      const ta = T_GUIDE[aName];
      const tb = T_GUIDE[bName];
      if (!ta || !tb) return;
      const A = { x: box.x + (mirrored ? 1 - ta[0] : ta[0]) * box.w, y: box.y + ta[1] * box.h };
      const B = { x: box.x + (mirrored ? 1 - tb[0] : tb[0]) * box.w, y: box.y + tb[1] * box.h };
      const ok = segmentCovered(lm, aName, bName, orient);
      ctx.globalAlpha = GUIDE_ALPHA;
      ctx.strokeStyle = ok ? OVERLAY_COLOR.guideOk : OVERLAY_COLOR.guideWait;
      if (ok) ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    });
    ctx.fillStyle = OVERLAY_COLOR.joint;
    Object.keys(T_GUIDE).forEach((name) => {
      const t = T_GUIDE[name];
      const P = { x: box.x + (mirrored ? 1 - t[0] : t[0]) * box.w, y: box.y + t[1] * box.h };
      ctx.globalAlpha = GUIDE_ALPHA;
      ctx.beginPath();
      ctx.arc(P.x, P.y, GUIDE_JOINT_PX, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawGhostLine(frame, box, px) {
    const id = o.getTargetPoseId ? o.getTargetPoseId(frame) : null;
    if (!id) return null;
    const pose = o.getPoseById ? o.getPoseById(id) : null;
    if (!pose) return null;
    const mapped = ghostMapped(pose.pts, frame.landmarks, frame.mirrored);
    if (!mapped) return null;
    const h = Math.max(box.h, 1);
    const tol = GHOST_TOL_RATIO * h;
    const bad = new Array(mapped.length).fill(false);
    mapped.forEach((g, i) => {
      if (!g) return;
      const name = PREVIEW_JOINTS[i];
      const player = frame.landmarks && frame.landmarks[LANDMARK[name]];
      if (player && visibilityOf(player) >= MIN_JOINT_VISIBILITY && isFinite(player.x) && isFinite(player.y)) {
        const P = px(player);
        const G = px(g);
        bad[i] = Math.hypot(P.x - G.x, P.y - G.y) > tol;
      }
    });
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = GHOST_BONE_PX;
    ctx.setLineDash([DASH_ON_PX, DASH_OFF_PX]);
    ctx.globalAlpha = GHOST_ALPHA;
    ctx.strokeStyle = OVERLAY_COLOR.ghost;
    GHOST_BONES.forEach(([a, b]) => {
      const A = mapped[a];
      const B = mapped[b];
      if (!A || !B) return;
      const PA = px(A);
      const PB = px(B);
      ctx.beginPath();
      ctx.moveTo(PA.x, PA.y);
      ctx.lineTo(PB.x, PB.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    mapped.forEach((g, i) => {
      if (!g) return;
      const G = px(g);
      ctx.fillStyle = bad[i] ? OVERLAY_COLOR.ghostBad : OVERLAY_COLOR.ghost;
      ctx.globalAlpha = GHOST_ALPHA;
      ctx.beginPath();
      ctx.arc(G.x, G.y, GHOST_JOINT_PX, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
    ctx.globalAlpha = 1;
    return { mapped, bad };
  }

  function draw(frame) {
    if (!ctx || !o.canvas || destroyed) return;
    const size = stageBox();
    ctx.clearRect(0, 0, size.w, size.h);
    const lm = frame && frame.landmarks;
    const hlm = frame && frame.handLandmarks;
    if (!lm && !hlm) return;
    const box = fit(frame);
    const px = (p) => ({ x: box.x + (frame.mirrored ? 1 - p.x : p.x) * box.w, y: box.y + p.y * box.h });
    let target = null;
    if (lm) {
      drawShadow(frame, box);
      const calibrating = o.isCalibrating ? o.isCalibrating() : false;
      if (calibrating) drawGuideLine(frame, box, frame.mirrored);
      else target = drawGhostLine(frame, box, px);
      const detail = o.isDetail ? o.isDetail() : false;
      if (detail) drawSkeletonDetail(frame, lm, px);
      else drawSkeleton(lm, box, px);
      if (detail) drawDetail(frame, px, target);
    }
    if (hlm) drawHand(hlm, px);
  }

  function updateAlert(frame, running) {
    if (!o.alertEl) return "";
    sampleLight();
    const text = stageAlert(frame, running);
    o.alertEl.hidden = !text;
    if (text) o.alertEl.textContent = text;
    return text;
  }

  function resize() {
    if (!ctx || !o.canvas) return 0;
    const size = stageBox();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.round(size.w * dpr);
    const h = Math.round(size.h * dpr);
    if (o.canvas.width !== w || o.canvas.height !== h) {
      o.canvas.width = w;
      o.canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return dpr;
  }

  function clear() {
    if (!ctx || !o.canvas) return;
    const size = stageBox();
    ctx.clearRect(0, 0, size.w, size.h);
    if (o.alertEl) o.alertEl.hidden = true;
    lumMean = null;
    lumCenter = null;
    lumBorder = null;
  }

  function destroy() {
    destroyed = true;
    clear();
  }

  return { draw, updateAlert, resize, clear, destroy, stageAlert };
}
