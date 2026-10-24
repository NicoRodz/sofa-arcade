import Phaser from 'phaser';
import {
  ClockSync, DEFAULT_CONFIG, PING_MS, PressTracker, WS_PATH, acceptNav, canStart, navToKey, newRoomCode, nextPhase, remoteBlocked,
  type BuzzKind, type ClientMsg, type LobbyConfig, type MatchStart, type Phase, type PublicPlayer, type ServerMsg,
} from '@party/shared';
import { DIFFICULTIES, DIFFICULTY_LABEL, params } from '@party/shared/difficulty';
import { summarize, summarizeTeam } from '@party/shared/results';
import { GAMES, PLATFORM, gameInfo, gameName, hasModeChoice, modeOf, selectableModes, type GameDef, type ModeId } from '@party/shared/games';
import { movePlayer, reshuffleTeams, teamOf } from '@party/shared/teams';
import {
  VERSUS_AUTO, VERSUS_RANDOM, defaultModeOptions, defaultVersusChoice, isVersusChoice, lobbySetup, resolveVersusMap, startVersusRound, syncTeams, teamSizes,
  versusAvailability, versusLobbyMaps, versusMapStatus,
} from '@party/shared/versusLobby';
import { versusMap } from '@party/shared/versusMaps';
import { howToHtml } from '@party/shared/render';
import { generate, resolveMap } from '@party/shared/generate';
import { defaultMap, fixedMap, isMapChoice, lobbyMaps, lobbyN, mapFeatures, mapStatus, replacementMap, type MapChoice } from '@party/shared/maps';
import { initAudio } from './audio';
import { gameBus } from './bus';
import { chefCanvas } from './art/chef';
import { chefOf } from './art/tokens';
import { drawLogo, drawMiniMap, starCanvas } from './art/ui';
import { drawCardArt } from './art/cards';
import { NAV_SFX, clampSel, lobbyEscGoesBack, menuCards, menuOnKey, menuPick, soundFor, type MenuAction } from './menu';
import { iris } from './art/iris';
import { toggleShake } from './art/fx';
import { HOWTO_MS, howToOnKey, isExpired, progress, secondsLeft, type HowToState } from './howto';
import { MainScene, type Host } from './scene';
import {
  DEFAULT_OBST_OPTIONS, GAME_ID as OBST_ID, LEVELS as OBST_LEVELS, MODE_BLURB, MODE_LABEL, RANDOM_LEVEL, fixedExpedition, levelCompat, parseObstOptions, resolveLevel, toModeOptions,
  DIFFICULTY_PARAMS as OBST_DIFFICULTY, type Biome, type GameMode, type ObstOptions, type RunSummary,
} from '@party/shared/obstaculos';
import { ObstRun } from './games/obstaculos/host';
import { LEGACY_CATALOG } from '@party/shared/obstaculos/campaign';
import { CampaignApi } from './games/obstaculos/campaign/api';
import { CampaignScreen } from './games/obstaculos/campaign/screen';
import { ObstaclesScene } from './games/obstaculos/render/scene';
import { initObstAudio, type MusicState } from './games/obstaculos/audio';
import { snapshot as snapshotObst } from '@party/shared/obstaculos';
import type { PuestoView } from './art/puestos';
import { assignPuestos, featuresOf, type PuestoId } from '@party/shared/puestos';
import { C, H, W } from './art/tokens';
import { percentile } from '@party/shared/stats';
import {
  COUNTDOWN_MS, TICK_MS, addPlayer, createGame, dropPlayer, rejoinPlayer, removePlayer, resolvePause, tick,
  type Controls,
} from '@party/shared/game';
import type { RoundView } from './art/hud';

interface P {
  info: PublicPlayer;
  ctl: { x: number; y: number; b: boolean }; // latest input: no queue
  pendA: number; // A presses not yet consumed by a tick
  pendB: number; // same for B (a quick tap can start and end between two ticks: the dash needs it)
  tracker: PressTracker;
  rtt: number[]; lag: number[];
  off: number | null; // phone clock -> server clock
  pkts: number; pktsRate: number;
}
const players = new Map<number, P>();
const pendingLag: { id: number; sendServerTime: number }[] = [];
const csv: string[] = [];
const sync = new ClockSync();
const $ = (id: string) => document.getElementById(id)!;
const connectedCount = () => [...players.values()].filter((p) => p.info.connected).length;
const connectedN = () => lobbyN(connectedCount());
const room = (() => {
  const q = new URLSearchParams(location.search).get('room');
  try {
    const code = q || sessionStorage.getItem('pg.screenRoom') || newRoomCode();
    sessionStorage.setItem('pg.screenRoom', code);
    return code;
  } catch { return q || newRoomCode(); }
})();
let captainId: number | null = null; // the phone that holds the crown (the relay elects it): the only one whose D-pad moves the menus
let lastKeyAt: number | null = null; // when the Mac keyboard last pressed something: it keeps the last word over the D-pad
let phase: Phase = 'menu'; // Pichiclub start: the screen picks the game, then that game's lobby
let config: LobbyConfig = { ...DEFAULT_CONFIG, seed: (Math.random() * 2 ** 32) >>> 0 };
let game = createGame();
const played = new Set<string>(); // maps already played in this session (coop and versus ids): the lobby proposes a new one by default
let teamsTouched = false; // somebody moved a player by hand: the lobby stops rebalancing the teams on its own
let lockBeforeStart = false; // the teams lock while a match runs; this is what the host had set
let teamNotice = ''; // why the last move or mode change was refused
let roundView: RoundView = { teams: null, hiddenScore: false };
let mapTouched = false; // the host picked a map by hand: stop proposing defaults
let mapNotice = '';
const puestoOf = new Map<number, PuestoView>(); // suggested stations of the running round, by player id
let puestoStamp = 0;
let puestoMsg: import('@party/shared').PuestoMsg | undefined;
let debugOverride = false;
let screenRtt = NaN;
let totalPkts = 0;
let pktsRate = 0;
let activeGame: 'pizzas' | 'obstaculos' = 'pizzas'; // the game of the round that is running (or just ran): config.game can change in the lobby meanwhile
let obstRun: ObstRun | null = null;
let obstNotice = '';
const audio = initAudio(gameBus, () => ({
  phase, started: game.started && activeGame === 'pizzas', timeLeftMs: phase === 'playing' && game.started && activeGame === 'pizzas' ? game.params.roundMs - game.time : null,
}));
const IDLE_MUSIC: MusicState = { biome: 'beach', playing: false, progress: 0, danger: 0, stragglers: 0, moving: false, checkpointed: false, maxRopeTension: 0, lavaNear: false };
const obstAudio = initObstAudio(gameBus, () => obstRun?.biome ?? 'beach', () => (obstRun && phase === 'playing' ? obstRun.musicState() : IDLE_MUSIC));
try { if (localStorage.getItem('pg.muted') === '1') obstAudio.toggleMute(); } catch { /* storage blocked */ }
const obstOpts = (): ObstOptions => parseObstOptions(config.modeOptions);
const slotName = (slot: number) => [...players.values()].find((p) => p.info.slot === slot)?.info.name ?? `J${slot + 1}`;
// Obstaculos' campaign (the hub, the trail map and the results after each level; the progress lives on the server). campRun: the level that runs now, null in a quick game.
let campRun: string | null = null;
const camp = new CampaignScreen({
  api: new CampaignApi(), catalog: LEGACY_CATALOG, room, kv: (() => { try { return localStorage; } catch { return null; } })(),
  host: { set: (h) => setHtml('campaign', h) }, results: { set: (h) => setHtml('campres', h) },
  names: () => [...players.values()].filter((p) => p.info.connected).sort((a, b) => a.info.slot - b.info.slot).map((p) => p.info.name),
  count: connectedCount,
  difficulty: () => ({ value: config.difficulty, set: (d) => setConfig({ difficulty: d }), labels: DIFFICULTY_LABEL, all: DIFFICULTIES }),
  sfx: (s) => audio.ui(NAV_SFX[s]),
  leaveToMenu: () => transition(() => dispatch('back')),
  quick: () => renderUi(),
  play: (id) => campStart(id),
  toLobby: () => { if (phase === 'results') dispatch('again'); },
  refresh: () => renderUi(),
});

const record = (kind: 'rtt' | 'lag', p: P, v: number) => {
  (kind === 'rtt' ? p.rtt : p.lag).push(v);
  csv.push(`${kind},${p.info.name}#${p.info.id},${Date.now()},${v.toFixed(2)}`);
};

