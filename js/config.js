export const APP_ID = "pose-engine";
export const APP_VERSION = "0.10.1";
export const STATS_KEY = "pose-engine.stats";
export const CAMERA_KEY = "pose-engine.camera";
export const LENS_KEY = "pose-engine.lens";
export const LIBRARY_KEY = "pose-engine.library";
export const CALIBRATION_KEY = "pose-engine.calibration";
export const DETAIL_KEY = "pose-engine.detail";
export const DETAIL_ON = "1";
export const DETAIL_OFF = "0";
export const SEEDED_KEY = "pose-engine.seeded";
export const CALIBRATION_MAX = 6;
export const EXPORT_FORMAT = 1;

export const STAT = Object.freeze({ REPS_TOTAL: "reps_total", CAPTURES_TOTAL: "capturas_total" });
export const STATS = Object.freeze([
  Object.freeze({ key: STAT.REPS_TOTAL, tipo: "total_acumulado" }),
  Object.freeze({ key: STAT.CAPTURES_TOTAL, tipo: "total_acumulado" }),
]);

export const POP_GRADE_MS = 1100;
export const STATUS_MS = 2600;
export const CAPTURED_MS = 2200;
export const CONFIRM_MS = 3000;
export const FLASH_MS = 650;
export const LUM_SAMPLE_MS = 600;
export const JOINT_RADIUS_PX = 4;
export const BONE_WIDTH_PX = 4;
export const THUMB_BONE_PX = 3;
export const THUMB_JOINT_PX = 2.2;
export const MIN_JOINT_VISIBILITY = 0.4;
export const MAX_DPR = 2;
export const PERCENT = 100;
export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 160;
export const GUIDE_BONE_PX = 5;
export const GUIDE_JOINT_PX = 3.5;
export const GUIDE_VISIBILITY = 0.5;
export const GUIDE_H_TOL = 0.55;
export const GUIDE_V_TOL = 0.45;
export const GUIDE_ALPHA = 0.42;
export const GHOST_BONE_PX = 3;
export const GHOST_JOINT_PX = 3;
export const GHOST_TOL_RATIO = 0.09;
export const GHOST_ALPHA = 0.75;
export const GHOST_MARGIN = 1.15;
export const SIL_TORSO_RATIO = 0.6;
export const SIL_ARM_RATIO = 0.3;
export const SIL_LEG_RATIO = 0.36;
export const SIL_HEAD_RATIO = 0.5;
export const SIL_ALPHA = 0.55;
export const FADE_FLOOR = 0.18;
export const OUTSIDE_FADE = 0.4;
export const FRAME_MIN_HEIGHT = 0.45;
export const FRAME_MAX_HEIGHT = 0.88;
export const FRAME_PAD = 0.02;
export const LUM_SIZE = 16;
export const DETAIL_ARC_PX = 16;
export const DETAIL_FONT_PX = 11;
export const DETAIL_MAX_BONE_PX = 10;
export const DETAIL_MAX_SPEED = 360;
export const DETAIL_TOL_DEG = 30;
export const DETAIL_DEPTH_BASE_PX = 4;
export const DETAIL_DEPTH_GROW_PX = 10;
export const DETAIL_MATCH_PX = 6;
export const DETAIL_PCT_PX = 13;
export const DETAIL_PCT_PAD_PX = 12;
export const LUM_DARK = 34;
export const LUM_CENTER_MAX = 72;
export const LUM_CONTRAST = 42;

export const T_GUIDE = Object.freeze({
  nose: [0.5, 0.09],
  left_shoulder: [0.4, 0.21],
  right_shoulder: [0.6, 0.21],
  left_elbow: [0.23, 0.21],
  right_elbow: [0.77, 0.21],
  left_wrist: [0.07, 0.21],
  right_wrist: [0.93, 0.21],
  left_hip: [0.43, 0.48],
  right_hip: [0.57, 0.48],
  left_knee: [0.43, 0.7],
  right_knee: [0.57, 0.7],
  left_ankle: [0.42, 0.92],
  right_ankle: [0.58, 0.92],
});

export const COLOR = Object.freeze({
  bone: "rgba(255,255,255,0.85)",
  boneLeft: "#3ddc97",
  boneRight: "#5aa9ff",
  joint: "#ffffff",
  thumb: "#9aa3b2",
  thumbJoint: "#f2f4f8",
  guideWait: "rgba(255,255,255,0.42)",
  guideOk: "#3ddc97",
  guideBad: "#ffb547",
  ghost: "#5aa9ff",
  ghostBad: "#ff6b6b",
});

