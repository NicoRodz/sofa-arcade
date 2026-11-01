// Real-browser check of the games' halves of the lobby (F4d-2 part 2): Pizzas' map panel, team columns and pills, Obstaculos' rows and Arena's bare lobby.
// The real screen in headless Chrome, the real relay, 7 phones played by bots and the Captain's phone sending menuAct. Every state the lobby paints (selected,
// recommended, folded "Otros mapas", locked teams, a chip inside a team column) has to survive the next render. Exits 1 on a failed check or a page error.
// usage: PG_PORT=5060 PG_CDP=5062 LABEL=after DUMP_DIR=/path npx tsx tools/lobby-games-e2e.ts x docs/screens/lit   (needs `npm run build`)
//   LABEL names the captures (`lobby2-<LABEL>-<name>.png`); DUMP_DIR gets the normalized DOM and the computed style of each panel, to diff before/after.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { PORT, sleep } from './capture/config';
import { withSession, type Ctx } from './capture/session';

const LABEL = process.env.LABEL ?? 'run';
const DUMP = process.env.DUMP_DIR;
let failures = 0;
const check = (ok: boolean, what: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

class Captain {
  ws: WebSocket;
  id = 0;
  rev = 0;
  rows: any[] = [];
  constructor(room: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', name: 'Cap', token: `cap-${room}`, caps: ['menu1'] })));
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') {
        this.id = m.player.id;
        this.ws.send(JSON.stringify({ t: 'schoolDone' }));
      }
      if (m.t === 'menu') {
        this.rev = m.rev;
        this.rows = m.rows;
      }
    });
  }
  act(row: string, value: string | boolean) {
    this.ws.send(JSON.stringify({ t: 'menuAct', rev: this.rev, act: 'set', row, value }));
  }
  /** an enabled map of the Captain's form that is not the current one */
  otherMap(): string | undefined {
    const r = this.rows.find((x) => x.id === 'map');
    const all = [...(r?.options ?? []), ...(r?.groups ?? []).flatMap((g: any) => g.items)];
    return all.find((o: any) => o.enabled && o.id !== r.value && !['auto', 'random', 'V-auto', 'V-random'].includes(o.id) && /^[A-Za-z0-9]+$/.test(o.id))?.id;
  }
}

const NORM = `(el) => el.outerHTML.replace(/<!--[\\s\\S]*?-->/g, '')`;
const STYLE_PROPS = ['display', 'position', 'width', 'height', 'color', 'backgroundColor', 'backgroundImage', 'fontSize', 'fontWeight', 'fontFamily', 'letterSpacing', 'textTransform', 'borderTopWidth', 'borderTopColor', 'borderRadius', 'marginTop', 'marginLeft', 'paddingTop', 'paddingLeft', 'gridColumnStart', 'gridColumnEnd', 'opacity', 'whiteSpace', 'overflow', 'textAlign', 'zIndex', 'transform'];

async function dump(c: Ctx, name: string, ids: string[]) {
  if (!DUMP) return;
  mkdirSync(DUMP, { recursive: true });
  const dom = await c.cdp.eval<Record<string, string>>(
    `Object.fromEntries(${JSON.stringify(ids)}.map((id) => [id, (${NORM})(document.getElementById(id))]))`,
  );
  writeFileSync(path.join(DUMP, `${name}.dom.json`), JSON.stringify(dom, null, 1));
  const styles = await c.cdp.eval<string[]>(
    `${JSON.stringify(ids)}.flatMap((id) => [document.getElementById(id), ...document.getElementById(id).querySelectorAll('*')].map((e, i) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return id + '#' + i + ' ' + e.tagName + '.' + e.className + ' ' + ${JSON.stringify(STYLE_PROPS)}.map((p) => p + '=' + s[p]).join(';') + ';rect=' + [r.x, r.y, r.width, r.height].map(Math.round).join(','); }))`,
  );
  writeFileSync(path.join(DUMP, `${name}.style.txt`), styles.join('\n'));
}

const PIZZAS_IDS = ['maps', 'teams', 'teambar', 'sabs', 'evs', 'muts', 'modes', 'diffs', 'mapfor'];

