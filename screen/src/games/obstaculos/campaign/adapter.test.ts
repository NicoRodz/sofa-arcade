// The campaign layer reaches the picture: camera hints, the longer rope, the hearts and the signal over a head (SimWorldView).
import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS, ObstSession, ROPE_LEN } from '@party/shared/obstaculos';
import { LEGACY_CATALOG } from '@party/shared/obstaculos/campaign';
import { SimWorldView } from '../render/adapter';
import { checkWorldView } from '../render/view';

const def = LEGACY_CATALOG.levels.find((l) => l.id === '1-2')!.def;
const FRAME = 1000 / 60;
function mk(campaign: boolean, world: 'beach' | 'forest' = 'beach') {
  const s = new ObstSession({ mode: 'chain', difficulty: 'normal', level: 1, seed: 1, slots: [0, 1], levels: [def], ...(campaign ? { campaign: { world } } : {}) });
  for (let t = 0; t < COUNTDOWN_MS + 100; t += FRAME) s.advance(FRAME);
  const v = new SimWorldView(s, s.world, (n) => `J${n}`);
  v.sync();
  return { s, v };
}

describe('a campaign world in the picture', () => {
  it('a quick match has no hints and the rope of always; a campaign one carries the hints, the longer rope and its own hearts', () => {
    const q = mk(false).v, c = mk(true).v;
    expect(q.look).toBeNull(); expect(q.camp).toBeNull();
    expect(q.ropes[0]!.base).toBe(ROPE_LEN);
    expect(c.look).toMatchObject({ padTiles: 3 });
    expect(c.look!.goalX).toBeGreaterThan(0);
    expect(c.ropes[0]!.base).toBeCloseTo(ROPE_LEN * 1.2, 5);
    expect(c.hud.livesMax).toBe(Infinity); // Playa: the water never costs hearts
    expect(mk(true, 'forest').v.hud.livesMax).toBe(6);
    expect(checkWorldView(c)).toEqual([]);
  });
  it('the seconds out of the picture before the bubble come from the world (Playa 1 s), not from the lobby difficulty', () => {
    expect(mk(true, 'beach').v.bubbleSec).toBe(1);
    expect(mk(true, 'forest').v.bubbleSec).toBe(2);
  });
  it('a signal shows over the explorer that sent it, only', () => {
    const { s, v } = mk(true);
    s.receive(0, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'wait', seq: 1 } });
    s.advance(FRAME); // baseline
    s.receive(0, { x: 0, y: 0, presses: [0, 0], signal: { kind: 'wait', seq: 2 } });
    for (let i = 0; i < 3; i++) s.advance(FRAME);
    v.sync();
    expect(v.players.map((p) => p.signal)).toEqual(['wait', null]);
  });
  it('the 3-2-1 of "go" held is visible as camp.countdown, and gone when released', () => {
    const { s, v } = mk(true);
    expect(v.camp).toEqual({ countdown: null, refills: 0 });
    for (let i = 0; i < 200 && !s.world.countdown; i++) { s.receive(0, { x: 0, y: 0, presses: [0, 0], goHeld: true }); s.advance(FRAME); }
    v.sync();
    expect(v.camp!.countdown).toBeGreaterThan(0);
    expect(v.camp!.countdown).toBeLessThanOrEqual(3);
  });
});
