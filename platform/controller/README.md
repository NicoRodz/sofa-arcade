# `@pichi/controller-kit` (`platform/controller`)

El shell del celular: pad (stick y dos botones), lobby, remoto del Capitán, creador de avatar y conexión. No nombra ningún juego.

| Ruta | Qué hay |
|---|---|
| `src/contract.ts` | `ControllerGame`, `ControllerHost`, `ControllerOptions` |
| `src/app/` | Arranque (`startController`), pad, controles, conexión, despacho de mensajes |
| `src/menu/` | Menú táctil del Capitán |
| `src/creator/` | Creador de avatar |
| `src/page/` | Marcado de la página del celular |
| `src/attention.ts`, `touch-guard.ts`, `zoom.ts`, `howto.ts` | Aviso por color/sonido, filtro de toques, zoom, tarjeta de cómo se juega |

Cada cambio visible en el celular debe llamar la atención (color o sonido). El layout con Chrome se prueba desde `apps/controller/test/`. `npm run test:agent -- --project controller-kit`.
