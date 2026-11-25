import { createPoseEngine, CONNECTIONS, LANDMARK, SOURCE, STATUS, FACING, LENS, CAPTURE_STATE, CAPTURE_RESULT, CALIBRATION_STATE, CALIBRATION_RESULT, PREVIEW_JOINTS, POSE_EVENT, gradeFor, normalizeSequence, validCalibration, jointAngles, targetJointAngles, angleWithin, drawAngleArcs, drawVelocitySkeleton, depthIndicators, drawDepthIndicators, coincidenceFromBad, drawMatchJoints, drawMatchPercent } from "../engine/v2/index.js?v=0.7.0";
import {
  APP_ID, APP_VERSION, CAMERA_KEY, LENS_KEY, CALIBRATION_KEY, DETAIL_KEY, DETAIL_ON, DETAIL_OFF, CALIBRATION_MAX, STATS_KEY, STAT, STATS, JOINT_RADIUS_PX, BONE_WIDTH_PX, THUMB_BONE_PX, THUMB_JOINT_PX,
  MIN_JOINT_VISIBILITY, MAX_DPR, PERCENT, COLOR, TEXT, POP_GRADE_MS, STATUS_MS, CAPTURED_MS, CONFIRM_MS, FLASH_MS, LUM_SAMPLE_MS,
  GUIDE_VISIBILITY, GUIDE_H_TOL, GUIDE_V_TOL, GHOST_TOL_RATIO,
  GHOST_MARGIN, SIL_TORSO_RATIO, SIL_ARM_RATIO, SIL_LEG_RATIO, SIL_HEAD_RATIO, SIL_ALPHA, FADE_FLOOR, OUTSIDE_FADE, FRAME_MIN_HEIGHT, FRAME_MAX_HEIGHT, FRAME_PAD, LUM_SIZE, LUM_DARK, LUM_CENTER_MAX, LUM_CONTRAST, T_GUIDE,
  DETAIL_ARC_PX, DETAIL_FONT_PX, DETAIL_MAX_BONE_PX, DETAIL_MAX_SPEED, DETAIL_TOL_DEG, DETAIL_DEPTH_BASE_PX, DETAIL_DEPTH_GROW_PX, DETAIL_MATCH_PX, DETAIL_PCT_PX, DETAIL_PCT_PAD_PX,
  NAME_MAX, DESCRIPTION_MAX,
} from "./config.js";
import { loadLibrary, saveLibrary, exportLibrary, parseImport, mergeLibrary, newId, nextName, playable } from "./library.js";
import { metaUpdate, metaRead, crearEscritor, metaDeclararProyecto } from "./meta.js";

const LEFT_PREFIX = "left_";
const MIN_VIDEO_INPUTS = 2;
const VIDEO_INPUT = "videoinput";
const ZOOM_LABEL = Object.freeze({ WIDE: "0.5×", NORMAL: "1×" });
const TAB = Object.freeze({ POSES: "poses", MOVES: "moves" });
const VIEW = Object.freeze({ POSES: "poses", MOVES: "moves", POSE: "pose", MOVE: "move", IMPORT: "import" });
const THUMB_PX = 44;
const PREVIEW_PX = 132;
const THUMB_BONES = Object.freeze([
  ["left_shoulder", "right_shoulder"], ["left_hip", "right_hip"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
].map(([a, b]) => [PREVIEW_JOINTS.indexOf(a), PREVIEW_JOINTS.indexOf(b)]));
const NOSE_INDEX = PREVIEW_JOINTS.indexOf("nose");
const HEAD_RADIUS_RATIO = 0.06;
const GUIDE_BONES = Object.freeze([
  ["left_shoulder", "right_shoulder", "h"], ["left_shoulder", "left_hip", "v"], ["right_shoulder", "right_hip", "v"],
  ["left_shoulder", "left_elbow", "h"], ["left_elbow", "left_wrist", "h"],
  ["right_shoulder", "right_elbow", "h"], ["right_elbow", "right_wrist", "h"],
  ["left_hip", "left_knee", "v"], ["left_knee", "left_ankle", "v"],
  ["right_hip", "right_knee", "v"], ["right_knee", "right_ankle", "v"],
]);
const GHOST_BONES = THUMB_BONES;
const LUM_WEIGHT = Object.freeze([0.2126, 0.7152, 0.0722]);
const LUM_CENTER = Object.freeze({ lo: 0.25, hi: 0.75 });
const HALF = 2;
const HUNDRED = 100;

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");
const stage = $("stage");
const ui = {
  counter: $("counter"), counterLabel: $("counter-label"), counterValue: $("counter-value"), counterSub: $("counter-sub"),
  poseName: $("pose-name"), posePct: $("pose-pct"), meter: $("meter-fill"), seq: $("seq"), hint: $("hint"),
  msg: $("stage-msg"), msgText: $("stage-text"), msgHint: $("stage-hint"), camera: $("btn-camera"), capture: $("btn-capture"),
  flip: $("btn-flip"), zoom: $("btn-zoom"), zoomLabel: $("zoom-label"), reset: $("btn-reset"), popGrade: $("pop-grade"),
  banner: $("capture-banner"), bannerTitle: $("capture-title"), bannerHint: $("capture-hint"), bannerHold: $("capture-hold"),
  countdown: $("countdown"), posesBtn: $("btn-poses"), movesBtn: $("btn-moves"), posesCount: $("poses-count"), movesCount: $("moves-count"),
  lib: $("lib"), libMain: $("lib-main"), libFoot: $("lib-foot"), libStatus: $("lib-status"), libClose: $("lib-close"),
  tabPoses: $("tab-poses"), tabMoves: $("tab-moves"), copy: $("btn-copy"), paste: $("btn-paste"), calibrate: $("btn-calibrate"),
  stageHud: $("stage-hud"), stageReps: $("stage-reps-value"), stageRepsLabel: $("stage-reps-label"), stageTrack: $("stage-track-fill"),
  stageAlert: $("stage-alert"), stageFlash: $("stage-flash"), detail: $("btn-detail"),
};

function readKey(key, allowed, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (allowed.indexOf(saved) !== -1) return saved;
  } catch (e) {
    return fallback;
  }
  return fallback;
}

