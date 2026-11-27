export const KEY_DEFAULTS = Object.freeze({ stepMs: 80, holdDelayMs: 500, holdRepeatMs: 120, keyUpMs: 40, maxQueue: 64, maxKeys: 12 });
export const KEY_ACTIONS = Object.freeze({ DOWN: "keydown", UP: "keyup" });

const MODIFIERS = Object.freeze({ ctrl: "ctrlKey", control: "ctrlKey", shift: "shiftKey", alt: "altKey", option: "altKey", meta: "metaKey", cmd: "metaKey", command: "metaKey" });

export function parseKeys(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).slice(0, KEY_DEFAULTS.maxKeys).map((v) => v.slice(0, 32));
  if (typeof value !== "string") return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean).slice(0, KEY_DEFAULTS.maxKeys).map((v) => v.slice(0, 32));
}

export function formatKeys(keys) {
  return parseKeys(keys).join(", ");
}

export function parseCombo(token) {
  const parts = String(token).split("+").map((p) => p.trim()).filter(Boolean);
  const out = { key: token, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
  if (parts.length <= 1) {
    out.key = parts.length ? parts[0] : token;
    return out;
  }
  const main = parts[parts.length - 1];
  out.key = main.length === 1 ? main : (main === "enter" ? "Enter" : main === "space" ? " " : main);
  parts.slice(0, -1).forEach((p) => {
    const flag = MODIFIERS[p.toLowerCase()];
    if (flag) out[flag] = true;
  });
  return out;
}

export function createKeyDispatcher(options) {
  const o = Object.assign({}, KEY_DEFAULTS, options || {});
  const now = typeof o.now === "function" ? o.now : () => Date.now();
  const schedule = typeof o.schedule === "function" ? o.schedule : (fn, ms) => setTimeout(fn, ms);
  const cancel = typeof o.cancel === "function" ? o.cancel : (id) => clearTimeout(id);
  const onKey = typeof o.onKey === "function" ? o.onKey : () => {};
  const queue = [];
  const holds = new Map();
  let seq = 0;
  let timer = null;
  let destroyed = false;

  function dispatchDom(key) {
    if (o.dispatch === false) return;
    try {
      const view = o.target || (typeof window !== "undefined" ? window : null);
      if (!view || typeof view.dispatchEvent !== "function") return;
      if (typeof KeyboardEvent === "undefined") return;
      const combo = parseCombo(key);
      const init = { key: combo.key, ctrlKey: combo.ctrlKey, shiftKey: combo.shiftKey, altKey: combo.altKey, metaKey: combo.metaKey, bubbles: true, cancelable: true };
      view.dispatchEvent(new KeyboardEvent(KEY_ACTIONS.DOWN, init));
      schedule(() => { try { view.dispatchEvent(new KeyboardEvent(KEY_ACTIONS.UP, init)); } catch (e) {} }, o.keyUpMs);
    } catch (e) {}
  }

  function emitOne(job) {
    const key = job.keys[job.index];
    const entry = { poseId: job.poseId, key, index: job.index, total: job.keys.length, hold: job.hold, jobId: job.seq, at: now() };
    onKey(entry);
    dispatchDom(key);
    job.index += 1;
  }

  function pump() {
    if (destroyed || timer !== null) return;
    if (!queue.length) return;
    const job = queue[0];
    emitOne(job);
    if (job.index >= job.keys.length) queue.shift();
    if (queue.length) {
      timer = schedule(() => { timer = null; pump(); }, o.stepMs);
    }
  }

  function enqueue(poseId, keys, hold) {
    if (destroyed || !keys || !keys.length) return null;
    if (queue.length >= o.maxQueue) {
      if (queue.length > 1) queue.splice(1, 1);
      else return null;
    }
    const job = { seq: ++seq, poseId, keys: keys.slice(), index: 0, hold: !!hold, at: now() };
    queue.push(job);
    pump();
    return job.seq;
  }

  function startHold(poseId, keys) {
    if (holds.has(poseId)) return;
    const source = { keys: keys.slice(), delayTimer: null, repeatTimer: null };
    source.delayTimer = schedule(() => {
      source.delayTimer = null;
      if (!holds.has(poseId)) return;
      source.repeatTimer = schedule(function tick() {
        if (!holds.has(poseId)) return;
        enqueue(poseId, source.keys, true);
        source.repeatTimer = schedule(tick, o.holdRepeatMs);
      }, o.holdRepeatMs);
    }, o.holdDelayMs);
    holds.set(poseId, source);
  }

  function stopHold(poseId) {
    const source = holds.get(poseId);
    if (!source) return;
    if (source.delayTimer !== null) cancel(source.delayTimer);
    if (source.repeatTimer !== null) cancel(source.repeatTimer);
    holds.delete(poseId);
  }

  function enter(poseId, keys, hold) {
    const list = parseKeys(keys);
    if (!list.length) return null;
    const id = enqueue(poseId, list, !!hold);
    if (hold && id !== null) startHold(poseId, list);
    return id;
  }

  function leave(poseId) {
    stopHold(poseId);
  }

  function stopAll() {
    Array.from(holds.keys()).forEach((id) => stopHold(id));
  }

  function resetQueue() {
    queue.length = 0;
    if (timer !== null) { cancel(timer); timer = null; }
  }

  function destroy() {
    destroyed = true;
    stopAll();
    resetQueue();
    holds.clear();
  }

  return {
    enter,
    leave,
    stopAll,
    resetQueue,
    pending: () => queue.length,
    held: () => Array.from(holds.keys()),
    destroy,
  };
}
