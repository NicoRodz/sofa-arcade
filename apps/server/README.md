# `@pichi/app-server` (`apps/server`)

El server único: express sirve las dos apps y monta el relay (`/ws`) de `@pichi/server-kit` con el catálogo de `apps/catalog` (incluye los juegos en desarrollo).

| Ruta | Qué hay |
|---|---|
| `src/main.ts` | CLI: `dev` (Vite incrustado) o `static` (sirve `dist/`); `PORT` (3000 por defecto); imprime las URLs y el QR |
| `src/server.ts` | `startServer({ port, mode, dataDir })`: rutas `/screen` y `/c`, QR, relay y progreso de la campaña de Obstáculos |
| `test/` | Tests WebSocket contra el relay real (`*.ws.test.ts`, `relay*.test.ts`) y su kit (`rules-kit.ts`) |

`npm run dev` / `npm start`. El progreso de campaña se guarda bajo `data/expeditions` (o `PG_DATA_DIR`).
