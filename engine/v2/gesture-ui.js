const SVG_NS = "http://www.w3.org/2000/svg";
const HAND_PATH = "M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V5.5a1.5 1.5 0 0 1 3 0V12M17 12V8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.2L4.6 14.6a1.5 1.5 0 0 1 2.3-1.9L8 14";
const SLASH_PATH = "M4 4l16 16";
const LABEL_MIN_HOST_PX = 220;
export const GESTURE_TEXT = Object.freeze({
  toggle: "Gestos de mano",
  loading: "Cargando gestos",
  far: "Acércate a la cámara para usar gestos",
  near: "Gestos activos",
  failed: "Gestos no disponibles",
});

export function mountGestures(host, options) {
  const o = options || {};
  const texts = Object.assign({}, GESTURE_TEXT, o.texts);
  const toggle = typeof o.onToggle === "function";
  const root = document.createElement("div");
  root.className = "pe-gesture";
  root.dataset.state = "off";
  const icon = document.createElement(toggle ? "button" : "span");
  icon.className = "pe-gesture-icon";
  if (toggle) {
    icon.type = "button";
    icon.setAttribute("aria-pressed", "false");
    icon.addEventListener("click", () => o.onToggle());
  } else {
    icon.setAttribute("role", "img");
  }
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  [[HAND_PATH, "pe-gesture-hand"], [SLASH_PATH, "pe-gesture-slash"]].forEach(([d, cls]) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", cls);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.8");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  });
  icon.appendChild(svg);
  const label = document.createElement("span");
  label.className = "pe-gesture-label";
  label.setAttribute("aria-live", "polite");
  label.hidden = true;
  root.appendChild(label);
  root.appendChild(icon);
  root.hidden = !toggle;
  (host || document.body).appendChild(root);

  function describe(state, enabled) {
    if (!enabled) return texts.toggle;
    return texts[state] || texts.toggle;
  }

  function render(snapshot, enabled) {
    const on = enabled === undefined ? !!(snapshot && snapshot.state && snapshot.state !== "off") : !!enabled;
    const state = on ? (snapshot && snapshot.state && snapshot.state !== "off" ? snapshot.state : "idle") : "off";
    root.dataset.state = state;
    root.hidden = !toggle && !on;
    if (toggle) icon.setAttribute("aria-pressed", on ? "true" : "false");
    const text = describe(state, on);
    icon.setAttribute("aria-label", text);
    icon.title = text;
    const name = on && state === "near" && snapshot && snapshot.id ? snapshot.label || "" : "";
    label.textContent = name;
    label.hidden = !name || (root.parentElement && root.parentElement.clientWidth < LABEL_MIN_HOST_PX);
  }

  function destroy() {
    root.remove();
  }

  return { render, destroy, element: root };
}
