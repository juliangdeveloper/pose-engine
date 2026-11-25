import { SEGMENT_NAMES, PREVIEW_JOINTS, FEATURES_VERSION, normalizeSequence, upgradeFeatures } from "../engine/v2/index.js?v=0.5.1";
import { LIBRARY_KEY, EXPORT_FORMAT, APP_ID, NAME_MAX, DESCRIPTION_MAX, SEEDED_KEY } from "./config.js";
import { DEFAULTS_SEED_KEY, DEFAULTS_SEED, DEFAULT_POSES, DEFAULT_MOVEMENTS } from "./defaults.js";

const ID_RADIX = 36;
const ID_RANDOM_LEN = 5;
const VECTOR_LEN = 3;
const POINT_LEN = 3;

export function newId(prefix) {
  return prefix + Date.now().toString(ID_RADIX) + Math.random().toString(ID_RADIX).slice(2, 2 + ID_RANDOM_LEN);
}

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function finiteList(v, len) {
  return Array.isArray(v) && v.length === len && v.every((n) => typeof n === "number" && isFinite(n));
}

function cleanChecks(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  list.forEach((c) => {
    if (!c || typeof c !== "object" || typeof c.m !== "string" || !c.m) return;
    const item = { m: c.m };
    if (typeof c.min === "number" && isFinite(c.min)) item.min = c.min;
    if (typeof c.max === "number" && isFinite(c.max)) item.max = c.max;
    if (typeof c.weight === "number" && isFinite(c.weight) && c.weight > 0) item.weight = c.weight;
    if (item.min === undefined && item.max === undefined) return;
    out.push(item);
  });
  return out.length ? out : null;
}

function cleanOnset(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (raw.side === "left" || raw.side === "right" || raw.side === "any") out.side = raw.side;
  ["elbowDeg", "hysteresisDeg", "wristForwardSpeed", "restSpeed", "restMs", "twistMin", "twistMax"].forEach((k) => {
    if (typeof raw[k] === "number" && isFinite(raw[k])) out[k] = raw[k];
  });
  return Object.keys(out).length ? out : null;
}

function cleanPose(raw) {
  if (!raw || typeof raw !== "object" || !raw.seg || typeof raw.seg !== "object") return null;
  const p = upgradeFeatures(Object.assign({}, raw, { v: typeof raw.v === "number" ? raw.v : 1 }));
  const seg = {};
  const vis = {};
  SEGMENT_NAMES.forEach((name) => {
    if (!finiteList(p.seg[name], VECTOR_LEN)) return;
    seg[name] = p.seg[name].slice();
    const v = p.vis && p.vis[name];
    vis[name] = typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  });
  const checks = cleanChecks(p.checks);
  if (!Object.keys(seg).length && !checks) return null;
  const pts = Array.isArray(p.pts) && p.pts.length === PREVIEW_JOINTS.length ? p.pts.map((q) => (finiteList(q, POINT_LEN) ? q.slice() : null)) : [];
  const name = text(p.name, NAME_MAX);
  const out = {
    id: typeof p.id === "string" && p.id ? p.id : newId("p-"),
    name: name || "Pose",
    description: text(p.description, DESCRIPTION_MAX),
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    v: FEATURES_VERSION,
    seg, vis, pts,
  };
  if (checks) out.checks = checks;
  if (p.alt === true) out.alt = true;
  return out;
}

function cleanMove(m, known) {
  if (!m || typeof m !== "object") return null;
  const name = text(m.name, NAME_MAX);
  const out = {
    id: typeof m.id === "string" && m.id ? m.id : newId("m-"),
    name: name || "Movimiento",
    description: text(m.description, DESCRIPTION_MAX),
    sequence: (Array.isArray(m.sequence) ? m.sequence : []).filter((id) => typeof id === "string" && known.has(id)),
  };
  const onset = cleanOnset(m.onset);
  if (onset) out.onset = onset;
  return out;
}

function clean(data) {
  const poses = (data && Array.isArray(data.poses) ? data.poses : []).map(cleanPose).filter(Boolean);
  const known = new Set(poses.map((p) => p.id));
  const movements = (data && Array.isArray(data.movements) ? data.movements : []).map((m) => cleanMove(m, known)).filter(Boolean);
  return { poses, movements };
}

