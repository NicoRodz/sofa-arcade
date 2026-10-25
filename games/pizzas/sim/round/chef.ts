// One chef's turn inside a tick: the order of the steps is what the golden rounds pin.
import type { Controls, Game, Player, Station } from './state';
import { aimStep, pickFloor, slipStep } from './hazards';
import { isAiming } from '../sabotage';
import { aStation, faceStation, targetStation } from './targeting';
import { applyChop, cuttableAt, updateChop } from './chop';
import { faceStation as magnetFace, magnetPull } from '../feel/magnet';
import { unit, walk } from './movement';
import { act } from './stations';

// One chef's tick, in this order: slipping or aiming take its control away; otherwise the target, the B edge, Picar (chop, wash, douse, fold),
// the dash, walking and finally the A presses.
export function stepChef(g: Game, p: Player, c: Controls, dt: number, dtMs: number) {
  if (g.hazards && p.slip) {
    slipStep(g, p, c, dtMs);
    return;
  } // sliding: the stick and the buttons do nothing
  if (g.sab && isAiming(g, p)) {
    aimStep(g, p, c, dtMs);
    return;
  } // loaded the catapult: anchored there until B (or 3 s)
  const target = targetStation(g, p);
  if (p.assist && target && !c.x && !c.y) faceStation(p, target); // Ayudante: turns to its station by itself
  p.dashCd = Math.max(0, p.dashCd - dtMs);
  const bEdge = (c.b && !p.bHeld) || (c.bTaps ?? 0) > 0;
  p.bHeld = c.b;
  const wasCutting = p.cutting,
    wasDousing = !!p.dousing;
  // B held: cut / grate / stretch on a board with a raw item, or scrub plates at a sink with dirty ones; with a fire in front (burn only), put it out
  const { burning, cuttable } = cuttableAt(g, target);
  if (g.magnet && target && !p.assist) magnetPull(g, p, target, cuttable && (c.b || (c.bTaps ?? 0) > 0), !c.x && !c.y, dtMs); // magnetism: Picar turns the chef to its board (or the oven it folds at); a slow chef beside a station drifts to face it
  const at = updateChop(g, p, c, target, bEdge, cuttable, burning, wasCutting, wasDousing);
  dashPress(g, p, c, target, bEdge, cuttable, dtMs);
  if (!applyChop(g, p, target, at, dtMs)) walk(g, p, c, dt, dtMs);
  pressA(g, p, c, dtMs);
}

// R2 (phase 1: no third button): B pressed with empty hands and no station in front. Returns true when the dash started.
function startDash(g: Game, p: Player, c: Controls) {
  const [dx, dy] = unit(c.x || c.y ? c.x : p.fx, c.x || c.y ? c.y : p.fy);
  const { dashMs, dashCdMs } = g.params.tune;
  p.dashMs = dashMs;
  p.dashCd = dashCdMs;
  p.dashDx = dx;
  p.dashDy = dy;
  p.dashHit = [];
  p.fx = dx;
  p.fy = dy;
  g.bus.emit('dash', { player: p.id, dx, dy });
}

// R2 + R6: a B press with free hands and nothing in front is a dash; if the cooldown ends within bufferMs it still goes
function dashPress(g: Game, p: Player, c: Controls, target: Station | null, bEdge: boolean, cuttable: boolean, dtMs: number) {
  const tune = g.params.tune;
  const free = !p.item && !(g.magnet && !p.assist ? cuttable || targetStation(g, p, true) : target) && !p.cutting; // magnetism: only what the old probe finds (or a chop) stops a dash
  const ready = p.dashMs <= 0 && p.dashCd <= 0;
  if (!free) p.buffB = 0;
  else if (bEdge && ready) startDash(g, p, c);
  else if (bEdge) p.buffB = tune.bufferMs;
  else if (p.buffB > 0 && ready) {
    startDash(g, p, c);
    p.buffB = 0;
  } else p.buffB = Math.max(0, p.buffB - dtMs);
}

// R6: an A press with no station in front waits bufferMs for one to show up
function pressA(g: Game, p: Player, c: Controls, dtMs: number) {
  const tune = g.params.tune;
  if (c.a > 0) {
    p.buffA += c.a;
    p.buffAge = 0;
  }
  while (p.buffA > 0) {
    const s = aStation(g, p);
    if (!s) {
      if (g.hazards && pickFloor(g, p)) {
        p.buffA--;
        continue;
      } // nothing in front: whatever lies on the floor close by
      break;
    }
    p.buffA--;
    if (g.magnet) magnetFace(p, s); // Tomar turns the chef to what it takes
    act(g, p, s);
  }
  if (p.buffA > 0) {
    p.buffAge += dtMs;
    if (p.buffAge > tune.bufferMs) p.buffA = 0;
  }
}
