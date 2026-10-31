// Heavy tray (design section 2, "Bandeja pesada"), implemented by T2. Whoever carries a plate of the Bandeja familiar walks at x0.45 and cannot dash. Another chef with empty hands that presses A facing
// the carrier takes the other end: both move at x1.0 along the AVERAGE of the two sticks, the helper does not collide with the carrier, and A lets go. A step onto a bridge with the tray wears it 3 (bridge module).
// State: game.mech.tray = { carrier, helper } (chef ids). Integers only, no RNG. Two hooks of the contract exist for it: `controls` (rewrites a chef's stick) and `noCollide`.
import type { Controls, Game, Player } from '../../round/state';
import type { MechModule } from '../types';
import { noopHooks } from '../noop';
import { heavyTrayValidate } from '../../validate/mech/heavyTray';
import { heavyTrayStamp } from '../../gen/stamps/heavyTray';
import { CARRY_PERMIL, COUPLE_REACH, COUPLED_PERMIL, RELEASE_DIST, carriesTray, coupled, startTrayExt, trayExt } from './state';

const live = (g: Game) => [...g.players.values()].filter((p) => !p.ghost).sort((a, b) => a.id - b.id);

/** The pair is kept while the carrier still carries, the helper is free-handed on the same team and they are close; else the helper lets go. */
function keepPair(g: Game) {
  const t = g.mech!.tray!;
  if (t.carrier === null || t.helper === null) return;
  const c = g.players.get(t.carrier),
    h = g.players.get(t.helper);
  if (!c || !h || !carriesTray(g, c) || h.ghost || h.item || h.team !== c.team || Math.hypot(c.x - h.x, c.y - h.y) > RELEASE_DIST)
    t.helper = null;
}

/** The first chef (by id) in front of `p` within reach that carries the tray, or null. */
function carrierInFront(g: Game, p: Player): Player | null {
  for (const q of live(g)) {
    if (q.id === p.id || q.team !== p.team || !carriesTray(g, q)) continue;
    const dx = q.x - p.x,
      dy = q.y - p.y,
      d = Math.hypot(dx, dy);
    if (d > COUPLE_REACH || (d > 1e-6 && (dx * p.fx + dy * p.fy) / (d * (Math.hypot(p.fx, p.fy) || 1)) < 0.3)) continue;
    return q;
  }
  return null;
}

export const heavyTrayModule: MechModule = {
  ...noopHooks,
  id: 'heavyTray',
  tanda: 'T2',
  validate: heavyTrayValidate,
  stamp: heavyTrayStamp,
  onLoad(g) {
    startTrayExt(g);
  },
  init(g) {
    g.mech!.tray = { carrier: null, helper: null };
  },
  beforeMove(g, controls) {
    const t = g.mech!.tray!;
    const sticks = trayExt(g).sticks;
    for (const p of g.players.values()) {
      const c = controls.get(p.id);
      sticks[p.id] = c ? [c.x, c.y] : [0, 0];
    }
    keepPair(g);
    if (t.helper === null) t.carrier = live(g).find((p) => carriesTray(g, p))?.id ?? null;
    for (const p of g.players.values()) if (carriesTray(g, p)) p.dashMs = 0; // picking the tray up in the middle of a dash ends it
  },
  controls(g, p, c): Controls {
    const t = g.mech!.tray!;
    if (t.carrier !== null && t.helper !== null && (p.id === t.carrier || p.id === t.helper)) {
      const s = trayExt(g).sticks;
      const a = s[t.carrier] ?? [0, 0],
        b = s[t.helper] ?? [0, 0];
      const k = COUPLED_PERMIL / 1000 / 2;
      return { ...c, x: (a[0] + b[0]) * k, y: (a[1] + b[1]) * k, ...(p.id === t.helper ? { b: false, bTaps: 0 } : {}) };
    }
    if (!carriesTray(g, p)) return c;
    return { ...c, x: (c.x * CARRY_PERMIL) / 1000, y: (c.y * CARRY_PERMIL) / 1000, b: false, bTaps: 0 }; // no dash (hands are full anyway), slow
  },
  noCollide: (g, a, b) => coupled(g, a.id, b.id),
  onInteract(g, p, c) {
    const t = g.mech!.tray!;
    const pressed = c.a > 0 || p.buffA > 0;
    if (!pressed) return false;
    if (t.helper === p.id) {
      t.helper = null; // A lets go
      p.buffA = 0;
      return true;
    }
    if (t.helper !== null || p.item) return false;
    const q = carrierInFront(g, p);
    if (!q) return false;
    t.carrier = q.id;
    t.helper = p.id;
    p.buffA = 0;
    return true;
  },
  hashExtra: (g) => [g.mech!.tray!.carrier ?? 0, g.mech!.tray!.helper ?? 0],
};