function writeKey(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

let library = loadLibrary();
let detailOn = readKey(DETAIL_KEY, [DETAIL_ON, DETAIL_OFF], DETAIL_OFF) === DETAIL_ON;
const engine = createPoseEngine({
  video,
  facingMode: readKey(CAMERA_KEY, [FACING.USER, FACING.ENVIRONMENT], FACING.USER),
  lens: readKey(LENS_KEY, [LENS.WIDE, LENS.NORMAL], LENS.NORMAL),
});
const leftJoints = new Set();
let running = false;
let source = null;
let lastFrame = null;
let busy = false;
let lastRep = null;
let focusId = null;
let capturedNote = null;
let calibrationNote = null;
let pendingCapture = false;
let view = VIEW.POSES;
let editing = null;
let statusTimer = 0;
let popTimer = 0;
let flashTimer = 0;
let lumTimer = 0;
let lumMean = null;
let lumCenter = null;
let lumBorder = null;
const prevSteps = {};
const prevCounts = {};
let lastFocusId = null;
const lumCanvas = document.createElement("canvas");
lumCanvas.width = LUM_SIZE;
lumCanvas.height = LUM_SIZE;
const lumCtx = lumCanvas.getContext("2d", { willReadFrequently: true });
const silCanvas = document.createElement("canvas");
const silCtx = silCanvas.getContext("2d");
const T_GUIDE_PTS = PREVIEW_JOINTS.map((name) => T_GUIDE[name] || null);

function loadStats() {
  const empty = { [STAT.REPS_TOTAL]: 0, [STAT.CAPTURES_TOTAL]: 0 };
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY));
    if (s && typeof s === "object") return { [STAT.REPS_TOTAL]: s[STAT.REPS_TOTAL] || 0, [STAT.CAPTURES_TOTAL]: s[STAT.CAPTURES_TOTAL] || 0 };
  } catch (e) {
    return empty;
  }
  return empty;
}

const stats = loadStats();
const escritorMeta = crearEscritor(() => {
  writeKey(STATS_KEY, JSON.stringify(stats));
  metaUpdate(APP_ID, APP_VERSION, { stats }, { declare: STATS });
});

function syncEngine() {
  engine.setPoses(library.poses);
  engine.setMovements(library.movements);
  ui.posesCount.textContent = String(library.poses.length);
  ui.movesCount.textContent = String(library.movements.length);
  if (focusId && !library.movements.some((m) => m.id === focusId)) focusId = null;
  renderHud(lastFrame);
}

function commit() {
  saveLibrary(library);
  syncEngine();
}

function poseById(id) {
  return library.poses.find((p) => p.id === id) || null;
}

function poseName(id) {
  const p = poseById(id);
  return p ? p.name : "";
}

function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function popGrade(g) {
  ui.popGrade.textContent = g.label;
  ui.popGrade.dataset.level = g.level;
  ui.popGrade.hidden = false;
  restart(ui.popGrade, "show");
  clearTimeout(popTimer);
  popTimer = setTimeout(() => { ui.popGrade.hidden = true; }, POP_GRADE_MS);
}

function showMessage(text, hint) {
  ui.msgText.textContent = text;
  ui.msgHint.textContent = hint || "";
  ui.msg.hidden = false;
}

function hideMessage() {
  ui.msg.hidden = true;
}

function flashStage(kind) {
  ui.stageFlash.dataset.kind = kind;
  ui.stageFlash.classList.remove("show");
  void ui.stageFlash.offsetWidth;
  ui.stageFlash.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { ui.stageFlash.classList.remove("show"); }, FLASH_MS);
}

