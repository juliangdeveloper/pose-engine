import { TASKS_VISION_URL, WASM_BASE, DELEGATE } from "./detector.js";

export const BG_MODE = Object.freeze({ OFF: "off", SEGMENTATION: "segmentation", PLATE: "plate" });
export const SEGMENTER_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
export const BG_DEFAULTS = Object.freeze({ mode: BG_MODE.SEGMENTATION, width: 160, everyFrames: 3, enabled: true, preprocess: "off", threshold: 128, plateThreshold: 36 });

const HALF = 2;
const QUARTER = 4;
const ALPHA_FOREGROUND = 150;

function maskImageData(mask) {
  try {
    if (mask && typeof mask.getAsImageData === "function") return mask.getAsImageData();
  } catch (e) {}
  return null;
}

function maskFloatArray(mask) {
  try {
    if (mask && typeof mask.getAsFloat32Array === "function") return mask.getAsFloat32Array();
  } catch (e) {}
  try {
    if (mask && typeof mask.getAsUint8Array === "function") return mask.getAsUint8Array();
  } catch (e) {}
  return null;
}

export function maskToUint8(mask, count) {
  if (!mask || !(count > 0)) return null;
  const floats = maskFloatArray(mask);
  if (floats && floats.length >= count) {
    const out = new Uint8ClampedArray(count);
    for (let i = 0; i < count; i++) {
      const v = floats[i];
      out[i] = v <= 1 ? Math.round(v * 255) : Math.round(Math.min(255, Math.max(0, v)));
    }
    return out;
  }
  const image = maskImageData(mask);
  if (!image || !image.data || image.data.length < count * QUARTER) return null;
  const d = image.data;
  let hasAlpha = false;
  let hasRed = false;
  for (let i = 0; i < count; i++) {
    if (d[i * QUARTER + 3] !== 0) hasAlpha = true;
    if (d[i * QUARTER] !== 0) hasRed = true;
    if (hasAlpha && hasRed) break;
  }
  const out = new Uint8ClampedArray(count);
  if (hasAlpha && !hasRed) {
    for (let i = 0; i < count; i++) out[i] = d[i * QUARTER + 3];
  } else if (hasRed) {
    for (let i = 0; i < count; i++) out[i] = d[i * QUARTER];
  } else {
    for (let i = 0; i < count; i++) out[i] = d[i * QUARTER + 3];
  }
  return out;
}

export function createSegmenter(options) {
  const o = Object.assign({ delegate: DELEGATE.GPU }, options || {});
  let vision = null;
  let fileset = null;
  let segmenter = null;
  let delegate = null;
  let lastTs = -1;

  function build(d) {
    return vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.modelUrl || SEGMENTER_MODEL, delegate: d },
      runningMode: "VIDEO",
      outputCategoryMask: true,
      outputConfidenceMasks: true,
    });
  }

  async function toCpu() {
    try { if (segmenter) segmenter.close(); } catch (e) { segmenter = null; }
    segmenter = await build(DELEGATE.CPU);
    delegate = DELEGATE.CPU;
    lastTs = -1;
  }

  return {
    async init() {
      if (segmenter) return { delegate };
      vision = await import(o.tasksVisionUrl || TASKS_VISION_URL);
      fileset = await vision.FilesetResolver.forVisionTasks(o.wasmBase || WASM_BASE);
      if (o.delegate === DELEGATE.GPU) {
        try {
          segmenter = await build(DELEGATE.GPU);
          delegate = DELEGATE.GPU;
        } catch (e) {
          await toCpu();
        }
      } else {
        await toCpu();
      }
      return { delegate };
    },
    async recover() {
      if (delegate === DELEGATE.GPU) {
        await toCpu();
        return true;
      }
      return false;
    },
    segmentMask(source, tMs, count) {
      if (!segmenter) return null;
      const ts = Math.max(Math.round(tMs), lastTs + 1);
      lastTs = ts;
      const r = segmenter.segmentForVideo(source, ts);
      if (!r) return null;
      const masks = r.categoryMask ? [r.categoryMask] : (r.confidenceMasks && r.confidenceMasks.length ? r.confidenceMasks : []);
      for (let i = 0; i < masks.length; i++) {
        const out = maskToUint8(masks[i], count);
        if (out) return out;
      }
      return null;
    },
    get delegate() {
      return delegate;
    },
    close() {
      try { if (segmenter) segmenter.close(); } catch (e) { segmenter = null; }
      segmenter = null;
    },
  };
}

export function maskStats(data, width, height, threshold) {
  const t = typeof threshold === "number" ? threshold : BG_DEFAULTS.threshold;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  let area = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] >= t) {
        area += 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (area === 0 || x1 < 0) return { bbox: null, area: 0 };
  return { bbox: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, area };
}

