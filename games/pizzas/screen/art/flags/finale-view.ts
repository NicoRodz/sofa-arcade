// Versus, the end of a round on screen: the winner's kitchen celebrates under a waving flag, the other slumps under one at half mast, confetti over the winner.
// Split from world.ts, moved verbatim (startFinale / updateFinale and their flags, dims and timer); World owns one and forwards roundEnd, update and destroy.
import type Phaser from 'phaser';
import type { Game } from '../../../sim/overcooked';
import { TILE } from '@pichi/screen-kit/art';
import type { Chef } from '@pichi/screen-kit/art/chef';
import type { Fx } from '@pichi/screen-kit/art/fx';
import { OX, OY } from '../env/grid';
import type { Hud, RoundView } from '../hud/hud';
import { FlagView } from './flag-view';

export class FinaleView {
  private flags: FlagView[] = [];
  private dims: Phaser.GameObjects.Graphics[] = [];
  private finale: { winner: number | null; ms: number; next: number } | null = null; // versus: the end-of-round celebration
  constructor(
    private scene: Phaser.Scene,
    private game: Game,
    private view: RoundView | undefined,
    private hud: Hud,
    private fx: Fx,
    private kitchenTiles: [number, number][][],
    private chefs: Map<number, Chef>,
  ) {}

  // Versus, the round just ended: the scoreboard reveals, the winner's kitchen celebrates under a waving flag and the other one slumps under a flag at half mast.
  start(winner: number | null) {
    this.hud.vs?.reveal(winner);
    this.finale = { winner, ms: 0, next: 0 };
    this.game.teams.forEach((t) => {
      const team = this.view?.teams?.[t.id];
      const tiles = this.kitchenTiles[t.id];
      if (!team || !tiles?.length) return;
      const mx = tiles.reduce((a, p) => a + p[0], 0) / tiles.length,
        my = tiles.reduce((a, p) => a + p[1], 0) / tiles.length;
      const [gx, gy] = tiles.reduce((a, p) => (Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(a[0] - mx, a[1] - my) ? p : a));
      const mood = winner === null ? 'idle' : t.id === winner ? 'wave' : 'droop';
      const f = new FlagView(
        this.scene,
        `flag_${t.id}`,
        team.color,
        team.icon,
        mood,
        OX + gx * TILE,
        OY + (gy + 0.4) * TILE,
        100 + OY + (gy + 1) * TILE,
        TILE * (mood === 'droop' ? 1.5 : 2.1),
      );
      f.raise();
      this.flags.push(f);
      if (winner !== null && t.id !== winner) {
        const dim = this.scene.add.graphics().setDepth(3).setAlpha(0);
        dim.fillStyle(0x1a0f0c, 0.34);
        for (const [x, y] of tiles) dim.fillRect(OX + (x - 0.5) * TILE, OY + (y - 0.5) * TILE, TILE, TILE);
        this.scene.tweens.add({ targets: dim, alpha: 1, duration: 900 });
        this.dims.push(dim);
      }
    });
  }
  update(dtMs: number) {
    const f = this.finale;
    if (!f) return;
    f.ms += dtMs;
    for (const fl of this.flags) fl.update(dtMs);
    if (f.ms < f.next) return;
    f.next = f.ms + 700;
    for (const [id, chef] of this.chefs) {
      const team = this.game.players.get(id)?.team;
      if (f.winner === null) continue;
      if (team === f.winner) chef.celebrate();
      else chef.fail();
    }
    if (f.winner !== null && f.ms < 2400) {
      const tiles = this.kitchenTiles[f.winner] ?? [];
      const at = tiles[Math.floor(Math.random() * tiles.length)];
      if (at) {
        this.fx.confettiBurst(OX + at[0] * TILE, OY + at[1] * TILE);
        this.fx.starBurst(OX + at[0] * TILE, OY + at[1] * TILE, 4);
      }
    }
  }

  destroy() {
    for (const f of this.flags) f.destroy();
    this.flags = [];
    this.dims = [];
  }
}
