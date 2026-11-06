// A5 part S2: the map of Mundos 1-3 and the new levels played over the real stack. The real server (data folder in a temp dir, seeded with an expedition), the real screen in headless
// Chrome and two bots that are real phones on websockets.
//   scenario A: Playa and Bosque cleared up to 2-5 -> hub -> Continuar -> map of the three worlds (screenshots) -> 2-6 (soft enemies, Libres) played by the bots.
//   scenario B: ... up to 3-1 -> Continuar -> map of Glaciar -> 3-2 (wind) played by the bots.
//   quick match: none of the campaign levels is reachable outside the campaign hub and map (the Partida rápida lobby lists none of them).
// usage: npx tsx tools/camp/camp-w23.ts [outDir]    env: PORT (4800) CDP (9770)
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../../apps/server/src/server';
import { LEVELS } from '@pichi/game-obstaculos/levels';
import { CAMPAIGN, CAMPAIGN_CATALOG, applyResult, fullMask, newExpedition, type Expedition } from '@pichi/game-obstaculos/campaign';
import { killTree } from '../proc/kill-tree';
import { check, connectScreen, launchChrome, ScreenDriver, sleep } from './camp-kit';

const PORT = Number(process.env.PORT ?? 4800),
  CDP = Number(process.env.CDP ?? 9770);
const outDir = path.resolve(process.argv[2] ?? 'docs/screens/camp-w23');
mkdirSync(outDir, { recursive: true });

// An expedition that cleared every level up to and including `upTo` (perfect runs).
function seeded(upTo: string, name: string, now: number): Expedition {
  let e = newExpedition(`exp-${name}`, 'Nico y Angi', now);
  let t = now;
  for (const l of CAMPAIGN) {
    if (l.status !== 'built') continue;
    e = applyResult(e, CAMPAIGN_CATALOG, { levelId: l.id, cleared: true, timeMs: 40_000, collectiblesMask: fullMask(3), deaths: 0 }, ++t);
    if (l.id === upTo) break;
  }
  return e;
}

type Scenario = { d: ScreenDriver; tag: string; play: string; dataDir: string; exp: Expedition };

// the hub offers Continuar; Continuar opens the map
async function stepHubToMap({ d, tag, play }: Scenario) {
  const { c, camp, waitFor } = d;
  const label = await c.eval<string>(`document.querySelector('#campaign [data-hub="continue"]')?.getAttribute('data-label') ?? ''`);
  console.log(`[${tag}] Continuar label:`, label);
  check(label.includes(CAMPAIGN.find((l) => l.id === play)!.id.replace('-', '-')) || label.length > 0, `[${tag}] the hub offers Continuar`);
  await c.shot(`${tag}-hub`);
  await c.eval(`document.querySelector('#campaign [data-hub="continue"]').click()`);
  await waitFor(async () => (await camp()).state.view === 'map', 'map view');
  await sleep(700);
}

// ArrowUp/ArrowDown change the world, ArrowLeft/ArrowRight the node
async function gotoWorld({ d }: Scenario, w: string) {
  for (let i = 0; i < 6 && (await d.camp()).state.world !== w; i++) {
    await d.key((await d.camp()).state.world < w ? 'ArrowDown' : 'ArrowUp');
    await sleep(350);
  }
}

// the map of each world, one screenshot each
async function stepWorldMaps(s: Scenario, worldsToShoot: string[]) {
  const { c } = s.d;
  for (const w of worldsToShoot) {
    await gotoWorld(s, w);
    await sleep(500);
    const name = await c.eval<string>(`document.querySelector('#campaign .cname')?.textContent ?? ''`);
    const nodes = await c.eval<number>(`document.querySelectorAll('#campaign .cnode').length`);
    console.log(`[${s.tag}] world ${w}: nodes ${nodes}, header "${name}"`);
    check(nodes >= 7, `[${s.tag}] the map of world ${w} shows its 7 levels (+ summit when open)`);
    await c.shot(`${s.tag}-map-w${w}`);
  }
}

// back on the world of the level to play, cursor on it, Enter, and the bots start
async function stepStartLevel(s: Scenario) {
  const { d, tag, play } = s;
  await gotoWorld(s, play.split('-')[0]!);
  const target = Number(play.split('-')[1]) - 1;
  for (let i = 0; i < 12 && (await d.camp()).state.node !== target; i++) {
    await d.key((await d.camp()).state.node < target ? 'ArrowRight' : 'ArrowLeft');
    await sleep(250);
  }
  check((await d.camp()).state.node === target, `[${tag}] cursor on ${play}`);
  await d.key('Enter');
  await d.waitFor(async () => (await d.phase()) === 'playing' && (await d.camp()).run === play, `playing ${play}`);
  d.startBots();
}

