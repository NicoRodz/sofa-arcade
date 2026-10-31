// The Pizzas round while it runs: the scene's host (the tick loop), the pause bar, the contextual button labels, the buzz on the phones and the
// Cocina escuela glue.
import type { BuzzKind } from '@pichi/core';
import { pizzasBus } from '../bus';
import { sendMsg } from '@pichi/screen-kit/net/socket';
import { app, dispatch, services, transition } from '@pichi/screen-kit/shell/app-state';
import { showScene } from '@pichi/screen-kit/shell/game-host';
import { openHowTo } from '@pichi/screen-kit/shell/round-flow';
import { $ } from '@pichi/screen-kit/ui/dom';
import { TICK_MS, resolvePause, tick, type Controls } from '../../sim';
import { staleControls } from '../../sim/feel/stale';
import { createHintSync } from '../../sim/hints';
import { createMechPhone } from '../../sim/mech/phone';
import { nextLead, scoreHidden } from '../../sim/versus/report';
import { createSchoolHost } from '../school/host';
import { MainScene, type Host } from '../scene';
import { resetFocus } from './key-nav';
import { PIZZAS, isVersus, pz, puestoOf } from '../state';

export const school = createSchoolHost({
  players: app.players,
  room: app.room,
  send: sendMsg,
  bus: pizzasBus,
  scene: () => scene(),
  sfx: (id) => services.ui(id),
  phase: () => app.phase,
  dispatch: (ev) => dispatch(ev),
  transition,
  busy: () => app.starting || !!app.howTo,
  pizzas: () => app.config.game === PIZZAS,
  versus: isVersus,
  prepare: () => {
    puestoOf.clear();
    pz.puestoMsg = undefined;
    showScene(PIZZAS);
  },
  continueToRound: () => openHowTo('start'),
}); // Cocina escuela (shared/tutorial, screen/src/tutorial): the guided practice before the first match; what it needs from the shell is handed over here

// Contextual buttons: A and B keep their two buttons, only their names, glyphs and greying follow what the chef has in front ("Tomar masa", "Picar", "Al horno",
// "Entregar", grey when nothing can be done). The label is the STATE of the sim after the last tick, recomputed every frame and sent whole when it changes (at most one
// message per chef every HINT_MIN_MS), plus a refresh every HINT_REFRESH_MS: a late, lost or missed packet (a phone that reconnects) is replaced by the next, never an event the phone has to catch (hints.ts).
const hints = createHintSync(sendMsg);
const mechPhone = createMechPhone();
const syncHints = (now = performance.now()) => {
  const live = app.phase === 'playing' ? pz.game : null; // frame() only runs while Pizzas is the active game
  hints.sync(live, now);
  for (const id of mechPhone.sync(live)) sendMsg({ t: 'buzz', playerId: id, kind: 'alert' }); // a map mechanic needs this chef (the porter's plate, a door about to shut, the belt that turns, a cold oven)
};

// Versus: a team with nobody stops the clock; the host picks "Seguir sin ganador" or "Terminar" (resolvePause).
let pauseShown = false;
function syncPauseBar() {
  const on = app.phase === 'playing' && !!pz.game.paused;
  if (on === pauseShown) return;
  pauseShown = on;
  $('pausebar').classList.toggle('off', !on);
  if (on) resetFocus('pause');
  if (on)
    $('pausetxt').textContent =
      `${pz.game.paused!.teams.map((t) => pz.roundView.teams?.[t]?.name ?? `Equipo ${t + 1}`).join(' y ')} se quedó sin jugadores`;
}

/** The shell calls it every Phaser frame while Pizzas is the active game (ScreenGame.frame): the round's tick loop, the pause bar, the phones' labels, the school. */
export function frame(delta: number) {
  syncPauseBar();
  if (app.phase !== 'playing' || performance.now() < app.gateUntil) {
    pz.acc = 0;
    syncHints();
    school.step(delta);
    return;
  }
  pz.acc += Math.min(delta, 100);
  while (pz.acc >= TICK_MS) {
    pz.acc -= TICK_MS;
    const controls = new Map<number, Controls>();
    for (const p of app.players.values()) {
      const ctl = { ...p.ctl, a: p.pendA, bTaps: p.pendB };
      controls.set(p.info.id, p.ctlAt === undefined ? ctl : staleControls(ctl, performance.now() - p.ctlAt));
      p.pendA = 0;
      p.pendB = 0;
    }
    tick(pz.game, controls);
    if (pz.game.versus && !pz.game.over) {
      // the lead changed hands: a cue, unless the scoreboard is hidden (the sound must not give the lead away)
      const r = nextLead(
        pz.lead,
        pz.game.teams.map((t) => t.score),
        scoreHidden(pz.roundView.hiddenScore, pz.game.countdown <= 0, pz.game.params.roundMs - pz.game.time),
      );
      pz.lead = r.state;
      if (r.cue && pz.lead.leader !== null) pizzasBus.emit('comeback', { team: pz.lead.leader });
    }
    if (pz.game.over) {
      pz.overAt ??= performance.now();
      break;
    }
  }
  syncHints(); // the labels of the state this frame ends in
  // "¡TIEMPO!" stays on screen for a beat before the results
  if (pz.game.over && pz.overAt !== null && performance.now() - pz.overAt > 1100) {
    pz.overAt = null;
    dispatch('timeout');
  }
}

