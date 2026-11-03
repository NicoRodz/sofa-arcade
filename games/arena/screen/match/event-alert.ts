// Every event announced on the TV also buzzes every phone (colour on the screen and vibration): nothing changes in the round without calling for attention.
import type { ClientMsg } from '@pichi/core';
import type { ManchazoState } from '../../sim';

type BuzzMsg = Extract<ClientMsg, { t: 'buzz' }>;

export function createEventAlert(send: (m: BuzzMsg) => void, playerOf: (slot: number) => number | undefined) {
  let seen = 0;
  let hits = 0; // F8b: effects that landed (a contagion pass, a balloon, a jump of furniture)
  return {
    /** After every frame; `s` null (no round) resets. Sends one alert per phone for each new announcement. */
    sync(s: ManchazoState | null) {
      const n = s?.match.ev?.log.length ?? 0;
      const fx = s?.match.ev?.plus?.fx ?? 0;
      if (!s || n < seen) {
        seen = n;
        hits = fx;
        return;
      }
      if (fx > hits)
        for (const b of s.grid.bodies) {
          const id = playerOf(b.slot);
          if (id !== undefined) send({ t: 'buzz', playerId: id, kind: 'big' }); // it hit: a longer buzz than the announcement's
        }
      hits = fx;
      if (n > seen)
        for (const b of s.grid.bodies) {
          const id = playerOf(b.slot);
          if (id !== undefined) send({ t: 'buzz', playerId: id, kind: 'alert' });
        }
      seen = n;
    },
  };
}
