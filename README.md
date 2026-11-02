# 🤸 pose-engine

> Motor open source de estimación de pose en tiempo real para la web: lee tu cuerpo con la cámara, mide ángulos, cuenta repeticiones y cronometra posturas, todo en el dispositivo.

**[▶ Probar la demo](https://juliangdeveloper.github.io/pose-engine/)** · la interfaz es una demo del motor

<img src="assets/screenshot.jpg" alt="Demo de pose-engine contando sentadillas con el esqueleto y los ángulos sobre el video" width="320">

## Usar el motor en tu proyecto
El motor es un módulo ES en `engine/v1/`, separado de la demo. Los cambios compatibles se publican ahí; uno incompatible irá a `engine/v2/`.

```javascript
const root = 'https://juliangdeveloper.github.io/pose-engine/engine/v1/';
const version = (await (await fetch(root + 'version.txt', { cache: 'no-store' })).text()).trim();
const { createPoseEngine } = await import(root + 'index.js?v=' + version);

const engine = createPoseEngine({ video: document.querySelector('video'), exercise: 'squat' });
engine.on('rep', (r) => console.log(r.count, r.quality, r.failed));
engine.on('frame', (f) => draw(f.landmarks, f.measures));
await engine.start({ source: 'camera', facingMode: 'user' });
```

- `start({ source })`: `'camera'` abre la cámara, `'video'` usa un `<video>` que ya reproduce, `'synthetic'` mueve un esqueleto generado sin cámara ni modelo. `stop()`, `reset()`, `switchCamera()`, `destroy()`.
- Eventos con `on(tipo, fn)`, que devuelve la función para quitarlo:
  - `frame`: 33 puntos normalizados y suavizados, puntos 3D en metros, medidas, fase, reps, plancha, aviso y fps.
  - `rep`: número, duración, calidad de 0 a 1 y controles de forma que fallaron.
  - `state`: cambio de fase (`lost`, `idle`, `holding` o las fases del ejercicio).
  - `hold`: segundos y mejor marca en ejercicios de aguantar.
  - `cue`: aviso de forma en vivo.
  - `status`, `ready` (con el delegado GPU o CPU) y `error` (`camera-denied`, `camera-not-found`, `model-failed`…).
- `loadExercises(defs | url)` agrega ejercicios desde un arreglo o un JSON; `setExercise(id)` cambia el activo y `exercises()` los lista.
- `feed({ landmarks, worldLandmarks }, t, ancho, alto)` procesa puntos de otro detector; también puedes pasar `detector` propio con `init()` y `detect(video, t)`.
- Opciones: `smoothing` (One Euro: `minCutoff`, `beta`, `dCutoff`, o `false`), `detectorOptions` (`model: 'lite' | 'full'`, `delegate`, `modelUrl`, `wasmBase`, `tasksVisionUrl` para servirlo tú), `messages` y `minVisibility`.

## Ejercicios como datos
Cada ejercicio es un objeto JSON; el motor no sabe de flexiones ni de ballet.

```javascript
engine.loadExercises([{
  id: 'passe', name: 'Passé', kind: 'hold',
  requires: ['hip', 'knee', 'ankle'],
  measures: { knee: { type: 'angle', points: ['hip', 'knee', 'ankle'], side: 'best', label: 'Rodilla' } },
  hold: { when: { knee: { lt: 60 } } },
  cues: [{ id: 'alto', text: 'Sube más la rodilla', when: { knee: { gt: 75 } } }],
}]);
```

- `measures`: `angle` (3 puntos, en 3D si hay puntos en metros), `incline` (grados respecto a la horizontal), `offset` (altura de un punto sobre otro, en largos de torso) y `lineOffset` (distancia de un punto a la recta entre otros dos). Los puntos sin lado (`knee`) usan el lado más visible; `side` acepta `left`, `right`, `best` o `mean`.
- Ejercicios de repeticiones (`kind: 'reps'`): `phases` con su condición y `rep` con la secuencia que cuenta una repetición, por ejemplo `['top', 'bottom', 'top']`.
- Ejercicios de aguantar (`kind: 'hold'`): `hold.when`.
- `gate` es la condición para empezar a contar; `cues` son avisos en vivo; `checks` revisan el mínimo o máximo de cada repetición.
- Las condiciones admiten `lt`, `gt`, `between`, `all`, `any` y `not`.
- `demo` define el movimiento de la demo sintética.

Incluidos en `engine/v1/exercises/calisthenics.js`:
- Flexiones: codo, línea del cuerpo y cadera.
- Sentadillas: rodilla, cadera y profundidad.
- Dominadas: codo y barbilla sobre la barra.
- Plancha: cronómetro y cadera caída o alta.

## La demo
- Elige el ejercicio y pulsa **Cámara**. **Girar** cambia entre la cámara frontal y la trasera.
- Ves el esqueleto con los ángulos, el contador o el cronómetro, la fase y el aviso de forma.
- **Demo** (o `?demo=1`) mueve un esqueleto sintético, sin cámara ni modelo. Si no das permiso de cámara, la página lo explica y ofrece la demo.
- ↺ reinicia el contador.

## Stack
- JavaScript vanilla, PWA con service worker, sin dependencias de npm.
- Modelo: [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) PoseLandmarker lite (Apache 2.0), versión 1.2.0 fijada desde jsDelivr, en modo VIDEO con GPU y respaldo en CPU.
- Por qué MediaPipe y no MoveNet con TF.js:
  - Da 33 puntos con visibilidad y además puntos 3D en metros, que hacen que los ángulos dependan menos de la vista.
  - Es un solo paquete WASM que corre en Safari de iOS con WebGL2 y cae a CPU si la GPU falla.
  - MoveNet da 17 puntos solo en 2D y necesita cargar TF.js y su backend aparte.
- El modelo y el WASM quedan en caché después de la primera carga. Los puntos se suavizan con un filtro One Euro.

```
python3 -m http.server 8000
```

## Estado y límites
- En construcción.
- Probado con emulación de iPhone 13 mini y iPad mini en Chromium, con un video de sentadillas como cámara falsa. Falta probar en Safari de un iPhone real.
- Los umbrales salen de pruebas con video y esqueletos sintéticos; faltan calibrarlos con personas reales.
- Flexiones y plancha piden la cámara de lado. De frente, el ángulo del codo es menos fiable.

## Contribuir
Abre un issue o un PR, sobre todo en:
- Calibrar umbrales con videos reales.
- Ejercicios nuevos (artes marciales, ballet, movilidad) como datos.

Licencia: [MIT](LICENSE).

---

Más proyectos: https://juliangdeveloper.github.io/

Hecho con ❤️ y 🤸
