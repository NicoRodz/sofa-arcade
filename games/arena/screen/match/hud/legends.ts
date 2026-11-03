// What the top feed says about each card, in the game's voice (4 to 7 words, Spanish, present tense so it reads right for "tomó" and for "usó"). Data only.
// Faithful to the mechanics after PR4 (Pegote, Cambiazo and Mareo are shot along the heading and hit ONE rival) and PR6 (the Cinta is a 5-tile line that cuts blasts; the Esponja soaks, then squeezes).
// `item` carries its article ("el Ventilador"), `legend` is what the card does; the player's name and the verb are added by top-feed.ts.
import type { SabotageKind } from '../../../sim';

export const LEGENDS: Record<SabotageKind, { item: string; legend: string }> = {
  turpentine: { item: 'el Aguarrás', legend: 'tu próxima piñata borra pintura rival' },
  roller: { item: 'el Rodillo', legend: 'pintas recto todo lo que pisas' },
  fan: { item: 'el Ventilador', legend: 'sopla las piñatas lejos de ti' },
  footprints: { item: 'las Huellas', legend: 'los rivales que caminan pintan por ti' },
  glue: { item: 'el Pegote', legend: 'disparas: se pega al primer rival golpeado' },
  tape: { item: 'la Cinta', legend: 'barrera de 5 casillas que corta explosiones' },
  ink: { item: 'la Tinta invisible', legend: 'tu pintura se oculta y luego se revela' },
  sponge: { item: 'la Esponja', legend: 'absorbes pintura rival y luego la exprimes' },
  swap: { item: 'el Cambiazo', legend: 'disparas: cambias lugar con el rival golpeado' },
  dizzy: { item: 'el Mareo', legend: 'disparas: el rival golpeado maneja al revés' },
};