export const TEXT = Object.freeze({
  idle: "Pulsa Cámara para empezar.",
  idleHint: "Captura tus poses con la pose T y arma movimientos con ellas.",
  loading: "Cargando…",
  opening: "Abriendo cámara…",
  start: "Cámara",
  stop: "Parar",
  capture: "Capturar",
  captureDone: "Listo",
  reps: "Reps",
  noPose: "Sin pose",
  noBody: "No se ve el cuerpo",
  near: "Cerca de",
  firstPose: "Pulsa Capturar para guardar tu primera pose.",
  firstMove: "Arma un movimiento en Movimientos.",
  waitT: "Haz la pose T para capturar",
  waitTHint: "Brazos rectos a los lados, a la altura de los hombros",
  waitHand: "Toca la pantalla para capturar",
  waitHandHint: "Muestra la mano que quieres guardar",
  waitHandNext: "Toca la pantalla para capturar otra",
  waitTNext: "Haz la pose T para capturar otra",
  releaseT: "Baja los brazos para capturar otra",
  releaseFirst: "Baja los brazos y haz la pose T para capturar",
  calibrate: "Calibrar",
  calibrateSkip: "Omitir",
  detail: "Detalle",
  calWait: "Haz la pose T",
  calWaitHint: "",
  calHold: "Quieto…",
  calHoldHint: "",
  calDone: "Calibrado",
  calPartial: "Se comparan solo las partes que se ven",
  missing: (parts) => {
    const word = { leftArm: "tu brazo izquierdo", rightArm: "tu brazo derecho", leftLeg: "tu pierna izquierda", rightLeg: "tu pierna derecha" };
    const has = (p) => parts.indexOf(p) !== -1;
    const list = [];
    if (has("leftArm") && has("rightArm")) list.push("tus brazos");
    else ["leftArm", "rightArm"].forEach((p) => { if (has(p)) list.push(word[p]); });
    if (has("leftLeg") && has("rightLeg")) list.push("tus piernas");
    else ["leftLeg", "rightLeg"].forEach((p) => { if (has(p)) list.push(word[p]); });
    const plural = list.length > 1 || /^tus /.test(list[0] || "");
    return (plural ? "No se ven " : "No se ve ") + list.join(" ni ");
  },
  holdT: "Mantén la pose T",
  countdown: "Ponte en la pose",
  captured: "guardada",
  captureFailed: "No se vio el cuerpo. Vuelve a hacer la pose T.",
  posePrefix: "Pose",
  movePrefix: "Movimiento",
  poses: "Poses",
  moves: "Movimientos",
  emptyPoses: "Aún no hay poses. Pulsa Capturar, haz la pose T y, tras la cuenta de 3, quédate en la pose que quieres guardar.",
  emptyMoves: "Un movimiento es una secuencia de poses. Por ejemplo, una flexión es Arriba y luego Abajo.",
  needPoses: "Necesitas al menos dos poses capturadas.",
  newMove: "Nuevo movimiento",
  copy: "Copiar datos",
  paste: "Pegar datos",
  reset: "Vaciar biblioteca",
  resetTitle: "Vaciar biblioteca",
  resetText: "Se perderán tus poses y movimientos propios y la biblioteca quedará vacía.",
  resetConfirm: "Vaciar",
  cancel: "Cancelar",
  resetDone: "Biblioteca vaciada",
  copied: "Datos copiados",
  copyFailed: "No se pudo copiar",
  imported: (p, m) => "Se importaron " + (p === 1 ? "1 pose" : p + " poses") + " y " + (m === 1 ? "1 movimiento" : m + " movimientos"),
  importFailed: "Esos datos no son válidos",
  importTitle: "Pegar datos",
  importHint: "Pega aquí los datos copiados desde Pose Engine.",
  importAction: "Importar",
  name: "Nombre",
  description: "Descripción",
  sequence: "Secuencia",
  sequenceHint: "Toca una pose para agregarla al final.",
  sequenceEmpty: "Agrega al menos dos poses.",
  save: "Guardar",
  remove: "Eliminar",
  confirmRemove: "¿Eliminar?",
  back: "Volver",
  usedIn: (n) => (n === 1 ? "Está en 1 movimiento" : "Está en " + n + " movimientos"),
  noDescription: "Sin descripción",
  removeStep: "Quitar",
  menu: "Movimientos",
  menuEmpty: "Aún no hay movimientos que mostrar.",
  tooFar: "Aléjate un paso",
  tooNear: "Acércate",
  outFrame: "Entra en el cuadro",
  dark: "Poca luz",
  backlight: "Contraluz",
  errors: Object.freeze({
    "camera-denied": "No hay permiso para la cámara. Actívalo en Ajustes › Safari › Cámara y recarga.",
    "camera-not-found": "No se encontró una cámara en este dispositivo.",
    "camera-busy": "La cámara está en uso por otra app. Ciérrala y vuelve a intentarlo.",
    "insecure-context": "La cámara solo funciona con HTTPS. Abre la página publicada.",
    "camera-unsupported": "Este navegador no permite usar la cámara.",
    "camera-error": "No se pudo abrir la cámara.",
    "model-failed": "No se pudo cargar. Revisa la conexión.",
    "detect-failed": "No responde. Vuelve a intentarlo.",
  }),
});
