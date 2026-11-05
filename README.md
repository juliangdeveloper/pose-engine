# 🤸 pose-engine

> Motor open source de estimación de pose en tiempo real para la web: lee tu cuerpo con la cámara, reconoce solo qué ejercicio haces, cuenta repeticiones, cronometra posturas y califica la forma, todo en el dispositivo.

**[▶ Abrir la app](https://juliangdeveloper.github.io/pose-engine/)**

<img src="assets/screenshot.jpg" alt="pose-engine reconociendo sentadillas y calificando una repetición como Bien" width="320">

## Usar el motor en tu proyecto
El motor es un módulo ES en `engine/v1/`, separado de la app. Los cambios compatibles se publican ahí; uno incompatible irá a `engine/v2/`.

```javascript
const root = 'https://juliangdeveloper.github.io/pose-engine/engine/v1/';
const version = (await (await fetch(root + 'version.txt', { cache: 'no-store' })).text()).trim();
const { createPoseEngine } = await import(root + 'index.js?v=' + version);

const engine = createPoseEngine({ video: document.querySelector('video') });
engine.on('exercise', (e) => console.log(e.id, e.confidence));
engine.on('rep', (r) => console.log(r.exercise, r.count, r.grade.label));
engine.on('grade', (g) => console.log(g.exercise, g.label, g.tip));
engine.on('frame', (f) => draw(f.landmarks, f.measures));
await engine.start({ source: 'camera', facingMode: 'user' });
```

- Sin `exercise`, el motor arranca en modo automático (`MODE.AUTO`): reconoce el ejercicio y cuenta solo ese. `setExercise(id)` lo fija (`MODE.FIXED`, como pasar `exercise` al crearlo) y `setAuto()` vuelve al automático. `mode()` dice cuál está activo.
- `start({ source })`: `'camera'` abre la cámara, `'video'` usa un `<video>` que ya reproduce, `'synthetic'` mueve un esqueleto generado sin cámara ni modelo. En automático, `'synthetic'` recorre las demos de todos los ejercicios; `start({ source: 'synthetic', demo })` acepta una demo o una lista de demos con `durationMs`. `stop()`, `reset()`, `destroy()`.
- `switchCamera()` alterna entre frontal (`user`) y trasera (`environment`). Si la cámara está abierta, detiene todas las pistas del stream anterior y espera a soltarlas antes de volver a llamar a `getUserMedia`: primero `facingMode: { exact }`, si falla `{ ideal }`, y si ninguna coincide elige un `deviceId` con `enumerateDevices`. No reinicia las repeticiones ni el cronómetro. Sin cámara abierta solo recuerda la elección para el próximo `start`. La lente elegida se conserva.
- `setLens('wide' | 'normal')` pide la vista más amplia o la de 1×. `getState()` incluye `lens`, `zoom` (el valor del track, o `null`) y `capabilities`: `zoom` con `min`, `max` y `step`, `ultraWide` y `canWiden`.
- Con `wide`, el motor pone el zoom en el mínimo de `getCapabilities().zoom` mediante `applyConstraints({ advanced: [{ zoom }] })`. En la trasera, si ese mínimo no es menor que 1, abre el `deviceId` cuya etiqueta contiene ultra, ultra gran angular o ultra-wide. En la frontal aplica el zoom mínimo si existe.
- La captura pide proporción 4:3 (3:4 en vertical) y `resizeMode: 'none'`, no un recorte 16:9. El video y el canvas usan `object-fit: contain` con el mismo encaje, así que no se recorta lo que ve la cámara.
- Eventos con `on(tipo, fn)`, que devuelve la función para quitarlo:
  - `frame`: 33 puntos normalizados y suavizados, puntos 3D en metros, medidas, rasgos del clasificador (`features`), `detected` con su confianza, `scores` por ejercicio, fase, reps, plancha, aviso y fps.
  - `exercise`: ejercicio reconocido (`id`, `name`, `kind`, `confidence`), o `id: null` cuando deja de verse.
  - `rep`: ejercicio, número, duración, `grade`, calidad de 0 a 1 y controles de forma que fallaron.
  - `grade`: `level` (`excelente`, `bien`, `ok`), `label` (Excelente, Bien, OK), `score`, cada criterio con su valor y `tip` con el consejo del criterio más flojo. Llega en cada repetición y, en la plancha, cada 5 s.
  - `state`: cambio de fase (`lost`, `idle`, `holding` o las fases del ejercicio).
  - `hold`: segundos y mejor marca en ejercicios de aguantar.
  - `cue`: aviso de forma en vivo.
  - `status`, `ready` (con el delegado GPU o CPU) y `error` (`camera-denied`, `camera-not-found`, `model-failed`…).
- `loadExercises(defs | url)` agrega ejercicios desde un arreglo o un JSON; `exercises()` los lista con `about` (cómo se reconoce y cómo se califica).
- Opciones del reconocimiento en `recognition` (ver abajo) y rasgos propios en `features`.
- `feed({ landmarks, worldLandmarks }, t, ancho, alto)` procesa puntos de otro detector; también puedes pasar `detector` propio con `init()` y `detect(video, t)`.
- Opciones: `lens` (`'wide'` o `'normal'`), `smoothing` (One Euro: `minCutoff`, `beta`, `dCutoff`, o `false`), `detectorOptions` (`model: 'lite' | 'full'`, `delegate`, `modelUrl`, `wasmBase`, `tasksVisionUrl` para servirlo tú), `messages` y `minVisibility`.

## Ejercicios como datos
Cada ejercicio es un objeto JSON; el motor no sabe de flexiones ni de ballet.

```javascript
engine.loadExercises([{
  id: 'passe', name: 'Passé', kind: 'hold',
  requires: ['hip', 'knee', 'ankle'],
  optional: ['shoulder'],
  measures: { knee: { type: 'angle', points: ['hip', 'knee', 'ankle'], label: 'Rodilla' } },
  hold: { when: { knee: { lt: 60 } } },
  cues: [{ id: 'alto', text: 'Sube más la rodilla', when: { knee: { gt: 75 } } }],
}]);
```

- `requires` son las articulaciones mínimas para contar. Puede ser una lista (todas, en al menos un lado) o `{ any: [[...], [...]] }` si vale un grupo u otro. `optional` son articulaciones solo para la forma: si no se ven, el aviso y el control se omiten y la cuenta sigue.
- `measures`: `angle` se calcula con los `worldLandmarks` en metros, así que no depende de si el teléfono está de frente, de lado, arriba, abajo o en diagonal. Si faltan los puntos 3D, usa el ángulo 2D. Los dos lados se combinan pesados por visibilidad. `fallback` sustituye la medida cuando sus puntos no se ven (la sentadilla usa cadera y rodilla si no hay tobillo). `incline`, `offset` y `lineOffset` usan el mismo criterio. `side` acepta `left`, `right`, `best` o `mean`.
- Los umbrales de fase tienen histéresis: una vez dentro, hace falta cruzar unos grados de más para salir. El suavizado sigue siendo One Euro.
- Ejercicios de repeticiones (`kind: 'reps'`): `phases` con su condición y `rep` con la secuencia que cuenta una repetición, por ejemplo `['top', 'bottom', 'top']`.
- Ejercicios de aguantar (`kind: 'hold'`): `hold.when`.
- `gate` es una condición extra para empezar a contar; `cues` son avisos en vivo; `checks` revisan el mínimo o máximo de cada repetición solo si esa medida se vio.
- Las condiciones admiten `lt`, `gt`, `between`, `all`, `any` y `not`.
- `recognize` dice cómo reconocer el ejercicio y `grade` cómo calificarlo (ver abajo). `about` lleva los textos `detect` y `grade` que ve el usuario.
- `demo` define el movimiento del esqueleto sintético de `source: 'synthetic'`.

## Reconocimiento automático
Cada cuadro el motor mide unos rasgos con los puntos 3D en metros (`FEATURES`): ángulos de codo, rodilla, cadera, cuerpo (hombro-cadera-tobillo) y hombro, inclinación del tronco (0° horizontal, 90° vertical) y `armsUp` (muñeca sobre el hombro, en largos de tronco). Los ángulos no dependen de dónde esté el teléfono; la inclinación y `armsUp` suponen que la imagen está derecha.

- Sobre una ventana de 3 s saca `min`, `max`, `mean`, `range` y `last` de cada rasgo.
- Cada término de `recognize` (`{ feature, stat, gt | lt | between, weight, must }`) da de 0 a 1 con un margen suave (8° en ángulos). El puntaje es la media ponderada, multiplicada por los términos `must` y por la parte del cuerpo que se ve (exponente 0.35). Si faltan las articulaciones de `requires`, el puntaje es 0.
- Histéresis (`RECOGNITION_DEFAULTS`): entra con 0.72 tras 450 ms como el mejor y con al menos 0.7 s de ventana; cambia a otro solo si le saca 0.12; sale si baja de 0.5 durante 1.2 s. Si el tronco cambia más de 45° durante 0.5 s (por ejemplo de pie a horizontal), la ventana empieza de nuevo.
- Todos los ejercicios cuentan en paralelo. Al reconocer uno, se acreditan las repeticiones de los últimos 3.5 s que ya contó; los demás se reinician si su puntaje sigue bajo.

| Ejercicio | Se reconoce por |
|---|---|
| Flexiones | codo con rango > 35°, tronco < 45°, cuerpo > 145°, rodillas quietas, manos abajo |
| Sentadillas | rodilla con rango > 35°, cadera con rango > 30°, tronco que llega a > 55°, manos abajo |
| Dominadas | codo con rango > 35°, manos sobre los hombros, brazos arriba |
| Plancha | cuerpo > 150°, tronco < 40°, codo y rodillas quietos (< 15°) |

## Calificación
Cada criterio de `grade` (`{ measure, stat, excelente, bien, tip }`, con `stat` `min`, `max`, `range`, `absMax` o `duration`) vale 1 si cumple `excelente`, 0.5 si cumple `bien` y 0 si no. La media da **Excelente** desde 0.85, **Bien** desde 0.5 y **OK** por debajo (`GRADE_EXCELENTE_MIN`, `GRADE_BIEN_MIN`).

| Ejercicio | Excelente | Bien |
|---|---|---|
| Flexiones | codo < 90° abajo, > 160° arriba, cuerpo > 165°, rep > 1.5 s | < 105°, > 150°, > 155°, > 1 s |
| Sentadillas | rodilla < 95° abajo, > 165° arriba, cadera > 65°, rep > 1.6 s | < 108°, > 155°, > 50°, > 1 s |
| Dominadas | barbilla sobre las muñecas, codo < 60° arriba, > 160° abajo, rep > 1.8 s | barbilla a menos de 0.1 tronco bajo las muñecas, < 72°, > 150°, > 1.2 s |
| Plancha (cada 5 s) | cadera a < 0.04 de la línea, cuerpo > 170°, se mueve < 6° | < 0.08, > 163°, < 12° |

Incluidos en `engine/v1/exercises/calisthenics.js`. Cuentan con el teléfono en cualquier posición:
- Flexiones y dominadas: hombro, codo y muñeca de un lado. Cadera, rodilla y tobillo son opcionales.
- Sentadillas: cadera, rodilla y tobillo, o cadera y rodilla con el tronco si el tobillo no se ve.
- Plancha: hombro, cadera y rodilla, o hombro, cadera y tobillo.

## La app
- Pulsa **Cámara** y empieza a moverte: el ejercicio se reconoce solo y aparece arriba del video con su icono. Cada repetición muestra su calificación (Excelente, Bien u OK) con una animación, y la plancha cada 5 s. Debajo del contador queda la última calificación y el consejo de forma.
- **Movimientos** abre la lista de lo que se reconoce, con cómo se detecta y cómo se califica.
- La cuenta es por ejercicio durante la sesión. El icono de cambiar cámara alterna entre frontal y trasera, también antes de encenderla. La elección se guarda en `localStorage` (`pose-engine.camera`). Si hay menos de dos cámaras de vídeo, el icono se oculta. Solo la frontal se espeja.
- **0.5× / 1×** amplía el encuadre cuando se puede (zoom mínimo o ultra gran angular). Solo aparece en ese caso. La elección queda en `pose-engine.lens` y se conserva al cambiar de cámara.
- Ves el esqueleto con los ángulos, el contador o el cronómetro, la fase y el aviso de forma.
- Si no das permiso de cámara, la página lo explica.
- ↺ reinicia el contador.

## Stack
- JavaScript vanilla, PWA con service worker, sin dependencias de npm.
- Modelo: [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) PoseLandmarker lite (Apache 2.0), versión 1.2.2 fijada desde jsDelivr, en modo VIDEO con GPU y respaldo en CPU.
- Por qué MediaPipe y no MoveNet con TF.js:
  - Da 33 puntos con visibilidad y además puntos 3D en metros, que hacen que los ángulos dependan menos de la vista.
  - Es un solo paquete WASM que corre en Safari de iOS con WebGL2 y cae a CPU si la GPU falla.
  - MoveNet da 17 puntos solo en 2D y necesita cargar TF.js y su backend aparte.
- El modelo y el WASM quedan en caché después de la primera carga. Los puntos se suavizan con un filtro One Euro.
- Al abrirse guarda el progreso en `localStorage` (`meta.v1.pose-engine`), que lee el [portafolio](https://juliangdeveloper.github.io/).

```
python3 -m http.server 8000
```

## Estado y límites
- En construcción.
- Probado con emulación de iPhone 13 mini y iPad mini en Chromium, con un video de sentadillas como cámara falsa y con esqueletos sintéticos de flexiones, sentadillas, dominadas y plancha. Falta probar en Safari de un iPhone real.
- Los umbrales de reconocimiento y calificación salen de pruebas con video y esqueletos sintéticos; faltan calibrarlos con personas reales.
- La cuenta usa ángulos 3D y no pide una vista de lado. El zoom ultra gran angular no se ha probado con una cámara trasera real.

## Contribuir
Abre un issue o un PR, sobre todo en:
- Calibrar umbrales con videos reales.
- Ejercicios nuevos (artes marciales, ballet, movilidad) como datos.

Licencia: [MIT](LICENSE).

---

Más proyectos: https://juliangdeveloper.github.io/

Hecho con ❤️ y 🤸
