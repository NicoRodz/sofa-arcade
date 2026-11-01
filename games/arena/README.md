# Arena de empujones (`@pichi/game-arena`)

Esqueleto del tercer juego: fighters sobre una plataforma redonda que se encoge; gana el último en pie. Existe para probar que el contrato (`GameManifest`, `GameProtocol`, `ScreenGame`, `ControllerGame`) alcanza sin tocar `platform/`. Está `soon: true`: el menú de la TV no lo ofrece salvo con `?soon=1`.

## Módulos

| Ruta | Qué hay |
|---|---|
| `index.ts`, `manifest.ts`, `protocol.ts` | Manifest (id, controles, howTo) y protocolo (solo el id: no usa mapas, puestos ni señales). Sin Phaser |
| `sim/` | Puro y determinista. `createArena(slots, seed)` y `step(state, inputs, dtMs)`: stick, empujar (B1), embestir (B2), choques, borde, plataforma que se encoge |
| `screen/` | `game.ts` (el `ScreenGame`), `run.ts` (paquetes de los celulares -> pasos fijos de 60 Hz), `scene.ts` (dibuja), `lobby.ts`, `results.ts` |
| `controller/` | `ControllerGame`: solo la línea del lobby; el pad (stick y dos botones) llega con el manifest |
| `test/` | `sim`, `run` y `conformance` (`checkGame`) |

## Para probarlo

`npm run dev` y abre la pantalla con `?soon=1`; elige Arena y conecta 2 celulares. Sin `?soon=1` el menú es el de siempre.

## Qué falta

Mapas o modos, equipos, sonido, efectos, puntaje entre rondas, escuela y `GameOutcome` para la pantalla de resultados genérica.
