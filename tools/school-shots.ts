// Cocina escuela, end to end in headless Chrome: the REAL screen (page A, 1920x1080) and a REAL phone (page B, 844x390 mobile) plus bot phones on websockets, driven through the
// whole flow: lobby -> "A cocinar" offers the school -> four steps (a capture of the TV and of the phone at each) -> "todos listos" -> the round's how-to card; then the lobby button
// (P), Enter to skip, the memory (no second offer), versus, and eight players.
// usage: npx tsx tools/school-shots.ts <outDir>      (PG_PORT 5100 / PG_CDP 9791 by default; static mode: run `npm run build` first)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../apps/server/src/server';
import { SCHOOL_TOTAL } from '@pichi/game-pizzas/sim/school';
import { launchHeadlessChrome } from './proc/headless-chrome';
import { killTree } from './proc/kill-tree';
import { Rig, sleep, type Page } from './school-shots-kit';

const PORT = Number(process.env.PG_PORT ?? 5100),
  CDP = Number(process.env.PG_CDP ?? 9791);
const out = path.resolve(process.argv[2] ?? 'docs/school');
mkdirSync(out, { recursive: true });

const howtoOpen = (r: Rig) => r.tv.eval<boolean>("!document.getElementById('howto').classList.contains('off')");

// ---- Scenario 1: 4 players, the school offered by "A cocinar" ------------------------------------------------------------------------------------------------
async function offerSchool(r: Rig): Promise<{ ph: Page; meId: number }> {
  const { tv, dbg, click, until, phaseOf } = r;
  const room = 'SCHL';
  await r.openRoom(room);
  const ph = await r.phoneOpen(room, 'Nico');
  await r.joinBots(room, ['Angi', 'Pablo', 'Mati']);
  await tv.eval('window.__pg.forceLobby()');
  await sleep(800);
  await tv.shot('01-lobby');
  await ph.shot('01-phone-lobby');
  await click('#start'); // "A cocinar": the first of this room, nobody has done it: the school takes over
  await until(async () => (await phaseOf()) === 'school', 'phase school');
  await sleep(1200);
  // Nico's player id: the one that is not a bot
  const ids = (await dbg()).rows.map((row) => row.id);
  const meId = ids.find((i) => !r.bots.some((b) => b.id === i))!;
  console.log('phase:', await phaseOf(), '| rows:', JSON.stringify((await dbg()).rows));
  await tv.shot('02-tv-step1-start');
  await ph.shot('02-phone-step1-start');
  return { ph, meId };
}

// the bots and Nico's phone play the four steps; a capture of the TV and the phone at each
async function playSteps(r: Rig, ph: Page, meId: number) {
  const { tv, dbg, until } = r;
  r.drive(ph, { id: meId });
  let shotStep = 0;
  await until(
    async () => {
      const d = await dbg();
      const me = d.rows.find((row) => row.id === meId);
      if (me && me.step > shotStep && me.step < SCHOOL_TOTAL) {
        shotStep = me.step;
        await sleep(450);
        await tv.shot(`0${2 + shotStep}-tv-step${shotStep + 1}`);
        await ph.shot(`0${2 + shotStep}-phone-step${shotStep + 1}`);
      }
      return !!me && me.step >= SCHOOL_TOTAL;
    },
    'Nico done',
    90_000,
  );
  await sleep(500);
  await tv.shot('06-tv-nico-done');
  await ph.shot('06-phone-nico-done');
  await until(async () => (await dbg()).everyoneDone, 'everyone done', 90_000);
  await sleep(500);
  await tv.shot('07-tv-all-done');
  await ph.shot('07-phone-all-done');
  r.stopDrive();
}

// the school ends by itself: the how-to card, the memory (TV and phone), and the round runs
async function afterSchool(r: Rig, ph: Page) {
  const { tv, dbg, until, phaseOf, key } = r;
  await until(async () => !(await dbg()).on, 'school ended by itself', 15_000);
  await sleep(1500);
  console.log('after the school: phase', await phaseOf(), '| how-to card open:', await howtoOpen(r), '| remembered:', (await dbg()).done);
  await tv.shot('08-tv-howto-after-school');
  console.log(
    'phone remembered it (localStorage):',
    await ph.eval(`Object.keys(localStorage).filter((k) => k.startsWith('pg.school.')).join(',')`),
  );
  await key('Enter'); // skip the how-to card: the countdown starts, the round runs
  await sleep(2600);
  console.log('the round runs after the school: phase', await phaseOf());
  await tv.shot('09-tv-round-after-school');
  r.closeBots();
  ph.send('Page.close').catch(() => {});
}

