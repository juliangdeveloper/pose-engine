export const GRADE = Object.freeze({ EXCELENTE: "excelente", BIEN: "bien", OK: "ok" });
export const GRADE_LABEL = Object.freeze({ excelente: "Excelente", bien: "Bien", ok: "OK" });
export const GRADE_STAT = Object.freeze({ MIN: "min", MAX: "max", RANGE: "range", ABS_MAX: "absMax", DURATION: "duration" });
export const GRADE_POINTS = Object.freeze({ excelente: 1, bien: 0.5, ok: 0 });
export const GRADE_EXCELENTE_MIN = 0.85;
export const GRADE_BIEN_MIN = 0.5;

function passes(v, rule) {
  if (!rule || !isFinite(v)) return false;
  if (rule.lt !== undefined && !(v < rule.lt)) return false;
  if (rule.gt !== undefined && !(v > rule.gt)) return false;
  if (rule.between && !(v >= rule.between[0] && v <= rule.between[1])) return false;
  return true;
}

function statValue(stats, criterion, durationMs) {
  if (criterion.stat === GRADE_STAT.DURATION) return durationMs;
  const s = stats && stats[criterion.measure];
  if (!s || !isFinite(s.min) || !isFinite(s.max)) return NaN;
  if (criterion.stat === GRADE_STAT.MIN) return s.min;
  if (criterion.stat === GRADE_STAT.MAX) return s.max;
  if (criterion.stat === GRADE_STAT.RANGE) return s.max - s.min;
  if (criterion.stat === GRADE_STAT.ABS_MAX) return Math.max(Math.abs(s.min), Math.abs(s.max));
  return NaN;
}

export function levelFromScore(score) {
  if (score >= GRADE_EXCELENTE_MIN) return GRADE.EXCELENTE;
  if (score >= GRADE_BIEN_MIN) return GRADE.BIEN;
  return GRADE.OK;
}

export function gradeForm(criteria, stats, durationMs) {
  if (!Array.isArray(criteria) || !criteria.length) return null;
  const parts = [];
  criteria.forEach((c) => {
    const value = statValue(stats, c, durationMs);
    if (!isFinite(value)) return;
    const level = passes(value, c.excelente) ? GRADE.EXCELENTE : passes(value, c.bien) ? GRADE.BIEN : GRADE.OK;
    parts.push({ id: c.id, label: c.label || c.id, tip: c.tip || "", value, level });
  });
  if (!parts.length) return null;
  const score = parts.reduce((s, p) => s + GRADE_POINTS[p.level], 0) / parts.length;
  const level = levelFromScore(score);
  const weakest = parts.slice().sort((a, b) => GRADE_POINTS[a.level] - GRADE_POINTS[b.level])[0];
  return { level, label: GRADE_LABEL[level], score, criteria: parts, tip: weakest.level === GRADE.EXCELENTE ? "" : weakest.tip };
}

export function validateGrade(criteria, id) {
  const errors = [];
  if (criteria === undefined) return errors;
  if (!Array.isArray(criteria)) return [id + ": grade debe ser una lista"];
  const stats = Object.values(GRADE_STAT);
  criteria.forEach((c, i) => {
    if (!c || stats.indexOf(c.stat) === -1) errors.push(id + ": grade[" + i + "] stat inválido");
    else if (c.stat !== GRADE_STAT.DURATION && typeof c.measure !== "string") errors.push(id + ": grade[" + i + "] falta measure");
    if (!c || !c.excelente || !c.bien) errors.push(id + ": grade[" + i + "] necesita excelente y bien");
  });
  return errors;
}
