export const DEFAULTS_SEED_KEY = "pose-engine.defaults";
export const DEFAULTS_SEED = 4;

const VIS = 0.95;
const CREATED = "2026-01-01T00:00:00.000Z";

function pose(id, name, seg, pts, extra) {
  const vis = {};
  Object.keys(seg).forEach((k) => { vis[k] = VIS; });
  return Object.assign({ id, name, description: "", createdAt: CREATED, v: 2, seg, vis, pts }, extra || {});
}

export const DEFAULT_POSES = Object.freeze([
  pose("p-flexion-arriba", "Flexión arriba", {
    leftUpperArm: [-0.398, -0.399, 0.826],
    leftForearm: [-0.211, -0.243, 0.947],
    rightUpperArm: [0.398, -0.399, 0.826],
    rightForearm: [0.211, -0.243, 0.947],
    leftThigh: [0.013, -0.996, 0.089],
    leftShin: [0.009, -0.995, -0.099],
    rightThigh: [-0.013, -0.996, 0.089],
    rightShin: [-0.009, -0.995, -0.099],
    gravity: [0, -0.323, 0.946],
  }, [
    [0.84, 0.34, 0.98], [0.72, 0.40, 0.98], [0.70, 0.42, 0.98],
    [0.72, 0.58, 0.96], [0.70, 0.60, 0.96], [0.72, 0.74, 0.95], [0.70, 0.76, 0.95],
    [0.50, 0.40, 0.98], [0.48, 0.42, 0.98], [0.30, 0.44, 0.96], [0.28, 0.46, 0.96],
    [0.12, 0.46, 0.95], [0.10, 0.48, 0.95],
  ]),
  pose("p-flexion-abajo", "Flexión abajo", {
    leftUpperArm: [-0.78, -0.607, -0.154],
    leftForearm: [-0.016, -0.275, 0.961],
    rightUpperArm: [0.78, -0.607, -0.154],
    rightForearm: [0.016, -0.275, 0.961],
    leftThigh: [-0.014, -0.986, -0.168],
    leftShin: [0.021, -0.987, -0.16],
    rightThigh: [0.014, -0.986, -0.168],
    rightShin: [-0.021, -0.987, -0.16],
    gravity: [0, -0.134, 0.991],
  }, [
    [0.82, 0.50, 0.98], [0.70, 0.54, 0.98], [0.68, 0.56, 0.98],
    [0.80, 0.62, 0.96], [0.78, 0.64, 0.96], [0.70, 0.76, 0.95], [0.68, 0.78, 0.95],
    [0.50, 0.54, 0.98], [0.48, 0.56, 0.98], [0.30, 0.50, 0.96], [0.28, 0.52, 0.96],
    [0.12, 0.48, 0.95], [0.10, 0.50, 0.95],
  ]),
  pose("p-dominada-arriba", "Dominada arriba", {
    leftUpperArm: [-0.251, -0.622, -0.742],
    leftForearm: [-0.1, 0.902, 0.421],
    rightUpperArm: [0.251, -0.622, -0.742],
    rightForearm: [0.1, 0.902, 0.421],
    leftThigh: [-0.04, -0.94, 0.34],
    leftShin: [-0.03, -0.979, 0.2],
    rightThigh: [0.04, -0.94, 0.34],
    rightShin: [0.03, -0.979, 0.2],
    gravity: [0, -1, 0],
  }, [
    [0.50, 0.18, 0.98], [0.42, 0.28, 0.98], [0.58, 0.28, 0.98],
    [0.38, 0.42, 0.96], [0.62, 0.42, 0.96], [0.42, 0.16, 0.95], [0.58, 0.16, 0.95],
    [0.44, 0.52, 0.98], [0.56, 0.52, 0.98], [0.44, 0.70, 0.96], [0.56, 0.70, 0.96],
    [0.44, 0.88, 0.95], [0.56, 0.88, 0.95],
  ]),
  pose("p-dominada-abajo", "Dominada abajo", {
    leftUpperArm: [-0.06, 0.997, 0.05],
    leftForearm: [-0.04, 0.999, 0.03],
    rightUpperArm: [0.06, 0.997, 0.05],
    rightForearm: [0.04, 0.999, 0.03],
    leftThigh: [-0.02, -0.999, 0.04],
    leftShin: [-0.01, -1, 0.02],
    rightThigh: [0.02, -0.999, 0.04],
    rightShin: [0.01, -1, 0.02],
    gravity: [0, -1, 0],
  }, [
    [0.50, 0.30, 0.98], [0.42, 0.34, 0.98], [0.58, 0.34, 0.98],
    [0.40, 0.18, 0.96], [0.60, 0.18, 0.96], [0.40, 0.08, 0.95], [0.60, 0.08, 0.95],
    [0.44, 0.52, 0.98], [0.56, 0.52, 0.98], [0.44, 0.70, 0.96], [0.56, 0.70, 0.96],
    [0.44, 0.88, 0.95], [0.56, 0.88, 0.95],
  ]),
  pose("p-guardia", "Guardia", {
    leftUpperArm: [0.153, -0.56, 0.814],
    leftForearm: [0.02, 0.971, 0.24],
    rightUpperArm: [-0.153, -0.56, 0.814],
    rightForearm: [-0.02, 0.971, 0.24],
    leftThigh: [0.01, -0.999, 0.02],
    leftShin: [0.009, -0.999, -0.02],
    rightThigh: [-0.01, -0.999, 0.02],
    rightShin: [-0.009, -0.999, -0.02],
    gravity: [0, -1, 0],
  }, [
    [0.50, 0.16, 0.95], [0.42, 0.28, 0.95], [0.58, 0.28, 0.95],
    [0.36, 0.44, 0.95], [0.64, 0.44, 0.95], [0.44, 0.24, 0.95], [0.56, 0.24, 0.95],
    [0.44, 0.52, 0.95], [0.56, 0.52, 0.95], [0.43, 0.72, 0.95], [0.57, 0.72, 0.95],
    [0.42, 0.90, 0.95], [0.58, 0.90, 0.95],
  ]),
  pose("p-jab", "Jab", {
    leftUpperArm: [0.1, 0, 0.995],
    leftForearm: [0.1, 0, 0.995],
    leftThigh: [0.01, -0.999, 0.02],
    leftShin: [0.009, -0.999, -0.02],
    rightThigh: [-0.01, -0.999, 0.02],
    rightShin: [-0.009, -0.999, -0.02],
    shoulderLine: [1, 0, 0],
    hipLine: [1, 0, 0],
    gravity: [0, -1, 0],
  }, [
    [0.50, 0.16, 0.95], [0.42, 0.28, 0.95], [0.58, 0.28, 0.95],
    [0.455, 0.30, 0.95], [0.64, 0.44, 0.95], [0.50, 0.31, 0.95], [0.56, 0.24, 0.95],
    [0.44, 0.52, 0.95], [0.56, 0.52, 0.95], [0.43, 0.72, 0.95], [0.57, 0.72, 0.95],
    [0.42, 0.90, 0.95], [0.58, 0.90, 0.95],
  ], {
    alt: true,
  }),
  pose("p-cross", "Cross", {
    leftUpperArm: [0.28, -0.02, 0.96],
    leftForearm: [0.22, 0, 0.975],
    leftThigh: [0.01, -0.999, 0.02],
    leftShin: [0.009, -0.999, -0.02],
    rightThigh: [-0.01, -0.999, 0.02],
    rightShin: [-0.009, -0.999, -0.02],
    shoulderLine: [0.951, 0, 0.309],
    hipLine: [0.951, 0, -0.309],
    gravity: [0, -1, 0],
  }, [
    [0.50, 0.16, 0.95], [0.43, 0.28, 0.95], [0.57, 0.28, 0.95],
    [0.37, 0.42, 0.95], [0.535, 0.30, 0.95], [0.425, 0.26, 0.95], [0.485, 0.31, 0.95],
    [0.44, 0.52, 0.95], [0.56, 0.52, 0.95], [0.43, 0.72, 0.95], [0.57, 0.72, 0.95],
    [0.42, 0.90, 0.95], [0.58, 0.90, 0.95],
  ], {
    alt: true,
  }),
  pose("p-esquive", "Esquive", {
    leftUpperArm: [0.153, -0.56, 0.814],
    leftForearm: [0.02, 0.971, 0.24],
    rightUpperArm: [-0.153, -0.56, 0.814],
    rightForearm: [-0.02, 0.971, 0.24],
    leftThigh: [-0.03, -0.349, 0.937],
    leftShin: [-0.02, -0.995, -0.1],
    rightThigh: [0.03, -0.349, 0.937],
    rightShin: [0.02, -0.995, -0.1],
    gravity: [0, -0.906, 0.423],
  }, [
    [0.50, 0.27, 0.95], [0.42, 0.40, 0.95], [0.58, 0.40, 0.95],
    [0.37, 0.55, 0.95], [0.63, 0.55, 0.95], [0.44, 0.37, 0.95], [0.56, 0.37, 0.95],
    [0.44, 0.63, 0.95], [0.56, 0.63, 0.95], [0.41, 0.80, 0.95], [0.59, 0.80, 0.95],
    [0.42, 0.93, 0.95], [0.58, 0.93, 0.95],
  ]),
]);

export const DEFAULT_MOVEMENTS = Object.freeze([
  Object.freeze({
    id: "m-flexion-completa",
    name: "Flexión completa",
    description: "",
    sequence: Object.freeze(["p-flexion-arriba", "p-flexion-abajo"]),
  }),
  Object.freeze({
    id: "m-dominada",
    name: "Dominada",
    description: "",
    sequence: Object.freeze(["p-dominada-abajo", "p-dominada-arriba"]),
  }),
  Object.freeze({
    id: "m-jab",
    name: "Jab",
    description: "",
    sequence: Object.freeze(["p-guardia", "p-jab"]),
    onset: Object.freeze({ side: "any", elbowDeg: 120, elbowAngVel: 120, twistMax: 22 }),
  }),
  Object.freeze({
    id: "m-cross",
    name: "Cross",
    description: "",
    sequence: Object.freeze(["p-guardia", "p-cross"]),
    onset: Object.freeze({ side: "any", elbowDeg: 120, elbowAngVel: 120, twistMin: 18 }),
  }),
  Object.freeze({
    id: "m-esquive",
    name: "Esquive",
    description: "",
    sequence: Object.freeze(["p-guardia", "p-esquive"]),
  }),
]);