function upsert(info: PublicPlayer, reset = false) {
  let p = players.get(info.id);
  if (!p) {
    p = {
      info, ctl: { x: 0, y: 0, b: false }, pendA: 0, pendB: 0, tracker: new PressTracker(),
      rtt: [], lag: [], off: null, pkts: 0, pktsRate: 0,
    };
    players.set(info.id, p);
    addPlayer(game, info.id, info.slot);
    audio.playerJoined();
  }
  const back = !!p && !p.info.connected && info.connected;
  p.info = info;
  if (reset) p.ctl = { x: 0, y: 0, b: false };
  obstRun?.setConnected(info.slot, info.connected);
  if (back && phase === 'playing' && game.versus) rejoinPlayer(game, info.id); // back within the grace time: same team, same chef
  renderUi();
}

function remove(id: number) {
  const p = players.get(id);
  if (!p) return;
  players.delete(id);
  removePlayer(game, id);
  obstRun?.setConnected(p.info.slot, false);
  renderUi();
}

const sendMsg = (m: ClientMsg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

function setPhase(next: Phase) {
  if (next === phase) return;
  phase = next;
  let match: MatchStart | undefined;
  if (phase === 'playing' && config.game === OBST_ID) startObst();
  else if (phase === 'playing' && config.modeId === 'versus' && config.teams) {
    activeGame = 'pizzas';
    showScene('main');
    match = startVersus();
  } else if (phase === 'playing') {
    activeGame = 'pizzas';
    showScene('main');
    const n = connectedN();
    const map = resolveMap(config.map as MapChoice, config.seed, config.difficulty, n, Math.random);
    game = createGame({ mapId: map.id, difficulty: config.difficulty, n, rows: map.rows, spawns: map.spawns, countdownMs: COUNTDOWN_MS, bus: gameBus });
    played.add(map.id);
    // spawn i holds the i-th chef (connected ones first), so "spawn i = puesto i" holds even when slots have gaps
    const order = [...players.values()].sort((a, b) => Number(b.info.connected) - Number(a.info.connected) || a.info.slot - b.info.slot);
    order.forEach((p, rank) => { addPlayer(game, p.info.id, p.info.slot, rank); p.pendA = 0; p.pendB = 0; });
    puestoOf.clear();
    const live = order.filter((p) => p.info.connected);
    if (live.length >= 2) {
      const pm = assignPuestos(live.map((p) => p.info.id), featuresOf(game.stations), map.puestos);
      pm.assign.forEach((a) => puestoOf.set(a.id, { ids: a.puestos, stamp: ++puestoStamp }));
      puestoMsg = pm;
    } else puestoMsg = undefined;
    overAt = null;
    stats.delivered.clear();
    roundView = { teams: null, hiddenScore: false };
    scene.startRound(game, map.id, config.seed);
  } else if (phase === 'results') renderResults();
  else if (phase === 'lobby') {
    scene.endRound(); endObst();
    if (config.modeId === 'versus' && config.teamsLocked !== lockBeforeStart) setConfig({ teamsLocked: lockBeforeStart }); // the match is over: the host's own lock again
  }
  else if (phase === 'menu') { endObst(); campRun = null; void camp.exit(); menuSel = Math.max(0, menuCards(connectedCount()).findIndex((c) => c.id === config.game)); } // coming back: the game just left stays highlighted
  // cooperative: every player carries the team score
  // cooperative: every player carries the team score; versus: the score of the player's own team
  const scoreOf = (id: number) => (activeGame === OBST_ID ? obstRun?.session.run.score ?? 0 : game.versus ? game.teams[game.players.get(id)?.team ?? teamOf(config.teams, id)?.id ?? 0]?.score ?? 0 : game.score);
  sendMsg({ t: 'phase', phase, scores: phase === 'results' ? [...players.keys()].map((id) => ({ id, score: scoreOf(id) })) : undefined, puestos: phase === 'playing' && activeGame === 'pizzas' ? puestoMsg : undefined, ...(match ? { match } : {}) });
  renderUi();
}

// ---- Obstaculos en cadena: the expedition runs in its own Phaser scene (the real world at 60 Hz, see games/obstaculos/host.ts)
const biomeColor: Record<Biome, string> = { beach: '#F2D49B', forest: '#4E7D3A', mine: '#B87333', glacier: '#BFE8F5', volcano: '#FF5A1F' };
function showScene(which: 'main' | 'obst') {
  const sm = phaser.scene;
  if (which === 'obst') {
    if (sm.isActive('main')) sm.sleep('main');
    if (sm.isSleeping('obstaculos')) sm.wake('obstaculos'); else if (!sm.isActive('obstaculos')) sm.start('obstaculos');
  } else {
    if (sm.isActive('obstaculos') || sm.isSleeping('obstaculos')) { obstScene.endLevel(); if (sm.isActive('obstaculos')) sm.sleep('obstaculos'); }
    if (sm.isSleeping('main')) sm.wake('main');
  }
}
function startObst() {
  const live = [...players.values()].filter((p) => p.info.connected);
  const o = obstOpts();
  const level = resolveLevel(o.level, live.length, o.tether);
  const spec = campRun ? camp.runSpec(campRun) : null; // a campaign level: its own tilemap and mode, one level per run, saved the moment it ends
  const cr = spec && !('ok' in spec) ? spec : null;
  if (!cr) campRun = null;
  puestoOf.clear(); puestoMsg = undefined;
  activeGame = 'obstaculos';
  obstSummary = null;
  obstRun = new ObstRun({ mode: cr ? cr.mode : o.tether, difficulty: config.difficulty, level: cr ? 1 : level, seed: config.seed, slots: live.map((p) => p.info.slot), ...(cr ? { levels: [cr.def] } : {}) }, {
    names: slotName, bus: gameBus,
    onOver: () => { obstSummary = obstRun?.session.summary() ?? null; if (cr) void camp.over().then(() => dispatch('timeout')); else dispatch('timeout'); },
    ...(cr ? { onLevelEnd: (e) => camp.levelEnd(e) } : {}),
  });
  showScene('obst');
}
// From the campaign's map or its results: the level `levelId` starts (the iris, then the round; no how-to card between levels).
function campStart(levelId: string) {
  if (starting) return;
  campRun = levelId;
  starting = true;
  iris(() => { if (phase === 'results') dispatch('again'); dispatch('start'); gateUntil = performance.now() + 700; }, () => { starting = false; });
}
function endObst() { obstRun = null; if (activeGame === OBST_ID) { showScene('main'); activeGame = 'pizzas'; } }
let obstSummary: RunSummary | null = null;
const obstStepMs: number[] = []; // ms the simulation step took, last 600 frames (perf check)
const obstFrameMs: number[] = []; // ms a whole scene update took (simulation + drawing calls), same window

// Versus: the lobby's frozen teams and map become the round (createVersusGame), with the puestos dealt inside each kitchen.
function startVersus(): MatchStart {
  const slotOf = (id: number) => players.get(id)?.info.slot ?? 0;
  const round = startVersusRound({ teams: config.teams!, choice: config.map, difficulty: config.difficulty, seed: config.seed, modeOptions: config.modeOptions, slotOf, rand: Math.random, bus: gameBus, countdownMs: COUNTDOWN_MS });
  const { map, teams } = round;
  game = round.game;
  played.add(map.id);
  for (const p of players.values()) { p.pendA = 0; p.pendB = 0; }
  puestoOf.clear();
  const f = featuresOf(game.stations);
  const assign = teams.flatMap((t) => assignPuestos(t.playerIds, f).assign); // chef i of a team = puesto i; the default table is the same for both kitchens
  puestoMsg = { cheese: f.cheese, sink: f.sink, assign };
  assign.forEach((a) => puestoOf.set(a.id, { ids: a.puestos, stamp: ++puestoStamp }));
  overAt = null;
  stats.delivered.clear();
  lockBeforeStart = config.teamsLocked;
  config = { ...config, teams, teamsLocked: true }; // frozen for the match; the phones get their kitchen side with `you`
  sendMsg({ t: 'config', ...config });
  roundView = { teams, hiddenScore: config.modeOptions.hiddenScore === true };
  scene.startRound(game, map.id, config.seed, roundView);
  return round.match;
}
const setConfig = (patch: Partial<LobbyConfig>) => {
  config = { ...config, ...patch };
  sendMsg({ t: 'config', ...config });
  renderUi();
};

// --- Modes and teams (Versus F1). The screen is the host: it owns the teams, the phones only ask (setTeam) and the relay forwards. ---
const gameDef = (): GameDef => GAMES.find((x) => x.id === config.game) ?? GAMES[0];
const modeNow = () => modeOf(gameDef(), config.modeId);
const isVersus = () => config.modeId === 'versus';
const connectedIds = () => [...players.values()].filter((p) => p.info.connected).sort((a, b) => a.info.slot - b.info.slot).map((p) => p.info.id);
const MODE_PILL: Partial<Record<ModeId, string>> = { coop: 'Cooperativo', versus: 'Versus' };
const OPTION_PILL: Record<string, string> = { hiddenScore: 'Marcador oculto', handicap: 'Ventaja equipo chico' }; // the registry labels are sentences; the pills need short ones
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function setMode(id: ModeId) {
  if (phase !== 'lobby' || id === config.modeId) return;
  const mode = modeOf(gameDef(), id);
  if (id === 'versus') {
    const av = versusAvailability(mode, connectedCount());
    if (!av.ok) { teamNotice = av.reason; renderUi(); return; }
  }
  teamNotice = ''; teamsTouched = false; mapTouched = false; mapNotice = '';
  const teams = syncTeams(mode, null, connectedIds(), config.seed, false);
  setConfig({ modeId: id, teams, teamsLocked: false, modeOptions: id === 'versus' ? defaultModeOptions(mode) : {}, map: id === 'versus' ? defaultVersusChoice(teamSizes(teams), played) : defaultMap(connectedN(), played).id });
}
// A phone ("Cambiar de equipo") or the host (click on a chip) moves a player; the lobby decides (locked teams, unknown team, a player that is not here).
function moveToTeam(playerId: number, teamId: number) {
  if (phase !== 'lobby' || !isVersus() || !config.teams || !connectedIds().includes(playerId)) return;
  const r = movePlayer(config.teams, playerId, teamId, config.teamsLocked);
  if (!r.ok) { teamNotice = r.reason; renderUi(); return; }
  teamNotice = ''; teamsTouched = true;
  setConfig({ teams: r.teams });
}
function shuffleTeams() {
  if (!config.teams) return;
  if (config.teamsLocked) { teamNotice = 'Los equipos están bloqueados'; renderUi(); return; }
  teamNotice = ''; teamsTouched = false;
  setConfig({ teams: reshuffleTeams(config.teams, (Math.random() * 2 ** 32) >>> 0) });
}
// Why the round cannot start yet ('' when it can). Versus also needs a legal split.
function startProblem(): string {
  if (!canStart([...players.values()].map((p) => p.info))) return 'Esperando jugadores';
  if (isVersus()) { const s = lobbySetup(modeNow(), config.teams); if (!s.ok) return s.problems[0]!; }
  return '';
}

// Keeps the lobby coherent with who is connected: versus that stopped being possible falls back to coop (saying so), the teams follow the
// players, and the map proposal follows the teams. Returns true when the mode is versus.
function syncLobby(n: number): boolean {
  if (isVersus()) {
    const av = versusAvailability(modeNow(), connectedCount());
    if (!av.ok) {
      teamNotice = `${av.reason}: se volvió a Cooperativo`;
      mapTouched = false;
      config = { ...config, modeId: 'coop', teams: null, teamsLocked: false, modeOptions: {}, map: defaultMap(n, played).id };
      sendMsg({ t: 'config', ...config });
    }
  }
  if (!isVersus()) {
    if (isVersusChoice(config.map)) { config = { ...config, map: defaultMap(n, played).id }; sendMsg({ t: 'config', ...config }); }
    syncMap(n);
    return false;
  }
  const teams = syncTeams(modeNow(), config.teams, connectedIds(), config.seed, teamsTouched);
  if (teams !== config.teams) { config = { ...config, teams }; sendMsg({ t: 'config', ...config }); }
  syncVersusMap();
  return true;
}
function syncVersusMap() {
  const sizes = teamSizes(config.teams);
  const patch = (map: LobbyConfig['map']) => { config = { ...config, map }; sendMsg({ t: 'config', ...config }); };
  const cur = config.map;
  if (!isVersusChoice(cur)) { patch(defaultVersusChoice(sizes, played)); return; }
  const m = versusMap(cur);
  if (!mapTouched) { const d = defaultVersusChoice(sizes, played); if (cur !== d) patch(d); return; }
  if (m && versusMapStatus(m, sizes).state === 'blocked') {
    const r = versusLobbyMaps(sizes).find((x) => x.status.state === 'recommended')?.map;
    mapNotice = `${m.name} no sirve para ${sizes.join(' contra ')}: se cambió a ${r?.name ?? 'Aleatorio'}`;
    patch(r ? (r.id as LobbyConfig['map']) : VERSUS_AUTO);
  } else if (!m) mapNotice = '';
}

// Starting a round: iris closes, the "how to play" card shows for ~10 s (Enter skips), iris again, then the countdown.
function startRound() {
  if (phase !== 'lobby' || starting || howTo || !canStart([...players.values()].map((p) => p.info))) return;
  campRun = null;
  starting = true;
  iris(() => openHowTo('start'), () => { starting = false; });
}
function beginRound() {
  if (starting) return;
  starting = true;
  iris(() => { closeHowTo(); dispatch('start'); gateUntil = performance.now() + 700; }, () => { starting = false; });
}

let howTo: HowToState | null = null;
function openHowTo(mode: HowToState['mode']) {
  const g = GAMES.find((x) => x.id === config.game) ?? GAMES[0];
  howTo = { mode, startedAt: performance.now() };
  $('howtogame').textContent = g.name;
  $('howtobody').innerHTML = howToHtml(gameInfo(g.id, GAMES, config.modeId).howTo);
  $('howtobar').style.visibility = mode === 'start' ? 'visible' : 'hidden';
  $('howto').classList.remove('off');
  tickHowTo();
}
function closeHowTo() {
  howTo = null;
  $('howto').classList.add('off');
}
function tickHowTo() {
  if (!howTo) return;
  const now = performance.now();
  if (howTo.mode === 'start') {
    if (isExpired(howTo, now)) { beginRound(); return; }
    ($('howtofill') as HTMLElement).style.width = `${(progress(howTo.startedAt, now) * 100).toFixed(1)}%`;
    $('howtohint').innerHTML = `Empieza en <b>${secondsLeft(howTo.startedAt, now)}</b> · Enter para saltar`;
  } else {
    ($('howtofill') as HTMLElement).style.width = '0';
    $('howtohint').innerHTML = '<b>H</b> o <b>Enter</b> para cerrar';
  }
}
setInterval(tickHowTo, 100);
const dispatch = (ev: Parameters<typeof nextPhase>[1]) => {
  if (ev === 'start' && !canStart([...players.values()].map((p) => p.info))) return;
  setPhase(nextPhase(phase, ev));
};

function onMessage(m: ServerMsg) {
  switch (m.t) {
    case 'state': {
      const ids = new Set(m.players.map((i) => i.id));
      for (const id of [...players.keys()]) if (!ids.has(id)) remove(id);
      m.players.forEach((i) => upsert(i, true));
      break;
    }
    case 'player_joined': upsert(m.player, true); break;
    case 'player_left': {
      const p = players.get(m.playerId);
      if (p) {
        p.info.connected = false; p.ctl = { x: 0, y: 0, b: false };
        obstRun?.setConnected(p.info.slot, false);
        if (phase === 'playing' && game.versus) dropPlayer(game, p.info.id); // a ghost for GHOST_MS: what it held goes to a free counter
        renderUi();
      }
      break;
    }
    case 'setTeam': moveToTeam(m.playerId, m.teamId); break; // a phone asked to change team
    case 'player_removed': remove(m.playerId); break;
    case 'captain': captainId = m.playerId; renderUi(); break;
    case 'nav': { // the Captain's D-pad: the same handler as the keyboard, fed with the key that intent stands for
      if (!acceptNav(captainId, m.from) || remoteBlocked(lastKeyAt, performance.now())) break;
      onKey(navToKey(m.key), false);
      break;
    }
    case 'puesto': { // the phone picked another puesto with "Cambiar": the screen lights it up again
      if (phase === 'playing' && players.has(m.playerId)) puestoOf.set(m.playerId, { ids: m.puestos as PuestoId[], stamp: ++puestoStamp });
      break;
    }
    case 'rtt': {
      const p = players.get(m.playerId);
      if (p) { p.off = m.off; record('rtt', p, m.rtt); }
      break;
    }
    case 'pong': {
      screenRtt = performance.now() - m.id;
      sync.add(screenRtt, m.t0, m.ts);
      break;
    }
    case 'input': {
      const p = players.get(m.playerId);
      if (!p) return;
      totalPkts++; p.pkts++;
      p.ctl = { x: m.x, y: m.y, b: (m.btn & 2) !== 0 };
      if (activeGame === 'obstaculos' && phase === 'playing') obstRun?.receive(p.info.slot, { x: m.x, y: m.y, presses: m.presses }); // the last packet of every phone
      const delta = p.tracker.update(m.presses);
      if (delta.some((d) => d > 0)) {
        p.pendA += delta[0] ?? 0;
        p.pendB += delta[1] ?? 0;
        if (p.off !== null) pendingLag.push({ id: p.info.id, sendServerTime: m.ts + p.off });
      }
      break;
    }
  }
}

let ws: WebSocket;
function connect() {
  ws = new WebSocket(`ws://${location.host}${WS_PATH}?role=screen&room=${encodeURIComponent(room)}`);
  ws.onopen = () => { sendMsg({ t: 'config', ...config }); sendMsg({ t: 'phase', phase }); };
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => setTimeout(connect, 500);
}
connect();
setInterval(() => {
  if (ws.readyState !== WebSocket.OPEN) return;
  // id carries the perf timestamp so RTT keeps sub-ms precision
  ws.send(JSON.stringify({ t: 'ping', id: performance.now(), t0: Date.now() }));
}, PING_MS);

let overAt: number | null = null;
let gateUntil = 0; // the logic waits for the iris to open
let starting = false;
let acc = 0;
const host: Host = {
  players: () => new Map([...players].map(([id, p]) => [id, p.info])),
  puestos: () => puestoOf,
  step(delta) {
    syncPauseBar();
    if (phase !== 'playing' || activeGame !== 'pizzas' || performance.now() < gateUntil) { acc = 0; return; }
    acc += Math.min(delta, 100);
    while (acc >= TICK_MS) {
      acc -= TICK_MS;
      const controls = new Map<number, Controls>();
      for (const p of players.values()) {
        controls.set(p.info.id, { ...p.ctl, a: p.pendA, bTaps: p.pendB });
        p.pendA = 0; p.pendB = 0;
      }
      tick(game, controls);
      if (game.over) { overAt ??= performance.now(); break; }
    }
    // "¡TIEMPO!" stays on screen for a beat before the results
    if (game.over && overAt !== null && performance.now() - overAt > 1100) { overAt = null; dispatch('timeout'); }
  },
};
// Versus: a team with nobody stops the clock; the host picks "Seguir sin ganador" or "Terminar" (resolvePause).
let pauseShown = false;
function syncPauseBar() {
  const on = phase === 'playing' && !!game.paused;
  if (on === pauseShown) return;
  pauseShown = on;
  $('pausebar').classList.toggle('off', !on);
  if (on) $('pausetxt').textContent = `${game.paused!.teams.map((t) => roundView.teams?.[t]?.name ?? `Equipo ${t + 1}`).join(' y ')} se quedó sin jugadores`;
}
const scene = new MainScene(host);
const obstScene: ObstaclesScene = new ObstaclesScene({
  step(delta) {
    if (phase !== 'playing' || activeGame !== OBST_ID || !obstRun || performance.now() < gateUntil) return;
    const t0 = performance.now();
    obstRun.step(delta);
    obstStepMs.push(performance.now() - t0); if (obstStepMs.length > 600) obstStepMs.shift();
  },
  world: () => (obstRun && activeGame === OBST_ID && (phase === 'playing' || phase === 'results') ? obstRun.world() : null),
  afterRender: (v) => obstRun?.afterRender(v),
}, gameBus);
{ const base = obstScene.update.bind(obstScene); obstScene.update = (t: number, d: number) => { const a = performance.now(); base(t, d); if (phase === 'playing' && activeGame === OBST_ID) { obstFrameMs.push(performance.now() - a); if (obstFrameMs.length > 600) obstFrameMs.shift(); } }; }
// Called right after the frame is drawn: closest browser-side proxy for "visible on screen".
const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: C.cocoa,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H },
  fps: { target: 60 },
  scene: [scene, obstScene],
});
phaser.events.on(Phaser.Core.Events.POST_RENDER, () => {
  const off = sync.offset;
  if (!pendingLag.length || off === null) return;
  const nowServer = Date.now() + off;
  for (const q of pendingLag.splice(0)) {
    const p = players.get(q.id);
    if (p) record('lag', p, nowServer - q.sendServerTime);
  }
});
(window as unknown as { __pg: unknown }).__pg = {
  // Obstaculos: state for the bots (a phone cannot see the world) and hooks for the capture tool. Never used by the game itself.
  obst: () => {
    if (!obstRun) return null;
    const ss = obstRun.session, w = ss.world;
    const full = JSON.parse(JSON.stringify(snapshotObst(w)));
    delete full.grid;
    return { ...full, phase, sess: ss.status, level: w.level.def.id, levelIndex: ss.levelIndex, tick: w.tick, countdownMs: ss.countdownMs, over: ss.over, world: w.status };
  },
  obstGrid: () => (obstRun ? { w: obstRun.session.world.grid.w, h: obstRun.session.world.grid.h, cells: Array.from(obstRun.session.world.grid.cells), rows: obstRun.session.world.level.def.rows } : null),
  obstPerf: () => { const q = (src: number[]) => { const a = [...src].sort((x, y) => x - y); return { p50: a[Math.floor(a.length * 0.5)] ?? 0, p95: a[Math.floor(a.length * 0.95)] ?? 0, max: a[a.length - 1] ?? 0 }; }; return { n: obstStepMs.length, ...q(obstStepMs), frame: q(obstFrameMs), fps: phaser.loop.actualFps }; },
  obstWin: () => { if (!obstRun) return; const w = obstRun.session.world, g = w.level.markers.goal[0]!; for (const p of w.players) if (p.connected) { p.body.x = g.x * 48 + 7; p.body.y = (g.y + 1) * 48 - 46; p.body.vx = 0; p.body.vy = 0; } },
  obstFail: () => { if (!obstRun) return; for (const p of obstRun.session.world.players) p.body.y = 100_000; },
  obstSkip: (ms: number) => { if (!obstRun) return; for (let t = 0; t < ms; t += 1000 / 60) obstRun.step(1000 / 60); },
  deliver: (m: ServerMsg) => onMessage(m), // e2e: hand the screen a relay message directly (to prove the screen validates the Captain itself)
  captain: () => captainId,
  camp: () => ({ on: camp.on, resultOn: camp.resultOn, state: camp.state, expId: camp.flow.exp?.id ?? null, outcome: camp.flow.outcome, run: campRun }), // e2e: what the campaign believes
  forceLobby: () => { if (phase === 'menu') setPhase('lobby'); }, // capture tool: skip the menu (and its player range)
  menu: () => ({ sel: menuSel, cards: menuCards(connectedCount()).map((c) => `${c.id}:${c.state}`) }),
  forceExpire: () => { for (const o of game.orders) o.expiresAt = game.time + 30; },
  fastForward: (ms: number) => { game.params.roundMs = game.time + ms; },
  setScore: (n: number) => { game.score = n; }, // capture tool: results screen with stars
  snapshot: () => ({ versus: game.versus, over: game.over, teams: game.teams.map((t) => ({ id: t.id, n: t.n, score: t.score, delivered: t.delivered, k: t.k, vips: t.vips, orders: t.orders.length })), winner: game.result?.winner ?? null, paused: !!game.paused, fps: phaser.loop.actualFps, phase, players: [...game.players.values()], stations: game.stations, orders: game.orders, time: game.time, score: game.score, countdown: game.countdown, streak: game.streak, bestStreak: game.bestStreak, crowd: [...game.crowd.keys()] }),
};

