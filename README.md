# 🤸 pose-engine

**Real-time pose detection and rep counter for the browser: MediaPipe pose tracking that runs on-device, for fitness apps and interactive demos.**

> Detecta tu cuerpo con la cámara, captura tus propias poses, arma movimientos con ellas y cuenta repeticiones calificadas en tiempo real.

**[▶ Probar la demo](https://juliangdeveloper.github.io/pose-engine/)**

<img src="assets/screenshot.jpg" alt="menú lateral de pose-engine con el modelo de palitos reproduciendo el movimiento Jab en bucle y la lista de movimientos de calistenia y boxeo" width="320">

## Cómo se usa

- Calibra tu cuerpo con la pose T: la app mide tus proporciones y la posición de la cámara para comparar igual desde cualquier ángulo.
- Captura tus poses con la cámara: haz la pose T y, tras la cuenta de 3 segundos, se guarda la pose en la que estés.
- Arma movimientos con secuencias de tus poses capturadas, por ejemplo guardia → jab.
- Cuenta repeticiones en tiempo real y califica cada una (Excelente, Bien u OK) según qué tan cerca llegaste a cada pose.
- Abre el menú lateral para ver todos los movimientos: el modelo de palitos los reproduce en bucle.
- Empieza con ocho poses y cinco movimientos por defecto, incluidos los de boxeo: guardia, jab, cross y esquive.

## Usar el motor en otro proyecto

El motor es un módulo ES que se importa desde su ruta pública:

```js
const root = 'https://juliangdeveloper.github.io/pose-engine/engine/v2/';
const v = (await (await fetch(root + 'version.txt')).text()).trim();
const { createPoseEngine } = await import(root + 'index.js?v=' + v);
const engine = createPoseEngine({ video, poses, movements });
engine.on('pose', (p) => console.log(p.name, p.proximity));
engine.on('rep', (r) => console.log(r.name, r.count, r.grade.label));
engine.on('onset', (o) => console.log(o.name, o.latencyMs));
await engine.start({ source: 'camera' });
```

## Stack

JavaScript vanilla, PWA, MediaPipe PoseLandmarker lite, sin dependencias de npm.

## Licencia

MIT

---

Más proyectos: https://juliangdeveloper.github.io/

Hecho con ❤️ y 🤸
