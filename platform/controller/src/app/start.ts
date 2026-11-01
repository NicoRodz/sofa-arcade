// startController: builds the phone from the games it is given. The platform owns the socket, the pad, the lobby and the Captain's remote; each game adds its own part
// (contract.ts). apps/controller/src/main.ts is the only caller.
import { DEFAULT_ROOM, PING_MS, type ClientMsg } from '@pichi/core';
import { createCreator } from '../creator/creator';
import type { ControllerOptions, ControllerSchool } from '../contract';
import { createCaptain } from './captain';
import { createClock, createConnection } from './connect';
import { createControls } from './controls';
import { createDispatch } from './dispatch';
import { createHowTo } from './howto';
import { createPhaseUi } from './phase';
import { startPad } from './pad';
import { NO_HINT, send, setView, storage, type Session } from './store';
import { createTeams } from './teams';

export function startController(o: ControllerOptions): void {
  const { root, games, catalog } = o;
  const token = storage.get('pg.token') ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  storage.set('pg.token', token);
  const s: Session = {
    root,
    $: <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T,
    games,
    catalog,
    host: undefined as unknown as Session['host'], // set right below: it closes over `s`
    // headless drivers (tools/school-shots.ts) push the stick and the buttons through window.__pad; the game itself never reads it
    pad: { x: 0, y: 0, btn: 0, presses: [0, 0], seq: 0, sig: { kind: 'go', seq: 0 }, go: false },
    ws: null,
    joined: false,
    started: false,
    halted: false,
    phase: 'menu',
    game: null,
    myId: 0,
    myName: '',
    captainId: null,
    room: new URLSearchParams(location.search).get('room') || DEFAULT_ROOM,
    token,
    name: storage.get('pg.name') ?? '',
    label: '',
    signalsOn: false,
    teams: null,
    teamsLocked: false,
    myTeam: null,
    controls: null,
    hint: NO_HINT,
    seenGame: null,
    shown: null,
  };
  (window as unknown as { __pad: Session['pad'] }).__pad = s.pad;
  const { $ } = s;
  const tx = (m: ClientMsg) => send(s, m);
  const schools: { id: string; ui: ControllerSchool }[] = [];
  const ctl = createControls(s);
  const howto = createHowTo(s);
  const teams = createTeams(s);
  const creator = createCreator({ send: tx }); // character creator: begin() on the name form, joinExtra() in the join, onMessage() for the relay
  for (const g of games) {
    const ui = g.school?.({ token, send: tx, isCaptain: () => s.joined && s.captainId !== null && s.captainId === s.myId });
    if (ui) schools.push({ id: g.id, ui });
  }
  const cap = createCaptain(
    s,
    schools.map((x) => x.ui),
  );
  const phaseUi = createPhaseUi(s, { ctl, howto, cap, schools });
  s.host = {
    send: tx,
    slot: $('pad'),
    buzz: phaseUi.buzz,
    myId: () => s.myId || undefined,
    myTeam: () => s.myTeam,
    phase: () => s.phase,
  };
  for (const g of games) g.init?.(s.host);
  const clock = createClock(s);
  const dispatch = createDispatch(s, { ctl, howto, teams, cap, phaseUi, schools, creator, pong: clock.pong });
  const connect = createConnection(s, { dispatch, clock, cap, joinExtra: () => creator.joinExtra() });

  function start() {
    if (s.started) return;
    s.started = true;
    storage.set('pg.room', s.room);
    setView(s, 'menu');
    startPad(s);
    setInterval(clock.ping, PING_MS);
    setInterval(() => {
      const rtt = clock.rtt();
      if (s.joined && rtt !== undefined) $('hud').textContent = `${s.label} | ${rtt.toFixed(0)} ms`;
    }, 1000);
    // A locked phone can leave a half-dead socket that still reads OPEN: drop it if the server went quiet.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (s.ws && s.ws.readyState === WebSocket.OPEN && clock.silent()) s.ws.close();
      connect();
    });
    window.addEventListener('pageshow', () => connect());
    connect();
  }

  $('name').setAttribute('value', s.name);
  ($('join') as HTMLFormElement).addEventListener('submit', (e) => {
    e.preventDefault();
    s.name = ($('name') as HTMLInputElement).value.trim() || 'Player';
    storage.set('pg.name', s.name);
    creator.begin();
    start();
  });
  if (s.name && storage.get('pg.room') === s.room) start(); // reopened page: rejoin with the stored token
}
