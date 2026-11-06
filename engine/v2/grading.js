export const GRADE = Object.freeze({ EXCELENTE: "excelente", BIEN: "bien", OK: "ok" });
export const GRADE_LABEL = Object.freeze({ excelente: "Excelente", bien: "Bien", ok: "OK" });
export const GRADE_EXCELENTE_MIN = 0.85;
export const GRADE_BIEN_MIN = 0.75;

export function gradeFor(proximity) {
  const level = proximity >= GRADE_EXCELENTE_MIN ? GRADE.EXCELENTE : proximity >= GRADE_BIEN_MIN ? GRADE.BIEN : GRADE.OK;
  return { level, label: GRADE_LABEL[level], proximity };
}