$('code').textContent = room;
fetch(`/api/info?room=${encodeURIComponent(room)}`)
  .then((r) => r.json())
  .then(({ url, qrSvg }: { url: string; qrSvg: string }) => {
    document.getElementById('qr')!.innerHTML = qrSvg;
    document.getElementById('joinurl')!.textContent = url.replace(/^http:\/\//, '');
  })
  .catch(() => { document.getElementById('joinurl')!.textContent = 'no se pudo obtener la URL'; });

const f = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : '-');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// layout: the 1920x1080 stage is scaled to the window
const fit = () => document.documentElement.style.setProperty('--k', String(Math.min(innerWidth / 1920, innerHeight / 1080)));
fit();
addEventListener('resize', fit);
drawLogo($('logo') as HTMLCanvasElement);

// lobby chips: one persistent element per slot so the idle animation never restarts
const chips = Array.from({ length: 8 }, (_v, i) => {
  const el = document.createElement('div');
  el.className = 'chip empty';
  el.style.setProperty('--c', chefOf(i).color);
  el.innerHTML = '<div class="av"></div><div><div class="nm"></div><div class="sub"></div></div><div class="num"></div><div class="mv" title="Pasar al otro equipo">⇄</div>';
  $('chips').appendChild(el);
  return { el, av: el.querySelector('.av')!, nm: el.querySelector('.nm')!, sub: el.querySelector('.sub')!, num: el.querySelector('.num')!, who: -1 };
});
chips.forEach((c, i) => { c.num.textContent = String(i + 1); c.nm.textContent = 'Esperando…'; });

