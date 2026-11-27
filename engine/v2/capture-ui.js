export function mountCapture(host, options) {
  const o = options || {};
  const variant = o.variant === "inline" ? "inline" : "banner";
  const texts = o.texts || {};
  const root = host || document.body;
  let destroyed = false;
  let popTimer = 0;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  if (variant === "inline") {
    const cancelBtn = o.cancelButton || null;
    const hintEl = o.hintEl || null;
    const secondsEl = o.secondsEl || null;
    function render(state) {
      const s = state || {};
      const snap = s.snapshot || null;
      const active = snap && snap.state !== "idle";
      if (cancelBtn) cancelBtn.hidden = !active && !s.pendingFeatures;
      if (snap && snap.result === "captured") {
        if (cancelBtn) cancelBtn.hidden = false;
        if (secondsEl) secondsEl.hidden = true;
        if (typeof o.onCaptured === "function") o.onCaptured(snap.features);
        return;
      }
      if (snap && snap.result === "no-body") {
        if (hintEl) hintEl.textContent = texts.captureFailed || "";
        if (typeof o.onNoBody === "function") o.onNoBody();
        return;
      }
      if (snap && snap.state === "countdown") {
        if (secondsEl) {
          secondsEl.hidden = false;
          secondsEl.textContent = String(snap.seconds);
        }
        if (hintEl) hintEl.textContent = texts.countdownHint || "";
        if (typeof o.onStatus === "function") o.onStatus(texts.countdownStatus ? texts.countdownStatus(snap.seconds) : "");
      } else if (snap && snap.state === "holding") {
        if (secondsEl) secondsEl.hidden = true;
        if (hintEl) hintEl.textContent = texts.holdingHint || "";
      } else if (active) {
        if (secondsEl) secondsEl.hidden = true;
        if (hintEl) hintEl.textContent = texts.waitingHint || "";
      }
    }
    return {
      render,
      destroy() { destroyed = true; },
    };
  }

  let banner = o.banner || null;
  let bannerTitle = o.bannerTitle || null;
  let bannerHint = o.bannerHint || null;
  let bannerHold = o.bannerHold || null;
  let countdown = o.countdown || null;
  const created = [];
  if (!banner) {
    banner = el("div", "capture-banner pe-capture");
    banner.id = o.bannerId || "capture-banner";
    banner.hidden = true;
    banner.setAttribute("aria-live", "polite");
    const icon = el("span", "capture-icon");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = "<svg viewBox=\"0 0 24 24\" focusable=\"false\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\"><circle cx=\"12\" cy=\"4.6\" r=\"2\"/><path d=\"M2.5 9h19M12 9v6.2M12 15.2l-3 6M12 15.2l3 6\"/></svg>";
    const textWrap = el("span", "capture-text");
    bannerTitle = el("span", "capture-title");
    bannerTitle.id = o.bannerTitleId || "capture-title";
    bannerHint = el("span", "capture-hint");
    bannerHint.id = o.bannerHintId || "capture-hint";
    textWrap.append(bannerTitle, bannerHint);
    bannerHold = el("span", "capture-hold");
    bannerHold.id = o.bannerHoldId || "capture-hold";
    bannerHold.setAttribute("aria-hidden", "true");
    banner.append(icon, textWrap, bannerHold);
    root.append(banner);
    created.push(banner);
  }
  if (!countdown) {
    countdown = el("div", "countdown pe-countdown");
    countdown.id = o.countdownId || "countdown";
    countdown.hidden = true;
    countdown.setAttribute("aria-hidden", "true");
    root.append(countdown);
    created.push(countdown);
  }
  const button = o.button || null;
  const capturedMs = typeof o.capturedMs === "number" ? o.capturedMs : 2200;

  function renderCalibration(calibration, pending, note) {
    const now = performance.now();
    const activeNote = note && now - note.at < capturedMs ? note : null;
    const active = !!(calibration && calibration.active);
    if (!active && !activeNote) return false;
    if (button) {
      button.textContent = pending ? texts.captureDone : texts.capture;
      button.setAttribute("aria-pressed", String(!!pending));
      button.classList.toggle("on", !!pending);
    }
    banner.hidden = false;
    countdown.hidden = true;
    if (!active) {
      banner.dataset.state = "done";
      bannerTitle.textContent = activeNote.title;
      bannerHint.textContent = activeNote.hint;
      bannerHold.style.transform = "scaleX(0)";
      return true;
    }
    const c = calibration.snapshot || { state: "waiting", progress: 0, missing: [] };
    const holding = c.state === "holding";
    const missing = c.missing && c.missing.length ? c.missing : [];
    banner.dataset.state = holding ? "holding" : "waiting";
    bannerHold.style.transform = "scaleX(" + (holding ? c.progress : 0).toFixed(3) + ")";
    bannerTitle.textContent = holding ? texts.calHold : texts.calWait;
    if (missing.length) bannerHint.textContent = texts.missing(missing);
    else if (holding) bannerHint.textContent = Math.round((c.progress || 0) * 100) + "%" + (texts.calHoldHint ? " · " + texts.calHoldHint : "");
    else bannerHint.textContent = texts.calWaitHint || "";
    return true;
  }

  function render(state) {
    const s = state || {};
    if (renderCalibration(s.calibration, s.pending, s.calibrationNote)) return;
    const c = s.snapshot || null;
    const active = c && c.state !== "idle";
    if (button) {
      button.textContent = active ? texts.captureDone : texts.capture;
      button.setAttribute("aria-pressed", String(!!active));
      button.classList.toggle("on", !!active);
    }
    banner.hidden = !active;
    countdown.hidden = !(active && c.state === "countdown");
    if (!active) return;
    const now = performance.now();
    const note = s.capturedNote && now - s.capturedNote.at < capturedMs ? s.capturedNote : null;
    banner.dataset.state = c.state;
    bannerHold.style.transform = "scaleX(" + (c.state === "holding" ? c.holdProgress : c.state === "countdown" ? 1 : 0).toFixed(3) + ")";
    if (c.state === "countdown") {
      bannerTitle.textContent = texts.countdown;
      bannerHint.textContent = "";
      if (countdown.textContent !== String(c.seconds)) {
        countdown.textContent = String(c.seconds);
        restart(countdown, "tick");
      }
      return;
    }
    countdown.textContent = "";
    const isHand = c.kind === "hand";
    const waitTitle = isHand ? (texts.waitHand || texts.waitT) : texts.waitT;
    const waitHint = isHand ? (texts.waitHandHint || texts.waitTHint) : texts.waitTHint;
    const nextTitle = isHand ? (texts.waitHandNext || texts.waitTNext) : texts.waitTNext;
    if (c.state === "holding") {
      bannerTitle.textContent = texts.holdT;
      bannerHint.textContent = texts.waitTHint;
    } else if (note) {
      bannerTitle.textContent = note.text;
      bannerHint.textContent = c.needsRelease ? (isHand ? nextTitle : texts.releaseT) : nextTitle;
      banner.dataset.state = note.ok ? "done" : "failed";
    } else {
      bannerTitle.textContent = isHand ? waitTitle : (c.needsRelease ? (s.capturedNote ? texts.releaseT : texts.releaseFirst) : texts.waitT);
      bannerHint.textContent = isHand && !c.needsRelease ? waitHint : texts.waitTHint;
      if (isHand && c.needsRelease) bannerHint.textContent = waitHint;
    }
  }

  return {
    render,
    destroy() {
      destroyed = true;
      clearTimeout(popTimer);
      created.forEach((node) => { if (node.parentNode) node.remove(); });
    },
    elements: { banner, bannerTitle, bannerHint, bannerHold, countdown },
  };
}

