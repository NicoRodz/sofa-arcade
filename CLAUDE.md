# Sofa Arcade (party-game)

Juegos de fiesta en red local: la pantalla grande (Phaser + DOM) corre la simulación, los celulares son mandos, el server es un relay (ws). Juegos: Pizzas (cocina coop y versus), Obstáculos (campaña) y Arena (en desarrollo, `?soon=1`). Antes se llamaba Pichiclub: los paquetes internos siguen como `@pichi/*`. TypeScript, npm workspaces, Vitest, Vite. Capas, contrato de juego y gates: `ARCHITECTURE.md`. Skill para programar con IA: `.claude/skills/sofa-arcade-dev/SKILL.md` (`/sofa-arcade-dev`).

## Comandos

| Qué | Comando |
|---|---|
| Probar un paquete (lo normal) | `npm run test:agent -- --project game-pizzas` (también core, screen-kit, controller-kit, game-obstaculos, game-arena, app-server, catalog, tools) |
| Rápidos / lentos / todo | `npm run test:fast` / `npm run test:slow` / `npm test` |
| Tipos, build, lint | `npm run typecheck` · `npm run build` · `npm run lint` |
| Topes de tamaño | `npx vitest run --project tools` (corre `tools/meta/size-budget.test.ts`) |
| Dependencias (8 reglas en error) | `npm run deps` · reporte: `npm run deps:report` |
| Archivos nuevos y arranque del bundle | `npm run check:new-files` · `npm run build && npm run smoke` |
| Puerta de equivalencia | `npm run baseline:check` (suite completa, ~4 min; solo al integrar) |
| Dev | `npm run dev` (server + Vite) |
| Mover archivos / reaplicar sobre una rama | `npm run move` (`scripts/move.ts` + `scripts/moves.json`; `-- --dry-run` para ver) |

- `slow` (`*.slow.test.ts`): corre solo si tocaste `step`/el sim, el validador, el generador o el protocolo; la suite completa la corre quien integra.
- Tests con Chrome (`apps/controller/test/layout.slow.test.ts`, `tools/*e2e.ts`, capturas): usa tus puertos propios: `PG_PORT` y `PG_CDP` (`tools/capture`, `smoke`) o `PG_CDP_PORT` (`apps/controller/test`, `tools/obst-e2e`); los tests del celular toman puertos libres si no los fijas. 3000 y 3100 son del usuario. Al terminar, mata Chrome solo por el árbol de PIDs que lanzaste (`tools/proc/kill-tree.ts`: SIGTERM, luego SIGKILL).
- `vitest` con `--silent`/`dot` para no llenar el contexto; los logs de Puppeteer no se pegan en la salida.

## Qué leer y qué no

- Lee: este archivo, `ARCHITECTURE.md`, lo que el brief nombre, lo que aparezca con grep. Archivos en excepción de tamaño (`size-budget.json`): con `offset` y `limit`.
- No leas: `data/`, `fixtures/`, `levels/`, `games/pizzas/test/golden/`, salidas de capturas (`docs/screens/`), `dist/`, `package-lock.json`, tests ajenos a tu tarea, `docs/refactor/baseline/`.

## Topes de tamaño (trinquete en `size-budget.json`)

- Un archivo nuevo de más de 300 líneas falla `check:new-files` (también un renombrado que crece sobre 300). Código `.ts`: 300 aviso, 500 falla. Tests: 500 / 800. `.css` y `.html`: 150 / 250. `index.ts`: 40 y solo re-exports. Carpeta: 12 / 20 archivos de código.
- Un archivo de la lista no crece sobre su `max`; si baja más de 25 líneas, baja su `max` (`npm run size:ratchet`). Venció el `until` o cambió la ruta: el test falla.
- Si un archivo que editas pasa de 300 líneas, pártelo en la misma tarea o repórtalo. No partas por debajo de ~60 líneas. No crees `utils.ts`, `helpers.ts` ni `misc`.

## Reglas duras

- Goldens (`games/pizzas/test/golden/fixtures/*.json`), hashes de regresión, capturas (`docs/screens/**`) y `docs/refactor/baseline/` se pueden regrabar, pero solo en un PR a master que explique por qué cambian y adjunte evidencia: capturas antes/después; para goldens, qué regla cambió y que los goldens sin flags no se movieron. Lo aprueba alguien distinto del autor. Nunca regraba para tapar un rojo sin entender la causa; si el rojo no es un cambio intencional, repórtalo.
- Nunca borres, saltes (`skip`/`todo`) ni renombres un test sin justificarlo en el PR, y jamás para ponerlo en verde. La lista de nombres es la del baseline. Los tests nuevos se sabotean a mano para verlos en rojo. `baseline:check` verde (o explicado en el PR).
- Mover un archivo de test lento a `*.slow.test.ts` no cambia su contenido.
- Un verde que nace de no ejecutar nada no vale: un proyecto de Vitest con 0 tests es rojo.
- `git add` con rutas explícitas de archivo, nunca de directorio. Worktree propio por frente; no toques el checkout compartido.
- Sin procesos en background ni esperar notificaciones. Código en inglés; nombres de archivo en kebab-case (F3 renombró los camelCase).

## Alcance y salida

- Cada tarea trae su alcance explícito (por ejemplo "trabajas en `games/obstaculos/**`; no edites fuera"). Si necesitas tocar fuera, detente y repórtalo.
- Antes de decir "listo": typecheck, `npm run lint` y los tests del paquete tocado con salida real; si no pudiste correr algo, dilo.
- Salida final ≤150 palabras: rutas cambiadas, comando de test y conteo, discrepancias.
