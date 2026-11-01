// The run's shared state: the capture label and the PASS / FAIL counter.
export const LABEL = process.env.LABEL ?? 'run';
let failures = 0;
export const check = (ok: boolean, what: string, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
export const failed = () => failures;
