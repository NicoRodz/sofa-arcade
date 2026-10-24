// The learning test (plan §8, A1): a bot that only uses the mechanics already taught must finish every level; at the debut of X the bot without X
// must fail and the one with X must show at least one use (a green with no use is suspicious); D falls in the world's band; every star and checkpoint
// is reachable; the hints respect the lint. The "bot" is the validator restricted by `env.allow` (validator/graph.ts), so it is the game's own physics.
import { isModeled, type Mechanic, type ModeledMechanic } from '../mechanics';
import { difficultyOf } from '../metric';
import { validateState, type Uses, type ValidationReport } from '../validator';
import type { Env } from '../validator';
import type { GameMode, LevelDef } from '../types';
import type { CampaignLevel } from './types';
import { worldForDifficulty, type WorldId } from '../sim/campaign';
import { BAND_SLACK, HINT_FREE_FROM, HINT_MAX_PER_LEVEL, HINT_MAX_WORDS, WORLD_NAME, bandOf, checkpointEverySec, inBand } from './world';

// Mechanics that the validator's graph reaches the same places with: a level cannot prove one necessary against a bot that already has the other.
// (The throw's reach is the tower's: 5.4 tiles across and 4 up. If S1 gives the throw a niche, drop the pair and 1-5 gets a real debut test.)
export const EQUIVALENT: readonly (readonly ModeledMechanic[])[] = [['tower', 'throw']];
const twinsOf = (m: Mechanic): Mechanic[] => EQUIVALENT.filter((g) => (g as readonly string[]).includes(m)).flatMap((g) => g.filter((x) => x !== m));

// Felt but not needed: no debut check, and nothing to prove. The rest of SIM_ONLY is `unverified`: only the sim bot of A2 can show its use.
export const PASSIVE: readonly Mechanic[] = ['move', 'coyote', 'belt', 'crumble', 'lava'];

export const levelModes = (l: CampaignLevel): GameMode[] => (l.mode === 'E' ? ['chain'] : l.mode === 'L' ? ['free'] : ['chain', 'free']);
// N=2 in the level's world: its coyote/buffer, hand zone and rope (physicsForCampaign, params.ropeLen). `diff` only matters outside a world.
export const campaignEnv = (world: WorldId, mode: GameMode, allow?: ReadonlySet<Mechanic>): Env => ({ n: 2, mode, diff: 'hard', world, ...(allow ? { allow } : {}) });

// Everything taught up to and including level i.
export function knownThrough(levels: readonly CampaignLevel[], i: number): Set<Mechanic> {
  const k = new Set<Mechanic>();
  for (let j = 0; j <= i; j++) for (const m of levels[j]!.introduces) k.add(m);
  return k;
}

export function lintHints(def: LevelDef, indexInWorld: number): string[] {
  const hints = def.hints ?? [];
  const errors: string[] = [];
  if (hints.length > HINT_MAX_PER_LEVEL) errors.push(`${def.id}: ${hints.length} hints, at most ${HINT_MAX_PER_LEVEL}`);
  if (indexInWorld >= HINT_FREE_FROM && hints.length > 0) errors.push(`${def.id}: levels ${HINT_FREE_FROM} and ${HINT_FREE_FROM + 1} of a world have no hints`);
  for (const h of hints) {
    const words = h.text.trim().split(/\s+/).filter(Boolean).length;
    if (words > HINT_MAX_WORDS) errors.push(`${def.id}: hint "${h.text}" has ${words} words, at most ${HINT_MAX_WORDS}`);
  }
  return errors;
}

export interface DebutCheck {
  mechanic: Mechanic;
  kind: 'verified' | 'unverified' | 'passive'; // unverified: the validator does not model it (needs the sim bot)
  withoutFails?: boolean; // in every mode of the level
  usedWith?: number; // uses of X recorded by the bot that knows it (smallest over the modes)
}
export interface LearningReport {
  id: string;
  ok: boolean;
  errors: string[];
  d: number; // mean D over the level's modes, measured on the learning bot's route
  uses: Uses;
  debut: DebutCheck[];
  stars: string; // "3/3"
  checkpoints: string;
  pathSeconds: number;
}

const sum = (a: Uses, b: Uses): Uses => { const o: Uses = { ...a }; for (const [k, v] of Object.entries(b)) o[k as ModeledMechanic] = (o[k as ModeledMechanic] ?? 0) + v; return o; };

