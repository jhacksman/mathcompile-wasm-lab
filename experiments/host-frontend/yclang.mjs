import { prefetch, runTool } from '../../web/lib/clang-bridge.mjs';
const [tool, ...args] = process.argv.slice(2);
await prefetch();
const r = await runTool(tool, args);
process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.code);
