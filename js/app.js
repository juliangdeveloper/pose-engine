import { createPoseEngine, CONNECTIONS, LANDMARK, SOURCE, STATUS, KIND, PHASE_LOST, FACING, LENS, MEASURE } from "../engine/v1/index.js?v=0.2.0";
import {
  APP_ID, APP_VERSION, CAMERA_KEY, LENS_KEY, STATS_KEY, STAT, STATS, FEEDBACK_MS, LABEL_FONT_PX, JOINT_RADIUS_PX,
  BONE_WIDTH_PX, MIN_JOINT_VISIBILITY, MAX_DPR, SECONDS_PER_MINUTE, COLOR, TEXT, ICON, ICON_DEFAULT, POP_DETECT_MS, POP_GRADE_MS,
} from "./config.js";
import { metaUpdate, metaRead, crearEscritor, metaDeclararProyecto } from "./meta.js";

const LEFT_PREFIX = "left_";
const MIN_VIDEO_INPUTS = 2;
const VIDEO_INPUT = "videoinput";
const ZOOM_LABEL = Object.freeze({ WIDE: "0.5×", NORMAL: "1×" });

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");
const stage = $("stage");
const ui = {
  detect: $("detect"), detectIcon: $("detect-icon"), detectName: $("detect-name"), list: $("btn-list"),
  moves: $("moves"), movesList: $("moves-list"), popDetect: $("pop-detect"), popDetectIcon: $("pop-detect-icon"),
  popDetectName: $("pop-detect-name"), popGrade: $("pop-grade"), counter: document.querySelector(".counter"), counterLabel: $("counter-label"), counterValue: $("counter-value"),
  counterSub: $("counter-sub"), phase: $("phase"), cue: $("cue"), msg: $("stage-msg"), msgText: $("stage-text"),
  msgHint: $("stage-hint"), camera: $("btn-camera"), flip: $("btn-flip"), zoom: $("btn-zoom"),
  zoomLabel: $("zoom-label"), reset: $("btn-reset"),
};

function loadFacing() {
  try {
    const saved = localStorage.getItem(CAMERA_KEY);
    if (saved === FACING.USER || saved === FACING.ENVIRONMENT) return saved;
  } catch (e) {
    return FACING.USER;
  }
  return FACING.USER;
}

function saveFacing(mode) {
  try {
    localStorage.setItem(CAMERA_KEY, mode);
    return true;
  } catch (e) {
    return false;
  }
}

function loadLens() {
  try {
    const saved = localStorage.getItem(LENS_KEY);
    if (saved === LENS.WIDE || saved === LENS.NORMAL) return saved;
  } catch (e) {
    return LENS.NORMAL;
  }
  return LENS.NORMAL;
}

function saveLens(mode) {
  try {
    localStorage.setItem(LENS_KEY, mode);
    return true;
  } catch (e) {
    return false;
  }
}

const engine = createPoseEngine({ video, facingMode: loadFacing(), lens: loadLens() });
const leftJoints = new Set();
let running = false;
let source = null;
let feedback = null;
let lastFrame = null;
let busy = false;

function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY));
    if (s && typeof s === "object") return { [STAT.REPS_TOTAL]: s[STAT.REPS_TOTAL] || 0, [STAT.BEST_HOLD_S]: s[STAT.BEST_HOLD_S] || 0 };
  } catch (e) {
    return { [STAT.REPS_TOTAL]: 0, [STAT.BEST_HOLD_S]: 0 };
  }
  return { [STAT.REPS_TOTAL]: 0, [STAT.BEST_HOLD_S]: 0 };
}

const stats = loadStats();
function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    return true;
  } catch (e) {
    return false;
  }
}

const escritorMeta = crearEscritor(() => {
  saveStats();
  metaUpdate(APP_ID, APP_VERSION, { stats }, { declare: STATS });
});

function fmtTime(s) {
  const total = Math.floor(s);
  const m = Math.floor(total / SECONDS_PER_MINUTE);
  const r = total % SECONDS_PER_MINUTE;
  return m + ":" + String(r).padStart(2, "0");
}

function iconMarkup(id) {
  return ICON[id] || ICON_DEFAULT;
}