function sampleLight() {
  const now = performance.now();
  if (now - lumTimer < LUM_SAMPLE_MS) return;
  lumTimer = now;
  try {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
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

function visibilityOf(p) {
  return p && typeof p.visibility === "number" ? p.visibility : 1;
}

function pointInFrame(p) {
  if (!p || !isFinite(p.x) || !isFinite(p.y)) return false;
  return p.x >= -FRAME_PAD && p.x <= 1 + FRAME_PAD && p.y >= -FRAME_PAD && p.y <= 1 + FRAME_PAD;
}

function fadeOf(p) {
  let a = Math.min(1, Math.max(0, visibilityOf(p)));
  if (!pointInFrame(p)) a *= OUTSIDE_FADE;
  return Math.max(FADE_FLOOR, a);
}

function bodyHeight(lm) {
  if (!lm) return 0;
  const nose = lm[LANDMARK.nose];
  const ankleL = lm[LANDMARK.left_ankle];
  const ankleR = lm[LANDMARK.right_ankle];
  const top = nose && visibilityOf(nose) >= MIN_JOINT_VISIBILITY ? nose.y : null;
  const bottoms = [];
  if (ankleL && visibilityOf(ankleL) >= MIN_JOINT_VISIBILITY) bottoms.push(ankleL.y);
  if (ankleR && visibilityOf(ankleR) >= MIN_JOINT_VISIBILITY) bottoms.push(ankleR.y);
  if (top === null || !bottoms.length) return 0;
  return Math.abs(Math.max.apply(null, bottoms) - top);
}

function feetVisible(lm) {
  if (!lm) return false;
  return ["left_ankle", "right_ankle", "left_heel", "right_heel"].every((n) => {
    const p = lm[LANDMARK[n]];
    return p && visibilityOf(p) >= MIN_JOINT_VISIBILITY && pointInFrame(p);
  });
}

function framingAlert(frame) {
  if (!running || !frame || !frame.landmarks) return "";
  const lm = frame.landmarks;
  const h = bodyHeight(lm);
  if (!h) return TEXT.outFrame;
  if (h > FRAME_MAX_HEIGHT) return TEXT.tooFar;
  if (!feetVisible(lm)) return TEXT.outFrame;
  if (h < FRAME_MIN_HEIGHT) return TEXT.tooNear;
  return "";
}

function lightAlert(frame) {
  if (!running) return "";
  if (frame && frame.features) return "";
  if (lumMean === null || lumCenter === null || lumBorder === null) return "";
  if (lumMean < LUM_DARK) return TEXT.dark;
  if (lumCenter < LUM_CENTER_MAX && lumBorder - lumCenter > LUM_CONTRAST) return TEXT.backlight;
  return "";
}

function stageAlertFor(frame) {
  return lightAlert(frame) || framingAlert(frame) || "";
}

function ghostTarget(frame) {
  if (!frame || engine.calibrating()) return null;
  const move = frame.movements && frame.movements[focusId];
  if (move && move.sequence && move.sequence.length) {
    const idx = move.step >= 0 ? (move.step + 1) % move.sequence.length : 0;
    return move.sequence[idx];
  }
  if (frame.active && frame.active.id) return frame.active.id;
  if (frame.best && frame.best.id) return frame.best.id;
  return null;
}

function segmentCovered(lm, aName, bName, orient) {
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

function ghostMapped(pts, lm, mirrored) {
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

function pct(v) {
  return Math.round(v * PERCENT) + "%";
}

function focusMovement(frame) {
  const playableMoves = library.movements.filter((m) => playable(m, library));
  if (!playableMoves.length) return null;
  const snap = frame && frame.movements ? frame.movements : engine.getState().movements;
  let best = null;
  Object.keys(snap).forEach((id) => {
    const s = snap[id];
    if (s.step >= 0 && (!best || s.lastAt > best.lastAt)) best = s;
  });
  if (best) focusId = best.id;
  const id = focusId && snap[focusId] ? focusId : playableMoves[0].id;
  return snap[id] || null;
}

function renderSeq(move) {
  if (!move) {
    ui.seq.replaceChildren();
    ui.seq.hidden = true;
    return;
  }
  ui.seq.hidden = false;
  ui.seq.replaceChildren(...move.sequence.map((id, i) => {
    const li = document.createElement("li");
    li.className = "seq-step";
    li.textContent = poseName(id);
    if (i === move.step) li.dataset.state = "now";
    else if (i < move.step) li.dataset.state = "done";
    return li;
  }));
}

function renderHud(frame) {
  const move = focusMovement(frame);
  const reps = move ? move.count : 0;
  ui.counterLabel.textContent = move ? move.name : TEXT.reps;
  ui.counterValue.textContent = String(reps);
  const sub = lastRep && move && lastRep.movement === move.id ? lastRep.grade : null;
  ui.counterSub.textContent = sub ? sub.label : "";
  ui.counterSub.dataset.level = sub ? sub.level : "";
  ui.stageReps.textContent = String(reps);
  ui.stageRepsLabel.textContent = move ? move.name : TEXT.reps;
  ui.stageHud.hidden = !running || !move;
  let track = 0;
  if (move && move.sequence && move.sequence.length) {
    const len = move.sequence.length;
    let nextProx = 0;
    if (frame && frame.proximity) {
      const nextId = move.sequence[move.step >= 0 ? (move.step + 1) % len : 0];
      const p = frame.proximity[nextId];
      if (typeof p === "number" && isFinite(p)) nextProx = Math.min(1, Math.max(0, p));
    }
    track = move.step >= 0 ? (move.step + nextProx) / len : nextProx / len;
    if (track > 1) track = 1;
    if (track < 0) track = 0;
  }
  ui.stageTrack.style.transform = "scaleX(" + track.toFixed(3) + ")";
  sampleLight();
  const alert = stageAlertFor(frame);
  ui.stageAlert.hidden = !alert;
  if (alert) ui.stageAlert.textContent = alert;
  if (move) {
    const prev = prevSteps[move.id];
    const prevCount = prevCounts[move.id];
    if (typeof prev === "number" && move.step >= 0 && move.step < prev && prev >= 1 && prevCount === move.count) flashStage("bad");
    prevSteps[move.id] = move.step;
    prevCounts[move.id] = move.count;
  }
  renderSeq(move);
  let hint = "";
  if (engine.capturing() || engine.calibrating()) hint = "";
  else if (!library.poses.length) hint = TEXT.firstPose;
  else if (!move) hint = TEXT.firstMove;
  ui.hint.textContent = hint;
  ui.hint.hidden = !hint;
  const active = frame && frame.active;
  const best = frame && frame.best;
  let name = TEXT.noPose;
  let value = 0;
  let level = "";
  let state = "off";
  if (running && frame && !frame.features) name = TEXT.noBody;
  else if (active) {
    name = active.name;
    value = active.proximity;
    level = gradeFor(active.proximity).level;
    state = "on";
  } else if (best) {
    name = TEXT.near + " " + best.name;
    value = best.proximity;
    state = "near";
  }
  ui.poseName.textContent = name;
  ui.poseName.dataset.state = state;
  ui.posePct.textContent = state === "off" ? "" : pct(value);
  ui.meter.style.transform = "scaleX(" + value.toFixed(3) + ")";
  ui.meter.dataset.level = level;
  ui.meter.dataset.state = state;
}

function readCalibrations() {
  try {
    const all = JSON.parse(localStorage.getItem(CALIBRATION_KEY));
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch (e) {
    return {};
  }
}

function cameraKey() {
  const state = engine.getState();
  return state.facingMode + ":" + (state.deviceId || "");
}

function storeCalibration(calibration) {
  const all = readCalibrations();
  all[cameraKey()] = Object.assign({}, calibration, { at: new Date().toISOString() });
  const keys = Object.keys(all).sort((a, b) => String(all[b].at).localeCompare(String(all[a].at)));
  const kept = {};
  keys.slice(0, CALIBRATION_MAX).forEach((k) => { kept[k] = all[k]; });
  writeKey(CALIBRATION_KEY, JSON.stringify(kept));
}

function applyCalibration() {
  if (source !== SOURCE.CAMERA) return;
  const saved = readCalibrations()[cameraKey()];
  if (validCalibration(saved)) {
    engine.setCalibration(saved);
    return;
  }
  engine.setCalibration(null);
  startCalibration();
}

function startCalibration() {
  calibrationNote = null;
  capturedNote = null;
  if (engine.capturing()) pendingCapture = true;
  engine.startCalibration();
  renderCalibrationButton();
  renderCapture(null);
}

function finishPendingCapture(needsRelease) {
  if (!pendingCapture) return;
  pendingCapture = false;
  engine.startCapture({ needsRelease });
}

function renderCalibrationButton() {
  const on = engine.calibrating();
  ui.calibrate.textContent = on ? TEXT.calibrateSkip : TEXT.calibrate;
  ui.calibrate.classList.toggle("on", on);
  ui.calibrate.setAttribute("aria-pressed", String(on));
}

function renderCalibration(cal) {
  const now = performance.now();
  const note = calibrationNote && now - calibrationNote.at < CAPTURED_MS ? calibrationNote : null;
  const active = engine.calibrating();
  if (!active && !note) return false;
  const pending = pendingCapture || engine.capturing();
  ui.capture.textContent = pending ? TEXT.captureDone : TEXT.capture;
  ui.capture.setAttribute("aria-pressed", String(pending));
  ui.capture.classList.toggle("on", pending);
  ui.banner.hidden = false;
  ui.countdown.hidden = true;
  if (!active) {
    ui.banner.dataset.state = "done";
    ui.bannerTitle.textContent = note.title;
    ui.bannerHint.textContent = note.hint;
    ui.bannerHold.style.transform = "scaleX(0)";
    return true;
  }
  const c = cal || { state: CALIBRATION_STATE.WAITING, progress: 0, missing: [] };
  const holding = c.state === CALIBRATION_STATE.HOLDING;
  ui.banner.dataset.state = holding ? "holding" : "waiting";
  ui.bannerHold.style.transform = "scaleX(" + (holding ? c.progress : 0).toFixed(3) + ")";
  ui.bannerTitle.textContent = holding ? TEXT.calHold : TEXT.calWait;
  ui.bannerHint.textContent = c.missing && c.missing.length ? TEXT.missing(c.missing) : holding ? TEXT.calHoldHint : TEXT.calWaitHint;
  return true;
}

function renderCapture(c) {
  if (renderCalibration(lastFrame && lastFrame.calibration)) return;
  const active = c && c.state !== CAPTURE_STATE.IDLE;
  ui.capture.textContent = active ? TEXT.captureDone : TEXT.capture;
  ui.capture.setAttribute("aria-pressed", String(!!active));
  ui.capture.classList.toggle("on", !!active);
  ui.banner.hidden = !active;
  ui.countdown.hidden = !(active && c.state === CAPTURE_STATE.COUNTDOWN);
  if (!active) return;
  const now = performance.now();
  const note = capturedNote && now - capturedNote.at < CAPTURED_MS ? capturedNote : null;
  ui.banner.dataset.state = c.state;
  ui.bannerHold.style.transform = "scaleX(" + (c.state === CAPTURE_STATE.HOLDING ? c.holdProgress : c.state === CAPTURE_STATE.COUNTDOWN ? 1 : 0).toFixed(3) + ")";
  if (c.state === CAPTURE_STATE.COUNTDOWN) {
    ui.bannerTitle.textContent = TEXT.countdown;
    ui.bannerHint.textContent = "";
    if (ui.countdown.textContent !== String(c.seconds)) {
      ui.countdown.textContent = String(c.seconds);
      restart(ui.countdown, "tick");
    }
    return;
  }
  ui.countdown.textContent = "";
  if (c.state === CAPTURE_STATE.HOLDING) {
    ui.bannerTitle.textContent = TEXT.holdT;
    ui.bannerHint.textContent = TEXT.waitTHint;
  } else if (note) {
    ui.bannerTitle.textContent = note.text;
    ui.bannerHint.textContent = c.needsRelease ? TEXT.releaseT : TEXT.waitTNext;
    ui.banner.dataset.state = note.ok ? "done" : "failed";
  } else {
    ui.bannerTitle.textContent = c.needsRelease ? (capturedNote ? TEXT.releaseT : TEXT.releaseFirst) : TEXT.waitT;
    ui.bannerHint.textContent = TEXT.waitTHint;
  }
}

function renderZoom() {
  const state = engine.getState();
  const wide = state.lens === LENS.WIDE;
  const caps = state.capabilities;
  ui.zoom.hidden = !(source === SOURCE.CAMERA && caps && caps.canWiden);
  ui.zoom.setAttribute("aria-pressed", String(wide));
  ui.zoomLabel.textContent = wide ? ZOOM_LABEL.WIDE : ZOOM_LABEL.NORMAL;
}

function renderDetailButton() {
  ui.detail.setAttribute("aria-pressed", String(detailOn));
  ui.detail.setAttribute("aria-label", TEXT.detail);
}

function renderCameraChrome() {
  const mode = engine.getState().facingMode;
  ui.flip.setAttribute("aria-pressed", String(mode === FACING.ENVIRONMENT));
  video.classList.toggle("mirrored", mode === FACING.USER && source === SOURCE.CAMERA);
  renderZoom();
}

async function refreshCameras() {
  let hide = false;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) hide = true;
    else {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videos = devices.filter((d) => d.kind === VIDEO_INPUT);
      const known = videos.filter((d) => d.deviceId || d.label);
      if (!videos.length) hide = true;
      else if (known.length) hide = known.length < MIN_VIDEO_INPUTS;
    }
  } catch (e) {
    hide = false;
  }
  ui.flip.hidden = hide;
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  canvas.width = Math.round(stage.clientWidth * dpr);
  canvas.height = Math.round(stage.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sizeModelCanvas();
  if (lastFrame) draw(lastFrame);
}

function fit(frame) {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const s = Math.min(w / frame.width, h / frame.height);
  const dw = frame.width * s;
  const dh = frame.height * s;
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
}

function draw(frame) {
  ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
  const lm = frame.landmarks;
  if (!lm) return;
  const box = fit(frame);
  const px = (p) => ({ x: box.x + (frame.mirrored ? 1 - p.x : p.x) * box.w, y: box.y + p.y * box.h });
  const calibrating = engine.calibrating();
  const target = calibrating ? drawGuide(frame, px) : drawGhost(frame, box, px);
  if (detailOn) drawSkeletonDetail(frame, lm, px);
  else drawSkeleton(lm, box, px);
  if (detailOn) drawDetail(frame, px, target);
}

function boneColor(a, b) {
  return leftJoints.has(a) && leftJoints.has(b) ? COLOR.boneLeft : leftJoints.has(a) || leftJoints.has(b) ? COLOR.bone : COLOR.boneRight;
}

function drawSkeletonDetail(frame, lm, px) {
  drawVelocitySkeleton(ctx, lm, CONNECTIONS, frame.motion, px, {
    baseWidthPx: BONE_WIDTH_PX,
    maxBonePx: DETAIL_MAX_BONE_PX,
    maxAngVel: DETAIL_MAX_SPEED,
    jointRadiusPx: JOINT_RADIUS_PX,
    jointColor: COLOR.joint,
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
      return ok === null ? COLOR.joint : ok ? COLOR.guideOk : COLOR.ghostBad;
    },
  });
  drawDepthIndicators(ctx, depthIndicators(frame.worldLandmarks), px, {
    depthBasePx: DETAIL_DEPTH_BASE_PX,
    depthGrowPx: DETAIL_DEPTH_GROW_PX,
    depthColor: COLOR.ghost,
  });
  if (target && target.mapped && target.bad) {
    const coincidence = coincidenceFromBad(target.mapped, target.bad);
    drawMatchJoints(ctx, target.mapped, frame.landmarks, target.bad, px, {
      matchJointPx: DETAIL_MATCH_PX,
      minVisibility: MIN_JOINT_VISIBILITY,
      okColor: COLOR.guideOk,
      badColor: COLOR.ghostBad,
      fadeOf: (p) => fadeOf(p),
    });
    drawMatchPercent(ctx, coincidence.percent, {
      pctFontPx: DETAIL_PCT_PX,
      pctPadPx: DETAIL_PCT_PAD_PX,
      pctColor: COLOR.joint,
    });
  }
}

function boneRatio(index) {
  if (index <= 3) return SIL_TORSO_RATIO;
  if (index <= 7) return SIL_ARM_RATIO;
  return SIL_LEG_RATIO;
}

function drawSilhouette(mapped, px, styleOfBone, styleOfJoint) {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  if (silCanvas.width !== Math.round(w * dpr) || silCanvas.height !== Math.round(h * dpr)) {
    silCanvas.width = Math.round(w * dpr);
    silCanvas.height = Math.round(h * dpr);
  }
  silCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  silCtx.clearRect(0, 0, w, h);
  silCtx.lineCap = "round";
  silCtx.lineJoin = "round";
  const jointRadius = new Array(mapped.length).fill(0);
  const jointColor = new Array(mapped.length).fill(null);
  THUMB_BONES.forEach(([a, b], i) => {
    const A = mapped[a];
    const B = mapped[b];
    if (!A || !B) return;
    const PA = px(A);
    const PB = px(B);
    const len = Math.hypot(PB.x - PA.x, PB.y - PA.y);
    if (!(len > 0)) return;
    const style = styleOfBone(i);
    const width = Math.max(3, len * boneRatio(i));
    silCtx.strokeStyle = style.color;
    silCtx.lineWidth = width;
    silCtx.beginPath();
    silCtx.moveTo(PA.x, PA.y);
    silCtx.lineTo(PB.x, PB.y);
    silCtx.stroke();
    [a, b].forEach((j) => {
      jointRadius[j] = Math.max(jointRadius[j], width * 0.52);
      jointColor[j] = style.color;
    });
  });
  const nose = mapped[NOSE_INDEX];
  const shoulderL = mapped[PREVIEW_JOINTS.indexOf("left_shoulder")];
  const shoulderR = mapped[PREVIEW_JOINTS.indexOf("right_shoulder")];
  if (nose && shoulderL && shoulderR) {
    const N = px(nose);
    const sl = px(shoulderL);
    const sr = px(shoulderR);
    const mid = { x: (sl.x + sr.x) / 2, y: (sl.y + sr.y) / 2 };
    const radius = Math.max(5, Math.hypot(N.x - mid.x, N.y - mid.y) * SIL_HEAD_RATIO);
    silCtx.fillStyle = styleOfBone(0).color;
    silCtx.beginPath();
    silCtx.arc(N.x, N.y, radius, 0, Math.PI * 2);
    silCtx.fill();
  }
  mapped.forEach((g, i) => {
    if (!g || !jointRadius[i]) return;
    const G = px(g);
    silCtx.fillStyle = styleOfJoint && styleOfJoint(i) ? styleOfJoint(i).color : jointColor[i];
    silCtx.beginPath();
    silCtx.arc(G.x, G.y, jointRadius[i], 0, Math.PI * 2);
    silCtx.fill();
  });
  ctx.save();
  ctx.globalAlpha = SIL_ALPHA;
  ctx.drawImage(silCanvas, 0, 0, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawGuide(frame, px) {
  const mapped = ghostMapped(T_GUIDE_PTS, frame.landmarks, frame.mirrored);
  if (!mapped) return null;
  const covered = {};
  GUIDE_BONES.forEach(([aName, bName, orient]) => {
    covered[aName + "|" + bName] = segmentCovered(frame.landmarks, aName, bName, orient);
  });
  const styleOfBone = (i) => {
    const aName = PREVIEW_JOINTS[THUMB_BONES[i][0]];
    const bName = PREVIEW_JOINTS[THUMB_BONES[i][1]];
    const ok = covered[aName + "|" + bName] === true || (aName === "left_hip" && bName === "right_hip" ? covered["left_shoulder|right_shoulder"] === true : false);
    return { color: ok ? COLOR.guideOk : COLOR.guideBad };
  };
  const styleOfJoint = (i) => {
    const name = PREVIEW_JOINTS[i];
    const bad = GUIDE_BONES.some(([aName, bName]) => (aName === name || bName === name) && covered[aName + "|" + bName] !== true);
    return { color: bad ? COLOR.guideBad : COLOR.guideOk };
  };
  drawSilhouette(mapped, px, styleOfBone, styleOfJoint);
  const bad = mapped.map((g, i) => !!g && styleOfJoint(i).color !== COLOR.guideOk);
  return { mapped, bad };
}

function drawGhost(frame, box, px) {
  const id = ghostTarget(frame);
  if (!id) return null;
  const pose = poseById(id);
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
  const styleOfBone = (i) => ({ color: bad[THUMB_BONES[i][0]] || bad[THUMB_BONES[i][1]] ? COLOR.ghostBad : COLOR.ghost });
  const styleOfJoint = (i) => ({ color: bad[i] ? COLOR.ghostBad : COLOR.ghost });
  drawSilhouette(mapped, px, styleOfBone, styleOfJoint);
  return { mapped, bad };
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
    ctx.strokeStyle = leftJoints.has(a) && leftJoints.has(b) ? COLOR.boneLeft : leftJoints.has(a) || leftJoints.has(b) ? COLOR.bone : COLOR.boneRight;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }
  ctx.fillStyle = COLOR.joint;
  lm.forEach((p) => {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) return;
    const P = px(p);
    ctx.globalAlpha = fadeOf(p);
    ctx.beginPath();
    ctx.arc(P.x, P.y, JOINT_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawThumb(el, pts, size) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  el.width = Math.round(size * dpr);
  el.height = Math.round(size * dpr);
  el.style.width = size + "px";
  el.style.height = size + "px";
  const c = el.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, size, size);
  if (!pts || !pts.length) return;
  const at = (q) => ({ x: q[0] * size, y: q[1] * size });
  const scale = size / THUMB_PX;
  c.lineCap = "round";
  c.lineWidth = THUMB_BONE_PX * scale;
  c.strokeStyle = COLOR.thumb;
  THUMB_BONES.forEach(([a, b]) => {
    const pa = pts[a];
    const pb = pts[b];
    if (!pa || !pb) return;
    const A = at(pa);
    const B = at(pb);
    c.beginPath();
    c.moveTo(A.x, A.y);
    c.lineTo(B.x, B.y);
    c.stroke();
  });
  const nose = pts[NOSE_INDEX];
  if (nose) {
    const N = at(nose);
    c.fillStyle = COLOR.thumbJoint;
    c.beginPath();
    c.arc(N.x, N.y, Math.max(THUMB_JOINT_PX * scale, size * HEAD_RADIUS_RATIO), 0, Math.PI * 2);
    c.fill();
  }
}

const MODEL_BONES = [
  ["left_shoulder", "right_shoulder", "mid"], ["left_hip", "right_hip", "mid"],
  ["left_shoulder", "left_hip", "mid"], ["right_shoulder", "right_hip", "mid"],
  ["left_shoulder", "left_elbow", "left"], ["left_elbow", "left_wrist", "left"],
  ["right_shoulder", "right_elbow", "right"], ["right_elbow", "right_wrist", "right"],
  ["left_hip", "left_knee", "left"], ["left_knee", "left_ankle", "left"],
  ["right_hip", "right_knee", "right"], ["right_knee", "right_ankle", "right"],
].map(([a, b, side]) => [PREVIEW_JOINTS.indexOf(a), PREVIEW_JOINTS.indexOf(b), side]);
const MODEL_COLOR = { left: COLOR.boneLeft, right: COLOR.boneRight, mid: COLOR.bone };
const SIDE_HOLD_MS = 650;
const SIDE_TWEEN_MS = 450;
const MODEL_BONE_PX = 5;
const MODEL_JOINT_PX = 3.4;
const sideEl = $("side");
const sideBackdrop = $("side-backdrop");
const sideList = $("side-list");
const sideCanvas = $("side-canvas");
let sideMoveId = null;
let sideRaf = 0;

function sizeModelCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  sideCanvas.width = Math.round(sideCanvas.clientWidth * dpr);
  sideCanvas.height = Math.round(sideCanvas.clientHeight * dpr);
}

function drawModel(pts) {
  const c = sideCanvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = sideCanvas.clientWidth;
  const h = sideCanvas.clientHeight;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  if (!pts || !pts.length) return;
  const s = Math.min(w, h) * 0.86;
  const ox = (w - s) / 2;
  const oy = (h - s) / 2;
  const at = (q) => ({ x: ox + q[0] * s, y: oy + q[1] * s });
  c.lineCap = "round";
  c.lineWidth = MODEL_BONE_PX;
  MODEL_BONES.forEach(([a, b, side]) => {
    const pa = pts[a];
    const pb = pts[b];
    if (!pa || !pb) return;
    const A = at(pa);
    const B = at(pb);
    c.strokeStyle = MODEL_COLOR[side];
    c.beginPath();
    c.moveTo(A.x, A.y);
    c.lineTo(B.x, B.y);
    c.stroke();
  });
  c.fillStyle = COLOR.joint;
  pts.forEach((q) => {
    if (!q) return;
    const P = at(q);
    c.beginPath();
    c.arc(P.x, P.y, MODEL_JOINT_PX, 0, Math.PI * 2);
    c.fill();
  });
  const nose = pts[NOSE_INDEX];
  if (nose) {
    const N = at(nose);
    c.fillStyle = COLOR.thumbJoint;
    c.beginPath();
    c.arc(N.x, N.y, Math.max(MODEL_JOINT_PX, s * HEAD_RADIUS_RATIO), 0, Math.PI * 2);
    c.fill();
  }
}

function modelLerp(a, b, k) {
  return a.map((q, i) => {
    const r = b[i];
    if (!q || !r) return k < 0.5 ? q : r;
    return [q[0] + (r[0] - q[0]) * k, q[1] + (r[1] - q[1]) * k, (q[2] || 0) + ((r[2] || 0) - (q[2] || 0)) * k];
  });
}

function modelEase(v) {
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
}

function sidePtsAt(move, now) {
  const poses = move.sequence.map(poseById).filter((p) => p && p.pts && p.pts.length);
  if (!poses.length) return null;
  const step = SIDE_HOLD_MS + SIDE_TWEEN_MS;
  const phase = (now % (step * poses.length)) / step;
  const i = Math.floor(phase);
  const f = phase - i;
  const a = poses[i % poses.length];
  const b = poses[(i + 1) % poses.length];
  const tt = f * step;
  return modelLerp(a.pts, b.pts, tt <= SIDE_HOLD_MS ? 0 : modelEase((tt - SIDE_HOLD_MS) / SIDE_TWEEN_MS));
}

function sideTick() {
  const move = sideMoveId ? library.movements.find((m) => m.id === sideMoveId) : null;
  drawModel(move ? sidePtsAt(move, performance.now()) : null);
  sideRaf = requestAnimationFrame(sideTick);
}

function renderSideList() {
  if (!library.movements.length) {
    sideList.replaceChildren(el("li", "side-empty", TEXT.menuEmpty));
    return;
  }
  sideList.replaceChildren(...library.movements.map((m) => {
    const li = el("li");
    const b = button("side-item", undefined, () => selectSide(m.id));
    b.setAttribute("aria-pressed", String(m.id === sideMoveId));
    const body = el("span", "item-body");
    body.append(el("span", "item-name", m.name), el("span", "side-item-sub", m.sequence.map(poseName).filter(Boolean).join(" → ")));
    b.append(body);
    li.append(b);
    return li;
  }));
}

function selectSide(id) {
  sideMoveId = id;
  focusId = id;
  renderSideList();
  renderHud(lastFrame);
}

function openSide() {
  if (!library.movements.some((m) => m.id === sideMoveId)) sideMoveId = library.movements.length ? library.movements[0].id : null;
  sideEl.classList.add("open");
  sideBackdrop.hidden = false;
  renderSideList();
  sizeModelCanvas();
  if (!sideRaf) sideRaf = requestAnimationFrame(sideTick);
}

function closeSide() {
  sideEl.classList.remove("open");
  sideBackdrop.hidden = true;
  if (sideRaf) {
    cancelAnimationFrame(sideRaf);
    sideRaf = 0;
  }
}

function setRunning(on, src) {
  running = on;
  source = on ? src : null;
  ui.camera.textContent = on && src === SOURCE.CAMERA ? TEXT.stop : TEXT.start;
  ui.camera.classList.toggle("on", on && src === SOURCE.CAMERA);
  if (!on) {
    ui.stageHud.hidden = true;
    ui.stageAlert.hidden = true;
    lumMean = null;
    lumCenter = null;
    lumBorder = null;
  }
  renderCameraChrome();
}

async function startCamera() {
  if (busy) return false;
  busy = true;
  showMessage(TEXT.loading, TEXT.idleHint);
  try {
    await engine.start({ source: SOURCE.CAMERA });
    setRunning(true, SOURCE.CAMERA);
    hideMessage();
    refreshCameras();
    applyCalibration();
    return true;
  } catch (e) {
    setRunning(false);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showMessage(TEXT.errors[e.code] || TEXT.errors["camera-error"], "");
    return false;
  } finally {
    busy = false;
  }
}

function stopAll() {
  pendingCapture = false;
  calibrationNote = null;
  engine.stop();
  renderCalibrationButton();
  setRunning(false);
  lastFrame = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  showMessage(TEXT.idle, TEXT.idleHint);
  renderHud(null);
}

function addCapturedPose(features) {
  const pose = Object.assign({ id: newId("p-"), name: nextName(library.poses, TEXT.posePrefix), description: "", createdAt: new Date().toISOString() }, features);
  library.poses.push(pose);
  commit();
  stats[STAT.CAPTURES_TOTAL] += 1;
  escritorMeta.pedir();
  return pose;
}

engine.on("status", (s) => {
  if (s.state === STATUS.OPENING_CAMERA) ui.msgText.textContent = TEXT.opening;
  if (s.state === STATUS.LOADING_MODEL) ui.msgText.textContent = TEXT.loading;
});

engine.on("frame", (frame) => {
  lastFrame = frame;
  draw(frame);
  renderHud(frame);
  renderCapture(frame.capture);
});

engine.on("capture", (c) => {
  if (c.result === CAPTURE_RESULT.CAPTURED) {
    const pose = addCapturedPose(c.features);
    capturedNote = { at: performance.now(), ok: true, text: pose.name + " " + TEXT.captured };
  } else if (c.result === CAPTURE_RESULT.NO_BODY) {
    capturedNote = { at: performance.now(), ok: false, text: TEXT.captureFailed };
  }
  renderCapture(c);
});

engine.on("calibration", (c) => {
  if (c.result === CALIBRATION_RESULT.CALIBRATED && c.calibration) {
    storeCalibration(c.calibration);
    const missing = c.calibration.missing || [];
    calibrationNote = { at: performance.now(), title: TEXT.calDone, hint: missing.length ? TEXT.missing(missing) + ". " + TEXT.calPartial : "" };
    finishPendingCapture(true);
  }
  renderCalibrationButton();
  renderCapture(lastFrame && lastFrame.capture);
});

engine.on("pose", (p) => {
  if (p.type === POSE_EVENT.ENTER) restart(ui.poseName, "flash");
});

engine.on("rep", (r) => {
  lastRep = r;
  focusId = r.movement;
  restart(ui.counter, "bump");
  popGrade(r.grade);
  flashStage("ok");
  if (source === SOURCE.CAMERA) {
    stats[STAT.REPS_TOTAL] += 1;
    escritorMeta.pedir();
  }
});

engine.on("error", (e) => {
  if (e.code === "detect-failed") {
    setRunning(false);
    showMessage(TEXT.errors[e.code], "");
  }
});

ui.camera.addEventListener("click", () => {
  if (running && source === SOURCE.CAMERA) stopAll();
  else startCamera();
});

ui.capture.addEventListener("click", async () => {
  if (pendingCapture) {
    pendingCapture = false;
    renderCapture(null);
    return;
  }
  if (engine.capturing()) {
    engine.cancelCapture();
    return;
  }
  capturedNote = null;
  if (!running && !(await startCamera())) return;
  if (engine.calibrating()) {
    pendingCapture = true;
    renderCapture(null);
    return;
  }
  engine.startCapture();
  renderCapture({ state: CAPTURE_STATE.WAITING, needsRelease: false, holdProgress: 0, seconds: 0 });
});

ui.zoom.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    const next = engine.getState().lens === LENS.WIDE ? LENS.NORMAL : LENS.WIDE;
    await engine.setLens(next);
    writeKey(LENS_KEY, next);
    renderZoom();
  } catch (e) {
    setRunning(false);
    showMessage(TEXT.errors[e.code] || TEXT.errors["camera-error"], "");
  } finally {
    busy = false;
  }
});

ui.flip.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    const facing = await engine.switchCamera();
    writeKey(CAMERA_KEY, facing);
    renderCameraChrome();
    if (running) applyCalibration();
  } catch (e) {
    setRunning(false);
    showMessage(TEXT.errors[e.code] || TEXT.errors["camera-error"], "");
  } finally {
    busy = false;
  }
});

