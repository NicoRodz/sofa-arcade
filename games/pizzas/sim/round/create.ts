// A round and its chefs: createGame builds the Game (map, stations, teams, queues, the optional rule sets), addPlayer / removePlayer seat the chefs.
import { DEFAULT_DIFFICULTY, params as difficultyParams, teamSize, type Difficulty } from '@pichi/core/difficulty';
import { Emitter, type GameEvents } from '@pichi/core/events';
import { MAX_SLOTS, type Game, type Station, type TeamSeat, type TeamState } from './state';
import { FIXED_MAPS, parseMap, spawnPoints, type Pos, type SigmaName } from '../maps';
import type { SabotageMode } from '../sabotage-config';
import { newSurfaceState } from '../surfaces/config';
import { createMutate } from '../mutate/step';
import { applyMagnet, type MagnetLevel } from '../feel/magnet';
import { PANTRY_MAX, VIP_EVERY_MS, kitchenRegions, stationOwner, teamStarts } from '../versus/versus';
import { teamMultipliers } from '@pichi/core/lobby/teams';
import { mulberry32 } from '@pichi/core/rng';
import { createRec } from '../recipes/sim';
import { spawnOrder } from './orders';
import { createSabotage } from '../sabotage';
import { createBurn, fireAllowed } from '../burn';
import { createMid } from '../midround';
import { anyMech, MECH_IDS, type MechFlags, type MechOpts } from '../mech/ids';
import { mechStart } from '../mech/loop';
import { armMutation } from '../mech/mutation/module';
import { invertOps, type MutationV2 } from '../mech/mutation/ops';

const LEGACY = [
  'score',
  'delivered',
  'streak',
  'bestStreak',
  'tips',
  'expired',
  'rejected',
  'orders',
  'rng',
  'dirtyDue',
  'nextOrderAt',
  'orderSeq',
] as const;

