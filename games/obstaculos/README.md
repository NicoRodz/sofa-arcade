# Obstáculos en cadena (`@pichi/game-obstaculos`)

Campaña cooperativa de plataformas atados por cuerda. Sim determinista a 60 Hz, validador de alcanzabilidad y pantalla Phaser.

## Módulos

| Carpeta | Qué hace |
|---|---|
| `index.ts`, `session.ts`, `bot.ts`, `lobby.ts` | API pública, sesión de 3 niveles, bot de partida |
| `sim/world/` | `create` (createWorld, setConnected), `step` (orden fijo de subsistemas), `hash`, `snapshot` |
| `sim/entities/` | placas, palancas, movers, cajas, llaves, migajas, peligros: `create`, `surfaces`, `loads`, `activation`, `boxes`, `keys-hazard` |
| `sim/rules/` | progreso y spawn (`placement`), vidas y burbujas (`lives`), meta y puntaje (`goal`), expedición y premios (`run`) |
| `sim/*.ts` | jugador, cuerda, colisión, acciones, dinámicas de campaña (`campaign*`, `enemies`, `lantern`...) |
| `validator/graph/` | grafo de alcanzabilidad: `types`, `terrain`, `plans`, `simcache`, `build`, `search` |
| `validator/` | `sim` (trayectorias), `validate` (cierre por estados), tests de dinámicas |
| `campaign/`, `generate/`, `modules/`, `metric/` | mundos y catálogo, generador, tramos, métrica de dificultad |
| `levels/` | datos de niveles (no se editan en refactors) |
| `screen/render/` | Phaser: `entities/`, `tiledraw/`, `rig/`, `parallax/`, `stub/` (FakeWorld de pruebas), `obstacles-view/`, HUD, cámara |
| `screen/{campaign,audio,harness}`, `server/` | menú de campaña, audio, capturas, progreso en disco |

Cada carpeta partida expone su API solo por `index.ts` (re-exports); los importadores no cambiaron.

## Invariantes

- El sim no usa `Math.random` ni `Date`: mismas entradas, mismo `hashState`. El orden de llamadas de `sim/world/step.ts` está congelado (los hashes de regresión dependen de él).
- El validador y los 40 niveles de `levels/` no se mueven un byte; si un test pide cambiarlos, se detiene el trabajo.
- `FakeWorld` (`stub/`) y `ObstaclesView` son cadenas de clases (core -> ... -> clase pública): los miembros compartidos son `protected`.
- Tope de tamaño: 300 aviso, 500 falla; ver `size-budget.json` para los archivos en excepción.

## Red de tests

- Rápidos: `npm run test:agent -- --project game-obstaculos` (686 tests; sim, validador, campaña, render, sesión).
- Lentos: `npx vitest run --project slow games/obstaculos` (`regression*.slow.test.ts` = hashes congelados, `generate.slow.test.ts`, `learning.slow.test.ts` = bot que aprende cada mecánica, validador sobre los 40 niveles).
- e2e con Chrome: `tools/obst-e2e.ts` (usa `PG_PORT` y `PG_CDP_PORT` propios).
- Puerta de equivalencia al integrar: `npm run baseline:check` (nombres de tests iguales).