// ---- Scenario 2: the room remembers (no second offer), P opens it by hand, Enter skips it ------------------------------------------------------------------------
async function rememberAndSkip(r: Rig) {
  const { tv, dbg, click, until, phaseOf, key } = r;
  const room2 = 'SCH2';
  await r.openRoom(room2);
  await r.joinBots(room2, ['Ana', 'Beto']);
  await tv.eval('window.__pg.forceLobby()');
  await sleep(600);
  await key('p'); // by hand, from the lobby
  await until(async () => (await phaseOf()) === 'school', 'P opens the school');
  await sleep(900);
  console.log('opened by hand: origin =', (await dbg()).origin);
  await tv.shot('10-tv-school-two-players');
  await key('Enter'); // Enter skips it for everyone
  await sleep(2200);
  console.log('after Enter in the school: phase', await phaseOf(), '| remembered:', (await dbg()).done);
  await click('#start');
  await sleep(2200);
  console.log(
    '"A cocinar" after that goes to the how-to card, not the school again: phase',
    await phaseOf(),
    '| howto open:',
    await howtoOpen(r),
  );
  await key('Enter');
  await sleep(300);
  r.closeBots();
}

// versus: teams together
async function versusSchool(r: Rig) {
  const { tv, click, until, phaseOf, key } = r;
  const room3 = 'SCH3';
  await r.openRoom(room3);
  await r.joinBots(room3, ['Ana', 'Beto', 'Caro', 'Dani']);
  await tv.eval('window.__pg.forceLobby()');
  await sleep(500);
  await click('[data-mode="versus"]');
  await sleep(900);
  await tv.shot('11-tv-lobby-versus');
  await click('#start');
  await until(async () => (await phaseOf()) === 'school', 'versus school');
  await sleep(1500);
  await tv.shot('12-tv-school-versus-together');
  await key('Enter');
  await sleep(1800);
  r.closeBots();
}

// eight players
async function eightPlayers(r: Rig) {
  const { tv, dbg, click, until, phaseOf } = r;
  const room4 = 'SCH4';
  await r.openRoom(room4);
  await r.joinBots(room4, ['Ana', 'Beto', 'Caro', 'Dani', 'Eli', 'Fer', 'Gus', 'Hana']);
  await tv.eval('window.__pg.forceLobby()');
  await sleep(500);
  await click('#start');
  await until(async () => (await phaseOf()) === 'school', '8-player school');
  await sleep(1200);
  r.drive(null, { id: -1 });
  await sleep(9000);
  await tv.shot('13-tv-school-eight-players');
  await until(async () => (await dbg()).everyoneDone, 'eight players done', 120_000);
  await sleep(600);
  await tv.shot('14-tv-school-eight-done');
  r.stopDrive();
}

async function main() {
  const srv = await startServer({ port: PORT, mode: 'static' });
  const profile = mkdtempSync(path.join(tmpdir(), 'pg-school-chrome-'));
  const { chrome, dog } = launchHeadlessChrome(CDP, profile, Number(process.env.MAX_MS ?? 270_000));
  const r = new Rig({ port: PORT, cdp: CDP, out });
  try {
    await r.openTv();
    const { ph, meId } = await offerSchool(r);
    await playSteps(r, ph, meId);
    await afterSchool(r, ph);
    await rememberAndSkip(r);
    await versusSchool(r);
    await eightPlayers(r);
    if (r.pages.some((p) => p.errors.length))
      console.error(
        'PAGE ERRORS',
        r.pages.flatMap((p) => p.errors),
      );
    console.log('captures in', out);
  } finally {
    r.timers.forEach(clearInterval);
    for (const b of r.bots) b.ws.close();
    clearTimeout(dog);
    await killTree(chrome);
    await srv.close();
    process.exit(0);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