export function silhouetteColliders(silhouette, options) {
  const o = Object.assign({ cell: 8, max: 32, threshold: 192 }, options || {});
  if (!silhouette || !silhouette.data || !(silhouette.width > 0) || !(silhouette.height > 0)) return [];
  const w = silhouette.width;
  const h = silhouette.height;
  const data = silhouette.data;
  const threshold = o.threshold;
  const cell = Math.max(1, o.cell);
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const occupied = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let hit = false;
      for (let y = cy * cell; y < Math.min(h, (cy + 1) * cell) && !hit; y++) {
        for (let x = cx * cell; x < Math.min(w, (cx + 1) * cell); x++) {
          if (data[y * w + x] >= threshold) { hit = true; break; }
        }
      }
      occupied[cy * cols + cx] = hit ? 1 : 0;
    }
  }
  const runs = [];
  let open = [];
  for (let cy = 0; cy < rows; cy++) {
    const next = [];
    for (let cx = 0; cx < cols; cx++) {
      if (!occupied[cy * cols + cx]) continue;
      const prev = open.find((r) => cx >= r.x0 && cx <= r.x1);
      if (prev) {
        prev.x1 = Math.max(prev.x1, cx);
        prev.y1 = cy;
        next.push(prev);
      } else {
        const run = { x0: cx, x1: cx, y0: cy, y1: cy };
        next.push(run);
        runs.push(run);
      }
    }
    open = next;
  }
  const colliders = runs.map((r) => {
    const x = r.x0 * cell;
    const y = r.y0 * cell;
    const width = Math.min(w, (r.x1 + 1) * cell) - x;
    const height = Math.min(h, (r.y1 + 1) * cell) - y;
    return { x, y, w: width, h: height, nx: x / w, ny: y / h, nw: width / w, nh: height / h, area: width * height };
  }).sort((a, b) => b.area - a.area).slice(0, Math.max(1, o.max));
  return colliders;
}

export function drawSilhouette(ctx, silhouette, box, options) {
  const o = Object.assign({ r: 8, g: 10, b: 14, a: ALPHA_FOREGROUND }, options || {});
  const mirrored = !!(o.mirrored || (silhouette && silhouette.mirrored));
  if (!ctx || !silhouette || !silhouette.data || !box || !(box.w > 0) || !(box.h > 0)) return;
  const w = silhouette.width;
  const h = silhouette.height;
  const data = silhouette.data;
  if (!data || data.length < w * h) return;
  if (typeof document === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  if (!c) return;
  const image = c.createImageData(w, h);
  const d = image.data;
  const threshold = typeof o.threshold === "number" ? o.threshold : BG_DEFAULTS.threshold;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = mirrored ? y * w + (w - 1 - x) : y * w + x;
      const dst = y * w + x;
      if (data[src] >= threshold) {
        d[dst * QUARTER] = o.r;
        d[dst * QUARTER + 1] = o.g;
        d[dst * QUARTER + 2] = o.b;
        d[dst * QUARTER + 3] = o.a;
      }
    }
  }
  c.putImageData(image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 1;
  ctx.drawImage(canvas, box.x, box.y, box.w, box.h);
  ctx.restore();
}

