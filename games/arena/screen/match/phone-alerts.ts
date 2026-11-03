// F9: what shakes one phone in the round, besides the label of its buttons (phone-hints.ts) and the announcements of the TV (event-alert.ts). The phone answers each kind with
// a colour, a tone and a vibration (games/arena/controller): you were stained, a teammate freed you, your card fell on the floor, and (for the rescuers) the glow of the rescue.
// Every one is an EVENT read from the sim's state (a stun that began, a new line of the rescue log, a glow that rose), never a timer of its own: a frame that skips ticks still sees it.
import type { ClientMsg } from '@pichi/core';
import type { ManchazoState } from '../../sim';

type BuzzMsg = Extract<ClientMsg, { t: 'buzz' }>;

export function createPhoneAlerts(send: (m: BuzzMsg) => void, playerOf: (slot: number) => number | undefined) {
  let stunned: boolean[] = [];
  let glowed: number[] = [];
  let seen = 0; // lines of the rescue log already read
  return {
    /** After every frame; `s` null (no round) forgets everything. */
    sync(s: ManchazoState | null) {
      if (!s) {
        stunned = [];
        glowed = [];
        seen = 0;
        return;
      }
      const bodies = s.grid.bodies;
      const log = s.match.res?.log ?? [];
      if (log.length < seen || stunned.length !== bodies.length) {
        stunned = bodies.map(() => false); // a new round
        glowed = bodies.map(() => 0);
        seen = 0;
      }
      const fresh = log.slice(seen);
      seen = log.length;
      const freed = new Set(fresh.filter((e) => e.kind === 'rescue').map((e) => e.body));
      const dropped = new Set(fresh.filter((e) => e.kind === 'drop').map((e) => e.body));
      bodies.forEach((b, i) => {
        const id = playerOf(b.slot);
        const now = s.match.bodies[i]!.stun > 0;
        const glow = s.match.res?.glow[i] ?? 0;
        if (id !== undefined) {
          const tell = (kind: BuzzMsg['kind']) => send({ t: 'buzz', playerId: id, kind });
          if (now && !stunned[i]) tell('stain'); // the blast reached you
          if (dropped.has(i)) tell('lootlost'); // the card in your hand fell (after "stain": the phone folds the two into one notice)
          if (freed.has(i)) tell('rescued');
          else if (glow > glowed[i]!) tell('big'); // the glow of a rescue that began, seen by the rescuer: "you freed a teammate"
        }
        stunned[i] = now;
        glowed[i] = glow;
      });
    },
  };
}
