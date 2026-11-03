import { PORT, sleep } from '../../config';
import type { Ctx } from '../../session';

// Manchazo archetypes: the TV at 3840x2160 on the map of ARCHETYPE_SEED (a seed code, default an Islas map). Two pictures: the archetype's banner a few ticks into the
// round (`<SHOT>-banner`, the banner is up for 90 ticks) and the bare floor 3 s later (`<SHOT>-board`). The phones stay put. Run it once per seed.
export async function runManchazoArchetypeTv({ cdp, bots, join, waitFor, click }: Ctx) {
  const room = 'MNAR';
  const shot = process.env.SHOT ?? 'manchazo-archetype';
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    mobile: false,
    screenWidth: 1920,
    screenHeight: 1080,
  });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/screen/?room=${room}&soon=1&render=2` });
  await sleep(2500);
  await join(room, 8, [], { menu: true });
  const key = (k: string) => cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)} }))`);
  for (let i = 0; i < 4; i++) {
    const m = await cdp.eval<{ sel: number; cards: string[] }>('window.__pg.menu()');
    if (m.cards[m.sel]?.startsWith('arena:')) break;
    await key('ArrowRight');
    await sleep(150);
  }
  await key('Enter');
  await sleep(2200);
  await cdp.eval(`window.__pg.manchazoNextMapSeed(${JSON.stringify(process.env.ARCHETYPE_SEED ?? '4·01AN4')})`);
  await click('#start');
  await sleep(1500);
  await key('Enter');
  await waitFor((s) => s.phase === 'playing', 15_000);
  bots.forEach((b) => {
    b.vec = { x: 0.01, y: 0 };
    b.startSending();
  });
  await sleep(Number(process.env.WAIT_MS ?? 500));
  await cdp.shot(`${shot}-banner`);
  await sleep(3000);
  await cdp.shot(`${shot}-board`);
}