export function createBackgroundRemover(options) {
  const o = Object.assign({}, BG_DEFAULTS, options || {});
  const mode = o.mode === BG_MODE.PLATE ? BG_MODE.PLATE : o.mode === BG_MODE.OFF ? BG_MODE.OFF : BG_MODE.SEGMENTATION;
  const width = Math.max(16, Math.round(o.width) || BG_DEFAULTS.width);
  let segmenter = null;
  let ready = false;
  let failed = false;
  let plateData = null;
  let plateW = 0;
  let plateH = 0;
  let lastSilhouette = null;
  let frameCount = 0;

  function enabled() {
    return o.enabled !== false && mode !== BG_MODE.OFF;
  }

  async function init() {
    if (!enabled()) return { delegate: null };
    if (mode !== BG_MODE.SEGMENTATION) { ready = true; failed = false; return { delegate: null }; }
    if (!segmenter) segmenter = createSegmenter(o.segmenterOptions || o.detectorOptions || {});
    try {
      const info = await segmenter.init();
      ready = true;
      failed = false;
      return info;
    } catch (e) {
      failed = true;
      ready = false;
      throw e;
    }
  }

  function setPlate(imageA, imageB) {
    try {
      if (!imageA) return false;
      const srcW = imageA.videoWidth || imageA.width;
      const srcH = imageA.videoHeight || imageA.height;
      if (!srcW || !srcH) return false;
      const height = Math.max(16, Math.round(width * srcH / srcW));
      const canvasA = document.createElement("canvas");
      canvasA.width = width;
      canvasA.height = height;
      const ctxA = canvasA.getContext("2d", { willReadFrequently: true });
      ctxA.drawImage(imageA, 0, 0, width, height);
      const dataA = ctxA.getImageData(0, 0, width, height).data;
      if (!imageB) {
        plateData = new Uint8ClampedArray(dataA);
        plateW = width;
        plateH = height;
        return true;
      }
      const canvasB = document.createElement("canvas");
      canvasB.width = width;
      canvasB.height = height;
      const ctxB = canvasB.getContext("2d", { willReadFrequently: true });
      ctxB.drawImage(imageB, 0, 0, width, height);
      const dataB = ctxB.getImageData(0, 0, width, height).data;
      plateData = new Uint8ClampedArray(width * height * QUARTER);
      for (let i = 0; i < width * height * QUARTER; i++) plateData[i] = Math.round((dataA[i] + dataB[i]) / HALF);
      plateW = width;
      plateH = height;
      return true;
    } catch (e) {
      return false;
    }
  }

  function plateMask(source) {
    if (!plateData || !source) return null;
    const srcW = source.videoWidth || source.width;
    const srcH = source.videoHeight || source.height;
    if (!srcW || !srcH) return null;
    const height = plateH;
    const canvas = document.createElement("canvas");
    canvas.width = plateW;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, plateW, height);
    const data = ctx.getImageData(0, 0, plateW, height).data;
    const out = new Uint8ClampedArray(plateW * height);
    const t = o.plateThreshold;
    for (let i = 0; i < plateW * height; i++) {
      const r = Math.abs(data[i * QUARTER] - plateData[i * QUARTER]);
      const g = Math.abs(data[i * QUARTER + 1] - plateData[i * QUARTER + 1]);
      const b = Math.abs(data[i * QUARTER + 2] - plateData[i * QUARTER + 2]);
      const diff = Math.max(r, g, b);
      out[i] = diff > t ? 255 : 0;
    }
    return { data: out, width: plateW, height };
  }

  function process(source, tMs, srcWidth, srcHeight) {
    frameCount += 1;
    if (!enabled() || !source) return null;
    if (frameCount % Math.max(1, o.everyFrames || BG_DEFAULTS.everyFrames) !== 1 && lastSilhouette) return lastSilhouette;
    let mask = null;
    let w = width;
    let h = 0;
    const srcW = srcWidth || source.videoWidth || source.width;
    const srcH = srcHeight || source.videoHeight || source.height;
    if (!srcW || !srcH) return null;
    h = Math.max(16, Math.round(width * srcH / srcW));
    if (mode === BG_MODE.SEGMENTATION) {
      if (!ready || !segmenter) return lastSilhouette;
      const count = width * h;
      try {
        const small = document.createElement("canvas");
        small.width = width;
        small.height = h;
        small.getContext("2d", { willReadFrequently: true }).drawImage(source, 0, 0, width, h);
        const raw = segmenter.segmentMask(small, tMs, count);
        if (!raw || raw.length < count) return lastSilhouette;
        mask = new Uint8ClampedArray(count);
        for (let i = 0; i < count; i++) mask[i] = raw[i];
      } catch (e) {
        try {
          const ok = segmenter.recover ? segmenter.recover() : Promise.resolve(false);
          Promise.resolve(ok).then((recovered) => { if (!recovered) { ready = false; failed = true; } }, () => { ready = false; failed = true; });
        } catch (e2) { ready = false; failed = true; }
        return lastSilhouette;
      }
    } else if (mode === BG_MODE.PLATE) {
      if (!plateData) return null;
      const found = plateMask(source);
      if (!found) return null;
      mask = found.data;
      w = found.width;
      h = found.height;
    } else {
      return null;
    }
    const stats = maskStats(mask, w, h, o.threshold);
    const colliders = silhouetteColliders({ data: mask, width: w, height: h }, {});
    lastSilhouette = { data: mask, width: w, height: h, bbox: stats.bbox, area: stats.area, colliders, at: tMs, mode };
    return lastSilhouette;
  }

  function composite(source, silhouette) {
    if (!source || !silhouette || !silhouette.data || !silhouette.width) return null;
    const srcW = source.videoWidth || source.width;
    const srcH = source.videoHeight || source.height;
    if (!srcW || !srcH) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = srcW;
      canvas.height = srcH;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(source, 0, 0, srcW, srcH);
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = silhouette.width;
      maskCanvas.height = silhouette.height;
      const maskCtx = maskCanvas.getContext("2d");
      const image = maskCtx.createImageData(silhouette.width, silhouette.height);
      const d = image.data;
      for (let i = 0; i < silhouette.width * silhouette.height; i++) {
        const v = silhouette.data[i] || 0;
        d[i * QUARTER] = 255;
        d[i * QUARTER + 1] = 255;
        d[i * QUARTER + 2] = 255;
        d[i * QUARTER + 3] = v;
      }
      maskCtx.putImageData(image, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(maskCanvas, 0, 0, srcW, srcH);
      ctx.restore();
      return canvas;
    } catch (e) {
      return null;
    }
  }

  function shouldPreprocess() {
    return o.preprocess === "mask" || o.preprocess === BG_MODE.SEGMENTATION || o.preprocess === BG_MODE.PLATE;
  }

  function reset() {
    lastSilhouette = null;
    frameCount = 0;
  }

  function close() {
    try { if (segmenter) segmenter.close(); } catch (e) { segmenter = null; }
    segmenter = null;
    ready = false;
  }

  return {
    init,
    setPlate,
    process,
    composite,
    shouldPreprocess,
    reset,
    close,
    ready: () => ready,
    failed: () => failed,
    get silhouette() { return lastSilhouette; },
    get modeValue() { return mode; },
  };
}
