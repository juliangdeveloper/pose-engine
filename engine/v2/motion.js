import { LANDMARK } from "./landmarks.js";
import { PREVIEW_JOINTS, LIMB_SEGMENTS } from "./features.js";

const MIN_DT_S = 1e-3;
const MAX_DT_S = 0.5;
const MS_PER_S = 1000;
const RAD_TO_DEG = 180 / Math.PI;
const EPS = 1e-6;

const JOINT_TRIPLES = Object.freeze([
  Object.freeze(["left_elbow", "left_shoulder", "left_elbow", "left_wrist"]),
  Object.freeze(["right_elbow", "right_shoulder", "right_elbow", "right_wrist"]),
  Object.freeze(["left_knee", "left_hip", "left_knee", "left_ankle"]),
  Object.freeze(["right_knee", "right_hip", "right_knee", "right_ankle"]),
  Object.freeze(["left_shoulder", "left_hip", "left_shoulder", "left_elbow"]),
  Object.freeze(["right_shoulder", "right_hip", "right_shoulder", "right_elbow"]),
  Object.freeze(["left_hip", "left_shoulder", "left_hip", "left_knee"]),
  Object.freeze(["right_hip", "right_shoulder", "right_hip", "right_knee"]),
]);

function zero() {
  return { vel: [0, 0, 0], acc: [0, 0, 0], speed: 0, accel: 0 };
}

function finite(p) {
  return !!p && isFinite(p.x) && isFinite(p.y);
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function unit(a) {
  const n = Math.hypot(a.x, a.y, a.z);
  return n > EPS ? { x: a.x / n, y: a.y / n, z: a.z / n } : null;
}

function angleOf(a, b) {
  const ua = unit(a);
  const ub = unit(b);
  if (!ua || !ub) return null;
  return Math.acos(Math.min(1, Math.max(-1, dot(ua, ub)))) * RAD_TO_DEG;
}

function localDir(frame, a, b) {
  const d = unit(sub(b, a));
  if (!d) return null;
  return [dot(d, frame.right), dot(d, frame.up), dot(d, frame.forward)];
}

export function createMotionTracker() {
  let prev = new Map();
  let vel = new Map();
  let prevSeg = new Map();
  let prevJoint = new Map();

  function update(world, frame, t) {
    if (!world || !frame) {
      prev = new Map();
      vel = new Map();
      prevSeg = new Map();
      prevJoint = new Map();
      return null;
    }
    const out = {};
    const torsoPts = [world[LANDMARK.left_shoulder], world[LANDMARK.right_shoulder], world[LANDMARK.left_hip], world[LANDMARK.right_hip]];
    const torsoLen = torsoPts.every(finite) ? Math.hypot(
      ((world[LANDMARK.left_shoulder].x + world[LANDMARK.right_shoulder].x) / 2) - ((world[LANDMARK.left_hip].x + world[LANDMARK.right_hip].x) / 2),
      ((world[LANDMARK.left_shoulder].y + world[LANDMARK.right_shoulder].y) / 2) - ((world[LANDMARK.left_hip].y + world[LANDMARK.right_hip].y) / 2),
      (((world[LANDMARK.left_shoulder].z || 0) + (world[LANDMARK.right_shoulder].z || 0)) / 2) - (((world[LANDMARK.left_hip].z || 0) + (world[LANDMARK.right_hip].z || 0)) / 2),
    ) || 1 : 1;
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
      const raw = [(q.x - last.x) / step / torsoLen, (q.y - last.y) / step / torsoLen, (q.z - last.z) / step / torsoLen];
      const v = [raw[0] * frame.right.x + raw[1] * frame.right.y + raw[2] * frame.right.z,
        raw[0] * frame.up.x + raw[1] * frame.up.y + raw[2] * frame.up.z,
        raw[0] * frame.forward.x + raw[1] * frame.forward.y + raw[2] * frame.forward.z];
      const pv = vel.get(name);
      vel.set(name, v);
      const a = pv ? [(v[0] - pv[0]) / step, (v[1] - pv[1]) / step, (v[2] - pv[2]) / step] : [0, 0, 0];
      out[name] = { vel: v, acc: a, speed: Math.hypot(v[0], v[1], v[2]), accel: Math.hypot(a[0], a[1], a[2]) };
    });
    const segments = {};
    LIMB_SEGMENTS.forEach(([name, a, b]) => {
      const pa = world[a];
      const pb = world[b];
      if (!finite(pa) || !finite(pb)) {
        prevSeg.delete(name);
        return;
      }
      const dir = localDir(frame, pa, pb);
      if (!dir) return;
      const last = prevSeg.get(name);
      let angVel = 0;
      let angAcc = 0;
      if (last && t > last.t) {
        const dt = (t - last.t) / MS_PER_S;
        if (dt <= MAX_DT_S) {
          const step = Math.max(dt, MIN_DT_S);
          const ang = angleOf({ x: last.dir[0], y: last.dir[1], z: last.dir[2] }, { x: dir[0], y: dir[1], z: dir[2] });
          if (ang !== null) {
            angVel = ang / step;
            if (last.angVel !== undefined) angAcc = (angVel - last.angVel) / step;
          }
        }
      }
      prevSeg.set(name, { dir, t, angVel });
      segments[name] = { dir, angVel, angAcc };
    });
    const joints = {};
    JOINT_TRIPLES.forEach(([joint, aName, bName, cName]) => {
      const a = world[LANDMARK[aName]];
      const b = world[LANDMARK[bName]];
      const c = world[LANDMARK[cName]];
      if (!finite(a) || !finite(b) || !finite(c)) {
        prevJoint.delete(joint);
        return;
      }
      const angle = angleOf(sub(a, b), sub(c, b));
      if (angle === null) return;
      const last = prevJoint.get(joint);
      let angVel = 0;
      let angAcc = 0;
      if (last && t > last.t) {
        const dt = (t - last.t) / MS_PER_S;
        if (dt <= MAX_DT_S) {
          const step = Math.max(dt, MIN_DT_S);
          angVel = (angle - last.angle) / step;
          if (last.angVel !== undefined) angAcc = (angVel - last.angVel) / step;
        }
      }
      prevJoint.set(joint, { angle, t, angVel });
      joints[joint] = { angle, angVel, angAcc };
    });
    out.joints = joints;
    out.segments = segments;
    return out;
  }

  function reset() {
    prev = new Map();
    vel = new Map();
    prevSeg = new Map();
    prevJoint = new Map();
  }

  return { update, reset };
}
