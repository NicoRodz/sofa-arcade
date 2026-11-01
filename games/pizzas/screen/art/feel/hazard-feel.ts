// The visual feedback of the hazards that is not tied to a station: the rat that dodges and pants (rat-dodge.ts) and the drift arrow of a chef on ice (ice-drift.ts).
// Self-managed like the mutation view: one scene update hook that goes away with the round's children (the round's teardown removes them all).
import type Phaser from 'phaser';
import type { GameEvents, Emitter } from '../../../sim/round/events';
import type { Game } from '../../../sim/overcooked';
import type { Fx } from '@pichi/screen-kit/art/fx';
import { IceDrift } from './ice-drift';
import { RatDodge } from './rat-dodge';
import { HazardV3View } from './hazard-v3-view';

export function addHazardFeel(scene: Phaser.Scene, game: Game, fx: Fx, bus: Emitter<GameEvents>) {
  const rat = game.mid && game.hz ? new RatDodge(scene, game, fx, bus) : null;
  const ice = game.surf || game.mid ? new IceDrift(scene, game) : null;
  const v3 = game.hz3 ? new HazardV3View(scene, game, fx, bus) : null;
  if (!rat && !ice && !v3) return;
  const tick = (_t: number, dtMs: number) => {
    rat?.update(dtMs);
    ice?.update(dtMs);
    v3?.update(dtMs);
  };
  scene.events.on('update', tick);
  (rat ?? ice ?? v3)!.g.once('destroy', () => scene.events.off('update', tick));
}