const host: Host = {
  players: () => new Map([...app.players].map(([id, p]) => [id, p.info])),
  puestos: () => puestoOf,
};

let main: MainScene | undefined;
export const scene = (): MainScene => (main ??= new MainScene(host));

export function initHost() {
  // R7: a short vibration on the phone of the chef the event belongs to (the phone falls back to a colour flash)
  const buzz = (player: number, kind: BuzzKind) => sendMsg({ t: 'buzz', playerId: player, kind });
  pizzasBus.on('itemPicked', (e) => buzz(e.player, 'pick'));
  for (const k of ['chopDone', 'foldDone'] as const) pizzasBus.on(k, (e) => buzz(e.player, 'chop')); // folding the calzone buzzes like a finished chop
  pizzasBus.on('washDone', (e) => buzz(e.player, 'chop'));
  pizzasBus.on('interactInvalid', (e) => buzz(e.player, 'bad'));
  pizzasBus.on('dishRejected', (e) => buzz(e.player, 'bad'));
  pizzasBus.on('dash', (e) => buzz(e.player, 'dash'));
  // the phones that must look up: the whole kitchen for an event, a mutation or a fire; the defending team when rubbish is on its way
  const alert = (mine: (team: number | undefined) => boolean) => pz.game.players.forEach((p) => mine(p.team) && buzz(p.id, 'alert'));
  const teamPhones = (team: number | undefined, kind: BuzzKind) =>
    pz.game.players.forEach((p) => (team === undefined || team === p.team) && buzz(p.id, kind)); // the whole team: a big fire needs two
  for (const k of ['event:announce', 'mutate:warn'] as const) pizzasBus.on(k, () => alert(() => true));
  pizzasBus.on('fire:start', (e) => (e.big ? teamPhones(e.team, 'big') : alert((t) => e.team === undefined || e.team === t)));
  // EVENTS_V2: the phones take the colour of the event when it starts (every chef) and a win or a fail note when it closes; pizzasBus only carries them in a round with `eventsV2`
  const EV2_BUZZ: Partial<Record<string, BuzzKind>> = { rush: 'evrush', birthday: 'evbday', blackout: 'evdark', spill: 'evspill' };
  pizzasBus.on('event:start', (e) => EV2_BUZZ[e.kind] && pz.game.ev2 && teamPhones(undefined, EV2_BUZZ[e.kind]!));
  pizzasBus.on('ev2:close', (e) => teamPhones(undefined, e.ok ? 'evwin' : 'evfail'));
  pizzasBus.on('rat:dodge', (e) => buzz(e.player, 'dodge')); // "¡Te esquivó!" on the phone of the chef that missed
  const iceSeen = new Set<number>();
  pizzasBus.on('surface:slide', (e) => {
    if (!iceSeen.has(e.player)) buzz(e.player, 'ice'); // the first ice of the match: "Hielo: frena antes"
    iceSeen.add(e.player);
  });
  // map mechanics: the mate who is called, and the chefs near a flame on the oil or a bridge that gave way
  pizzasBus.on('mech:need', (e) => buzz(e.player, 'alert'));
  const near = (tile: number) =>
    pz.game.players.forEach(
      (p) => !p.ghost && Math.hypot(p.x - ((tile % 16) + 0.5), p.y - (Math.floor(tile / 16) + 0.5)) <= 3 && buzz(p.id, 'alert'),
    );
  for (const k of ['mech:fire', 'mech:bridgeBreak'] as const) pizzasBus.on(k, (e) => near(e.tile));
  pizzasBus.on('sabotage:launch', (e) => alert((t) => t !== e.team));
  pizzasBus.on('chef:slip', (e) => buzz(e.chef, 'slip')); // sabotage: the phone of the chef that slipped vibrates and says "¡Resbalaste!"
  $('pcont').addEventListener('click', () => {
    if (pz.game.paused) resolvePause(pz.game, 'continue');
  });
  $('pend').addEventListener('click', () => {
    if (pz.game.paused) resolvePause(pz.game, 'end');
  });
}
