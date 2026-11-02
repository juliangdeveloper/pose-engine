import { LANDMARK, LANDMARK_COUNT } from "./landmarks.js";

const DEG = Math.PI / 180;
const SEG = Object.freeze({ shin: 0.44, thigh: 0.44, torso: 0.52, neck: 0.1, head: 0.12, upper: 0.3, fore: 0.27, hand: 0.07 });
const BODY = SEG.shin + SEG.thigh + SEG.torso;
const ANKLE_FLOOR = 0.08;
const DEPTH = 0.12;
const FAR_SHIFT = 0.012;
const NEAR_VIS = 0.98;
const FAR_VIS = 0.72;
const JITTER = 0.0015;
const FRAME_WIDTH = 480;
const WIDE_FRAME_WIDTH = 640;
const DEFAULT_PERIOD_MS = 2400;
const DIP_START = 0.7;

export const PROFILE = Object.freeze({ COSINE: "cosine", DIP: "dip" });

function at(o, deg, len) {
  return { x: o.x + len * Math.cos(deg * DEG), y: o.y + len * Math.sin(deg * DEG) };
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function armIk(shoulder, wrist, sign) {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  const d = Math.min(Math.hypot(dx, dy), SEG.upper + SEG.fore - 1e-4);
  const base = Math.atan2(dy, dx) / DEG;
  const cosA = (SEG.upper * SEG.upper + d * d - SEG.fore * SEG.fore) / (2 * SEG.upper * d);
  const a = Math.acos(Math.min(1, Math.max(-1, cosA))) / DEG;
  return at(shoulder, base + sign * a, SEG.upper);
}

function reach(elbowDeg) {
  return Math.sqrt(SEG.upper * SEG.upper + SEG.fore * SEG.fore - 2 * SEG.upper * SEG.fore * Math.cos(elbowDeg * DEG));
}

function head(shoulder, dir, face) {
  const neck = at(shoulder, dir, SEG.neck);
  return { neck, nose: at(neck, dir + face, SEG.head), ear: at(neck, dir - face * 0.3, SEG.head * 0.6) };
}

const RIGS = {
  standing: {
    box: { x0: -0.8, y0: -0.1, w: 1.7, h: 2.1 },
    pose(p) {
      const ankle = { x: 0, y: ANKLE_FLOOR };
      const lean = (180 - p.knee) * 0.4;
      const shinDir = 90 - lean;
      const knee = at(ankle, shinDir, SEG.shin);
      const thighDir = shinDir + 180 - p.knee;
      const hip = at(knee, thighDir, SEG.thigh);
      const torsoDir = thighDir + 180 + p.hip;
      const shoulder = at(hip, torsoDir, SEG.torso);
      const upperDir = torsoDir + 180 + p.shoulder;
      const elbow = at(shoulder, upperDir, SEG.upper);
      const wrist = at(elbow, upperDir + (180 - p.elbow), SEG.fore);
      const h = head(shoulder, torsoDir, -25);
      return { ankle, knee, hip, shoulder, elbow, wrist, heel: { x: -0.05, y: 0.02 }, toe: { x: 0.16, y: 0.01 }, nose: h.nose, ear: h.ear, neck: h.neck };
    },
  },
  pushup: {
    box: { x0: -0.35, y0: -0.2, w: 2.2, h: 1.35 },
    pose(p) {
      const ankle = { x: 0, y: ANKLE_FLOOR };
      const d = reach(p.elbow);
      const beta = Math.asin(Math.min(1, (d - ANKLE_FLOOR) / BODY)) / DEG;
      const shoulder = at(ankle, beta, BODY);
      const wrist = { x: shoulder.x, y: 0 };
      const elbow = armIk(shoulder, wrist, -1);
      const hip = at(ankle, beta, SEG.shin + SEG.thigh);
      const lift = p.hipLift || 0;
      const hipL = { x: hip.x - lift * Math.sin(beta * DEG), y: hip.y + lift * Math.cos(beta * DEG) };
      const knee = lerp(ankle, hipL, SEG.shin / (SEG.shin + SEG.thigh));
      const h = head(shoulder, beta, -30);
      return { ankle, knee, hip: hipL, shoulder, elbow, wrist, heel: { x: -0.06, y: 0.12 }, toe: { x: 0.06, y: 0 }, nose: h.nose, ear: h.ear, neck: h.neck };
    },
  },
  plank: {
    box: { x0: -0.35, y0: -0.2, w: 2.2, h: 1.35 },
    pose(p) {
      const ankle = { x: 0, y: ANKLE_FLOOR };
      const lift = p.hipLift || 0;
      const beta = Math.asin((SEG.upper + 0.02 - ANKLE_FLOOR) / BODY) / DEG;
      const shoulder = at(ankle, beta, BODY);
      const elbow = { x: shoulder.x, y: 0.02 };
      const wrist = { x: shoulder.x + SEG.fore, y: 0.02 };
      const hip = at(ankle, beta, SEG.shin + SEG.thigh);
      const hipL = { x: hip.x - lift * Math.sin(beta * DEG), y: hip.y + lift * Math.cos(beta * DEG) };
      const knee = lerp(ankle, hipL, SEG.shin / (SEG.shin + SEG.thigh));
      const h = head(shoulder, beta, -20);
      return { ankle, knee, hip: hipL, shoulder, elbow, wrist, heel: { x: -0.06, y: 0.12 }, toe: { x: 0.06, y: 0 }, nose: h.nose, ear: h.ear, neck: h.neck };
    },
  },
  hanging: {
    box: { x0: -0.8, y0: 0.15, w: 1.6, h: 2.35 },
    pose(p) {
      const bar = 2.3;
      const d = reach(p.elbow);
      const wrist = { x: 0, y: bar };
      const shoulder = { x: -0.05, y: bar - d };
      const elbow = armIk(shoulder, wrist, -1);
      const hip = at(shoulder, -95, SEG.torso);
      const knee = at(hip, -100, SEG.thigh);
      const ankle = at(knee, -115, SEG.shin);
      const h = head(shoulder, 88, -28);
      return { ankle, knee, hip, shoulder, elbow, wrist, heel: at(ankle, -160, 0.06), toe: at(ankle, -60, 0.15), nose: h.nose, ear: h.ear, neck: h.neck };
    },
  },
};

export function registerRig(name, rig) {
  RIGS[name] = rig;
}

function easing(profile, f) {
  if (profile === PROFILE.DIP) return f < DIP_START ? 0 : Math.sin(Math.PI * (f - DIP_START) / (1 - DIP_START));
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * f);
}