// the bots clear the level; the server saved it; the results panel is up
async function stepBotsClear({ d, tag, play, dataDir, exp }: Scenario) {
  const { c, camp, phase, waitFor } = d;
  await sleep(9000);
  await c.shot(`${tag}-playing-${play}`);
  await waitFor(
    async () => {
      const k = await camp();
      return k.outcome?.levelId === play && !!k.outcome?.cleared;
    },
    `the bots clear ${play}`,
    200_000,
  );
  const o = (await camp()).outcome;
  console.log(
    `[${tag}] outcome`,
    JSON.stringify({ levelId: o.levelId, stars: o.after.stars, timeMs: o.timeMs, next: o.next?.id, saved: o.saved }),
  );
  check(o.levelId === play && o.cleared && o.saved, `[${tag}] ${play} cleared and saved`);
  const onDisk = JSON.parse(readFileSync(path.join(dataDir, `${exp.id}.json`), 'utf8'));
  check(onDisk.levels[play]?.done === true, `[${tag}] the server wrote ${play} as done`);
  await waitFor(async () => (await phase()) === 'results', 'results phase', 30_000);
  await sleep(1800);
  await c.shot(`${tag}-result-${play}`);
  d.stopBots();
}

// quick match: leave to the hub and open the Partida rápida lobby; none of the campaign levels shows up there
async function stepQuickMatch({ d }: Scenario) {
  const { c, camp, phase, key, waitFor } = d;
  await key('Escape');
  await waitFor(async () => (await phase()) === 'lobby' && (await camp()).state.view === 'map', 'back on the map');
  await key('Escape');
  await waitFor(async () => (await camp()).state.view === 'hub', 'hub');
  await sleep(900);
  const quickNames = new Set(LEVELS.map((l) => l.name)); // 3-5 shares its plan name "Grietas" with the quick match's l11: that one is legitimately in the lobby
  const names = CAMPAIGN.filter((l) => l.status === 'built' && !quickNames.has(l.name)).map((l) => l.name);
  await c.eval(`document.querySelector('#campaign [data-hub="quick"]').click()`);
  await sleep(1200);
  const text = await c.eval<string>('document.body.innerText');
  const leaked = names.filter((n) => text.includes(n));
  check(
    leaked.length === 0,
    `quick match lobby lists no campaign level (${names.length} names checked, leaked: ${leaked.join(', ') || 'none'})`,
  );
  await c.shot('quick-lobby');
}

async function runScenario(d: ScreenDriver, dirs: string[], tag: string, upTo: string, play: string, worldsToShoot: string[]) {
  const dataDir = mkdtempSync(path.join(tmpdir(), `pg-w23-${tag}-`));
  dirs.push(dataDir);
  const exp = seeded(upTo, `w23${tag.toLowerCase()}0001`, 1_000_000);
  writeFileSync(path.join(dataDir, `${exp.id}.json`), JSON.stringify(exp));
  const srv = await startServer({ port: PORT, mode: 'static', dataDir });
  const s: Scenario = { d, tag, play, dataDir, exp };
  try {
    await d.enterLobby();
    await d.c.eval('localStorage.clear()');
    await stepHubToMap(s);
    await stepWorldMaps(s, worldsToShoot);
    await stepStartLevel(s);
    await stepBotsClear(s);
    if (tag === 'A') await stepQuickMatch(s);
    if (d.c.errors.length) {
      console.log('PAGE ERRORS:', d.c.errors.slice(0, 6).join('\n'));
      process.exitCode = 1;
    }
  } finally {
    d.stopBots();
    d.closePhones();
    d.phones = [];
    await srv.close();
  }
}

async function main() {
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-w23-chrome-'));
  const { chrome, dog } = launchChrome(CDP, profile, 600_000);
  let d: ScreenDriver | null = null;
  const dirs: string[] = [];
  try {
    d = new ScreenDriver(await connectScreen(CDP, outDir), { port: PORT, room: 'W23', tokenPrefix: 'w23' });
    await runScenario(d, dirs, 'A', '2-5', '2-6', ['1', '2', '3']);
    await runScenario(d, dirs, 'B', '3-1', '3-2', ['3']);
  } catch (e) {
    console.error('W23 FAILED', e);
    console.error('page errors:', d?.c.errors.slice(0, 6));
    process.exitCode = 1;
  } finally {
    d?.stopBots();
    d?.closePhones();
    await killTree(chrome);
    clearTimeout(dog);
    for (const x of dirs) rmSync(x, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
    process.exit(process.exitCode ?? 0);
  }
}
main();
