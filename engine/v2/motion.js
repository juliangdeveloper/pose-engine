import { LANDMARK } from "./landmarks.js";
import { PREVIEW_JOINTS } from "./features.js";

const MIN_DT_S = 1e-3;
const MAX_DT_S = 0.5;
const MS_PER_S = 1000;

function zero() {
  return { vel: [0, 0, 0], acc: [0, 0, 0], speed: 0, accel: 0 };
}

function finite(p) {
  return !!p && isFinite(p.x) && isFinite(p.y);
}

export function createMotionTracker() {
  let prev = new Map();
  let vel = new Map();

  function update(world, frame, t) {
    if (!world || !frame) {
      prev = new Map();
      vel = new Map();
      return null;
    }
    const out = {};
    PREVIEW_JOINTS.forEach((name) => {
      const p = world[LANDMARK[name]];
      if (!finite(p)) {
        prev.delete(name);
        vel.delete(name);
        return;
      }
      const q = { x: p.x, y: p.y, z: p.z || 0, t };
      const last = prev.get(name);
      prev.set(name, q);
      if (!last || t <= last.t) {
        vel.delete(name);
        out[name] = zero();
        return;
      }
      const dt = (t - last.t) / MS_PER_S;
      if (dt > MAX_DT_S) {
        vel.delete(name);
        out[name] = zero();
        return;
      }
      const step = Math.max(dt, MIN_DT_S);
      const raw = [(q.x - last.x) / step, (q.y - last.y) / step, (q.z - last.z) / step];
      const v = [raw[0] * frame.right.x + raw[1] * frame.right.y + raw[2] * frame.right.z,
        raw[0] * frame.up.x + raw[1] * frame.up.y + raw[2] * frame.up.z,
        raw[0] * frame.forward.x + raw[1] * frame.forward.y + raw[2] * frame.forward.z];
      const pv = vel.get(name);
      vel.set(name, v);
      const a = pv ? [(v[0] - pv[0]) / step, (v[1] - pv[1]) / step, (v[2] - pv[2]) / step] : [0, 0, 0];
      out[name] = { vel: v, acc: a, speed: Math.hypot(v[0], v[1], v[2]), accel: Math.hypot(a[0], a[1], a[2]) };
    });
    return out;
  }

  function reset() {
    prev = new Map();
    vel = new Map();
  }

  return { update, reset };
}
