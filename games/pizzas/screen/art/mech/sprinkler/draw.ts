// Art of 'sprinkler' (drawn by code): a ceiling-style head on its tile (a grey cap and a nozzle), a faint ring showing its 3x3 reach, and while it sprays: droplets falling over the 3x3 and a blue wash. Implemented by T1d.
import type { MechArt } from '../../../../sim/mech/types';
import { heads } from '../../../../sim/mech/sprinkler/module';
import { TILE } from '@pichi/screen-kit/art/tokens';
import { OX, OY } from '../../env/grid';
import { layer, type Draw } from '../layer';

export const drawSprinklers: Draw = (scene, g, t) => {
  const gfx = layer(scene, 'sprinkler', 1.58);
  gfx.clear();
  if (!g.mech?.ext?.sprinkler) return;
  for (const h of heads(g)) {
    const x = OX + (h.at % 16) * TILE,
      y = OY + Math.floor(h.at / 16) * TILE,
      cx = x + TILE / 2,
      cy = y + TILE / 2;
    gfx.lineStyle(2, 0x4fb6e0, h.on ? 0.0 : 0.28).strokeRoundedRect(x - TILE, y - TILE, TILE * 3, TILE * 3, TILE * 0.2); // the reach
    if (h.on) {
      gfx.fillStyle(0x4fb6e0, 0.2).fillRoundedRect(x - TILE, y - TILE, TILE * 3, TILE * 3, TILE * 0.2);
      for (let k = 0; k < 22; k++) {
        const a = (k * 2.399 + t / 900) % (Math.PI * 2),
          r = TILE * (0.35 + 1.15 * (((k * 0.37 + t / 380) % 1) as number));
        gfx.fillStyle(0xcff1ff, 0.85).fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, TILE * 0.035);
      }
    }
    gfx.fillStyle(0x7d8b95, 1).fillCircle(cx, cy, TILE * 0.17);
    gfx.fillStyle(0xb8c4cc, 1).fillCircle(cx, cy - TILE * 0.02, TILE * 0.12);
    gfx.fillStyle(0x2b1b17, 1).fillCircle(cx, cy, TILE * 0.04);
  }
};
export const sprinklerArt: MechArt = { draw: drawSprinklers as unknown as () => void };
