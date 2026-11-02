export const KIND = Object.freeze({ REPS: "reps", HOLD: "hold" });
export const PHASE_LOST = "lost";
export const PHASE_IDLE = "idle";
export const PHASE_HOLDING = "holding";
export const STAT = Object.freeze({ MIN: "min", MAX: "max" });

const DEFAULTS = Object.freeze({ minFrames: 2, minRepMs: 400, cueMs: 350, graceMs: 600, lostMs: 700 });
const MS_PER_S = 1000;

function testValue(v, rule) {
  if (!isFinite(v)) return false;
  if (rule.lt !== undefined && !(v < rule.lt)) return false;
  if (rule.gt !== undefined && !(v > rule.gt)) return false;
  if (rule.between && !(v >= rule.between[0] && v <= rule.between[1])) return false;
  return true;
}

export function testCondition(cond, values) {
  if (!cond) return true;
  if (Array.isArray(cond.all)) return cond.all.every((c) => testCondition(c, values));
  if (Array.isArray(cond.any)) return cond.any.some((c) => testCondition(c, values));
  if (cond.not) return !testCondition(cond.not, values);
  return Object.keys(cond).every((k) => testValue(values[k], cond[k]));
}

export function validateExercise(def) {
  const errors = [];
  if (!def || typeof def !== "object") return ["La definición debe ser un objeto"];
  if (typeof def.id !== "string" || !def.id) errors.push("Falta id");
  if (def.kind !== KIND.REPS && def.kind !== KIND.HOLD) errors.push(def.id + ": kind debe ser reps o hold");
  if (!def.measures || typeof def.measures !== "object") errors.push(def.id + ": faltan measures");
  if (def.kind === KIND.REPS) {
    if (!Array.isArray(def.phases) || def.phases.length < 2) errors.push(def.id + ": se necesitan al menos 2 fases");
    if (!Array.isArray(def.rep) || def.rep.length < 2) errors.push(def.id + ": rep debe ser una secuencia de fases");
    const ids = (def.phases || []).map((p) => p.id);
    (def.rep || []).forEach((id) => { if (ids.indexOf(id) === -1) errors.push(def.id + ": fase desconocida en rep: " + id); });
  }
  if (def.kind === KIND.HOLD && (!def.hold || !def.hold.when)) errors.push(def.id + ": falta hold.when");
  return errors;
}

