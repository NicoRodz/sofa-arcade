// Types shared by the layout harness and its scenario files (kept apart so they do not import each other).
export interface Scenario {
  name: string;
  fresh?: boolean;
  msgs: object[];
  after?: string;
  storedName?: boolean;
}

type Msg = unknown;
export interface Builders {
  player: (name: string) => Msg;
  config: () => Msg;
  vsConfig: () => Msg;
  you: (team: number) => Msg;
  captain: () => Msg;
  phase: (p: string) => Msg;
  WIDE: string;
}
