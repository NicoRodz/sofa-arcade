# `@pichi/screen-kit` (`platform/screen`)

El shell de la pantalla grande: flujo de la partida, lobby, menú, audio y arte comunes. No nombra ningún juego: cada juego entra por su `ScreenGame`.

| Ruta | Qué hay |
|---|---|
| `src/shell/` | `ScreenGame` (`game.ts`), `registerGames`, `catalog.ts` (catálogo enlazado, lectura perezosa), estado de la app, flujo de rondas |
| `src/screens/<name>/` | Pantallas con lit-html: `view.html` (esqueleto), `model.ts`, `view.ts`, `style.css`. Hoy `howto` está migrada; `page`, `lobby`, `menu` y `results` solo tienen markup y CSS |
| `src/ui/render.ts` | Única entrada a lit-html (`html`, `renderInto`, `styleMap`, `unsafeHTML`) |
| `src/lobby/`, `menu/`, `results/`, `vote/` | Lobby, menú de juegos, resultados y votos |
| `src/net/` | Socket y latencia |
| `src/audio/`, `art/` | Mezclador, síntesis, música; tokens y arte común |
| `src/dev-flags.ts` | `?soon=1`: habilita los juegos `soon` en el menú |

Reglas: nada se ejecuta al cargar un módulo (`src/shell/barrels-unbound.test.ts` carga los barriles sin catálogo enlazado). Phaser solo en los archivos que lo necesitan. `npm run test:agent -- --project screen-kit`.
