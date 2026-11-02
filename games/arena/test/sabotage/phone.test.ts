import { describe, expect, it } from 'vitest';
import { ManchazoRun } from '../../screen/match/run';
import { HINT_REFRESH_MS, createSabotageHints, sabotageHint } from '../../screen/match/phone-hints';
import { arenaManifest } from '../../manifest';
import { give, round } from './sab-drive';

describe('button 2 on the phone', () => {
  it('the manifest label is no longer "Pronto"', () => {
    expect(arenaManifest.modes[0].controls.btn2.label).toBe('Sabotaje');
  });
  it('shows the card in hand, greyed "Sin sabotaje" when empty, and the pinata mark on A once armed', () => {
    expect(sabotageHint('roller', null)).toMatchObject({ a: null, b: 'Rodillo', bIcon: 'jump' });
    expect(sabotageHint('roller', null).bOff).toBeUndefined();
    expect(sabotageHint(null, null)).toMatchObject({ b: 'Sin sabotaje', bOff: true });
    expect(sabotageHint(null, 'glue')).toMatchObject({ a: 'Piñata pegote', b: 'Armado', bOff: true });
  });
  it('sends the hint when it changes, buzzes on pickup, refreshes after a second and hands the labels back with no round', () => {
    const sent: any[] = [];
    const hints = createSabotageHints(
      (m) => sent.push(m),
      (slot) => slot + 10,
    );
    const s = round();
    hints.sync(s, 0);
    expect(sent.filter((m) => m.t === 'hint').map((m) => [m.playerId, m.b])).toEqual([
      [10, 'Sin sabotaje'],
      [11, 'Sin sabotaje'],
    ]);
    hints.sync(s, 16);
    expect(sent.length).toBe(2); // nothing changed
    give(s, 0, 'fan');
    hints.sync(s, 32);
    expect(sent.slice(2).map((m) => [m.t, m.playerId, m.b ?? m.kind])).toEqual([
      ['hint', 10, 'Ventilador'],
      ['buzz', 10, 'alert'],
    ]);
    hints.sync(s, 32 + HINT_REFRESH_MS);
    expect(sent.filter((m) => m.t === 'buzz').length).toBe(1);
    expect(sent.length).toBe(6);
    hints.sync(null, 5000);
    expect(sent.slice(-2).every((m) => m.a === null && m.b === null)).toBe(true);
  });
});

describe('ManchazoRun: a button 2 press plays the card', () => {
  it('a grown presses[1] counter is one use; the first packet is only a baseline', () => {
    const run = new ManchazoRun([0, 1], [0, 1], 5, 1234);
    expect(run.state.match.sab).not.toBeNull();
    run.state.match.sab!.held[0] = 'roller';
    run.receive(0, 0, 0, [0, 0]);
    run.advance(1000 / 60);
    expect(run.state.match.sab!.held[0]).toBe('roller');
    run.receive(0, 0, 0, [0, 1]);
    run.advance(1000 / 60);
    expect(run.state.match.sab!.held[0]).toBeNull();
    expect(run.state.match.sab!.roller[0]).toBeGreaterThan(0);
  });
});
