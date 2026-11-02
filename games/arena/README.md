# Manchazo (`@pichi/game-arena`, antes Arena de empujones)

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

## Prototipo Manchazo F0 (`?soon=1&control=A|B`)

Con `?control=A` (plan por defecto) o `?control=B` la ronda es el prototipo gris de Manchazo: mapa 27x15 (`map/`), hasta 8 cuerpos por grilla (`sim/grid/`, enteros en 1/16 de casilla, 60 Hz, determinista), stick + 2 botones sin tocar el protocolo. Plan A: el stick se cuantiza a 4 direcciones (zona muerta 0,3, histéresis 15°), giro guardado 150 ms, asistencia de esquina 0,35 casilla, suelta y se detiene. Plan B: avance automático, el stick pide giros. Métrica de giros fallidos (pedido y no ejecutado en 300 ms) en el overlay y en resultados. Bot guionado solo en `test/route-bot.ts`. Sin el parámetro Arena es el de empujones de siempre.

## Qué falta

Mapas o modos, equipos, sonido, efectos, puntaje entre rondas, escuela y `GameOutcome` para la pantalla de resultados genérica.

## Manchazo F2: mapas por semilla (`map/gen/`)

`generateMap(seed)` (25 bits, 5 caracteres Crockford, `formatSeed` -> `2·7KQ2M`): dibuja la mitad izquierda y la columna central, estampa muebles con cuota por banda y carriles de salida, refleja, valida V1-V7 (`validateMap`; V1-V3 por estado del mapa vivo via `mapStates`/`LivingElement`, para F5) y reintenta hasta 64 veces; después cae al mapa de F0. `mapSeedFor(lobbySeed, ronda)` da una semilla nueva por ronda. La tele la muestra (`MAPA 2·7KQ2M`) en la ronda y en resultados. El sim lleva el mapa en `grid.map`; sin `mapSeed` la ronda usa el mapa de F0.

