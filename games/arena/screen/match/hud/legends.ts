// What the top feed says about each card, in the game's voice (4 to 7 words, Spanish, present tense so it reads right for "tomó" and for "usó"). Data only.
// `item` carries its article ("el Ventilador"), `legend` is what the card does; the player's name and the verb are added by top-feed.ts.
import type { SabotageKind } from '../../../sim';

export const LEGENDS: Record<SabotageKind, { item: string; legend: string }> = {
  turpentine: { item: 'el Aguarrás', legend: 'tu próxima piñata borra pintura rival' },
  roller: { item: 'el Rodillo', legend: 'pintas recto todo lo que pisas' },
  fan: { item: 'el Ventilador', legend: 'sopla las piñatas lejos de ti' },
  footprints: { item: 'las Huellas', legend: 'los rivales que caminan pintan por ti' },
  glue: { item: 'el Pegote', legend: 'tu piñata se pega al rival cercano' },
  tape: { item: 'la Cinta', legend: 'blinda tu pintura en un cuadro' },
  ink: { item: 'la Tinta invisible', legend: 'oculta tu pintura y la revela después' },
  sponge: { item: 'la Esponja', legend: 'absorbe pintura rival, luego la exprimes' },
  swap: { item: 'el Cambiazo', legend: 'cambias de lugar con el rival cercano' },
  dizzy: { item: 'el Mareo', legend: 'los rivales cercanos manejan al revés' },
};
