import { gradeFor } from "./grading.js";

export const MIN_SEQUENCE = 2;

export function normalizeSequence(sequence, known) {
  const ids = (Array.isArray(sequence) ? sequence : []).filter((id) => typeof id === "string" && (!known || known.has(id)));
  const out = ids.filter((id, i) => i === 0 || id !== ids[i - 1]);
  if (out.length > MIN_SEQUENCE && out[0] === out[out.length - 1]) out.pop();
  return out.length >= MIN_SEQUENCE ? out : [];
}

export function createMovementTracker() {
  let defs = [];
  const states = new Map();

  function fresh() {
    return { step: -1, peaks: [], startedAt: 0, count: 0, lastAt: 0 };
  }

  function setMovements(list, knownPoseIds) {
    const known = knownPoseIds ? new Set(knownPoseIds) : null;
    defs = (list || []).filter((m) => m && m.id).map((m) => ({ id: m.id, name: m.name || m.id, sequence: normalizeSequence(m.sequence, known) })).filter((m) => m.sequence.length);
    const keep = new Set(defs.map((m) => m.id));
    Array.from(states.keys()).forEach((id) => { if (!keep.has(id)) states.delete(id); });
    defs.forEach((m) => {
      const prev = states.get(m.id);
      const st = fresh();
      if (prev) st.count = prev.count;
      states.set(m.id, st);
    });
  }

  function begin(st, t, proximity) {
    st.step = 0;
    st.peaks = [proximity];
    st.startedAt = t;
    st.lastAt = t;
  }

  function enter(poseId, proximity, t) {
    const reps = [];
    const progressed = [];
    defs.forEach((m) => {
      const st = states.get(m.id);
      const seq = m.sequence;
      if (st.step === -1) {
        if (poseId === seq[0]) { begin(st, t, proximity); progressed.push(m.id); }
        return;
      }
      const next = (st.step + 1) % seq.length;
      if (poseId === seq[next]) {
        if (next === 0) {
          st.count += 1;
          const peaks = st.peaks.slice();
          const worst = Math.min.apply(null, peaks);
          reps.push({ movement: m.id, name: m.name, count: st.count, durationMs: t - st.startedAt, proximity: worst, grade: gradeFor(worst), steps: seq.map((id, i) => ({ pose: id, peak: peaks[i] })) });
          begin(st, t, proximity);
        } else {
          st.step = next;
          st.peaks[next] = proximity;
          st.lastAt = t;
        }
        progressed.push(m.id);
      } else if (poseId === seq[0]) {
        begin(st, t, proximity);
        progressed.push(m.id);
      }
    });
    return { reps, progressed };
  }

  function track(poseId, proximity) {
    defs.forEach((m) => {
      const st = states.get(m.id);
      if (st.step >= 0 && m.sequence[st.step] === poseId) st.peaks[st.step] = Math.max(st.peaks[st.step] || 0, proximity);
    });
  }

  function snapshot() {
    const out = {};
    defs.forEach((m) => {
      const st = states.get(m.id);
      out[m.id] = { id: m.id, name: m.name, sequence: m.sequence.slice(), step: st.step, count: st.count, lastAt: st.lastAt };
    });
    return out;
  }

  function reset() {
    defs.forEach((m) => states.set(m.id, fresh()));
  }

  return { setMovements, enter, track, snapshot, reset };
}
