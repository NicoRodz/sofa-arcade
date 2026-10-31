// Visual check: serves the app, drives the screen with simulated phones in headless Chrome and saves screenshots.
// usage: npx tsx tools/capture.ts <menu|lobby|game|results|all|phone|versus|versus-phone|sabotage|burn|events|events-vs|assist|magnet|frost|events-v2> [outDir]   (PG_PORT / PG_CDP move the server and Chrome ports)
import { what } from './config';
import { type Ctx, withSession } from './session';
import { runPhone, runVersusPhone } from './scenarios/phone';
import { runEventsVs, runVersus, runVsDrop, runVsHud, runVsLobby, runVsPantry, runVsResults } from './scenarios/versus';
import { runAssist, runBurn, runSabotage } from './scenarios/coop-a';
import { runEvents, runMagnet } from './scenarios/coop-b';
import { runEventsV2 } from './scenarios/events-v2';
import { runFrost } from './scenarios/frost';
import { runHzFire, runHzIce, runHzRat } from './scenarios/hazards';
import { runMutate } from './scenarios/mutate';
import { runHowto, runHowtoTimeout, runMenu } from './scenarios/screens';
import { runDash, runFase1, runJuice, runMaps, runNewmaps, runReplay } from './scenarios/maps';
import { runCast, runGame, runLobby, runResults, runSolo } from './scenarios/play';

type Scenario = (c: Ctx) => Promise<void>;

// each mode runs the scenarios in order; `all` is lobby, game, results as before
const MODES: Record<string, Scenario[]> = {
  phone: [runPhone],
  'versus-phone': [runVersusPhone],
  versus: [runVersus],
  'vs-hud': [runVsHud],
  'vs-lobby': [runVsLobby],
  'vs-drop': [runVsDrop],
  'events-vs': [runEventsVs],
  'vs-pantry': [runVsPantry],
  'vs-results': [runVsResults],
  assist: [runAssist],
  sabotage: [runSabotage],
  burn: [runBurn],
  events: [runEvents],
  magnet: [runMagnet],
  mutate: [runMutate],
  frost: [runFrost],
  'events-v2': [runEventsV2(['rush', 'birthday', 'blackout', 'spill'])],
  'ev2-rush': [runEventsV2(['rush'])],
  'ev2-birthday': [runEventsV2(['birthday'])],
  'ev2-blackout': [runEventsV2(['blackout'])],
  'ev2-spill': [runEventsV2(['spill'])],
  'hz-fire': [runHzFire],
  'hz-rat': [runHzRat],
  'hz-ice': [runHzIce],
  howto: [runHowto],
  'howto-timeout': [runHowtoTimeout],
  menu: [runMenu],
  newmaps: [runNewmaps],
  fase1: [runFase1],
  dash: [runDash],
  maps: [runMaps],
  replay: [runReplay],
  juice: [runJuice],
  lobby: [runLobby],
  cast: [runCast],
  solo: [runSolo],
  game: [runGame],
  results: [runResults],
  all: [runLobby, runGame, runResults],
};

export function main() {
  return withSession(async (ctx) => {
    for (const scenario of MODES[what] ?? []) await scenario(ctx);
  });
}
