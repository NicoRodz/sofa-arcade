// The opaque slots of the wire protocol (design pichiclub-refactor §2.1). The cable keeps the legacy field names (`map`, `puestos`, `sig.kind`, `result`):
// the platform only forwards them and each game types them with its own Slots and validates them with its own GameProtocol.
export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };

// result is unknown, not Json: a TS interface is not assignable to an indexed type.
export interface Slots {
  map: string;
  puesto: string;
  signal: string;
  result: unknown;
}
