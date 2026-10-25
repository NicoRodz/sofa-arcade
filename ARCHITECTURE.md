# ARCHITECTURE (provisional, F3)

Estado del repo tras F3 (los archivos se movieron, la lógica no) y, al final, el objetivo resumido. Se reemplaza en F6 por la versión final (árbol, contrato, reglas, flujo de una partida). Diseño completo: `~/.claude/plans/reestructura-repo.md`.

## Cómo corre una partida

1. `apps/server` sirve las dos apps y hace de relay WebSocket (`/ws`, sala única, `platform/server`). No corre el tick: reenvía y guarda el progreso de la campaña (`games/obstaculos/server`). Corre con `tsx` desde las fuentes; resuelve los paquetes por `node_modules/@pichi/*` y sus `exports` a `.ts`.
2. `apps/screen` (el Mac, pantalla grande) corre la simulación determinista a un tick fijo, la pinta con Phaser y el DOM, y recibe los inputs de los celulares.
3. `apps/controller` (el celular) pinta los controles que el lobby le manda (D-pad y dos botones) y envía inputs.
4. `platform/core` y `games/*/sim` son código puro sin DOM ni Node: reglas, protocolo y simulación; los importan las tres apps y los tests.

## Estructura actual (F3)

| Ruta | Paquete npm | Qué hay |
|---|---|---|
| `platform/core/src/` | `@pichi/core` | `protocol`, `games` (registro), `difficulty`, `events` (Emitter), `rng`, `icons`, `render`, `stats`, `lobby/{vote,captain,teams}`; `index.ts` = protocolo |
| `platform/screen/src/` | `@pichi/screen-kit` | `art/{fx,gfx,tokens,chef,chefdraw}`, `audio/{mixer,synth,recipes,music}`, `bus`, `menu`, `howto` |
| `platform/controller/src/`, `platform/server/src/` | `@pichi/controller-kit`, `@pichi/server-kit` | `howto`, `zoom`; `relay`, `lan` |
| `games/pizzas/` | `@pichi/game-pizzas` | `sim/` (`overcooked.ts` 942 líneas, `maps`, `generate`, `validate`, `sabotage`, `burn`, `midround`, `versus/`, `school/`, `recipes/`, `feel/`; `index.ts` = API de `overcooked`), `screen/` (`art/`, `audio/director`, `scene`, `school/`), `controller/school`, `test/golden/` (bots, tests y `fixtures/*.json`) |
| `games/obstaculos/` | `@pichi/game-obstaculos` | Igual que antes bajo `games/obstaculos/`: raíz (`index.ts`, `session`, `bot`...), `sim/`, `campaign/`, `validator/`, `generate/`, `modules/`, `metric/`, `levels/` (datos), `screen/` (`render/`, `campaign/`, `audio/`, `harness/`), `server/` (progreso de la campaña) y `test/` |
| `apps/{screen,controller,server}/` | `@pichi/app-*` | Los `main.ts` monolíticos (screen 1.287 líneas), `index.html`, `vite.config.ts`; tests websocket en `apps/server/test/`, layout con Chrome en `apps/controller/test/` |
| `tools/` | `@pichi/latency-report` | Scripts sueltos (`capture.ts`, `*-e2e.ts`...), `latency-report/`, `meta/` (baseline, topes, deps) |
| `scripts/` | — | `move.ts` + `moves.json`: el codemod de F3 (mapa vieja -> nueva ruta, decisiones, parches) |

- Imports entre paquetes: `@pichi/core` (índice), `@pichi/core/<archivo>` (patrón `exports`), `@pichi/game-pizzas/sim` (índice), `@pichi/game-pizzas/sim/maps`. Las apps no se importan: se llega por ruta relativa.
- Violaciones conocidas que F4/F5 deben cortar (las reglas siguen en aviso): `core` importa tipos y funciones de Pizzas (`protocol` -> `maps`, `puestos`, `versus*`; `teams` -> `assist`; `events`; `games` -> `sabotage-config`) y de Obstáculos (`protocol` -> `sim/campaign`); `screen-kit/art/chef` importa `food` de Pizzas. Ver `docs/refactor/depcruise-report.md`.
- Posible código muerto (solo tests, tools o scripts los usan; ver `deadCode` en `moves.json`): `feel/human-bot`, `feel/rat-bot`, `school/school-bot`, `obstaculos/sim/feelkit`, `audio/measure/measure`, `server/crash-writer`.

## Herramientas

- Vitest con un proyecto por paquete con tests rápidos (`core`, `screen-kit`, `controller-kit`, `game-pizzas`, `game-obstaculos`, `app-server`, `tools`) y `slow` (`*.slow.test.ts`, incluye `apps/controller`); config en `vitest.config.ts` (la genera `move.ts`) y `vitest.shared.ts`.
- `size-budget.json` + `tools/meta/size-budget.test.ts`: trinquete de tamaño. `biome.json`: lint y formato (`useImportType` y `noUnusedImports` en error). `.dependency-cruiser.cjs`: reglas del objetivo en aviso.
- `docs/refactor/baseline/`: nombres de tests, duraciones y hashes; `npm run baseline:check` es la puerta de equivalencia (traduce las rutas del baseline con `scripts/moves.json`).
- `.git-blame-ignore-revs`: el commit de formato de F2.

## Objetivo (resumen)

Un paquete por juego y una plataforma genérica, unidos por un contrato de juego tipado:

```
platform/{core,screen,controller,server}   genérica, no conoce ningún juego
games/<id>/{sim,screen,controller,test}    pizzas, obstaculos, arena
apps/{screen,controller,server}            únicas raíces que importan juegos y plataforma
```

- Primero se mueve (codemod `scripts/move.ts`, solo renombres e imports) y después se parte (`main.ts`, `overcooked.ts`, `capture.ts`, `index.html`).
- Reglas (hoy en aviso, error en F6): sin imports entre juegos; la plataforma no importa juegos ni apps; nadie importa `apps/`; el sim no toca DOM, Node ni Phaser; entre paquetes solo por `index.ts`; sin ciclos; producción no importa tests.
- Cada juego trae un `README.md` de ≤40 líneas (módulos, invariantes, red de tests).
