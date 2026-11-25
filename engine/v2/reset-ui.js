export function mountReset(host, options) {
  const o = options || {};
  const root = host || document.body;
  const confirmMode = o.confirm !== false;
  let dialog = o.dialog || null;
  let confirmBtn = o.confirmButton || null;
  let cancelBtn = o.cancelButton || null;
  let created = [];
  let destroyed = false;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function onConfirm() {
    if (typeof o.onConfirm === "function") o.onConfirm();
    close();
  }

  function open() {
    if (dialog && !dialog.open) dialog.showModal();
  }

  function close() {
    if (dialog && dialog.open) dialog.close();
  }

  if (!confirmMode) {
    const btn = o.button || null;
    function handler() {
      if (typeof o.onConfirm === "function") o.onConfirm();
    }
    if (btn) btn.addEventListener("click", handler);
    return {
      open() {
        if (typeof o.onConfirm === "function") o.onConfirm();
      },
      close() {},
      destroy() {
        destroyed = true;
        if (btn) btn.removeEventListener("click", handler);
      },
    };
  }

  if (!dialog) {
    dialog = el("dialog", "sheet reset pe-reset");
    dialog.id = o.dialogId || "reset-confirm";
    if (o.ariaLabelledBy !== false) dialog.setAttribute("aria-labelledby", o.titleId || "reset-title");
    const body = el("div", "sheet-body");
    const title = el("h2", o.title || "Vaciar biblioteca");
    title.id = o.titleId || "reset-title";
    const text = el("p", o.text || "");
    const actions = el("div", "reset-actions");
    cancelBtn = el("button", "btn", o.cancelLabel || "Cancelar");
    cancelBtn.type = "button";
    cancelBtn.id = o.cancelId || "btn-reset-cancel";
    confirmBtn = el("button", "btn btn-danger", o.confirmLabel || "Vaciar");
    confirmBtn.type = "button";
    confirmBtn.id = o.confirmId || "btn-reset-confirm";
    actions.append(cancelBtn, confirmBtn);
    body.append(title, text, actions);
    dialog.append(body);
    root.append(dialog);
    created.push(dialog);
  } else {
    if (!confirmBtn) confirmBtn = dialog.querySelector("button.btn-danger");
    if (!cancelBtn) cancelBtn = dialog.querySelector("button:not(.btn-danger)");
  }

  function handleConfirm() { onConfirm(); }
  function handleCancel() { close(); }
  function handleBackdrop(e) { if (e.target === dialog) close(); }
  if (confirmBtn) confirmBtn.addEventListener("click", handleConfirm);
  if (cancelBtn) cancelBtn.addEventListener("click", handleCancel);
  dialog.addEventListener("click", handleBackdrop);

  if (o.button) {
    o.button.addEventListener("click", open);
    created.push(o.button);
  }

  return {
    open,
    close,
    destroy() {
      destroyed = true;
      if (confirmBtn) confirmBtn.removeEventListener("click", handleConfirm);
      if (cancelBtn) cancelBtn.removeEventListener("click", handleCancel);
      dialog.removeEventListener("click", handleBackdrop);
      if (o.button) o.button.removeEventListener("click", open);
      close();
      created.forEach((node) => { if (node && node.parentNode && o.ownsDialog) node.remove(); });
    },
  };
}
