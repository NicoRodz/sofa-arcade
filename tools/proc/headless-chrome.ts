import { type ChildProcess, spawn } from 'node:child_process';
import { killTree } from './kill-tree';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Headless Chrome (1920x1080) on a CDP port, with a watchdog that kills its tree and exits 2 when `watchdogMs` pass. Clear `dog` on the normal exit. */
export function launchHeadlessChrome(
  cdpPort: number,
  profile: string,
  watchdogMs: number,
): { chrome: ChildProcess; dog: ReturnType<typeof setTimeout> } {
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      '--window-size=1920,1080',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--ignore-gpu-blocklist',
      '--force-color-profile=srgb',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const dog = setTimeout(async () => {
    console.error('watchdog fired');
    await killTree(chrome);
    process.exit(2);
  }, watchdogMs);
  return { chrome, dog };
}
