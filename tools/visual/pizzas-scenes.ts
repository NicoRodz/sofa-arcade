// The 17 Pizzas screen scenes of the visual regression test, in three independent groups (each one its own browser, so they run side by side).
// Every group drives the real screen through window.__pg (the capture hooks) and takes its shots only after advancing the fake clock by whole frames.
import { type Page, sleep } from './browser-session';
import { Phones } from './phones';

export type Shot = (name: string) => Promise<void>;
export interface Group {
  name: string;
  scenes: readonly string[];
  run(page: Page, port: number, shot: Shot): Promise<void>;
}

const has = (page: Page, sel: string) => page.eval<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`);
// the lobby builds its buttons after the first relay messages: wait for the element instead of sleeping a fixed time
async function click(page: Page, sel: string) {
  for (let i = 0; i < 200 && !(await has(page, sel)); i++) await sleep(50);
  await page.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
}
const key = (page: Page, k: string) => page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
const pg = (page: Page, expr: string) => page.eval<any>(`window.__pg.${expr}`);

async function until(page: Page, pred: (s: any) => boolean, what: string, max = 3000) {
  for (let i = 0; i < max; i++) {
    await page.frames(1);
    const s = await page.eval<any>('JSON.parse(JSON.stringify(window.__pg.snapshot()))').catch(() => null);
    if (s && pred(s)) return s;
  }
  throw new Error(`until: ${what} not reached`);
}

// Real-time waits happen with the fake clock STOPPED: window.__idle runs the page's pending frame callbacks (loaders, scene boot) at the same timestamp, so game
// time and animation phases only move when a shot asks for whole frames. The how-to card and the iris (CSS animations) are real-time: waiting for their
// end state, instead of sleeping a fixed time, is what makes the number of fake frames independent of the machine's load.
async function idleUntil(page: Page, pred: string, what: string, max = 600) {
  for (let i = 0; i < max; i++) {
    if (await page.eval<boolean>(`(() => { try { return !!(${pred}); } catch { return false; } })()`)) return;
    await page.eval('window.__idle()');
    await sleep(25);
  }
  throw new Error(`idleUntil: ${what}`);
}

// Enter on the how-to card (open, iris done) -> the iris of the round -> phase "playing" (the game is built synchronously) -> the world exists.
async function enterRound(page: Page) {
  await idleUntil(
    page,
    `!document.getElementById('howto').classList.contains('off') && getComputedStyle(document.getElementById('iris')).display === 'none'`,
    'how-to card open',
  );
  await page.eval('window.__reseed(777)'); // from here no frame callback runs until the round exists: it starts from the same random stream
  await key(page, 'Enter');
  for (let i = 0; i < 600 && (await page.eval<string>('window.__pg.snapshot().phase').catch(() => '')) !== 'playing'; i++) await sleep(25);
  await idleUntil(page, 'window.__pg.snapshot().phase === "playing" && window.__pg.snapshot().countdown > 0', 'round built');
}

async function openRoom(page: Page, port: number, room: string) {
  await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/screen/?room=${room}` });
  for (
    let i = 0;
    i < 200 && !(await page.eval<boolean>('typeof window.__pg !== "undefined" && window.__pg !== null').catch(() => false));
    i++
  )
    await sleep(50);
}

// room -> lobby with n phones -> (mode, map, difficulty) -> start -> past the countdown, with the fake clock
async function startRound(page: Page, port: number, phones: Phones, room: string, n: number, pick: string[], minTime: number) {
  await openRoom(page, port, room);
  await phones.join(n);
  await sleep(300);
  await pg(page, 'forceLobby()');
  for (const sel of pick) await click(page, sel);
  await sleep(300);
  await click(page, '#start');
  await enterRound(page);
  await until(page, (s) => s.countdown <= 0 && s.time > minTime, `countdown over and time > ${minTime}`);
}

async function versusRound(page: Page, port: number, room: string, map: string, diff: string, play: () => Promise<void>) {
  const phones = new Phones(port, room);
  try {
    await startRound(page, port, phones, room, 6, ['[data-mode="versus"]', `[data-map="${map}"]`, `[data-diff="${diff}"]`], 1500);
    await play();
  } finally {
    phones.close();
  }
}

