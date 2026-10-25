// The Pizzas round while it runs: the scene's host (the tick loop), the pause bar, the contextual button labels, the buzz on the phones and the
// Cocina escuela glue. TRANSITIONAL (F4b): moved out of apps/screen/src/main.ts; F4c turns it into games/pizzas/screen/coop-view.
import type { BuzzKind } from '@pichi/core';
import { gameBus } from '@pichi/screen-kit/bus';
import { sendMsg } from '@pichi/screen-kit/net/socket';
import { app, dispatch, services, transition } from '@pichi/screen-kit/shell/app-state';
import { showScene } from '@pichi/screen-kit/shell/game-host';
import { openHowTo } from '@pichi/screen-kit/shell/round-flow';
import { $ } from '@pichi/screen-kit/ui/dom';
import { TICK_MS, resolvePause, tick, type Controls } from '@pichi/game-pizzas/sim';
import { staleControls } from '@pichi/game-pizzas/sim/feel/stale';
import { createHintSync } from '@pichi/game-pizzas/sim/hints';
import { nextLead, scoreHidden } from '@pichi/game-pizzas/sim/versus/report';
import { createSchoolHost } from '@pichi/game-pizzas/screen/school/host';
import { MainScene, type Host } from '@pichi/game-pizzas/screen/scene';
import { PIZZAS, isVersus, pz, puestoOf } from './state';

export const school = createSchoolHost({
  players: app.players,
  room: app.room,
  send: sendMsg,
  bus: gameBus,
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
    app.activeGame = PIZZAS;
    showScene(PIZZAS);
  },
  continueToRound: () => openHowTo('start'),
}); // Cocina escuela (shared/tutorial, screen/src/tutorial): the guided practice before the first match; what it needs from the shell is handed over here

// Contextual buttons: A and B keep their two buttons, only their names, glyphs and greying follow what the chef has in front ("Tomar masa", "Picar", "Al horno",
// "Entregar", grey when nothing can be done). The label is the STATE of the sim after the last tick, recomputed every frame and sent whole when it changes (at most one
// message per chef every HINT_MIN_MS), plus a refresh every HINT_REFRESH_MS: a late, lost or missed packet (a phone that reconnects) is replaced by the next, never an event the phone has to catch (hints.ts).
const hints = createHintSync(sendMsg);
const syncHints = (now = performance.now()) => hints.sync(app.phase === 'playing' && app.activeGame === PIZZAS ? pz.game : null, now);

// Versus: a team with nobody stops the clock; the host picks "Seguir sin ganador" or "Terminar" (resolvePause).
let pauseShown = false;
function syncPauseBar() {
  const on = app.phase === 'playing' && !!pz.game.paused;
  if (on === pauseShown) return;
  pauseShown = on;
  $('pausebar').classList.toggle('off', !on);
  if (on)
    $('pausetxt').textContent =
      `${pz.game.paused!.teams.map((t) => pz.roundView.teams?.[t]?.name ?? `Equipo ${t + 1}`).join(' y ')} se quedó sin jugadores`;
}

const host: Host = {
  players: () => new Map([...app.players].map(([id, p]) => [id, p.info])),
  puestos: () => puestoOf,
  step(delta) {
    syncPauseBar();
    if (app.phase !== 'playing' || app.activeGame !== PIZZAS || performance.now() < app.gateUntil) {
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
        if (r.cue && pz.lead.leader !== null) gameBus.emit('comeback', { team: pz.lead.leader });
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
  },
};

let main: MainScene | undefined;
export const scene = (): MainScene => (main ??= new MainScene(host));

export function initHost() {
  // R7: a short vibration on the phone of the chef the event belongs to (the phone falls back to a colour flash)
  const buzz = (player: number, kind: BuzzKind) => sendMsg({ t: 'buzz', playerId: player, kind });
  gameBus.on('itemPicked', (e) => buzz(e.player, 'pick'));
  for (const k of ['chopDone', 'foldDone'] as const) gameBus.on(k, (e) => buzz(e.player, 'chop')); // folding the calzone buzzes like a finished chop
  gameBus.on('washDone', (e) => buzz(e.player, 'chop'));
  gameBus.on('interactInvalid', (e) => buzz(e.player, 'bad'));
  gameBus.on('dishRejected', (e) => buzz(e.player, 'bad'));
  gameBus.on('dash', (e) => buzz(e.player, 'dash'));
  // the phones that must look up: the whole kitchen for an event, a mutation or a fire; the defending team when rubbish is on its way
  const alert = (mine: (team: number | undefined) => boolean) => pz.game.players.forEach((p) => mine(p.team) && buzz(p.id, 'alert'));
  for (const k of ['event:announce', 'mutate:warn'] as const) gameBus.on(k, () => alert(() => true));
  gameBus.on('fire:start', (e) => alert((t) => e.team === undefined || e.team === t));
  gameBus.on('sabotage:launch', (e) => alert((t) => t !== e.team));
  gameBus.on('chef:slip', (e) => buzz(e.chef, 'slip')); // sabotage: the phone of the chef that slipped vibrates and says "¡Resbalaste!"
  $('pcont').addEventListener('click', () => {
    if (pz.game.paused) resolvePause(pz.game, 'continue');
  });
  $('pend').addEventListener('click', () => {
    if (pz.game.paused) resolvePause(pz.game, 'end');
  });
}
