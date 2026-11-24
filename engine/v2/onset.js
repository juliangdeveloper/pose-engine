import { SEGMENT } from "./features.js";

export const ONSET_DEFAULTS = Object.freeze({ elbowDeg: 120, hysteresisDeg: 15, wristForwardSpeed: 0.9, restSpeed: 0.25, restMs: 300, side: "any" });
export const ONSET_SIDE = Object.freeze({ ANY: "any", LEFT: "left", RIGHT: "right" });

const SIDE_SEG = Object.freeze({
  left: Object.freeze({ upper: SEGMENT.LEFT_UPPER_ARM, fore: SEGMENT.LEFT_FOREARM, wrist: "left_wrist" }),
  right: Object.freeze({ upper: SEGMENT.RIGHT_UPPER_ARM, fore: SEGMENT.RIGHT_FOREARM, wrist: "right_wrist" }),
});
const RAD_TO_DEG = 180 / Math.PI;

function elbowDeg(features, side) {
  const seg = features && features.seg;
  const a = seg && seg[SIDE_SEG[side].upper];
  const b = seg && seg[SIDE_SEG[side].fore];
  if (!a || !b) return null;
  const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ((Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2])) || 1);
  return 180 - Math.acos(Math.min(1, Math.max(-1, d))) * RAD_TO_DEG;
}

function forwardSpeed(motion, side) {
  const j = motion && motion[SIDE_SEG[side].wrist];
  return j && j.vel ? j.vel[2] : null;
}

function twistOk(rule, features) {
  const twist = features.metrics ? features.metrics.twist : undefined;
  if (typeof twist !== "number" || !isFinite(twist)) return false;
  if (typeof rule.twistMin === "number" && twist < rule.twistMin) return false;
  if (typeof rule.twistMax === "number" && twist > rule.twistMax) return false;
  return true;
}

export function createOnsetDetector(options) {
  const o = Object.assign({}, ONSET_DEFAULTS, options);
  let defs = [];
  const states = new Map();

  function setMovements(list) {
    defs = (list || []).filter((m) => m && m.id && m.onset && typeof m.onset === "object").map((m) => ({
      id: m.id,
      name: m.name || m.id,
      rule: Object.assign({}, o, m.onset),
    }));
    const keep = new Set(defs.map((d) => d.id));
    Array.from(states.keys()).forEach((id) => { if (!keep.has(id)) states.delete(id); });
    defs.forEach((d) => { if (!states.has(d.id)) states.set(d.id, {}); });
  }

  function update(features, motion, t) {
    const fired = [];
    if (!features || !motion) return fired;
    defs.forEach((d) => {
      const rule = d.rule;
      const st = states.get(d.id);
      const sides = rule.side === ONSET_SIDE.LEFT ? ["left"] : rule.side === ONSET_SIDE.RIGHT ? ["right"] : ["left", "right"];
      sides.forEach((side) => {
        const s = st[side] || (st[side] = { armed: true, tStart: null, lastMove: 0 });
        const deg = elbowDeg(features, side);
        const speed = forwardSpeed(motion, side);
        if (deg === null || speed === null) return;
        if (speed >= rule.restSpeed) {
          if (s.tStart === null) s.tStart = t;
          s.lastMove = t;
        } else if (s.tStart !== null && t - s.lastMove > rule.restMs) {
          s.tStart = null;
        }
        if (deg <= rule.elbowDeg - rule.hysteresisDeg) s.armed = true;
        if (s.armed && deg >= rule.elbowDeg && speed >= rule.wristForwardSpeed && twistOk(rule, features)) {
          s.armed = false;
          const latencyMs = s.tStart === null ? 0 : t - s.tStart;
          s.tStart = null;
          fired.push({ movement: d.id, name: d.name, side, latencyMs, elbow: deg, wristSpeed: speed, twist: features.metrics ? features.metrics.twist : null, at: t });
        }
      });
    });
    return fired;
  }

  function reset() {
    states.clear();
  }

  return { setMovements, update, reset };
}
