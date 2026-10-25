// The reachability graph of one game state: every way to get from a standing segment to another (plain, hand, tower, throw, ride, swing...).
import { JUMP_V0, PLAYER_H, PLAYER_W, TILE } from '../../constants';
import { T } from '../../legend';
import type { ParsedLevel } from '../../parse';
import { tileAt } from '../../sim/tiles';
import { campaignParams, superJumpV0 } from '../../sim/campaign';
import { THROW_VX, THROW_VY } from '../../sim/tuning';
import type { Cell } from '../../types';
import { EDGE_MOVE_SCALE, feetOfRow, simPlan, type Landing, type Plan } from '../sim';
import { catchZonesFor, planSet, towerPlans } from './plans';
import { newSimCache, simCached, windowKey } from './simcache';
import {
  adjOpen,
  buildSegments,
  buildTerrain,
  CHAIN_MAX_DX,
  can,
  envParams,
  findLadders,
  pullSafe,
  ringsOf,
  ropeCapsRise,
  seesFrom,
  SWING_FAR,
  SWING_NEAR,
  surfaceTiming,
} from './terrain';
import type { Edge, EdgeKind, Env, Graph, GraphOpts, OpenState, Seg } from './types';

export function buildGraph(p: ParsedLevel, env: Env, S: OpenState, doors: Cell[][], opts: GraphOpts): Graph {
  const { grid, shifted } = buildTerrain(p, env, S, doors);
  const { segs, cellSeg } = buildSegments(grid);
  const { physics: params, dp, ropeLen } = envParams(env);
  const cp = env.world ? campaignParams(env.n, env.world) : null;
  const adj: Edge[][] = segs.map(() => []);
  const ladders = findLadders(grid);
  const best = new Map<string, Edge>();
  const addEdge = (e: Edge) => {
    if (e.from === e.to) return;
    const key = `${e.from}>${e.to}:${e.kind}`;
    const old = best.get(key);
    if (!old || e.steps < old.steps) best.set(key, e);
  };
  const toEdge = (from: Seg, l: Landing, kind: EdgeKind, plan: Plan, coop: boolean, k?: number): Edge | null => {
    const to = cellSeg[l.ty * grid.w + l.cx];
    if (to === undefined || to < 0) return null;
    if (shifted[(l.ty + 1) * grid.w + l.cx]) return null; // that platform is somewhere else until somebody rides it
    const dx = Math.abs(l.landX - l.takeoffX);
    if (env.mode === 'chain' && dx > (kind === 'throw' && cp ? ropeLen * cp.throwSlack : CHAIN_MAX_DX)) return null; // the campaign throw's rope stretches (sim/actions.ts slackRope)
    const tgt = segs[to]!;
    if (kind !== 'superjump' && ropeCapsRise(env, feetOfRow(from.row) - feetOfRow(tgt.row))) return null; // a super jump lifts BOTH: nobody hangs from the rope
    if ((from.tramp || tgt.tramp) && !can(env, 'spring')) return null;
    const timing =
      from.tramp === true ||
      tgt.tramp === true ||
      surfaceTiming(grid, from.row, from.x0, from.x1) ||
      surfaceTiming(grid, tgt.row, tgt.x0, tgt.x1) ||
      l.steps > 140;
    return {
      from: from.id,
      to,
      kind,
      coop,
      timing,
      steps: l.steps,
      takeoffX: l.takeoffX,
      landX: l.landX,
      plan,
      k,
      rise: feetOfRow(from.row) - feetOfRow(tgt.row),
      landCell: { x: l.cx, y: l.ty },
    };
  };
  const f = EDGE_MOVE_SCALE;
  const catches =
    opts.catchTargets && can(env, 'hand') ? catchZonesFor(grid, segs, (id) => opts.catchTargets!.has(id), dp.handZoneTiles) : undefined;
  const maxTower = Math.min(3, env.n - 1);

  const cols: string[] = [];
  for (let x = 0; x < grid.w; x++) {
    let c = '';
    for (let y = 0; y < grid.h; y++) c += String.fromCharCode(48 + grid.cells[y * grid.w + x]!);
    cols.push(c);
  }
  const cache = opts.cache ?? newSimCache();
  for (const s of segs) {
    if (s.tramp && !can(env, 'spring')) continue;
    const wk = windowKey(grid, cols, s, params);
    let bucket = cache.get(wk);
    if (!bucket) {
      bucket = new Map();
      cache.set(wk, bucket);
    }
    for (const plan of planSet(grid, s, f).filter((q) => can(env, 'jump') || q.trigger === 'walk' || s.tramp)) {
      const l = simCached(grid, params, s, plan, bucket);
      if (l) {
        const e = toEdge(s, l, 'jump', plan, false);
        if (e) addEdge(e);
      }
      if (catches && plan.trigger !== 'walk' && plan.trigger !== 'drop') {
        const h = simPlan(grid, params, plan, catches);
        if (h && h.viaHand) {
          const e = toEdge(s, h, 'hand', plan, true);
          if (e) addEdge(e);
        }
      }
    }
    // Super jump (campaign dynamic 3, n = 2): both jump within the pairing window and rise x1.3, so the pair reaches ledges and gaps a plain jump does not. Both go: followers get it too.
    // Modelled for the partner that jumped FIRST (boost `window` steps after its jump: the lower peak), so a pair that lands together has margin. A plain run-up or a jump from a spot.
    if (cp && env.n === 2 && can(env, 'superjump')) {
      const boost = superJumpV0(cp) - JUMP_V0,
        delay = Math.round(cp.superJumpWindowMs / (1000 / 60));
      for (const base of planSet(grid, s, f)) {
        if (base.trigger !== 'at' && base.trigger !== 'edge') continue;
        const plan: Plan = { ...base, boost, boostDelay: delay };
        const l = simCached(grid, params, s, plan, bucket);
        if (l) {
          const e = toEdge(s, l, 'superjump', plan, true);
          if (e) addEdge({ ...e, timing: true });
        } // both must jump within the window: timing
      }
    }
    if (opts.pioneer && maxTower >= 1 && can(env, 'tower')) {
      for (const { plan, k } of towerPlans(grid, s, f, maxTower)) {
        const l = simCached(grid, params, s, plan, bucket);
        if (l) {
          const e = toEdge(s, l, 'tower', plan, true, k);
          if (e) addEdge(e);
        }
      }
    }
    // Campaign, tied: the throw is not a one-way trip. The thrown one plants on the far side and the thrower is PULLED across (it falls off the near edge, hangs from the rope under
    // the far ledge, and is hauled up when the partner un-plants and walks away: sim/actions.ts slackRope + the edge assist), so followers get the throw edges too, as long as the
    // landing is at most a tile above the takeoff (a wall stays the hand's job: the learning test of 1-5 depends on it) and nothing lethal lies in the band where it would hang (pullSafe).
    const pull = !!cp && env.mode === 'chain' && env.n === 2;
    if ((opts.pioneer || pull) && env.n >= 2 && can(env, 'throw')) {
      // throw: the thrower lifts a partner and launches him at (420 x throwVxMult, -950) px/s (plan §2)
      for (const dir of [-1, 1] as const) {
        const x = dir === 1 ? (s.x1 + 1) * TILE - PLAYER_W : s.x0 * TILE;
        const plan: Plan = {
          x,
          feetY: feetOfRow(s.row) - PLAYER_H,
          dir,
          trigger: 'launch',
          k: 0,
          air: 'hold',
          f: 1,
          vx0: dir * THROW_VX * (cp?.throwVxMult ?? 1) * f,
          vy0: THROW_VY * f,
        };
        const l = simCached(grid, params, s, plan, bucket);
        if (l) {
          const e = toEdge(s, l, 'throw', plan, true);
          if (e && (opts.pioneer || (e.rise <= TILE && pullSafe(grid, s, segs[e.to]!, e, ropeLen)))) addEdge(e);
        } // followers: gaps only (landing at most a tile above); a wall is the hand's job
      }
    }
  }

  // Ladders: every segment next to a ladder column (same row range, or the ledge one above its top) is connected to the others.
  for (const lad of can(env, 'ladder') ? ladders : []) {
    const attached = new Set<number>();
    for (const s of segs) {
      if (s.row < lad.y0 - 1 || s.row > lad.y1) continue;
      if (lad.x >= s.x0 - 1 && lad.x <= s.x1 + 1) attached.add(s.id);
    }
    const ids = [...attached];
    for (const a of ids)
      for (const b of ids) {
        if (a === b) continue;
        const sa = segs[a]!,
          sb = segs[b]!;
        addEdge({
          from: a,
          to: b,
          kind: 'ladder',
          coop: false,
          timing: false,
          steps: 60 + Math.abs(sa.row - sb.row) * 10,
          takeoffX: lad.x * TILE,
          landX: lad.x * TILE,
          rise: feetOfRow(sa.row) - feetOfRow(sb.row),
          landCell: { x: Math.min(Math.max(lad.x, sb.x0), sb.x1), y: sb.row },
        });
      }
  }

  // Ice walls ('I') with the pickaxe (campaign dynamic 9): from a segment whose end touches the foot of a wall, up the contiguous ice to the standing cell above it. The climber is a rope
  // anchor, so the partner is hoisted along: followers use the edge too, and the rope's rise cap (ropeCapsRise) does not apply (that is the pickaxe's niche: walls taller than a tower).
  if (S.pick && can(env, 'pickaxe')) {
    for (const s of segs)
      for (const side of [-1, 1] as const) {
        const x = side > 0 ? s.x1 + 1 : s.x0 - 1;
        if (tileAt(grid, x, s.row) !== T.Ice) continue;
        let t = s.row;
        while (tileAt(grid, x, t - 1) === T.Ice) t--;
        const id = cellSeg[(t - 1) * grid.w + x];
        if (id === undefined || id < 0) continue;
        const tgt = segs[id]!;
        addEdge({
          from: s.id,
          to: id,
          kind: 'climb',
          coop: false,
          timing: false,
          steps: (s.row - t + 1) * 60 + 30,
          takeoffX: side > 0 ? (s.x1 + 1) * TILE - PLAYER_W : s.x0 * TILE,
          landX: x * TILE,
          rise: feetOfRow(s.row) - feetOfRow(tgt.row),
          landCell: { x, y: t - 1 },
        });
      }
  }

  // Movers and balances: riding connects the segment above each of the platform's positions.
  for (const o of Object.values(p.objects)) {
    const q = o.param;
    if (!q || (q.kind !== 'mover' && q.kind !== 'balance')) continue;
    if (q.kind === 'balance' && env.n < 3 && !env.world) continue;
    if (!can(env, q.kind)) continue;
    const shifts: [number, number][] =
      q.kind === 'mover'
        ? [
            [0, 0],
            [Math.round(q.dx), Math.round(q.dy)],
          ]
        : [
            [0, 0],
            [0, Math.round(q.travel)],
            [0, -Math.round(q.travel)],
          ];
    if (q.kind === 'mover' && !adjOpen(p, o.char, S)) continue;
    const ids: number[] = [];
    for (const [sx, sy] of shifts) {
      const top = Math.min(...o.cells.map((c) => c.y)) + sy;
      for (const c of o.cells) {
        if (c.y + sy !== top) continue;
        const id = cellSeg[(top - 1) * grid.w + c.x + sx];
        if (id !== undefined && id >= 0 && !ids.includes(id)) ids.push(id);
      }
    }
    for (const a of ids)
      for (const b of ids) {
        if (a === b) continue;
        const sa = segs[a]!,
          sb = segs[b]!;
        if (q.kind === 'balance' && env.n < 3 && sb.row <= sa.row) continue; // campaign with 2: alone on a plate it only goes DOWN (the empty one rises with nobody); up needs a heavier partner side
        addEdge({
          from: a,
          to: b,
          kind: 'ride',
          obj: o.char,
          coop: q.kind === 'balance' && env.n >= 3,
          timing: true,
          steps: 240,
          takeoffX: sa.x0 * TILE,
          landX: sb.x0 * TILE,
          rise: feetOfRow(sa.row) - feetOfRow(sb.row),
          landCell: { x: sb.x0, y: sb.row },
        });
      }
  }

  // Rope swings (Encadenados only): a partner anchors on a ring, the other hangs from it and lets go within SWING_FAR.
  if (env.mode === 'chain' && env.n >= 2 && ringsOf(p).length && can(env, 'swing')) {
    const center = (s: Seg, x: number) => ({ x: x * TILE + TILE / 2, y: s.row * TILE + TILE / 2 });
    for (const ring of ringsOf(p)) {
      const rc = { x: ring.x * TILE + TILE / 2, y: ring.y * TILE + TILE / 2 };
      const near: { s: Seg; x: number }[] = [],
        far: { s: Seg; x: number }[] = [];
      for (const s of segs) {
        let bn = Infinity,
          bx = s.x0,
          bf = Infinity,
          fx = s.x0;
        for (let x = s.x0; x <= s.x1; x++) {
          const c = center(s, x),
            d = Math.hypot(c.x - rc.x, c.y - rc.y);
          if (d < bn) {
            bn = d;
            bx = x;
          }
          if (d < bf) {
            bf = d;
            fx = x;
          }
        }
        if (bn <= SWING_NEAR) near.push({ s, x: bx });
        if (bf <= SWING_FAR && seesFrom(grid, rc, center(s, fx))) far.push({ s, x: fx });
      }
      const ringIdx = ringsOf(p).indexOf(ring);
      for (const a of near)
        for (const b of far) {
          if (a.s.id === b.s.id) continue;
          addEdge({
            ring: ringIdx,
            from: a.s.id,
            to: b.s.id,
            kind: 'swing',
            coop: true,
            timing: false,
            steps: 90,
            takeoffX: a.x * TILE,
            landX: b.x * TILE,
            rise: feetOfRow(a.s.row) - feetOfRow(b.s.row),
            landCell: { x: b.x, y: b.s.row },
          });
        }
    }
  }

  for (const e of best.values()) adj[e.from]!.push(e);
  return { grid, shifted, segs, cellSeg, adj, params, env, ladders, dp, ropeLen };
}
