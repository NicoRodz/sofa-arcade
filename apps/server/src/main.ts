import qrcode from 'qrcode-terminal';
import { lanIp } from '@pichi/server-kit';
import { startServer, type Mode } from './server.js';

const mode = (process.argv[2] ?? 'dev') as Mode;
const { port, close } = await startServer({ port: Number(process.env.PORT ?? 3000), mode });
const ip = lanIp();
const control = `http://${ip}:${port}/c`;

console.log(`\nMode: ${mode}`);
console.log(`Screen (open on the Mac): http://localhost:${port}/screen`);
console.log(`Controller (phones):      ${control}\n`);
qrcode.generate(control, { small: true });

const stop = () => close().finally(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