export function learnLevel(levels: readonly CampaignLevel[], i: number): LearningReport {
  const l = levels[i]!;
  const errors: string[] = [];
  const base: LearningReport = { id: l.id, ok: false, errors, d: 0, uses: {}, debut: [], stars: '-', checkpoints: '-', pathSeconds: 0 };
  if (l.status !== 'built' || !l.def) { errors.push(`${l.id}: planned, nothing to test`); return base; }
  const def = l.def;
  const known = knownThrough(levels, i);
  const before = i === 0 ? new Set<Mechanic>() : knownThrough(levels, i - 1);

  // 1. the bot with everything taught so far reaches the goal, the stars and the checkpoints, in every mode of the level
  const reports: ValidationReport[] = [];
  for (const mode of levelModes(l)) {
    const r = validateState(def, campaignEnv(l.world, mode, known));
    reports.push(r);
    if (!r.ok) errors.push(`${l.id} ${mode}: not solvable with what is taught so far (${[...known].join(', ')}): ${r.errors.join('; ')}`);
    else {
      if (r.stars.found !== r.stars.total || r.stars.total !== 3) errors.push(`${l.id} ${mode}: stars ${r.stars.found}/${r.stars.total}, want 3/3 reachable`);
      const want = Math.max(1, Math.floor(r.pathSeconds / checkpointEverySec(l.world)));
      if (r.checkpoints.found !== r.checkpoints.total) errors.push(`${l.id} ${mode}: checkpoints ${r.checkpoints.found}/${r.checkpoints.total} reachable`);
      if (r.checkpoints.total < want) errors.push(`${l.id} ${mode}: ${r.checkpoints.total} checkpoints for a ${r.pathSeconds.toFixed(0)} s route, want at least ${want} (one per ${checkpointEverySec(l.world)} s)`);
    }
  }
  // the lobby's Hard plays this level with the NEXT world's numbers (worldForDifficulty): it must stay solvable
  const hardWorld = worldForDifficulty(l.world, 'hard');
  for (const mode of levelModes(l)) {
    const h = validateState(def, campaignEnv(hardWorld, mode, known));
    if (!h.ok) errors.push(`${l.id} ${mode}: not solvable with the lobby's Hard numbers (${hardWorld}): ${h.errors.join('; ')}`);
  }
  const good = reports.filter((r) => r.ok);
  const uses = good.reduce((u, r) => sum(u, r.uses), {} as Uses);

  // 2. D in the world's band
  const d = good.length ? good.reduce((s, r) => s + difficultyOf(r, def).D, 0) / good.length : 0;
  if (good.length && !inBand(l.world, d)) errors.push(`${l.id}: D ${d.toFixed(1)} outside the ${WORLD_NAME[l.world]} band ${bandOf(l.world).join('-')} (+-${BAND_SLACK})`);

  // 3. it only uses what it declares (and what is taught): every mechanic of the route is in introduces or requires (a twin counts)
  const declared = new Set<Mechanic>([...l.introduces, ...l.requires, 'jump']);
  for (const m of Object.keys(uses) as ModeledMechanic[]) if (!declared.has(m) && !twinsOf(m).some((t) => declared.has(t))) errors.push(`${l.id}: the route uses ${m}, which is neither introduced nor required here`);
  for (const m of l.requires) if (!before.has(m)) errors.push(`${l.id}: requires ${m}, which no earlier level taught`);

  // 4. debut: the bot without X fails, the one with X shows a use
  const debut: DebutCheck[] = [];
  for (const x of l.introduces) {
    if (PASSIVE.includes(x)) { debut.push({ mechanic: x, kind: 'passive' }); continue; }
    if (!isModeled(x)) { debut.push({ mechanic: x, kind: 'unverified' }); continue; }
    const twins = twinsOf(x).filter((t) => before.has(t)); // a twin taught earlier: the bot loses the whole pair, then gets only X
    const without = new Set([...known].filter((m) => m !== x && !twins.includes(m)));
    const withX = new Set([...known].filter((m) => !twins.includes(m)));
    let fails = true, used = Infinity;
    for (const mode of levelModes(l)) {
      const a = validateState(def, campaignEnv(l.world, mode, without));
      if (a.ok) { fails = false; errors.push(`${l.id} ${mode}: the bot without ${x}${twins.length ? ` and ${twins.join(', ')}` : ''} still finishes: ${x} is not needed here`); }
      const b = validateState(def, campaignEnv(l.world, mode, withX));
      if (!b.ok) errors.push(`${l.id} ${mode}: the bot with ${x} does not finish: ${b.errors.join('; ')}`);
      const u = b.uses[x] ?? 0;
      used = Math.min(used, u);
      if (b.ok && u < 1) errors.push(`${l.id} ${mode}: the bot with ${x} finishes without using it (a green with no use)`);
    }
    debut.push({ mechanic: x, kind: 'verified', withoutFails: fails, usedWith: used === Infinity ? 0 : used });
  }

  // 5. hints
  errors.push(...lintHints(def, l.index));

  return { id: l.id, ok: errors.length === 0, errors, d, uses, debut, stars: good[0] ? `${good[0].stars.found}/${good[0].stars.total}` : '-', checkpoints: good[0] ? `${good[0].checkpoints.found}/${good[0].checkpoints.total}` : '-', pathSeconds: Math.max(0, ...good.map((r) => r.pathSeconds)) };
}

// Every built level of the catalog in the order given (the sabotage test passes a permutation).
export const learnCatalog = (levels: readonly CampaignLevel[]): LearningReport[] => levels.flatMap((l, i) => (l.status === 'built' ? [learnLevel(levels, i)] : []));