const cache = new Map<string, string>();
const setHtml = (id: string, html: string) => { if (cache.get(id) !== html) { cache.set(id, html); $(id).innerHTML = html; } };

function renderChips() {
  const bySlot = new Map([...players.values()].map((p) => [p.info.slot % 8, p.info]));
  chips.forEach((c, i) => {
    const info = bySlot.get(i);
    c.el.classList.toggle('empty', !info);
    c.el.classList.toggle('gone', !!info && !info.connected);
    if (!info) { c.who = -1; c.av.replaceChildren(); c.nm.textContent = 'Esperando…'; c.sub.textContent = ''; return; }
    if (c.who !== info.id) {
      c.who = info.id;
      c.av.replaceChildren(chefCanvas(i, 'idle', true));
      c.el.classList.remove('pop'); void c.el.offsetWidth; c.el.classList.add('pop');
    }
    c.nm.textContent = (info.id === captainId ? '👑 ' : '') + info.name;
    c.sub.textContent = info.connected ? `${chefOf(i).name} · listo` : 'Desconectado';
  });
}

// Versus lobby: the chip elements are the same ones, moved into the team columns (and back home for coop / the menu).
let chipsInTeams = false;
function showTeams(on: boolean) {
  $('chips').classList.toggle('off', on);
  $('teams').classList.toggle('off', !on);
  $('teambar').classList.toggle('off', !on);
  if (!on && chipsInTeams) { chipsInTeams = false; $('chips').replaceChildren(...chips.map((c) => c.el)); }
}
function renderTeams() {
  chipsInTeams = true;
  const teams = config.teams ?? [];
  const setup = lobbySetup(modeNow(), config.teams);
  $('teams').classList.toggle('teams-locked', config.teamsLocked);
  teams.forEach((t, i) => {
    const col = $(`tc${i}`);
    col.style.setProperty('--tc', t.color);
    const k = setup.ok ? setup.k[i] ?? 1 : 1;
    setHtml(`th${i}`, `<span class="ti">${esc(t.icon)}</span>${esc(t.name)}${k > 1 ? `<span class="tk" title="Multiplicador del equipo chico">×${k}</span>` : ''}<small>${plural(t.playerIds.length, 'jugador', 'jugadores')}</small>`);
    const list = col.querySelector('.tlist')!;
    const want: HTMLElement[] = t.playerIds.map((id) => chips.find((c) => c.who === id)?.el).filter((el): el is HTMLDivElement => !!el);
    if (!want.length) { const note = document.createElement('div'); note.className = 'empty-note'; note.textContent = 'Sin jugadores'; want.push(note); }
    const cur = Array.from(list.children);
    if (want.length !== cur.length || want.some((el, j) => el !== cur[j])) list.replaceChildren(...want);
  });
  $('lock').textContent = config.teamsLocked ? 'Desbloquear equipos' : 'Bloquear equipos';
  $('lock').classList.toggle('sel', config.teamsLocked);
  for (const o of modeNow().options ?? []) {
    const el = $(`opt-${o.id}`);
    el.textContent = OPTION_PILL[o.id] ?? o.label;
    el.classList.toggle('on', config.modeOptions[o.id] === true);
    el.classList.toggle('sel', config.modeOptions[o.id] === true);
  }
  const th = $('teamhint');
  const sizes = teamSizes(config.teams), big = Math.max(...sizes), small = Math.min(...sizes);
  const uneven = setup.ok && big !== small;
  th.textContent = teamNotice || (!setup.ok ? setup.problems[0]! : uneven ? (config.modeOptions.handicap !== false ? `${big} contra ${small}: el equipo de ${small} gana ×${Math.max(...setup.k)}` : `${big} contra ${small}, sin ventaja para el equipo chico`) : 'Clic en un jugador: cambia de equipo');
  th.classList.toggle('bad', !!teamNotice || !setup.ok);
}
// The generated versus map of a seed is expensive enough (bounded attempts, each one validated) not to redo it on every render.
let vsGenCache: { key: string; rows: readonly string[] } | null = null;
function versusGenerated(seed: number, difficulty: LobbyConfig['difficulty'], sizes: readonly number[]) {
  const key = `${seed}|${difficulty}|${Math.max(0, ...sizes)}`;
  if (vsGenCache?.key !== key) vsGenCache = { key, rows: resolveVersusMap(VERSUS_RANDOM, seed, difficulty, sizes, Math.random).rows };
  return vsGenCache;
}

