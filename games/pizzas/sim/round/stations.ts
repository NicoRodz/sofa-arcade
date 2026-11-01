// A at a station: what each kind does with what the chef carries (the oven included), the cooking clock, plus the plates that come back dirty and the pantry that refills.
import { tag, type Game, type Player, type Station } from './state';
import { PANTRY_EVERY_MS, PANTRY_MAX } from '../versus/versus';
import { cookMsOf, crateItem } from '../recipes/sim';
import { bellTick, canLoad, hasNonna, interactSaucepot, isBaking, potTypeOf, ringBell, stageAfterLoad, stickTick } from '../recipes/sauce';
import { cutOf, dishFor, isDish } from '../recipes/defs';
import { basilOn, canSlice, hasCasa } from '../recipes/casa';
import { sabotageBinned, sabotageLoad, sabotageTakeBag } from '../sabotage';
import { DIRTY_MS } from '@pichi/core';
import { deliver } from './orders';
import { clearPot, isDark } from '../burn';
import { mechOvenRate } from '../mech/loop';

function interact(g: Game, p: Player, s: Station) {
  if (s.fire !== undefined) return; // on fire: nothing works until it is put out
  switch (s.kind) {
    case 'crate':
      if (s.crate === 4) {
        if (p.item === 'dishQ' && g.rec?.recipes.includes('margfresca'))
          p.item = 'dishQB'; // the basil goes onto the plate, nothing is handed out
        else if (p.item === 'dishN' && hasNonna(g))
          p.item = 'dishNB'; // ... and on the sauce pizza: the Marinara de la nonna
        else if (basilOn(g, p.item)) p.item = basilOn(g, p.item); // ... and on a Pizza de la casa: an upgrade
        break;
      }
      if (p.item) break;
      if (s.pantry) {
        // the shared pantry: a unit of the common stock, or nothing when it ran out (the other team may have emptied it)
        const pantry = g.pantry!;
        if (pantry.stock <= 0) break;
        if (pantry.stock === PANTRY_MAX) pantry.nextAt = g.time + PANTRY_EVERY_MS; // the refill clock starts when the stock leaves the maximum
        pantry.stock--;
      }
      p.item = crateItem(g, s.crate);
      break;
    case 'plates':
      if (!g.finitePlates) {
        if (!p.item) p.item = 'plate';
      } else if (!p.item) {
        if (s.count > 0) {
          s.count--;
          p.item = 'plate';
        }
      } else if (p.item === 'plate') {
        s.count++;
        p.item = null;
      } // put a clean plate back on the pile
      break;
    case 'dirty': // return window: take one dirty plate
      if (!p.item && s.count > 0) {
        s.count--;
        p.item = 'dirty';
      }
      break;
    case 'sink':
      if (p.item === 'dirty') {
        s.count++;
        p.item = null;
      } else if (p.item === 'plate') {
        s.clean++;
        p.item = null;
      } // the sink also works as a pile of clean plates
      else if (!p.item && s.clean > 0) {
        s.clean--;
        p.item = 'plate';
      }
      break;
    case 'counter':
      if (p.item && !s.item) {
        s.item = p.item;
        p.item = null;
      } else if (!p.item && s.item) {
        p.item = s.item;
        s.item = null;
      }
      break;
    case 'board':
      if (p.item && !s.item && (cutOf(p.item) || canSlice(g, p.item))) {
        s.item = p.item;
        s.progress = 0;
        p.item = null;
      } else if (!p.item && s.item) {
        p.item = s.item;
        s.item = null;
        s.progress = 0;
      }
      break;
    case 'pot':
      interactPot(g, p, s);
      break;
    case 'saucepot':
      interactSaucepot(g, p, s);
      break;
    case 'trash':
      if (g.sab && !p.item) {
        sabotageTakeBag(g, p);
        break;
      } // sabotage: empty hands take the bag that is waiting
      if (g.finitePlates && (p.item === 'plate' || p.item === 'dirty')) break; // plates are not rubbish: they would be lost for good
      if (g.finitePlates && (isDish(p.item) || p.item === 'burnt')) g.teams[p.team]!.dirtyDue.push(g.time + DIRTY_MS); // the plate under the pizza comes back
      if (g.sab && p.item) sabotageBinned(g, p, p.item); // what is binned feeds the team's catapult
      p.item = null;
      break;
    case 'catapult':
      if (g.sab) sabotageLoad(g, p, s);
      break;
    case 'window':
      deliver(g, p);
      break;
  }
}

