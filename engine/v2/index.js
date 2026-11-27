import { LANDMARK, LANDMARK_COUNT, CONNECTIONS } from "./landmarks.js";
import { createLandmarkSmoother, createOneEuroFilter, createVisibilityHold, SMOOTHING_DEFAULTS, HOLD_DEFAULTS } from "./smoothing.js";
import { poseFeatures, handFeatures, averageFeatures, compareFeatures, upgradeFeatures, isTPose, isHandFeature, bodyFrame, SEGMENT, SEGMENT_NAMES, HAND_PREVIEW_COUNT, HAND_BONES, MATCH_TOLERANCE, TPOSE_MAX_DEG, PREVIEW_JOINTS, FEATURES_VERSION } from "./features.js";
import { gradeFor, GRADE, GRADE_LABEL, GRADE_EXCELENTE_MIN, GRADE_BIEN_MIN } from "./grading.js";
import { createPoseMatcher, MATCH_DEFAULTS } from "./matcher.js";
import { createMovementTracker, normalizeSequence, MIN_SEQUENCE } from "./movements.js";
import { createCaptureFlow, CAPTURE_STATE, CAPTURE_RESULT, CAPTURE_KIND, CAPTURE_DEFAULTS } from "./capture.js";
import { createCalibrationFlow, computeCalibration, validCalibration, missingParts, CALIBRATION_STATE, CALIBRATION_RESULT, CALIBRATION_DEFAULTS, CALIBRATION_VERSION, BODY_PART } from "./calibration.js";
import { createMediaPipeDetector, DELEGATE, MODEL, TASKS_VISION_VERSION } from "./detector.js";
import { createDepthEstimator, DEPTH_DEFAULTS } from "./depth.js";
import { createMotionTracker } from "./motion.js";
import { createHandLandmarker, createDistanceGate, bodyScale, HAND_MODEL, HAND_STATE, HAND_DEFAULTS } from "./hands.js";
import { openCamera, closeCamera, retuneLens, readCameraState, emptyCameraState, FACING, LENS, CAMERA_ERROR, CameraError, CAMERA_RELEASE_MS } from "./camera.js";
import { OVERLAY_DEFAULTS, DETAIL_JOINTS, angleAt, jointAngles, targetJointAngles, angleWithin, drawAngleArcs, segmentForConnection, segmentSpeeds, speedStyle, velocityStyles, drawVelocitySkeleton, drawHandSkeleton, depthIndicators, drawDepthIndicators, coincidenceFromMapped, coincidenceFromBad, drawMatchJoints, drawMatchPercent, buildDetail } from "./overlay.js";
import { createKeyDispatcher, parseKeys, formatKeys, parseCombo, KEY_DEFAULTS, KEY_ACTIONS } from "./keys.js";
import { createBackgroundRemover, createSegmenter, maskToUint8, maskStats, silhouetteColliders, drawSilhouette, BG_MODE, BG_DEFAULTS, SEGMENTER_MODEL } from "./background.js";

export const ENGINE_VERSION = "0.11.0";
export const SOURCE = Object.freeze({ CAMERA: "camera", VIDEO: "video" });
export const STATUS = Object.freeze({ LOADING_MODEL: "loading-model", OPENING_CAMERA: "opening-camera", RUNNING: "running", STOPPED: "stopped" });
export const ENGINE_ERROR = Object.freeze(Object.assign({ MODEL_FAILED: "model-failed", DETECT_FAILED: "detect-failed", NO_VIDEO: "no-video" }, CAMERA_ERROR));
export const POSE_EVENT = Object.freeze({ ENTER: "enter", LEAVE: "leave" });

const FPS_SMOOTHING = 0.1;
const MS_PER_S = 1000;

