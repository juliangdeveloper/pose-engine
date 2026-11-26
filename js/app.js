import { createPoseEngine, SOURCE, STATUS, FACING, LENS, CAPTURE_STATE, CAPTURE_RESULT, CALIBRATION_RESULT, PREVIEW_JOINTS, HAND_PREVIEW_COUNT, HAND_BONES, POSE_EVENT, gradeFor, normalizeSequence, validCalibration } from "../engine/v2/index.js?v=0.10.0";
import { createPoseOverlay } from "../engine/v2/overlay-ui.js?v=0.10.0";
import { mountCapture } from "../engine/v2/capture-ui.js?v=0.10.0";
import { mountLibrary } from "../engine/v2/library-ui.js?v=0.10.0";
import { mountHands } from "../engine/v2/hands-ui.js?v=0.10.0";
import {
  APP_ID, APP_VERSION, CAMERA_KEY, LENS_KEY, CALIBRATION_KEY, DETAIL_KEY, DETAIL_ON, DETAIL_OFF, CALIBRATION_MAX, STATS_KEY, STAT, STATS, MAX_DPR, PERCENT, COLOR, TEXT,
  NAME_MAX, DESCRIPTION_MAX,
} from "./config.js";
import { loadLibrary, saveLibrary, exportLibrary, parseImport, mergeLibrary, newId, nextName, playable, resetLibrary } from "./library.js";
import { metaUpdate, metaRead, crearEscritor, metaDeclararProyecto } from "./meta.js";

