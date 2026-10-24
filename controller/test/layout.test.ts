// Automatic layout check of the phone page: every state x landscape viewport x safe-area inset, measured in headless Chrome
// (touch emulation) with getBoundingClientRect. Fails when a label lands on a control, text is cut or leaves the screen,
// something is pressable below 44x44 CSS px, or a control ends up under the notch / home indicator.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { violations } from './checks';
import { PORTRAIT, SCENARIOS, VIEWPORTS, insetsName, openSession, type Session } from './harness';

let s: Session;
beforeAll(async () => { s = await openSession(); }, 60_000);
afterAll(async () => { await s?.close(); }, 30_000);

describe('phone layout', () => {
  it('has no overlaps, clipped text, small touch targets or safe-area violations in any state', async () => {
    const bad: string[] = [];
    let probes = 0;
    for (const sc of SCENARIOS) {
      await s.load(sc);
      const vps = sc.portrait ? [PORTRAIT] : VIEWPORTS;
      for (const v of vps) for (const ins of v.insets) {
        await s.setViewport(v, ins);
        const p = await s.probe();
        probes++;
        // the probe must really see the emulated environment: a green from measuring nothing is worthless
        expect(p.vw).toBe(v.w); expect(p.vh).toBe(v.h);
        expect(p.inset).toEqual(ins);
        if (!sc.portrait) expect(p.items.length, `${sc.name} ${v.name}: nothing measured`).toBeGreaterThan(1);
        if (sc.portrait) { expect(p.items.some((i) => i.sel === '#rotate > *')).toBe(true); continue; }
        for (const msg of violations(p)) bad.push(`${sc.name} @ ${v.name} ${insetsName(ins)}: ${msg}`);
      }
    }
    expect(s.pageErrors()).toEqual([]);
    expect(probes).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  }, 240_000);

  it('the pad shows the three controls in the playing state (sanity of the harness)', async () => {
    const sc = SCENARIOS.find((x) => x.name === 'play-puesto')!;
    await s.load(sc);
    await s.setViewport(VIEWPORTS[0]!, VIEWPORTS[0]!.insets[0]!);
    const p = await s.probe();
    for (const sel of ['#stickhint', '#btnA', '#btnB', '#puesto', '#pswap', '#btnA .lbl', '#btnB .lbl']) expect(p.items.some((i) => i.sel === sel), sel).toBe(true);
  }, 60_000);
});
