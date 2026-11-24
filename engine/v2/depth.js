import { LANDMARK } from "./landmarks.js";

export const DEPTH_DEFAULTS = Object.freeze({ geoWeight: 0.6, geoWeightForeshortened: 0.9, decay: 0.999, spanDeg: 155 });

const ARMS = Object.freeze([
  Object.freeze({ upper: "leftUpperArm", fore: "leftForearm", shoulder: "left_shoulder", elbow: "left_elbow", wrist: "left_wrist" }),
  Object.freeze({ upper: "rightUpperArm", fore: "rightForearm", shoulder: "right_shoulder", elbow: "right_elbow", wrist: "right_wrist" }),
]);
const EPS = 1e-6;

function finite(p) {
  return !!p && isFinite(p.x) && isFinite(p.y);
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
}

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
}

function dist2(a, b, aspect) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

function angleDeg(ax, ay, bx, by) {
  const d = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
  return Math.acos(Math.min(1, Math.max(-1, d))) * 180 / Math.PI;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function createDepthEstimator(options) {
  const o = Object.assign({}, DEPTH_DEFAULTS, options);
  const lengths = {};
  const signs = {};

  function lengthFor(name, observed, cal) {
    const est = Math.max(observed, (lengths[name] || 0) * o.decay, (cal && cal.len && cal.len[name]) || 0);
    lengths[name] = est;
    return est;
  }

  function apply(landmarks, world, cal, aspect) {
    if (!world || !landmarks || world.length !== landmarks.length) return world;
    const k = typeof aspect === "number" && aspect > 0 ? aspect : 1;
    const w = (n) => world[LANDMARK[n]];
    const l2 = (n) => landmarks[LANDMARK[n]];
    const torso = [w("left_shoulder"), w("right_shoulder"), w("left_hip"), w("right_hip"), l2("left_shoulder"), l2("right_shoulder"), l2("left_hip"), l2("right_hip")];
    if (!torso.every(finite)) return world;
    const torso2d = dist2(mid(l2("left_shoulder"), l2("right_shoulder")), mid(l2("left_hip"), l2("right_hip")), k);
    if (torso2d <= EPS) return world;
    const torsoM = (cal && cal.body && cal.body.torso) || lengthFor("torso", dist3(mid(w("left_shoulder"), w("right_shoulder")), mid(w("left_hip"), w("right_hip"))), cal);
    const scale = torsoM / torso2d;
    let out = world;
    ARMS.forEach((arm) => {
      const S = w(arm.shoulder);
      const E = w(arm.elbow);
      const W = w(arm.wrist);
      const S2 = l2(arm.shoulder);
      const E2 = l2(arm.elbow);
      const W2 = l2(arm.wrist);
      if (![S, E, W, S2, E2, W2].every(finite)) return;
      const lua = lengthFor(arm.upper, dist3(S, E), cal);
      const lfa = lengthFor(arm.fore, dist3(E, W), cal);
      if (lua <= EPS || lfa <= EPS) return;
      const sUa = dist2(S2, E2, k) * scale;
      const sFa = dist2(E2, W2, k) * scale;
      const sSw = dist2(S2, W2, k) * scale;
      const ext = 180 - angleDeg(E2.x - S2.x, E2.y - S2.y, W2.x - E2.x, W2.y - E2.y);
      let zUa = Math.sqrt(Math.max(0, lua * lua - sUa * sUa));
      let zFa = Math.sqrt(Math.max(0, lfa * lfa - sFa * sFa));
      if (ext >= o.spanDeg) {
        const span = Math.sqrt(Math.max(0, (lua + lfa) * (lua + lfa) - sSw * sSw));
        const tot = zUa + zFa;
        if (tot > EPS) {
          zUa = zUa * span / tot;
          zFa = zFa * span / tot;
        }
      }
      const mpUa = (E.z || 0) - (S.z || 0);
      const mpFa = (W.z || 0) - (E.z || 0);
      const sgnUa = mpUa ? (mpUa < 0 ? -1 : 1) : (signs[arm.upper] || 1);
      const sgnFa = mpFa ? (mpFa < 0 ? -1 : 1) : (signs[arm.fore] || 1);
      signs[arm.upper] = sgnUa;
      signs[arm.fore] = sgnFa;
      const wUa = o.geoWeight + (o.geoWeightForeshortened - o.geoWeight) * (1 - clamp01(sUa / lua));
      const wFa = o.geoWeight + (o.geoWeightForeshortened - o.geoWeight) * (1 - clamp01(sFa / lfa));
      const dUa = wUa * sgnUa * zUa + (1 - wUa) * mpUa;
      const dFa = wFa * sgnFa * zFa + (1 - wFa) * mpFa;
      if (out === world) out = world.slice();
      out[LANDMARK[arm.elbow]] = Object.assign({}, E, { z: (S.z || 0) + dUa });
      out[LANDMARK[arm.wrist]] = Object.assign({}, W, { z: (S.z || 0) + dUa + dFa });
    });
    return out;
  }

  function reset() {
    Object.keys(lengths).forEach((k) => delete lengths[k]);
    Object.keys(signs).forEach((k) => delete signs[k]);
  }

  return { apply, reset };
}
