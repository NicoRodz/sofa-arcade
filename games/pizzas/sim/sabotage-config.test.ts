// S0: the sabotage contract (constants, the event names and their shape) is pinned before any logic uses it.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { type GameEvents, Emitter } from './round/events';
import { DIFFICULTIES } from '@pichi/core/difficulty';
import {
  CATAPULT_CHAR,
  DESECHOS_PER_BAG,
  LAND_AFTER_MS,
  RULES,
  SABOTAGE_LABEL,
  SABOTAGE_MODES,
  SLIP,
  controlLostMs,
  defaultSabotage,
  dropsItem,
  isSabotageMode,
  sabotageOf,
  type SabotageEvents,
} from './sabotage-config';

describe('sabotage config', () => {
  it('the three modes, in the lobby order, with their labels', () => {
    expect(SABOTAGE_MODES).toEqual(['off', 'soft', 'chaos']);
    expect(SABOTAGE_MODES.map((m) => SABOTAGE_LABEL[m])).toEqual(['Apagado', 'Suave', 'Caos']);
    expect(isSabotageMode('chaos')).toBe(true);
    expect(isSabotageMode('hard')).toBe(false);
  });
  it('defaults: Suave on Fácil and Normal, Caos on Difícil; a round with no option is off', () => {
    expect(DIFFICULTIES.map(defaultSabotage)).toEqual(['soft', 'soft', 'chaos']);
    expect(sabotageOf({})).toBe('off');
    expect(sabotageOf(undefined)).toBe('off');
    expect(sabotageOf({ sabotage: 'chaos' })).toBe('chaos');
    expect(sabotageOf({ sabotage: 'nope' })).toBe('off');
    expect(sabotageOf({ sabotage: true })).toBe('off');
  });
  it('the balance table of the plan (section 5)', () => {
    expect(RULES.soft).toMatchObject({ cooldownMs: 12_000, perMinute: 3, stock: 1, maxPiles: 2, decayMs: 20_000 });
    expect(RULES.chaos).toMatchObject({ cooldownMs: 8_000, perMinute: 5, stock: 2, maxPiles: 3, decayMs: 35_000, double: true });
    expect(DESECHOS_PER_BAG).toBe(3);
    expect(LAND_AFTER_MS).toBe(700);
  });
  it('the slip table of the plan (section 4): control lost 550 / 750 / 900 ms', () => {
    expect(DIFFICULTIES.map((d) => SLIP[d].dist)).toEqual([1.5, 2.5, 3.0]);
    expect(DIFFICULTIES.map(controlLostMs)).toEqual([550, 750, 900]);
    expect(DIFFICULTIES.map((d) => SLIP[d].immuneMs)).toEqual([2000, 1500, 1200]);
  });
  it('the item falls from Normal up and always in Caos; Suave on Fácil only slips', () => {
    expect(dropsItem('soft', 'easy')).toBe(false);
    expect(dropsItem('soft', 'normal')).toBe(true);
    expect(dropsItem('chaos', 'easy')).toBe(true);
  });
  it('the catapult is a letter that no coop map uses', () => {
    expect(CATAPULT_CHAR).toBe('Y');
  });
  it('the events are part of GameEvents and an Emitter carries them typed', () => {
    const names: (keyof SabotageEvents)[] = [
      'sabotage:bagReady',
      'sabotage:aim',
      'sabotage:launch',
      'sabotage:land',
      'sabotage:caught',
      'sabotage:burst',
      'sabotage:blocked',
      'chef:slip',
      'chef:recover',
      'trash:picked',
      'trash:binned',
      'trash:decayed',
    ];
    expectTypeOf<keyof SabotageEvents>().toExtend<keyof GameEvents>();
    const bus = new Emitter<GameEvents>();
    const seen: string[] = [];
    for (const n of names) bus.on(n, () => seen.push(n));
    bus.emit('sabotage:burst', { team: 0, at: [1, 1] });
    bus.emit('trash:decayed', { team: 1, tile: [2, 2] });
    expect(seen).toEqual(['sabotage:burst', 'trash:decayed']);
  });
});
