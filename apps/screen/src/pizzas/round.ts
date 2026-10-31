// Starting a Pizzas round: the coop round (map, orders, puestos) and the versus one (frozen teams and map, a puesto deal inside each kitchen).
// TRANSITIONAL (F4b): moved out of apps/screen/src/main.ts (setPhase's pizza branches and startVersus).
import type { MatchStart } from '@pichi/core';
import { pizzasBus } from '@pichi/game-pizzas/screen/bus';
import { sendMsg } from '@pichi/screen-kit/net/socket';
import { app } from '@pichi/screen-kit/shell/app-state';
import { showScene } from '@pichi/screen-kit/shell/game-host';
import { COUNTDOWN_MS, addPlayer, createGame } from '@pichi/game-pizzas/sim';
import { resolveMap } from '@pichi/game-pizzas/sim/generate';
import { SERIES_MAPS, type MapChoice } from '@pichi/game-pizzas/sim/maps';
import { usesSurfaces } from '@pichi/game-pizzas/sim/surfaces/legend';
import { mechFlagsOf } from '@pichi/game-pizzas/sim/mech/ids';
import { roundRules } from '@pichi/game-pizzas/sim/midround';
import { mutateOf } from '@pichi/game-pizzas/sim/mutate/plan';
import { mechsOf, pickedMechs } from '@pichi/game-pizzas/sim/gen/lobby-opts';
import { assignPuestos, featuresOf } from '@pichi/game-pizzas/sim/puestos';
import { dealVersusPuestos } from '@pichi/game-pizzas/sim/versus/deal';
import { NO_LEAD } from '@pichi/game-pizzas/sim/versus/report';
import { startVersusRound } from '@pichi/game-pizzas/sim/versus/lobby';
import { scene } from './host';
import { PIZZAS, assistIds, connectedN, kitchen, nextEventsSeed, puestoOf, pz, tally } from './state';

// Versus: the lobby's frozen teams and map become the round (createVersusGame), with the puestos dealt inside each kitchen.
function startVersus(): MatchStart {
  const slotOf = (id: number) => app.players.get(id)?.info.slot ?? 0;
  const round = startVersusRound({
    teams: app.config.teams!,
    choice: app.config.map,
    difficulty: app.config.difficulty,
    seed: app.config.seed,
    eventsSeed: nextEventsSeed(),
    modeOptions: app.config.modeOptions,
    slotOf,
    rand: Math.random,
    bus: pizzasBus,
    countdownMs: COUNTDOWN_MS,
    assist: assistIds(),
  });
  const { map, teams } = round;
  pz.game = round.game;
  pz.played.add(map.id);
  for (const p of app.players.values()) {
    p.pendA = 0;
    p.pendB = 0;
  }
  puestoOf.clear();
  const f = featuresOf(pz.game.stations);
  const dealt = dealVersusPuestos(teams, f); // chef i of a team = puesto i; the default table is the same for both kitchens; a chef alone gets none
  pz.puestoMsg = dealt;
  dealt.assign.forEach((a) => puestoOf.set(a.id, { ids: a.puestos, stamp: ++pz.puestoStamp }));
  pz.overAt = null;
  tally.reset();
  kitchen.reset();
  pz.lockBeforeStart = app.config.teamsLocked;
  app.config = { ...app.config, teams, teamsLocked: true }; // frozen for the match; the phones get their kitchen side with `you`
  sendMsg({ t: 'config', ...app.config });
  pz.roundView = { teams, hiddenScore: app.config.modeOptions.hiddenScore === true };
  pz.lead = NO_LEAD;
  scene().startRound(pz.game, map.id, app.config.seed, pz.roundView);
  return round.match;
}

function startCoop(): undefined {
  const n = connectedN();
  const map = resolveMap(app.config.map as MapChoice, app.config.seed, app.config.difficulty, n, Math.random, {
    mechs: mechsOf(app.config.modeOptions),
    mechanics: pickedMechs(app.config.modeOptions).length ? pickedMechs(app.config.modeOptions) : undefined,
    mutate: mutateOf(app.config.modeOptions, app.config.difficulty),
  });
  pz.game = createGame({
    mapId: map.id,
    difficulty: app.config.difficulty,
    n,
    rows: map.rows,
    spawns: map.spawns,
    countdownMs: COUNTDOWN_MS,
    bus: pizzasBus,
    eventsSeed: nextEventsSeed(),
    ...roundRules(app.config.modeOptions, app.config.difficulty),
    adaptive: SERIES_MAPS.some((m) => m.id === map.id), // the Carta larga series paces its orders by the load of the queue
    upgradeOrders: SERIES_MAPS.some((m) => m.id === map.id), // ... and brings the Pizza de la casa with its upgrades, the portions and the Bandeja familiar
    sliceAfterBake: SERIES_MAPS.some((m) => m.id === map.id),
    compoundOrders: SERIES_MAPS.some((m) => m.id === map.id),
    mutation: map.mutation, // the v2 mutation (stations that move): runs only when the map also declares the 'mutation' mechanic
    mech: mechFlagsOf(map.mechanics), // the map declares its mechanics, the lobby turns their flags on (off by default; a map without any plays as before)
    surfaces: usesSurfaces(map.rows), // a map with ice or belts turns the surfaces on by itself; versus never draws those maps
    mutate: mutateOf(app.config.modeOptions, app.config.difficulty), // only maps with a mutation: coop; versus never gets it
    assist: assistIds(),
  }); // the lobby turns the new rules on: the oven burns (and, from Normal up, catches fire), the event by its option
  pz.played.add(map.id);
  // spawn i holds the i-th chef (connected ones first), so "spawn i = puesto i" holds even when slots have gaps
  const order = [...app.players.values()].sort((a, b) => Number(b.info.connected) - Number(a.info.connected) || a.info.slot - b.info.slot);
  order.forEach((p, rank) => {
    addPlayer(pz.game, p.info.id, p.info.slot, rank);
    p.pendA = 0;
    p.pendB = 0;
  });
  puestoOf.clear();
  const live = order.filter((p) => p.info.connected);
  if (live.length >= 2) {
    const pm = assignPuestos(
      live.map((p) => p.info.id),
      featuresOf(pz.game.stations),
      map.puestos,
    );
    pm.assign.forEach((a) => puestoOf.set(a.id, { ids: a.puestos, stamp: ++pz.puestoStamp }));
    pz.puestoMsg = pm;
  } else pz.puestoMsg = undefined;
  pz.overAt = null;
  tally.reset();
  kitchen.reset();
  pz.roundView = { teams: null, hiddenScore: false };
  scene().startRound(pz.game, map.id, app.config.seed);
  return undefined;
}

export function startMatch(): MatchStart | undefined {
  showScene(PIZZAS);
  return app.config.modeId === 'versus' && app.config.teams ? startVersus() : startCoop();
}
