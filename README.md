# 🤸 pose-engine

**Real-time pose detection and rep counter for the browser: MediaPipe pose tracking that runs on-device, for fitness apps and interactive demos.**

> Sigue la silueta de la pose T para calibrar, imita el fantasma de cada pose, mira tu esqueleto en vivo y cuenta repeticiones con contador grande y barra de recorrido.

**[▶ Probar la demo](https://juliangdeveloper.github.io/pose-engine/)**

<img src="assets/screenshot.jpg" alt="pantalla de pose-engine con el esqueleto en vivo y el punto de detección de manos encendido junto al botón de detalle" width="320">

## Cómo se usa

- Calibra con la silueta de la pose T: cada segmento se pone verde cuando lo cubres y la medición arranca sola al coincidir.
- Imita la pose siguiente con el fantasma: las articulaciones que no coinciden se marcan en rojo y tu esqueleto en vivo atenúa las de baja confianza.
- Toca el icono de detalle en el visor para encender el modo detallado: arcos con los grados en cada articulación, esqueleto más grueso en los segmentos rápidos, puntos de profundidad cuando un brazo apunta a la cámara y articulaciones en verde o rojo con porcentaje de coincidencia.
- Ajusta distancia y luz con los avisos «Aléjate un paso», «Acércate», «Entra en el cuadro», «Poca luz» y «Contraluz» antes de empezar.
- Captura tus poses con la cámara: haz la pose T y, tras la cuenta de 3 segundos, se guarda la pose en la que estés.
- Captura una pose de mano tocando la pantalla con la mano a la vista. Tras la cuenta de 3 segundos se guarda la pose de mano en la misma biblioteca y se compara igual que las del cuerpo. Un punto pequeño junto al botón de detalle indica la detección de manos: verde cuando está activa, gris cuando está inactiva.
- Arma movimientos con secuencias de tus poses capturadas, por ejemplo Pose 1 → Pose 2.
- No trae poses ni movimientos de fábrica: la biblioteca empieza vacía. Vacía lo propio con «Vaciar biblioteca» en Poses o Movimientos.
- Cuenta repeticiones con contador grande, barra de recorrido y destello en el borde: verde al contar, rojo si quedó a medias.

## Usar el motor en otro proyecto

El motor es un módulo ES que se importa desde su ruta pública:

```js
const root = 'https://juliangdeveloper.github.io/pose-engine/engine/v2/';
const v = (await (await fetch(root + 'version.txt')).text()).trim();
const { createPoseEngine } = await import(root + 'index.js?v=' + v);
const engine = createPoseEngine({ video, poses, movements });
engine.on('pose', (p) => console.log(p.name, p.proximity));
engine.on('rep', (r) => console.log(r.name, r.count, r.grade.label));
engine.on('frame', (f) => console.log(f.motion.segments.leftForearm.angVel));
await engine.start({ source: 'camera' });
```

La detección usa solo poses y secuencias ordenadas de poses: ángulos articulares y posiciones relativas al torso, invariantes a la escala y a la posición en el cuadro. La velocidad y la aceleración se calculan en cada fotograma y quedan expuestas en `frame.motion` como datos para visualización y juegos, pero nunca deciden si una pose o un movimiento se detecta. El modo detallado del visor (arcos de ángulo, grosor por velocidad, profundidad y coincidencia) se dibuja con los helpers de `engine/v2/overlay.js`, exportados desde `index.js`, para reutilizarlos en otros proyectos.

## Poses de mano

Las manos usan el mismo pipeline que el cuerpo: landmarks de la mano convertidos a segmentos relativos a la palma, el mismo `createPoseMatcher` con `MATCH_DEFAULTS` (enter 0.65, exit 0.55, switchMargin 0.05, enterMs 120), la misma captura y la misma biblioteca. Una pose de mano lleva `kind: "hand"` y `alt: true` para que la mano izquierda y la derecha se reconozcan como la misma pose.

El modelo de manos (`HandLandmarker` de `tasks-vision` 1.2.2, misma CDN que la pose) se descarga solo cuando hay al menos una pose de mano o al iniciar una captura de mano. La compuerta por distancia se mantiene: ancho de hombros dividido por el lado menor del cuadro. Cerca (0,24 o más) la detección de manos está activa; lejos (0,18 o menos) está inactiva; entre ambos valores conserva el estado y cada cambio espera 0,5 s. El estado queda en `frame.hands` (`off`, `loading`, `far`, `near` o `failed`, y si hay mano activa). La captura se dispara con `engine.startHandCapture()` y `engine.touch()`.

## Módulos de interfaz reutilizables

La interfaz que usa la propia página vive en el motor para reutilizarla en otros proyectos. Cada módulo se monta en un elemento anfitrión y devuelve un objeto con `destroy` y callbacks; los textos se pasan como opciones y las clases propias (`pe-*`) evitan choques con la página anfitriona:

- `engine/v2/library-ui.js` — `mountLibrary(host, opciones)`: biblioteca de poses y movimientos (lista, registro y edición, copiar/pegar datos, vaciar). Variantes `dialog` e `inline`.
- `engine/v2/capture-ui.js` — `mountCapture(host, opciones)` y `mountPoseEditor(host, opciones)`: banner y cuenta de captura, y editor de la pose capturada. Variantes `banner` e `inline`.
- `engine/v2/overlay-ui.js` — `createPoseOverlay(opciones)`: esqueleto, guía de calibración, fantasma de la pose y capas del modo detallado sobre la cámara. Estilos `silhouette` y `line`.
- `engine/v2/hands-ui.js` — `mountHands(host, opciones)`: punto LED de la detección de manos en el visor (verde activa, gris inactiva), sin texto.
- `engine/v2/reset-ui.js` — `mountReset(host, opciones)`: confirmación de restablecer, o botón directo con `confirm: false`.

## Stack

JavaScript vanilla, PWA, MediaPipe PoseLandmarker lite y HandLandmarker, sin dependencias de npm.

## Licencia

MIT

---

Más proyectos: https://juliangdeveloper.github.io/

Hecho con ❤️ y 🤸
