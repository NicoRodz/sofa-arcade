// Sinkers and geysers (campaign dynamic 12, plan §4 "Hundibles y geiser"): two objectives (letters A-F with params {kind:'sinker'} / {kind:'geyser'}), stepped by stepMovers
// (sim/entities.ts) so they act before the players of the step. Inert outside a campaign world.
//   SINKER  a one-way platform like a balance plate. It sinks `sinkTilesPerSec` PER CHARACTER on it (boxes do not ride platforms in this sim, so only characters count) down to `travel` tiles and floats back up at
//           `sinkRiseTilesPerSec` when it is empty. The load is the one computed at the end of the previous step (like the balance). Obst.sinker rings when it starts to sink.
//   GEYSER  a vent (the letter's cells, open air over a floor). Phase is a pure function of the tick: calm, then `geyserWarnSec` of bubbling, then `activeSec` (default 0.5 s)
//           of eruption, every periodSec (the eruption is the LAST activeSec of the period). Whoever is inside the vent while it erupts is launched upwards at
//           `geyserLaunchMult` x JUMP_V0 (a timed spring), at most once every half second per player. Obst.geyser rings on each phase change.
import { DT, JUMP_V0, TILE } from '../../constants';
import { bodyRect, overlaps } from '../world/collide';
import { emit, isActive, type Objective, type World } from '../world/state';

const NONE = 255;
const steps = (sec: number) => Math.round(sec / DT);
export const GEYSER_COOL_STEPS = 30;
export type GeyserPhase = 'calm' | 'warn' | 'gush';
const PHASES: GeyserPhase[] = ['calm', 'warn', 'gush'];

export function geyserPhaseAt(w: World, o: Objective): GeyserPhase {
  const prm = o.param as Extract<Objective['param'], { kind: 'geyser' }>;
  const per = steps(prm.periodSec),
    active = steps(prm.activeSec ?? 0.5),
    gushAt = per - active,
    t = w.tick % per;
  return t >= gushAt ? 'gush' : t >= gushAt - steps(w.camp!.geyserWarnSec) ? 'warn' : 'calm';
}

export function stepSinkers(w: World): void {
  const c = w.camp;
  if (!c) return;
  for (const o of w.ent.objectives) {
    if (o.kind !== 'sinker') continue;
    const prm = o.param as Extract<Objective['param'], { kind: 'sinker' }>;
    const oy0 = o.oy;
    if (o.load > 0) o.oy = Math.min(prm.travel * TILE, o.oy + o.load * c.sinkTilesPerSec * TILE * DT);
    else o.oy = Math.max(0, o.oy - c.sinkRiseTilesPerSec * TILE * DT);
    o.dx = 0;
    o.dy = o.oy - oy0;
    const sinking = o.dy > 1e-9;
    if (sinking && !o.moving) emit(w, 'obst.sinker', { id: o.letter, load: o.load });
    o.moving = sinking;
  }
}

export function stepGeysers(w: World): void {
  const c = w.camp;
  if (!c) return;
  for (const p of w.players) if (p.camp.geyserCool > 0) p.camp.geyserCool--;
  for (const o of w.ent.objectives) {
    if (o.kind !== 'geyser') continue;
    const ph = geyserPhaseAt(w, o),
      n = PHASES.indexOf(ph);
    if (n !== o.phase) {
      o.phase = n;
      emit(w, 'obst.geyser', { id: o.letter, phase: ph });
    }
    if (ph !== 'gush') continue;
    for (const p of w.players) {
      if (
        !isActive(p) ||
        p.camp.geyserCool > 0 ||
        p.climbing ||
        p.carriedBy >= 0 ||
        p.lift ||
        p.camp.pick !== 0 ||
        p.holding?.kind === 'ring'
      )
        continue;
      if (!overlaps(o.rect, bodyRect(p.body))) continue;
      const b = p.body;
      b.vy = -JUMP_V0 * c.geyserLaunchMult;
      b.grounded = false;
      b.supportId = -1;
      b.air = NONE;
      p.planted = false;
      p.ropeJump = true;
      p.camp.geyserCool = GEYSER_COOL_STEPS;
    }
  }
}