let lastMapKey = '';
// Keeps the selection useful for the people connected: proposes a default until the host picks by hand, and moves off a map
// that got blocked because someone joined or left (saying so).
function syncMap(n: number) {
  const patch = (map: MapChoice) => { config = { ...config, map }; sendMsg({ t: 'config', ...config }); };
  if (!mapTouched) {
    const d = defaultMap(n, played).id;
    if (config.map !== d) patch(d);
    return;
  }
  const cur = isMapChoice(config.map) && config.map !== 'auto' && config.map !== 'random' ? fixedMap(config.map) : undefined;
  if (cur && mapStatus(cur, n).state === 'blocked') {
    const r = replacementMap(cur, n);
    mapNotice = `${cur.name} no sirve con ${n} ${n === 1 ? 'jugador' : 'jugadores'}: se cambió a ${r.name}`;
    patch(r.id);
  } else if (!cur) mapNotice = '';
}
// Start menu: one persistent card per registry game (plus the announced ones), so the art is drawn once and the idle state never restarts.
let menuSel = 0;
function renderMenu() {
  const cards = menuCards(connectedCount());
  const host = $('menucards');
  const key = cards.map((c) => c.id).join('|');
  if (host.dataset.key !== key) {
    host.dataset.key = key;
    host.replaceChildren(...cards.map((c) => {
      const el = document.createElement('div');
      if (c.state !== 'soon') el.dataset.game = c.id;
      el.dataset.card = c.id;
      el.innerHTML = `<canvas class="art"></canvas><div class="body"><div class="nm">${esc(c.name)}</div><div class="bl">${esc(c.blurb)}</div>${c.range ? `<div class="pl">${esc(c.range)}</div>` : ''}</div><div class="tag"></div>`;
      drawCardArt(el.querySelector('canvas')!, c.id);
      return el;
    }));
  }
  menuSel = clampSel(cards, menuSel);
  cards.forEach((c, i) => {
    const el = host.children[i] as HTMLElement;
    el.className = `gc ${c.state}${i === menuSel && c.state !== 'soon' ? ' sel' : ''}${el.classList.contains('nope') ? ' nope' : ''}`;
    el.querySelector('.tag')!.textContent = c.notice;
  });
}
// Obstaculos' lobby: mode (Encadenados / Libres), level or "Aleatorio" with its seed, and what the choice means for this group.
function renderObstLobby() {
  const n = connectedCount();
  const o0 = obstOpts();
  const fit = resolveLevel(o0.level, n, o0.tether);
  if (fit !== o0.level && n >= 2) { // someone joined or left (or the mode changed): the level no longer fits, move to the next one that does and say so
    obstNotice = `${o0.level === RANDOM_LEVEL ? 'Aleatorio' : `El nivel ${o0.level}`} no sirve con ${n} jugadores en ${MODE_LABEL[o0.tether]}: se cambió a ${fit === RANDOM_LEVEL ? 'Aleatorio' : `el nivel ${fit}`}`;
    config = { ...config, modeOptions: toModeOptions({ ...o0, level: fit }) };
    sendMsg({ t: 'config', ...config });
  }
  const o = obstOpts();
  setHtml('obstmodes', (['chain', 'free'] as GameMode[]).map((m) => `<button class="pill ${m === o.tether ? 'sel' : ''}" data-tether="${m}" title="${MODE_BLURB[m]}">${MODE_LABEL[m]}</button>`).join(''));
  const cells = OBST_LEVELS.map((l, i) => {
    const c = levelCompat(l, n, o.tether);
    return `<button class="mc ${c.ok ? 'rec' : 'blk'} ${o.level === i + 1 ? 'sel' : ''}" data-level="${i + 1}"><span class="t"><b>${i + 1}</b>${esc(l.name)}</span>`
      + (c.ok ? `<span class="m"><i class="bio" style="background:${biomeColor[l.biome]}"></i>${l.players.min}-${l.players.max}<span class="st">${'★'.repeat(l.stars)}</span></span>` : `<span class="why">${c.reason}</span>`) + '</button>';
  });
  cells.push(`<button class="mc rnd ${o.level === RANDOM_LEVEL ? 'sel' : ''}" data-level="0"><span class="t">Aleatorio</span><span class="m">con semilla</span></button>`);
  setHtml('obstlevels', cells.join(''));
  $('obstfor').textContent = `· para ${n} ${n === 1 ? 'jugador' : 'jugadores'}`;
  $('oseedrow').classList.toggle('off', o.level !== RANDOM_LEVEL);
  $('oseed').textContent = String(config.seed);
  const exp = o.level === RANDOM_LEVEL ? [] : fixedExpedition(o.level, Math.max(2, n), o.tether);
  const info = $('obstinfo');
  info.textContent = obstNotice || (o.level === RANDOM_LEVEL ? `Tres niveles generados con las semillas ${config.seed}, ${(config.seed + 1) % 2 ** 32} y ${(config.seed + 2) % 2 ** 32}` : `Expedición: ${exp.map((l) => l.name).join(' → ')}`);
  info.classList.toggle('notice', !!obstNotice);
  const dp = OBST_DIFFICULTY[config.difficulty];
  $('obstlives').textContent = `${MODE_LABEL[o.tether]}: ${MODE_BLURB[o.tether].toLowerCase()} · ${Number.isFinite(dp.lives) ? `${dp.lives} vidas de equipo` : 'vidas ilimitadas'} · burbuja a los ${dp.bubbleSec} s fuera de cámara${dp.bubbleCostsLife ? ' (cuesta una vida)' : ''}`;
  ($('start') as HTMLButtonElement).disabled = n < 2;
}
function menuAct(a: MenuAction) {
  const snd = soundFor(a);
  if (snd) audio.ui(NAV_SFX[snd]);
  if (a.kind === 'move') { menuSel = a.sel; renderUi(); }
  else if (a.kind === 'pick') {
    const g = GAMES.find((x) => x.id === a.id);
    if (g) transition(() => {
      // a game that has no versus must not inherit the teams or the options of the one before (the relay would refuse the whole config)
      const reset: Partial<LobbyConfig> = g.id === OBST_ID ? { modeId: 'coop', teams: null, teamsLocked: false, modeOptions: toModeOptions(DEFAULT_OBST_OPTIONS) } : config.game === OBST_ID ? { modeOptions: {} } : {};
      setConfig({ game: g.id, ...reset }); dispatch('pick');
      if (g.id === OBST_ID) void camp.enter();
    });
  } else if (a.kind === 'refuse') {
    const el = $('menucards').querySelector<HTMLElement>('.sel');
    el?.classList.remove('nope'); void el?.offsetWidth; el?.classList.add('nope');
  }
}
// iris wipe between menu and lobby, the same one that opens a round
function transition(swap: () => void) {
  if (starting) return;
  starting = true;
  iris(swap, () => { starting = false; });
}
const goBack = () => {
  if (phase !== 'lobby' || starting || howTo) return;
  audio.ui(NAV_SFX.back);
  if (config.game === OBST_ID && !camp.on) { void camp.enter(); return; } // Esc in the quick-game setup goes back to the campaign's hub
  transition(() => dispatch('back'));
};

