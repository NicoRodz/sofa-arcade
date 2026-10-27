// Avatar painting contract (creador de personajes, F0). Pure: no DOM, no Phaser, no Node.
//
// DATOS CONFIRMADOS EN F0 (por lectura del código, 27-oct-2026)
// - Huesos/anclas del rig (platform/screen/src/art/chef/rig.ts; origen = pies, y hacia abajo, px de diseño):
//   root > [shadow(0,0), ring(0,0), rig > [feet L(-10,-3) R(10,-3), torsoB, torso(0,0), arms L(-25,-41) R(25,-41),
//   item(20,-44), head > [headB, headF, fa, eyes (+-7, HEAD_Y-2), mouth (0, HEAD_Y+15), fb, drop (17, HEAD_Y-6), hat,
//   prop (stalk), blades (0, hatTop-38)]], spinStars, tag(0,20)]. HEAD_Y = -68. Cada parte es una textura de caja
//   120x170 con ancla (60,150); el stalk del Ayudante usa 120x250 con ancla (60,230).
// - Vistas: tres caras 'down' | 'side' | 'up'. 'side' es UN solo perfil espejado con flip=+-1 (no hay vista lateral
//   propia: es la vista de frente con la mirada desplazada 4 px y el objeto en mano a x=21); 'up' usa
//   torsoB y headB (espalda) y oculta cara, ojos y boca. No hay vista 3/4.
// - Colores de slot (platform/screen/src/art/tokens.ts, CHEFS): Rojo #E63B2E/#B5281F, Azul #2F7DE1/#1F58A8,
//   Verde #3FA34D/#2A7A36, Amarillo #FFC21A/#D49A00, Morado #8E5CD9/#6A3CB0, Naranja #FF7A1A/#D45A00,
//   Rosa #FF5FA2/#D43B80, Turquesa #1FB5A8/#128A80 (color/dark). Piel SKINS: #F6D3B3 #E8B48A #C68A5E #8D5A3B
//   (slot%4). Pelo HAIRS: #4A2C1E #2B1B17 #7A4A2A #1F1512. Tinta C.ink #2B1B17.
// - Dependencia de Phaser.Graphics: NINGUNA. chefdraw dibuja sobre CanvasRenderingContext2D (gradientes, clip,
//   arcTo, quadratic/bezier) y el rig usa Phaser.Image con esas texturas (makeTex/domCanvas en art/gfx.ts). Por eso
//   Painter replica el subconjunto Canvas 2D que usa chefdraw; el adaptador Canvas2D es un passthrough (mismos
//   pixeles) y el de Phaser.Graphics aproxima (gradiente = color medio, curvas aplanadas, sin clip).
// - Altura del chef: la caja de diseno mide 170 (sombrero hasta ~y=-120 sin gorro alto; Ayudante hasta -230). En
//   pantalla: px = diseno * U * CHEF_SCALE, con U = TILE/120 = 108/120 = 0.9 y CHEF_SCALE = 1.05, es decir
//   0.945 px por unidad: cabeza (-68, radio 22) a ~64 px de los pies, caja completa ~160 px de 1080.
// - Snapshot por tick: el estado entra a Chef.update(dtMs, ChefState) cada frame (ver ChefState en rig.ts).

/** Opaque gradient handle: a CanvasGradient in the Canvas adapter, a stop list in the Phaser one. */
export interface PaintGradient {
  addColorStop(offset: number, color: string): void;
}
export type PaintStyle = string | PaintGradient;

/** The Canvas 2D subset used by the avatar parts. Coordinates are design units, y grows downwards. */
export interface Painter {
  fillStyle: PaintStyle;
  strokeStyle: PaintStyle;
  lineWidth: number;
  globalAlpha: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'bevel' | 'round' | 'miter';
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(rad: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): PaintGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): PaintGradient;
}
