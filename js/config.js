export const APP_ID = "pose-engine";
export const APP_VERSION = "0.1.5";
export const REPO_URL = "https://github.com/juliangdeveloper/pose-engine";
export const STATS_KEY = "pose-engine.stats";
export const CAMERA_KEY = "pose-engine.camera";
export const LENS_KEY = "pose-engine.lens";

export const STAT = Object.freeze({ REPS_TOTAL: "reps_total", BEST_HOLD_S: "mejor_plancha_s" });
export const STATS = Object.freeze([
  Object.freeze({ key: STAT.REPS_TOTAL, tipo: "total_acumulado" }),
  Object.freeze({ key: STAT.BEST_HOLD_S, tipo: "mejor_marca" }),
]);

export const FEEDBACK_MS = 2500;
export const LABEL_FONT_PX = 13;
export const JOINT_RADIUS_PX = 4;
export const BONE_WIDTH_PX = 4;
export const MIN_JOINT_VISIBILITY = 0.4;
export const MAX_DPR = 2;
export const SECONDS_PER_MINUTE = 60;

export const COLOR = Object.freeze({
  bone: "rgba(255,255,255,0.85)",
  boneLeft: "#3ddc97",
  boneRight: "#5aa9ff",
  joint: "#ffffff",
  label: "rgba(10,12,16,0.78)",
  labelText: "#ffffff",
  warn: "#ffb547",
});

export const TEXT = Object.freeze({
  idle: "Elige un ejercicio y pulsa Cámara.",
  loading: "Cargando…",
  opening: "Abriendo cámara…",
  start: "Cámara",
  stop: "Parar",
  reps: "Reps",
  hold: "Plancha",
  best: "mejor",
  good: "¡Bien hecha!",
  phase: Object.freeze({ lost: "Sin cuerpo", idle: "Posición", holding: "Aguantando" }),
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

export const PUNTO_FASE = Object.freeze({ HECHO: "hecho", PENDIENTE: "pendiente" });
export const FASE_PUNTOS = Object.freeze([
  Object.freeze({ texto: "Motor como módulo ES separado de la app, con eventos frame, rep, state, hold y cue", estado: PUNTO_FASE.HECHO }),
  Object.freeze({ texto: "Ejercicios como datos: ángulos, fases, secuencia de repetición, avisos y controles de forma", estado: PUNTO_FASE.HECHO }),
  Object.freeze({ texto: "Flexiones, sentadillas, dominadas y plancha con cronómetro", estado: PUNTO_FASE.HECHO }),
  Object.freeze({ texto: "MediaPipe Pose lite en el dispositivo, GPU con respaldo en CPU y suavizado One Euro", estado: PUNTO_FASE.HECHO }),
  Object.freeze({ texto: "Probar en iPhone y calibrar umbrales con personas reales", estado: PUNTO_FASE.PENDIENTE }),
  Object.freeze({ texto: "Ejercicios de artes marciales y ballet", estado: PUNTO_FASE.PENDIENTE }),
]);
