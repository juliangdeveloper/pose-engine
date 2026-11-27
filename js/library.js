import { SEGMENT_NAMES, PREVIEW_JOINTS, HAND_PREVIEW_COUNT, FEATURES_VERSION, normalizeSequence, upgradeFeatures, parseKeys } from "../engine/v2/index.js?v=0.12.0";
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
  const isHand = p.kind === "hand";
  const ptsLen = isHand ? HAND_PREVIEW_COUNT : PREVIEW_JOINTS.length;
  const pts = Array.isArray(p.pts) && p.pts.length === ptsLen ? p.pts.map((q) => (finiteList(q, POINT_LEN) ? q.slice() : null)) : [];
  const name = text(p.name, NAME_MAX);
  const out = {
    id: typeof p.id === "string" && p.id ? p.id : newId("p-"),
    name: name || "Pose",
    description: text(p.description, DESCRIPTION_MAX),
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    v: FEATURES_VERSION,
    seg, vis, pts,
  };
  if (isHand) out.kind = "hand";
  if (p.alt === true) out.alt = true;
  const keys = parseKeys(p.keys);
  if (keys.length) out.keys = keys;
  if (p.hold === true) out.hold = true;
  return out;
}

function cleanMove(m, known) {
  if (!m || typeof m !== "object") return null;
  const name = text(m.name, NAME_MAX);
  return {
    id: typeof m.id === "string" && m.id ? m.id : newId("m-"),
    name: name || "Movimiento",
    description: text(m.description, DESCRIPTION_MAX),
    sequence: (Array.isArray(m.sequence) ? m.sequence : []).filter((id) => typeof id === "string" && known.has(id)),
  };
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

const FACTORY_POSE_IDS = Object.freeze(["p-flexion-arriba", "p-flexion-abajo", "p-dominada-arriba", "p-dominada-abajo", "p-guardia", "p-jab", "p-cross", "p-esquive"]);
const FACTORY_MOVE_IDS = Object.freeze(["m-flexion-completa", "m-dominada", "m-jab", "m-cross", "m-esquive"]);

function readSeeded() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEDED_KEY));
    if (Array.isArray(raw)) return new Set(raw.filter((id) => typeof id === "string"));
  } catch (e) {}
  return new Set([]);
}

function writeSeeded(ids) {
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify(Array.from(ids)));
  } catch (e) {}
}

function applyDefaults(lib) {
  const seed = readSeed();
  if (seed >= DEFAULTS_SEED) return lib;
  const poses = lib.poses.filter((p) => FACTORY_POSE_IDS.indexOf(p.id) === -1);
  const known = new Set(poses.map((p) => p.id));
  const movements = lib.movements.filter((m) => FACTORY_MOVE_IDS.indexOf(m.id) === -1).map((m) => Object.assign({}, m, { sequence: (Array.isArray(m.sequence) ? m.sequence : []).filter((id) => known.has(id)) }));
  const next = { poses, movements };
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
  } catch (e) {}
  writeSeed(DEFAULTS_SEED);
  writeSeeded([]);
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

export function resetLibrary() {
  const next = clean({ poses: DEFAULT_POSES, movements: DEFAULT_MOVEMENTS });
  saveLibrary(next);
  writeSeed(DEFAULTS_SEED);
  writeSeeded([]);
  return next;
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
