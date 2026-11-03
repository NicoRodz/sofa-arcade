// F9: what shakes one phone besides the labels: stain, lootlost and rescued (and `big` for the rescuer) are EVENTS read from the sim's state, one buzz per event, to the phone they touch.
import { describe, expect, it } from 'vitest';
import { RESCUE_TICKS } from '../../sim';
import { createPhoneAlerts } from '../../screen/match/phone-alerts';
import { blastAt, give, put, rround, stain, tick } from '../rescue/rescue-drive';

type Sent = { playerId: number; kind: string };
function setup(card: Parameters<typeof give>[2] = null, mate: [number, number] = [20, 11]) {
  const sent: Sent[] = [];
  const alerts = createPhoneAlerts(
    (m) => void sent.push({ playerId: m.playerId, kind: m.kind }),
    (slot) => slot + 100,
  );
  const s = rround([0, 1, 0]); // bodies 0 and 2 on team 0, body 1 a rival
  put(s, 0, 3, 7);
  put(s, 2, mate[0], mate[1]);
  put(s, 1, 20, 3);
  give(s, 0, card);
  alerts.sync(s);
  return { s, sent, alerts, of: (kind: string) => sent.filter((m) => m.kind === kind).map((m) => m.playerId) };
}

describe('phone alerts: one buzz per event, to the phone it touches', () => {
  it('stain: the blast that stuns a body buzzes only that phone, once', () => {
    const { s, alerts, sent, of } = setup();
    blastAt(s, 3, 7);
    tick(s);
    alerts.sync(s);
    expect(of('stain')).toEqual([100]);
    alerts.sync(s);
    tick(s);
    alerts.sync(s);
    expect(of('stain')).toHaveLength(1); // the stun lasting is not a new stain
    expect(sent.filter((m) => m.playerId !== 100)).toEqual([]);
  });
  it('lootlost: the card in hand that falls buzzes its holder (after the stain), and nobody else', () => {
    const { s, alerts, sent, of } = setup('roller');
    blastAt(s, 3, 7);
    tick(s);
    alerts.sync(s);
    expect(sent).toEqual([
      { playerId: 100, kind: 'stain' },
      { playerId: 100, kind: 'lootlost' },
    ]);
    expect(of('lootlost')).toEqual([100]);
  });
  it('lootlost: a stained body with nothing in hand drops nothing, so it does not buzz it', () => {
    const { s, alerts, of } = setup(null);
    blastAt(s, 3, 7);
    tick(s);
    alerts.sync(s);
    expect(of('lootlost')).toEqual([]);
  });
  it('rescued: the freed phone gets `rescued` and the rescuer `big`, once each', () => {
    const { s, alerts, of } = setup(null, [4, 7]);
    stain(s, 0);
    tick(s);
    alerts.sync(s);
    tick(s, {}, RESCUE_TICKS);
    alerts.sync(s);
    expect(of('rescued')).toEqual([100]);
    expect(of('big')).toEqual([102]);
    alerts.sync(s);
    expect(of('rescued')).toHaveLength(1);
    expect(of('big')).toHaveLength(1);
  });
  it('a phone with no player (nobody on that slot) is skipped, and a null state forgets: the next round buzzes again', () => {
    const sent: Sent[] = [];
    const alerts = createPhoneAlerts(
      (m) => void sent.push({ playerId: m.playerId, kind: m.kind }),
      (slot) => (slot === 0 ? undefined : slot + 100),
    );
    const s = rround([0, 1, 0]);
    put(s, 0, 3, 7);
    put(s, 1, 20, 3);
    alerts.sync(s);
    blastAt(s, 3, 7);
    tick(s);
    alerts.sync(s);
    expect(sent).toEqual([]);
    alerts.sync(null);
    const r = rround([0, 1, 0]);
    put(r, 1, 20, 3);
    put(r, 2, 4, 7);
    alerts.sync(r);
    blastAt(r, 4, 7);
    tick(r);
    alerts.sync(r);
    expect(sent).toEqual([{ playerId: 102, kind: 'stain' }]);
  });
});
