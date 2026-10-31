// Pizzas' part of window.__pg: hooks for the capture tool and the end-to-end checks (a score, a team, a pantry, a sabotage shot, an oven at a stage of its life).
// Never used by the game itself.
import { app } from '@pichi/screen-kit/shell/app-state';
import { phaserGame } from '@pichi/screen-kit/shell/game-host';
import { dropPlayer } from '../sim';
import { ev2CakeServed, ev2RedServed } from '../sim/ev2/events';
import { addFloorItem } from '../sim/floor';
import { sabotageAimPress, sabotageLoad } from '../sim/sabotage';
import { school } from './match/loop';
import { pz, tally } from './state';

export const pizzasDebug = () => ({
  school: () => school.debug(),
  forceExpire: () => {
    for (const o of pz.game.orders) o.expiresAt = pz.game.time + 30;
  },
  fastForward: (ms: number) => {
    pz.game.params.roundMs = pz.game.time + ms;
  },
  setScore: (n: number) => {
    pz.game.score = n;
  }, // capture tool: results screen with stars
  vipNow: () => {
    pz.game.vip.nextAt = pz.game.time;
  }, // capture tool: the golden order shows up at the next tick
  setTeam: (id: number, patch: Record<string, number>) => {
    Object.assign(pz.game.teams[id]!, patch);
  }, // capture tool: score, delivered, vips, streak... of a team
  setDelivered: (id: number, n: number) => {
    tally.counts.set(id, n);
  }, // capture tool: deliveries of a chef (the MVP of the results)
  setPantry: (stock: number, nextInMs: number) => {
    if (pz.game.pantry) {
      pz.game.pantry.stock = stock;
      pz.game.pantry.nextAt = pz.game.time + nextInMs;
    }
  }, // capture tool: the shared pantry's stock and the time to the next unit
  dropChef: (id: number) => dropPlayer(pz.game, id), // capture tool: a chef's phone drops (versus)
  // capture tool (sabotage): drive the sim by hand to frame a shot (a bag, a loaded catapult, a throw, rubbish on the floor, a chef put somewhere)
  sab: {
    give: (team: number, n = 1) => {
      pz.game.sab!.teams[team]!.bags += n;
    },
    place: (id: number, x: number, y: number, fx = 1, fy = 0) => {
      const p = pz.game.players.get(id);
      if (p) Object.assign(p, { x, y, fx, fy, vx: 0, vy: 0 });
    },
    item: (id: number, item: string | null) => {
      const p = pz.game.players.get(id);
      if (p) p.item = item as never;
    },
    aim: (team: number) => {
      // the first chef of the team carries a bag to its catapult and loads it
      const p = [...pz.game.players.values()].find((q) => q.team === team && !q.ghost)!;
      const s = pz.game.stations.find((x) => x.kind === 'catapult' && x.owner === team)!;
      const [dx, dy] = (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const
      ).find(([a, b]) => pz.game.grid[s.ty + b]?.[s.tx + a]?.kind === 'floor')!;
      Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0, item: 'trashBag' });
      sabotageLoad(pz.game, p, s);
      return p.id;
    },
    throw: (id: number) => {
      const p = pz.game.players.get(id);
      return !!p && sabotageAimPress(pz.game, p);
    },
    trash: (team: number, tx: number, ty: number, by: number, ttlMs?: number) => {
      addFloorItem(pz.game, { tx, ty, item: 'trash', kind: 'trash', team, by, ttlMs });
    },
    state: () =>
      JSON.parse(JSON.stringify({ sab: pz.game.sab && { teams: pz.game.sab.teams }, floor: pz.game.floor, hazards: pz.game.hazards })),
  },
  // capture tool (burn): put an oven at a stage of its life, stand a chef in front of a station
  kit: {
    setTime: (ms: number) => {
      pz.game.time = ms;
    }, // capture tool (mutate): jump the match clock to just before the 1:30 change
    bake: (i: number, inputs = [0, 1], folded = false, progress = 1) => {
      const s = pz.game.stations[i]!;
      s.inputs = inputs;
      s.progress = progress;
      s.done = progress >= 1;
      s.readyAt = pz.game.time;
      if (folded) s.folded = true;
    }, // inputs: what is in the oven (3 = pepperoni, 4 = mushroom); folded: a calzone; progress < 1: still cooking
    age: (i: number, ms: number) => {
      const s = pz.game.stations[i]!;
      if (s.readyAt !== undefined) s.readyAt = pz.game.time - ms;
    }, // as if the pizza had been ready for `ms`
    stand: (id: number, i: number, k = 0) => {
      // the chef on the k-th open tile of the station, facing it
      const p = pz.game.players.get(id),
        s = pz.game.stations[i]!;
      const open = (
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const
      ).filter(([a, b]) => pz.game.grid[s.ty + b]?.[s.tx + a]?.kind === 'floor');
      const [dx, dy] = open[k % open.length]!;
      if (p) Object.assign(p, { x: s.tx + dx + 0.5, y: s.ty + dy + 0.5, fx: -dx, fy: -dy, vx: 0, vy: 0 });
    },
    item: (id: number, item: string | null) => {
      const p = pz.game.players.get(id);
      if (p) p.item = item as never;
    },
    // mid-round events: make this round's event `kind`, announced now and starting in `startInMs`; put an item on a station; a dirty-plate count on a station
    event: (kind: string, startInMs = 3100) => {
      const m = pz.game.mid;
      if (!m) return false;
      Object.assign(m, {
        kind,
        phase: 'wait',
        announceAt: pz.game.time + 100,
        startAt: pz.game.time + startInMs,
        endAt: Infinity,
        dark: false,
        rat: null,
      });
      return true;
    },
    // capture tool (events V2): the state of the events with presence, and the real closes without playing the round (a spill wiped, the lights restored, the reds served, the cake served)
    ev2: () => JSON.parse(JSON.stringify(pz.game.ev2 ?? null)),
    ev2Win: (kind: string) => {
      const g = pz.game,
        e = g.ev2!;
      if (kind === 'spill') for (const i of e.spill?.tiles ?? []) g.mech!.tile![i] = 0;
      else if (kind === 'blackout' && g.mid) {
        e.restoredAt = g.time;
        g.mid.endAt = g.time;
      } else if (kind === 'rush') for (let i = e.rush?.total ?? 0; i > 0; i--) ev2RedServed(g);
      else if (kind === 'birthday') ev2CakeServed(g, [...g.players.values()][0]!, 250);
    },
    setItem: (i: number, item: string | null) => {
      pz.game.stations[i]!.item = item as never;
    },
    setCount: (i: number, n: number) => {
      pz.game.stations[i]!.count = n;
    },
    counters: () =>
      pz.game.stations
        .map((s, i) => ({ i, kind: s.kind, tx: s.tx, ty: s.ty, fire: s.fire, burnt: !!s.burnt, done: s.done }))
        .filter((s) => s.kind === 'pot' || s.kind === 'counter'),
  },
  snapshot: () => ({
    magnet: !!pz.game.magnet,
    mid: pz.game.mid && { kind: pz.game.mid.kind, phase: pz.game.mid.phase, dark: pz.game.mid.dark, rat: !!pz.game.mid.rat },
    versus: pz.game.versus,
    over: pz.game.over,
    teams: pz.game.teams.map((t) => ({
      id: t.id,
      n: t.n,
      score: t.score,
      delivered: t.delivered,
      k: t.k,
      vips: t.vips,
      orders: t.orders.length,
    })),
    winner: pz.game.result?.winner ?? null,
    paused: !!pz.game.paused,
    fps: phaserGame().loop.actualFps,
    phase: app.phase,
    players: [...pz.game.players.values()],
    stations: pz.game.stations,
    orders: pz.game.orders,
    time: pz.game.time,
    score: pz.game.score,
    countdown: pz.game.countdown,
    streak: pz.game.streak,
    bestStreak: pz.game.bestStreak,
    crowd: [...pz.game.crowd.keys()],
  }),
});
