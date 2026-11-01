# `@pichi/app-screen` (`apps/screen`)

Raíz de la pantalla (Mac o TV): ensambla `@pichi/screen-kit` con los juegos. Es de las pocas que pueden importar juegos.

| Ruta | Qué hay |
|---|---|
| `src/main.ts` | Arranque: registra los juegos, enlaza servicios, inicia lobby, menú y conexión |
| `src/games.ts` | La lista de `ScreenGame` de la build, en el orden del menú. Un juego `soon` solo se registra si el catálogo lo lista (`?soon=1`) |
| `src/catalog.ts` | Enlaza el catálogo de `apps/catalog` con el shell |
| `src/mount.ts` | Monta los `view.html` de `platform/screen/src/screens/*` antes de cualquier consulta al DOM |
| `index.html`, `vite.config.ts` | Entrada de Vite |

`npm run build` genera `dist/`; `npm run smoke` lo arranca en Chrome headless. Sin tests propios: se cubre por `smoke` y las capturas (`tools/capture`).
