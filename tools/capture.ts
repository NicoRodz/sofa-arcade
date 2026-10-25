// Entry point: npx tsx tools/capture.ts <mode> [outDir]. The code lives in tools/capture/.
import { main } from './capture/cli';

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
