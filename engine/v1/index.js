import { LANDMARK, LANDMARK_COUNT, CONNECTIONS, SIDE } from "./landmarks.js";
import { createLandmarkSmoother, createOneEuroFilter, SMOOTHING_DEFAULTS } from "./smoothing.js";
import { computeMeasures, requiredVisible, createSideTracker, MEASURE, SPACE } from "./measures.js";
import { createExerciseRuntime, validateExercise, testCondition, KIND, PHASE_LOST, PHASE_IDLE, PHASE_HOLDING } from "./rules.js";
import { createSyntheticSource, registerRig, SEGMENT_MS } from "./synthetic.js";
import { createClassifier, scoreRecognition, FEATURES, FEATURE_STAT, RECOGNITION_DEFAULTS } from "./classifier.js";
import { gradeForm, GRADE, GRADE_LABEL, GRADE_STAT, GRADE_POINTS, GRADE_EXCELENTE_MIN, GRADE_BIEN_MIN } from "./grading.js";
import { createMediaPipeDetector, DELEGATE, MODEL, TASKS_VISION_VERSION } from "./detector.js";
import { openCamera, closeCamera, retuneLens, readCameraState, emptyCameraState, FACING, LENS, CAMERA_ERROR, CameraError, CAMERA_RELEASE_MS } from "./camera.js";
import { CALISTHENICS } from "./exercises/calisthenics.js";

export const ENGINE_VERSION = "0.2.0";
export const MODE = Object.freeze({ AUTO: "auto", FIXED: "fixed" });
export const SOURCE = Object.freeze({ CAMERA: "camera", VIDEO: "video", SYNTHETIC: "synthetic" });
export const STATUS = Object.freeze({ LOADING_MODEL: "loading-model", OPENING_CAMERA: "opening-camera", RUNNING: "running", STOPPED: "stopped" });
export const ENGINE_ERROR = Object.freeze(Object.assign({ MODEL_FAILED: "model-failed", DETECT_FAILED: "detect-failed", NO_VIDEO: "no-video", NO_EXERCISE: "no-exercise", NO_DEMO: "no-demo" }, CAMERA_ERROR));
export const DEFAULT_MESSAGES = Object.freeze({ lost: "No se ven las articulaciones", gate: "Colócate para empezar" });

const FPS_SMOOTHING = 0.1;
const KEEP_SCORE = 0.4;
const STALE_MS = 3500;
const RETRO_MS = 3500;
const RETRO_SCORE = 0.6;
const MS_PER_S = 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function videoDeviceId(media) {
  if (!media || typeof media.getVideoTracks !== "function") return "";
  const track = media.getVideoTracks()[0];
  if (!track || typeof track.getSettings !== "function") return "";
  const settings = track.getSettings();
  return settings && settings.deviceId ? settings.deviceId : "";
}

export { LANDMARK, LANDMARK_COUNT, CONNECTIONS, SIDE, MEASURE, SPACE, KIND, PHASE_LOST, PHASE_IDLE, PHASE_HOLDING, DELEGATE, MODEL, FACING, LENS, TASKS_VISION_VERSION, SMOOTHING_DEFAULTS };
export { FEATURES, FEATURE_STAT, RECOGNITION_DEFAULTS, GRADE, GRADE_LABEL, GRADE_STAT, GRADE_POINTS, GRADE_EXCELENTE_MIN, GRADE_BIEN_MIN, SEGMENT_MS };
export { scoreRecognition, gradeForm, createClassifier };
export { CALISTHENICS, validateExercise, testCondition, registerRig, createSyntheticSource, createMediaPipeDetector, createOneEuroFilter, createLandmarkSmoother };

function normalizeDefs(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.exercises)) return input.exercises;
  if (input && typeof input === "object" && input.id) return [input];
  return [];
}

