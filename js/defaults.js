export const DEFAULTS_SEED_KEY = "pose-engine.defaults";
export const DEFAULTS_SEED = 1;

const VIS = 0.95;
const CREATED = "2026-01-01T00:00:00.000Z";

function pose(id, name, seg, pts) {
  const vis = {};
  Object.keys(seg).forEach((k) => { vis[k] = VIS; });
  return { id, name, description: "", createdAt: CREATED, v: 1, seg, vis, pts };
}

export const DEFAULT_POSES = Object.freeze([
  pose("p-flexion-arriba", "Flexión arriba", {
    leftUpperArm: [0.1, -0.05, 0.994],
    leftForearm: [0.06, -0.02, 0.998],
    rightUpperArm: [-0.1, -0.05, 0.994],
    rightForearm: [-0.06, -0.02, 0.998],
    leftThigh: [0.03, -0.985, 0.17],
    leftShin: [0.02, -0.993, 0.12],
    rightThigh: [-0.03, -0.985, 0.17],
    rightShin: [-0.02, -0.993, 0.12],
    gravity: [0, 0.05, 0.999],
  }, [
    [0.84, 0.34, 0.98], [0.72, 0.40, 0.98], [0.70, 0.42, 0.98],
    [0.72, 0.58, 0.96], [0.70, 0.60, 0.96], [0.72, 0.74, 0.95], [0.70, 0.76, 0.95],
    [0.50, 0.40, 0.98], [0.48, 0.42, 0.98], [0.30, 0.44, 0.96], [0.28, 0.46, 0.96],
    [0.12, 0.46, 0.95], [0.10, 0.48, 0.95],
  ]),
  pose("p-flexion-abajo", "Flexión abajo", {
    leftUpperArm: [0.42, -0.88, 0.22],
    leftForearm: [0.15, 0.12, 0.981],
    rightUpperArm: [-0.42, -0.88, 0.22],
    rightForearm: [-0.15, 0.12, 0.981],
    leftThigh: [0.03, -0.97, 0.24],
    leftShin: [0.02, -0.98, 0.2],
    rightThigh: [-0.03, -0.97, 0.24],
    rightShin: [-0.02, -0.98, 0.2],
    gravity: [0, 0.05, 0.999],
  }, [
    [0.82, 0.50, 0.98], [0.70, 0.54, 0.98], [0.68, 0.56, 0.98],
    [0.80, 0.62, 0.96], [0.78, 0.64, 0.96], [0.70, 0.76, 0.95], [0.68, 0.78, 0.95],
    [0.50, 0.54, 0.98], [0.48, 0.56, 0.98], [0.30, 0.50, 0.96], [0.28, 0.52, 0.96],
    [0.12, 0.48, 0.95], [0.10, 0.50, 0.95],
  ]),
  pose("p-dominada-arriba", "Dominada arriba", {
    leftUpperArm: [0.251, -0.622, -0.742],
    leftForearm: [0.1, 0.902, 0.421],
    rightUpperArm: [-0.251, -0.622, -0.742],
    rightForearm: [-0.1, 0.902, 0.421],
    leftThigh: [0.04, -0.94, 0.34],
    leftShin: [0.03, -0.979, 0.2],
    rightThigh: [-0.04, -0.94, 0.34],
    rightShin: [-0.03, -0.979, 0.2],
    gravity: [0, -1, 0],
  }, [
    [0.50, 0.18, 0.98], [0.42, 0.28, 0.98], [0.58, 0.28, 0.98],
    [0.38, 0.42, 0.96], [0.62, 0.42, 0.96], [0.42, 0.16, 0.95], [0.58, 0.16, 0.95],
    [0.44, 0.52, 0.98], [0.56, 0.52, 0.98], [0.44, 0.70, 0.96], [0.56, 0.70, 0.96],
    [0.44, 0.88, 0.95], [0.56, 0.88, 0.95],
  ]),
  pose("p-dominada-abajo", "Dominada abajo", {
    leftUpperArm: [0.06, 0.997, 0.05],
    leftForearm: [0.04, 0.999, 0.03],
    rightUpperArm: [-0.06, 0.997, 0.05],
    rightForearm: [-0.04, 0.999, 0.03],
    leftThigh: [0.02, -0.999, 0.04],
    leftShin: [0.01, -1, 0.02],
    rightThigh: [-0.02, -0.999, 0.04],
    rightShin: [-0.01, -1, 0.02],
    gravity: [0, -1, 0],
  }, [
    [0.50, 0.30, 0.98], [0.42, 0.34, 0.98], [0.58, 0.34, 0.98],
    [0.40, 0.18, 0.96], [0.60, 0.18, 0.96], [0.40, 0.08, 0.95], [0.60, 0.08, 0.95],
    [0.44, 0.52, 0.98], [0.56, 0.52, 0.98], [0.44, 0.70, 0.96], [0.56, 0.70, 0.96],
    [0.44, 0.88, 0.95], [0.56, 0.88, 0.95],
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
]);
