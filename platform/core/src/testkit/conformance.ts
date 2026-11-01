// Conformance of a game to the platform's contract (frente G). A game that passes `checkGame` can be listed in apps/catalog without touching platform/:
// its three halves (manifest, wire protocol, phone) agree on one id, its modes and controls are legible, and its protocol slots are coherent.
// Pure: the controller is typed by the only thing read from it (its id), so this package never imports the controller kit.
import { gameProblems } from '../contract/catalog';
import type { GameManifest } from '../contract/game';
import type { GameProtocol } from '../contract/protocol';

export interface GameParts {
  manifest: GameManifest;
  protocol: GameProtocol;
  controller?: { readonly id: string };
}

const ID = /^[a-z][a-z0-9-]*$/;

/** Everything wrong with a game's contract; an empty list = it conforms. */
export function checkGame(p: GameParts): string[] {
  const { manifest: m, protocol, controller } = p;
  const out: string[] = [];
  if (!ID.test(m.id)) out.push(`manifest id "${m.id}" is not kebab-case`);
  if (protocol.game !== m.id) out.push(`protocol game "${protocol.game}" differs from manifest id "${m.id}"`);
  if (controller && controller.id !== m.id) out.push(`controller id "${controller.id}" differs from manifest id "${m.id}"`);
  if (!m.name.trim()) out.push('manifest name is empty');
  if (!m.blurb.trim()) out.push('manifest blurb is empty');
  if (!m.howTo.steps.length) out.push('howTo has no steps');
  if (m.minPlayers > m.maxPlayers) out.push(`minPlayers ${m.minPlayers} is over maxPlayers ${m.maxPlayers}`);
  out.push(...gameProblems(m)); // modes, controls, howTo legibility, players range
  if (protocol.defaultMap !== undefined && protocol.isMap && !protocol.isMap(protocol.defaultMap))
    out.push(`protocol defaultMap "${protocol.defaultMap}" is not accepted by its own isMap`);
  const kinds = protocol.signalKinds ?? [];
  if (kinds.some((k) => !k.trim())) out.push('protocol signalKinds has an empty kind');
  if (new Set(kinds).size !== kinds.length) out.push('protocol signalKinds has a duplicated kind');
  if (protocol.puestoCount !== undefined && (!Number.isInteger(protocol.puestoCount) || protocol.puestoCount < 0))
    out.push(`protocol puestoCount ${protocol.puestoCount} is not a count`);
  return out;
}
