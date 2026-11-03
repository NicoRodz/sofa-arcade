import { sleep } from '../../config';
import type { Ctx } from '../../session';
import { startRound } from '../manchazo-sabotage';

// Manchazo top feed: the TV at 3840x2160 with sabotages TAKEN and then USED, so the strip over the board has something to say. Shots (SHOT_PREFIX, default `topfeed`):
// `-1-took` (one card in a hand of each team), `-2-used` (both played), `-3-mixed` (one team plays while the other takes), `-4-others` (the other five kinds, taken) and
// `-5-others-used`. `window.__pg.manchazoGive` puts the card in the hand (the feed sees a hand fill up, like a pickup); button 2 plays it.
const SETS = [
  {
    took: [
      ['fan', 'dizzy'],
      ['tape', 'ink'],
    ],
  },
  {
    took: [
      ['roller', 'sponge'],
      ['glue', 'swap'],
    ],
  },
] as const;

export async function runManchazoTopFeedTv(ctx: Ctx) {
  const { cdp, bots } = ctx;
  const prefix = process.env.SHOT_PREFIX ?? 'topfeed';
  await startRound(ctx, 'MNTF', 8, true, '2·00103');
  await sleep(4500); // the archetype banner goes away
  const call = <T>(fn: string, ...args: unknown[]) => cdp.eval<T>(`window.__pg.${fn}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  const teams = await call<{ slot: number; team: number }[]>('manchazoTeams');
  const of = (t: number) => teams.filter((x) => x.team === t).map((x) => x.slot);
  const [o, b] = [of(0), of(1)];
  await call('manchazoPaint', 0, 0, 2, 11, 12);
  await call('manchazoPaint', 1, 15, 2, 26, 12);
  await sleep(2500);
  const give = (set: (typeof SETS)[number], i: number) => {
    call('manchazoGive', o[i], set.took[0]![i]);
    call('manchazoGive', b[i], set.took[1]![i]);
  };
  const play = (...slots: (number | undefined)[]) => slots.forEach((s) => bots[s!]!.b++);
  const wait = () => sleep(Number(process.env.WAIT_MS ?? 450));
  give(SETS[0], 0);
  await wait();
  await cdp.shot(`${prefix}-1-took`);
  play(o[0], b[0]);
  await wait();
  await cdp.shot(`${prefix}-2-used`);
  await sleep(4500); // the strip empties
  give(SETS[0], 1);
  await sleep(1800);
  play(o[1]);
  await call('manchazoGive', b[2], 'footprints');
  await wait();
  await cdp.shot(`${prefix}-3-mixed`);
  await sleep(4500);
  give(SETS[1], 0);
  await wait();
  await cdp.shot(`${prefix}-4-others`);
  play(o[0], b[0]);
  await wait();
  await cdp.shot(`${prefix}-5-others-used`);
  await sleep(4500);
  give(SETS[1], 1);
  await sleep(1500);
  play(o[1], b[1]);
  await wait();
  await cdp.shot(`${prefix}-6-others-used-2`);
}