ui.calibrate.addEventListener("click", async () => {
  if (engine.calibrating()) {
    engine.cancelCalibration();
    renderCalibrationButton();
    finishPendingCapture(false);
    renderCapture(lastFrame && lastFrame.capture);
    return;
  }
  if (!running || source !== SOURCE.CAMERA) {
    if (!(await startCamera())) return;
    if (engine.calibrating()) return;
  }
  startCalibration();
});

ui.detail.addEventListener("click", () => {
  detailOn = !detailOn;
  writeKey(DETAIL_KEY, detailOn ? DETAIL_ON : DETAIL_OFF);
  renderDetailButton();
  if (lastFrame) draw(lastFrame);
});

ui.reset.addEventListener("click", () => {
  engine.reset();
  lastRep = null;
  Object.keys(prevSteps).forEach((k) => { delete prevSteps[k]; });
  Object.keys(prevCounts).forEach((k) => { delete prevCounts[k]; });
  renderHud(lastFrame);
});

$("btn-menu").addEventListener("click", () => {
  if (sideEl.classList.contains("open")) closeSide();
  else openSide();
});
sideBackdrop.addEventListener("click", closeSide);
$("side-close").addEventListener("click", closeSide);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sideEl.classList.contains("open")) closeSide();
});

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(cls, text, onClick) {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function setStatus(text) {
  ui.libStatus.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { ui.libStatus.textContent = ""; }, STATUS_MS);
}

