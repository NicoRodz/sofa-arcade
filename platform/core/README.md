# `@pichi/core` (`platform/core`)

Lo que comparten pantalla, celular, relay y juegos. Código puro: sin DOM, Node ni Phaser. No conoce ningún juego (lo vigila `tools/meta/agnostic.test.ts`).

| Ruta | Qué hay |
|---|---|
| `src/wire/` | Protocolo: mensajes cliente y servidor, parsers, `PROTOCOL_VERSION` (6, en `constants.ts`) |
| `src/contract/` | `GameManifest`, `GameProtocol` + `composeProtocol`, `Slots`, catálogo de juegos (`createCatalog`). Export `@pichi/core/contract` |
| `src/testkit/` | `checkGame`: conformidad de un juego con el contrato. Export `@pichi/core/testkit` |
| `src/lobby/` | Votos, Capitán, equipos, menú del Capitán |
| `src/avatar/` | Avatares (pintores Canvas2D y Phaser) |
| `src/rng.ts` | `mulberry32` y ayudas con semilla: todo el azar del sim sale de aquí |
| `src/registry.ts`, `difficulty.ts`, `render.ts`, `icons.ts` | Registro genérico, dificultades, cómo se juega en HTML, iconos |

Reglas: entre paquetes solo se importa por `index.ts` o por un `exports` de `package.json`. `npm run test:agent -- --project core`.
