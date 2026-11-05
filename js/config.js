export const APP_ID = "pose-engine";
export const APP_VERSION = "0.2.0";
export const STATS_KEY = "pose-engine.stats";
export const CAMERA_KEY = "pose-engine.camera";
export const LENS_KEY = "pose-engine.lens";

export const STAT = Object.freeze({ REPS_TOTAL: "reps_total", BEST_HOLD_S: "mejor_plancha_s" });
export const STATS = Object.freeze([
  Object.freeze({ key: STAT.REPS_TOTAL, tipo: "total_acumulado" }),
  Object.freeze({ key: STAT.BEST_HOLD_S, tipo: "mejor_marca" }),
]);

export const FEEDBACK_MS = 2500;
export const POP_DETECT_MS = 1800;
export const POP_GRADE_MS = 1100;
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
  idle: "Pulsa Cámara y empieza a moverte.",
  idleHint: "El ejercicio se reconoce solo.",
  waiting: "Listo para empezar",
  searching: "Buscando movimiento…",
  loading: "Cargando…",
  opening: "Abriendo cámara…",
  start: "Cámara",
  stop: "Parar",
  reps: "Reps",
  hold: "Plancha",
  best: "mejor",
  good: "¡Bien hecha!",
  gradeText: Object.freeze({ excelente: "¡Excelente forma!", bien: "Buena forma", ok: "Cuida la forma" }),
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

const SVG_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">';
const SVG_CLOSE = "</svg>";

export const ICON = Object.freeze({
  "push-up": SVG_OPEN + '<circle cx="4.6" cy="9.4" r="2"/><path d="M6.8 10.6 21 15.4M8.6 11.2l.4 6.3M2 19.5h20"/>' + SVG_CLOSE,
  squat: SVG_OPEN + '<circle cx="11" cy="3.6" r="2"/><path d="M11 6.2 9.4 12.4l6.4.9-.9 6.7M10.7 8.2h7.6M3 20.5h18"/>' + SVG_CLOSE,
  "pull-up": SVG_OPEN + '<path d="M3 3h18M8.5 3l2 5.6M15.5 3l-2 5.6"/><circle cx="12" cy="8.6" r="2"/><path d="M12 11v5.6l-1.4 5"/>' + SVG_CLOSE,
  plank: SVG_OPEN + '<circle cx="4.4" cy="9.2" r="2"/><path d="M6.6 10.4 21 14.8M7.6 11v4.6h3.6M2 18.5h20"/>' + SVG_CLOSE,
});
export const ICON_DEFAULT = SVG_OPEN + '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.8v7M7 10.6h10M12 14.8l-3.6 6M12 14.8l3.6 6"/>' + SVG_CLOSE;