function chevron() {
  const s = el("span", "chev");
  s.setAttribute("aria-hidden", "true");
  s.textContent = "›";
  return s;
}

function renderPosesList() {
  if (!library.poses.length) return [el("p", "empty", TEXT.emptyPoses)];
  const list = el("ul", "items");
  library.poses.forEach((p) => {
    const li = el("li");
    const b = button("item", undefined, () => openPose(p.id));
    const thumb = el("canvas", "thumb");
    thumb.setAttribute("aria-hidden", "true");
    drawThumb(thumb, p.pts, THUMB_PX);
    const body = el("span", "item-body");
    body.append(el("span", "item-name", p.name), el("span", "item-sub", p.description || TEXT.noDescription));
    b.append(thumb, body, chevron());
    li.append(b);
    list.append(li);
  });
  return [list];
}

function renderMovesList() {
  const out = [];
  if (!library.movements.length) out.push(el("p", "empty", TEXT.emptyMoves));
  else {
    const list = el("ul", "items");
    library.movements.forEach((m) => {
      const li = el("li");
      const b = button("item", undefined, () => openMove(m.id));
      const body = el("span", "item-body");
      const seq = m.sequence.map(poseName).filter(Boolean).join(" → ");
      body.append(el("span", "item-name", m.name), el("span", "item-sub", m.description || seq || TEXT.sequenceEmpty));
      if (m.description && seq) body.append(el("span", "item-sub item-seq", seq));
      b.append(body, chevron());
      li.append(b);
      list.append(li);
    });
    out.push(list);
  }
  const add = button("btn btn-ghost add-btn", TEXT.newMove, () => openMove(null));
  if (library.poses.length < 2) {
    add.disabled = true;
    out.push(add, el("p", "tenue-line", TEXT.needPoses));
  } else out.push(add);
  return out;
}