export { LANDMARK, LANDMARK_COUNT, CONNECTIONS, SMOOTHING_DEFAULTS, HOLD_DEFAULTS, DEPTH_DEFAULTS, DELEGATE, MODEL, TASKS_VISION_VERSION, FACING, LENS };
export { SEGMENT, SEGMENT_NAMES, HAND_PREVIEW_COUNT, HAND_BONES, MATCH_TOLERANCE, MATCH_DEFAULTS, TPOSE_MAX_DEG, PREVIEW_JOINTS, FEATURES_VERSION, MIN_SEQUENCE };
export { GRADE, GRADE_LABEL, GRADE_EXCELENTE_MIN, GRADE_BIEN_MIN, CAPTURE_STATE, CAPTURE_RESULT, CAPTURE_KIND, CAPTURE_DEFAULTS };
export { CALIBRATION_STATE, CALIBRATION_RESULT, CALIBRATION_DEFAULTS, CALIBRATION_VERSION, BODY_PART };
export { poseFeatures, handFeatures, averageFeatures, compareFeatures, upgradeFeatures, isTPose, isHandFeature, bodyFrame, gradeFor, normalizeSequence };
export { createCalibrationFlow, computeCalibration, validCalibration, missingParts };
export { createPoseMatcher, createMovementTracker, createCaptureFlow, createMediaPipeDetector, createOneEuroFilter, createLandmarkSmoother, createVisibilityHold, createDepthEstimator, createMotionTracker };
export { HAND_MODEL, HAND_STATE, HAND_DEFAULTS, bodyScale, createHandLandmarker, createDistanceGate };
export { KEY_DEFAULTS, KEY_ACTIONS, parseKeys, formatKeys, parseCombo, createKeyDispatcher };
export { BG_MODE, BG_DEFAULTS, SEGMENTER_MODEL, createSegmenter, createBackgroundRemover, maskToUint8, maskStats, silhouetteColliders, drawSilhouette };
export { OVERLAY_DEFAULTS, DETAIL_JOINTS, angleAt, jointAngles, targetJointAngles, angleWithin, drawAngleArcs, segmentForConnection, segmentSpeeds, speedStyle, velocityStyles, drawVelocitySkeleton, drawHandSkeleton, depthIndicators, drawDepthIndicators, coincidenceFromMapped, coincidenceFromBad, drawMatchJoints, drawMatchPercent, buildDetail };

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
  const hold = createVisibilityHold(o.hold);
  const worldHold = createVisibilityHold(o.hold);
  const depth = createDepthEstimator(o.depth);
  const motionTracker = createMotionTracker();
  const bodyMatcher = createPoseMatcher(o.match);
  const handMatcher = createPoseMatcher(o.match);
  const tracker = createMovementTracker();
  const capture = createCaptureFlow(o.capture);
  const calibrator = createCalibrationFlow(o.calibrationOptions);
  let calibration = validCalibration(o.calibration) ? o.calibration : null;
  let lastCalibrationKey = "";
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
  const handOptions = Object.assign({}, HAND_DEFAULTS, o.handOptions);
  const gate = createDistanceGate(handOptions);
  let hasHands = false;
  let landmarker = null;
  let handReady = false;
  let handBusy = false;
  let handState = HAND_STATE.OFF;
  let handTick = 0;
  let handFeaturesCache = null;
  let handLandmarksCache = null;
  let pendingTouch = false;
  let keySeq = 0;
  let bgInitPromise = null;
  let lastSilhouette = null;
  const keyDispatcher = createKeyDispatcher(Object.assign({}, o.keys, { onKey: (entry) => { keySeq += 1; emit("key", Object.assign({}, entry, { seq: keySeq })); } }));
  const background = o.background ? createBackgroundRemover(o.background) : createBackgroundRemover({ mode: BG_MODE.SEGMENTATION, enabled: true, preprocess: "off" });

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
    poses = (Array.isArray(list) ? list : []).filter((p) => p && typeof p.id === "string" && p.seg && typeof p.seg === "object").map(upgradeFeatures);
    bodyMatcher.setPoses(poses.filter((p) => p.kind !== CAPTURE_KIND.HAND));
    handMatcher.setPoses(poses.filter((p) => p.kind === CAPTURE_KIND.HAND));
    tracker.setMovements(movements, poses.map((p) => p.id));
    hasHands = poses.some((p) => p.kind === CAPTURE_KIND.HAND);
    if (hasHands && !landmarker) loadLandmarker();
    if (!hasHands) {
      gate.reset();
      handFeaturesCache = null;
      handLandmarksCache = null;
    }
    settleHandState();
    return poses.length;
  }

  function setMovements(list) {
    movements = (Array.isArray(list) ? list : []).filter((m) => m && typeof m.id === "string");
    tracker.setMovements(movements, poses.map((p) => p.id));
    return movements.length;
  }

  function settleHandState() {
    const previous = handState;
    if (!hasHands) handState = HAND_STATE.OFF;
    else if (!handReady) handState = landmarker ? HAND_STATE.LOADING : HAND_STATE.FAILED;
    else handState = gate.near() ? HAND_STATE.NEAR : HAND_STATE.FAR;
    if (handState !== previous) emit("hands-state", { state: handState });
  }

  function loadLandmarker() {
    const d = o.detectorOptions || {};
    const r = createHandLandmarker(Object.assign({ tasksVisionUrl: d.tasksVisionUrl, wasmBase: d.wasmBase, delegate: d.delegate }, o.handLandmarkerOptions));
    landmarker = r;
    handReady = false;
    settleHandState();
    r.init().then(() => {
      if (landmarker !== r) return;
      handReady = true;
      settleHandState();
    }, () => {
      if (landmarker !== r) return;
      landmarker = null;
      settleHandState();
    });
  }

  function detectHand(src, t) {
    let r = null;
    try {
      r = landmarker.detect(src, t);
    } catch (e) {
      handBusy = true;
      const current = landmarker;
      current.recover().then((ok) => {
        handBusy = false;
        if (!ok && landmarker === current) { landmarker = null; handReady = false; settleHandState(); }
      }, () => {
        handBusy = false;
        if (landmarker === current) { landmarker = null; handReady = false; settleHandState(); }
      });
      return;
    }
    handLandmarksCache = r ? r.landmarks : null;
    handFeaturesCache = r && r.landmarks ? handFeatures(r.landmarks, r.worldLandmarks, { mirrored: mirroredNow() }) : null;
  }

  function stepHands(src, t, landmarks, width, height) {
    const capturingHand = capture.active() && capture.kind() === CAPTURE_KIND.HAND;
    if (hasHands || capturingHand) {
      const near = gate.update(bodyScale(landmarks, width, height, handOptions.minVisibility), t);
      if (!near && !capturingHand) {
        handFeaturesCache = null;
        handLandmarksCache = null;
      }
      settleHandState();
      if ((near || capturingHand) && src && handReady && !handBusy) {
        handTick = (handTick + 1) % Math.max(1, handOptions.everyFrames);
        if (handTick === 0) detectHand(src, t);
      }
    } else {
      gate.reset();
      handFeaturesCache = null;
      handLandmarksCache = null;
      handState = HAND_STATE.OFF;
    }
    return { state: handState, has: hasHands, near: gate.near(), ready: handReady, active: !!handFeaturesCache };
  }

  function mirroredNow() {
    return source === SOURCE.CAMERA && facing === FACING.USER;
  }

  function captureKey(s) {
    return s.state + ":" + s.seconds;
  }

  function calibrationKey(s) {
    return s.state + ":" + Math.round(s.progress * 20) + ":" + s.missing.join(",");
  }

  function poseById(id) {
    return poses.find((p) => p.id === id) || null;
  }

  function process(result, t, width, height, src) {
    if (lastT !== null) {
      const dt = t - lastT;
      if (dt > 0) fps = fps ? fps + FPS_SMOOTHING * (MS_PER_S / dt - fps) : MS_PER_S / dt;
    }
    lastT = t;
    const raw = result && result.landmarks;
    let landmarks = null;
    let world = null;
    if (raw) {
      landmarks = smoother.smooth(hold.hold(raw, t), t);
      world = result.worldLandmarks ? worldSmoother.smooth(worldHold.hold(result.worldLandmarks, t), t) : null;
    } else {
      smoother.reset();
      worldSmoother.reset();
      hold.reset();
      worldHold.reset();
    }
    const mirrored = mirroredNow();
    if (world && landmarks) world = depth.apply(landmarks, world, calibration, width && height ? width / height : 1);
    const features = landmarks ? poseFeatures(landmarks, world, { mirrored, calibration }) : null;
    const body = world ? bodyFrame(world, calibration && calibration.chirality) : null;
    const motion = motionTracker.update(world, body, t);
    const cal = calibrator.update(features, landmarks, world, t);
    if (cal.result) calibration = cal.result.calibration;
    const calKey = calibrationKey(cal.snapshot);
    if (calKey !== lastCalibrationKey || cal.result) {
      lastCalibrationKey = calKey;
      emit("calibration", Object.assign({}, cal.snapshot, { result: cal.result ? cal.result.type : null, calibration: cal.result ? cal.result.calibration : null }));
    }
    const hands = stepHands(src, t, landmarks, width, height);
    const capKind = capture.kind();
    let touched = pendingTouch;
    if (capKind === CAPTURE_KIND.HAND && !handReady) touched = false;
    else pendingTouch = false;
    const captureFeatures = capKind === CAPTURE_KIND.HAND ? handFeaturesCache : features;
    const cap = capture.update(captureFeatures, t, touched);
    const key = captureKey(cap.snapshot);
    if (key !== lastCaptureKey || cap.result) {
      lastCaptureKey = key;
      emit("capture", Object.assign({}, cap.snapshot, { result: cap.result ? cap.result.type : null, features: cap.result ? cap.result.features : null, kind: cap.result ? cap.result.kind : cap.snapshot.kind }));
    }
    const bodyMatch = bodyMatcher.update(features, t);
    const handMatch = handMatcher.update(handFeaturesCache, t);
    const proximity = Object.assign({}, bodyMatch.proximity, handMatch.proximity);
    const best = handMatch.best && bodyMatch.best ? (handMatch.best.proximity >= bodyMatch.best.proximity ? handMatch.best : bodyMatch.best) : (handMatch.best || bodyMatch.best);
    const active = handMatch.active && bodyMatch.active ? handMatch.active : (handMatch.active || bodyMatch.active);
    [bodyMatch, handMatch].forEach((m) => {
      if (m.left) {
        emit("pose", Object.assign({ type: POSE_EVENT.LEAVE }, m.left));
        keyDispatcher.leave(m.left.id);
      }
      if (m.entered) {
        emit("pose", Object.assign({ type: POSE_EVENT.ENTER }, m.entered));
        const pose = poseById(m.entered.id);
        if (pose && parseKeys(pose.keys).length) keyDispatcher.enter(pose.id, pose.keys, pose.hold === true);
        if (!capture.active() && !calibrator.active()) tracker.enter(m.entered.id, m.entered.proximity, t).reps.forEach((r) => emit("rep", r));
      }
      if (m.active) tracker.track(m.active.id, m.active.proximity);
    });
    lastFrame = {
      t, width, height, source, delegate, fps, mirrored, landmarks, worldLandmarks: world, features, handFeatures: handFeaturesCache, handLandmarks: handLandmarksCache, motion,
      tpose: isTPose(features), proximity, best, active, bodyActive: bodyMatch.active, handActive: handMatch.active, bodyBest: bodyMatch.best, handBest: handMatch.best,
      movements: tracker.snapshot(), capture: cap.snapshot, calibration: cal.snapshot, calibrated: !!calibration, hands, silhouette: lastSilhouette,
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
        try { lastSilhouette = background.process(video, t, video.videoWidth, video.videoHeight) || lastSilhouette; } catch (eBg) {}
        let detectSource = video;
        if (background.shouldPreprocess() && lastSilhouette) {
          const composite = background.composite(video, lastSilhouette);
          if (composite) detectSource = composite;
        }
        result = detector.detect(detectSource, t);
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
      process(result, t, video.videoWidth, video.videoHeight, video);
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
    hold.reset();
    worldHold.reset();
    depth.reset();
    motionTracker.reset();
    bodyMatcher.reset();
    handMatcher.reset();
    gate.reset();
    handFeaturesCache = null;
    handLandmarksCache = null;
    pendingTouch = false;
    settleHandState();
    keyDispatcher.stopAll();
    background.reset();
    lastSilhouette = null;
    bgInitPromise = background.init().catch(() => null);
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
    if (calibrator.active()) cancelCalibration();
    gate.reset();
    handFeaturesCache = null;
    handLandmarksCache = null;
    pendingTouch = false;
    settleHandState();
    keyDispatcher.stopAll();
    background.reset();
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

  function startCapture(captureOptions) {
    if (calibrator.active()) cancelCalibration();
    capture.start(captureOptions);
    lastCaptureKey = "";
  }

  function startHandCapture(captureOptions) {
    if (calibrator.active()) cancelCalibration();
    capture.start(Object.assign({}, captureOptions, { kind: CAPTURE_KIND.HAND }));
    if (!landmarker) loadLandmarker();
    lastCaptureKey = "";
  }

  function touch() {
    pendingTouch = true;
  }

  function startCalibration() {
    if (capture.active()) cancelCapture();
    calibrator.start();
    lastCalibrationKey = "";
  }

  function cancelCalibration() {
    calibrator.cancel();
    lastCalibrationKey = "";
    emit("calibration", { state: CALIBRATION_STATE.IDLE, progress: 0, missing: [], result: null, calibration: null });
  }

  function setCalibration(next) {
    calibration = validCalibration(next) ? next : null;
    return calibration;
  }

  function cancelCapture() {
    capture.cancel();
    lastCaptureKey = "";
    emit("capture", { state: CAPTURE_STATE.IDLE, remainingMs: 0, seconds: 0, holdProgress: 0, needsRelease: false, result: null, features: null, kind: CAPTURE_KIND.BODY });
  }

  function reset() {
    tracker.reset();
    bodyMatcher.reset();
    handMatcher.reset();
  }

  function getHands() {
    return { state: handState, has: hasHands, near: gate.near(), ready: handReady, active: !!handFeaturesCache };
  }

  function handsNear() {
    return !!(hasHands && gate.near());
  }

  function getState() {
    return {
      running, source, delegate, facingMode: facing, fps, zoom, lens, capabilities, deviceId: videoDeviceId(stream),
      poses: poses.length, movements: tracker.snapshot(), active: bodyMatcher.active() || handMatcher.active(), bodyActive: bodyMatcher.active(), handActive: handMatcher.active(), capturing: capture.active(),
      calibrating: calibrator.active(), calibration, hands: getHands(),
      keys: keyDispatcher.pending(), heldKeys: keyDispatcher.held(), silhouette: !!lastSilhouette, backgroundMode: background.modeValue, backgroundReady: background.ready(),
    };
  }

  function getSilhouette() {
    return lastSilhouette;
  }

  function setPlate(imageA, imageB) {
    return background.setPlate(imageA, imageB);
  }

  function getKeyDispatcher() {
    return keyDispatcher;
  }

  function getBackground() {
    return background;
  }

  function feed(result, t, width, height) {
    return process(result, t === undefined ? performance.now() : t, width || 1, height || 1);
  }

  function destroy() {
    stop(true);
    keyDispatcher.destroy();
    background.close();
    if (detector && detector.close) detector.close();
    detector = null;
    if (landmarker) landmarker.close();
    landmarker = null;
    handReady = false;
    Object.keys(listeners).forEach((k) => delete listeners[k]);
  }

  setPoses(o.poses);
  setMovements(o.movements);

  return {
    on, off, start, stop, reset, feed, destroy, switchCamera, setLens, getState,
    setPoses, setMovements, startCapture, startHandCapture, touch, cancelCapture, startCalibration, cancelCalibration, setCalibration,
    capturing: () => capture.active(),
    calibrating: () => calibrator.active(),
    getCalibration: () => calibration,
    getHands,
    handsNear,
    lastFrame: () => lastFrame,
    getSilhouette,
    setPlate,
    getKeyDispatcher,
    getBackground,
  };
}