export function createExerciseRuntime(def, options) {
  const o = Object.assign({}, DEFAULTS, def.timing, options);
  let phase = PHASE_LOST;
  let candidate = null;
  let candidateFrames = 0;
  let history = [];
  let reps = 0;
  let repStart = null;
  let repStats = {};
  let lastSeen = -Infinity;
  let cueId = null;
  let cuePending = null;
  let cueSince = 0;
  let holdActive = false;
  let holdMs = 0;
  let holdBest = 0;
  let holdLastTrue = -Infinity;
  let holdLastT = null;
  let holdEmittedS = -1;

  function stats(values) {
    for (const k of Object.keys(values)) {
      const v = values[k];
      if (!isFinite(v)) continue;
      const s = repStats[k] || (repStats[k] = { min: Infinity, max: -Infinity });
      if (v < s.min) s.min = v;
      if (v > s.max) s.max = v;
    }
  }

  function setPhase(next, events) {
    if (next === phase) return;
    const previous = phase;
    phase = next;
    events.push({ type: "state", data: { exercise: def.id, phase, previous, label: labelOf(phase) } });
  }

  function labelOf(id) {
    const p = (def.phases || []).find((x) => x.id === id);
    if (p && p.label) return p.label;
    return (def.labels && def.labels[id]) || id;
  }

  function evaluateRep(t) {
    const checks = (def.checks || []).map((c) => {
      const s = repStats[c.measure];
      const v = s ? (c.stat === STAT.MAX ? s.max : s.min) : NaN;
      return { id: c.id, text: c.text, ok: testValue(v, c), value: v };
    });
    const passed = checks.filter((c) => c.ok).length;
    const snapshot = {};
    for (const k of Object.keys(repStats)) snapshot[k] = { min: repStats[k].min, max: repStats[k].max };
    return {
      exercise: def.id,
      count: reps,
      durationMs: repStart === null ? 0 : t - repStart,
      quality: checks.length ? passed / checks.length : 1,
      checks,
      failed: checks.filter((c) => !c.ok).map((c) => ({ id: c.id, text: c.text })),
      stats: snapshot,
    };
  }

  function updateReps(values, t, events) {
    const match = def.phases.find((p) => testCondition(p.when, values));
    const target = match ? match.id : null;
    if (phase === PHASE_LOST || phase === PHASE_IDLE) {
      if (target) {
        if (candidate === target) candidateFrames++;
        else { candidate = target; candidateFrames = 1; }
        if (candidateFrames >= o.minFrames) {
          setPhase(target, events);
          history = [target];
          repStart = t;
          repStats = {};
        }
      }
      return;
    }
    stats(values);
    if (!target || target === phase) {
      candidate = null;
      candidateFrames = 0;
      return;
    }
    if (candidate === target) candidateFrames++;
    else { candidate = target; candidateFrames = 1; }
    if (candidateFrames < o.minFrames) return;
    candidate = null;
    candidateFrames = 0;
    setPhase(target, events);
    history.push(target);
    const seq = def.rep;
    if (history.length > seq.length) history = history.slice(history.length - seq.length);
    const done = history.length === seq.length && seq.every((id, i) => history[i] === id);
    if (done) {
      if (repStart === null || t - repStart >= o.minRepMs) {
        reps++;
        events.push({ type: "rep", data: evaluateRep(t) });
      }
      history = [target];
      repStart = t;
      repStats = {};
      stats(values);
    } else if (history.length === 1 || history[0] !== seq[0]) {
      if (target === seq[0]) {
        history = [target];
        repStart = t;
        repStats = {};
      }
    }
  }

  function holdEvent(events) {
    events.push({ type: "hold", data: { exercise: def.id, active: holdActive, seconds: holdMs / MS_PER_S, best: holdBest / MS_PER_S } });
  }

  function updateHold(values, t, events, ok) {
    const good = ok && testCondition(def.hold.when, values);
    const dt = holdLastT === null ? 0 : Math.max(0, t - holdLastT);
    holdLastT = t;
    if (good) {
      holdLastTrue = t;
      if (!holdActive) {
        holdActive = true;
        holdMs = 0;
        holdEmittedS = -1;
        setPhase(PHASE_HOLDING, events);
        holdEvent(events);
      } else {
        holdMs += dt;
      }
    } else if (holdActive) {
      if (t - holdLastTrue <= o.graceMs) holdMs += dt;
      else {
        holdActive = false;
        holdBest = Math.max(holdBest, holdMs);
        setPhase(ok ? PHASE_IDLE : PHASE_LOST, events);
        holdEvent(events);
        return;
      }
    } else {
      setPhase(ok ? PHASE_IDLE : PHASE_LOST, events);
    }
    if (holdActive) {
      holdBest = Math.max(holdBest, holdMs);
      const whole = Math.floor(holdMs / MS_PER_S);
      if (whole !== holdEmittedS) {
        holdEmittedS = whole;
        holdEvent(events);
      }
    }
  }

  function liveCue(values, ok, gateOk, t, messages) {
    let next = null;
    if (!ok) next = { id: "lost", text: messages.lost, level: "warn" };
    else if (!gateOk) next = { id: "gate", text: def.gateText || messages.gate, level: "info" };
    else {
      const c = (def.cues || []).find((x) => (!x.phase || x.phase === phase) && testCondition(x.when, values));
      if (c) next = { id: c.id, text: c.text, level: c.level || "warn" };
    }
    const nextId = next ? next.id : null;
    if (nextId !== (cuePending && cuePending.id)) {
      cuePending = next;
      cueSince = t;
    }
    const pendingId = cuePending ? cuePending.id : null;
    if (pendingId !== cueId && t - cueSince >= o.cueMs) {
      cueId = pendingId;
      return { changed: true, cue: cuePending };
    }
    return { changed: false, cue: cueId === pendingId ? cuePending : currentCue };
  }

  let currentCue = null;

  return {
    update(values, visible, t, messages) {
      const events = [];
      if (visible) lastSeen = t;
      const ok = visible || t - lastSeen < o.lostMs;
      const gateOk = ok && testCondition(def.gate, values);
      if (def.kind === KIND.HOLD) {
        updateHold(values, t, events, ok && gateOk);
      } else if (!ok) {
        setPhase(PHASE_LOST, events);
        candidate = null;
        candidateFrames = 0;
      } else if (!gateOk) {
        setPhase(PHASE_IDLE, events);
        candidate = null;
        candidateFrames = 0;
      } else if (visible) {
        updateReps(values, t, events);
      }
      const cue = liveCue(values, ok, gateOk, t, messages);
      if (cue.changed) {
        currentCue = cue.cue;
        events.push({ type: "cue", data: currentCue ? Object.assign({ exercise: def.id }, currentCue) : { exercise: def.id, id: null, text: null, level: null } });
      }
      return events;
    },
    snapshot() {
      return {
        exercise: def.id,
        kind: def.kind,
        phase,
        phaseLabel: labelOf(phase),
        reps,
        hold: { active: holdActive, seconds: holdMs / MS_PER_S, best: holdBest / MS_PER_S },
        cue: currentCue,
      };
    },
    reset() {
      phase = PHASE_LOST;
      candidate = null;
      candidateFrames = 0;
      history = [];
      reps = 0;
      repStart = null;
      repStats = {};
      cueId = null;
      cuePending = null;
      currentCue = null;
      holdActive = false;
      holdMs = 0;
      holdBest = 0;
      holdLastT = null;
      holdEmittedS = -1;
    },
  };
}
