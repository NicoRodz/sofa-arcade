import { type ChildProcess, execSync } from 'node:child_process';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chrome spawns its helpers as their own groups, so kill(-pid) misses them: walk the PID tree instead.
function descendants(pid: number): number[] {
  const rows = execSync('ps -A -o pid=,ppid=')
    .toString()
    .trim()
    .split('\n')
    .map((l) => l.trim().split(/\s+/).map(Number));
  const out: number[] = [];
  const walk = (p: number) => {
    for (const [c, pp] of rows)
      if (pp === p && c !== undefined) {
        out.push(c);
        walk(c);
      }
  };
  walk(pid);
  return out;
}

// SIGTERM the whole tree, wait graceMs, then SIGKILL whatever is still alive
export async function killTree(proc: ChildProcess, graceMs = 600) {
  if (!proc.pid) return;
  const pids = [proc.pid, ...descendants(proc.pid)];
  for (const p of pids) {
    try {
      process.kill(p, 'SIGTERM');
    } catch {
      /* gone */
    }
  }
  await sleep(graceMs);
  for (const p of pids) {
    try {
      process.kill(p, 0);
      process.kill(p, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
}
