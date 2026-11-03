// Every event announced on the TV also buzzes every phone (colour on the screen and vibration): nothing changes in the round without calling for attention.
import type { ClientMsg } from '@pichi/core';
import type { ManchazoState } from '../../sim';

type BuzzMsg = Extract<ClientMsg, { t: 'buzz' }>;

export function createEventAlert(send: (m: BuzzMsg) => void, playerOf: (slot: number) => number | undefined) {
  let seen = 0;
  let lastClock: string | undefined;
  let hits = 0; // F8b: effects that landed (a contagion pass, a balloon, a jump of furniture)
  return {
    /** After every frame; `s` null (no round) resets. Sends one alert per phone for each new announcement. */
    sync(s: ManchazoState | null) {
      const n = s?.match.ev?.log.length ?? 0;
      const fx = s?.match.ev?.plus?.fx ?? 0;
      if (!s || n < seen) {
        seen = n;
        hits = fx;
        lastClock = s?.match.ev?.clock.phase;
        return;
      }
      if (fx > hits)
        for (const b of s.grid.bodies) {
          const id = playerOf(b.slot);
          if (id !== undefined) send({ t: 'buzz', playerId: id, kind: 'big' }); // it hit: a longer buzz than the announcement's
        }
      hits = fx;
      if (n > seen) {
        const act = s.match.ev!.log.slice(seen).some((a) => a.kind === 'phaseScramble' || a.kind === 'phaseFinal'); // F9: the act changed (not its warning): a louder notice
        for (const b of s.grid.bodies) {
          const id = playerOf(b.slot);
          if (id !== undefined) send({ t: 'buzz', playerId: id, kind: act ? 'phase' : 'alert' });
        }
      }
      seen = n;
      const clock = s.match.ev?.clock.phase;
      if (clock === 'live' && lastClock !== 'live')
        for (const b of s.grid.bodies) {
          const id = playerOf(b.slot);
          if (id !== undefined) send({ t: 'buzz', playerId: id, kind: 'hourglass' }); // F9: the Hourglass is up for dispute (its warning was the alert above)
        }
      lastClock = clock;
    },
  };
}
