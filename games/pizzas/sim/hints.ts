// Contextual buttons (council M1): what A and B do for a chef RIGHT NOW, as a label + icon + "nothing to do" flag for the phone.
// Pure: it reads the game state, never changes it, draws nothing from the RNG. The screen computes it after every batch of sim ticks and
// sends it as the state of that tick (the `hint` message), so a late packet is just replaced by the next one. The phone has two buttons and
// keeps two: only their names, glyphs and greying change.
// It mirrors interact() / the B rules of overcooked.ts; hints.test.ts pins each case against what the sim really does.
import type { IconId } from '@pichi/core/icons';
import type { ClientMsg, HintLabels } from '@pichi/core';
import { aStation, targetStation } from './round/targeting';
import { floorItemNear } from './round/hazards';
import type { Game, Item, Player, Station } from './round/state';
import { isAiming, sabotageHint } from './sabotage';
import { RAW_OF, cutType, isDish } from './recipes/defs';
import { canFold } from './recipes/sim';

const CRATE_VERB = ['Tomar masa', 'Tomar tomate', 'Tomar queso'] as const;
const TOPPING_VERB = ['Tomar queso', 'Pepperoni', 'Champiñón'] as const; // the cheese crate of a round with a Carta del día gives the card's topping (14 characters at most, LABEL_MAX)
const CRATE_ICON: readonly IconId[] = ['dough', 'crate', 'cheese'];
const CUT_VERB: Record<string, string> = { raw0: 'Estirar', raw1: 'Picar', raw2: 'Rallar', raw3: 'Rebanar', raw4: 'Picar' }; // what B does to each raw ingredient (stretch the dough, cut the tomato, grate the cheese, slice the pepperoni, cut the mushroom)
const RAW = new Set<Item>(RAW_OF);

type Btn = { label: string; icon: IconId; off?: boolean };
const on = (label: string, icon: IconId): Btn => ({ label, icon });
const off = (label: string, icon: IconId): Btn => ({ label, icon, off: true });

/** What A does with `s` in front of chef `p` (null `s`: nothing in front). */
function buttonA(g: Game, p: Player, s: Station | null, nearFloor: boolean): Btn {
  const full = !!p.item;
  if (!s) {
    if (!full && nearFloor) return on('Recoger', 'grab'); // hazards: rubbish or a dropped item close by
    return full ? off('Dejar', 'grab') : off('Tomar', 'grab');
  }
  if (s.fire !== undefined) return off('En llamas', 'oven'); // burn: nothing works on a station on fire until it is put out (B does that)
  switch (s.kind) {
    case 'crate': {
      const verb = (s.crate === 2 && g.rec ? TOPPING_VERB[g.rec.topping - 2] : CRATE_VERB[s.crate]) ?? 'Tomar',
        icon = CRATE_ICON[s.crate] ?? 'crate';
      if (full) return off('Manos llenas', icon);
      if (s.pantry && g.pantry!.stock <= 0) return off('Despensa vacía', icon); // 14 chars
      return on(verb, icon);
    }
    case 'plates':
      if (!full) return !g.finitePlates || s.count > 0 ? on('Tomar plato', 'plate') : off('Sin platos', 'plate');
      return g.finitePlates && p.item === 'plate' ? on('Devolver plato', 'plate') : off('Manos llenas', 'plate');
    case 'dirty':
      if (full) return off('Manos llenas', 'plate');
      return s.count > 0 ? on('Tomar sucio', 'plate') : off('Sin sucios', 'plate');
    case 'sink':
      if (p.item === 'dirty') return on('Al lavadero', 'wash');
      if (p.item === 'plate') return on('Dejar plato', 'wash');
      if (!full && s.clean > 0) return on('Tomar plato', 'wash');
      return off(full ? 'Manos llenas' : 'Lavadero', 'wash');
    case 'counter':
      if (full && !s.item) return on('Dejar', 'grab');
      if (!full && s.item) return on('Tomar', 'grab');
      return off(full ? 'Ocupado' : 'Vacío', 'grab');
    case 'board':
      if (full && !s.item) return RAW.has(p.item!) ? on('Poner en tabla', 'chop') : off('No se pica', 'chop');
      if (!full && s.item) return on(cutType(s.item) >= 0 ? 'Tomar picado' : 'Tomar', 'chop');
      return off(full ? 'Ocupado' : 'Tabla vacía', 'chop');
    case 'pot': {
      const t = cutType(p.item);
      if (t >= 0)
        return !s.done && !s.folded && !s.inputs.includes(t) && s.inputs.length < 3
          ? on('Al horno', 'oven')
          : off(s.done ? 'Aún no listo' : 'Ya lleva eso', 'oven');
      if (p.item === 'plate') return s.done ? on(s.burnt ? 'Sacar quemada' : 'Sacar pizza', 'oven') : off('Aún no listo', 'oven'); // burn: a burnt pizza comes out too, to go to the bin
      if (full) return RAW.has(p.item!) ? off('Pica primero', 'oven') : off('Manos llenas', 'oven');
      return off(s.done ? 'Falta plato' : s.inputs.length ? 'Cocinando' : 'Horno', 'oven');
    }
    case 'trash':
      if (g.sab && !full) return g.sab.teams[p.team]!.bags > 0 ? on('Tomar bolsa', 'trash') : off('Botar', 'trash');
      if (g.finitePlates && (p.item === 'plate' || p.item === 'dirty')) return off('No es basura', 'trash');
      return full ? on('Botar', 'trash') : off('Botar', 'trash');
    case 'catapult':
      return off('Catapulta', 'grab'); // the sabotage hint names it when there is something to load
    case 'window':
      if (isDish(p.item)) return g.teams[p.team]!.orders.length ? on('Entregar', 'bell') : off('Sin pedidos', 'bell');
      return off(full ? 'Solo pizzas' : 'Entregar', 'bell');
  }
}

