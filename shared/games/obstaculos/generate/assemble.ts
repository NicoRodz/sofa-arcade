// Gluing pieces (start cap, runs, modules, end cap) into one LevelDef: renames the local letters and adds the outer walls.
import type { Biome, EntityParam, LevelDef, Tether } from '../types';
import { GROUND_ROW, MODULE_ROWS } from '../modules/types';

export interface Piece { w: number; rows: string[]; params?: Record<string, EntityParam> }

const ACT = 'abcdef', OBJ = 'ABCDEF';

export class LetterPool {
  private act = 0;
  private obj = 0;
  free(kind: 'act' | 'obj'): number { return 6 - (kind === 'act' ? this.act : this.obj); }
  take(kind: 'act' | 'obj'): string | null {
    if (kind === 'act') return this.act < 6 ? ACT[this.act++]! : null;
    return this.obj < 6 ? OBJ[this.obj++]! : null;
  }
}

export const lettersOf = (p: Piece): { act: string[]; obj: string[] } => {
  const set = new Set<string>(p.rows.join('').split('').filter((c) => ACT.includes(c) || OBJ.includes(c)));
  return { act: [...set].filter((c) => ACT.includes(c)), obj: [...set].filter((c) => OBJ.includes(c)) };
};

// Renames the piece's letters with fresh ones from the pool, or returns null when the pool is too short.
export function rename(p: Piece, pool: LetterPool): Piece | null {
  const { act, obj } = lettersOf(p);
  if (act.length > pool.free('act') || obj.length > pool.free('obj')) return null;
  const map = new Map<string, string>();
  for (const c of act) map.set(c, pool.take('act')!);
  for (const c of obj) map.set(c, pool.take('obj')!);
  if (map.size === 0) return p;
  const rows = p.rows.map((r) => [...r].map((c) => map.get(c) ?? c).join(''));
  const params: Record<string, EntityParam> = {};
  for (const [k, v] of Object.entries(p.params ?? {})) {
    const nk = map.get(k) ?? k;
    params[nk] = 'opens' in v ? { ...v, opens: map.get(v.opens) ?? v.opens } : v.kind === 'balance' ? { ...v, partner: map.get(v.partner) ?? v.partner } : v;
  }
  return { w: p.w, rows, params };
}

export const flatCap = (w: number, marker?: { ch: string; x: number }): Piece => {
  const rows = Array.from({ length: MODULE_ROWS }, (_, y) => (y > GROUND_ROW ? '#'.repeat(w) : '.'.repeat(w)));
  if (marker) rows[GROUND_ROW] = rows[GROUND_ROW]!.slice(0, marker.x) + marker.ch + rows[GROUND_ROW]!.slice(marker.x + 1);
  return { w, rows };
};

export function glue(pieces: Piece[]): { rows: string[]; params: Record<string, EntityParam>; width: number } {
  const rows: string[] = Array.from({ length: MODULE_ROWS }, () => '#');
  const params: Record<string, EntityParam> = {};
  for (const p of pieces) {
    p.rows.forEach((r, y) => { rows[y] += r; });
    Object.assign(params, p.params);
  }
  const out = rows.map((r) => r + '#');
  return { rows: out, params, width: out[0]!.length };
}

export interface BuildMeta { id: string; name: string; biome: Biome; players: { min: number; max: number }; tether: Tether; stars: 1 | 2 | 3 | 4 | 5; parSec: number }
export function toLevel(pieces: Piece[], meta: BuildMeta): LevelDef {
  const g = glue(pieces);
  return { ...meta, rows: g.rows, ...(Object.keys(g.params).length ? { params: g.params } : {}) };
}