// Runs one A press and reports what happened as events.
export function act(g: Game, p: Player, s: Station) {
  const team = g.teams[p.team]!;
  const before = { held: p.item, shelf: s.item, baked: baked(s), done: s.done, delivered: team.delivered, rejected: team.rejected };
  interact(g, p, s);
  if (team.delivered !== before.delivered || team.rejected !== before.rejected) return; // 'delivered' or 'dishRejected' already emitted
  const garnished = s.kind === 'crate' && s.crate === 4 && !!before.held && p.item !== before.held; // the basil on a plate counts as picking something up
  if ((!before.held || garnished) && p.item) g.bus.emit('itemPicked', { player: p.id, item: p.item, from: s.kind });
  else if (before.held && !p.item) g.bus.emit('itemDropped', { player: p.id, item: before.held, at: s.kind });
  else g.bus.emit('interactInvalid', { player: p.id });
  if (s.kind === 'pot' && !before.baked && baked(s)) g.bus.emit('potStart', { station: g.stations.indexOf(s), ...tag(g, s.owner) });
}

// A pizza cooks once it has dough and tomato; cheese can still go on until it is done (then it is a Margarita).
const baked = isBaking; // dough and tomato (or the sauce); the stages of the Pizza blanca count too

// A at an oven: a cut ingredient goes in, or a plate takes the ready pizza out.
export function interactPot(g: Game, p: Player, s: Station) {
  const t = potTypeOf(p.item);
  if (canLoad(g, s, t)) {
    s.inputs.push(t);
    stageAfterLoad(g, s, t);
    if (!baked(s)) s.progress = 0;
    p.item = null;
  } else if (p.item === 'plate' && s.done) {
    if (g.burn && s.warned && !s.burnt) g.bus.emit('oven:rescued', { player: p.id, station: g.stations.indexOf(s), ...tag(g, s.owner) }); // out of the oven after the warning, before it burnt
    p.item = s.burnt ? 'burnt' : dishFor(s.inputs, !!s.folded, hasCasa(g));
    clearPot(s);
  }
}

// The ovens cook: a pot with dough and tomato advances unless the lights are out; a ready pizza starts its burn clock (burn only).
export function cookTick(g: Game, dtMs: number) {
  const dark = isDark(g); // the "Corte de luz" event: the ovens do not cook
  for (const s of g.stations) {
    if (s.kind === 'saucepot') stickTick(g, s);
    if (s.kind === 'pot' && s.stage === 'bell') bellTick(g, s, dtMs, dark);
    else if (s.kind === 'pot' && !s.done && baked(s) && !dark) {
      const rate = g.mech ? mechOvenRate(g, s) : 1000; // permil: W and the thermal oven (mech/); 1000 = as always
      s.progress += (rate === 1000 ? dtMs : (dtMs * rate) / 1000) / cookMsOf(g, s);
      if (s.progress >= 1 && s.stage === 'base') ringBell(g, s);
      else if (s.progress >= 1) {
        s.progress = 1;
        s.done = true;
        if (g.burn) s.readyAt = g.time;
        g.bus.emit('potReady', { station: g.stations.indexOf(s) });
      }
    }
  }
}

// Delivered plates come back dirty, to the team's own return.
export function returnDirtyPlates(g: Game) {
  for (const team of g.teams)
    while (team.dirtyDue.length && team.dirtyDue[0]! <= g.time) {
      // delivered plates come back dirty, to the team's own return
      team.dirtyDue.shift();
      const back = g.stations.filter((s) => s.kind === 'dirty' && s.owner === team.id).sort((a, b) => a.count - b.count)[0];
      if (back) {
        back.count++;
        g.bus.emit('dirtyNew', { station: g.stations.indexOf(back), ...tag(g, team.id) });
      }
    }
}

// The shared pantry refills one unit every PANTRY_EVERY_MS while it is below PANTRY_MAX.
export function refillPantry(g: Game) {
  const pantry = g.pantry;
  while (pantry && pantry.stock < PANTRY_MAX && g.time >= pantry.nextAt) {
    pantry.stock++;
    pantry.nextAt = pantry.stock < PANTRY_MAX ? pantry.nextAt + PANTRY_EVERY_MS : Infinity;
    g.bus.emit('pantryRefill', { stock: pantry.stock });
  }
}
