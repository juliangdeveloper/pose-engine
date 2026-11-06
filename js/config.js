export const APP_ID = "pose-engine";
export const APP_VERSION = "0.3.0";
export const STATS_KEY = "pose-engine.stats";
export const CAMERA_KEY = "pose-engine.camera";
export const LENS_KEY = "pose-engine.lens";
export const LIBRARY_KEY = "pose-engine.library";
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
export const JOINT_RADIUS_PX = 4;
export const BONE_WIDTH_PX = 4;
export const THUMB_BONE_PX = 3;
export const THUMB_JOINT_PX = 2.2;
export const MIN_JOINT_VISIBILITY = 0.4;
export const MAX_DPR = 2;
export const PERCENT = 100;
export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 160;

export const COLOR = Object.freeze({
  bone: "rgba(255,255,255,0.85)",
  boneLeft: "#3ddc97",
  boneRight: "#5aa9ff",
  joint: "#ffffff",
  thumb: "#9aa3b2",
  thumbJoint: "#f2f4f8",
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
  waitTNext: "Haz la pose T para capturar otra",
  releaseT: "Baja los brazos para capturar otra",
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
