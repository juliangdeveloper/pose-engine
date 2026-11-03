import { createPoseEngine, CONNECTIONS, LANDMARK, SOURCE, STATUS, KIND, PHASE_LOST, FACING, MEASURE } from "../engine/v1/index.js?v=0.1.1";
import {
  APP_ID, APP_VERSION, CAMERA_KEY, STATS_KEY, STAT, STATS, FEEDBACK_MS, LABEL_FONT_PX, JOINT_RADIUS_PX,
  BONE_WIDTH_PX, MIN_JOINT_VISIBILITY, MAX_DPR, SECONDS_PER_MINUTE, COLOR, TEXT,
} from "./config.js";
import { metaUpdate, metaRead, crearEscritor, demoOn } from "./meta.js";

const LEFT_PREFIX = "left_";
const MIN_VIDEO_INPUTS = 2;
const VIDEO_INPUT = "videoinput";

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("overlay");
const ctx = canvas.getContext("2d");
const stage = $("stage");
const ui = {
  picker: $("picker"), counter: document.querySelector(".counter"), counterLabel: $("counter-label"), counterValue: $("counter-value"),
  counterSub: $("counter-sub"), phase: $("phase"), cue: $("cue"), msg: $("stage-msg"), msgText: $("stage-text"),
  msgHint: $("stage-hint"), msgDemo: $("btn-msg-demo"), camera: $("btn-camera"), flip: $("btn-flip"), demo: $("btn-demo"), reset: $("btn-reset"),
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

const engine = createPoseEngine({ video, facingMode: loadFacing() });
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

function buildPicker() {
  const current = engine.exercise();
  ui.picker.replaceChildren(...engine.exercises().map((ex) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = ex.name;
    b.dataset.id = ex.id;
    b.setAttribute("aria-pressed", String(ex.id === current.id));
    b.addEventListener("click", () => chooseExercise(ex.id));
    return b;
  }));
}

function chooseExercise(id) {
  engine.setExercise(id);
  feedback = null;
  Array.from(ui.picker.children).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  renderCounter(engine.getState());
  renderCue(null);
  if (!running) showMessage(TEXT.idle, engine.exercise().view);
  else ui.msgHint.textContent = engine.exercise().view || "";
}

function showMessage(text, hint, withDemo) {
  ui.msgText.textContent = text;
  ui.msgHint.textContent = hint || "";
  ui.msgDemo.hidden = !withDemo;
  ui.msg.hidden = false;
}

function hideMessage() {
  ui.msg.hidden = true;
}

function renderCounter(state) {
  const def = engine.exercise();
  if (def.kind === KIND.HOLD) {
    ui.counterLabel.textContent = TEXT.hold;
    ui.counterValue.textContent = fmtTime(state.hold ? state.hold.seconds : 0);
    ui.counterSub.textContent = TEXT.best + " " + fmtTime(state.hold ? state.hold.best : 0);
  } else {
    ui.counterLabel.textContent = TEXT.reps;
    ui.counterValue.textContent = String(state.reps || 0);
    ui.counterSub.textContent = feedback && feedback.score ? feedback.score : "";
  }
}

function renderPhase(phase, label) {
  ui.phase.dataset.phase = phase;
  ui.phase.textContent = TEXT.phase[phase] || label || phase;
}

function renderCue(cue) {
  const now = performance.now();
  let show = cue;
  if (!show && feedback && now - feedback.at < FEEDBACK_MS) show = { text: feedback.text, level: feedback.level };
  ui.cue.textContent = show && show.text ? show.text : "";
  ui.cue.dataset.level = show && show.text ? show.level || "warn" : "";
}

function renderCameraChrome() {
  const mode = engine.getState().facingMode;
  ui.flip.setAttribute("aria-pressed", String(mode === FACING.ENVIRONMENT));
  video.classList.toggle("mirrored", mode === FACING.USER && source === SOURCE.CAMERA);
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
  if (frame.source === SOURCE.SYNTHETIC) {
    ctx.fillStyle = "#11141a";
    ctx.fillRect(0, 0, w, h);
  }
  const lm = frame.landmarks;
  if (!lm) return;
  const box = fit(frame);
  if (frame.source === SOURCE.SYNTHETIC) {
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  }
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
  ctx.font = "600 " + LABEL_FONT_PX + "px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  Object.keys(frame.measures).forEach((k) => {
    const m = frame.measures[k];
    const spec = def.measures[k];
    if (!spec || spec.type !== MEASURE.ANGLE || !spec.label || m.at < 0 || !isFinite(m.value)) return;
    const P = px(lm[m.at]);
    const text = spec.label + " " + Math.round(m.value) + "°";
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
  ui.demo.textContent = on && src === SOURCE.SYNTHETIC ? TEXT.stop : TEXT.demo;
  document.body.dataset.source = on ? src : "";
  renderCameraChrome();
}

async function startCamera() {
  if (busy) return;
  busy = true;
  feedback = null;
  showMessage(TEXT.loading, engine.exercise().view);
  try {
    await engine.start({ source: SOURCE.CAMERA });
    setRunning(true, SOURCE.CAMERA);
    hideMessage();
    refreshCameras();
  } catch (e) {
    setRunning(false);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showMessage(TEXT.errors[e.code] || TEXT.errors["camera-error"], "", true);
  } finally {
    busy = false;
  }
}

async function startDemo() {
  feedback = null;
  await engine.start({ source: SOURCE.SYNTHETIC });
  setRunning(true, SOURCE.SYNTHETIC);
  hideMessage();
}

function stopAll() {
  engine.stop();
  setRunning(false);
  lastFrame = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  showMessage(TEXT.idle, engine.exercise().view);
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

engine.on("state", (s) => renderPhase(s.phase, s.label));

engine.on("cue", (c) => renderCue(c.id ? c : null));

engine.on("rep", (r) => {
  const ok = r.checks.filter((c) => c.ok).length;
  feedback = {
    at: performance.now(),
    text: r.failed.length ? r.failed[0].text : TEXT.good,
    level: r.failed.length ? "warn" : "good",
    score: ok + "/" + r.checks.length + " forma",
  };
  renderCounter({ reps: r.count });
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
    showMessage(TEXT.errors[e.code], "", true);
  }
});

ui.camera.addEventListener("click", () => {
  if (running && source === SOURCE.CAMERA) stopAll();
  else startCamera();
});

ui.demo.addEventListener("click", () => {
  if (running && source === SOURCE.SYNTHETIC) stopAll();
  else startDemo();
});

ui.msgDemo.addEventListener("click", () => startDemo());

ui.flip.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    const facing = await engine.switchCamera();
    saveFacing(facing);
    renderCameraChrome();
  } catch (e) {
    setRunning(false);
    showMessage(TEXT.errors[e.code] || TEXT.errors["camera-error"], "", true);
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

Object.keys(LANDMARK).forEach((k) => { if (k.indexOf(LEFT_PREFIX) === 0) leftJoints.add(LANDMARK[k]); });

window.addEventListener("pagehide", () => escritorMeta.vaciar());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") escritorMeta.vaciar();
});
window.addEventListener("resize", resizeCanvas);
if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(stage);

buildPicker();
buildInfo();
renderCounter(engine.getState());
renderPhase(PHASE_LOST);
resizeCanvas();
showMessage(TEXT.idle, engine.exercise().view);
setRunning(false);
refreshCameras();
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => refreshCameras());
}
if (!metaRead(APP_ID)) escritorMeta.pedir();
if (demoOn()) startDemo();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=" + APP_VERSION).catch(() => {}));
}