function renderUi() {
  const inMenu = phase === 'menu';
  const lobby = phase === 'lobby';
  const hub = inMenu || lobby; // both share the logo, the QR + room code and the connected players
  $('lobbybg').classList.toggle('off', !hub);
  $('stage').classList.toggle('off', !hub);
  $('menuui').classList.toggle('off', !inMenu);
  $('lobbyui').classList.toggle('off', !lobby);
  $('results').classList.toggle('off', phase !== 'results');
  $('debug').classList.toggle('off', !debugOverride);
  if (!hub) return;
  $('title').textContent = inMenu ? PLATFORM : gameName(config.game);
  $('platform').textContent = inMenu ? 'Elige un juego' : PLATFORM;
  renderChips();
  if (inMenu) { showTeams(false); renderMenu(); return; }
  setHtml('diffs', DIFFICULTIES.map((d) => `<button class="pill ${d === config.difficulty ? 'sel' : ''}" data-diff="${d}">${DIFFICULTY_LABEL[d]}</button>`).join(''));
  const isObst = config.game === OBST_ID;
  $('lobbyui').classList.toggle('camp', isObst && camp.on);
  $('campaign').classList.toggle('off', !(isObst && camp.on));
  $('back').textContent = isObst && !camp.on ? '‹ Campaña · Esc' : '‹ Elegir otro juego · Esc';
  $('pizzaops').classList.toggle('off', isObst); $('obstops').classList.toggle('off', !isObst); $('obstmodewrap').classList.toggle('off', !isObst);
  $('start').textContent = isObst ? '¡A cruzar!' : '¡A cocinar!';
  if (isObst) { showTeams(false); $('modebox').classList.add('off'); if (camp.on) { camp.render(); return; } renderObstLobby(); return; }
  const list = [...players.values()];
  const n = connectedN();
  const vs = syncLobby(n);
  const def = gameDef();
  $('modebox').classList.toggle('off', !hasModeChoice(def));
  setHtml('modes', selectableModes(def).map((m) => {
    const av = m.id === 'versus' ? versusAvailability(m, connectedCount()) : { ok: true, reason: '' };
    return `<button class="pill ${m.id === config.modeId ? 'sel' : ''} ${av.ok ? '' : 'dis'}" data-mode="${m.id}" title="${esc(av.ok ? m.label : av.reason)}">${esc(MODE_PILL[m.id] ?? m.label)}</button>`;
  }).join(''));
  showTeams(vs);
  if (vs) renderTeams();
  const sizes = teamSizes(config.teams);
  const rows = vs ? versusLobbyMaps(sizes).map(({ map, status }) => ({ map, status: status.state === 'recommended' ? { state: 'recommended' as const } : status })) : lobbyMaps(n);
  const cards = rows.map(({ map, status }) => {
    const f = mapFeatures(map.rows);
    const cls = `mc ${status.state === 'recommended' ? 'rec' : status.state === 'warn' ? 'warn' : 'blk'} ${map.id === config.map ? 'sel' : ''}`;
    const tags = `${f.cheese ? '<i class="tag" title="Queso: Margarita">Q</i>' : ''}${f.sink ? '<i class="tag l" title="Lavado de platos">L</i>' : ''}`;
    return `<button class="${cls}" data-map="${map.id}"><span class="t"><b>${map.id}</b>${esc(map.name)}</span><span class="m">${map.nMin}-${map.nMax}<span class="st">${'★'.repeat(map.stars)}</span>${tags}</span>${status.state === 'recommended' ? '' : `<span class="why">${status.reason}</span>`}</button>`;
  });
  const special = (vs ? [[VERSUS_AUTO, 'Aleatorio', 'de los que caben'], [VERSUS_RANDOM, 'Mapa generado', 'semilla nueva']] : [['auto', 'Aleatorio', 'de los ideales'], ['random', 'Mapa generado', 'semilla nueva']])
    .map(([id, label, sub]) => `<button class="mc special ${id === config.map ? 'sel' : ''}" data-map="${id}"><span class="t">${label}</span><span class="m">${sub}</span></button>`);
  setHtml('maps', [...cards, ...special].join(''));
  $('mapfor').textContent = vs && sizes.length ? `· para ${sizes.join(' contra ')}` : `· para ${n} ${n === 1 ? 'jugador' : 'jugadores'}`;
  const rand = config.map === 'random' || config.map === VERSUS_RANDOM;
  $('seedrow').classList.toggle('off', !rand);
  $('seed').textContent = String(config.seed);
  const gen = rand && !vs ? generate(config.seed, config.difficulty, n) : null;
  const vsGen = rand && vs ? versusGenerated(config.seed, config.difficulty, sizes) : null;
  const shown = vsGen ? { rows: vsGen.rows } : gen ? { rows: gen.rows } : config.map === 'auto' || config.map === VERSUS_AUTO ? null : vs ? versusMap(config.map) ?? null : fixedMap(config.map);
  const key = shown ? shown.rows.join('') : 'none';
  if (key !== lastMapKey) {
    lastMapKey = key;
    const cv = $('minimap') as HTMLCanvasElement;
    if (shown) drawMiniMap(cv, shown.rows); else { const c = cv.getContext('2d')!; c.fillStyle = '#3A2A24'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#FFF4E0'; c.font = '800 54px ui-rounded, system-ui'; c.textAlign = 'center'; c.fillText('?', cv.width / 2, cv.height / 2 + 18); }
  }
  const sel = vs || config.map === 'auto' || config.map === 'random' ? null : fixedMap(config.map);
  const selStatus = sel ? mapStatus(sel, n) : null;
  const info = $('mapinfo');
  info.textContent = mapNotice || (gen && !gen.inBand ? 'Esta semilla no cae en la banda de la dificultad: se usa el mapa válido más cercano'
    : selStatus?.state === 'warn' ? `${sel!.name}: ${selStatus.reason}. Con ${n} se puede, pero cuesta` : '');
  info.classList.toggle('notice', !!mapNotice);
  const pr = params(config.difficulty, vs ? Math.round(sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length)) : n);
  const di = $('diffinfo');
  di.textContent = teamNotice || `Pedido cada ${(pr.orderEveryMs / 1000).toFixed(0)} s, paciencia ${pr.orderTtlMs / 1000} s, hasta ${pr.maxOrders} pedidos`;
  di.classList.toggle('notice', !!teamNotice);
  ($('start') as HTMLButtonElement).disabled = !!startProblem();
}
renderUi();