function readSeed() {
  try {
    const n = Number(localStorage.getItem(DEFAULTS_SEED_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
}

function writeSeed(n) {
  try {
    localStorage.setItem(DEFAULTS_SEED_KEY, String(n));
    return true;
  } catch (e) {
    return false;
  }
}

const LEGACY_SEED_IDS = Object.freeze(["p-flexion-arriba", "p-flexion-abajo", "p-dominada-arriba", "p-dominada-abajo", "m-flexion-completa", "m-dominada"]);

function readSeeded() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEDED_KEY));
    if (Array.isArray(raw)) return new Set(raw.filter((id) => typeof id === "string"));
  } catch (e) {}
  return new Set(readSeed() > 0 ? LEGACY_SEED_IDS : []);
}

function writeSeeded(ids) {
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify(Array.from(ids)));
  } catch (e) {}
}

function applyDefaults(lib) {
  const seed = readSeed();
  if (seed >= DEFAULTS_SEED) return lib;
  const seeded = readSeeded();
  const poses = lib.poses.map((p) => {
    const d = DEFAULT_POSES.find((q) => q.id === p.id);
    const cleaned = d ? cleanPose(d) : null;
    if (!cleaned) return p;
    const next = Object.assign({}, p, { v: cleaned.v, seg: cleaned.seg, vis: cleaned.vis, pts: cleaned.pts });
    if (cleaned.checks) next.checks = cleaned.checks;
    if (cleaned.alt) next.alt = true;
    return next;
  });
  DEFAULT_POSES.forEach((p) => {
    if (seeded.has(p.id) || poses.some((q) => q.id === p.id)) return;
    const cleaned = cleanPose(p);
    if (cleaned) poses.push(cleaned);
  });
  const known = new Set(poses.map((p) => p.id));
  const movements = lib.movements.slice();
  DEFAULT_MOVEMENTS.forEach((m) => {
    if (seeded.has(m.id) || movements.some((q) => q.id === m.id)) return;
    const cleaned = cleanMove(m, known);
    if (cleaned) movements.push(cleaned);
  });
  const next = { poses, movements };
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
  } catch (e) {}
  writeSeed(DEFAULTS_SEED);
  const all = new Set(seeded);
  DEFAULT_POSES.forEach((p) => all.add(p.id));
  DEFAULT_MOVEMENTS.forEach((m) => all.add(m.id));
  writeSeeded(all);
  return next;
}

export function loadLibrary() {
  try {
    return applyDefaults(clean(JSON.parse(localStorage.getItem(LIBRARY_KEY))));
  } catch (e) {
    return applyDefaults({ poses: [], movements: [] });
  }
}

export function saveLibrary(lib) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ poses: lib.poses, movements: lib.movements }));
    return true;
  } catch (e) {
    return false;
  }
}

export function exportLibrary(lib) {
  return JSON.stringify({ app: APP_ID, format: EXPORT_FORMAT, poses: lib.poses, movements: lib.movements }, null, 2);
}

export function parseImport(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!data || typeof data !== "object" || (!Array.isArray(data.poses) && !Array.isArray(data.movements))) return null;
  const incomingPoses = (Array.isArray(data.poses) ? data.poses : []).map(cleanPose).filter(Boolean);
  return { poses: incomingPoses, rawMovements: Array.isArray(data.movements) ? data.movements : [] };
}

export function mergeLibrary(lib, incoming) {
  const poses = lib.poses.slice();
  incoming.poses.forEach((p) => {
    const i = poses.findIndex((q) => q.id === p.id);
    if (i >= 0) poses[i] = p;
    else poses.push(p);
  });
  const known = new Set(poses.map((p) => p.id));
  const movements = lib.movements.slice();
  const moves = incoming.rawMovements.map((m) => cleanMove(m, known)).filter(Boolean);
  moves.forEach((m) => {
    const i = movements.findIndex((q) => q.id === m.id);
    if (i >= 0) movements[i] = m;
    else movements.push(m);
  });
  return { lib: { poses, movements }, poses: incoming.poses.length, movements: moves.length };
}

export function playable(m, lib) {
  return normalizeSequence(m.sequence, new Set(lib.poses.map((p) => p.id))).length > 0;
}

export function nextName(list, prefix) {
  const re = new RegExp("^" + prefix + " (\\d+)$");
  const max = list.reduce((n, item) => {
    const hit = re.exec(item.name);
    return hit ? Math.max(n, Number(hit[1])) : n;
  }, 0);
  return prefix + " " + (Math.max(max, list.length) + 1);
}
