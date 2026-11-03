export const CALISTHENICS = Object.freeze([
  {
    id: "push-up",
    name: "Flexiones",
    kind: "reps",
    view: "Que se vean hombros, codos y muñecas",
    requires: ["shoulder", "elbow", "wrist"],
    optional: ["hip", "knee", "ankle"],
    measures: {
      elbow: { type: "angle", points: ["shoulder", "elbow", "wrist"], label: "Codo" },
      body: {
        type: "angle",
        points: ["shoulder", "hip", "ankle"],
        fallback: { type: "angle", points: ["shoulder", "hip", "knee"], label: "Cuerpo" },
        label: "Cuerpo",
      },
    },
    phases: [
      { id: "top", label: "Arriba", when: { elbow: { gt: 145 } } },
      { id: "bottom", label: "Abajo", when: { elbow: { lt: 100 } } },
    ],
    rep: ["top", "bottom", "top"],
    cues: [
      { id: "hips", text: "Cuerpo recto: no dejes caer la cadera", when: { body: { lt: 150 } } },
    ],
    checks: [
      { id: "depth", text: "Baja hasta 90° de codo", measure: "elbow", stat: "min", lt: 95 },
      { id: "lockout", text: "Estira los brazos arriba", measure: "elbow", stat: "max", gt: 150 },
      { id: "line", text: "Mantén el cuerpo recto", measure: "body", stat: "min", gt: 155 },
    ],
    demo: { rig: "pushup", periodMs: 2400, from: { elbow: 172, hipLift: 0 }, to: { elbow: 78, hipLift: -0.01 } },
  },
  {
    id: "squat",
    name: "Sentadillas",
    kind: "reps",
    view: "Que se vean cadera y rodillas",
    requires: { any: [["hip", "knee", "ankle"], ["hip", "knee", "shoulder"]] },
    optional: ["ankle", "shoulder"],
    measures: {
      knee: {
        type: "angle",
        points: ["hip", "knee", "ankle"],
        fallback: { type: "angle", points: ["shoulder", "hip", "knee"], label: "Cadera" },
        label: "Rodilla",
      },
      hip: { type: "angle", points: ["shoulder", "hip", "knee"], label: "Cadera" },
    },
    phases: [
      { id: "top", label: "Arriba", when: { knee: { gt: 145 } } },
      { id: "bottom", label: "Abajo", when: { knee: { lt: 110 } } },
    ],
    rep: ["top", "bottom", "top"],
    cues: [
      { id: "chest", text: "Pecho arriba", phase: "bottom", when: { hip: { lt: 50 } } },
    ],
    checks: [
      { id: "depth", text: "Baja hasta muslos paralelos", measure: "knee", stat: "min", lt: 100 },
      { id: "lockout", text: "Termina de pie con rodillas estiradas", measure: "knee", stat: "max", gt: 150 },
      { id: "chest", text: "Pecho arriba al bajar", measure: "hip", stat: "min", gt: 50 },
    ],
    demo: { rig: "standing", periodMs: 2600, from: { knee: 178, hip: 176, shoulder: 15, elbow: 170 }, to: { knee: 82, hip: 80, shoulder: 85, elbow: 172 } },
  },
  {
    id: "pull-up",
    name: "Dominadas",
    kind: "reps",
    view: "Que se vean hombros, codos y muñecas",
    requires: ["shoulder", "elbow", "wrist"],
    optional: ["nose"],
    measures: {
      elbow: { type: "angle", points: ["shoulder", "elbow", "wrist"], label: "Codo" },
      chin: { type: "offset", points: ["nose", "wrist"] },
    },
    phases: [
      { id: "bottom", label: "Colgado", when: { elbow: { gt: 145 } } },
      { id: "top", label: "Arriba", when: { elbow: { lt: 80 } } },
    ],
    rep: ["bottom", "top", "bottom"],
    cues: [],
    checks: [
      { id: "chin", text: "Sube la barbilla sobre la barra", measure: "chin", stat: "max", gt: 0 },
      { id: "hang", text: "Baja hasta estirar los brazos", measure: "elbow", stat: "max", gt: 150 },
    ],
    demo: { rig: "hanging", periodMs: 2800, from: { elbow: 172 }, to: { elbow: 34 } },
  },
  {
    id: "plank",
    name: "Plancha",
    kind: "hold",
    view: "Que se vean hombro, cadera y una rodilla",
    requires: { any: [["shoulder", "hip", "ankle"], ["shoulder", "hip", "knee"]] },
    optional: ["ankle", "knee"],
    measures: {
      body: {
        type: "angle",
        points: ["shoulder", "hip", "ankle"],
        fallback: { type: "angle", points: ["shoulder", "hip", "knee"], label: "Cuerpo" },
        label: "Cuerpo",
      },
      hipLine: {
        type: "lineOffset",
        points: ["hip", "shoulder", "ankle"],
        fallback: { type: "lineOffset", points: ["hip", "shoulder", "knee"] },
      },
    },
    hold: { when: { body: { gt: 160 } } },
    cues: [
      { id: "sag", text: "Sube la cadera", when: { hipLine: { lt: -0.04 } } },
      { id: "pike", text: "Baja la cadera", when: { hipLine: { gt: 0.06 } } },
    ],
    checks: [],
    demo: { rig: "plank", periodMs: 9000, profile: "dip", from: { hipLift: 0 }, to: { hipLift: -0.16 } },
  },
]);