function buildMoves() {
  ui.movesList.replaceChildren(...engine.exercises().filter((ex) => ex.detects).map((ex) => {
    const li = document.createElement("li");
    li.className = "move";
    const icon = document.createElement("span");
    icon.className = "move-icon";
    icon.innerHTML = iconMarkup(ex.id);
    const body = document.createElement("div");
    body.className = "move-body";
    const name = document.createElement("p");
    name.className = "move-name";
    name.textContent = ex.name;
    const detect = document.createElement("p");
    detect.className = "move-text";
    detect.textContent = ex.about.detect;
    const grade = document.createElement("p");
    grade.className = "move-text tenue-text";
    grade.textContent = ex.about.grade;
    body.append(name, detect, grade);
    li.append(icon, body);
    return li;
  }));
}

function renderDetected(d) {
  ui.detect.dataset.on = d && d.id ? "true" : "false";
  ui.detectIcon.innerHTML = iconMarkup(d && d.id);
  ui.detectName.textContent = d && d.id ? d.name : running ? TEXT.searching : TEXT.waiting;
}

function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

let popDetectTimer = 0;
let popGradeTimer = 0;

function popDetect(d) {
  ui.popDetectIcon.innerHTML = iconMarkup(d.id);
  ui.popDetectName.textContent = d.name;
  ui.popDetect.hidden = false;
  restart(ui.popDetect, "show");
  restart(ui.detect, "flash");
  clearTimeout(popDetectTimer);
  popDetectTimer = setTimeout(() => { ui.popDetect.hidden = true; }, POP_DETECT_MS);
}

function popGrade(g) {
  ui.popGrade.textContent = g.label;
  ui.popGrade.dataset.level = g.level;
  ui.popGrade.hidden = false;
  restart(ui.popGrade, "show");
  clearTimeout(popGradeTimer);
  popGradeTimer = setTimeout(() => { ui.popGrade.hidden = true; }, POP_GRADE_MS);
}

function showMessage(text, hint) {
  ui.msgText.textContent = text;
  ui.msgHint.textContent = hint || "";
  ui.msg.hidden = false;
}

function hideMessage() {
  ui.msg.hidden = true;
}

function renderCounter(state) {
  if (state.kind === KIND.HOLD) {
    ui.counterLabel.textContent = TEXT.hold;
    ui.counterValue.textContent = fmtTime(state.hold ? state.hold.seconds : 0);
    ui.counterSub.textContent = TEXT.best + " " + fmtTime(state.hold ? state.hold.best : 0);
  } else {
    ui.counterLabel.textContent = TEXT.reps;
    ui.counterValue.textContent = String(state.reps || 0);
    ui.counterSub.textContent = feedback && feedback.label ? feedback.label : "";
    ui.counterSub.dataset.level = feedback && feedback.level ? feedback.level : "";
  }
}

function renderPhase(phase, label) {
  ui.phase.dataset.phase = phase;
  ui.phase.textContent = TEXT.phase[phase] || label || phase;
}

function renderCue(cue) {
  const now = performance.now();
  let show = cue;
  if (!show && feedback && now - feedback.at < FEEDBACK_MS) show = { text: feedback.text, level: feedback.cue };
  ui.cue.textContent = show && show.text ? show.text : "";
  ui.cue.dataset.level = show && show.text ? show.level || "warn" : "";
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
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
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
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  ctx.clearRect(0, 0, w, h);
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
  const def = engine.exercise();
  if (!def) return;
  ctx.font = "600 " + LABEL_FONT_PX + "px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  Object.keys(frame.measures).forEach((k) => {
    const m = frame.measures[k];
    const spec = def.measures[k];
    if (!spec || spec.type !== MEASURE.ANGLE || !spec.label || m.at < 0 || !isFinite(m.value)) return;
    const P = px(lm[m.at]);
    const text = (m.label || spec.label) + " " + Math.round(m.value) + "°";
    const tw = ctx.measureText(text).width;
    const bx = Math.min(Math.max(P.x + 10, 4), w - tw - 16);
    const by = Math.min(Math.max(P.y - 12, 12), h - 12);
    ctx.fillStyle = COLOR.label;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by - 11, tw + 12, 22, 11);
    else ctx.rect(bx, by - 11, tw + 12, 22);
    ctx.fill();
    ctx.fillStyle = COLOR.labelText;
    ctx.fillText(text, bx + 6, by);
  });
}

