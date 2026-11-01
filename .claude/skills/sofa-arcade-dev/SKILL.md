---
name: sofa-arcade-dev
description: Programar en el repo Sofa Arcade (party-game, antes Pichiclub, paquetes @pichi/*). Úsala al editar código, tests, goldens, capturas o docs de platform/, games/, apps/ o tools/; al agregar un juego, una pantalla lit-html o una mecánica; al preparar un PR; y cuando algo mencione goldens, baseline, size-budget, depcruise, smoke, Arena, Pizzas u Obstáculos.
---

# Sofa Arcade: programar con IA respetando las reglas

Antes de tocar nada lee `CLAUDE.md` (reglas duras) y `ARCHITECTURE.md` (capas, contrato, gates). Cada tarea trae su alcance (por ejemplo "solo `games/arena/**`"): si necesitas tocar fuera, detente y repórtalo.

## Flujo de un cambio

1. Worktree propio desde `origin/master` (`git worktree add`), rama propia, y `npm ci` antes de nada: sin `node_modules` los tests con navegador dan verde falso.
2. Implementa. Archivos nuevos: kebab-case, <=300 líneas, inglés. Prohibido `utils.ts`, `helpers.ts`, `misc`. `index.ts` <=40 líneas y solo re-exports.
3. `git add` con rutas explícitas de archivo, nunca de directorio. Commitea **antes** de sabotear: `git checkout --` borra lo no commiteado.
4. Todo entra por PR contra `master`, con `.github/pull_request_template.md`, aprobado por alguien distinto del autor. Nunca fusiones tu propio PR ni empujes a `master`.
5. La evidencia va en el PR:
   - capturas antes/después de todo lo visible (incluidas `docs/screens/**`);
   - si cambia un golden o un hash: qué regla cambió, por qué, y que los goldens sin flags no se movieron;
   - sabotaje: qué rompiste a mano en cada test nuevo y que se puso en rojo (restaura solo ese archivo).
6. Sin procesos en background ni esperar notificaciones. Mata Chrome solo por PID (ver Puertos).

## Reglas duras

- **No subas topes.** `size-budget.json` solo baja (`npm run size:ratchet`); no agregues excepciones ni subas un `max`. Si un archivo que editas pasa de 300 líneas, pártelo en la misma tarea. Un archivo nuevo >300 falla `check:new-files`; mover o renombrar un archivo para esquivarlo también.
- **Goldens, hashes y capturas no se regraban para ponerlos en verde.** Un golden en rojo es que cambió el orden del tick o el consumo de RNG: corrige el código. Regrabar solo en un PR que lo explique, aprobado por otra persona y con el OK de Nico. Los goldens (`games/pizzas/test/golden/fixtures/*.json`) siguen siendo bit a bit iguales **sin flags**.
- **Un cambio de sim va detrás de un flag**, apagado por defecto (como `hazardsV3`, `burn`, `mutate`, `events`, `recipes`, `magnet` en Pizzas). Una ronda sin flags no toca esos caminos ni consume RNG de más. No reordenes `tick`.
- **Determinismo.** El sim no usa `Math.random`, reloj, DOM ni Node. Todo el azar sale de `mulberry32` (`platform/core/src/rng.ts`). Un azar nuevo va en un **substream con tag** (`seed ^ <NOMBRE>_SEED_TAG`, como `MUTATE_SEED_TAG` o `FIRE_SEED_TAG` en `games/pizzas/sim/`), nunca en la corriente existente. En versus lo que ve una cocina lo ve la otra: respeta el espejo (`*.mirror.slow.test.ts`).
- **Sin efectos al cargar módulos.** Nada de leer el catálogo, crear estado o registrar cosas a nivel de módulo: usa funciones perezosas (`catalog()`, `defaultConfig()` al primer uso). El PR #18 rompió el arranque del bundle porque `app.config` se construía al importar, antes de `bindCatalog()`; pasó lint, typecheck y test:fast. Solo lo ve `npm run smoke`.
- **Tests.** No borres, saltes (`skip`/`todo`) ni renombres un test sin justificarlo en el PR. Mover un test exige su entrada en `testMoves` de `scripts/moves.json`. Un proyecto de Vitest con 0 tests es rojo.
- **Capas** (depcruise, 8 reglas en error): la plataforma no importa juegos ni apps; los juegos no se importan entre sí; nadie importa un `main.ts`; el sim es puro; entre paquetes solo por `index.ts`; sin ciclos; producción no importa tests. No agregues dependencias sin OK de Nico.
- **Un verde que nace de no ejecutar nada no vale.** Si no pudiste correr algo, dilo.

## Puertos y Chrome

- 3000 y 3100 son del usuario: no los uses. Para server y Chrome propios: `PG_PORT` y `PG_CDP` (`tools/capture`, `smoke`); `PG_PORT` y `PG_CDP_PORT` (`apps/controller/test`, `tools/obst-e2e`). Elige puertos altos y libres.
- Mata Chrome solo por el PID que lanzaste y su árbol de hijos (SIGTERM, espera, SIGKILL): `tools/proc/kill-tree.ts` (`killTree`). Nada de `pkill chrome` ni `killall`: matarías el Chrome del usuario. Al terminar revisa que no queden `chrome-headless-shell` tuyos.

## Qué correr antes del PR

Solo lo que tocaste; la suite completa la corre quien integra.

```
npm run lint
npm run typecheck
npm run test:agent -- --project <proyecto>   # core, screen-kit, controller-kit, game-pizzas, game-obstaculos, game-arena, app-server, catalog, tools
npm run test:fast
npm run deps                                  # 0 violaciones
npm run check:new-files
```

- Tocaste `step`/sim, validador, generador o protocolo: `npm run test:slow` (goldens y espejo).
- Tocaste algo que se compila o arranca (imports, barriles, `main.ts`, catálogo): `npm run build && npm run smoke`.
- Tocaste tamaños: `npx vitest run --project tools`.
- Integración: `npm run baseline:check` (~4 min) verde o explicado.
- Salida de comandos largos a un archivo; `test:agent` usa `--silent`/`dot`.

## Cómo agregar...

**Un juego** (modelo: `games/arena/`, receta completa en `ARCHITECTURE.md`): paquete con `manifest.ts`, `protocol.ts`, `sim/`, `screen/` (`ScreenGame`), `controller/` (`ControllerGame`), `test/conformance.test.ts` con `checkGame`; una línea en `apps/catalog/src/games.ts` (`IN_DEVELOPMENT` con `soon: true` mientras se desarrolla) y su protocolo en `apps/catalog/src/protocol.ts`; una línea en `apps/screen/src/games.ts` y `apps/controller/src/games.ts`. Sin tocar `platform/`: si necesitas hacerlo, el contrato no alcanza; detente y repórtalo. Prueba con `?soon=1`. Un README <=40 líneas.

**Una pantalla lit-html** (modelo: `platform/screen/src/screens/howto/`): `view.html` con el esqueleto (montado en `apps/screen/src/mount.ts`), `model.ts` puro (estado -> modelo), `view.ts` con la plantilla y `render<Name>()` vía `renderInto` de `platform/screen/src/ui/render.ts`, y `view.test.ts` sin DOM. El DOM y las capturas deben quedar iguales: si una diferencia es irreducible, se le muestra a Nico antes/después; no se regraba. Una pantalla por commit.

**Una mecánica** (en el sim de un juego): primero un flag apagado por defecto en la configuración de la ronda; el código nuevo no se ejecuta ni consume RNG sin el flag; azar solo en substream con tag; tests del flag encendido y un test que muestre que con el flag apagado el golden no se mueve. Si la mecánica afecta a versus, agrega el espejo. Después, la pantalla y el celular: color o sonido para llamar la atención en el celular.

## Salida final

<=150 palabras: rutas cambiadas, comandos con su conteo real, y lo que no pudiste verificar.