export function mountPoseEditor(host, options) {
  const o = options || {};
  const root = host || document.body;
  const created = [];
  let destroyed = false;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  let editor = o.editor || null;
  let nameInput = o.nameInput || null;
  let saveBtn = o.saveButton || null;
  let retryBtn = o.retryButton || null;
  let discardBtn = o.discardButton || null;
  if (!editor) {
    editor = el("div");
    editor.id = o.editorId || "pose-editor";
    editor.hidden = true;
    const row = el("div", "row");
    nameInput = el("input");
    nameInput.type = "text";
    nameInput.id = o.nameId || "pose-name";
    nameInput.maxLength = 40;
    nameInput.autocomplete = "off";
    nameInput.setAttribute("aria-label", o.nameLabel || "Nombre de la pose");
    row.append(nameInput);
    const row2 = el("div", "row");
    saveBtn = el("button", "", o.saveLabel || "Guardar");
    saveBtn.type = "button";
    saveBtn.id = o.saveId || "pose-save";
    retryBtn = el("button", "", o.retryLabel || "Repetir");
    retryBtn.type = "button";
    retryBtn.id = o.retryId || "pose-retry";
    discardBtn = el("button", "", o.discardLabel || "Descartar");
    discardBtn.type = "button";
    discardBtn.id = o.discardId || "pose-discard";
    row2.append(saveBtn, retryBtn, discardBtn);
    editor.append(row, row2);
    root.append(editor);
    created.push(editor);
  }

  function handleSave() {
    if (typeof o.onSave === "function") o.onSave(nameInput ? nameInput.value : "");
  }
  function handleRetry() {
    if (typeof o.onRetry === "function") o.onRetry();
  }
  function handleDiscard() {
    if (typeof o.onDiscard === "function") o.onDiscard();
  }
  if (saveBtn) saveBtn.addEventListener("click", handleSave);
  if (retryBtn) retryBtn.addEventListener("click", handleRetry);
  if (discardBtn) discardBtn.addEventListener("click", handleDiscard);

  return {
    show(defaultName) {
      if (nameInput) nameInput.value = defaultName || "";
      editor.hidden = false;
    },
    hide() {
      editor.hidden = true;
    },
    getName() {
      return nameInput ? nameInput.value : "";
    },
    isVisible() {
      return !editor.hidden;
    },
    destroy() {
      destroyed = true;
      if (saveBtn) saveBtn.removeEventListener("click", handleSave);
      if (retryBtn) retryBtn.removeEventListener("click", handleRetry);
      if (discardBtn) discardBtn.removeEventListener("click", handleDiscard);
      created.forEach((node) => { if (node.parentNode) node.remove(); });
    },
    elements: { editor, nameInput, saveBtn, retryBtn, discardBtn },
  };
}
