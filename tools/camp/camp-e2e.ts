// End to end of the campaign: the real server (data folder in a temp dir), the real screen in headless Chrome and two bots that are real phones on websockets.
//   hub (nothing yet) -> Nueva expedición -> map -> 1-1 played by the bots -> results -> server restart -> reload -> "Continuar" offers 1-2.
// usage: npx tsx tools/camp/camp-e2e.ts [outDir]    env: PORT (4400) CDP (9730)
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../../apps/server/src/server';
import { killTree } from '../proc/kill-tree';
import { check, connectScreen, launchChrome, ScreenDriver, sleep } from './camp-kit';

const PORT = Number(process.env.PORT ?? 4400),
  CDP = Number(process.env.CDP ?? 9730);
const outDir = path.resolve(process.argv[2] ?? 'docs/screens/camp');
mkdirSync(outDir, { recursive: true });

type Srv = Awaited<ReturnType<typeof startServer>>;
type E2e = { d: ScreenDriver; dataDir: string; srv: Srv; expId: string };

const onDisk = (s: E2e) => JSON.parse(readFileSync(path.join(s.dataDir, `${s.expId}.json`), 'utf8'));
const count = (s: E2e, sel: string) => s.d.c.eval<number>(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const selClass = (s: E2e) => s.d.c.eval<string>(`document.querySelector('#campaign .cnode.sel')?.className ?? ''`);

// 1. the hub with nothing saved: no "Continuar"
async function stepEmptyHub(s: E2e) {
  check((await count(s, '#campaign [data-hub="continue"]')) === 0, 'hub without expeditions has no Continuar');
  await s.d.c.shot('hub-empty');
}

// 2. Nueva expedición -> the map
async function stepNewExpedition(s: E2e) {
  const { c, camp, text, waitFor } = s.d;
  await c.eval(`document.querySelector('#campaign [data-hub="new"]').click()`);
  await waitFor(async () => (await camp()).state.view === 'map', 'map view');
  await sleep(600);
  s.expId = (await camp()).expId as string;
  check(/^exp-/.test(s.expId), `expedition created on the server (${s.expId})`);
  check((await text('#campaign .cname')) === 'Nico y Angi', 'the expedition is named after the players');
  await c.shot('map-new');
}

// 3. 1-1: the bots play it
async function stepPlay11(s: E2e) {
  const { c, camp, phase, text, key, waitFor } = s.d;
  await key('Enter');
  await waitFor(async () => (await phase()) === 'playing', 'playing');
  s.d.startBots();
  await waitFor(async () => !!(await camp()).outcome?.cleared, 'the bots clear 1-1', 120_000);
  const o = (await camp()).outcome;
  console.log('outcome', JSON.stringify({ levelId: o.levelId, stars: o.after.stars, next: o.next?.id, saved: o.saved }));
  check(o.levelId === '1-1' && o.cleared && o.saved, 'level 1-1 cleared and saved');
  check(o.next?.id === '1-2', 'Siguiente offers 1-2');
  check(onDisk(s).levels['1-1']?.done === true, 'the server wrote 1-1 as done (before the banners ended)');
  await waitFor(async () => (await phase()) === 'results', 'results phase', 30_000);
  await sleep(1800);
  await c.shot('result-1-1');
  check((await text('#campres .rtitle')) === '¡Nivel completado!', 'results panel is the campaign one');
  check((await count(s, '#campres .rbtn')) === 3, 'three buttons: Siguiente, Repetir, Mapa');
}

// 3b. Siguiente: the bots play 1-2 (Encadenados, with the campaign's longer rope)
async function stepPlay12(s: E2e) {
  const { c, camp, phase, key, waitFor } = s.d;
  await key('Enter');
  await waitFor(async () => {
    const k = await camp();
    return (await phase()) === 'playing' && k.run === '1-2';
  }, 'playing 1-2');
  await waitFor(
    async () => {
      const k = await camp();
      return k.outcome?.levelId === '1-2' && !!k.outcome?.cleared;
    },
    'the bots clear 1-2',
    150_000,
  );
  check(onDisk(s).levels['1-2']?.done === true, 'the server wrote 1-2 as done');
  await waitFor(async () => (await phase()) === 'results', 'results of 1-2', 30_000);
  await sleep(1500);
  await c.shot('result-1-2');
}

// 4. Esc = Mapa: the cursor is on the next open level
async function stepEscToMap(s: E2e) {
  const { c, camp, phase, key, waitFor } = s.d;
  await key('Escape');
  await waitFor(async () => (await phase()) === 'lobby' && (await camp()).state.view === 'map', 'back on the map');
  await sleep(800);
  check(/open/.test(await selClass(s)), 'the cursor sits on the next open level (1-3)');
  await c.shot('map-after-1-1');
  s.d.stopBots();
}

// 5. the server stops and comes back on the same folder; the page is reloaded (a fresh screen); Continuar offers 1-2
async function stepRestartAndContinue(s: E2e) {
  const { c, camp, attr, waitFor } = s.d;
  s.d.closePhones();
  await s.srv.close();
  s.srv = await startServer({ port: PORT, mode: 'static', dataDir: s.dataDir });
  await s.d.enterLobby();
  const label = await attr('#campaign [data-hub="continue"]', 'data-label');
  console.log('Continuar label:', label);
  check(/^Continuar · Nico y Angi · Playa 1-3 · \d+★$/.test(label), 'after the restart Continuar offers Playa 1-3 with the group name');
  await c.shot('hub-continue');
  await c.eval(`document.querySelector('#campaign [data-hub="continue"]').click()`);
  await waitFor(async () => (await camp()).state.view === 'map', 'map after Continuar');
  await sleep(600);
  check((await selClass(s)).includes('open'), 'Continuar opens the map on the open level');
  await c.shot('map-continue');
}

// 5b. the practice room: 8 stations, the ones of the levels already reached open
async function stepPractice(s: E2e) {
  const { c, camp, phase, key, waitFor } = s.d;
  s.d.startBots(); // the phones are new after the reload
  await key('Escape');
  await waitFor(async () => (await camp()).state.view === 'hub', 'hub for the practice room');
  await sleep(900); // the hub reloads its list after leaving; clicks wait for it
  await c.eval(`document.querySelector('#campaign [data-hub="practice"]').click()`);
  await waitFor(async () => (await camp()).state.view === 'practice', 'practice view');
  await sleep(500);
  check((await count(s, '#campaign [data-station]')) === 8, 'the practice room lists 8 stations');
  check(
    (await count(s, '#campaign [data-station]:not(.dis)')) === 5,
    'five stations are open after 1-1 and 1-2 (1-3 is reached, its tower station opens)',
  );
  await c.shot('practice');
  await key('Enter'); // Mover
  await waitFor(async () => (await phase()) === 'playing' && (await camp()).run === 'p-move', 'playing the station');
  await waitFor(
    async () => {
      const k = await camp();
      return k.outcome?.levelId === 'p-move' && !!k.outcome?.cleared;
    },
    'the bots clear the station',
    90_000,
  );
  check(onDisk(s).levels['p-move'] === undefined, 'the practice saved nothing');
  await waitFor(async () => (await phase()) === 'results', 'practice results', 30_000);
  await sleep(1200);
  await c.shot('practice-result');
  await key('Escape');
  await waitFor(async () => (await phase()) === 'lobby' && (await camp()).state.view === 'practice', 'back on the stations');
  await key('Escape');
  await waitFor(async () => (await camp()).state.view === 'hub', 'hub again after the practice');
}

// 6. reset: "?" arms it, OK before 3 s is refused, OK after 3 s sends it to the trash
async function stepReset(s: E2e) {
  const { c, camp, key, waitFor } = s.d;
  await sleep(500);
  for (let i = 0; i < 4; i++) {
    await key('ArrowUp');
    await sleep(150);
  } // back on Continuar
  await key('h');
  await sleep(500);
  check((await camp()).state.resetArmedAt !== null, "the Captain's ? arms the reset");
  await key('Enter');
  await sleep(400);
  check(readdirSync(s.dataDir).includes(`${s.expId}.json`), 'OK before 3 s does not reset');
  await c.shot('reset-armed');
  await sleep(3000);
  await key('Enter');
  await waitFor(async () => !readdirSync(s.dataDir).includes(`${s.expId}.json`), 'the file left the data folder', 8000);
  check(
    readdirSync(path.join(s.dataDir, 'trash')).some((f) => f.startsWith(s.expId)),
    'the reset expedition is in the trash',
  );
  await waitFor(async () => (await count(s, '#campaign [data-hub="continue"]')) === 0, 'the hub drops Continuar', 5000).catch(() => {});
  check((await count(s, '#campaign [data-hub="continue"]')) === 0, 'the hub no longer offers Continuar');
  await c.shot('hub-after-reset');
}

async function main() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'pg-camp-e2e-'));
  const srv = await startServer({ port: PORT, mode: 'static', dataDir });
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-camp-chrome-'));
  const { chrome, dog } = launchChrome(CDP, profile, 420_000);
  let s: E2e | null = null;
  let d: ScreenDriver | null = null;
  try {
    d = new ScreenDriver(await connectScreen(CDP, outDir), { port: PORT, room: 'CAMP', tokenPrefix: 'camp' });
    s = { d, dataDir, srv, expId: '' };
    await d.enterLobby();
    await d.c.eval('localStorage.clear()');
    await stepEmptyHub(s);
    await stepNewExpedition(s);
    await stepPlay11(s);
    await stepPlay12(s);
    await stepEscToMap(s);
    await stepRestartAndContinue(s);
    await stepPractice(s);
    await stepReset(s);
    if (d.c.errors.length) {
      console.log('PAGE ERRORS:', d.c.errors.slice(0, 6).join('\n'));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('E2E FAILED', e);
    console.error('page errors:', d?.c.errors.slice(0, 6));
    process.exitCode = 1;
  } finally {
    d?.stopBots();
    d?.closePhones();
    await killTree(chrome);
    clearTimeout(dog);
    await (s?.srv ?? srv).close();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
    process.exit(process.exitCode ?? 0);
  }
}
main();
