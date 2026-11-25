import { SEGMENT } from "./features.js";

export const ONSET_DEFAULTS = Object.freeze({ elbowDeg: 120, hysteresisDeg: 15, elbowAngVel: 120, restAngVel: 30, restMs: 300, side: "any" });
export const ONSET_SIDE = Object.freeze({ ANY: "any", LEFT: "left", RIGHT: "right" });

const SIDE_JOINT = Object.freeze({ left: "left_elbow", right: "right_elbow" });

function twistDeg(features) {
  const seg = features && features.seg;
  const a = seg && seg[SEGMENT.SHOULDER_LINE];
  const b = seg && seg[SEGMENT.HIP_LINE];
  if (!a || !b) return null;
  const dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ((Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2])) || 1);
  return Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
}

function twistOk(rule, features) {
  const twist = twistDeg(features);
  if (twist === null) return false;
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
    if (!features || !motion || !motion.joints) return fired;
    defs.forEach((d) => {
      const rule = d.rule;
      const st = states.get(d.id);
      const sides = rule.side === ONSET_SIDE.LEFT ? ["left"] : rule.side === ONSET_SIDE.RIGHT ? ["right"] : ["left", "right"];
      sides.forEach((side) => {
        const s = st[side] || (st[side] = { armed: true, tStart: null, lastMove: 0 });
        const joint = motion.joints[SIDE_JOINT[side]];
        if (!joint || typeof joint.angle !== "number" || typeof joint.angVel !== "number") return;
        const deg = joint.angle;
        const angVel = Math.abs(joint.angVel);
        if (angVel >= rule.restAngVel) {
          if (s.tStart === null) s.tStart = t;
          s.lastMove = t;
        } else if (s.tStart !== null && t - s.lastMove > rule.restMs) {
          s.tStart = null;
        }
        if (deg <= rule.elbowDeg - rule.hysteresisDeg) s.armed = true;
        if (s.armed && deg >= rule.elbowDeg && angVel >= rule.elbowAngVel && twistOk(rule, features)) {
          s.armed = false;
          const latencyMs = s.tStart === null ? 0 : t - s.tStart;
          s.tStart = null;
          fired.push({ movement: d.id, name: d.name, side, latencyMs, elbow: deg, elbowAngVel: joint.angVel, twist: twistDeg(features), at: t });
        }
      });
    });
    return fired;
  }

  function reset() {
    states.clear();
    defs.forEach((d) => states.set(d.id, {}));
  }

  return { setMovements, update, reset };
}
