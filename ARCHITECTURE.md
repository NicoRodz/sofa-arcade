# ARCHITECTURE

Sofa Arcade: la pantalla grande corre la simulación y pinta; los celulares son mandos; el server es un relay WebSocket que no corre el tick. Los paquetes siguen como `@pichi/*` (antes Pichiclub). Reglas de trabajo: `CLAUDE.md`; skill para programar con IA: `.claude/skills/sofa-arcade-dev/SKILL.md`.

## Capas

```
platform/{core,screen,controller,server}   genérica: no conoce ningún juego
games/<id>/{sim,screen,controller}         un paquete por juego (pizzas, obstaculos, arena) + test/
apps/{screen,controller,server}            raíces: únicas que ensamblan juegos y plataforma
apps/catalog                               el catálogo: la lista de juegos de esta build y su protocolo compuesto
tools/                                     capturas, e2e con Chrome, baseline, topes de tamaño, depcruise report
```

| Capa | Paquete | Qué es |
|---|---|---|
| `platform/core/` | `@pichi/core` | Puro (sin DOM ni Node): protocolo (`src/wire/`), contrato (`src/contract/`, export `@pichi/core/contract`), `testkit/` (`checkGame`), `rng.ts`, avatares, lobby |
| `platform/screen/` | `@pichi/screen-kit` | Shell de la pantalla: `shell/` (`ScreenGame`, `registerGames`), `screens/` (lit-html), `lobby/`, `menu/`, `audio/`, `art/` |
| `platform/controller/` | `@pichi/controller-kit` | Shell del celular: pad, lobby, remoto del Capitán; `contract.ts` define `ControllerGame` |
| `platform/server/` | `@pichi/server-kit` | `relay.ts` (sala única, reenvía), `lan.ts`, guardas de menú y apariencia |
| `games/<id>/` | `@pichi/game-<id>` | `index.ts` (manifest + protocolo, sin Phaser), `sim/` (puro y determinista), `screen/`, `controller/`, `test/` |
| `apps/catalog/` | `@pichi/catalog` | `src/games.ts` (`GAMES`, `IN_DEVELOPMENT`, `CATALOG`), `src/protocol.ts` (`PROTOCOL`, `parseClientMessage`) |
| `apps/{screen,controller,server}/` | `@pichi/app-*` | `main.ts` ensambla; `apps/screen/src/games.ts` y `apps/controller/src/games.ts` listan los juegos |

El sim es código puro: ni DOM, ni Node, ni Phaser, ni `Math.random`/reloj. La pantalla lo avanza (tick fijo o `advance(dtMs)`); el relay solo reenvía.

## El contrato de un juego

Los cuatro tipos viven en `platform/core/src/contract/` salvo los dos de UI:

- **`GameManifest`** (`contract/game.ts`): `id` (kebab-case, viaja en el protocolo), `name`, `blurb`, `minPlayers`/`maxPlayers`, `controls` (stick y dos botones), `howTo`, `modes?`. `soon: true` (campo extra de Arena) lo deja fuera del menú salvo con `?soon=1` (`platform/screen/src/dev-flags.ts`).
- **`GameProtocol`** (`contract/protocol.ts`): qué valores acepta el juego en las ranuras opacas (`isMap`, `isPuesto`, `signalKinds`, `puestoCount`, `parseResult`, `defaultMap`). `composeProtocol` une los de la build.
- **`ScreenGame`** (`platform/screen/src/shell/game.ts`): `manifest`, `lobby` (`LobbyHooks`), `startMatch()`, `results`, y opcionales (`frame`, `scenes`, `reset`, `players`, `phaseExtras`...). El shell no nombra ningún juego: cada rama por juego es un hook.
- **`ControllerGame`** (`platform/controller/src/contract.ts`): `id`, `setupLabel(cfg)`, y opcionales (`init`, `onPhase`, `onMessage`, `school`).
- **`checkGame`** (`platform/core/src/testkit/conformance.ts`): devuelve los problemas de coherencia entre manifest, protocolo y celular (mismo id, modos, controles, ranuras). Cada juego lo corre en `games/<id>/test/conformance.test.ts`; `[]` = conforme.

### Protocolo v6 con ranuras

`PROTOCOL_VERSION = 6` (`platform/core/src/wire/constants.ts`), una sola versión global. El cable no cambió al desacoplar: la plataforma conserva los nombres heredados (`map`, `puesto`, `sig.kind`, `result`; tipo `Slots` en `contract/slots.ts`) como ranuras opacas que solo reenvía; cada juego las tipa y valida con su `GameProtocol`. `apps/catalog/src/slots.ts` es la unión para el código que habla con todos. Si un `GameProtocol` cambia el cable, sube `PROTOCOL_VERSION`.

## Qué hacen cumplir los gates

