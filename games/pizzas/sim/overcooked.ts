// Compatibility path: the screen, the golden bots and tools/ still import this file by name. The rules live in round/ and versus/match.ts;
// the public API is index.ts. Delete this file once those importers point at the index.
export * from './index';
