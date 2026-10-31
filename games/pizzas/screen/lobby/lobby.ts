// Pizzas' half of the lobby as the shell's LobbyHooks: the branch of renderUi, the lobby-only keys (E: events, arrows: sabotage level) and the click handlers
// of its panels.
import { hasModeChoice, selectableModes, type ModeId } from '@pichi/core/contract';
import { teamOf } from '@pichi/core/lobby/teams';
import type { LobbyConfig } from '@pichi/core';
import { defaultSabotage, isSabotageMode, SABOTAGE_OPTION } from '../../sim/sabotage-config';
import { eventsOf } from '../../sim/midround';
import { groupOfMap, fixedMap, isMapChoice, mapStatus } from '../../sim/maps';
import { versusMap } from '../../sim/versus/maps';
import { isVersusChoice, stepChoice, teamSizes, versusAvailability, versusMapStatus } from '../../sim/versus/lobby';
import { chips, showTeams } from '@pichi/screen-kit/lobby/chips';
import { app, connectedCount, setConfig } from '@pichi/screen-kit/shell/app-state';
import { $, esc, setHtml } from '@pichi/screen-kit/ui/dom';
import type { Difficulty } from '@pichi/core/difficulty';
import { renderMapPanel } from './maps';
import { moveToTeam, setEvents, setMutate, setMode, setSabotage, shuffleTeams, syncLobby } from './sync';
import { renderEvents, renderMutate, renderSabotage, renderTeams } from './teams';
import { connectedN, gameDef, isVersus, modeNow, pz } from '../state';

const MODE_PILL: Partial<Record<ModeId, string>> = { coop: 'Cooperativo', versus: 'Versus' };

export function renderLobby() {
  $('lobbyui').classList.toggle('camp', false);
  $('campaign').classList.toggle('off', true);
  $('back').textContent = '‹ Elegir otro juego · Esc';
  $('pizzaops').classList.toggle('off', false);
  $('obstops').classList.toggle('off', true);
  $('obstmodewrap').classList.toggle('off', true);
  $('start').textContent = '¡A cocinar!';
  const n = connectedN();
  const vs = syncLobby(n);
  const def = gameDef();
  $('modebox').classList.toggle('off', !hasModeChoice(def));
  setHtml(
    'modes',
    selectableModes(def)
      .map((m) => {
        const av = m.id === 'versus' ? versusAvailability(m, connectedCount()) : { ok: true, reason: '' };
        return `<button class="pill ${m.id === app.config.modeId ? 'sel' : ''} ${av.ok ? '' : 'dis'}" data-mode="${m.id}" title="${esc(av.ok ? m.label : av.reason)}">${esc(MODE_PILL[m.id] ?? m.label)}</button>`;
      })
      .join(''),
  );
  showTeams(vs);
  if (vs) renderTeams();
  renderSabotage(vs);
  renderEvents();
  renderMutate();
  renderMapPanel(vs, n);
}

// The lobby-only keys: E toggles the mid-round events, the arrows step the sabotage level (the Captain's D-pad sends the same keys).
export function lobbyKey(key: string, repeat: boolean): boolean {
  if ((key === 'e' || key === 'E') && !repeat) {
    setEvents(!eventsOf(app.config.modeOptions, app.config.difficulty));
    return true;
  }
  if (isVersus() && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    const c = modeNow().choices?.find((x) => x.id === SABOTAGE_OPTION);
    const v = c ? stepChoice(c, app.config.modeOptions[SABOTAGE_OPTION], key) : null;
    if (v) setSabotage(v);
    return true;
  }
  return false;
}

// the sabotage level follows the difficulty until the host picks one by hand
export const difficultyPatch = (diff: Difficulty): Partial<LobbyConfig> =>
  isVersus() && !pz.sabotageTouched ? { modeOptions: { ...app.config.modeOptions, [SABOTAGE_OPTION]: defaultSabotage(diff) } } : {};

export function initLobbyView() {
  $('evs').addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest<HTMLElement>('[data-ev]')?.dataset.ev;
    if (v === 'true' || v === 'false') setEvents(v === 'true');
  });
  $('muts').addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest<HTMLElement>('[data-mut]')?.dataset.mut;
    if (!isVersus() && (v === 'true' || v === 'false')) setMutate(v === 'true');
  });
  $('sabs').addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest<HTMLElement>('[data-sab]')?.dataset.sab;
    if (isVersus() && isSabotageMode(v)) setSabotage(v);
  });
  $('maps').addEventListener('click', (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>('[data-map]')?.dataset.map;
    if (m === 'group') {
      const to = (e.target as HTMLElement).closest<HTMLElement>('[data-map]')?.dataset.to;
      pz.mapGroup = to === 'series' || to === 'taller' ? to : 'classic';
      if (groupOfMap(app.config.map) !== 'classic' && groupOfMap(app.config.map) !== pz.mapGroup) setConfig({ map: 'auto' }); // the picked map is not on this page any more
      renderMapPanel(isVersus(), connectedN());
      return;
    }
    if (isVersus() ? isVersusChoice(m) : isMapChoice(m)) {
      const blocked = isVersus()
        ? (() => {
            const v = versusMap(m!);
            return !!v && versusMapStatus(v, teamSizes(app.config.teams)).state === 'blocked';
          })()
        : (() => {
            const f = m === 'auto' || m === 'random' ? null : fixedMap(m!);
            return !!f && mapStatus(f, connectedN()).state === 'blocked';
          })();
      if (blocked) return;
      pz.mapTouched = true;
      pz.mapNotice = '';
      setConfig({ map: m as LobbyConfig['map'] });
    }
  });
  $('modes').addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode;
    const mode = selectableModes(gameDef()).find((m) => m.id === id);
    if (mode) setMode(mode.id);
  });
  $('shuffle').addEventListener('click', shuffleTeams);
  $('lock').addEventListener('click', () => {
    pz.teamNotice = '';
    setConfig({ teamsLocked: !app.config.teamsLocked });
  });
  $('teambar').addEventListener('click', (e) => {
    const opt = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]')?.dataset.opt;
    if (opt) setConfig({ modeOptions: { ...app.config.modeOptions, [opt]: app.config.modeOptions[opt] !== true } });
  });
  $('teams').addEventListener('click', (e) => {
    // the host clicks a chip: that player goes to the other team
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
    const c = chips.find((x) => x.el === chip);
    const t = c && c.who >= 0 ? teamOf(app.config.teams, c.who) : undefined;
    if (c && t && app.config.teams) moveToTeam(c.who, (t.id + 1) % app.config.teams.length);
  });
  $('again-seed').addEventListener('click', () => setConfig({ seed: (app.config.seed + 1) % 2 ** 32 }));
}