function blend(from, to, v) {
  const out = {};
  for (const k of Object.keys(from)) out[k] = from[k] + ((to[k] === undefined ? from[k] : to[k]) - from[k]) * v;
  return out;
}

export function createSyntheticSource(demo) {
  const rig = RIGS[demo && demo.rig];
  if (!rig) throw new Error("Rig de demo desconocido: " + (demo && demo.rig));
  const box = rig.box;
  const wide = box.w > box.h;
  const width = wide ? WIDE_FRAME_WIDTH : FRAME_WIDTH;
  const height = Math.round(width * box.h / box.w);
  const period = demo.periodMs || DEFAULT_PERIOD_MS;
  return {
    width,
    height,
    sample(tMs) {
      const f = (tMs % period) / period;
      const params = blend(demo.from, demo.to || demo.from, easing(demo.profile, f));
      const s = rig.pose(params);
      const hipRef = s.hip;
      const landmarks = new Array(LANDMARK_COUNT);
      const world = new Array(LANDMARK_COUNT);
      const jitter = (i) => JITTER * Math.sin(tMs * 0.013 + i * 1.7);
      const put = (name, pt, near) => {
        const i = LANDMARK[name];
        const z = near ? -DEPTH : DEPTH;
        landmarks[i] = {
          x: (pt.x - box.x0) / box.w + (near ? 0 : FAR_SHIFT) + jitter(i),
          y: (box.y0 + box.h - pt.y) / box.h + jitter(i + 5),
          z: z * 0.5,
          visibility: near ? NEAR_VIS : FAR_VIS,
        };
        world[i] = { x: pt.x - hipRef.x, y: -(pt.y - hipRef.y), z, visibility: near ? NEAR_VIS : FAR_VIS };
      };
      for (const side of ["left", "right"]) {
        const near = side === "left";
        put(side + "_shoulder", s.shoulder, near);
        put(side + "_elbow", s.elbow, near);
        put(side + "_wrist", s.wrist, near);
        const forearm = Math.atan2(s.wrist.y - s.elbow.y, s.wrist.x - s.elbow.x) / DEG;
        put(side + "_pinky", at(s.wrist, forearm - 10, SEG.hand), near);
        put(side + "_index", at(s.wrist, forearm, SEG.hand), near);
        put(side + "_thumb", at(s.wrist, forearm + 15, SEG.hand * 0.7), near);
        put(side + "_hip", s.hip, near);
        put(side + "_knee", s.knee, near);
        put(side + "_ankle", s.ankle, near);
        put(side + "_heel", s.heel, near);
        put(side + "_foot_index", s.toe, near);
        put(side + "_ear", s.ear, near);
        put(side + "_eye", lerp(s.ear, s.nose, 0.7), near);
        put(side + "_eye_inner", lerp(s.ear, s.nose, 0.8), near);
        put(side + "_eye_outer", lerp(s.ear, s.nose, 0.6), near);
        put("mouth_" + side, lerp(s.neck, s.nose, 0.6), near);
      }
      put("nose", s.nose, true);
      return { landmarks, worldLandmarks: world };
    },
  };
}