// R7: a short vibration on the phone of the chef the event belongs to (the phone falls back to a colour flash)
const buzz = (player: number, kind: BuzzKind) => sendMsg({ t: 'buzz', playerId: player, kind });
gameBus.on('itemPicked', (e) => buzz(e.player, 'pick'));
gameBus.on('chopDone', (e) => buzz(e.player, 'chop'));
gameBus.on('washDone', (e) => buzz(e.player, 'chop'));
gameBus.on('interactInvalid', (e) => buzz(e.player, 'bad'));
gameBus.on('dishRejected', (e) => buzz(e.player, 'bad'));
gameBus.on('dash', (e) => buzz(e.player, 'dash'));

// round stats for the results screen
const stats = { delivered: new Map<number, number>() };
gameBus.on('delivered', (e) => stats.delivered.set(e.player, (stats.delivered.get(e.player) ?? 0) + 1));

let resultsTimers: ReturnType<typeof setTimeout>[] = [];
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const AWARDS: { key: 'ancla' | 'taxi' | 'coleccionista' | 'kamikaze' | 'pegamento'; label: string; why: string }[] = [
  { key: 'ancla', label: 'Ancla', why: 'más tiempo agarrado a una argolla' }, { key: 'taxi', label: 'Taxi', why: 'lanzamientos y manos' },
  { key: 'coleccionista', label: 'Coleccionista', why: 'más estrellas' }, { key: 'kamikaze', label: 'Kamikaze', why: 'más caídas' },
  { key: 'pegamento', label: 'Pegamento', why: 'menos tiempo fuera de cámara' },
];
function renderObstResults() {
  const sum = obstSummary ?? obstRun?.session.summary();
  if (!sum) return;
  $('resh').textContent = sum.reason === 'complete' ? '¡Expedición completa!' : 'Expedición terminada'; $('resh').style.color = '';
  $('pizzares').classList.add('off'); $('obstres').classList.remove('off'); $('vsres').replaceChildren(); $('vsnote').textContent = '';
  const starsEl = $('ostars');
  starsEl.replaceChildren();
  for (let i = 0; i < sum.expedition; i++) {
    const cv = starCanvas();
    if (i >= sum.cleared) cv.classList.add('off2');
    starsEl.appendChild(cv);
    resultsTimers.push(setTimeout(() => cv.classList.add('drop'), 500 + i * 550));
  }
  const fin = $('ofinalscore'), t0 = performance.now() + 400, dur = 1300;
  const step = () => {
    const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur));
    fin.textContent = String(Math.round(sum.score * (1 - (1 - k) ** 3)));
    if (k < 1 && phase === 'results') requestAnimationFrame(step);
  };
  step();
  const medal = { gold: ['gold', 'O'], silver: ['silver', 'P'], bronze: ['bronze', 'B'] } as const;
  $('olevels').innerHTML = sum.levels.map((l) => {
    const m = l.medal ? medal[l.medal] : ['none', '✕'];
    return `<div class="olv${l.cleared ? '' : ' lost'}"><div class="h"><span class="medal ${m[0]}">${m[1]}</span>${esc(l.name)}</div>`
      + `<div class="sub"><i class="bio" style="background:${biomeColor[l.biome]}"></i>Nivel ${l.index + 1}${l.retry ? ' · reintento ×0,5' : ''}${l.cleared ? '' : ' · sin vidas'}</div>`
      + `<div class="row"><span>Tiempo</span><span>${clock(l.timeSec)} / par ${clock(l.parSec)}</span></div>`
      + `<div class="row"><span>Estrellas</span><span>${l.stars}/${l.starsMax} ★</span></div>`
      + `<div class="row"><span>Vidas</span><span>${Number.isFinite(l.livesLeft) ? `${l.livesLeft}` : '∞'} · caídas ${l.deaths}</span></div>`
      + `<div class="row"><span>Checkpoints</span><span>${l.checkpoints}/${l.checkpointsMax}</span></div>`
      + `<div class="pts">${l.cleared ? '+' : ''}${l.score}</div></div>`;
  }).join('');
  const aw = $('oawards');
  aw.replaceChildren();
  for (const a of AWARDS) {
    const slot = sum.awards[a.key];
    if (slot === null) continue;
    const el = document.createElement('div');
    el.className = 'award'; el.title = a.why;
    el.innerHTML = `<div><small>${a.label}</small>${esc(slotName(slot))}</div>`;
    el.insertBefore(chefCanvas(slot, 'happy', true), el.firstChild);
    aw.appendChild(el);
  }
}
// Versus (minimal; F4 completes it): who won, and the numbers of each team.
function renderVersusResults() {
  const res = game.result;
  const teams = roundView.teams ?? [];
  const winner = res?.winner ?? null;
  const head = $('resh');
  if (winner !== null) {
    const w = teams[winner];
    head.textContent = `¡Ganan los ${w?.name ?? `Equipo ${winner + 1}`}!`;
    head.style.color = w?.color ?? '';
  } else {
    head.textContent = res?.aborted || game.noWinner ? 'Partida sin ganador' : '¡Empate!';
    head.style.color = '';
  }
  const win = (id: number) => id === winner;
  $('vsres').innerHTML = game.teams.map((t) => {
    const sum = summarizeTeam(game, t.id), info = teams[t.id];
    const row = (label: string, v: number) => `<div class="vr"><span>${label}</span><b>${v}</b></div>`;
    return `<div class="vteam ${win(t.id) ? 'win' : ''}" style="--tc:${info?.color ?? '#888'}"><div class="vh">${esc(info?.icon ?? '')} ${esc(info?.name ?? `Equipo ${t.id + 1}`)}</div>${win(t.id) ? '<div class="crown">👑</div>' : ''}`
      + `<div class="vs">${sum.score}</div><div class="vk">${sum.k > 1 ? `ventaja ×${sum.k} sobre ${sum.gross}` : ''}</div>`
      + `${row('Entregadas', sum.delivered)}${row('En propinas', sum.tips)}${row('Pedido dorado', sum.vips)}${row('Falladas', sum.expired + sum.rejected)}</div>`;
  }).join('');
  $('vsnote').textContent = res?.aborted ? 'El anfitrión terminó la partida' : '';
}

function renderResults() {
  resultsTimers.forEach(clearTimeout);
  resultsTimers = [];
  const campResults = activeGame === OBST_ID && camp.resultOn;
  $('campres').classList.toggle('off', !campResults); $('resh').classList.toggle('off', campResults); $('again').classList.toggle('off', campResults);
  if (campResults) { $('resultsInner').classList.remove('vs'); $('pizzares').classList.add('off'); $('obstres').classList.add('off'); $('vsres').replaceChildren(); $('vsnote').textContent = ''; camp.renderResults(); return; }
  if (activeGame === OBST_ID) { $('resultsInner').classList.remove('vs'); renderObstResults(); return; }
  $('pizzares').classList.remove('off'); $('obstres').classList.add('off');
  $('resultsInner').classList.toggle('vs', game.versus);
  if (game.versus) { renderVersusResults(); return; }
  $('resh').textContent = '¡Fin de la ronda!'; $('resh').style.color = '';
  const sum = summarize(game);
  const st = sum.stars;
  const starsEl = $('stars');
  starsEl.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const cv = starCanvas();
    if (i >= st) cv.classList.add('off2');
    starsEl.appendChild(cv);
    resultsTimers.push(setTimeout(() => cv.classList.add('drop'), 500 + i * 550));
  }
  const target = game.score, t0 = performance.now() + 400, dur = 1300;
  const fin = $('finalscore');
  const step = () => {
    const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur));
    fin.textContent = String(Math.round(target * (1 - (1 - k) ** 3)));
    if (k < 1 && phase === 'results') requestAnimationFrame(step);
  };
  step();
  const [t1, t2, t3] = sum.thresholds;
  $('starline').innerHTML = sum.next === null ? '¡Tres estrellas!' : `Próxima estrella a <b>${sum.thresholds[st]}</b> · te faltaron <b>${sum.next}</b>`;
  $('starline').title = `★ ${t1} · ★★ ${t2} · ★★★ ${t3}`;
  const stat = (cls: string, v: number | string, label: string) => `<div class="stat ${cls}"><b>${v}</b><span>${label}</span></div>`;
  $('stats').innerHTML = stat('good', sum.delivered, 'Entregadas') + stat('gold', sum.bestStreak, 'Mejor racha') + stat('gold', sum.tips, 'En propinas') + stat('bad', sum.expired + sum.rejected, 'Falladas');
  const ranked = [...players.values()].map((p) => ({ p, n: stats.delivered.get(p.info.id) ?? 0 })).sort((a, b) => b.n - a.n || a.p.info.slot - b.p.info.slot);
  const top = ranked.filter((r) => r.n > 0).slice(0, 3);
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  const pod = $('podium');
  pod.replaceChildren();
  for (const i of order) {
    const r = top[i];
    if (!r) continue;
    const el = document.createElement('div');
    el.className = `pod p${i + 1}`;
    el.innerHTML = `${i === 0 ? '<div class="crown">👑</div>' : ''}<div class="step">${esc(r.p.info.name)}<small>${r.n} ${r.n === 1 ? 'pizza' : 'pizzas'}</small></div>`;
    el.insertBefore(chefCanvas(r.p.info.slot, 'happy', true), el.firstChild);
    pod.appendChild(el);
  }
  if (!top.length) pod.innerHTML = '<div class="hint">Nadie alcanzó a entregar una pizza</div>';
}