export function createGame(
  opts: {
    mapId?: string;
    difficulty?: Difficulty;
    n?: number;
    rows?: readonly string[];
    spawns?: readonly [number, number][];
    seed?: number;
    countdownMs?: number;
    bus?: Emitter<GameEvents>;
    teams?: readonly TeamSeat[];
    handicap?: boolean;
    shared?: readonly Pos[];
    hazards?: boolean;
    slipDrops?: boolean;
    spoilRaw?: boolean;
    sabotage?: SabotageMode;
    sigma?: SigmaName;
    assist?: readonly number[];
    burn?: boolean;
    fire?: boolean;
    events?: boolean;
    eventsSeed?: number;
    recipes?: boolean;
    magnet?: boolean | MagnetLevel;
    surfaces?: boolean;
    mutate?: boolean;
    mutation?: MutationV2; // the map's v2 mutation (mech/mutation/ops.ts); it runs only with flags.mech.mutation
    mech?: MechOpts; // flags.mech.<id>: the map mechanics that are on (off by default; the lobby turns on the ones the map declares). Absent or all false = the round of before
    frost?: boolean; // the Ola de frio event may be drawn (coop only)
    upgradeOrders?: boolean; // the Pizza de la casa takes upgrades (recipes/casa.ts)
    sliceAfterBake?: boolean; // ... and can be cut into portions on a board
    compoundOrders?: boolean; // the Bandeja familiar: one ticket of three plates (recipes/bandeja.ts); coop only
    adaptive?: boolean; // the order flow follows the load of the queue (recipes/pacing.ts)
    pace?: number; // order-flow speed-up (1 = the table as it is): orders arrive 1/pace as far apart and the queue holds one more from 1.3 up
  } = {},
): Game {
  const mechOn = anyMech(opts.mech);
  const grid = parseMap(opts.rows ?? FIXED_MAPS[0]!.rows, (opts.teams?.length ?? 1) > 1, opts.mech); // the catapult letter belongs to versus maps; a mechanic's letter needs its flag
  const difficulty = opts.difficulty ?? DEFAULT_DIFFICULTY;
  const seats = opts.teams;
  if (seats && !seats.length) throw new RangeError('a round needs at least one team');
  const teamCount = seats?.length ?? 1;
  const versus = teamCount > 1;
  // the order flow is sized for the average team (versus: round((nA + nB) / 2), 3v2 plays at 3); coop keeps its own team size
  const n = opts.n ?? (seats ? Math.round(seats.reduce((a, t) => a + t.playerIds.length, 0) / teamCount) : 2);
  const p = difficultyParams(difficulty, n);
  if (opts.pace && opts.pace !== 1) {
    p.orderEveryMs /= opts.pace;
    if (opts.pace >= 1.3) p.maxOrders += 1;
  }
  const seed = opts.seed ?? 1;
  const kitchens = versus ? kitchenRegions(grid, teamCount, opts.spawns) : null;
  const stations: Station[] = [];
  const pantryAt = new Set(versus ? (opts.shared ?? []).map(([x, y]) => `${x},${y}`) : []); // only a versus round has a pantry; coop ignores the declaration
  grid.forEach((row, ty) =>
    row.forEach((t, tx) => {
      if (t.kind !== 'station') return;
      const pantry = t.station === 'crate' && pantryAt.has(`${tx},${ty}`);
      stations.push({
        kind: t.station,
        tx,
        ty,
        crate: t.crate,
        item: null,
        progress: 0,
        inputs: [],
        done: false,
        count: 0,
        clean: 0,
        owner: pantry ? null : kitchens ? stationOwner(grid, kitchens, tx, ty) : 0,
        ...(pantry ? { pantry: true as const } : {}),
        ...(t.wood ? { wood: true as const } : {}),
      });
    }),
  );
  const handicap = versus && (opts.handicap ?? true);
  const assist = new Set(opts.assist ?? []);
  const ks = handicap
    ? teamMultipliers(
        seats!.map((t) => t.playerIds.length),
        Infinity,
        assist.size ? seats!.map((t) => t.playerIds.filter((id) => assist.has(id)).length) : undefined,
      )
    : null; // null: an empty team, or no handicap
  const teams: TeamState[] = Array.from({ length: teamCount }, (_v, id) => ({
    id,
    n: seats ? seats[id]!.playerIds.length : teamSize(n),
    score: 0,
    gross: 0,
    delivered: 0,
    streak: 0,
    bestStreak: 0,
    tips: 0,
    expired: 0,
    rejected: 0,
    vips: 0,
    reachedAt: 0,
    k: ks?.[id] ?? 1,
    orders: [],
    orderSeq: 0,
    nextOrderAt: p.orderEveryMs,
    rng: mulberry32(seed),
    dirtyDue: [],
  }));
  const g = {
    bus: opts.bus ?? new Emitter<GameEvents>(),
    countdown: opts.countdownMs ?? 0,
    started: false,
    counting: false,
    endTick: Infinity,
    grid,
    spawns: spawnPoints(grid, MAX_SLOTS, opts.spawns),
    difficulty,
    n: teamSize(n),
    params: p,
    time: 0,
    over: false,
    mapId: opts.mapId,
    players: new Map(),
    stations,
    hasCheese: stations.some((s) => s.kind === 'crate' && s.crate === 2),
    finitePlates: stations.some((s) => s.kind === 'dirty') && stations.some((s) => s.kind === 'sink'),
    crowd: new Map(),
    teams,
    versus,
    roster: [],
    paused: null,
    noWinner: false,
    result: null,
    vip: { nextAt: VIP_EVERY_MS[difficulty], rng: mulberry32((seed ^ 0x9e3779b9) >>> 0), round: null },
    pantry: stations.some((s) => s.pantry) ? { stock: PANTRY_MAX, nextAt: Infinity } : null,
    teamIds: seats ? seats.map((t) => [...t.playerIds]) : [],
    open: !seats,
    handicap,
    pauseDismissed: false,
    kitchens,
    teamSpawns: [],
    hazards: opts.hazards ?? false,
    floor: [],
    floorSeq: 0,
    slipDrops: opts.slipDrops ?? true,
    spoilRaw: opts.spoilRaw ?? false,
    sab: null,
    burn: null,
    mid: null,
    rec: opts.recipes
      ? createRec(stations, opts.mapId, { upgrades: !!opts.upgradeOrders, compound: !!opts.compoundOrders && !versus })
      : null,
    assist,
    frostEvent: !!opts.frost,
    upgrades: !!opts.upgradeOrders,
    slices: !!opts.sliceAfterBake,
    compound: !!opts.compoundOrders && !versus,
    adaptive: !!opts.adaptive && !versus, // coop only
    surf: opts.surfaces ? newSurfaceState() : null,
    mut: null,
    magnet: null, // rec: before the first orders are drawn
    ...(mechOn
      ? { flags: { mech: Object.fromEntries(MECH_IDS.map((id) => [id, !!opts.mech![id]])) as MechFlags }, mech: { hash: 0 } }
      : {}),
  } as unknown as Game;
  // the legacy single-team fields are live views of team 0
  for (const key of LEGACY)
    Object.defineProperty(g, key, {
      get: () => teams[0]![key],
      set: (v) => {
        (teams[0] as unknown as Record<string, unknown>)[key] = v;
      },
      enumerable: true,
      configurable: true,
    });
  if (kitchens)
    g.teamSpawns = teams.map((t) => {
      const starts = teamStarts(grid, kitchens, t.id, opts.spawns);
      if (!starts.length) throw new Error(`team ${t.id} has no start tile in its kitchen`);
      return spawnPoints(grid, MAX_SLOTS, starts);
    });
  if (g.finitePlates)
    for (const t of teams) {
      const piles = stations.filter((s) => s.kind === 'plates' && s.owner === t.id);
      for (let i = 0; i < p.plates && piles.length; i++) piles[i % piles.length]!.count++;
    }
  for (const t of teams) for (let i = 0; i < p.initialOrders; i++) spawnOrder(g, t);
  if (opts.sabotage && opts.sabotage !== 'off') g.sab = createSabotage(g, opts.sabotage, opts.sigma); // null when the map cannot host it: the round plays without
  // the new rules, each behind its own flag (off by default): a pizza that waits burns (and, from Normal up and not under the Suave sabotage, sets the oven on fire); one event per round
  if (opts.burn) g.burn = createBurn(difficulty, !!opts.fire && fireAllowed(difficulty, g.sab?.mode), teamCount);
  if (opts.magnet) applyMagnet(g, opts.magnet === true ? 'normal' : opts.magnet); // magnetism: off unless the round's config asks
  if (opts.events) g.mid = createMid(g, opts.eventsSeed ?? seed); // `eventsSeed`: the coop lobby does not seed its orders (they are the same every round), but the event must still vary
  if (opts.mutate) g.mut = createMutate(g, seed); // coop maps with a mutation only; its own stream, nothing shared
  if (g.mech && opts.mutation && g.flags!.mech.mutation)
    armMutation(g, opts.mutation, invertOps(opts.rows ?? FIXED_MAPS[0]!.rows, opts.mutation.ops), opts.rows ?? FIXED_MAPS[0]!.rows); // the v2 mutation's data, before the modules start
  if (g.mech) mechStart(g); // onLoad, then init, of every module whose flag is on
  return g;
}