async function pizzas({ cdp, bots, open, join, click }: Ctx) {
  const ev = <T>(s: string) => cdp.eval<T>(s);
  const room = 'L2PZ';
  await open(room);
  const cap = new Captain(room);
  await sleep(500);
  await join(room, 8, [], { from: 1 });
  for (let i = 0; i < 40 && !cap.rows.length; i++) await sleep(100);
  check(cap.rows.length > 0, "the Captain's phone got the lobby form");
  const shot = (n: string) => cdp.shot(`lobby2-${LABEL}-${n}`);
  const mapsHas = (q: string) => ev<boolean>(`!!document.querySelector('#maps ${q}')`);
  const waitFor = async (expr: string, ms = 4000) => {
    for (let t = 0; t < ms; t += 100) {
      if (await ev<boolean>(expr)) return true;
      await sleep(100);
    }
    return false;
  };
  const others = `[data-to="others"]`;
  for (const [mode, tag] of [['coop', 'coop8'], ['versus', 'versus8']] as const) {
    if (mode === 'versus') {
      cap.act('mode', 'versus');
      check(await waitFor(`!document.getElementById('teams').classList.contains('off')`), 'versus: the team columns show');
    }
    await sleep(500);
    await dump(
      { cdp } as Ctx,
      `${tag}-default`,
      PIZZAS_IDS,
    );
    await shot(`${tag}-default`);
    if (mode === 'coop') {
      check(await mapsHas('.band .grp'), 'coop 8: the "Recomendados para N" band is there', await ev<string>(`document.querySelector('#maps .grp')?.textContent ?? ''`));
      check(await mapsHas('.mc.sel'), 'coop 8: a map is selected');
      const before = await ev<number>(`document.querySelectorAll('#maps .mc').length`);
      if (await mapsHas(others)) {
        await click(`#maps ${others}`);
        await sleep(300);
        const after = await ev<number>(`document.querySelectorAll('#maps .mc').length`);
        check(after > before, '"Otros mapas" unfolds', `${before} -> ${after} cards`);
        check((await ev<string>(`document.querySelector('#maps ${others}').textContent`)).includes('Ocultar'), 'the fold button now says "Ocultar otros"');
        await shot(`${tag}-others`);
        await dump({ cdp } as Ctx, `${tag}-others`, ['maps']);
      } else check(true, 'coop 8: no folded maps with 8 players (nothing to unfold)');
    }
    const pick = cap.otherMap();
    check(!!pick, `${mode}: the Captain has a map to pick`, String(pick));
    if (pick) {
      cap.act('map', pick);
      check(await waitFor(`!!document.querySelector('#maps .mc.sel[data-map="${pick}"]')`), `${mode}: the Captain's pick is the selected card`, pick);
      check((await ev<number>(`document.querySelectorAll('#maps .mc.sel').length`)) === 1, `${mode}: exactly one selected card`);
    }
    if (mode === 'coop' && (await mapsHas(others))) {
      check((await ev<string>(`document.querySelector('#maps ${others}').textContent`)).includes('Ocultar'), 'coop: "Otros mapas" stays unfolded after the pick');
    }
    await shot(`${tag}-picked`);
    await dump({ cdp } as Ctx, `${tag}-picked`, PIZZAS_IDS);
    cap.act('difficulty', 'hard');
    check(await waitFor(`!!document.querySelector('#diffs [data-diff="hard"].sel')`), `${mode}: difficulty changes to Difícil`);
    check((await ev<number>(`document.querySelectorAll('#maps .mc.sel').length`)) <= 1, `${mode}: at most one selected card after the difficulty change`);
    if (mode === 'coop' && (await mapsHas(others)))
      check((await ev<string>(`document.querySelector('#maps ${others}').textContent`)).includes('Ocultar'), 'coop: "Otros mapas" stays unfolded after the difficulty change');
    await shot(`${tag}-hard`);
    await click(`#evs [data-ev="false"]`);
    check(await waitFor(`!!document.querySelector('#evs [data-ev="false"].sel') && !document.querySelector('#evs [data-ev="true"].sel')`), `${mode}: Eventos No is the only selected pill`);
    await click(`#evs [data-ev="true"]`);
    check(await waitFor(`!!document.querySelector('#evs [data-ev="true"].sel') && !document.querySelector('#evs [data-ev="false"].sel')`), `${mode}: Eventos Sí back`);
    if (mode === 'versus') {
      await click(`#sabs [data-sab="soft"]`);
      check(await waitFor(`!!document.querySelector('#sabs [data-sab="soft"].sel') && document.querySelectorAll('#sabs .sel').length === 1`), 'versus: Sabotaje Suave is the only selected pill');
      await click(`#sabs [data-sab="off"]`);
      check(await waitFor(`!!document.querySelector('#sabs [data-sab="off"].sel') && document.querySelectorAll('#sabs .sel').length === 1`), 'versus: Sabotaje Apagado');
      const lockText = () => ev<string>(`document.getElementById('lock').textContent`);
      await click('#lock');
      check(await waitFor(`document.getElementById('lock').textContent === 'Desbloquear equipos' && document.getElementById('lock').classList.contains('sel')`), 'versus: Bloquear equipos -> "Desbloquear equipos", selected', await lockText());
      check(await waitFor(`document.getElementById('teams').classList.contains('teams-locked')`), 'versus: the columns are locked');
      await click('#lock');
      check(await waitFor(`document.getElementById('lock').textContent === 'Bloquear equipos' && !document.getElementById('lock').classList.contains('sel')`), 'versus: unlocked again');
      const on0 = await ev<boolean>(`document.getElementById('opt-hiddenScore').classList.contains('on')`);
      await click('#opt-hiddenScore');
      check(await waitFor(`document.getElementById('opt-hiddenScore').classList.contains('on') === ${!on0} && document.getElementById('opt-hiddenScore').classList.contains('sel') === ${!on0}`), `versus: the Marcador oculto pill flips (was ${on0 ? 'on' : 'off'})`);
      await click('#opt-hiddenScore');
      check(await waitFor(`document.getElementById('opt-hiddenScore').classList.contains('on') === ${on0}`), 'versus: and flips back');
      // the shell of every card travels to a team column: what lit rendered inside it has to keep updating there
      const inLists = `document.querySelectorAll('#teams .tlist .chip').length`;
      check((await ev<number>(inLists)) === 8, 'versus: all 8 cards are inside the team columns', String(await ev<number>(inLists)));
      const names = await ev<string[]>(`[...document.querySelectorAll('#teams .tlist .chip .nm')].map((e) => e.textContent)`);
      check(names.length === 8 && names.every((n) => n && n !== 'Esperando…'), 'versus: each card in a column shows its player', names.join(','));
      const crowned = await ev<number>(`[...document.querySelectorAll('#teams .tlist .chip .nm')].filter((e) => e.textContent.startsWith('👑')).length`);
      check(crowned === 1, 'versus: the Captain wears the crown inside the column', String(crowned));
      await shot(`${tag}-pills`);
      await click('#tc0 .tlist .chip');
      await sleep(500);
      check((await ev<number>(inLists)) === 8, 'versus: a click on a card moves it and none is lost');
      bots[bots.length - 1]!.ws.close(); // a phone that leaves: its card goes back to "Esperando…" and the other cards keep their place
      check(await waitFor(`document.querySelectorAll('#teams .tlist .chip:not(.empty)').length === 7`, 6000), 'versus: a phone that leaves empties its card inside the column', String(await ev<number>(`document.querySelectorAll('#teams .tlist .chip:not(.empty)').length`)));
      await shot(`${tag}-gone`);
    }
    if (mode === 'coop') {
      cap.act('mode', 'coop');
      await sleep(0);
    }
  }
  cap.act('mode', 'coop');
  check(await waitFor(`document.getElementById('teams').classList.contains('off')`), 'back to coop: the columns hide');
  check((await ev<number>(`document.querySelectorAll('#maps .mc.sel').length`)) <= 1, 'back to coop: at most one selected card');
  await shot('back-coop');
  cap.ws.close();
}

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
    const target = await o.cdp.eval<string>(`[...document.querySelectorAll('#obstlevels .mc:not(.blk)')].map((e) => e.dataset.level).find((l) => l !== document.querySelector('#obstlevels .mc.sel')?.dataset.level) ?? ''`);
    await o.click(`#obstlevels [data-level="${target}"]`);
    await sleep(400);
    check((await sel()) === target, 'obstaculos: clicking a level selects it', target);
    await o.click(`#obstmodes [data-tether="free"]`);
    await sleep(400);
    check(await o.cdp.eval<boolean>(`!!document.querySelector('#obstmodes [data-tether="free"].sel') && !document.querySelector('#obstmodes [data-tether="chain"].sel')`), 'obstaculos: mode Libres is the only selected pill');
    await o.click(`#diffs [data-diff="hard"]`);
    await sleep(400);
    check((await sel()) === target, 'obstaculos: the level stays selected after the difficulty change');
    await o.click(`#obstlevels [data-level="0"]`);
    await sleep(400);
    check(await o.cdp.eval<boolean>(`!document.getElementById('oseedrow').classList.contains('off')`), 'obstaculos: Aleatorio shows the seed row');
    await o.cdp.shot(`lobby2-${LABEL}-obst-random`);
    await dump(c, 'obst-random', ids);
    c.bots.splice(0).forEach((b) => b.close());
    const a = await game(c, 'arena', 'L2AR', 3, 'soon=1');
    await a.cdp.shot(`lobby2-${LABEL}-arena-default`);
    await dump(c, 'arena-default', ['setup', 'lobbyui', 'diffs']);
    c.bots.splice(0).forEach((b) => b.close());
    check(c.cdp.pageErrors.length === 0, 'no page errors in the whole run', c.cdp.pageErrors.join(' | '));
  });
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
main();
