# ARCHITECTURE (provisional, F1)

Estado ACTUAL del repo y, al final, el objetivo resumido. Se reemplaza en F6 por la versión final (árbol, contrato, reglas, flujo de una partida). Diseño completo: `~/.claude/plans/reestructura-repo.md`.

## Cómo corre una partida

1. `server/` sirve las dos apps y hace de relay WebSocket (`/ws`, sala única). No corre el tick: reenvía y guarda el progreso de la campaña (`expeditions*.ts`).
2. `screen/` (el Mac, pantalla grande) corre la simulación determinista a un tick fijo, la pinta con Phaser y el DOM, y recibe los inputs de los celulares.
3. `controller/` (el celular) pinta los controles que el lobby le manda (D-pad y dos botones) y envía inputs.
4. `shared/` es código puro sin DOM ni Node: reglas, protocolo y simulación; lo importan las tres apps y los tests.

## Estructura actual

| Ruta | Qué hay |
|---|---|
| `shared/*.ts` (73 archivos, plana) | Pizzas entero: `overcooked.ts` (sim, 942 líneas), `maps.ts`, `generate.ts`, `validate.ts`, `versus.ts`, `sabotage.ts`, `burn.ts`, `midround.ts`, `assist.ts`, `hints.ts`, `score.ts`, `stars.ts`. Plataforma: `protocol.ts`, `games.ts` (registro), `vote.ts`, `captain.ts`, `teams.ts`, `rng.ts`, `icons.ts`, `render.ts`. |
| `shared/games/obstaculos/` | Obstáculos: `sim/` (mundo, cuerda, reglas), `campaign/`, `validator/`, `generate/`, `modules/`, `metric/`, `levels/` (datos), `session.ts`, `index.ts`. |
| `shared/golden/` | Rondas grabadas de Pizzas (JSON) y sus bots. Datos: no se editan. |
| `screen/src/main.ts` (1.287 líneas) | Máquina de estados y red de la pantalla, más las ramas por juego. |
| `screen/src/art/` | Dibujo procedural de Pizzas (chef, hud, cocina, eventos). |
| `screen/src/games/obstaculos/` | Pantalla de Obstáculos: `render/`, `campaign/`, `audio/`, `harness/`, `host.ts`. |
| `screen/src/audio/`, `menu.ts`, `howto.ts`, `scene.ts`, `bus.ts` | Audio, menú, ayuda, escena Phaser, bus de eventos. |
| `screen/index.html` (498) | Marcado y todo el CSS de la pantalla. |
| `controller/src/main.ts` (436), `controller/index.html` | Celular: conexión y controles. |
| `server/src/` | `server.ts`, `relay.ts`, `expeditions*.ts`, `main.ts`, `lan.ts`. Pruebas con bots por websocket en `server/test/`. |
| `tools/` | Scripts sueltos (`capture.ts` 897 líneas, `*-e2e.ts`, `obst-sim.ts`, `record-golden.ts`), `latency-report/` y `meta/` (baseline, topes de tamaño, reporte de dependencias). |
| `docs/` | `screens/` (capturas de referencia), `refactor/` (baseline, reportes). |

Paquetes npm (workspaces): `@party/shared` con subpath exports (`./game`, `./maps`, `./obstaculos`…), `screen`, `controller`, `server`, `tools/latency-report`.

## Herramientas (F1)

- Vitest con un proyecto por paquete (`shared`, `server`, `screen`, `controller`, `tools`) y `slow` (`*.slow.test.ts`); config compartida en `vitest.shared.ts`.
- `size-budget.json` + `tools/meta/size-budget.test.ts`: trinquete de tamaño. `biome.json`: lint (formato en F2). `.dependency-cruiser.cjs`: reglas del objetivo en aviso (`docs/refactor/depcruise-report.md`).
- `docs/refactor/baseline/`: nombres de tests, duraciones y hashes; `npm run baseline:check` es la puerta de equivalencia.

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
