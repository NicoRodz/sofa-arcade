// Adversarial invariants of the projectiles over scripted rounds with a card in every empty hand and B pressed often (flag on, all the other flags on).
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@pichi/core';
import { solidAt } from '../../map';
import { createManchazo, stepManchazo, type ManchazoInput, type ManchazoState, type SabotageKind } from '../../sim';
import { clash } from '../../sim/shot/hit';
import { scripts } from '../match-drive';

const CARDS: SabotageKind[] = ['glue', 'swap', 'dizzy'];
const tileSolid = (s: ManchazoState, x: number, y: number) => solidAt(s.grid.map, Math.floor(x / 16), Math.floor(y / 16));

function fuzz(seed: number, living: boolean) {
  const teams = [0, 1, 0, 1, 0, 1];
  const s = createManchazo({
    slots: teams.map((_t, i) => i),
    teams,
    seed,
    sabotage: true,
    sabotagePlus: true,
    projectiles: true,
    rescue: true,
    ...(living ? { living: true, mapSeed: seed * 7 + 1 } : {}),
  });
  const ps = scripts(teams.length, seed, false);
  const rnd = mulberry32(seed * 13 + 5);
  const bad: string[] = [];
  const seen = { swaps: 0, passes: 0, clashes: 0, cancels: 0, hits: 0 };
  const passes = new Map<number, number>();
  for (let t = 0; t < 1800 && !s.grid.over; t++) {
    const a = s.match.sab!;
    teams.forEach((_x, i) => {
      if (!a.held[i] && rnd() < 0.05) a.held[i] = CARDS[Math.floor(rnd() * 4) % 3]!;
    });
    const before = new Map(s.match.pinatas.map((p) => [p.id, { passes: p.passes ?? 0, lock: p.lock ?? 0 }]));
    const logN = a.shot!.log.length;
    stepManchazo(s, new Map(ps.map((p, i): [number, ManchazoInput] => [s.grid.bodies[i]!.slot, { ...p(), use: rnd() < 0.15 }])));
    const sh = a.shot!;
    for (const p of sh.shots) {
      if (solidAt(s.grid.map, p.tx, p.ty) || tileSolid(s, p.x, p.y)) bad.push(`t${t}: shot ${p.id} in a wall`);
      for (const q of sh.shots)
        if (q !== p && p.left < 112 && q.left < 112 && clash(p, q)) bad.push(`t${t}: rival shots touching survived`);
    }
    for (const e of sh.log.slice(logN)) {
      if (e.kind === 'hit' && e.card === 'swap') {
        seen.swaps++;
        for (const b of [e.body, e.target])
          if (tileSolid(s, s.grid.bodies[b]!.x, s.grid.bodies[b]!.y)) bad.push(`t${t}: body ${b} swapped into a wall`);
      }
      if (e.kind === 'hit') seen.hits++;
      if (e.kind === 'pass') seen.passes++;
      if (e.kind === 'clash') seen.clashes++;
      if (e.kind === 'cancel') seen.cancels++;
    }
    const blasted = before.size > s.match.pinatas.filter((p) => before.has(p.id)).length; // a blast this tick may chain the fuse down (existing rule)
    for (const p of s.match.pinatas) {
      const was = before.get(p.id);
      if (p.passes === undefined) continue;
      if (p.passes > 3) bad.push(`t${t}: ${p.passes} passes`);
      if (was && p.passes > was.passes) {
        if (p.passes - was.passes > 1 || was.lock !== 0) bad.push(`t${t}: pass with lock ${was.lock}`);
        if (p.fuse < 44 && !blasted) bad.push(`t${t}: pass left fuse ${p.fuse}`);
      }
      passes.set(p.id, p.passes);
    }
    s.grid.bodies.forEach((_b, i) => {
      if (s.match.bodies[i]!.stun > 0 && sh.prep[i]! > 0) bad.push(`t${t}: stained body ${i} still aiming`);
    });
  }
  return { bad, seen };
}

describe('adversarial invariants over scripted rounds', () => {
  for (const living of [false, true])
    it(`150 seeds, living=${living}: no wall crossings, clashes cancel, passes within the caps, stains cut aims`, () => {
      const tot = { swaps: 0, passes: 0, clashes: 0, cancels: 0, hits: 0 };
      for (let seed = 1; seed <= 150; seed++) {
        const r = fuzz(seed, living);
        expect(r.bad.slice(0, 3), `seed ${seed}`).toEqual([]);
        for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += r.seen[k];
      }
      console.log(JSON.stringify({ living, ...tot }));
      expect(tot.hits).toBeGreaterThan(10);
      expect(tot.swaps).toBeGreaterThan(5);
      expect(tot.passes).toBeGreaterThan(0);
    }, 120_000);
});
