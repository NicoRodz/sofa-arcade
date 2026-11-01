// The Pizzas lobby's team columns (versus), the sabotage pills and the events pills.
import { SABOTAGE_BLURB, SABOTAGE_OPTION, sabotageOf } from '../../sim/sabotage-config';
import { eventsHint } from '../../sim/ev2/lines';
import { eventsOf } from '../../sim/rules/midround';
import { mutateOf } from '../../sim/mutate/plan';
import { VERSUS_RANDOM, lobbySetup, sabotageNotice, teamSizes } from '../../sim/versus/lobby';
import { versusMap } from '../../sim/versus/maps';
import { app } from '@pichi/screen-kit/shell';
import { chips, chipsMovedToTeams } from '@pichi/screen-kit/lobby';
import { isVersus, assistIds, modeNow, pz } from '../state';
import { $ } from '@pichi/screen-kit/ui';
import { teamHead, teamHint, teambarView, yesNo } from './teams-model';
import {
  renderEventPills,
  renderMutatePills,
  renderSabotageInfo,
  renderSabotagePills,
  placeChips,
  renderTeambar,
  renderTeamHead,
} from './teams-view';

export function renderTeams() {
  chipsMovedToTeams();
  const teams = app.config.teams ?? [];
  const setup = lobbySetup(modeNow(), app.config.teams, new Set(assistIds()));
  $('teams').classList.toggle('teams-locked', app.config.teamsLocked);
  teams.forEach((t, i) => {
    const col = $(`tc${i}`);
    col.style.setProperty('--tc', t.color);
    renderTeamHead(i, teamHead(t, setup.ok ? (setup.k[i] ?? 1) : 1));
    placeChips(
      col.querySelector('.tlist')!,
      t.playerIds.map((id) => chips.find((c) => c.who === id)?.el),
    );
  });
  const hint = teamHint({
    notice: pz.teamNotice,
    setup,
    sizes: teamSizes(app.config.teams),
    handicap: app.config.modeOptions.handicap !== false,
  });
  renderTeambar(teambarView(app.config.teamsLocked, modeNow().options ?? [], app.config.modeOptions, hint));
}

// The sabotage choice of the versus lobby: three pills (Apagado / Suave / Caos), the blurb of the level, and a warning when the map has no catapult.
export function renderSabotage(vs: boolean) {
  $('sabbox').classList.toggle('off', !vs);
  const c = vs ? modeNow().choices?.find((x) => x.id === SABOTAGE_OPTION) : undefined;
  if (!c) return;
  const cur = sabotageOf(app.config.modeOptions);
  renderSabotagePills(c.values.map((v) => ({ id: v.id, label: v.label, title: v.blurb ?? '', selected: v.id === cur })));
  const shown = app.config.map === VERSUS_RANDOM ? [] : (versusMap(app.config.map)?.rows ?? null); // a generated map has no catapult
  const warn = sabotageNotice(cur, shown);
  $('sabinfo').classList.toggle('notice', !!warn);
  renderSabotageInfo(warn ?? '', SABOTAGE_BLURB[cur]);
}

export function renderEvents() {
  const on = eventsOf(app.config.modeOptions, app.config.difficulty);
  renderEventPills(yesNo(on, (v) => eventsHint(v, app.config.difficulty, isVersus())));
}

// The mutating kitchen option (Sí / No): coop only (versus leaves it out for now), Sí on Normal and Difícil, No on Fácil, until the host picks.
export function renderMutate() {
  const on = mutateOf(app.config.modeOptions, app.config.difficulty);
  for (const id of ['mutl', 'muts']) $(id).style.display = isVersus() ? 'none' : '';
  renderMutatePills(yesNo(on, (v) => (v ? 'En los mapas que lo tienen, la cocina cambia a 1:30' : 'La cocina no cambia')));
}
