export const LANDMARK = Object.freeze({
  nose: 0, left_eye_inner: 1, left_eye: 2, left_eye_outer: 3, right_eye_inner: 4, right_eye: 5, right_eye_outer: 6,
  left_ear: 7, right_ear: 8, mouth_left: 9, mouth_right: 10,
  left_shoulder: 11, right_shoulder: 12, left_elbow: 13, right_elbow: 14, left_wrist: 15, right_wrist: 16,
  left_pinky: 17, right_pinky: 18, left_index: 19, right_index: 20, left_thumb: 21, right_thumb: 22,
  left_hip: 23, right_hip: 24, left_knee: 25, right_knee: 26, left_ankle: 27, right_ankle: 28,
  left_heel: 29, right_heel: 30, left_foot_index: 31, right_foot_index: 32,
});

export const LANDMARK_COUNT = 33;

export const SIDE = Object.freeze({ LEFT: "left", RIGHT: "right", BEST: "best", MEAN: "mean" });

export const CONNECTIONS = Object.freeze([
  ["left_shoulder", "right_shoulder"], ["left_hip", "right_hip"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
  ["left_ankle", "left_heel"], ["left_heel", "left_foot_index"], ["left_ankle", "left_foot_index"],
  ["right_ankle", "right_heel"], ["right_heel", "right_foot_index"], ["right_ankle", "right_foot_index"],
  ["left_ear", "left_eye"], ["left_eye", "nose"], ["nose", "right_eye"], ["right_eye", "right_ear"],
].map(([a, b]) => Object.freeze([LANDMARK[a], LANDMARK[b]])));

export const SIDE_JOINTS = Object.freeze(["shoulder", "elbow", "wrist", "hip", "knee", "ankle"]);

export function landmarkIndex(name, side) {
  if (Object.prototype.hasOwnProperty.call(LANDMARK, name)) return LANDMARK[name];
  const key = side + "_" + name;
  if (Object.prototype.hasOwnProperty.call(LANDMARK, key)) return LANDMARK[key];
  throw new Error("Punto desconocido: " + name);
}

export function hasSides(name) {
  return !Object.prototype.hasOwnProperty.call(LANDMARK, name);
}
