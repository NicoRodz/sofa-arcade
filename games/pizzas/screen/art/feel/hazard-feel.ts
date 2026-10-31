// The visual feedback of the hazards that is not tied to a station: the rat that dodges and pants (rat-dodge.ts) and the drift arrow of a chef on ice (ice-drift.ts).
// Self-managed like the mutation view: one scene update hook that goes away with the round's children (the round's teardown removes them all).
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import type { Fx } from '@pichi/screen-kit/art/fx';
import { IceDrift } from './ice-drift';
import { RatDodge } from './rat-dodge';

export function addHazardFeel(scene: Phaser.Scene, game: Game, fx: Fx, bus: Emitter<GameEvents>) {
  const rat = game.mid && game.hz ? new RatDodge(scene, game, fx, bus) : null;
  const ice = game.surf || game.mid ? new IceDrift(scene, game) : null;
  if (!rat && !ice) return;
  const tick = (_t: number, dtMs: number) => {
    rat?.update(dtMs);
    ice?.update(dtMs);
  };
  scene.events.on('update', tick);
  (rat ?? ice)!.g.once('destroy', () => scene.events.off('update', tick));
}
