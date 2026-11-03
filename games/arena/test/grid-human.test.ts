import { describe, expect, it } from 'vitest';
import { humanRun, humanTotals } from './grid-human';

// F0 exit criterion, with a human's thumb: almost no tick stopped without meaning to, almost no failed turn. PG_HUMAN_REPORT=1 prints the numbers.
describe('simulated human with a noisy stick on the F0 circuit', () => {
  for (const plan of ['A', 'B'] as const) {
    it(`plan ${plan}: 24 runs finish, with (almost) no tick stopped by mistake and no failed turn`, () => {
      const t = humanTotals(plan, 24);
      if (process.env.PG_HUMAN_REPORT)
        console.info(
          `HUMAN plan ${plan}`,
          JSON.stringify({
            ...t,
            stoppedPct: +((100 * t.stopped) / t.wanting).toFixed(2),
            failedPct: +((100 * t.failed) / t.requested).toFixed(2),
          }),
        );
      expect(t.finished).toBe(24);
      expect(t.stopped / t.wanting).toBeLessThan(0.005);
      expect(t.failed / t.requested).toBeLessThan(0.02);
    });
  }

  it('the run is deterministic: same seed, same numbers', () => {
    expect(humanRun('A', 7)).toEqual(humanRun('A', 7));
    expect(humanRun('A', 7)).not.toEqual(humanRun('A', 8));
  });
});