export function createPoseEngine(options) {
  const o = Object.assign({ exercises: CALISTHENICS, smoothing: SMOOTHING_DEFAULTS, source: SOURCE.CAMERA, facingMode: FACING.USER, lens: LENS.NORMAL }, options);
  const messages = Object.assign({}, DEFAULT_MESSAGES, o.messages);
  const listeners = {};
  const registry = new Map();
  const runtimes = new Map();
  const smoother = createLandmarkSmoother(o.smoothing);
  const worldSmoother = createLandmarkSmoother(o.smoothing);
  const sides = createSideTracker();
  const classifier = createClassifier({ recognition: o.recognition, features: o.features });
  let mode = o.mode === MODE.FIXED || (o.mode !== MODE.AUTO && o.exercise) ? MODE.FIXED : MODE.AUTO;
  let video = o.video || null;
  let current = null;
  let confidence = 0;
  let scores = {};
  let counts = {};
  let pending = {};
  let lowSince = {};
  let detector = o.detector || null;
  let delegate = null;
  let running = false;
  let source = null;
  let stream = null;
  let synth = null;
  let synthOverride = false;
  let runId = 0;
  let facing = o.facingMode;
  let lens = o.lens === LENS.WIDE ? LENS.WIDE : LENS.NORMAL;
  let zoom = null;
  let capabilities = emptyCameraState().capabilities;
  let fps = 0;
  let lastT = null;
  let lastVideoTime = -1;
  let lastFrame = null;

  function cameraOptions(extra) {
    const opts = { facingMode: facing, lens };
    if (typeof o.width === "number") opts.width = o.width;
    if (typeof o.height === "number") opts.height = o.height;
    return Object.assign(opts, extra || {});
  }

  async function syncCamera(media) {
    const info = await readCameraState(media, facing);
    zoom = info.zoom;
    capabilities = info.capabilities;
  }

  function clearCameraReadout() {
    zoom = null;
    capabilities = emptyCameraState().capabilities;
  }

  function emit(type, data) {
    const list = listeners[type];
    if (!list) return;
    list.slice().forEach((fn) => {
      try { fn(data); } catch (e) { if (typeof console !== "undefined") console.error(e); }
    });
  }

  function on(type, fn) {
    (listeners[type] || (listeners[type] = [])).push(fn);
    return () => off(type, fn);
  }

  function off(type, fn) {
    const list = listeners[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  function fail(code, cause) {
    const err = cause instanceof Error && cause.code === code ? cause : Object.assign(new Error(code), { code, cause });
    emit("error", { code, message: cause && cause.message ? cause.message : code });
    return err;
  }

  function describe(d) {
    return {
      id: d.id, name: d.name || d.id, kind: d.kind, view: d.view || "", hasDemo: !!d.demo,
      detects: Array.isArray(d.recognize) && d.recognize.length > 0, grades: Array.isArray(d.grade) && d.grade.length > 0,
      about: d.about ? { detect: d.about.detect || "", grade: d.about.grade || "" } : { detect: "", grade: "" },
    };
  }

  function loadExercises(input, opts) {
    if (typeof input === "string") {
      return fetch(input).then((r) => r.json()).then((json) => loadExercises(json, opts));
    }
    const defs = normalizeDefs(input);
    const errors = defs.flatMap((d) => validateExercise(d));
    if (errors.length) throw new Error(errors.join("; "));
    if (opts && opts.replace) { registry.clear(); runtimes.clear(); }
    defs.forEach((d) => {
      registry.set(d.id, d);
      runtimes.set(d.id, createExerciseRuntime(d, o.timing));
    });
    classifier.setDefs(Array.from(registry.values()));
    if (current && !registry.has(current.id)) current = null;
    if (mode === MODE.FIXED && !current && registry.size) setExercise(registry.keys().next().value);
    return listExercises();
  }

  function listExercises() {
    return Array.from(registry.values()).map(describe);
  }

  function emitExercise() {
    const d = current;
    emit("exercise", d ? { id: d.id, name: d.name || d.id, kind: d.kind, mode, confidence } : { id: null, name: null, kind: null, mode, confidence: 0 });
    if (d) {
      const snap = runtimes.get(d.id).snapshot();
      emit("state", { exercise: d.id, phase: snap.phase, previous: null, label: snap.phaseLabel });
      emit("cue", snap.cue ? Object.assign({ exercise: d.id }, snap.cue) : { exercise: d.id, id: null, text: null, level: null });
    } else {
      emit("state", { exercise: null, phase: PHASE_LOST, previous: null, label: PHASE_LOST });
      emit("cue", { exercise: null, id: null, text: null, level: null });
    }
  }

  function emitRep(data) {
    counts[data.exercise] = (counts[data.exercise] || 0) + 1;
    data.count = counts[data.exercise];
    emit("rep", data);
    if (data.grade) emit("grade", Object.assign({ exercise: data.exercise, kind: KIND.REPS, rep: data.count }, data.grade));
  }

  function activate(id, t) {
    const def = id ? registry.get(id) : null;
    current = def || null;
    if (def) {
      lowSince[def.id] = null;
      const queued = (pending[def.id] || []).filter((p) => t - p.t <= RETRO_MS && p.score >= RETRO_SCORE).map((p) => p.data);
      pending[def.id] = [];
      emitExercise();
      queued.forEach(emitRep);
    } else {
      emitExercise();
    }
  }

  function setExercise(id) {
    const def = registry.get(id);
    if (!def) throw fail(ENGINE_ERROR.NO_EXERCISE);
    mode = MODE.FIXED;
    confidence = 1;
    runtimes.get(id).reset();
    pending[id] = [];
    current = def;
    if (running && source === SOURCE.SYNTHETIC && !synthOverride) {
      if (def.demo) synth = createSyntheticSource(def.demo);
      else stop();
    }
    emitExercise();
    return def;
  }

  function setAuto() {
    mode = MODE.AUTO;
    classifier.reset();
    runtimes.forEach((r) => r.reset());
    pending = {};
    lowSince = {};
    confidence = 0;
    current = null;
    if (running && source === SOURCE.SYNTHETIC && !synthOverride) synth = createSyntheticSource(autoDemo());
    emitExercise();
    return mode;
  }

  function route(def, events, t) {
    const isActive = current && current.id === def.id;
    events.forEach((ev) => {
      if (ev.type === "rep") {
        if (isActive) emitRep(ev.data);
        else (pending[def.id] || (pending[def.id] = [])).push({ t, score: scores[def.id] || 0, data: ev.data });
        return;
      }
      if (ev.type === "grade" && ev.data.kind === KIND.REPS) return;
      if (isActive) emit(ev.type, ev.data);
    });
  }

  function retire(def, t) {
    if (current && current.id === def.id) return;
    const score = scores[def.id] || 0;
    if (score >= KEEP_SCORE) { lowSince[def.id] = null; return; }
    if (lowSince[def.id] == null) lowSince[def.id] = t;
    const limit = def.kind === KIND.HOLD ? 0 : STALE_MS;
    if (t - lowSince[def.id] >= limit) {
      runtimes.get(def.id).reset();
      pending[def.id] = [];
    }
  }

  function process(result, t, width, height) {
    if (!registry.size) return null;
    if (lastT !== null) {
      const dt = t - lastT;
      if (dt > 0) fps = fps ? fps + FPS_SMOOTHING * (MS_PER_S / dt - fps) : MS_PER_S / dt;
    }
    lastT = t;
    const raw = result && result.landmarks;
    let landmarks = null;
    let world = null;
    if (raw) {
      landmarks = smoother.smooth(raw, t);
      world = result.worldLandmarks ? worldSmoother.smooth(result.worldLandmarks, t) : null;
    } else {
      smoother.reset();
      worldSmoother.reset();
    }
    const side = sides.update(landmarks);
    const defs = mode === MODE.FIXED ? (current ? [current] : []) : Array.from(registry.values());
    const perDef = {};
    defs.forEach((def) => {
      const measures = computeMeasures(def.measures, landmarks, world, width, height, side);
      const values = {};
      Object.keys(measures).forEach((k) => { values[k] = measures[k].value; });
      const visible = !!landmarks && requiredVisible(def.requires, landmarks, side, o.minVisibility);
      perDef[def.id] = { measures, visible };
      route(def, runtimes.get(def.id).update(values, visible, t, messages), t);
    });
    let features = {};
    if (mode === MODE.AUTO) {
      features = landmarks ? classifier.measure(landmarks, world, width, height, side) : {};
      const r = classifier.update({ t, values: features, landmarks, side, minVisibility: o.minVisibility });
      scores = r.scores;
      confidence = r.confidence;
      if (r.changed) activate(r.active, t);
      defs.forEach((def) => retire(def, t));
    } else {
      scores = current ? { [current.id]: 1 } : {};
    }
    const snap = current ? runtimes.get(current.id).snapshot() : null;
    const info = current ? perDef[current.id] : null;
    lastFrame = {
      t, width, height, source, delegate, fps, side, visible: info ? info.visible : !!landmarks,
      mirrored: source === SOURCE.CAMERA && facing === FACING.USER,
      landmarks, worldLandmarks: world, measures: info ? info.measures : {}, features,
      mode, detected: current ? { id: current.id, name: current.name || current.id, kind: current.kind, confidence } : null, scores: Object.assign({}, scores),
      exercise: snap ? snap.exercise : null, kind: snap ? snap.kind : null, phase: snap ? snap.phase : PHASE_LOST, phaseLabel: snap ? snap.phaseLabel : PHASE_LOST,
      reps: snap ? counts[snap.exercise] || 0 : 0, hold: snap ? snap.hold : { active: false, seconds: 0, best: 0 }, cue: snap ? snap.cue : null,
    };
    emit("frame", lastFrame);
    return lastFrame;
  }

  function scheduleVideo(id) {
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => tickVideo(id));
    else requestAnimationFrame(() => tickVideo(id));
  }

  function tickVideo(id) {
    if (id !== runId || !running) return;
    if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      let result;
      const t = performance.now();
      try {
        result = detector.detect(video, t);
      } catch (e) {
        const recover = detector.recover ? detector.recover() : Promise.resolve(false);
        recover.then((ok) => {
          if (ok && id === runId) {
            delegate = detector.delegate || delegate;
            emit("ready", { delegate, recovered: true });
            scheduleVideo(id);
          } else if (id === runId) {
            fail(ENGINE_ERROR.DETECT_FAILED, e);
            stop();
          }
        }, (e2) => { fail(ENGINE_ERROR.DETECT_FAILED, e2); stop(); });
        return;
      }
      process(result, t, video.videoWidth, video.videoHeight);
    }
    scheduleVideo(id);
  }

  function tickSynthetic(id) {
    if (id !== runId || !running) return;
    const t = performance.now();
    const sample = synth.sample(t);
    process(sample, t, sample.width || synth.width, sample.height || synth.height);
    requestAnimationFrame(() => tickSynthetic(id));
  }

  async function ensureDetector() {
    if (!detector) detector = createMediaPipeDetector(o.detectorOptions);
    emit("status", { state: STATUS.LOADING_MODEL, source });
    try {
      const info = await detector.init();
      delegate = (info && info.delegate) || detector.delegate || null;
    } catch (e) {
      throw fail(ENGINE_ERROR.MODEL_FAILED, e);
    }
    emit("ready", { delegate });
  }

  async function start(startOptions) {
    const so = Object.assign({}, startOptions);
    stop(true);
    const id = ++runId;
    source = so.source || o.source;
    if (so.facingMode) facing = so.facingMode;
    if (so.lens === LENS.WIDE || so.lens === LENS.NORMAL) lens = so.lens;
    if (so.video) video = so.video;
    if (!registry.size || (mode === MODE.FIXED && !current)) throw fail(ENGINE_ERROR.NO_EXERCISE);
    resetCounters();
    if (mode === MODE.AUTO) { classifier.reset(); current = null; confidence = 0; emitExercise(); }
    smoother.reset();
    worldSmoother.reset();
    sides.reset();
    lastT = null;
    fps = 0;
    if (source === SOURCE.SYNTHETIC) {
      synthOverride = !!so.demo;
      const demo = so.demo || (mode === MODE.FIXED ? current.demo : autoDemo());
      if (!demo) throw fail(ENGINE_ERROR.NO_DEMO);
      synth = createSyntheticSource(demo);
      delegate = null;
      running = true;
      emit("status", { state: STATUS.RUNNING, source });
      tickSynthetic(id);
      return getState();
    }
    if (!video) throw fail(ENGINE_ERROR.NO_VIDEO);
    await ensureDetector();
    if (id !== runId) return getState();
    if (source === SOURCE.CAMERA) {
      emit("status", { state: STATUS.OPENING_CAMERA, source });
      try {
        stream = await openCamera(video, cameraOptions());
        await syncCamera(stream);
      } catch (e) {
        throw fail(e instanceof CameraError ? e.code : ENGINE_ERROR.UNKNOWN, e);
      }
      if (id !== runId) { closeCamera(video, stream); stream = null; clearCameraReadout(); return getState(); }
    }
    lastVideoTime = -1;
    running = true;
    emit("status", { state: STATUS.RUNNING, source, delegate });
    scheduleVideo(id);
    return getState();
  }

  function stop(silent) {
    const was = running;
    runId++;
    running = false;
    if (stream) { closeCamera(video, stream); stream = null; }
    clearCameraReadout();
    synth = null;
    if (was && !silent) emit("status", { state: STATUS.STOPPED, source });
  }

  async function switchCamera() {
    const next = facing === FACING.USER ? FACING.ENVIRONMENT : FACING.USER;
    if (!(running && source === SOURCE.CAMERA)) {
      facing = next;
      return facing;
    }
    const previous = facing;
    const live = stream || (video && video.srcObject) || null;
    const currentDeviceId = videoDeviceId(live);
    facing = next;
    stream = null;
    if (video && video.pause) video.pause();
    closeCamera(video, live);
    if (video && video.srcObject) closeCamera(video, video.srcObject);
    if (live) await wait(CAMERA_RELEASE_MS);
    try {
      stream = await openCamera(video, cameraOptions({ currentDeviceId }));
      await syncCamera(stream);
    } catch (e) {
      facing = previous;
      stop(true);
      throw fail(e instanceof CameraError ? e.code : ENGINE_ERROR.UNKNOWN, e);
    }
    return facing;
  }

  async function setLens(next) {
    const normalized = next === LENS.WIDE ? LENS.WIDE : LENS.NORMAL;
    const previous = lens;
    lens = normalized;
    if (!(running && source === SOURCE.CAMERA) || !stream || !video) return getState();
    try {
      stream = await retuneLens(video, stream, cameraOptions());
      await syncCamera(stream);
    } catch (e) {
      lens = previous;
      stop(true);
      throw fail(e instanceof CameraError ? e.code : ENGINE_ERROR.UNKNOWN, e);
    }
    return getState();
  }

  function autoDemo() {
    const list = Array.from(registry.values()).filter((d) => d.demo).map((d) => Object.assign({ durationMs: SEGMENT_MS }, d.demo));
    return list.length ? list : null;
  }

  function resetCounters() {
    runtimes.forEach((r) => r.reset());
    counts = {};
    pending = {};
    lowSince = {};
  }

  function reset() {
    resetCounters();
    if (current) emit("state", { exercise: current.id, phase: PHASE_LOST, previous: null, label: PHASE_LOST });
  }

  function getState() {
    const snap = current ? runtimes.get(current.id).snapshot() : null;
    const base = { running, source, delegate, facingMode: facing, fps, mode, detected: current ? { id: current.id, name: current.name || current.id, kind: current.kind, confidence } : null, scores: Object.assign({}, scores), counts: Object.assign({}, counts) };
    const extra = snap ? Object.assign({}, snap, { reps: counts[snap.exercise] || 0 }) : { exercise: null, kind: null, phase: PHASE_LOST, phaseLabel: PHASE_LOST, reps: 0, hold: { active: false, seconds: 0, best: 0 }, cue: null };
    return Object.assign(base, extra, { zoom, lens, capabilities });
  }

  function feed(result, t, width, height) {
    return process(result, t === undefined ? performance.now() : t, width || 1, height || 1);
  }

  function destroy() {
    stop(true);
    if (detector && detector.close) detector.close();
    detector = null;
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  }

  loadExercises(o.exercises);
  if (o.exercise) setExercise(o.exercise);

  return {
    on, off, start, stop, reset, feed, destroy, switchCamera, setLens, getState,
    loadExercises, setExercise, setAuto, exercises: listExercises,
    mode: () => mode,
    exercise: () => current,
    lastFrame: () => lastFrame,
  };
}
