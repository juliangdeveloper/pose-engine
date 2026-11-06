import { compareFeatures } from "./features.js";
import { gradeFor } from "./grading.js";

export const MATCH_DEFAULTS = Object.freeze({ enter: 0.65, exit: 0.55, switchMargin: 0.05, enterMs: 120 });

export function createPoseMatcher(options) {
  const o = Object.assign({}, MATCH_DEFAULTS, options);
  let poses = [];
  let active = null;
  let candidate = null;

  function setPoses(list) {
    poses = (list || []).filter((p) => p && p.id && p.seg);
    if (active && !poses.some((p) => p.id === active.id)) active = null;
    candidate = null;
  }

  function nameOf(id) {
    const p = poses.find((q) => q.id === id);
    return p ? p.name || p.id : id;
  }

  function snapshot(a) {
    return a ? { id: a.id, name: nameOf(a.id), proximity: a.proximity, peak: a.peak, since: a.since, grade: gradeFor(a.peak) } : null;
  }

  function update(features, t) {
    const proximity = {};
    let best = null;
    poses.forEach((p) => {
      const r = features ? compareFeatures(features, p, o.tolerance) : null;
      proximity[p.id] = r ? r.proximity : null;
      if (r && (!best || r.proximity > best.proximity)) best = { id: p.id, name: p.name || p.id, proximity: r.proximity };
    });
    let entered = null;
    let left = null;
    if (active) {
      const p = proximity[active.id];
      if (p === null || p === undefined || p < o.exit) {
        left = snapshot(active);
        active = null;
      } else {
        active.proximity = p;
        active.peak = Math.max(active.peak, p);
      }
    }
    const floor = active ? active.proximity + o.switchMargin : o.enter;
    const target = best && best.proximity >= o.enter && best.proximity > floor && (!active || best.id !== active.id) ? best : null;
    if (!target) candidate = null;
    else if (!candidate || candidate.id !== target.id) candidate = { id: target.id, since: t };
    if (target && candidate && t - candidate.since >= o.enterMs) {
      if (active) left = snapshot(active);
      active = { id: target.id, proximity: target.proximity, peak: target.proximity, since: t };
      entered = snapshot(active);
      candidate = null;
    }
    return { proximity, best, active: snapshot(active), entered, left };
  }

  function reset() {
    active = null;
    candidate = null;
  }

  return { setPoses, update, reset, active: () => snapshot(active) };
}
