# 🤸 pose-engine

> Motor open source de poses en tiempo real para la web: captura tus propias poses con la cámara, arma movimientos con ellas y cuenta repeticiones calificadas por cercanía a cada pose, todo en el dispositivo.

**[▶ Abrir la app](https://juliangdeveloper.github.io/pose-engine/)**

<img src="assets/screenshot.jpg" alt="pose-engine contando una flexión con las poses Arriba y Abajo, calificada Excelente" width="320">

## La app
- **Capturar**: haz la pose T (brazos rectos a los lados, a la altura de los hombros). Sale una cuenta de 3 s y, al terminar, se guarda la pose en la que estés. Para capturar otra, baja los brazos y vuelve a hacer la T; **Listo** termina. Si la cámara está apagada, Capturar la enciende.
- **Poses**: lista de capturas con una figura dibujada a partir de los datos. Toca una para ponerle nombre y descripción o eliminarla. Al eliminarla se quita también de los movimientos.
- **Movimientos**: crea, edita y elimina movimientos con nombre, descripción y una secuencia de poses capturadas, por ejemplo Flexión = Arriba, Abajo. La secuencia necesita al menos dos poses y no repite la misma seguida.
- En vivo se ve la pose detectada con su porcentaje de cercanía (o la más cercana si ninguna llega), la secuencia del movimiento con el paso actual, el contador y la calificación de la última repetición.
- Una repetición es pasar por las poses de la secuencia en orden y volver a la primera: Arriba → Abajo → Arriba cuenta una flexión.
- Cada repetición se califica con la cercanía más baja que alcanzaste entre sus poses: **Excelente** desde 85 %, **Bien** desde 75 % y **OK** por debajo.
- **Copiar datos** copia al portapapeles todas las poses y movimientos en JSON. **Pegar datos** los importa: se agregan, y los que tienen el mismo `id` se reemplazan.
- Solo se guardan datos en `localStorage` (`pose-engine.library`), nunca fotos ni video.
- El icono de cambiar cámara alterna entre frontal y trasera, también antes de encenderla (`pose-engine.camera`). Si hay menos de dos cámaras, se oculta. Solo la frontal se espeja.
- **0.5× / 1×** amplía el encuadre cuando se puede (zoom mínimo o ultra gran angular) y solo aparece en ese caso (`pose-engine.lens`).
- ↺ reinicia los contadores de la sesión.

## Cómo se compara una pose
- Con los puntos 3D en metros, el motor arma un marco del cuerpo con hombros y caderas y mide en él la dirección de brazo, antebrazo, muslo y pierna de cada lado, más la dirección de la gravedad, que distingue de pie de acostado. Las direcciones de los segmentos no dependen de la distancia ni de desde dónde mira la cámara.
- Cercanía = 1 − error angular RMS / 60°, ponderado por visibilidad, solo con los segmentos que se ven en la pose guardada y en el cuadro actual (al menos 3 y la mitad de los de la pose).
- Detección cuadro a cuadro: una pose entra con 65 % sostenido 120 ms, sale bajo 55 % y otra la reemplaza si la supera por 5 puntos.
- La pose T se reconoce con brazos y antebrazos a menos de 28° de la línea de los hombros durante 0.5 s. La captura promedia los últimos 300 ms de la cuenta.

## Usar el motor en tu proyecto
El motor es un módulo ES en `engine/v2/`, separado de la app.

```javascript
const root = 'https://juliangdeveloper.github.io/pose-engine/engine/v2/';
const version = (await (await fetch(root + 'version.txt', { cache: 'no-store' })).text()).trim();
const { createPoseEngine } = await import(root + 'index.js?v=' + version);

const engine = createPoseEngine({ video: document.querySelector('video'), poses, movements });
engine.on('capture', (c) => { if (c.result === 'captured') save(c.features); });
engine.on('pose', (p) => console.log(p.type, p.name, p.proximity));
engine.on('rep', (r) => console.log(r.name, r.count, r.grade.label));
await engine.start({ source: 'camera', facingMode: 'user' });
engine.startCapture();
```

- `setPoses(lista)` y `setMovements(lista)` cargan los datos. Una pose es `{ id, name, seg, vis }` y un movimiento `{ id, name, sequence: [idPose, …] }`.
- `startCapture()` espera la pose T, cuenta 3 s y emite `capture` con `result: 'captured'` y `features` (`seg`, `vis` y `pts` para dibujarla), o `result: 'no-body'`. Sigue esperando otra T hasta `cancelCapture()`. Durante la captura no se cuentan repeticiones.
- Eventos con `on(tipo, fn)`, que devuelve la función para quitarlo:
  - `frame`: puntos normalizados y 3D suavizados (One Euro), `features`, `proximity` por pose, `best`, `active`, `tpose`, progreso de cada movimiento, estado de la captura y fps.
  - `pose`: `type` `enter` o `leave`, con `proximity`, `peak` y `grade`.
  - `rep`: movimiento, número, duración, `proximity`, `grade` (`level` `excelente`, `bien` u `ok`, y `label`) y el pico de cada paso.
  - `capture`: `state` (`idle`, `waiting`, `holding`, `countdown`), `seconds`, `holdProgress`, `result` y `features`.
  - `status`, `ready` (con el delegado GPU o CPU) y `error` (`camera-denied`, `camera-not-found`, `model-failed`…).
- `start({ source })`: `'camera'` abre la cámara y `'video'` usa un `<video>` que ya reproduce. `stop()`, `reset()`, `destroy()`.
- `switchCamera()` alterna frontal y trasera sin reiniciar contadores. `setLens('wide' | 'normal')` pide la vista más amplia o la de 1×; `getState()` incluye `lens`, `zoom` y `capabilities`.
- `feed({ landmarks, worldLandmarks }, t, ancho, alto)` procesa puntos de otro detector; también puedes pasar `detector` propio con `init()` y `detect(video, t)`.
- Funciones sueltas: `poseFeatures`, `compareFeatures`, `isTPose`, `gradeFor`, `createPoseMatcher`, `createMovementTracker` y `createCaptureFlow`.
- Opciones: `match` (`enter`, `exit`, `switchMargin`, `enterMs`, `tolerance`), `capture` (`countdownMs`, `triggerHoldMs`, `windowMs`), `lens`, `smoothing` y `detectorOptions` (`model: 'lite' | 'full'`, `delegate`, `modelUrl`, `wasmBase`, `tasksVisionUrl`).

## Formato de los datos
```json
{
  "app": "pose-engine",
  "format": 1,
  "poses": [{ "id": "p-…", "name": "Arriba", "description": "", "createdAt": "…", "v": 1, "seg": { "leftUpperArm": [0, -1, 0] }, "vis": { "leftUpperArm": 0.97 }, "pts": [[0.5, 0.2, 0.98]] }],
  "movements": [{ "id": "m-…", "name": "Flexión", "description": "", "sequence": ["p-…", "p-…"] }]
}
```
`seg` guarda vectores unitarios en el marco del cuerpo (derecha, arriba, adelante) para `leftUpperArm`, `leftForearm`, `rightUpperArm`, `rightForearm`, `leftThigh`, `leftShin`, `rightThigh`, `rightShin` y `gravity`. `pts` son 13 puntos 2D normalizados solo para dibujar la figura.

## Stack
- JavaScript vanilla, PWA con service worker, sin dependencias de npm.
- Modelo: [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) PoseLandmarker lite (Apache 2.0), versión 1.2.2 fijada desde jsDelivr, en modo VIDEO con GPU y respaldo en CPU. Da 33 puntos con visibilidad y puntos 3D en metros, y corre en Safari de iOS.
- El modelo y el WASM quedan en caché después de la primera carga.
- Al abrirse guarda el progreso en `localStorage` (`meta.v1.pose-engine`), que lee el [portafolio](https://juliangdeveloper.github.io/).

```
python3 -m http.server 8000
```

## Estado y límites
- En construcción.
- Probado en Chromium con emulación de iPhone 13 mini y iPad mini, con esqueletos sintéticos: captura con pose T, flexiones de dos poses, calificación, copiar e importar. Falta probar en Safari de un iPhone real con personas reales.
- Los umbrales de cercanía salen de esas pruebas; faltan calibrarlos con personas reales.
- La gravedad se mide respecto a la cámara: conviene usar el teléfono en la misma posición al capturar y al entrenar.

## Contribuir
Abre un issue o un PR, sobre todo para calibrar umbrales con videos reales.

Licencia: [MIT](LICENSE).

---

Más proyectos: https://juliangdeveloper.github.io/

Hecho con ❤️ y 🤸
