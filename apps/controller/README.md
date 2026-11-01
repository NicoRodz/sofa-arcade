# `@pichi/app-controller` (`apps/controller`)

Raíz del celular (`/c`): ensambla `@pichi/controller-kit` con el `ControllerGame` de cada juego.

| Ruta | Qué hay |
|---|---|
| `src/main.ts` | Arranque del celular (expone `window.__pad`) |
| `src/games.ts` | La lista de `ControllerGame` de la build. Un juego sin entrada aquí solo muestra su nombre en el lobby |
| `index.html`, `portrait.css`, `assist-help.css`, `vite.config.ts` | Página y estilos |
| `test/` | Pruebas con Chrome: layout, menú, creador (`*.slow.test.ts`) y el harness |

Los tests con Chrome corren en el proyecto `slow` (`npm run test:slow`) y toman puertos libres o los de `PG_PORT` y `PG_CDP_PORT`. Mata Chrome por árbol de PIDs al terminar.
