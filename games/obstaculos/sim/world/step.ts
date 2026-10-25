// One fixed 60 Hz step over players, rope, grabs, entities and rules. The call order below is frozen (the regression hashes depend on it).
import { DT, JUMP_V0, PLAYER_H, PLAYER_W, ROPE_JUMP_MULT, RUN_SPEED } from '../../constants';
import { T } from '../../legend';
import { applyA, applyB, handCatchStep, releaseHolding } from '../actions';
import { moveXLedge, pushBody, supportBelow } from '../collide';
import {
  beltDx,
  computeLoads,
  extraPlatforms,
  stepActivation,
  stepBoxes,
  stepCrumbles,
  stepHazard,
  stepKeys,
  stepMovers,
  stepTargets,
} from '../entities';
import type { PlayerStep } from '../input';
import { hangingOnRope, invMassOf, solveRopes, type RopeNode } from '../rope';
import { applySlides, edgeAssist, prepareAnchors, registerGroundJump, stepCampaignInputs, stepIce, stepWind } from '../campaignrules';
import { stepEnemies } from '../enemies';
import { stepPick, stepPickaxes } from '../pickaxe';
import { elasticOf, markElastic, stretchedEnd } from '../bungee';
import { stepLanterns } from '../lantern';
import { stepGeysers, stepSinkers } from '../floaters';
import {
  dropCrumbs,
  progressOf,
  sendToBubble,
  stepBubbles,
  stepCheckpoints,
  stepDeaths,
  stepGoal,
  stepStars,
  stepStragglers,
} from '../rules';
import { emit, isActive, playerOf, type ObstEvent, type World } from '../state';
import { headPlatform, stepPlayer, type Body, type Platform } from '../player';
import { boxTouches } from '../tiles';
import { CLIMB_SIDE_MULT, CLIMB_SPEED, PLANT_AIR_STEPS, THROW_VX } from '../tuning';

export interface StepOptions {
  offCamera?: readonly boolean[];
} // slot -> out of the camera frame (from computeCamera), drives the bubble

const IDLE: PlayerStep = { move: 0, down: false, jump: false, up: false, grab: false };
const NONE = 255;

const headsOf = (w: World): Platform[] =>
  w.players.filter((p) => isActive(p) && p.carriedBy < 0 && !p.climbing).map((p) => headPlatform(p.body));

const ladderAt = (w: World, b: Body): boolean => boxTouches(w.grid, b.x + PLAYER_W / 2 - 4, b.y, 8, PLAYER_H, (k) => k === T.Ladder);

