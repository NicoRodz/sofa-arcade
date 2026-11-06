# tools/visual: visual regression of the Pizzas screen

Local command, outside `test:slow` and CI: the shots depend on macOS system fonts and Chrome's macOS render.

- `npm run visual`: shoots 17 scenes (coop, versus HUD, sabotage, end of round) and compares them with `golden/pizzas/*.png` (480x270, 1/4 of the shot). Zero tolerance; exit 1 on any pixel. Diffs: `tmp/visual-diff/<scene>.png` (golden | actual | diff in magenta).
- `npm run visual:update`: regenerates the goldens. Commit the PNGs only in a PR that says which render rule moved and why, with a verifier other than the author.
- ~20 s. Needs Google Chrome (`CHROME_BIN` overrides the path). Own free ports; Chrome is killed by its PID tree.

Why it is deterministic: `page-fakes.ts` replaces requestAnimationFrame, `performance.now`, `Date`, `Math.random` and (on demand) `setTimeout` with a fake clock that moves only when a scene calls `page.frames(n)`. Real-time waits (the how-to card, the iris, the scene boot) run with that clock stopped (`window.__idle`) and wait for a DOM/state condition, never a fixed time. CSS animations are pinned before each shot.
