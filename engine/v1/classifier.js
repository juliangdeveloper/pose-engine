import { computeMeasures, requiredVisible } from "./measures.js";

export const FEATURES = Object.freeze({
  elbow: Object.freeze({ type: "angle", points: ["shoulder", "elbow", "wrist"], margin: 8 }),
  knee: Object.freeze({ type: "angle", points: ["hip", "knee", "ankle"], margin: 8 }),
  hip: Object.freeze({ type: "angle", points: ["shoulder", "hip", "knee"], margin: 8 }),
  body: Object.freeze({ type: "angle", points: ["shoulder", "hip", "ankle"], fallback: { type: "angle", points: ["shoulder", "hip", "knee"] }, margin: 8 }),
  shoulder: Object.freeze({ type: "angle", points: ["hip", "shoulder", "elbow"], margin: 10 }),
  torso: Object.freeze({ type: "incline", points: ["hip", "shoulder"], margin: 8 }),
  armsUp: Object.freeze({ type: "offset", points: ["wrist", "shoulder"], margin: 0.12 }),
});

export const FEATURE_STAT = Object.freeze({ MIN: "min", MAX: "max", MEAN: "mean", RANGE: "range", LAST: "last" });

export const RECOGNITION_DEFAULTS = Object.freeze({
  windowMs: 3000,
  minWindowMs: 700,
  minSamples: 4,
  enterScore: 0.72,
  exitScore: 0.5,
  switchMargin: 0.12,
  confirmMs: 450,
  dropMs: 1200,
  coverageExponent: 0.35,
  postureFeature: "torso",
  postureBreak: 45,
  postureHoldMs: 500,
});

const HALF = 0.5;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function membership(v, term, margin) {
  const span = 2 * margin;
  let m = 1;
  if (term.gt !== undefined) m = Math.min(m, clamp01((v - term.gt) / span + HALF));
  if (term.lt !== undefined) m = Math.min(m, clamp01((term.lt - v) / span + HALF));
  if (term.between) {
    m = Math.min(m, clamp01((v - term.between[0]) / span + HALF), clamp01((term.between[1] - v) / span + HALF));
  }
  return m;
}

function windowStats(buffer, minSamples) {
  const acc = {};
  buffer.forEach((s) => {
    Object.keys(s.values).forEach((k) => {
      const v = s.values[k];
      if (!isFinite(v)) return;
      const a = acc[k] || (acc[k] = { min: Infinity, max: -Infinity, sum: 0, n: 0, last: NaN });
      if (v < a.min) a.min = v;
      if (v > a.max) a.max = v;
      a.sum += v;
      a.n++;
      a.last = v;
    });
  });
  const out = {};
  Object.keys(acc).forEach((k) => {
    const a = acc[k];
    if (a.n < minSamples) return;
    out[k] = { min: a.min, max: a.max, mean: a.sum / a.n, range: a.max - a.min, last: a.last };
  });
  return out;
}

export function scoreRecognition(terms, stats, features, coverageExponent) {
  if (!Array.isArray(terms) || !terms.length) return 0;
  let total = 0;
  let known = 0;
  let got = 0;
  let gate = 1;
  terms.forEach((term) => {
    const w = term.weight === undefined ? 1 : term.weight;
    total += w;
    const s = stats[term.feature];
    const v = s ? s[term.stat || FEATURE_STAT.MEAN] : NaN;
    if (!isFinite(v)) return;
    const spec = features[term.feature];
    const margin = term.margin !== undefined ? term.margin : spec && spec.margin !== undefined ? spec.margin : 1;
    const m = membership(v, term, margin);
    known += w;
    got += w * m;
    if (term.must) gate *= m;
  });
  if (!known || !total) return 0;
  return gate * (got / known) * Math.pow(known / total, coverageExponent);
}

export function createClassifier(options) {
  const o = Object.assign({}, RECOGNITION_DEFAULTS, options && options.recognition);
  const features = Object.assign({}, FEATURES, options && options.features);
  let defs = [];
  let buffer = [];
  let active = null;
  let candidate = null;
  let candidateSince = 0;
  let dropSince = null;
  let breakSince = null;
  let scores = {};

  function setDefs(list) {
    defs = list.filter((d) => Array.isArray(d.recognize) && d.recognize.length);
    if (active && !defs.some((d) => d.id === active)) active = null;
  }

  function reset() {
    buffer = [];
    active = null;
    candidate = null;
    dropSince = null;
    breakSince = null;
    scores = {};
  }

  function measure(landmarks, world, width, height, side) {
    const m = computeMeasures(features, landmarks, world, width, height, side);
    const values = {};
    Object.keys(m).forEach((k) => { values[k] = m[k].value; });
    return values;
  }

  function update(input) {
    const t = input.t;
    const values = input.values || {};
    const posture = values[o.postureFeature];
    if (isFinite(posture) && buffer.length) {
      const prior = buffer.map((b) => b.values[o.postureFeature]).filter((v) => isFinite(v));
      const mean = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : posture;
      if (Math.abs(posture - mean) > o.postureBreak) {
        if (breakSince === null) breakSince = t;
        if (t - breakSince >= o.postureHoldMs) {
          buffer = buffer.filter((b) => b.t >= breakSince);
          breakSince = null;
        }
      } else {
        breakSince = null;
      }
    }
    buffer.push({ t, values });
    while (buffer.length && t - buffer[0].t > o.windowMs) buffer.shift();
    const stats = windowStats(buffer, o.minSamples);
    const ready = buffer.length > 1 && t - buffer[0].t >= o.minWindowMs;
    scores = {};
    defs.forEach((d) => {
      const visible = !!input.landmarks && requiredVisible(d.requires, input.landmarks, input.side, input.minVisibility);
      scores[d.id] = visible ? scoreRecognition(d.recognize, stats, features, o.coverageExponent) : 0;
    });
    let best = null;
    defs.forEach((d) => { if (best === null || scores[d.id] > scores[best]) best = d.id; });
    const bestScore = best === null ? 0 : scores[best];
    const activeScore = active ? scores[active] || 0 : 0;
    let changed = false;
    const wants = ready && best !== null && best !== active && bestScore >= o.enterScore && (!active || bestScore - activeScore >= o.switchMargin);
    if (wants) {
      if (candidate !== best) { candidate = best; candidateSince = t; }
      if (t - candidateSince >= o.confirmMs) {
        active = best;
        candidate = null;
        dropSince = null;
        changed = true;
      }
    } else {
      candidate = null;
    }
    if (!changed && active) {
      if ((scores[active] || 0) < o.exitScore) {
        if (dropSince === null) dropSince = t;
        if (t - dropSince >= o.dropMs) {
          active = null;
          dropSince = null;
          changed = true;
        }
      } else {
        dropSince = null;
      }
    }
    return { active, confidence: active ? scores[active] || 0 : 0, candidate, scores: Object.assign({}, scores), changed };
  }

  return {
    setDefs, reset, measure, update,
    active: () => active,
    scores: () => Object.assign({}, scores),
    options: () => Object.assign({}, o),
  };
}

export function validateRecognize(terms, id) {
  if (terms === undefined) return [];
  if (!Array.isArray(terms)) return [id + ": recognize debe ser una lista"];
  const stats = Object.values(FEATURE_STAT);
  const errors = [];
  terms.forEach((t, i) => {
    if (!t || typeof t.feature !== "string") errors.push(id + ": recognize[" + i + "] falta feature");
    else if (t.stat !== undefined && stats.indexOf(t.stat) === -1) errors.push(id + ": recognize[" + i + "] stat inválido");
  });
  return errors;
}
