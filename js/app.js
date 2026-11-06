import { createPoseEngine, CONNECTIONS, LANDMARK, SOURCE, STATUS, FACING, LENS, CAPTURE_STATE, CAPTURE_RESULT, PREVIEW_JOINTS, POSE_EVENT, gradeFor, normalizeSequence } from "../engine/v2/index.js?v=0.3.0";
import {
  APP_ID, APP_VERSION, CAMERA_KEY, LENS_KEY, STATS_KEY, STAT, STATS, JOINT_RADIUS_PX, BONE_WIDTH_PX, THUMB_BONE_PX, THUMB_JOINT_PX,
  MIN_JOINT_VISIBILITY, MAX_DPR, PERCENT, COLOR, TEXT, POP_GRADE_MS, STATUS_MS, CAPTURED_MS, CONFIRM_MS, NAME_MAX, DESCRIPTION_MAX,
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
  tabPoses: $("tab-poses"), tabMoves: $("tab-moves"), copy: $("btn-copy"), paste: $("btn-paste"),
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
let view = VIEW.POSES;
let editing = null;
let statusTimer = 0;
let popTimer = 0;

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
  renderSeq(move);
  let hint = "";
  if (engine.capturing()) hint = "";
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

function renderCapture(c) {
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
    ui.bannerTitle.textContent = c.needsRelease ? TEXT.releaseT : TEXT.waitT;
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
  ctx.lineCap = "round";
  ctx.lineWidth = BONE_WIDTH_PX;
  for (const [a, b] of CONNECTIONS) {
    const pa = lm[a];
    const pb = lm[b];
    if (!pa || !pb || pa.visibility < MIN_JOINT_VISIBILITY || pb.visibility < MIN_JOINT_VISIBILITY) continue;
    const A = px(pa);
    const B = px(pb);
    ctx.strokeStyle = leftJoints.has(a) && leftJoints.has(b) ? COLOR.boneLeft : leftJoints.has(a) || leftJoints.has(b) ? COLOR.bone : COLOR.boneRight;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }
  ctx.fillStyle = COLOR.joint;
  lm.forEach((p) => {
    if (!p || p.visibility < MIN_JOINT_VISIBILITY) return;
    const P = px(p);
    ctx.beginPath();
    ctx.arc(P.x, P.y, JOINT_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();
  });
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

function setRunning(on, src) {
  running = on;
  source = on ? src : null;
  ui.camera.textContent = on && src === SOURCE.CAMERA ? TEXT.stop : TEXT.start;
  ui.camera.classList.toggle("on", on && src === SOURCE.CAMERA);
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
  engine.stop();
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

engine.on("pose", (p) => {
  if (p.type === POSE_EVENT.ENTER) restart(ui.poseName, "flash");
});

engine.on("rep", (r) => {
  lastRep = r;
  focusId = r.movement;
  restart(ui.counter, "bump");
  popGrade(r.grade);
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
  if (engine.capturing()) {
    engine.cancelCapture();
    return;
  }
  capturedNote = null;
  if (!running && !(await startCamera())) return;
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
  } catch (e) {
    setRunning(false);
    showMessage(TEXT.errors[e.code] || TEXT.errors["camera-error"], "");
  } finally {
    busy = false;
  }
});

ui.reset.addEventListener("click", () => {
  engine.reset();
  lastRep = null;
  renderHud(lastFrame);
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
