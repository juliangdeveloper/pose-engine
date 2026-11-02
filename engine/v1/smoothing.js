const TWO_PI = 2 * Math.PI;
const MIN_DT_S = 1e-3;
const MS_PER_S = 1000;

export const SMOOTHING_DEFAULTS = Object.freeze({ minCutoff: 1.2, beta: 4, dCutoff: 1 });

function alpha(cutoff, dt) {
  const r = TWO_PI * cutoff * dt;
  return r / (r + 1);
}

export function createOneEuroFilter(options) {
  const o = Object.assign({}, SMOOTHING_DEFAULTS, options);
  let last = null;
  let lastDx = 0;
  let lastT = null;
  return {
    filter(x, tMs) {
      if (lastT === null || !isFinite(last)) {
        last = x;
        lastDx = 0;
        lastT = tMs;
        return x;
      }
      const dt = Math.max((tMs - lastT) / MS_PER_S, MIN_DT_S);
      lastT = tMs;
      const dx = (x - last) / dt;
      const edx = lastDx + alpha(o.dCutoff, dt) * (dx - lastDx);
      lastDx = edx;
      const cutoff = o.minCutoff + o.beta * Math.abs(edx);
      last = last + alpha(cutoff, dt) * (x - last);
      return last;
    },
    reset() {
      last = null;
      lastDx = 0;
      lastT = null;
    },
  };
}

const AXES = ["x", "y", "z"];

export function createLandmarkSmoother(options) {
  let filters = [];
  function ensure(n) {
    while (filters.length < n) filters.push(AXES.map(() => createOneEuroFilter(options)));
  }
  return {
    smooth(list, tMs) {
      if (!list) return null;
      if (options === false) return list;
      ensure(list.length);
      return list.map((p, i) => {
        const f = filters[i];
        return {
          x: f[0].filter(p.x, tMs),
          y: f[1].filter(p.y, tMs),
          z: f[2].filter(p.z || 0, tMs),
          visibility: p.visibility === undefined ? 1 : p.visibility,
        };
      });
    },
    reset() {
      filters = [];
    },
  };
}
