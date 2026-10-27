// Every mechanic of a round on screen. The scene creates ONE of these when the round has `game.mech`: it starts the self-managed views (gate, reversible belts, thermal oven), and every frame calls the
// `draw(scene, game, t)` of the arts that repaint a layer (kneader, wood oven, oil / fire / water, sprinkler, bridge, raft, one-way, the mutation's ghosts). Goes away with the scene's children.
import type Phaser from 'phaser';
import type { Game } from '../../../sim/overcooked';
import type { Grid, Tile } from '../../../sim/maps';
import { MECH_IDS, type MechId } from '../../../sim/mech/ids';
import { GateView } from './gate/draw';
import { BeltReverseView } from './beltReverse/draw';
import { OvenHeatView } from './ovenHeat/draw';
import { MECH_ART } from './registry';
import type { Draw } from './layer';

const SELF_MANAGED = new Set<MechId>(['gate', 'beltReverse', 'ovenHeat']); // views of their own

/** The grid the background paints: a raft or a bridge tile is water there (the art draws the planks and the logs over it, and a broken or departed one shows water). */
export const paintGrid = (g: Grid): Grid =>
  g.map((row) => row.map((t): Tile => (t.kind === 'floor' && (t.mech === '=' || t.mech === 'b') ? { kind: 'water' } : t)));

export class MechViews {
  constructor(scene: Phaser.Scene, game: Game) {
    const on = game.flags!.mech;
    if (on.gate) new GateView(scene, game);
    if (on.beltReverse) new BeltReverseView(scene, game);
    if (on.ovenHeat) new OvenHeatView(scene, game);
    const draws = MECH_IDS.filter((id) => on[id] && !SELF_MANAGED.has(id)).map((id) => MECH_ART[id].draw as unknown as Draw);
    let t = 0;
    const tick = (_time: number, dtMs: number) => {
      t += dtMs;
      for (const d of draws) d(scene, game, t);
    };
    scene.events.on('update', tick);
    scene.add.graphics().once('destroy', () => scene.events.off('update', tick)); // the anchor: the round's teardown destroys every child, and with it the listener
  }
}