const VERSUS_SABOTAGE: Group = {
  name: 'versus-sabotage',
  scenes: ['sab-tab-bag', 'sab-aim', 'sab-flight', 'sab-impact', 'sab-floor', 'vs-hud-vip', 'vs-timeup', 'vs-finale-1', 'vs-finale-2'],
  async run(page, port, shot) {
    await versusRound(page, port, 'DSAB', 'V1', 'normal', async () => {
      await pg(page, 'sab.give(0, 1)');
      await shot('sab-tab-bag');
      const aimer = await pg(page, 'sab.aim(0)');
      await page.frames(66);
      await shot('sab-aim');
      await pg(page, `sab.throw(${aimer})`);
      await page.frames(20);
      await shot('sab-flight');
      await page.frames(30);
      await shot('sab-impact');
      await pg(page, 'sab.trash(1, 14, 3, 0, 25000)');
      await pg(page, 'sab.give(1, 2)');
      await page.frames(40);
      await shot('sab-floor');
      await pg(page, 'setTeam(0, { score: 340, streak: 3, bestStreak: 3, vips: 1 })');
      await pg(page, 'setTeam(1, { score: 410, streak: 1 })');
      await pg(page, 'vipNow()');
      await page.frames(40);
      await shot('vs-hud-vip');
      await page.eval('window.__fakeTimers(true)'); // the results reveal is a chain of timeouts: on the fake clock
      await pg(page, 'fastForward(300)');
      await page.frames(60);
      await shot('vs-timeup');
      await page.frames(120);
      await shot('vs-finale-1');
      await page.frames(90);
      await shot('vs-finale-2');
    });
  },
};

const VERSUS_V3: Group = {
  name: 'versus-v3',
  scenes: ['vs3-hud', 'vs3-timeup', 'vs3-finale'],
  async run(page, port, shot) {
    await versusRound(page, port, 'DVS3', 'V3', 'easy', async () => {
      await pg(page, 'setTeam(0, { score: 120, streak: 4, vips: 2 })');
      await pg(page, 'vipNow()');
      await page.frames(60);
      await shot('vs3-hud');
      await page.eval('window.__fakeTimers(true)');
      await pg(page, 'fastForward(300)');
      await page.frames(100);
      await shot('vs3-timeup');
      await page.frames(200);
      await shot('vs3-finale');
    });
  },
};

const COOP: Group = {
  name: 'coop',
  scenes: ['coop-orders', 'coop-oven-cooking', 'coop-oven-done', 'coop-expire', 'coop-timeup'],
  async run(page, port, shot) {
    const phones = new Phones(port, 'DCOP');
    try {
      await openRoom(page, port, 'DCOP');
      await phones.join(4);
      await sleep(300);
      await pg(page, 'forceLobby()');
      // map 1 may sit inside a map group of the lobby: open the group that holds it
      for (const to of [null, 'plain', 'taller', 'series']) {
        if (to && !(await has(page, `[data-map="group"][data-to="${to}"]`))) continue;
        if (to) {
          await click(page, `[data-map="group"][data-to="${to}"]`);
          await sleep(300);
        }
        if (await has(page, '[data-map="1"]')) {
          await click(page, '[data-map="1"]');
          break;
        }
        if (to) await click(page, '[data-map="group"][data-to="classic"]');
      }
      await click(page, '[data-diff="easy"]');
      await sleep(300);
      await click(page, '#start');
      await enterRound(page);
      await until(page, (s) => s.countdown <= 0 && s.time > 12000, 'countdown over and time > 12000');
      const counters = await pg(page, 'kit.counters()');
      const pot = counters.find((x: any) => x.kind === 'pot');
      const plain = counters.filter((x: any) => x.kind === 'counter');
      await shot('coop-orders');
      await pg(page, `kit.bake(${pot.i}, [0, 1], false, 0.5)`);
      if (plain[0]) await pg(page, `kit.setItem(${plain[0].i}, 'dishQ')`);
      await page.frames(30);
      await shot('coop-oven-cooking');
      await pg(page, `kit.bake(${pot.i}, [0, 1], false, 1)`);
      await page.frames(30);
      await shot('coop-oven-done');
      await pg(page, `kit.age(${pot.i}, 100)`);
      await pg(page, 'forceExpire()');
      await page.frames(60);
      await shot('coop-expire');
      await page.eval('window.__fakeTimers(true)');
      await pg(page, 'fastForward(300)');
      await page.frames(60);
      await shot('coop-timeup');
    } finally {
      phones.close();
    }
  },
};

export const GROUPS: readonly Group[] = [VERSUS_SABOTAGE, VERSUS_V3, COOP];
