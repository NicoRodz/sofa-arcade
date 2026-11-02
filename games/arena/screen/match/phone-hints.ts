// What button 2 says on each phone (F3): the sabotage in hand, "Sin sabotaje" greyed when there is none, and what the pinata of button 1 carries once a
// card is armed. The label is the STATE of the sim, sent whole when it changes (and again every REFRESH_MS, so a phone that reconnects is right in a second);
// picking a card up also buzzes the phone (colour on the button, vibration): nothing changes on a phone without calling for attention.
import type { ClientMsg, HintLabels, IconId } from '@pichi/core';
import { PLUS_SABOTAGES, SABOTAGES, dizzyThreat, type ManchazoState, type SabotageKind } from '../../sim';

// biome-ignore format: one card per entry
export const ICON_OF: Record<SabotageKind, IconId> = { turpentine: 'wash', roller: 'jump', fan: 'move', footprints: 'plate', glue: 'grab', tape: 'crate', ink: 'dough', sponge: 'cheese', swap: 'move', dizzy: 'bell' };
export const NAME_OF = Object.fromEntries([...SABOTAGES, ...PLUS_SABOTAGES].map((s) => [s.kind, s.name])) as Record<SabotageKind, string>;
export const HINT_REFRESH_MS = 1000;

/** What F8a adds to a phone's labels: seconds left to squeeze the sponge (0: not soaking), whether Mareo has it, whether a Mareo is charging next to it. */
export interface PlusHint {
  squeeze: number;
  dizzy: boolean;
  threat: boolean;
}
const NO_PLUS: PlusHint = { squeeze: 0, dizzy: false, threat: false };

/** The labels of A and B for a body holding `held` with `armed` waiting for its next pinata. A dizzy body (or one a Mareo is about to reach) wears it on A, no protocol change. */
export function sabotageHint(held: SabotageKind | null, armed: SabotageKind | null, plus: PlusHint = NO_PLUS): HintLabels {
  const b: Pick<HintLabels, 'b' | 'bIcon' | 'bOff'> = held
    ? { b: plus.squeeze > 0 ? `Exprimir ${plus.squeeze}s` : NAME_OF[held], bIcon: ICON_OF[held] }
    : { b: armed ? 'Armado' : 'Sin sabotaje', bIcon: 'star', bOff: true };
  const a = plus.dizzy
    ? { a: '¡Mareado! Stick al revés', aIcon: ICON_OF.dizzy }
    : plus.threat
      ? { a: '¡Aléjate! Mareo', aIcon: ICON_OF.dizzy }
      : armed
        ? { a: `Piñata ${NAME_OF[armed].toLowerCase()}`, aIcon: ICON_OF[armed] }
        : { a: null };
  return { ...a, ...b };
}

type HintMsg = Extract<ClientMsg, { t: 'hint' }>;
type BuzzMsg = Extract<ClientMsg, { t: 'buzz' }>;

export function createSabotageHints(send: (m: HintMsg | BuzzMsg) => void, playerOf: (slot: number) => number | undefined) {
  const sent = new Map<number, { key: string; at: number; held: SabotageKind | null; dizzy: boolean; threat: boolean }>();
  return {
    /** After every frame: `s` null (no round) hands every labelled phone back to the game's own labels. */
    sync(s: ManchazoState | null, now: number) {
      const sab = s?.match.sab;
      if (!s || !sab) {
        for (const id of sent.keys()) send({ t: 'hint', playerId: id, a: null, b: null });
        return sent.clear();
      }
      s.grid.bodies.forEach((body, i) => {
        const id = playerOf(body.slot);
        if (id === undefined) return;
        const held = sab.held[i]!;
        const p = sab.plus;
        const state: PlusHint = {
          squeeze: Math.ceil((p?.sponge[i] ?? 0) / 60),
          dizzy: (p?.dizzy[i] ?? 0) > 0,
          threat: dizzyThreat(s, i),
        };
        const h = sabotageHint(held, sab.armed[i]!, state);
        const key = JSON.stringify(h);
        const last = sent.get(id);
        if (last && last.key === key && now - last.at < HINT_REFRESH_MS) return;
        send({ t: 'hint', playerId: id, ...h });
        if (held && last?.held !== held) send({ t: 'buzz', playerId: id, kind: 'alert' });
        if (state.threat && !last?.threat && !state.dizzy) send({ t: 'buzz', playerId: id, kind: 'alert' }); // a Mareo is charging next to you: walk away
        if (state.dizzy && !last?.dizzy) send({ t: 'buzz', playerId: id, kind: 'big' }); // it hit
        sent.set(id, { key, at: now, held, dizzy: state.dizzy, threat: state.threat });
      });
    },
  };
}