// `slot` picks the chef (colour); `spawn` the start tile (default: the same index). The screen passes the chef's rank so
// spawn i always holds the i-th chef and the puesto table (spawn i = puesto i) lines up even when slots have gaps.
// Versus: the chef goes to its declared team (the roster given to createGame) and starts in that team's kitchen, on the tile of its
// rank inside the team; `spawn` is ignored. Returns false when nobody is added: already in, or not on any team (a spectator).
export function addPlayer(g: Game, id: number, slot: number, spawn = slot): boolean {
  if (g.players.has(id)) return false;
  const team = g.open ? 0 : g.teamIds.findIndex((ids) => ids.includes(id));
  if (team < 0) return false;
  let at = spawn % g.spawns.length;
  let [sx, sy] = g.spawns[at] ?? [1, 1];
  if (g.versus) {
    const rank = Math.max(0, g.teamIds[team]!.indexOf(id));
    const list = g.teamSpawns[team]!;
    [sx, sy] = list[rank % list.length]!;
    const found = g.spawns.findIndex(([x, y]) => x === sx && y === sy);
    at = found >= 0 ? found : rank;
  }
  g.players.set(id, {
    id,
    slot,
    spawn: at,
    x: sx + 0.5,
    y: sy + 0.5,
    fx: 0,
    fy: 1,
    vx: 0,
    vy: 0,
    item: null,
    cutting: false,
    chopAt: -1,
    bHeld: false,
    dashMs: 0,
    dashCd: 0,
    dashDx: 0,
    dashDy: 0,
    dashHit: [],
    kx: 0,
    ky: 0,
    buffA: 0,
    buffAge: 0,
    buffB: 0,
    crossing: false,
    team,
    ghost: false,
    ...(g.assist.has(id) ? { assist: true as const } : {}),
  });
  g.roster.push({ id, teamId: team, droppedAt: null, ...(g.assist.has(id) ? { assist: true as const } : {}) });
  return true;
}

export const removePlayer = (g: Game, id: number) => {
  g.players.delete(id);
  g.roster = g.roster.filter((e) => e.id !== id);
  for (const k of [...g.crowd.keys()]) if (k.split(':').includes(String(id))) g.crowd.delete(k);
};