/** What B does: hold on a board with a raw ingredient or at a sink with dirty plates; a tap with free hands and nothing in front is the dash. */
function buttonB(g: Game, p: Player, s: Station | null, front: Station | null = s): Btn {
  // front: what stops a dash (the old probe when the magnet is on)
  if (s?.kind === 'board' && s.item && RAW.has(s.item)) return on(CUT_VERB[s.item]!, 'chop');
  if (s?.fire !== undefined) return on('Apagar', 'oven'); // burn: Picar puts the fire out (an Ayudante taps it once and it goes on)
  if (s?.kind === 'sink' && s.count > 0) return on('Lavar', 'wash');
  if (s && canFold(g, s)) return on('Doblar', 'oven'); // a Carta del día with a calzone: Picar at the oven with dough and tomato folds it
  if (!p.item && !front) return p.dashMs <= 0 && p.dashCd <= 0 ? on('Correr', 'move') : off('Correr', 'move');
  return off('Picar', 'chop');
}

/** The labels of A and B for this chef now. A ghost (a dropped phone) gets the game's own labels. */
export function chefHint(g: Game, p: Player): HintLabels {
  if (p.ghost) return { a: null, b: null };
  if (p.slip) return { a: 'Sin control', b: 'Sin control', aIcon: 'grab', bIcon: 'chop', aOff: true, bOff: true };
  const s = targetStation(g, p),
    near = !!floorItemNear(g, p);
  const aiming = isAiming(g, p);
  const sa = aStation(g, p); // A's station: the rubbish beside a counter can win it under the magnet
  const sab = sabotageHint(g, p, sa, near); // the catapult and the bags: it names what only versus has
  const a = aiming
    ? off('Apuntando', 'grab')
    : sab.a
      ? on(sab.a, sab.a === 'Cargar' || sab.a === 'Recoger' ? 'grab' : 'trash')
      : buttonA(g, p, sa, near);
  const b = aiming ? on('¡Lanzar!', 'star') : buttonB(g, p, s, g.magnet && !p.assist ? targetStation(g, p, true) : s);
  return { a: a.label, b: b.label, aIcon: a.icon, bIcon: b.icon, ...(a.off ? { aOff: true } : {}), ...(b.off ? { bOff: true } : {}) };
}

// --- Sending: the state of every tick, whole --------------------------------------------------------------------------------------------------------
export const HINT_MIN_MS = 50; // a chef's labels change at most this often on the wire (walking along a counter flaps them every step)
export const HINT_REFRESH_MS = 1000; // ...and are sent again after this long even when nothing changed: a phone that reconnected, or missed one, is right again within a second
type HintMsg = Extract<ClientMsg, { t: 'hint' }>;

/**
 * The host's side of the contextual buttons. `sync(game, now)` is called after every batch of sim ticks: it sends each chef's labels when they differ
 * from the last ones sent (not faster than HINT_MIN_MS) or when HINT_REFRESH_MS went by; `sync(null, now)` (no round running) hands every labelled
 * phone back to the game's own labels. A label is never an event: the phone keeps the last whole state it got.
 */
export function createHintSync(send: (m: HintMsg) => void) {
  const sent = new Map<number, { key: string; at: number }>();
  return {
    sync(g: Game | null, now: number) {
      for (const id of [...sent.keys()])
        if (!g || !g.players.has(id)) {
          send({ t: 'hint', playerId: id, a: null, b: null });
          sent.delete(id);
        }
      if (!g) return;
      for (const p of g.players.values()) {
        const h = chefHint(g, p),
          key = JSON.stringify(h),
          last = sent.get(p.id);
        if (last && !(key !== last.key && now - last.at >= HINT_MIN_MS) && now - last.at < HINT_REFRESH_MS) continue;
        sent.set(p.id, { key, at: now });
        send({ t: 'hint', playerId: p.id, ...h });
      }
    },
  };
}
