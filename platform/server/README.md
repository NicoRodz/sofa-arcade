# `@pichi/server-kit` (`platform/server`)

El relay WebSocket. No corre el tick: valida, reenvía y guarda el estado de la sala. Lo monta `apps/server` pasándole el catálogo y el parser de `apps/catalog`.

| Ruta | Qué hay |
|---|---|
| `src/relay.ts` | `attachRelay`: sala única, jugadores, ranuras, Capitán, estado de lobby |
| `src/menu-guard.ts` | Qué toques del menú acepta el relay y de quién |
| `src/appearance-guard.ts` | Validación de apariencias de avatar |
| `src/lan.ts` | `lanIp`: primera IPv4 privada no interna (para la URL y el QR) |

Sin imports de juegos: el relay conoce los juegos solo por el catálogo y el `GameProtocol` compuesto que recibe. Sus tests viven en `apps/server/test/` (WebSocket real).
