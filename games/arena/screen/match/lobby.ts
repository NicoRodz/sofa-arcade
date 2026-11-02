// Arena's team lobby (Manchazo): the screen owns the teams, the relay only reads config.teams. The platform's two team columns (#tc0, #tc1) hold the player
// cards; this fills their headings, moves the cards, keeps the teams in step with who is connected and says why the round cannot start.
import { sendMsg } from '@pichi/screen-kit/net';
import type { LobbyConfig } from '@pichi/core';
import { modeOf } from '@pichi/core/contract';
import { reshuffleTeams, type TeamInfo } from '@pichi/core/lobby';
import { chips, chipsMovedToTeams } from '@pichi/screen-kit/lobby';
import { app, connectedIds } from '@pichi/screen-kit/shell';
import { $, html, renderInto } from '@pichi/screen-kit/ui';
import { arenaManifest } from '../../manifest';
import { handicap, startProblem, syncTeams, teamSizes } from '../../sim';

const mode = () => modeOf(arenaManifest, 'versus');

/** Why the round cannot start yet ('' when it can). */
export const startBlocker = (): string => startProblem(mode(), app.config.teams);

// Keeps the lobby's teams coherent with who is connected: patched straight into the config (no re-render) and sent to the relay.
function sync() {
  const teams = syncTeams(mode(), app.config.teams, connectedIds(), app.config.seed, false);
  if (teams === app.config.teams) return;
  app.config = { ...app.config, teams } as LobbyConfig;
  sendMsg({ t: 'config', ...app.config });
}

const head = (t: TeamInfo) =>
  html`<span class="ti">${t.icon}</span>${t.name}<small>${t.playerIds.length} ${t.playerIds.length === 1 ? 'jugador' : 'jugadores'}</small>`;

/** The line under the columns: the problem, or the small team's edge, or how to move players. */
export function teamHint(sizes: readonly number[], problem: string): { text: string; bad: boolean } {
  if (problem) return { text: problem, bad: true };
  const [big, small] = [Math.max(...sizes), Math.min(...sizes)];
  if (big === small) return { text: 'Clic en un jugador: cambia de equipo', bad: false };
  const h = handicap(sizes);
  return {
    text: `${big} contra ${small}: el equipo de ${small} pinta con radio +1 y guarda ${h.reserve[sizes.indexOf(small)]} piñata(s) extra`,
    bad: false,
  };
}

// The platform styles #teambar, not this line: without a place of its own it fell at the top-left corner, over the title. Same spot and look as #teambar/#teamhint.
const HINT_CSS = `#arenahint { position: absolute; left: 650px; top: 428px; width: 1190px; height: 38px; display: flex; align-items: center; gap: 10px; }
#arenahint.off { display: none; }
#arenahint .pill { height: 38px; padding: 0 14px; font-size: 19px; border-width: 3px; white-space: nowrap; flex: none; }
#arenahinttext { margin-left: auto; font: 700 20px var(--font); color: rgba(255,244,224,.75); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#arenahint.bad #arenahinttext { color: #FFB020; }`;

function hintEl(): HTMLElement {
  const old = document.getElementById('arenahint');
  if (old) return old;
  const css = document.createElement('style');
  css.textContent = HINT_CSS;
  document.head.append(css);
  const el = document.createElement('div');
  el.id = 'arenahint';
  el.innerHTML = '<button id="arenashuffle" class="pill">Mezclar</button> <span id="arenahinttext"></span>';
  el.querySelector('button')!.addEventListener('click', () => {
    if (app.phase !== 'lobby' || !app.config.teams) return;
    app.config = { ...app.config, teams: reshuffleTeams(app.config.teams, (Math.random() * 2 ** 32) >>> 0) } as LobbyConfig;
    sendMsg({ t: 'config', ...app.config });
    renderLobbyTeams();
  });
  $('teambar').before(el);
  return el;
}

export function renderLobbyTeams() {
  sync();
  chipsMovedToTeams();
  const teams = app.config.teams ?? [];
  teams.forEach((t, i) => {
    const col = $(`tc${i}`);
    col.style.setProperty('--tc', t.color);
    renderInto(`th${i}`, head(t));
    const list = col.querySelector('.tlist')!;
    const want: Node[] = t.playerIds.map((id) => chips.find((c) => c.who === id)?.el).filter((e): e is HTMLDivElement => !!e);
    const cur = Array.from(list.children);
    if (want.length !== cur.length || want.some((el, j) => el !== cur[j])) list.replaceChildren(...want);
  });
  $('teambar').classList.add('off'); // the platform's bar carries Pizzas' options; Arena's own line stands in
  const hint = teamHint(teamSizes(app.config.teams), startBlocker());
  const el = hintEl();
  el.classList.toggle('off', false);
  el.querySelector('#arenahinttext')!.textContent = hint.text;
  el.classList.toggle('bad', hint.bad);
}

export const hideLobbyHint = () => document.getElementById('arenahint')?.classList.add('off');
