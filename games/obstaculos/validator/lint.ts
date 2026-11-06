// Static lint of a parsed level, before any search runs (moved out of validate.ts).
import { RUN_SPEED, TILE } from '../constants';
import { T, isActivator } from '../legend';
import type { ParsedLevel } from '../parse';
import { campaignParams } from '../sim/rules/campaign';
import { doorGroupsOf, ringsOf } from './graph';

export function lint(p: ParsedLevel): string[] {
  const errors = [...p.errors];
  const d = p.def;
  const wPx = p.w,
    hPx = p.h;
  for (const [i, z] of (d.cameraZones ?? []).entries())
    if (z.w > 66 || z.h > 37) errors.push(`cameraZones[${i}] ${z.w}x${z.h} does not fit at zoom 0.6 (1920x1080 view = 66x37 tiles)`);
  if (d.cordadaMax !== undefined && ![2, 3, 4].includes(d.cordadaMax)) errors.push('cordadaMax must be 2, 3 or 4');
  if (!(d.stars >= 1 && d.stars <= 5)) errors.push('stars must be 1..5');
  if (d.hazard && !(d.hazard.speed > 0)) errors.push('hazard speed must be > 0');
  const doors = doorGroupsOf(p);
  if (doors.length > p.markers.key.length) errors.push(`${doors.length} door groups but ${p.markers.key.length} keys`);
  for (const o of Object.values(p.objects)) {
    const q = o.param;
    if (!q) continue;
    const shifts: [number, number][] =
      q.kind === 'mover'
        ? [[Math.round(q.dx), Math.round(q.dy)]]
        : q.kind === 'sinker'
          ? [[0, Math.round(q.travel)]]
          : q.kind === 'balance'
            ? [
                [0, Math.round(q.travel)],
                [0, -Math.round(q.travel)],
              ]
            : [];
    for (const [sx, sy] of shifts)
      for (const c of o.cells) {
        const x = c.x + sx,
          y = c.y + sy;
        if (x < 0 || y < 0 || x >= wPx || y >= hPx) errors.push(`'${o.char}' ${q.kind} leaves the grid at (${x},${y})`);
        else if (p.tiles[y * wPx + x] === T.Solid) errors.push(`'${o.char}' ${q.kind} runs into a solid at (${x},${y})`);
      }
    if ((q.kind === 'plate' || q.kind === 'lever' || q.kind === 'target') && !isActivator(o.char))
      errors.push(`'${o.char}' must be an activator letter`);
  }
  // A6 (dynamics 10-12)
  const crystals = p.tiles.reduce((n, k) => n + (k === T.Crystal ? 1 : 0), 0);
  if (crystals > 0 && p.markers.lantern.length === 0)
    errors.push(`${crystals} crystals ('Y') but no lantern ('l'): nothing ever lights them`);
  for (const o of Object.values(p.objects))
    if (o.param?.kind === 'geyser')
      for (const c of o.cells)
        if (!(p.tiles[(c.y + 1) * wPx + c.x] === T.Solid || p.tiles[(c.y + 1) * wPx + c.x] === T.FreeSolid))
          errors.push(`geyser '${o.char}' vent at (${c.x},${c.y}) has no solid floor under it`);
  const hasAct = (ch: string) =>
    Object.values(d.params ?? {}).some((q) => (q.kind === 'plate' || q.kind === 'lever' || q.kind === 'target') && q.opens === ch);
  // a target's gate closes after targetSec: the run from the target to the gate must fit (straight-line tiles at the run speed, with a quarter of the time in hand)
  const maxTargetTiles = Math.floor((0.75 * campaignParams(2).targetSec * RUN_SPEED) / TILE);
  for (const o of Object.values(p.objects)) {
    const q = o.param;
    if (q?.kind !== 'target') continue;
    const gate = p.objects[q.opens];
    if (!gate) continue;
    const cx = o.bounds.x + o.bounds.w / 2,
      cy = o.bounds.y + o.bounds.h / 2;
    const d2 = Math.min(...gate.cells.map((c) => Math.abs(c.x + 0.5 - cx) + Math.abs(c.y + 0.5 - cy)));
    if (d2 > maxTargetTiles)
      errors.push(
        `target '${o.char}' is ${d2.toFixed(0)} tiles from its gate '${q.opens}': at most ${maxTargetTiles} (the gate stays open ${campaignParams(2).targetSec} s)`,
      );
  }
  for (const o of Object.values(p.objects))
    if (o.param?.kind === 'gate' && !hasAct(o.char)) errors.push(`gate '${o.char}' has no activator: it never opens`);
  if (d.tether === 'freeOnly' && ringsOf(p).length) errors.push('rings only work tied (tether freeOnly has rings)');
  return errors;
}
