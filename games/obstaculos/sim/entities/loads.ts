import type { Weight } from '../../types';
import { bodyRect, type PxRect } from '../world/collide';
import { isActive, type World } from '../world/state';
import { BOX_SIZE, MOVER_ID0 } from '../world/tuning';

// --- 2. what stands on what: loads for plates and balance plates
interface Unit {
  id: number;
  w: number;
  rect: PxRect;
  supportId: number;
  standing: boolean;
}
function unitsOf(w: World): Map<number, Unit> {
  const m = new Map<number, Unit>();
  for (const p of w.players) {
    if (!isActive(p)) continue;
    m.set(p.slot, { id: p.slot, w: 1, rect: bodyRect(p.body), supportId: p.body.supportId, standing: p.body.grounded });
  }
  for (const b of w.ent.boxes) {
    if (b.holders.length > 0) continue;
    m.set(b.id, { id: b.id, w: b.heavy ? 2 : 1, rect: { x: b.x, y: b.y, w: BOX_SIZE, h: BOX_SIZE }, supportId: -1, standing: b.grounded });
  }
  return m;
}

export function computeLoads(w: World): void {
  for (const a of w.ent.activators) a.load = 0;
  for (const o of w.ent.objectives) o.load = 0;
  const units = unitsOf(w);
  const plates = w.ent.activators.filter((a) => a.kind === 'plate');
  const balances = w.ent.objectives.filter((o) => o.kind === 'balance' || o.kind === 'sinker'); // (a sinker's load is the same count)
  for (const u of units.values()) {
    if (!u.standing) continue;
    let base = u,
      depth = 0;
    while (base.supportId >= 0 && units.has(base.supportId) && depth++ < 12) base = units.get(base.supportId)!;
    if (base.supportId >= MOVER_ID0) {
      const o = balances.find((q) => q.platformId === base.supportId);
      if (o) o.load += u.w;
      continue;
    }
    if (base.supportId >= 0 || !base.standing) continue; // stood on something that is not a unit or a platform of ours
    const feet = base.rect.y + base.rect.h;
    for (const a of plates) {
      if (Math.abs(feet - (a.rect.y + a.rect.h)) <= 2.5 && base.rect.x < a.rect.x + a.rect.w && base.rect.x + base.rect.w > a.rect.x) {
        a.load += u.w;
        break;
      }
    }
  }
}

export function requiredWeight(weight: Weight, n: number): number {
  const v =
    weight === 'half-up'
      ? Math.ceil(n / 2)
      : weight === 'half-down'
        ? Math.floor(n / 2)
        : weight === 'all'
          ? n
          : weight === 'all-but-1'
            ? n - 1
            : Math.min(weight, n);
  return Math.max(1, v);
}
