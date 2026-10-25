// Obstaculos' campaign as the shell sees it (the hub, the trail map and the results after each level; the progress lives on the server):
// the CampaignScreen wired to the shell's state, and the start of one level. Moved out of apps/screen/src/main.ts (F4b).
import { DIFFICULTIES, DIFFICULTY_LABEL } from '@pichi/core/difficulty';
import { NAV_SFX } from '@pichi/screen-kit/menu';
import { app, connectedCount, dispatch, renderUi, services, setConfig, transition } from '@pichi/screen-kit/shell/app-state';
import { setHtml } from '@pichi/screen-kit/ui/dom';
import { CAMPAIGN_CATALOG } from '../campaign/index';
import { CampaignApi } from './campaign/api';
import { CampaignScreen } from './campaign/screen';
import { run } from './run-state';

export const camp = new CampaignScreen({
  api: new CampaignApi(),
  catalog: CAMPAIGN_CATALOG,
  room: app.room,
  kv: (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })(),
  host: { set: (h) => setHtml('campaign', h) },
  results: { set: (h) => setHtml('campres', h) },
  names: () =>
    [...app.players.values()]
      .filter((p) => p.info.connected)
      .sort((a, b) => a.info.slot - b.info.slot)
      .map((p) => p.info.name),
  count: connectedCount,
  difficulty: () => ({
    value: app.config.difficulty,
    set: (d) => setConfig({ difficulty: d }),
    labels: DIFFICULTY_LABEL,
    all: DIFFICULTIES,
  }),
  sfx: (s) => services.ui(NAV_SFX[s]),
  leaveToMenu: () => transition(() => dispatch('back')),
  quick: () => renderUi(),
  play: (id) => campStart(id),
  toLobby: () => {
    if (app.phase === 'results') dispatch('again');
  },
  refresh: () => renderUi(),
});

// From the campaign's map or its results: the level `levelId` starts (the iris, then the round; no how-to card between levels).
function campStart(levelId: string) {
  if (app.starting) return;
  run.campRun = levelId;
  app.starting = true;
  services.iris(
    () => {
      if (app.phase === 'results') dispatch('again');
      dispatch('start');
      app.gateUntil = performance.now() + 700;
    },
    () => {
      app.starting = false;
    },
  );
}
