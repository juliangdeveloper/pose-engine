import { LANDMARK, LANDMARK_COUNT, CONNECTIONS } from "./landmarks.js";
import { createLandmarkSmoother, createOneEuroFilter, SMOOTHING_DEFAULTS } from "./smoothing.js";
import { poseFeatures, averageFeatures, compareFeatures, isTPose, bodyFrame, SEGMENT, SEGMENT_NAMES, MATCH_TOLERANCE, TPOSE_MAX_DEG, PREVIEW_JOINTS, FEATURES_VERSION } from "./features.js";
import { gradeFor, GRADE, GRADE_LABEL, GRADE_EXCELENTE_MIN, GRADE_BIEN_MIN } from "./grading.js";
import { createPoseMatcher, MATCH_DEFAULTS } from "./matcher.js";
import { createMovementTracker, normalizeSequence, MIN_SEQUENCE } from "./movements.js";
import { createCaptureFlow, CAPTURE_STATE, CAPTURE_RESULT, CAPTURE_DEFAULTS } from "./capture.js";
import { createMediaPipeDetector, DELEGATE, MODEL, TASKS_VISION_VERSION } from "./detector.js";
import { openCamera, closeCamera, retuneLens, readCameraState, emptyCameraState, FACING, LENS, CAMERA_ERROR, CameraError, CAMERA_RELEASE_MS } from "./camera.js";

export const ENGINE_VERSION = "0.3.0";
export const SOURCE = Object.freeze({ CAMERA: "camera", VIDEO: "video" });
export const STATUS = Object.freeze({ LOADING_MODEL: "loading-model", OPENING_CAMERA: "opening-camera", RUNNING: "running", STOPPED: "stopped" });
export const ENGINE_ERROR = Object.freeze(Object.assign({ MODEL_FAILED: "model-failed", DETECT_FAILED: "detect-failed", NO_VIDEO: "no-video" }, CAMERA_ERROR));
export const POSE_EVENT = Object.freeze({ ENTER: "enter", LEAVE: "leave" });

const FPS_SMOOTHING = 0.1;
const MS_PER_S = 1000;

export { LANDMARK, LANDMARK_COUNT, CONNECTIONS, SMOOTHING_DEFAULTS, DELEGATE, MODEL, TASKS_VISION_VERSION, FACING, LENS };
export { SEGMENT, SEGMENT_NAMES, MATCH_TOLERANCE, MATCH_DEFAULTS, TPOSE_MAX_DEG, PREVIEW_JOINTS, FEATURES_VERSION, MIN_SEQUENCE };
export { GRADE, GRADE_LABEL, GRADE_EXCELENTE_MIN, GRADE_BIEN_MIN, CAPTURE_STATE, CAPTURE_RESULT, CAPTURE_DEFAULTS };
export { poseFeatures, averageFeatures, compareFeatures, isTPose, bodyFrame, gradeFor, normalizeSequence };
export { createPoseMatcher, createMovementTracker, createCaptureFlow, createMediaPipeDetector, createOneEuroFilter, createLandmarkSmoother };

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

export function createPoseEngine(options) {
  const o = Object.assign({ smoothing: SMOOTHING_DEFAULTS, source: SOURCE.CAMERA, facingMode: FACING.USER, lens: LENS.NORMAL }, options);
  const listeners = {};
  const smoother = createLandmarkSmoother(o.smoothing);
  const worldSmoother = createLandmarkSmoother(o.smoothing);
  const matcher = createPoseMatcher(o.match);
  const tracker = createMovementTracker();
  const capture = createCaptureFlow(o.capture);
  let poses = [];
  let movements = [];
  let video = o.video || null;
  let detector = o.detector || null;
  let delegate = null;
  let running = false;
  let source = null;
  let stream = null;
  let runId = 0;
  let facing = o.facingMode;
  let lens = o.lens === LENS.WIDE ? LENS.WIDE : LENS.NORMAL;
  let zoom = null;
  let capabilities = emptyCameraState().capabilities;
  let fps = 0;
  let lastT = null;
  let lastVideoTime = -1;
  let lastFrame = null;
  let lastCaptureKey = "";

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

  function setPoses(list) {
    poses = (Array.isArray(list) ? list : []).filter((p) => p && typeof p.id === "string" && p.seg && typeof p.seg === "object");
    matcher.setPoses(poses);
    tracker.setMovements(movements, poses.map((p) => p.id));
    return poses.length;
  }

  function setMovements(list) {
    movements = (Array.isArray(list) ? list : []).filter((m) => m && typeof m.id === "string");
    tracker.setMovements(movements, poses.map((p) => p.id));
    return movements.length;
  }

  function mirroredNow() {
    return source === SOURCE.CAMERA && facing === FACING.USER;
  }

  function captureKey(s) {
    return s.state + ":" + s.seconds;
  }

  function process(result, t, width, height) {
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
    const mirrored = mirroredNow();
    const features = landmarks ? poseFeatures(landmarks, world, { mirrored }) : null;
    const cap = capture.update(features, t);
    const key = captureKey(cap.snapshot);
    if (key !== lastCaptureKey || cap.result) {
      lastCaptureKey = key;
      emit("capture", Object.assign({}, cap.snapshot, { result: cap.result ? cap.result.type : null, features: cap.result ? cap.result.features : null }));
    }
    const match = matcher.update(features, t);
    if (match.left) emit("pose", Object.assign({ type: POSE_EVENT.LEAVE }, match.left));
    if (match.entered) {
      emit("pose", Object.assign({ type: POSE_EVENT.ENTER }, match.entered));
      if (!capture.active()) tracker.enter(match.entered.id, match.entered.proximity, t).reps.forEach((r) => emit("rep", r));
    }
    if (match.active) tracker.track(match.active.id, match.active.proximity);
    lastFrame = {
      t, width, height, source, delegate, fps, mirrored, landmarks, worldLandmarks: world, features,
      tpose: isTPose(features), proximity: match.proximity, best: match.best, active: match.active,
      movements: tracker.snapshot(), capture: cap.snapshot,
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
    smoother.reset();
    worldSmoother.reset();
    matcher.reset();
    lastT = null;
    fps = 0;
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
    if (capture.active()) cancelCapture();
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

  function startCapture() {
    capture.start();
    lastCaptureKey = "";
  }

  function cancelCapture() {
    capture.cancel();
    lastCaptureKey = "";
    emit("capture", { state: CAPTURE_STATE.IDLE, remainingMs: 0, seconds: 0, holdProgress: 0, needsRelease: false, result: null, features: null });
  }

  function reset() {
    tracker.reset();
    matcher.reset();
  }

  function getState() {
    return {
      running, source, delegate, facingMode: facing, fps, zoom, lens, capabilities,
      poses: poses.length, movements: tracker.snapshot(), active: matcher.active(), capturing: capture.active(),
    };
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

  setPoses(o.poses);
  setMovements(o.movements);

  return {
    on, off, start, stop, reset, feed, destroy, switchCamera, setLens, getState,
    setPoses, setMovements, startCapture, cancelCapture,
    capturing: () => capture.active(),
    lastFrame: () => lastFrame,
  };
}
