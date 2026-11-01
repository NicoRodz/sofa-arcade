// Obstaculos' half of the lobby: mode (Encadenados / Libres), level or "Aleatorio" with its seed, and what the choice means for this group.
// Moved out of apps/screen/src/main.ts (F4b): renderObstLobby, the branch of renderUi and the click handlers of its panel.
import { sendMsg } from '@pichi/screen-kit/net';
import { app, connectedCount, setConfig } from '@pichi/screen-kit/shell';
import { showTeams } from '@pichi/screen-kit/lobby';
import { $, plural } from '@pichi/screen-kit/ui';
import {
  DIFFICULTY_PARAMS,
  LEVELS,
  MODE_BLURB,
  MODE_LABEL,
  RANDOM_LEVEL,
  fixedExpedition,
  levelCompat,
  resolveLevel,
  toModeOptions,
  type ObstOptions,
} from '../index';
import { camp } from './campaign-link';
import { levelCards, modePills } from './lobby/rows-model';
import { renderLevels, renderModes } from './lobby/rows-view';
import { biomeColor, obstOpts, run } from './run-state';

function renderObstLobby() {
  const n = connectedCount();
  const o0 = obstOpts();
  const fit = resolveLevel(o0.level, n, o0.tether);
  if (fit !== o0.level && n >= 2) {
    // someone joined or left (or the mode changed): the level no longer fits, move to the next one that does and say so
    run.notice = `${o0.level === RANDOM_LEVEL ? 'Aleatorio' : `El nivel ${o0.level}`} no sirve con ${n} jugadores en ${MODE_LABEL[o0.tether]}: se cambió a ${fit === RANDOM_LEVEL ? 'Aleatorio' : `el nivel ${fit}`}`;
    app.config = { ...app.config, modeOptions: toModeOptions({ ...o0, level: fit }) };
    sendMsg({ t: 'config', ...app.config });
  }
  const o = obstOpts();
  renderModes(modePills(o.tether));
  renderLevels(levelCards(n, o.tether, o.level, (b) => biomeColor[b]));
  $('obstfor').textContent = `· para ${plural(n, 'jugador', 'jugadores')}`;
  $('oseedrow').classList.toggle('off', o.level !== RANDOM_LEVEL);
  $('oseed').textContent = String(app.config.seed);
  const exp = o.level === RANDOM_LEVEL ? [] : fixedExpedition(o.level, Math.max(2, n), o.tether);
  const info = $('obstinfo');
  info.textContent =
    run.notice ||
    (o.level === RANDOM_LEVEL
      ? `Tres niveles generados con las semillas ${app.config.seed}, ${(app.config.seed + 1) % 2 ** 32} y ${(app.config.seed + 2) % 2 ** 32}`
      : `Expedición: ${exp.map((l) => l.name).join(' → ')}`);
  info.classList.toggle('notice', !!run.notice);
  const dp = DIFFICULTY_PARAMS[app.config.difficulty];
  $('obstlives').textContent =
    `${MODE_LABEL[o.tether]}: ${MODE_BLURB[o.tether].toLowerCase()} · ${Number.isFinite(dp.lives) ? `${dp.lives} vidas de equipo` : 'vidas ilimitadas'} · burbuja a los ${dp.bubbleSec} s fuera de cámara${dp.bubbleCostsLife ? ' (cuesta una vida)' : ''}`;
  ($('start') as HTMLButtonElement).disabled = n < 2;
}

// The branch of renderUi for this game: it hides what belongs to the other games' lobbies and paints its own.
export function renderLobby() {
  $('lobbyui').classList.toggle('camp', camp.on);
  $('campaign').classList.toggle('off', !camp.on);
  $('back').textContent = !camp.on ? '‹ Campaña · Esc' : '‹ Elegir otro juego · Esc';
  $('pizzaops').classList.toggle('off', true);
  $('obstops').classList.toggle('off', false);
  $('obstmodewrap').classList.toggle('off', false);
  $('start').textContent = '¡A cruzar!';
  showTeams(false);
  $('modebox').classList.add('off');
  if (camp.on) {
    camp.render();
    return;
  }
  renderObstLobby();
}

const setObst = (patch: Partial<ObstOptions>) => {
  run.notice = '';
  setConfig({ modeOptions: toModeOptions({ ...obstOpts(), ...patch }) });
};

export function initLobbyView() {
  $('oseed-new').addEventListener('click', () => {
    run.notice = '';
    setConfig({ seed: (app.config.seed + 1) % 2 ** 32 });
  });
  $('obstmodes').addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tether]')?.dataset.tether;
    if (t === 'chain' || t === 'free') setObst({ tether: t });
  });
  $('obstlevels').addEventListener('click', (e) => {
    const v = (e.target as HTMLElement).closest<HTMLElement>('[data-level]')?.dataset.level;
    if (v === undefined) return;
    const lv = Number(v);
    if (lv !== RANDOM_LEVEL && !levelCompat(LEVELS[lv - 1]!, connectedCount(), obstOpts().tether).ok) return;
    setObst({ level: lv });
  });
  $('campaign').addEventListener('click', (e) => {
    if (!app.starting) camp.click(e.target as HTMLElement);
  });
  $('campres').addEventListener('click', (e) => {
    if (!app.starting) camp.click(e.target as HTMLElement);
  });
}
