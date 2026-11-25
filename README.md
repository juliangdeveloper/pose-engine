# 🤸 pose-engine

**Real-time pose detection and rep counter for the browser: MediaPipe pose tracking that runs on-device, for fitness apps and interactive demos.**

> Sigue la silueta de la pose T para calibrar, imita el fantasma de cada pose, mira tu esqueleto en vivo y cuenta repeticiones con contador grande y barra de recorrido.

**[▶ Probar la demo](https://juliangdeveloper.github.io/pose-engine/)**

<img src="assets/screenshot.jpg" alt="pantalla de calibración de pose-engine con la silueta de la pose T en verde sobre el esqueleto en vivo y el contador grande con barra de recorrido" width="320">

## Cómo se usa

- Calibra con la silueta de la pose T: cada segmento se pone verde cuando lo cubres y la medición arranca sola al coincidir.
- Imita la pose siguiente con el fantasma: las articulaciones que no coinciden se marcan en rojo y tu esqueleto en vivo atenúa las de baja confianza.
- Ajusta distancia y luz con los avisos «Aléjate un paso», «Acércate», «Entra en el cuadro», «Poca luz» y «Contraluz» antes de empezar.
- Captura tus poses con la cámara: haz la pose T y, tras la cuenta de 3 segundos, se guarda la pose en la que estés.
- Arma movimientos con secuencias de tus poses capturadas, por ejemplo guardia → jab.
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
