import { describe, expect, it } from 'vitest';
import { playWithBots } from './botplay';
import { CAMPAIGN } from './catalog';
import { PRACTICE } from './practice';

// The real sim (S1's campaign layer: rope +20 %, shared hearts) with ObstBot, which knows walls, gaps, spikes, tower + hand. It does not throw, swing
// or press plates, so 1-6 and the swing station (a 7-wide abyss that only the ring crosses) are NOT played here: the validator carries them.
describe('the real sim agrees with the validator on what the bot can play (2 bots, campaign world)', () => {
  for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5', '1-7']) {
    const l = CAMPAIGN.find((x) => x.id === id)!;
    it(`${id} ${l.name}: cleared`, { timeout: 60_000 }, () => {
      const s = playWithBots(l.def!, 2, l.mode === 'L' ? 'free' : 'chain', 90, { world: l.world });
      expect(s.world.status).toBe('cleared');
      expect(s.world.players.every((p) => p.inGoal)).toBe(true);
    });
  }
  for (const id of ['p-move', 'p-jump', 'p-rope', 'p-signals', 'p-tower', 'p-anchor', 'p-throw']) {
    const st = PRACTICE.find((x) => x.id === id)!;
    it(`station ${id}: cleared`, { timeout: 60_000 }, () => {
      expect(playWithBots(st.def, 2, st.mode === 'L' ? 'free' : 'chain', 60, { world: 'beach' }).world.status).toBe('cleared');
    });
  }
  it('1-3 in the legacy rope (168 px, no campaign layer) is NOT finishable: the tower needs the campaign rope', () => {
    const l = CAMPAIGN.find((x) => x.id === '1-3')!;
    expect(playWithBots(l.def!, 2, 'chain', 60).world.status).toBe('playing');
  });
});
