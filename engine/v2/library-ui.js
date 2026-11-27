import { mountReset } from "./reset-ui.js";
import { formatKeys } from "./keys.js";

const TAB = Object.freeze({ POSES: "poses", MOVES: "moves" });
const VIEW = Object.freeze({ POSES: "poses", MOVES: "moves", POSE: "pose", MOVE: "move", IMPORT: "import" });
const THUMB_PX = 44;
const PREVIEW_PX = 132;
const STATUS_MS = 2600;
const CONFIRM_MS = 3000;

export function mountLibrary(host, options) {
  const o = options || {};
  const layout = o.layout === "inline" ? "inline" : "dialog";
  const texts = o.texts || {};
  const data = o.data || {};
  const root = host || document.body;
  let destroyed = false;
  let statusTimer = 0;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(cls, text, onClick) {
    const b = el("button", cls, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusEl.textContent = ""; }, STATUS_MS);
  }

  if (layout === "inline") {
    function refresh() {
      root.textContent = "";
      const customs = typeof o.getCustomPoses === "function" ? o.getCustomPoses() : [];
      const selectedId = typeof o.getSelectedId === "function" ? o.getSelectedId() : null;
      if (!customs.length) {
        const empty = el("p", "hint", texts.emptyCustom || "A\u00fan no hay poses propias.");
        root.appendChild(empty);
        return;
      }
      customs.forEach((pose) => {
        const wrap = el("div", "custom-pose pe-lib-row");
        wrap.dataset.id = pose.id;
        const nameInput = el("input");
        nameInput.type = "text";
        nameInput.value = pose.name || "";
        nameInput.maxLength = 40;
        nameInput.setAttribute("aria-label", texts.poseNameLabel || "Nombre de la pose");
        nameInput.addEventListener("change", () => {
          if (typeof o.onRename === "function") o.onRename(pose.id, nameInput.value);
        });
        wrap.appendChild(nameInput);
        const viewBtn = el("button", "", selectedId === pose.id ? (texts.viewing || "Viendo") : (texts.view || "Ver"));
        viewBtn.type = "button";
        viewBtn.setAttribute("aria-pressed", selectedId === pose.id ? "true" : "false");
        viewBtn.addEventListener("click", () => {
          if (typeof o.onSelect === "function") o.onSelect(pose.id);
        });
        wrap.appendChild(viewBtn);
        const recordBtn = el("button", "", texts.record || "Regrabar");
        recordBtn.type = "button";
        recordBtn.addEventListener("click", () => {
          if (typeof o.onRecord === "function") o.onRecord(pose.id);
        });
        wrap.appendChild(recordBtn);
        const deleteBtn = el("button", "", texts.remove || "Borrar");
        deleteBtn.type = "button";
        deleteBtn.addEventListener("click", () => {
          if (typeof o.onDelete === "function") o.onDelete(pose.id);
        });
        wrap.appendChild(deleteBtn);
        root.appendChild(wrap);
      });
    }
    refresh();
    return {
      refresh,
      destroy() {
        destroyed = true;
        root.textContent = "";
      },
    };
  }

  function poseById(id) {
    const lib = o.getLibrary();
    return lib.poses.find((p) => p.id === id) || null;
  }

  function poseName(id) {
    const p = poseById(id);
    return p ? p.name : "";
  }

  function commit() {
    if (typeof o.commit === "function") o.commit();
    if (typeof o.onChange === "function") o.onChange(o.getLibrary());
  }

  function chevron() {
    const s = el("span", "chev");
    s.setAttribute("aria-hidden", "true");
    s.textContent = "\u203a";
    return s;
  }

  function field(label, control) {
    const wrap = el("label", "field");
    wrap.append(el("span", "field-label", label), control);
    return wrap;
  }

  function input(value, max) {
    const i = el("input", "input");
    i.type = "text";
    i.maxLength = max;
    i.value = value;
    i.autocomplete = "off";
    return i;
  }

  function textarea(value, max) {
    const t = el("textarea", "input textarea");
    t.maxLength = max;
    t.value = value;
    t.rows = 2;
    return t;
  }

  function backBar(title, to) {
    const bar = el("div", "edit-head");
    const back = button("back-btn", "\u2039 " + texts.back, () => show(to));
    bar.append(back, el("h2", "edit-title", title));
    return bar;
  }

  function removeButton(onConfirm) {
    const b = button("btn btn-danger", texts.remove, () => {
      if (b.dataset.confirm === "true") { onConfirm(); return; }
      b.dataset.confirm = "true";
      b.textContent = texts.confirmRemove;
      setTimeout(() => { b.dataset.confirm = ""; b.textContent = texts.remove; }, CONFIRM_MS);
    });
    return b;
  }

  const dialog = el("dialog", "sheet lib pe-lib");
  dialog.id = o.dialogId || "lib";
  dialog.setAttribute("aria-label", texts.dialogLabel || "Poses y movimientos");
  const libBody = el("div", "lib-body");
  const libHead = el("div", "lib-head");
  const tabs = el("div", "tabs");
  tabs.setAttribute("role", "tablist");
  const tabPoses = button("tab", texts.poses || "Poses", () => show(VIEW.POSES));
  tabPoses.id = "tab-poses";
  tabPoses.dataset.tab = "poses";
  tabPoses.setAttribute("role", "tab");
  const tabMoves = button("tab", texts.moves || "Movimientos", () => show(VIEW.MOVES));
  tabMoves.id = "tab-moves";
  tabMoves.dataset.tab = "moves";
  tabMoves.setAttribute("role", "tab");
  tabs.append(tabPoses, tabMoves);
  const libClose = button("close-btn", undefined, () => dialog.close());
  libClose.id = "lib-close";
  libClose.setAttribute("aria-label", texts.close || "Cerrar");
  libClose.innerHTML = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" d=\"M6 6l12 12M18 6 6 18\"/></svg>";
  libHead.append(tabs, libClose);
  const libMain = el("div", "lib-main");
  libMain.id = "lib-main";
  const libFoot = el("div", "lib-foot");
  libFoot.id = "lib-foot";
  const statusEl = el("p", "lib-status");
  statusEl.id = "lib-status";
  statusEl.setAttribute("aria-live", "polite");
  const libActions = el("div", "lib-actions");
  const copyBtn = button("btn", texts.copy || "Copiar datos", () => copyLibrary());
  copyBtn.id = "btn-copy";
  const pasteBtn = button("btn", texts.paste || "Pegar datos", () => { importBack = view === VIEW.MOVES ? VIEW.MOVES : VIEW.POSES; show(VIEW.IMPORT); });
  pasteBtn.id = "btn-paste";
  libActions.append(copyBtn, pasteBtn);
  const resetBtn = button("btn btn-reset", texts.reset || "Vaciar biblioteca", () => {});
  resetBtn.id = "btn-reset-lib";
  libFoot.append(statusEl, libActions, resetBtn);
  libBody.append(libHead, libMain, libFoot);
  dialog.append(libBody);
  root.append(dialog);

  let view = VIEW.POSES;
  let editing = null;
  let importBack = VIEW.POSES;
  const created = [dialog];

  function renderPosesList() {
    const lib = o.getLibrary();
    if (!lib.poses.length) return [el("p", "empty", texts.emptyPoses)];
    const list = el("ul", "items");
    lib.poses.forEach((p) => {
      const li = el("li");
      const b = button("item", undefined, () => openPose(p.id));
      const thumb = el("canvas", "thumb");
      thumb.setAttribute("aria-hidden", "true");
      if (typeof o.drawThumb === "function") o.drawThumb(thumb, p.pts, THUMB_PX);
      const body = el("span", "item-body");
      body.append(el("span", "item-name", p.name), el("span", "item-sub", p.description || texts.noDescription));
      b.append(thumb, body, chevron());
      li.append(b);
      list.append(li);
    });
    return [list];
  }

  function renderMovesList() {
    const lib = o.getLibrary();
    const out = [];
    if (!lib.movements.length) out.push(el("p", "empty", texts.emptyMoves));
    else {
      const list = el("ul", "items");
      lib.movements.forEach((m) => {
        const li = el("li");
        const b = button("item", undefined, () => openMove(m.id));
        const body = el("span", "item-body");
        const seq = m.sequence.map(poseName).filter(Boolean).join(" \u2192 ");
        body.append(el("span", "item-name", m.name), el("span", "item-sub", m.description || seq || texts.sequenceEmpty));
        if (m.description && seq) body.append(el("span", "item-sub item-seq", seq));
        b.append(body, chevron());
        li.append(b);
        list.append(li);
      });
      out.push(list);
    }
    const add = button("btn btn-ghost add-btn", texts.newMove, () => openMove(null));
    if (lib.poses.length < 2) {
      add.disabled = true;
      out.push(add, el("p", "tenue-line", texts.needPoses));
    } else out.push(add);
    return out;
  }

  function renderPoseEdit() {
    const lib = o.getLibrary();
    const p = poseById(editing);
    if (!p) return renderPosesList();
    const name = input(p.name, o.nameMax || 40);
    const desc = textarea(p.description, o.descriptionMax || 160);
    const keysInput = input(formatKeys(p.keys), 80);
    keysInput.setAttribute("autocomplete", "off");
    keysInput.spellcheck = false;
    const holdBox = input("", 0);
    holdBox.type = "checkbox";
    holdBox.checked = p.hold === true;
    const holdField = el("label", "field hold-field");
    holdField.append(holdBox, el("span", "field-label", texts.hold || "Mantener tecla"));
    if (texts.holdHint) holdField.append(el("span", "field-label field-hint", texts.holdHint));
    const preview = el("canvas", "preview");
    preview.setAttribute("aria-hidden", "true");
    if (typeof o.drawThumb === "function") o.drawThumb(preview, p.pts, PREVIEW_PX);
    const used = lib.movements.filter((m) => m.sequence.indexOf(p.id) !== -1).length;
    const top = el("div", "pose-top");
    const meta = el("div", "pose-meta");
    meta.append(field(texts.name, name));
    if (used) meta.append(el("p", "tenue-line", texts.usedIn(used)));
    top.append(preview, meta);
    const actions = el("div", "edit-actions");
    actions.append(
      removeButton(() => {
        const current = o.getLibrary();
        current.poses = current.poses.filter((q) => q.id !== p.id);
        current.movements = current.movements.map((m) => Object.assign({}, m, { sequence: m.sequence.filter((id) => id !== p.id) }));
        commit();
        show(VIEW.POSES);
      }),
      button("btn btn-primary", texts.save, () => {
        p.name = name.value.trim().slice(0, o.nameMax || 40) || p.name;
        p.description = desc.value.trim().slice(0, o.descriptionMax || 160);
        const keys = keysInput.value.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 12).map((v) => v.slice(0, 32));
        if (keys.length) p.keys = keys;
        else delete p.keys;
        if (holdBox.checked) p.hold = true;
        else delete p.hold;
        commit();
        show(VIEW.POSES);
      }),
    );
    const keysField = field(texts.keys || "Teclas", keysInput);
    if (texts.keysHint) keysField.append(el("span", "field-label field-hint", texts.keysHint));
    return [backBar(p.name, VIEW.POSES), top, field(texts.description, desc), keysField, holdField, actions];
  }

  function renderMoveEdit() {
    const lib = o.getLibrary();
    const existing = editing ? lib.movements.find((m) => m.id === editing) : null;
    const draft = existing ? { name: existing.name, description: existing.description, sequence: existing.sequence.slice() } : { name: data.nextName(lib.movements, texts.movePrefix), description: "", sequence: [] };
    const name = input(draft.name, o.nameMax || 40);
    const desc = textarea(draft.description, o.descriptionMax || 160);
    const seqBox = el("ol", "chips seq-edit");
    const pool = el("div", "chips pool");
    const normalize = typeof o.normalizeSequence === "function" ? o.normalizeSequence : (seq) => seq;
    const save = button("btn btn-primary", texts.save, () => {
      const seq = normalize(draft.sequence);
      if (!seq.length) return;
      const moveData = { name: name.value.trim().slice(0, o.nameMax || 40) || draft.name, description: desc.value.trim().slice(0, o.descriptionMax || 160), sequence: draft.sequence.slice() };
      if (existing) Object.assign(existing, moveData);
      else o.getLibrary().movements.push(Object.assign({ id: data.newId("m-") }, moveData));
      commit();
      show(VIEW.MOVES);
    });
    function paint() {
      if (!draft.sequence.length) seqBox.replaceChildren(el("li", "chip-empty", texts.sequenceEmpty));
      else seqBox.replaceChildren(...draft.sequence.map((id, i) => {
        const li = el("li", "chip chip-step");
        li.append(el("span", "chip-n", String(i + 1)), el("span", "chip-text", poseName(id)));
        const x = button("chip-x", "\u00d7", () => { draft.sequence.splice(i, 1); paint(); });
        x.setAttribute("aria-label", texts.removeStep + " " + poseName(id));
        li.append(x);
        return li;
      }));
      const last = draft.sequence[draft.sequence.length - 1];
      pool.replaceChildren(...o.getLibrary().poses.map((p) => {
        const b = button("chip chip-add", "+ " + p.name, () => { draft.sequence.push(p.id); paint(); });
        b.disabled = p.id === last;
        return b;
      }));
      save.disabled = !normalize(draft.sequence).length;
    }
    paint();
    const actions = el("div", "edit-actions");
    if (existing) actions.append(removeButton(() => {
      const current = o.getLibrary();
      current.movements = current.movements.filter((m) => m.id !== existing.id);
      commit();
      show(VIEW.MOVES);
    }));
    actions.append(save);
    const seqField = el("div", "field");
    seqField.append(el("span", "field-label", texts.sequence), seqBox, el("span", "field-label field-hint", texts.sequenceHint), pool);
    return [backBar(existing ? existing.name : texts.newMove, VIEW.MOVES), field(texts.name, name), field(texts.description, desc), seqField, actions];
  }

  function renderImport(back) {
    const area = el("textarea", "input textarea paste-area");
    area.placeholder = texts.importHint;
    area.spellcheck = false;
    const run = button("btn btn-primary", texts.importAction, () => {
      const parsed = data.parseImport(area.value);
      if (!parsed) { setStatus(texts.importFailed); return; }
      const merged = data.mergeLibrary(o.getLibrary(), parsed);
      if (typeof o.replaceLibrary === "function") o.replaceLibrary(merged.lib);
      else Object.assign(o.getLibrary(), merged.lib);
      commit();
      show(back);
      setStatus(texts.imported(merged.poses, merged.movements));
    });
    const actions = el("div", "edit-actions");
    actions.append(run);
    return [backBar(texts.importTitle, back), area, actions];
  }

  function show(next) {
    view = next;
    const tab = view === VIEW.MOVES || view === VIEW.MOVE ? TAB.MOVES : view === VIEW.IMPORT ? (importBack === VIEW.MOVES ? TAB.MOVES : TAB.POSES) : TAB.POSES;
    tabPoses.setAttribute("aria-selected", String(tab === TAB.POSES));
    tabMoves.setAttribute("aria-selected", String(tab === TAB.MOVES));
    const listView = view === VIEW.POSES || view === VIEW.MOVES;
    libFoot.hidden = !listView;
    dialog.dataset.view = view;
    let nodes;
    if (view === VIEW.POSES) nodes = renderPosesList();
    else if (view === VIEW.MOVES) nodes = renderMovesList();
    else if (view === VIEW.POSE) nodes = renderPoseEdit();
    else if (view === VIEW.MOVE) nodes = renderMoveEdit();
    else nodes = renderImport(importBack);
    libMain.replaceChildren(...nodes);
    libMain.scrollTop = 0;
  }

  function openPose(id) {
    editing = id;
    show(VIEW.POSE);
  }

  function openMove(id) {
    editing = id;
    show(VIEW.MOVE);
  }

  function open(tab) {
    show(tab === TAB.MOVES ? VIEW.MOVES : VIEW.POSES);
    statusEl.textContent = "";
    if (!dialog.open) dialog.showModal();
  }

  async function copyLibrary() {
    const libData = data.exportLibrary(o.getLibrary());
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(libData);
        ok = true;
      }
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      const t = el("textarea");
      t.value = libData;
      t.setAttribute("readonly", "");
      t.className = "offscreen";
      dialog.append(t);
      t.select();
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      t.remove();
    }
    setStatus(ok ? texts.copied : texts.copyFailed);
  }

  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  const resetMount = mountReset(document.body, {
    button: resetBtn,
    ownsDialog: true,
    dialogId: o.resetDialogId || "reset-confirm",
    titleId: o.resetTitleId || "reset-title",
    cancelId: o.resetCancelId || "btn-reset-cancel",
    confirmId: o.resetConfirmId || "btn-reset-confirm",
    title: texts.resetTitle,
    text: texts.resetText,
    confirmLabel: texts.resetConfirm,
    cancelLabel: texts.cancel,
    onConfirm: () => {
      const next = data.resetLibrary();
      if (typeof o.replaceLibrary === "function") o.replaceLibrary(next);
      else Object.assign(o.getLibrary(), next);
      editing = null;
      if (typeof o.onReset === "function") o.onReset(o.getLibrary());
      commit();
      show(view === VIEW.MOVE ? VIEW.MOVES : view === VIEW.POSE ? VIEW.POSES : view);
      setStatus(texts.resetDone);
    },
  });
  created.push(resetMount);

  show(VIEW.POSES);

  return {
    open,
    close: () => { if (dialog.open) dialog.close(); },
    refresh: () => show(view),
    show,
    isOpen: () => dialog.open,
    elements: { dialog, libMain, libFoot, statusEl, tabPoses, tabMoves, libClose, copyBtn, pasteBtn, resetBtn },
    destroy() {
      destroyed = true;
      clearTimeout(statusTimer);
      if (resetMount.destroy) resetMount.destroy();
      if (dialog.open) dialog.close();
      if (dialog.parentNode) dialog.remove();
    },
  };
}
