export const TASKS_VISION_VERSION = "1.2.0";
export const TASKS_VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + TASKS_VISION_VERSION + "/vision_bundle.mjs";
export const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + TASKS_VISION_VERSION + "/wasm";
export const MODEL = Object.freeze({
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
});
export const DELEGATE = Object.freeze({ GPU: "GPU", CPU: "CPU" });

const DETECTOR_DEFAULTS = Object.freeze({
  model: "lite",
  delegate: DELEGATE.GPU,
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

export function createMediaPipeDetector(options) {
  const o = Object.assign({}, DETECTOR_DEFAULTS, options);
  let vision = null;
  let fileset = null;
  let landmarker = null;
  let delegate = null;
  let lastTs = -1;

  async function build(d) {
    return vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.modelUrl || MODEL[o.model] || MODEL.lite, delegate: d },
      runningMode: "VIDEO",
      numPoses: o.numPoses,
      minPoseDetectionConfidence: o.minPoseDetectionConfidence,
      minPosePresenceConfidence: o.minPosePresenceConfidence,
      minTrackingConfidence: o.minTrackingConfidence,
    });
  }

  async function fallbackToCpu() {
    try { if (landmarker) landmarker.close(); } catch (e) { landmarker = null; }
    landmarker = await build(DELEGATE.CPU);
    delegate = DELEGATE.CPU;
    lastTs = -1;
  }

  return {
    async init() {
      if (landmarker) return { delegate };
      vision = await import(o.tasksVisionUrl || TASKS_VISION_URL);
      fileset = await vision.FilesetResolver.forVisionTasks(o.wasmBase || WASM_BASE);
      if (o.delegate === DELEGATE.GPU) {
        try {
          landmarker = await build(DELEGATE.GPU);
          delegate = DELEGATE.GPU;
        } catch (e) {
          await fallbackToCpu();
        }
      } else {
        await fallbackToCpu();
      }
      return { delegate };
    },
    async recover() {
      if (delegate === DELEGATE.GPU) {
        await fallbackToCpu();
        return true;
      }
      return false;
    },
    detect(source, tMs) {
      if (!landmarker) return null;
      const ts = Math.max(Math.round(tMs), lastTs + 1);
      lastTs = ts;
      const r = landmarker.detectForVideo(source, ts);
      if (!r || !r.landmarks || !r.landmarks.length) return { landmarks: null, worldLandmarks: null };
      return { landmarks: r.landmarks[0], worldLandmarks: r.worldLandmarks && r.worldLandmarks[0] ? r.worldLandmarks[0] : null };
    },
    get delegate() {
      return delegate;
    },
    close() {
      try { if (landmarker) landmarker.close(); } catch (e) { landmarker = null; }
      landmarker = null;
    },
  };
}