$('menucards').addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-game]')?.dataset.game;
  if (!id || starting || phase !== 'menu') return;
  const cards = menuCards(connectedCount());
  menuSel = Math.max(0, cards.findIndex((c) => c.id === id));
  renderUi();
  menuAct(menuPick(cards, id));
});
$('menucards').addEventListener('pointermove', (e) => { // hovering moves the highlight (silently), so mouse and keys agree
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-game]')?.dataset.game;
  const i = menuCards(connectedCount()).findIndex((c) => c.id === id);
  if (i >= 0 && i !== menuSel && phase === 'menu' && !starting) { menuSel = i; renderUi(); }
});
$('back').addEventListener('click', goBack);
$('diffs').addEventListener('click', (e) => {
  const d = (e.target as HTMLElement).closest<HTMLElement>('[data-diff]')?.dataset.diff;
  const diff = DIFFICULTIES.find((x) => x === d);
  if (diff) setConfig({ difficulty: diff });
});
$('maps').addEventListener('click', (e) => {
  const m = (e.target as HTMLElement).closest<HTMLElement>('[data-map]')?.dataset.map;
  if (isVersus() ? isVersusChoice(m) : isMapChoice(m)) {
    const blocked = isVersus() ? (() => { const v = versusMap(m!); return !!v && versusMapStatus(v, teamSizes(config.teams)).state === 'blocked'; })() : (() => { const f = m === 'auto' || m === 'random' ? null : fixedMap(m!); return !!f && mapStatus(f, connectedN()).state === 'blocked'; })();
    if (blocked) return;
    mapTouched = true; mapNotice = '';
    setConfig({ map: m as LobbyConfig['map'] });
  }
});
$('modes').addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode;
  const mode = selectableModes(gameDef()).find((m) => m.id === id);
  if (mode) setMode(mode.id);
});
$('shuffle').addEventListener('click', shuffleTeams);
$('lock').addEventListener('click', () => { teamNotice = ''; setConfig({ teamsLocked: !config.teamsLocked }); });
$('teambar').addEventListener('click', (e) => {
  const opt = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]')?.dataset.opt;
  if (opt) setConfig({ modeOptions: { ...config.modeOptions, [opt]: config.modeOptions[opt] !== true } });
});
$('teams').addEventListener('click', (e) => { // the host clicks a chip: that player goes to the other team
  const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
  const c = chips.find((x) => x.el === chip);
  const t = c && c.who >= 0 ? teamOf(config.teams, c.who) : undefined;
  if (c && t && config.teams) moveToTeam(c.who, (t.id + 1) % config.teams.length);
});
$('pcont').addEventListener('click', () => { if (game.paused) resolvePause(game, 'continue'); });
$('pend').addEventListener('click', () => { if (game.paused) resolvePause(game, 'end'); });
$('again-seed').addEventListener('click', () => setConfig({ seed: (config.seed + 1) % 2 ** 32 }));
$('oseed-new').addEventListener('click', () => { obstNotice = ''; setConfig({ seed: (config.seed + 1) % 2 ** 32 }); });
const setObst = (patch: Partial<ObstOptions>) => { obstNotice = ''; setConfig({ modeOptions: toModeOptions({ ...obstOpts(), ...patch }) }); };
$('obstmodes').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tether]')?.dataset.tether;
  if (t === 'chain' || t === 'free') setObst({ tether: t });
});
$('obstlevels').addEventListener('click', (e) => {
  const v = (e.target as HTMLElement).closest<HTMLElement>('[data-level]')?.dataset.level;
  if (v === undefined) return;
  const lv = Number(v);
  if (lv !== RANDOM_LEVEL && !levelCompat(OBST_LEVELS[lv - 1]!, connectedCount(), obstOpts().tether).ok) return;
  setObst({ level: lv });
});
$('start').addEventListener('click', () => startRound());
$('campaign').addEventListener('click', (e) => { if (!starting) camp.click(e.target as HTMLElement); });
$('campres').addEventListener('click', (e) => { if (!starting) camp.click(e.target as HTMLElement); });
setInterval(() => { if (camp.armed) renderUi(); }, 250); // the Captain's 3 s before a reset can be confirmed
$('again').addEventListener('click', () => dispatch('again'));
$('howtobtn').addEventListener('click', () => { if (!howTo && !starting && phase === 'lobby') openHowTo('preview'); });
$('howto').addEventListener('click', () => { if (howTo?.mode === 'preview') closeHowTo(); });
// One handler for the Mac keyboard and for the Captain's D-pad (which arrives as the key it replaces).
function onKey(key: string, repeat: boolean) {
  if (camp.shows(phase) && !starting && !howTo && camp.key(key, repeat)) return; // the campaign owns the arrows, Enter, Esc and "?" in its screens
  const act = starting ? 'none' : howToOnKey(howTo, phase, key);
  if (act === 'open-preview') { openHowTo('preview'); return; }
  if (act === 'close') { closeHowTo(); return; }
  if (act === 'skip') { beginRound(); return; }
  if (howTo || starting) return; // the card swallows Enter and the iris swallows everything
  if (phase === 'menu') { menuAct(menuOnKey(menuCards(connectedCount()), menuSel, key)); return; }
  if (lobbyEscGoesBack(phase, key, !!howTo, starting)) { goBack(); return; }
  if (key === 'Enter' && repeat) return; // a held Enter that picked the game must not also start the round
  if (key === 'Enter' && phase === 'lobby') startRound();
  else if (key === 'Enter' && phase === 'results') dispatch('again');
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') { debugOverride = !debugOverride; renderUi(); return; }
  if ((e.key === 'm' || e.key === 'M') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) obstAudio.toggleMute(); // the pizza audio listens to the same key
  if ((e.key === 's' || e.key === 'S') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { toggleShake(); return; }
  lastKeyAt = performance.now();
  onKey(e.key, e.repeat);
});
setInterval(() => {
  pktsRate = totalPkts; totalPkts = 0;
  const rows = ['<tr><th>player</th><th>rtt last</th><th>p95</th><th>max</th><th>lag last</th><th>p95</th><th>pkt/s</th></tr>'];
  for (const p of players.values()) {
    p.pktsRate = p.pkts; p.pkts = 0;
    const r = p.rtt, l = p.lag;
    rows.push(
      `<tr style="color:${p.info.connected ? p.info.color : '#777'}"><td>${p.info.name}</td><td>${f(r.at(-1) ?? NaN)}</td>` +
      `<td>${f(percentile(r, 95))}</td><td>${f(r.length ? Math.max(...r) : NaN)}</td>` +
      `<td>${f(l.at(-1) ?? NaN)}</td><td>${f(percentile(l, 95))}</td><td>${p.pktsRate}</td></tr>`,
    );
  }
  $('table').innerHTML = rows.join('');
  $('summary').textContent = `total ${pktsRate} pkt/s | screen<->server RTT ${f(screenRtt)} ms | clock offset ${f(sync.offset ?? NaN)} ms`;
  $('warn').textContent = document.hidden ? 'TAB HIDDEN: rendering paused, keep it in the foreground' : '';
}, 250);

$('csv').addEventListener('click', () => {
  const blob = new Blob(['kind,player,t_ms,value_ms\n' + csv.join('\n') + '\n'], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `f0-latency-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('clear').addEventListener('click', () => {
  csv.length = 0;
  for (const p of players.values()) { p.rtt = []; p.lag = []; }
});
