import { SEGMENT_NAMES, PREVIEW_JOINTS, normalizeSequence } from "../engine/v2/index.js?v=0.3.0";
import { LIBRARY_KEY, EXPORT_FORMAT, APP_ID, NAME_MAX, DESCRIPTION_MAX } from "./config.js";

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

function cleanPose(p) {
  if (!p || typeof p !== "object" || !p.seg || typeof p.seg !== "object") return null;
  const seg = {};
  const vis = {};
  SEGMENT_NAMES.forEach((name) => {
    if (!finiteList(p.seg[name], VECTOR_LEN)) return;
    seg[name] = p.seg[name].slice();
    const v = p.vis && p.vis[name];
    vis[name] = typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  });
  if (!Object.keys(seg).length) return null;
  const pts = Array.isArray(p.pts) && p.pts.length === PREVIEW_JOINTS.length ? p.pts.map((q) => (finiteList(q, POINT_LEN) ? q.slice() : null)) : [];
  const name = text(p.name, NAME_MAX);
  return {
    id: typeof p.id === "string" && p.id ? p.id : newId("p-"),
    name: name || "Pose",
    description: text(p.description, DESCRIPTION_MAX),
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    v: typeof p.v === "number" ? p.v : 1,
    seg, vis, pts,
  };
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

export function loadLibrary() {
  try {
    return clean(JSON.parse(localStorage.getItem(LIBRARY_KEY)));
  } catch (e) {
    return { poses: [], movements: [] };
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