function field(label, control) {
  const wrap = el("label", "field");
  wrap.append(el("span", "field-label", label), control);
  return wrap;
}

function input(value, max) {
  const i = el("input", "input");
  i.type = "text";
  i.maxLength = max;
  i.value = value;
  i.autocomplete = "off";
  return i;
}

function textarea(value, max) {
  const t = el("textarea", "input textarea");
  t.maxLength = max;
  t.value = value;
  t.rows = 2;
  return t;
}

function backBar(title, to) {
  const bar = el("div", "edit-head");
  const back = button("back-btn", "‹ " + TEXT.back, () => show(to));
  bar.append(back, el("h2", "edit-title", title));
  return bar;
}

function removeButton(onConfirm) {
  const b = button("btn btn-danger", TEXT.remove, () => {
    if (b.dataset.confirm === "true") { onConfirm(); return; }
    b.dataset.confirm = "true";
    b.textContent = TEXT.confirmRemove;
    setTimeout(() => { b.dataset.confirm = ""; b.textContent = TEXT.remove; }, CONFIRM_MS);
  });
  return b;
}

function renderPoseEdit() {
  const p = poseById(editing);
  if (!p) return renderPosesList();
  const name = input(p.name, NAME_MAX);
  const desc = textarea(p.description, DESCRIPTION_MAX);
  const preview = el("canvas", "preview");
  preview.setAttribute("aria-hidden", "true");
  drawThumb(preview, p.pts, PREVIEW_PX);
  const used = library.movements.filter((m) => m.sequence.indexOf(p.id) !== -1).length;
  const top = el("div", "pose-top");
  const meta = el("div", "pose-meta");
  meta.append(field(TEXT.name, name));
  if (used) meta.append(el("p", "tenue-line", TEXT.usedIn(used)));
  top.append(preview, meta);
  const actions = el("div", "edit-actions");
  actions.append(
    removeButton(() => {
      library.poses = library.poses.filter((q) => q.id !== p.id);
      library.movements = library.movements.map((m) => Object.assign({}, m, { sequence: m.sequence.filter((id) => id !== p.id) }));
      commit();
      show(VIEW.POSES);
    }),
    button("btn btn-primary", TEXT.save, () => {
      p.name = name.value.trim().slice(0, NAME_MAX) || p.name;
      p.description = desc.value.trim().slice(0, DESCRIPTION_MAX);
      commit();
      show(VIEW.POSES);
    }),
  );
  return [backBar(p.name, VIEW.POSES), top, field(TEXT.description, desc), actions];
}

