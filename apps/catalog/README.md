# `@pichi/catalog` (`apps/catalog`)

El catálogo: la única lista de juegos de la build, que comparten relay, pantalla y celular. Agregar un juego es una línea aquí.

| Ruta | Qué hay |
|---|---|
| `src/games.ts` | `GAMES` (publicados), `IN_DEVELOPMENT` (`soon: true`), `COMING_SOON`, `CATALOG` y `DEV_CATALOG` |
| `src/protocol.ts` | `PROTOCOL`/`DEV_PROTOCOL` (`composeProtocol` de los `GameProtocol`), `parseClientMessage`, `DEFAULT_CONFIG` |
| `src/slots.ts` | `AllSlots`, `ServerMsg`, `ClientMsg`: la unión de las ranuras de los juegos |
| `src/lookups.ts` | `gameName`, `gameInfo`, `isGameId`, `modeOf`... |
| `test/` | `catalog.test.ts` |

El relay parsea con `DEV_PROTOCOL` (acepta juegos en desarrollo); la pantalla solo los ofrece con `?soon=1`.
