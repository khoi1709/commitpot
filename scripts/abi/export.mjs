import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
const artifact = JSON.parse(await readFile(new URL('packages/contracts/out/CommitPot.sol/CommitPot.json', root), 'utf8'));
if (!Array.isArray(artifact.abi) || !artifact.bytecode?.object) throw new Error('Expected a compiled CommitPot artifact');
const output = new URL('apps/web/src/generated/commitPotAbi.ts', root);
await mkdir(new URL('./', output), { recursive: true });
await writeFile(output, '// Generated from the compiled Solidity artifact; run node scripts/abi/export.mjs.\nexport const commitPotAbi = ' + JSON.stringify(artifact.abi, null, 2) + ' as const;\n');
console.log('Exported verified build ABI to ' + fileURLToPath(output));