function renderMoveEdit() {
  const existing = editing ? library.movements.find((m) => m.id === editing) : null;
  const draft = existing ? { name: existing.name, description: existing.description, sequence: existing.sequence.slice() } : { name: nextName(library.movements, TEXT.movePrefix), description: "", sequence: [] };
  const name = input(draft.name, NAME_MAX);
  const desc = textarea(draft.description, DESCRIPTION_MAX);
  const seqBox = el("ol", "chips seq-edit");
  const pool = el("div", "chips pool");
  const save = button("btn btn-primary", TEXT.save, () => {
    const seq = normalizeSequence(draft.sequence);
    if (!seq.length) return;
    const data = { name: name.value.trim().slice(0, NAME_MAX) || draft.name, description: desc.value.trim().slice(0, DESCRIPTION_MAX), sequence: draft.sequence.slice() };
    if (existing) Object.assign(existing, data);
    else library.movements.push(Object.assign({ id: newId("m-") }, data));
    commit();
    show(VIEW.MOVES);
  });
  function paint() {
    if (!draft.sequence.length) seqBox.replaceChildren(el("li", "chip-empty", TEXT.sequenceEmpty));
    else seqBox.replaceChildren(...draft.sequence.map((id, i) => {
      const li = el("li", "chip chip-step");
      li.append(el("span", "chip-n", String(i + 1)), el("span", "chip-text", poseName(id)));
      const x = button("chip-x", "×", () => { draft.sequence.splice(i, 1); paint(); });
      x.setAttribute("aria-label", TEXT.removeStep + " " + poseName(id));
      li.append(x);
      return li;
    }));
    const last = draft.sequence[draft.sequence.length - 1];
    pool.replaceChildren(...library.poses.map((p) => {
      const b = button("chip chip-add", "+ " + p.name, () => { draft.sequence.push(p.id); paint(); });
      b.disabled = p.id === last;
      return b;
    }));
    save.disabled = !normalizeSequence(draft.sequence).length;
  }
  paint();
  const actions = el("div", "edit-actions");
  if (existing) actions.append(removeButton(() => {
    library.movements = library.movements.filter((m) => m.id !== existing.id);
    commit();
    show(VIEW.MOVES);
  }));
  actions.append(save);
  const seqField = el("div", "field");
  seqField.append(el("span", "field-label", TEXT.sequence), seqBox, el("span", "field-label field-hint", TEXT.sequenceHint), pool);
  return [backBar(existing ? existing.name : TEXT.newMove, VIEW.MOVES), field(TEXT.name, name), field(TEXT.description, desc), seqField, actions];
}

