// The puesto suggestions of a versus round: chef i of a team gets puesto i (the same table in both kitchens). A chef who plays alone
// in its kitchen (2 contra 1) gets none: the table for one chef is "masa + horno", and it has to do everything anyway.
import { assignPuestos, type Features, type PuestoMsgPz } from '../phone/puestos';

export function dealVersusPuestos(teams: readonly { playerIds: readonly number[] }[], f: Features): PuestoMsgPz {
  const assign = teams.flatMap((t) => (t.playerIds.length < 2 ? [] : assignPuestos(t.playerIds, f).assign));
  return { cheese: f.cheese, sink: f.sink, assign };
}
