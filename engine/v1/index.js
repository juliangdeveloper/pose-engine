import { LANDMARK, LANDMARK_COUNT, CONNECTIONS, SIDE } from "./landmarks.js";
import { createLandmarkSmoother, createOneEuroFilter, SMOOTHING_DEFAULTS } from "./smoothing.js";
import { computeMeasures, requiredVisible, createSideTracker, MEASURE, SPACE } from "./measures.js";
import { createExerciseRuntime, validateExercise, testCondition, KIND, PHASE_LOST, PHASE_IDLE, PHASE_HOLDING } from "./rules.js";
import { createSyntheticSource, registerRig } from "./synthetic.js";
import { createMediaPipeDetector, DELEGATE, MODEL, TASKS_VISION_VERSION } from "./detector.js";
import { openCamera, closeCamera, retuneLens, readCameraState, emptyCameraState, FACING, LENS, CAMERA_ERROR, CameraError, CAMERA_RELEASE_MS } from "./camera.js";
import { CALISTHENICS } from "./exercises/calisthenics.js";

export const ENGINE_VERSION = "0.1.2";
export const SOURCE = Object.freeze({ CAMERA: "camera", VIDEO: "video", SYNTHETIC: "synthetic" });
export const STATUS = Object.freeze({ LOADING_MODEL: "loading-model", OPENING_CAMERA: "opening-camera", RUNNING: "running", STOPPED: "stopped" });
export const ENGINE_ERROR = Object.freeze(Object.assign({ MODEL_FAILED: "model-failed", DETECT_FAILED: "detect-failed", NO_VIDEO: "no-video", NO_EXERCISE: "no-exercise", NO_DEMO: "no-demo" }, CAMERA_ERROR));
export const DEFAULT_MESSAGES = Object.freeze({ lost: "No se ven las articulaciones", gate: "Colócate para empezar" });

const FPS_SMOOTHING = 0.1;
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
  const smoother = createLandmarkSmoother(o.smoothing);
  const worldSmoother = createLandmarkSmoother(o.smoothing);
  const sides = createSideTracker();
  let video = o.video || null;
  let current = null;
  let runtime = null;
  let detector = o.detector || null;
  let delegate = null;
  let running = false;
  let source = null;
  let stream = null;
  let synth = null;
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

  function loadExercises(input, opts) {
    if (typeof input === "string") {
      return fetch(input).then((r) => r.json()).then((json) => loadExercises(json, opts));
    }
    const defs = normalizeDefs(input);
    const errors = defs.flatMap((d) => validateExercise(d));
    if (errors.length) throw new Error(errors.join("; "));
    if (opts && opts.replace) registry.clear();
    defs.forEach((d) => registry.set(d.id, d));
    if (!current || !registry.has(current.id)) setExercise(defs.length ? defs[0].id : registry.keys().next().value);
    return listExercises();
  }

  function listExercises() {
    return Array.from(registry.values()).map((d) => ({ id: d.id, name: d.name || d.id, kind: d.kind, view: d.view || "", hasDemo: !!d.demo }));
  }

  function setExercise(id) {
    const def = registry.get(id);
    if (!def) throw fail(ENGINE_ERROR.NO_EXERCISE);
    current = def;
    runtime = createExerciseRuntime(def, o.timing);
    if (running && source === SOURCE.SYNTHETIC) {
      if (def.demo) synth = createSyntheticSource(def.demo);
      else stop();
    }
    emit("exercise", { id: def.id, name: def.name || def.id, kind: def.kind });
    emit("state", { exercise: def.id, phase: PHASE_LOST, previous: null, label: PHASE_LOST });
    return def;
  }

  function process(result, t, width, height) {
    if (!current) return null;
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
    const measures = computeMeasures(current.measures, landmarks, world, width, height, side);
    const values = {};
    Object.keys(measures).forEach((k) => { values[k] = measures[k].value; });
    const visible = !!landmarks && requiredVisible(current.requires, landmarks, side, o.minVisibility);
    const events = runtime.update(values, visible, t, messages);
    events.forEach((ev) => emit(ev.type, ev.data));
    const snap = runtime.snapshot();
    lastFrame = {
      t, width, height, source, delegate, fps, side, visible,
      mirrored: source === SOURCE.CAMERA && facing === FACING.USER,
      landmarks, worldLandmarks: world, measures,
      exercise: snap.exercise, kind: snap.kind, phase: snap.phase, phaseLabel: snap.phaseLabel,
      reps: snap.reps, hold: snap.hold, cue: snap.cue,
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
    process(synth.sample(t), t, synth.width, synth.height);
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
    if (!current) throw fail(ENGINE_ERROR.NO_EXERCISE);
    runtime.reset();
    smoother.reset();
    worldSmoother.reset();
    sides.reset();
    lastT = null;
    fps = 0;
    if (source === SOURCE.SYNTHETIC) {
      if (!current.demo) throw fail(ENGINE_ERROR.NO_DEMO);
      synth = createSyntheticSource(current.demo);
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

  function reset() {
    if (runtime) runtime.reset();
    if (current) emit("state", { exercise: current.id, phase: PHASE_LOST, previous: null, label: PHASE_LOST });
  }

  function getState() {
    const snap = runtime ? runtime.snapshot() : null;
    return Object.assign({ running, source, delegate, facingMode: facing, fps }, snap, { zoom, lens, capabilities });
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
    loadExercises, setExercise, exercises: listExercises,
    exercise: () => current,
    lastFrame: () => lastFrame,
  };
}