function renderImport(back) {
  const area = el("textarea", "input textarea paste-area");
  area.placeholder = TEXT.importHint;
  area.spellcheck = false;
  const run = button("btn btn-primary", TEXT.importAction, () => {
    const parsed = parseImport(area.value);
    if (!parsed) { setStatus(TEXT.importFailed); return; }
    const merged = mergeLibrary(library, parsed);
    library = merged.lib;
    commit();
    show(back);
    setStatus(TEXT.imported(merged.poses, merged.movements));
  });
  const actions = el("div", "edit-actions");
  actions.append(run);
  return [backBar(TEXT.importTitle, back), area, actions];
}

let importBack = VIEW.POSES;

function show(next) {
  view = next;
  const tab = view === VIEW.MOVES || view === VIEW.MOVE ? TAB.MOVES : view === VIEW.IMPORT ? (importBack === VIEW.MOVES ? TAB.MOVES : TAB.POSES) : TAB.POSES;
  ui.tabPoses.setAttribute("aria-selected", String(tab === TAB.POSES));
  ui.tabMoves.setAttribute("aria-selected", String(tab === TAB.MOVES));
  const listView = view === VIEW.POSES || view === VIEW.MOVES;
  ui.libFoot.hidden = !listView;
  ui.lib.dataset.view = view;
  let nodes;
  if (view === VIEW.POSES) nodes = renderPosesList();
  else if (view === VIEW.MOVES) nodes = renderMovesList();
  else if (view === VIEW.POSE) nodes = renderPoseEdit();
  else if (view === VIEW.MOVE) nodes = renderMoveEdit();
  else nodes = renderImport(importBack);
  ui.libMain.replaceChildren(...nodes);
  ui.libMain.scrollTop = 0;
}

function openPose(id) {
  editing = id;
  show(VIEW.POSE);
}

function openMove(id) {
  editing = id;
  show(VIEW.MOVE);
}

function openLib(tab) {
  show(tab === TAB.MOVES ? VIEW.MOVES : VIEW.POSES);
  ui.libStatus.textContent = "";
  if (!ui.lib.open) ui.lib.showModal();
}

async function copyLibrary() {
  const data = exportLibrary(library);
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(data);
      ok = true;
    }
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    const t = el("textarea");
    t.value = data;
    t.setAttribute("readonly", "");
    t.className = "offscreen";
    ui.lib.append(t);
    t.select();
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    t.remove();
  }
  setStatus(ok ? TEXT.copied : TEXT.copyFailed);
}

ui.posesBtn.addEventListener("click", () => openLib(TAB.POSES));
ui.movesBtn.addEventListener("click", () => openLib(TAB.MOVES));
ui.tabPoses.addEventListener("click", () => show(VIEW.POSES));
ui.tabMoves.addEventListener("click", () => show(VIEW.MOVES));
ui.libClose.addEventListener("click", () => ui.lib.close());
ui.lib.addEventListener("click", (e) => { if (e.target === ui.lib) ui.lib.close(); });
ui.copy.addEventListener("click", copyLibrary);
ui.paste.addEventListener("click", () => { importBack = view === VIEW.MOVES ? VIEW.MOVES : VIEW.POSES; show(VIEW.IMPORT); });
ui.copy.textContent = TEXT.copy;
ui.paste.textContent = TEXT.paste;

$("btn-info").addEventListener("click", () => $("info").showModal());
$("info").addEventListener("click", (e) => { if (e.target === $("info")) $("info").close(); });

Object.keys(LANDMARK).forEach((k) => { if (k.indexOf(LEFT_PREFIX) === 0) leftJoints.add(LANDMARK[k]); });

window.addEventListener("pagehide", () => escritorMeta.vaciar());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") escritorMeta.vaciar();
});
window.addEventListener("resize", resizeCanvas);
if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(stage);

$("bar-version").textContent = "v" + APP_VERSION;
$("info-version").textContent = "v" + APP_VERSION;
syncEngine();
renderDetailButton();
renderCapture(null);
resizeCanvas();
showMessage(TEXT.idle, TEXT.idleHint);
setRunning(false);
refreshCameras();
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => refreshCameras());
}
if (!metaRead(APP_ID)) escritorMeta.pedir();
metaDeclararProyecto(APP_ID, APP_VERSION);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=" + APP_VERSION).catch(() => {}));
}
