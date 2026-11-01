// A free TCP port from the OS. The browser test files each open their own Vite server and Chrome CDP port: a fixed pair made them collide when vitest runs
// them in parallel (`Port 3600 is already in use`, or a second Chrome attaching to the first one's CDP) and kept two worktrees from running the suite at once.
import { createServer, type AddressInfo } from 'node:net';

const handedOut = new Set<number>(); // two asks in a row must not get the same port (the first probe socket is already closed when the second one binds)

const freePort = async (): Promise<number> => {
  const port = await new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
  if (handedOut.has(port)) return freePort();
  handedOut.add(port);
  return port;
};

// PG_PORT / PG_CDP_PORT pin the port (3000 / 3100 belong to the dev servers of the user); otherwise the OS picks one.
export const portFor = async (pinned: string | undefined) => (pinned ? Number(pinned) : freePort());
