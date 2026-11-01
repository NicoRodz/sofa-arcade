// The Pizzas lobby's team columns (versus), the sabotage pills and the events pills.
import { SABOTAGE_BLURB, SABOTAGE_OPTION, sabotageOf } from '../../sim/rules/sabotage-config';
import { eventsHint } from '../../sim/ev2/lines';
import { eventsOf } from '../../sim/rules/midround';
import { mutateOf } from '../../sim/mutate/plan';
import { VERSUS_RANDOM, lobbySetup, sabotageNotice, teamSizes } from '../../sim/versus/lobby';
import { versusMap } from '../../sim/versus/maps';
import { app } from '@pichi/screen-kit/shell';
import { chips, chipsMovedToTeams } from '@pichi/screen-kit/lobby';
import { isVersus, assistIds, modeNow, pz } from '../state';
import { $, esc, plural, setHtml } from '@pichi/screen-kit/ui';
export const OPTION_PILL: Record<string, string> = { hiddenScore: 'Marcador oculto', handicap: 'Ventaja equipo chico' }; // the registry labels are sentences; the pills need short ones

export function renderTeams() {
  chipsMovedToTeams();
  const teams = app.config.teams ?? [];
  const setup = lobbySetup(modeNow(), app.config.teams, new Set(assistIds()));
  $('teams').classList.toggle('teams-locked', app.config.teamsLocked);
  teams.forEach((t, i) => {
    const col = $(`tc${i}`);
    col.style.setProperty('--tc', t.color);
    const k = setup.ok ? (setup.k[i] ?? 1) : 1;
    setHtml(
      `th${i}`,
      `<span class="ti">${esc(t.icon)}</span>${esc(t.name)}${k > 1 ? `<span class="tk" title="Multiplicador del equipo chico">×${k}</span>` : ''}<small>${plural(t.playerIds.length, 'jugador', 'jugadores')}</small>`,
    );
    const list = col.querySelector('.tlist')!;
    const want: HTMLElement[] = t.playerIds.map((id) => chips.find((c) => c.who === id)?.el).filter((el): el is HTMLDivElement => !!el);
    if (!want.length) {
      const note = document.createElement('div');
      note.className = 'empty-note';
      note.textContent = 'Sin jugadores';
      want.push(note);
    }
    const cur = Array.from(list.children);
    if (want.length !== cur.length || want.some((el, j) => el !== cur[j])) list.replaceChildren(...want);
  });
  $('lock').textContent = app.config.teamsLocked ? 'Desbloquear equipos' : 'Bloquear equipos';
  $('lock').classList.toggle('sel', app.config.teamsLocked);
  for (const o of modeNow().options ?? []) {
    const el = $(`opt-${o.id}`);
    el.textContent = OPTION_PILL[o.id] ?? o.label;
    el.classList.toggle('on', app.config.modeOptions[o.id] === true);
    el.classList.toggle('sel', app.config.modeOptions[o.id] === true);
  }
  const th = $('teamhint');
  const sizes = teamSizes(app.config.teams),
    big = Math.max(...sizes),
    small = Math.min(...sizes);
  const uneven = setup.ok && big !== small;
  th.textContent =
    pz.teamNotice ||
    (!setup.ok
      ? setup.problems[0]!
      : uneven
        ? app.config.modeOptions.handicap !== false
          ? `${big} contra ${small}: el equipo de ${small} gana ×${Math.max(...setup.k)}`
          : `${big} contra ${small}, sin ventaja para el equipo chico`
        : setup.ok && app.config.modeOptions.handicap !== false && Math.max(...setup.k) > 1
          ? `Con Ayudante pesa 0,7: el equipo con más ayuda gana ×${Math.max(...setup.k)}`
          : 'Clic en un jugador: cambia de equipo');
  th.classList.toggle('bad', !!pz.teamNotice || !setup.ok);
}

// The sabotage choice of the versus lobby: three pills (Apagado / Suave / Caos), the blurb of the level, and a warning when the map has no catapult.
export function renderSabotage(vs: boolean) {
  $('sabbox').classList.toggle('off', !vs);
  const info = $('sabinfo');
  const c = vs ? modeNow().choices?.find((x) => x.id === SABOTAGE_OPTION) : undefined;
  if (!c) return;
  const cur = sabotageOf(app.config.modeOptions);
  setHtml(
    'sabs',
    c.values
      .map(
        (v) =>
          `<button class="pill ${v.id === cur ? 'sel' : ''}" data-sab="${v.id}" title="${esc(v.blurb ?? '')}">${esc(v.label)}</button>`,
      )
      .join(''),
  );
  const shown = app.config.map === VERSUS_RANDOM ? [] : (versusMap(app.config.map)?.rows ?? null); // a generated map has no catapult
  const warn = sabotageNotice(cur, shown);
  info.classList.toggle('notice', !!warn);
  setHtml('sabinfo', warn ? esc(warn) : `${esc(SABOTAGE_BLURB[cur])} · <kbd>←</kbd><kbd>→</kbd>`);
}

export function renderEvents() {
  const on = eventsOf(app.config.modeOptions, app.config.difficulty);
  setHtml(
    'evs',
    [true, false]
      .map(
        (v) =>
          `<button class="pill ${v === on ? 'sel' : ''}" data-ev="${v}" title="${eventsHint(v, app.config.difficulty, isVersus())}">${v ? 'Sí' : 'No'}</button>`,
      )
      .join(''),
  );
}

// The mutating kitchen option (Sí / No): coop only (versus leaves it out for now), Sí on Normal and Difícil, No on Fácil, until the host picks.
export function renderMutate() {
  const on = mutateOf(app.config.modeOptions, app.config.difficulty);
  for (const id of ['mutl', 'muts']) $(id).style.display = isVersus() ? 'none' : '';
  setHtml(
    'muts',
    [true, false]
      .map(
        (v) =>
          `<button class="pill ${v === on ? 'sel' : ''}" data-mut="${v}" title="${v ? 'En los mapas que lo tienen, la cocina cambia a 1:30' : 'La cocina no cambia'}">${v ? 'Sí' : 'No'}</button>`,
      )
      .join(''),
  );
}
