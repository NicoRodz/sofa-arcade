// Picar (the B button held): whether a station can be worked on, the start / stop events, and the progress of a chop, a wash, a fold or a fire being put out.
import type { Controls, Game, Player, Station } from './state';
import { cutOf } from '../recipes/defs';
import { canSlice, slicedOf } from '../recipes/casa';
import { canFold, cutMsOf, foldStep } from '../recipes/sim';
import { canStir, stirStep } from '../recipes/sauce';
import { ASSIST_STICK_CANCEL } from '../rules/assist';
import { pushesInto } from './targeting';
import { WASH_MS } from '@pichi/core';
import { douse } from '../rules/burn';

// The event that ends what a chef's Picar was doing: putting a fire out, scrubbing plates at a sink, or chopping.
export const stopKind = (g: Game, p: Player) =>
  p.dousing
    ? 'douseStop'
    : g.stations[p.chopAt]?.kind === 'sink' || g.stations[p.chopAt]?.kind === 'saucepot'
      ? 'washStop'
      : g.stations[p.chopAt]?.kind === 'pot'
        ? 'foldStop'
        : 'chopStop';

// Can B do something at this station? Cut / grate / stretch on a board with a raw item, scrub plates at a sink with dirty ones, fold at an oven, put a fire out (burn only).
export function cuttableAt(g: Game, target: Station | null) {
  const burning = !!(g.burn && target && target.fire !== undefined);
  const cuttable = !!(
    target &&
    ((target.kind === 'board' && target.item && (cutOf(target.item) || canSlice(g, target.item))) ||
      (target.kind === 'sink' && target.count > 0) ||
      canStir(target) ||
      burning ||
      canFold(g, target))
  );
  return { burning, cuttable };
}

// Ayudante's latch, whether the chef is cutting now, the events when it starts, stops or changes station, and the chef standing still while it works. Returns the station index it faces.
export function updateChop(
  g: Game,
  p: Player,
  c: Controls,
  target: Station | null,
  bEdge: boolean,
  cuttable: boolean,
  burning: boolean,
  wasCutting: boolean,
  wasDousing: boolean,
): number {
  if (p.assist) {
    // Ayudante: a tap of B starts the chop (or the extinguisher: the same latch, it goes on until the fire is out) and it goes on while the chef stays and there is something to do; the stick (or the item being done) ends it
    if (bEdge && cuttable) p.chopLatch = true;
    else if (p.chopLatch && (!cuttable || (Math.hypot(c.x, c.y) > ASSIST_STICK_CANCEL && !pushesInto(p, target!, c)))) p.chopLatch = false;
  }
  p.cutting = !!((c.b || p.chopLatch) && cuttable);
  if (g.burn) p.dousing = p.cutting && burning;
  const at = target ? g.stations.indexOf(target) : -1;
  const wasAt = p.chopAt;
  if (wasCutting && (!p.cutting || at !== wasAt))
    g.bus.emit(
      wasDousing
        ? 'douseStop'
        : g.stations[wasAt]?.kind === 'sink' || g.stations[wasAt]?.kind === 'saucepot'
          ? 'washStop'
          : g.stations[wasAt]?.kind === 'pot'
            ? 'foldStop'
            : 'chopStop',
      { player: p.id, station: wasAt },
    );
  if (p.cutting && (!wasCutting || at !== wasAt))
    g.bus.emit(
      p.dousing
        ? 'douseStart'
        : target!.kind === 'sink' || target!.kind === 'saucepot'
          ? 'washStart'
          : target!.kind === 'pot'
            ? 'foldStart'
            : 'chopStart',
      {
        player: p.id,
        station: at,
      },
    );
  p.chopAt = p.cutting ? at : -1;
  if (p.cutting) {
    p.vx = 0;
    p.vy = 0;
    p.kx = 0;
    p.ky = 0;
    p.dashMs = 0;
  }
  return at;
}

// Picar's progress at the station in front: a sink washes, a fire is put out, an oven folds, a board cuts. False when there is nothing to work on (the chef walks).
export function applyChop(g: Game, p: Player, target: Station | null, at: number, dtMs: number): boolean {
  if (p.cutting && target?.kind === 'sink') {
    target.progress += dtMs / WASH_MS;
    if (target.progress >= 1) {
      target.count--;
      target.clean++;
      target.progress = 0;
      g.bus.emit('washDone', { player: p.id, station: at });
    }
  } else if (p.cutting && target && p.dousing) {
    douse(g, p.id, target, dtMs); // the fire is out when the Picar of the chefs in front of it adds up to DOUSE_MS
  } else if (p.cutting && target?.kind === 'saucepot') {
    if (stirStep(g, target, dtMs)) g.bus.emit('washDone', { player: p.id, station: at }); // recipes/sauce.ts: the sauce is ready
  } else if (p.cutting && target?.kind === 'pot') {
    foldStep(g, p.id, target, dtMs); // recipes/sim.ts: Picar at an oven with dough and tomato folds the calzone
  } else if (p.cutting && target) {
    target.progress += dtMs / cutMsOf(g, target.item);
    if (target.progress >= 1) {
      target.item = canSlice(g, target.item) ? slicedOf(target.item!) : cutOf(target.item!);
      target.progress = 0;
      g.bus.emit('chopDone', { player: p.id, station: at });
    }
  } else {
    return false;
  }
  return true;
}
