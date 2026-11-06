// The sweep behind the landscape / portrait layout tests: every scenario x viewport x inset, measured and checked. The scenarios are dealt
// round robin to several browsers that run side by side (each page waits on frames, not on the CPU), and the verdicts come back in scenario order,
// so the list of violations is the one a single browser would give.
import { expect } from 'vitest';
import { violations } from './checks';
import { insetsName, openSession, type Session, type Viewport } from './harness';
import type { Scenario } from './scenario-types';

export interface Sweep {
  bad: string[];
  probes: number;
  pageErrors: string[];
}

/** Probes one scenario at every viewport and inset on an open session. */
async function sweepScenario(ls: Session, sc: Scenario, vps: Viewport[]): Promise<{ bad: string[]; probes: number }> {
  const bad: string[] = [];
  let probes = 0;
  await ls.load(sc);
  for (const v of vps)
    for (const ins of v.insets) {
      await ls.setViewport(v, ins);
      const p = await ls.probe();
      probes++;
      // the probe must really see the emulated environment: a green from measuring nothing is worthless
      expect(p.vw).toBe(v.w);
      expect(p.vh).toBe(v.h);
      expect(p.inset).toEqual(ins);
      expect(p.items.length, `${sc.name} ${v.name}: nothing measured`).toBeGreaterThan(1);
      for (const msg of violations(p)) bad.push(`${sc.name} @ ${v.name} ${insetsName(ins)}: ${msg}`);
    }
  return { bad, probes };
}

export async function sweepLayout(scenarios: Scenario[], vps: Viewport[], browsers: number): Promise<Sweep> {
  const n = Math.max(1, Math.min(browsers, scenarios.length));
  const sessions = await Promise.allSettled(Array.from({ length: n }, () => openSession()));
  const open = sessions.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  try {
    const failed = sessions.find((r) => r.status === 'rejected');
    if (failed) throw (failed as PromiseRejectedResult).reason;
    const perScenario: { bad: string[]; probes: number }[] = new Array(scenarios.length);
    const runs = await Promise.allSettled(
      open.map(async (ls, w) => {
        for (let i = w; i < scenarios.length; i += n) perScenario[i] = await sweepScenario(ls, scenarios[i]!, vps);
      }),
    );
    const err = runs.find((r) => r.status === 'rejected');
    if (err) throw (err as PromiseRejectedResult).reason;
    return {
      bad: perScenario.flatMap((r) => r.bad),
      probes: perScenario.reduce((s, r) => s + r.probes, 0),
      pageErrors: open.flatMap((ls) => ls.pageErrors()),
    };
  } finally {
    await Promise.allSettled(open.map((ls) => ls.close()));
  }
}
