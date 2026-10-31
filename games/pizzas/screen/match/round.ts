// Starting a Pizzas round: the coop round (map, orders, puestos) and the versus one (frozen teams and map, a puesto deal inside each kitchen).
import type { MatchStart } from '@pichi/core';
import { pizzasBus } from '../bus';
import { sendMsg } from '@pichi/screen-kit/net/socket';
import { app } from '@pichi/screen-kit/shell/app-state';
import { showScene } from '@pichi/screen-kit/shell/game-host';
import { COUNTDOWN_MS, addPlayer, createGame } from '../../sim';
import { resolveMap } from '../../sim/generate';
import { SERIES_MAPS, familyOfMap, pickAutoMap, type MapChoice } from '../../sim/maps';
import { patchMap } from '../../sim/maps/hazard-patches';
import { mulberry32 } from '@pichi/core/rng';
import { subSeed } from '../../sim/recipes/menu';
import { usesSurfaces } from '../../sim/surfaces/legend';
import { mechFlagsOf } from '../../sim/mech/ids';
import { roundRules } from '../../sim/midround';
import { eventsV2Of } from '../../sim/ev2/state';
import { mutateOf } from '../../sim/mutate/plan';
import { mechsOf, pickedMechs } from '../../sim/gen/lobby-opts';
import { assignPuestos, featuresOf } from '../../sim/puestos';
import { dealVersusPuestos } from '../../sim/versus/deal';
import { NO_LEAD } from '../../sim/versus/report';
import { startVersusRound } from '../../sim/versus/lobby';
import { scene } from './loop';
import { PIZZAS, assistIds, connectedN, kitchen, nextEventsSeed, puestoOf, pz, tally } from '../state';

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
  // menuV2: "Aleatorio" draws among every coop map with a dynamic (maps/lobby.ts), from a sub-stream of the seed (`lobby:<round>`), with the session's bag
  const auto =
    app.config.map === 'auto'
      ? pickAutoMap(n, app.config.difficulty, mulberry32(subSeed(app.config.seed, `lobby:${pz.roundNo}`)), {
          played: pz.played,
          last: pz.autoLast,
          first: pz.roundNo === 0,
        })
      : null;
  const resolved =
    auto ??
    resolveMap(app.config.map as MapChoice, app.config.seed, app.config.difficulty, n, Math.random, {
      mechs: mechsOf(app.config.modeOptions),
      mechanics: pickedMechs(app.config.modeOptions).length ? pickedMechs(app.config.modeOptions) : undefined,
      mutate: mutateOf(app.config.modeOptions, app.config.difficulty),
    });
  const map = patchMap(resolved, app.config.difficulty); // HAZARD_V3: the dynamic of the fixed maps 10, 12-15, 22 and 27 (coop only)
  if (/^\d+$/.test(map.id)) pz.autoLast = familyOfMap(map.id);
  pz.game = createGame({
    mapId: map.id,
    hazardsV3: true, // the harder numbers, the rat that takes an item when it escapes and the expired-order penalties (Easy keeps its own)
    difficulty: app.config.difficulty,
    n,
    rows: map.rows,
    spawns: map.spawns,
    countdownMs: COUNTDOWN_MS,
    bus: pizzasBus,
    eventsSeed: nextEventsSeed(),
    ...roundRules(app.config.modeOptions, app.config.difficulty),
    eventsV2: eventsV2Of(app.config.modeOptions), // EVENTS_V2: on in every coop lobby round with events (the sim ignores it otherwise); the option `eventsV2: false` turns it off
    menuV2: true, // 2-4 plates by difficulty with a bag (recipes/menu.ts) and the crate a third plate needs (maps/menu-patches.ts)
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