const MIN_VIDEO_INPUTS = 2;
const VIDEO_INPUT = "videoinput";
const ZOOM_LABEL = Object.freeze({ WIDE: "0.5×", NORMAL: "1×" });
const THUMB_PX = 44;
const PREVIEW_PX = 132;
const THUMB_BONES = Object.freeze([
  ["left_shoulder", "right_shoulder"], ["left_hip", "right_hip"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
].map(([a, b]) => [PREVIEW_JOINTS.indexOf(a), PREVIEW_JOINTS.indexOf(b)]));
const NOSE_INDEX = PREVIEW_JOINTS.indexOf("nose");
const HEAD_RADIUS_RATIO = 0.06;

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("overlay");
const stage = $("stage");
const ui = {
  counter: $("counter"), counterLabel: $("counter-label"), counterValue: $("counter-value"), counterSub: $("counter-sub"),
  poseName: $("pose-name"), posePct: $("pose-pct"), meter: $("meter-fill"), seq: $("seq"), hint: $("hint"),
  msg: $("stage-msg"), msgText: $("stage-text"), msgHint: $("stage-hint"), camera: $("btn-camera"), capture: $("btn-capture"),
  flip: $("btn-flip"), zoom: $("btn-zoom"), zoomLabel: $("zoom-label"), reset: $("btn-reset"), popGrade: $("pop-grade"),
  posesBtn: $("btn-poses"), movesBtn: $("btn-moves"), posesCount: $("poses-count"), movesCount: $("moves-count"),
  calibrate: $("btn-calibrate"),
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
let running = false;
let source = null;
let lastFrame = null;
let busy = false;
let lastRep = null;
let focusId = null;
let capturedNote = null;
let calibrationNote = null;
let pendingCapture = false;
let popTimer = 0;
let flashTimer = 0;
const prevSteps = {};
const prevCounts = {};

function poseById(id) {
  return library.poses.find((p) => p.id === id) || null;
}

function poseName(id) {
  const p = poseById(id);
  return p ? p.name : "";
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

const overlay = createPoseOverlay({
  canvas,
  stage,
  video,
  alertEl: ui.stageAlert,
  getPoseById: poseById,
  getTargetPoseId: ghostTarget,
  isCalibrating: () => engine.calibrating(),
  isDetail: () => detailOn,
  style: "silhouette",
});

const captureUI = mountCapture(stage, {
  variant: "banner",
  button: ui.capture,
  texts: TEXT,
});

function renderCaptureUI(snapshot) {
  captureUI.render({
    snapshot: snapshot || null,
    calibration: { active: engine.calibrating(), snapshot: lastFrame && lastFrame.calibration },
    pending: pendingCapture,
    capturedNote,
    calibrationNote,
  });
}

const handsUI = mountHands(stage, {});

function renderHands(snapshot) {
  handsUI.render(snapshot || { state: "off" });
}

const libraryUI = mountLibrary(document.body, {
  layout: "dialog",
  getLibrary: () => library,
  replaceLibrary: (lib) => { library = lib; },
  commit: () => {
    saveLibrary(library);
    syncEngine();
  },
  onReset: () => {
    focusId = null;
    if (sideMoveId && !library.movements.some((m) => m.id === sideMoveId)) sideMoveId = null;
    renderSideList();
  },
  onChange: () => {},
  data: { exportLibrary, parseImport, mergeLibrary, newId, nextName, playable, resetLibrary },
  drawThumb: (el, pts, size) => drawThumb(el, pts, size),
  normalizeSequence: (seq) => normalizeSequence(seq),
  nameMax: NAME_MAX,
  descriptionMax: DESCRIPTION_MAX,
  texts: TEXT,
});

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
  popTimer = setTimeout(() => { ui.popGrade.hidden = true; }, 1100);
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
  flashTimer = setTimeout(() => { ui.stageFlash.classList.remove("show"); }, 650);
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
  overlay.updateAlert(frame, running);
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
  renderCaptureUI(null);
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
  overlay.resize();
  sizeModelCanvas();
  if (lastFrame) overlay.draw(lastFrame);
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
  c.lineWidth = 3 * scale;
  c.strokeStyle = COLOR.thumb;
  if (pts.length === HAND_PREVIEW_COUNT) {
    HAND_BONES.forEach(([a, b]) => {
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
    c.fillStyle = COLOR.thumbJoint;
    pts.forEach((q) => {
      if (!q) return;
      const P = at(q);
      c.beginPath();
      c.arc(P.x, P.y, Math.max(1.4 * scale, 2), 0, Math.PI * 2);
      c.fill();
    });
    return;
  }
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
    c.arc(N.x, N.y, Math.max(2.2 * scale, size * HEAD_RADIUS_RATIO), 0, Math.PI * 2);
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
  const poses = move.sequence.map(poseById).filter((p) => p && p.pts && p.pts.length === PREVIEW_JOINTS.length);
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
    overlay.clear();
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
  overlay.clear();
  showMessage(TEXT.idle, TEXT.idleHint);
  renderHud(null);
  renderHands({ state: "off" });
}

function addCapturedPose(features, kind) {
  const isHand = kind === "hand";
  const pose = Object.assign({ id: newId("p-"), name: nextName(library.poses, TEXT.posePrefix), description: "", createdAt: new Date().toISOString() }, features);
  if (isHand) {
    pose.kind = "hand";
    pose.alt = true;
  }
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
  overlay.draw(frame);
  renderHands(frame.hands);
  renderHud(frame);
  renderCaptureUI(frame.capture);
});

engine.on("capture", (c) => {
  if (c.result === CAPTURE_RESULT.CAPTURED) {
    const pose = addCapturedPose(c.features, c.kind);
    capturedNote = { at: performance.now(), ok: true, text: pose.name + " " + TEXT.captured };
  } else if (c.result === CAPTURE_RESULT.NO_BODY) {
    capturedNote = { at: performance.now(), ok: false, text: TEXT.captureFailed };
  }
  renderCaptureUI(c);
});

engine.on("calibration", (c) => {
  if (c.result === CALIBRATION_RESULT.CALIBRATED && c.calibration) {
    storeCalibration(c.calibration);
    const missing = c.calibration.missing || [];
    calibrationNote = { at: performance.now(), title: TEXT.calDone, hint: missing.length ? TEXT.missing(missing) + ". " + TEXT.calPartial : "" };
    finishPendingCapture(true);
  }
  renderCalibrationButton();
  renderCaptureUI(lastFrame && lastFrame.capture);
});

engine.on("pose", (p) => {
  if (p.type === POSE_EVENT.ENTER) restart(ui.poseName, "flash");
});

engine.on("hands-state", (s) => {
  if (!running || !lastFrame) renderHands(s);
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

async function touchHandCapture() {
  if (!running && !(await startCamera())) return;
  if (engine.calibrating()) engine.cancelCalibration();
  if (!engine.capturing()) {
    engine.startHandCapture();
    renderCaptureUI({ state: CAPTURE_STATE.WAITING, kind: "hand", needsRelease: false, holdProgress: 0, seconds: 0 });
  }
  engine.touch();
}

stage.addEventListener("pointerdown", (e) => {
  if (e.target && e.target.closest && e.target.closest("button")) return;
  void touchHandCapture();
}, false);

ui.capture.addEventListener("click", async () => {
  if (pendingCapture) {
    pendingCapture = false;
    renderCaptureUI(null);
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
    renderCaptureUI(null);
    return;
  }
  engine.startCapture();
  renderCaptureUI({ state: CAPTURE_STATE.WAITING, needsRelease: false, holdProgress: 0, seconds: 0 });
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
    renderCaptureUI(lastFrame && lastFrame.capture);
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
  if (lastFrame) overlay.draw(lastFrame);
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

ui.posesBtn.addEventListener("click", () => libraryUI.open("poses"));
ui.movesBtn.addEventListener("click", () => libraryUI.open("moves"));

$("btn-info").addEventListener("click", () => $("info").showModal());
$("info").addEventListener("click", (e) => { if (e.target === $("info")) $("info").close(); });

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
renderHands({ state: "off" });
renderCaptureUI(null);
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
