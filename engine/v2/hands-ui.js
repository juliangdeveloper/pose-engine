const LED_CLASS = "pe-hands-led";
const HANDS_CLASS = "pe-hands";

export function mountHands(host, options) {
  const o = options || {};
  const root = document.createElement("div");
  root.className = HANDS_CLASS;
  root.dataset.state = "off";
  const led = document.createElement("span");
  led.className = LED_CLASS;
  led.setAttribute("role", "img");
  led.setAttribute("aria-label", o.label || "Manos");
  root.appendChild(led);
  (host || document.body).appendChild(root);

  function render(snapshot) {
    const s = snapshot || {};
    const on = s.state === "near";
    root.dataset.state = on ? "on" : "off";
    led.dataset.state = root.dataset.state;
  }

  function destroy() {
    root.remove();
  }

  return { render, destroy, element: root };
}
