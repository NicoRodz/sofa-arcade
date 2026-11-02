import { describe, expect, it } from 'vitest';
import { f0Map } from '../../map';
import { blastTiles, type ManchazoState } from '../../sim';
import { SPLASH_TICKS, Splashes } from '../../screen/art/splash';
import { recorder } from './recorder';

type Pot = ManchazoState['match']['pinatas'][number];
const pot = (id: number, fuse: number, over: Partial<Pot> = {}): Pot => ({ id, x: 3, y: 3, team: 1, owner: 0, fuse, radius: 2, ...over });
const at = (tick: number, ...pinatas: Pot[]) => ({ grid: { tick }, match: { pinatas } }) as unknown as ManchazoState;
const map = f0Map();

describe('Splashes: a splash starts when a pot that was about to go off disappears', () => {
  it('a pot with its fuse at 3 or less that vanishes makes one splash with the blast tiles, team, radius and tick', () => {
    const s = new Splashes();
    s.track(at(10, pot(1, 3)), map);
    expect(s.list).toEqual([]);
    s.track(at(11), map);
    expect(s.list).toEqual([{ x: 3, y: 3, team: 1, radius: 2, tiles: blastTiles(3, 3, 2, map), at: 11 }]);
  });
  it('a pot that vanishes with a long fuse (round cleared) makes none', () => {
    const s = new Splashes();
    s.track(at(10, pot(1, 40)), map);
    s.track(at(11), map);
    expect(s.list).toEqual([]);
  });
  it('a pot that is still there makes none, and two pots going off make two', () => {
    const s = new Splashes();
    s.track(at(5, pot(1, 2), pot(2, 2, { x: 5, team: 0 })), map);
    s.track(at(6, pot(1, 1)), map);
    expect(s.list.map((p) => p.team)).toEqual([0]);
    s.track(at(7), map);
    expect(s.list.map((p) => p.team)).toEqual([0, 1]);
  });
  it('a splash lives SPLASH_TICKS ticks and is dropped after; a clock that goes back drops it too', () => {
    const s = new Splashes();
    s.track(at(10, pot(1, 1)), map);
    s.track(at(11), map);
    s.track(at(11 + SPLASH_TICKS - 1), map);
    expect(s.list).toHaveLength(1);
    s.track(at(11 + SPLASH_TICKS), map);
    expect(s.list).toEqual([]);
    s.track(at(10, pot(2, 1)), map);
    s.track(at(11), map);
    s.track(at(2), map);
    expect(s.list).toEqual([]);
  });
  it('draw paints every blast tile of a live splash, none when empty', () => {
    const s = new Splashes();
    const idle = recorder();
    s.draw(idle.proxy as never, at(1), 0, 0, 48);
    expect(idle.calls).toEqual([]);
    s.track(at(10, pot(1, 1)), map);
    s.track(at(11), map);
    const r = recorder();
    s.draw(r.proxy as never, at(12), 0, 0, 48);
    expect(r.calls.filter((c) => c.startsWith('fillRect(')).length).toBe(s.list[0]!.tiles.length);
  });
});