function setRunning(on, src) {
  running = on;
  source = on ? src : null;
  ui.camera.textContent = on && src === SOURCE.CAMERA ? TEXT.stop : TEXT.start;
  ui.camera.classList.toggle("on", on && src === SOURCE.CAMERA);
  document.body.dataset.source = on ? src : "";
  renderCameraChrome();
  renderDetected(engine.getState().detected);
}

async function startCamera() {
  if (busy) return;
  busy = true;
  feedback = null;
  showMessage(TEXT.loading, TEXT.idleHint);
  try {
    await engine.start({ source: SOURCE.CAMERA });
    setRunning(true, SOURCE.CAMERA);
    hideMessage();
    refreshCameras();
  } catch (e) {
    setRunning(false);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showMessage(TEXT.errors[e.code] || TEXT.errors["camera-error"], "");
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
  renderDetected(engine.getState().detected);
}

engine.on("status", (s) => {
  if (s.state === STATUS.OPENING_CAMERA) ui.msgText.textContent = TEXT.opening;
  if (s.state === STATUS.LOADING_MODEL) ui.msgText.textContent = TEXT.loading;
});

engine.on("frame", (frame) => {
  lastFrame = frame;
  draw(frame);
  if (frame.kind === KIND.HOLD) renderCounter(frame);
});

engine.on("exercise", (e) => {
  feedback = null;
  renderDetected(e);
  renderCounter(engine.getState());
  if (e.id) popDetect(e);
});

engine.on("grade", (g) => {
  feedback = { at: performance.now(), label: g.label, level: g.level, text: g.tip || TEXT.gradeText[g.level], cue: g.tip ? "warn" : "good" };
  renderCounter(engine.getState());
  popGrade(g);
  renderCue(engine.getState().cue);
});

engine.on("state", (s) => renderPhase(s.phase, s.label));

engine.on("cue", (c) => renderCue(c.id ? c : null));

engine.on("rep", (r) => {
  if (!r.grade) feedback = { at: performance.now(), label: "", level: "", text: r.failed.length ? r.failed[0].text : TEXT.good, cue: r.failed.length ? "warn" : "good" };
  renderCounter({ kind: KIND.REPS, reps: r.count });
  ui.counter.classList.remove("bump");
  void ui.counter.offsetWidth;
  ui.counter.classList.add("bump");
  renderCue(engine.getState().cue);
  if (source === SOURCE.CAMERA) {
    stats[STAT.REPS_TOTAL] += 1;
    escritorMeta.pedir();
  }
});

engine.on("hold", (h) => {
  if (source === SOURCE.CAMERA && h.best > stats[STAT.BEST_HOLD_S]) {
    stats[STAT.BEST_HOLD_S] = Math.floor(h.best);
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

ui.zoom.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    const next = engine.getState().lens === LENS.WIDE ? LENS.NORMAL : LENS.WIDE;
    await engine.setLens(next);
    saveLens(next);
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
    saveFacing(facing);
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
  feedback = null;
  renderCounter(engine.getState());
  renderCue(null);
});

function buildInfo() {
  $("info-version").textContent = "v" + APP_VERSION;
}

$("btn-info").addEventListener("click", () => $("info").showModal());
ui.list.addEventListener("click", () => ui.moves.showModal());
ui.moves.addEventListener("click", (e) => { if (e.target === ui.moves) ui.moves.close(); });

Object.keys(LANDMARK).forEach((k) => { if (k.indexOf(LEFT_PREFIX) === 0) leftJoints.add(LANDMARK[k]); });

window.addEventListener("pagehide", () => escritorMeta.vaciar());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") escritorMeta.vaciar();
});
window.addEventListener("resize", resizeCanvas);
if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(stage);

$("bar-version").textContent = "v" + APP_VERSION;
buildMoves();
buildInfo();
renderCounter(engine.getState());
renderPhase(PHASE_LOST);
renderDetected(null);
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
