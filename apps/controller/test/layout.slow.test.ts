// Automatic layout check of the phone page: every state x landscape viewport x safe-area inset, measured in headless Chrome
// (touch emulation) with getBoundingClientRect. Fails when a label lands on a control, text is cut or leaves the screen,
// something is pressable below 44x44 CSS px, or a control ends up under the notch / home indicator.
// The sweeps are the long ones: each orientation deals its scenarios over BROWSERS browsers (layout-sweep.ts). The pad, lobby and Captain tests are in layout-pad / layout-captain.slow.test.ts.
import { describe, expect, it } from 'vitest';
import { sweepLayout } from './layout-sweep';
import { MANCHAZO_SCENARIOS } from './manchazo-scenarios';
import { ORIENTATIONS, SCENARIOS } from './harness';

const BROWSERS = 3;

describe('phone layout', () => {
  for (const [orientation, vps] of Object.entries(ORIENTATIONS)) {
    // each orientation drives its own browsers, so the two run side by side
    it.concurrent(`${orientation}: no overlaps, clipped text, small touch targets, covered buttons or safe-area violations in any state`, async () => {
      const { bad, probes, pageErrors } = await sweepLayout([...SCENARIOS, ...MANCHAZO_SCENARIOS], vps, BROWSERS);
      expect(pageErrors).toEqual([]);
      expect(probes).toBeGreaterThan(orientation === 'landscape' ? 100 : 250);
      expect(bad).toEqual([]);
    }, 280_000);
  }
});