export function step(w: World, inputs: readonly (PlayerStep | undefined)[], opts: StepOptions = {}): ObstEvent[] {
  w.events = [];
  if (w.status !== 'playing') return w.events;
  w.tick++;
  for (const p of w.players) if (p.invuln > 0) p.invuln--;

  // 1. Moving things.
  stepMovers(w);
  if (w.camp) {
    stepSinkers(w);
    stepGeysers(w);
  } // campaign dynamic 12: rocks sink, geysers erupt (they act before the players move)
  stepHazard(w);
  stepCrumbles(w);

  if (w.camp) stepCampaignInputs(w, inputs); // signals, countdown, bubble mash

  // 2. B and A, in slot order.
  const jumps = new Map<number, boolean>();
  for (const p of w.players) {
    if (!isActive(p)) continue;
    const inp = inputs[p.slot] ?? IDLE;
    if (inp.grab) applyB(w, p);
    jumps.set(p.slot, inp.jump && !applyA(w, p));
  }

  // 3. Players, in slot order, each seeing the heads and platforms of the start of the step.
  const platforms = [...headsOf(w), ...extraPlatforms(w)];
  const bySlot: (Body | undefined)[] = [];
  for (const p of w.players) bySlot[p.slot] = p.body;
  for (const p of w.players) {
    if (!isActive(p)) continue;
    const inp = inputs[p.slot] ?? IDLE;
    const b = p.body;
    if (p.holding?.kind === 'ring') {
      b.vx = 0;
      b.vy = 0;
      b.dx = 0;
      b.dy = 0;
      p.stats.anchoredSteps++;
      continue;
    }
    if (p.carriedBy >= 0 || p.lift) continue;
    if (p.planted) {
      p.plantAir = b.grounded ? 0 : p.plantAir + 1;
      if (p.plantAir > PLANT_AIR_STEPS) {
        p.planted = false;
        p.plantAir = 0;
      }
    }
    if (w.camp && stepPick(w, p, inp)) continue; // campaign pickaxe: clinging to / climbing an ice wall
    // ladders
    if (!p.climbing && (inp.up || inp.down) && !p.planted && !p.thrown && ladderAt(w, b)) {
      p.climbing = true;
      b.vx = 0;
      b.vy = 0;
    }
    if (p.climbing) {
      if (!ladderAt(w, b)) {
        p.climbing = false;
        b.vy = 0;
      } else {
        const dy = ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * CLIMB_SPEED * DT;
        const moved = pushBody(b, 0, dy, w.grid);
        moveXLedge(b, inp.move * RUN_SPEED * CLIMB_SIDE_MULT * DT, w.grid);
        b.vx = 0;
        b.vy = 0;
        b.grounded = false;
        b.supportId = -1;
        b.onOneWay = false;
        b.air = NONE;
        b.dx = 0;
        b.dy = moved.y;
        if (dy > 0 && moved.y < dy - 0.01) p.climbing = false; // reached the floor
        continue;
      }
    }
    let jump = jumps.get(p.slot) ?? false;
    // rope jump (plan §4): hanging on a taut rope with no coyote left, one jump at 0.8 v0
    if (jump && !b.grounded && b.air > w.params.coyote && p.ropeJump && hangingOnRope(w.ropes, p.slot, bySlot)) {
      b.vy = -JUMP_V0 * ROPE_JUMP_MULT;
      b.air = NONE;
      p.ropeJump = false;
      jump = false;
      emit(w, 'obst.jump', { player: p.slot, kind: 'rope' });
    }
    if (w.camp) edgeAssist(w, p, bySlot);
    let move = p.planted ? 0 : inp.move;
    if (p.camp.assist > 0) {
      move = p.camp.assistDir;
      p.camp.assist--;
    } // edge assist: pushed into the wall until it is on the ledge
    if (p.thrown > 0) {
      move = (b.facing * THROW_VX * (w.camp?.throwVxMult ?? 1)) / RUN_SPEED;
      p.thrown--;
    } // no control until it lands; keeps the throw speed (target 420 px/s)
    const bd = beltDx(w, p);
    if (bd !== 0) pushBody(b, bd, 0, w.grid);
    const ev = stepPlayer(b, { move, down: inp.down, jump }, { grid: w.grid, platforms, params: w.params });
    if (ev.jump) emit(w, 'obst.jump', { player: p.slot, kind: ev.jump });
    if (w.camp && (ev.jump === 'ground' || ev.jump === 'coyote')) registerGroundJump(w, p);
    if (ev.land > 0) emit(w, 'obst.land', { player: p.slot, impact: ev.land, on: ev.landOn });
    if (b.grounded) {
      p.ropeJump = true;
      p.thrown = 0;
    }
  }

  if (w.camp) stepWind(w); // campaign: a gust shifts whoever is in the air

  // 4. Carried players ride on their holder; mano amiga lifts; boxes and keys follow their holders.
  for (const t of w.players) {
    if (t.carriedBy < 0) continue;
    const c = playerOf(w, t.carriedBy);
    if (!c || !isActive(c) || !isActive(t)) {
      t.carriedBy = -1;
      if (c?.holding?.kind === 'player') c.holding = null;
      continue;
    }
    const ty = c.body.y - PLAYER_H - 2;
    t.body.x = c.body.x;
    t.body.y = boxTouches(w.grid, c.body.x, ty, PLAYER_W, PLAYER_H, (k) => k === T.Solid || k === T.Door || k === T.Crumble)
      ? c.body.y
      : ty;
    t.body.vx = 0;
    t.body.vy = 0;
    t.body.grounded = true;
    t.body.supportId = c.slot;
    t.body.air = 0;
    t.body.facing = c.body.facing;
    t.body.dx = c.body.dx;
    t.body.dy = c.body.dy;
  }
  handCatchStep(w, w.dparams.handZoneTiles);
  stepBoxes(w, (p) => releaseHolding(w, p));
  stepKeys(w);
  if (w.camp) {
    stepPickaxes(w);
    stepLanterns(w);
    stepEnemies(w);
  } // campaign: the pickaxe follows its holder; the lantern lights the crystals; soft enemies patrol and shove

  // 5. Rope: PBD, separating velocity removed, ground recomputed (plan §4 steps 3-5).
  if (w.ropes.length) {
    const nodes: (RopeNode | undefined)[] = [];
    for (const p of w.players) {
      const anchored = p.holding?.kind === 'ring' || p.carriedBy >= 0 || !!p.lift || (!!w.camp && (p.planted || p.camp.pick !== 0)); // campaign: planted or clinging to a wall = anchor, infinite mass
      nodes[p.slot] = {
        body: p.body,
        active: isActive(p),
        w: invMassOf(anchored ? 'anchored' : p.planted ? 'planted' : p.body.grounded ? 'ground' : 'air'),
      };
    }
    const slides = w.camp ? prepareAnchors(w, nodes) : [];
    if (w.camp) markElastic(w); // campaign dynamic 11: links hanging from an elastic ring are springs
    const behind = (a: number, c: number) => (progressOf(w, playerOf(w, a)!) >= progressOf(w, playerOf(w, c)!) ? a : c);
    for (const e of solveRopes(w.ropes, nodes, w.grid, behind, w.camp ? elasticOf(w.camp) : undefined)) {
      if (e.kind === 'bounce') {
        const l = w.ropes[e.rope]!.links[e.link]!;
        emit(w, 'obst.bungee', { player: stretchedEnd(w, l.a, l.b), stretch: e.stretch });
      } else if (e.kind === 'taut') emit(w, 'obst.ropeTaut', { rope: e.rope, link: e.link, tension: e.tension });
      else if (e.kind === 'strain') emit(w, 'obst.ropeStrain', { rope: e.rope, link: e.link, tension: e.tension });
      else {
        const p = playerOf(w, e.behind);
        if (p && isActive(p)) sendToBubble(w, p, 'rope');
      }
    }
    if (w.camp) applySlides(w, slides);
  }
  const after = [...headsOf(w), ...extraPlatforms(w)];
  for (const p of w.players) {
    if (!isActive(p) || p.climbing || p.carriedBy >= 0 || p.lift || p.holding?.kind === 'ring') continue;
    const s = supportBelow(p.body, w.grid, after);
    p.body.grounded = s.grounded;
    p.body.supportId = s.supportId;
    p.body.onOneWay = s.onOneWay;
    if (s.grounded) p.body.air = 0;
  }

  // 6. Pressure, collectibles, checkpoints, danger, stragglers, victory.
  computeLoads(w);
  stepTargets(w);
  stepActivation(w);
  dropCrumbs(w);
  stepStars(w);
  if (w.camp) stepIce(w);
  stepCheckpoints(w);
  stepDeaths(w);
  stepStragglers(w, opts.offCamera);
  stepBubbles(w);
  stepGoal(w);
  return w.events;
}