| Gate | Comando | Qué impide |
|---|---|---|
| depcruise, 8 reglas en `error` (`.dependency-cruiser.cjs`) | `npm run deps` | `no-cross-game`, `platform-not-games`, `only-apps-compose`, `pure-sim`, `pure-sim-node-core`, `public-api`, `no-circular`, `no-test-in-prod` |
| `public-api` | `npm run deps` | Entre paquetes solo se importa un `index.ts` publicado en `exports` del `package.json` (los tests y el harness quedan fuera: son de caja blanca) |
| `no-circular` | `npm run deps` | Ciclos de imports |
| `size-budget` | `npx vitest run --project tools` | Topes de `size-budget.json` (`tools/meta/size-budget.ts`): `.ts` 300/500, tests 500/800, `.css`/`.html` 150/250, `index.ts` 40, carpeta 12/20. Las excepciones solo bajan y vencen (`until`) |
| `check-new-files` | `npm run check:new-files` | Archivo nuevo >300 líneas, o renombrado que crece sobre 300 (`scripts/check-new-files.mjs`; en CI contra la base del PR) |
| smoke | `npm run build && npm run smoke` | Arranque del bundle compilado: falla con cualquier error de página o sin `window.__pg`/`window.__pad` (`tools/capture/smoke.ts`; job `smoke` de CI) |
| lobby de los juegos en navegador real | `npm run build && PG_PORT=<libre> PG_CDP=<libre> npx tsx tools/lobby-games-e2e.ts x <dir>` | Manual, no está en CI (44 PASS): Pizzas (mapas, equipos, píldoras, tarjetas dentro de las columnas), Obstáculos y Arena con Chrome real, relay real y bots. `LABEL=before\|after` nombra las capturas `lobby2-<LABEL>-*.png`; `DUMP_DIR` guarda DOM normalizado y estilo computado para diff antes/después. Partes en `tools/lobby-games/` |
| baseline | `npm run baseline:check` | Falla si falta un test del baseline, se salta uno, un proyecto corre 0 tests o cambia un hash. Mover un test exige su entrada en `testMoves` de `scripts/moves.json` (`tools/meta/baseline-moves.ts`) |
| goldens y mirror | `npm run test:slow` | Goldens del sim (`games/pizzas/test/golden/`): un rojo es que cambió el orden o el consumo de RNG. Espejo de versus (`*.mirror.slow.test.ts`): las dos cocinas deben ver lo mismo |
| `platform` agnóstica | `npm run test:fast` | `tools/meta/agnostic.test.ts`: la plataforma no importa un juego ni escribe su id |

El CI (`.github/workflows/ci.yml`) corre lint, typecheck, test:fast, deps y check-new-files; `smoke` va aparte. `baseline:check` (~4 min) y los goldens los corre quien integra.

## Agregar un juego (ejemplo: Arena, `games/arena/`)

1. `games/<id>/package.json` con `exports` `.`, `./sim`, `./screen`, `./controller`, `tsconfig.json` y proyecto en `vitest.config.ts`.
2. `manifest.ts` y `protocol.ts` (Arena: `{ game: 'arena' }`; sin mapas ni puestos) y `index.ts` que los reexporta.
3. `sim/`: estado y `step` puros; azar solo por `mulberry32` con semilla (`platform/core/src/rng.ts`).
4. `screen/`: un `ScreenGame` (`screen/game.ts`) con lobby, escena, resultados; `screen/index.ts` lo exporta.
5. `controller/`: un `ControllerGame` mínimo (`controller/game.ts`).
6. `test/`: sim, y `conformance.test.ts` con `checkGame`.
7. Una línea en `apps/catalog/src/games.ts` (`GAMES`, o `IN_DEVELOPMENT` con `soon: true`) y su protocolo en `apps/catalog/src/protocol.ts`.
8. Una línea en `apps/screen/src/games.ts` y otra en `apps/controller/src/games.ts`. Sin tocar `platform/`.

Prueba a mano: `npm run dev` y la pantalla con `?soon=1`. Arena es el tercer implementador que demuestra que el contrato alcanza.

## Pantallas con lit-html

`platform/screen/src/ui/render.ts` es la única entrada a lit-html (`html`, `renderInto`, `styleMap`, `unsafeHTML`). Una pantalla `platform/screen/src/screens/<name>/` tiene:

- `view.html`: el esqueleto estático, montado antes de cualquier consulta al DOM (`apps/screen/src/mount.ts`).
- `model.ts`: función pura estado -> modelo de vista; se prueba sin DOM.
- `view.ts`: la plantilla y `render<Name>(model)`, que llama `renderInto`. Nada se ejecuta al cargar el módulo.
- `view.test.ts`: prueba las partes estáticas y los valores enlazados del `TemplateResult`, sin DOM.

Ejemplo: `platform/screen/src/screens/howto/`. Una pantalla se migra una por commit y la comparación de capturas la decide Nico.

## Mapa de cada paquete

README por paquete: `platform/*/README.md`, `games/*/README.md`, `apps/*/README.md`. Reestructura (historia, decisiones): `docs/refactor/`.
