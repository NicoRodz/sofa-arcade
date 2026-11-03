// Visual check: serves the app, drives the screen with simulated phones in headless Chrome and saves screenshots.
// usage: npx tsx tools/capture.ts <menu|lobby|game|results|all|phone|versus|versus-phone|sabotage|burn|events|events-vs|assist|magnet|frost|events-v2|hz3-31|hz3-15|hz3-22|hz3-28> [outDir]   (PG_PORT / PG_CDP move the server and Chrome ports)
import { what } from './config';
import { type Ctx, withSession } from './session';
import { runPhone, runVersusPhone } from './scenarios/phone';
import { runEventsVs, runVersus, runVsDrop, runVsHud, runVsLobby, runVsPantry, runVsResults } from './scenarios/versus';
import { runAssist, runBurn, runSabotage } from './scenarios/coop-a';
import { runEvents, runMagnet } from './scenarios/coop-b';
import { runVersusV3 } from './scenarios/versus-v3';
import { runEventsV2 } from './scenarios/events-v2';
import { runFrost } from './scenarios/frost';
import { runHzFire, runHzIce, runHzRat } from './scenarios/hazards';
import { runHz3Bridge, runHz3Caves, runHz3Tray, runHz3Waves } from './scenarios/hazards-v3c';
import { runMutate } from './scenarios/mutate';
import { runHowto, runHowtoTimeout, runMenu } from './scenarios/screens';
import { runDash, runFase1, runJuice, runMaps, runNewmaps, runReplay } from './scenarios/maps';
import { runArenaGridPhone, runArenaGridTv } from './scenarios/arena-grid';
import { runManchazoPhone, runManchazoTv } from './scenarios/manchazo';
import { runManchazo4k, runRenderScaleOthers } from './scenarios/render-scale';
import { runManchazoLooks, runManchazoSeeds } from './scenarios/manchazo-seeds';
import { runManchazoEventsPlusTv, runManchazoEventsTv } from './scenarios/manchazo-events';
import { runManchazoLivingTv } from './scenarios/manchazo-living';
import { runManchazoArchetypeTv } from './scenarios/legibility/manchazo-archetype';
import { runManchazoLegibilityTv } from './scenarios/legibility/manchazo-legibility';
import { runManchazoPhasesTv } from './scenarios/legibility/manchazo-phases';
import {
  runManchazoSabotagePhone,
  runManchazoSabotagePlusPhone,
  runManchazoSabotagePlusTv,
  runManchazoSabotageTv,
  runManchazoRescueTv,
} from './scenarios/manchazo-sabotage';
import { runManchazoShotTv } from './scenarios/legibility/manchazo-shot';
import { runManchazoWrapTv } from './scenarios/legibility/manchazo-wrap';
import { runCast, runGame, runLobby, runResults, runSolo } from './scenarios/play';

type Scenario = (c: Ctx) => Promise<void>;

// each mode runs the scenarios in order; `all` is lobby, game, results as before
const MODES: Record<string, Scenario[]> = {
  phone: [runPhone],
  'arena-grid-tv': [runArenaGridTv],
  'arena-grid-phone': [runArenaGridPhone],
  'manchazo-tv': [runManchazoTv],
  'manchazo-phone': [runManchazoPhone],
  'render-scale': [runRenderScaleOthers],
  'manchazo-4k': [runManchazo4k],
  'manchazo-seeds': [runManchazoSeeds],
  'manchazo-looks': [runManchazoLooks],
  'manchazo-sabotage-tv': [runManchazoSabotageTv],
  'manchazo-rescue-tv': [runManchazoRescueTv],
  'manchazo-sabotage-phone': [runManchazoSabotagePhone],
  'manchazo-sabotage-plus-tv': [runManchazoSabotagePlusTv],
  'manchazo-sabotage-plus-phone': [runManchazoSabotagePlusPhone],
  'manchazo-shot-tv': [runManchazoShotTv],
  'manchazo-wrap-tv': [runManchazoWrapTv],
  'manchazo-events-tv': [runManchazoEventsTv],
  'manchazo-events-plus-tv': [runManchazoEventsPlusTv],
  'manchazo-living-tv': [runManchazoLivingTv],
  'manchazo-legibility-tv': [runManchazoLegibilityTv],
  'manchazo-phases-tv': [runManchazoPhasesTv],
  'manchazo-archetype-tv': [runManchazoArchetypeTv],
  'versus-phone': [runVersusPhone],
  versus: [runVersus],
  'vs-hud': [runVsHud],
  'vs-lobby': [runVsLobby],
  'vs-drop': [runVsDrop],
  'events-vs': [runEventsVs],
  'vs-v3-v3': [runVersusV3('V3')],
  'vs-v3-v1': [runVersusV3('V1')],
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
  'hz3-31': [runHz3Bridge],
  'hz3-15': [runHz3Caves],
  'hz3-22': [runHz3Waves],
  'hz3-28': [runHz3Tray],
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
