// Real-browser check of the games' halves of the lobby (F4d-2 part 2): Pizzas' map panel, team columns and pills, Obstaculos' rows and Arena's bare lobby.
// The real screen in headless Chrome, the real relay, 7 phones played by bots and the Captain's phone sending menuAct. Every state the lobby paints (selected,
// recommended, folded "Otros mapas", locked teams, a chip inside a team column) has to survive the next render. Exits 1 on a failed check or a page error.
// Parts live in tools/lobby-games/ (check, captain, dump, pizzas); this file runs them in order and adds Obstaculos and Arena.
// usage: PG_PORT=<free port> PG_CDP=<free port> LABEL=after DUMP_DIR=/path npx tsx tools/lobby-games-e2e.ts x docs/screens/lit   (needs `npm run build`)
//   LABEL names the captures (`lobby2-<LABEL>-<name>.png`); DUMP_DIR gets the normalized DOM and the computed style of each panel, to diff before/after.
import { PORT, sleep } from './capture/config';
import { withSession, type Ctx } from './capture/session';
import { check, failed, LABEL } from './lobby-games/check';
import { dump } from './lobby-games/dump';
import { pizzas } from './lobby-games/pizzas';

async function game(c: Ctx, id: 'obstaculos' | 'arena', room: string, n: number, url?: string) {
  const { cdp, join, click } = c;
  if (url) {
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&${url}` });
    await sleep(2500);
  } else await c.open(room);
  await join(room, n, [], { menu: true });
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  for (let i = 0; i < 4; i++) {
    if ((await cdp.eval<{ sel: string }>('window.__pg.menu()')).sel === id) break;
    await key('ArrowRight');
    await sleep(150);
  }
  await key('Enter');
  await sleep(2200);
  const phase = await cdp.eval<string>('window.__pg.snapshot().phase');
  check(phase === 'lobby', `${id}: in its lobby`, phase);
  if (id === 'obstaculos') {
    await click('[data-hub="quick"]'); // the campaign hub comes first: "Partida rápida" is the level picker
    await sleep(500);
  }
  return { cdp, click };
}

async function main() {
  await withSession(async (c) => {
    await pizzas(c);
    c.bots.splice(0).forEach((b) => b.close());
    const o = await game(c, 'obstaculos', 'L2OB', 4);
    const ids = ['obstlevels', 'obstmodes', 'obstfor', 'oseedrow', 'obstinfo', 'obstlives', 'diffs'];
    await o.cdp.shot(`lobby2-${LABEL}-obst-default`);
    await dump(c, 'obst-default', ids);
    const sel = () => o.cdp.eval<string>(`document.querySelector('#obstlevels .mc.sel')?.dataset.level ?? ''`);
    check((await sel()) !== '', 'obstaculos: a level is selected');
    const target = await o.cdp.eval<string>(
      `[...document.querySelectorAll('#obstlevels .mc:not(.blk)')].map((e) => e.dataset.level).find((l) => l !== document.querySelector('#obstlevels .mc.sel')?.dataset.level) ?? ''`,
    );
    await o.click(`#obstlevels [data-level="${target}"]`);
    await sleep(400);
    check((await sel()) === target, 'obstaculos: clicking a level selects it', target);
    await o.click(`#obstmodes [data-tether="free"]`);
    await sleep(400);
    check(
      await o.cdp.eval<boolean>(
        `!!document.querySelector('#obstmodes [data-tether="free"].sel') && !document.querySelector('#obstmodes [data-tether="chain"].sel')`,
      ),
      'obstaculos: mode Libres is the only selected pill',
    );
    await o.click(`#diffs [data-diff="hard"]`);
    await sleep(400);
    check((await sel()) === target, 'obstaculos: the level stays selected after the difficulty change');
    await o.click(`#obstlevels [data-level="0"]`);
    await sleep(400);
    check(
      await o.cdp.eval<boolean>(`!document.getElementById('oseedrow').classList.contains('off')`),
      'obstaculos: Aleatorio shows the seed row',
    );
    await o.cdp.shot(`lobby2-${LABEL}-obst-random`);
    await dump(c, 'obst-random', ids);
    c.bots.splice(0).forEach((b) => b.close());
    const a = await game(c, 'arena', 'L2AR', 3, 'soon=1');
    await a.cdp.shot(`lobby2-${LABEL}-arena-default`);
    await dump(c, 'arena-default', ['setup', 'lobbyui', 'diffs']);
    c.bots.splice(0).forEach((b) => b.close());
    check(c.cdp.pageErrors.length === 0, 'no page errors in the whole run', c.cdp.pageErrors.join(' | '));
  });
  console.log(failed() ? `\n${failed()} FAILED` : '\nall passed');
  process.exit(failed() ? 1 : 0);
}
main();
