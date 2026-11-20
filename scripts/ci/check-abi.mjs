import { readFile } from 'node:fs/promises';

const artifactPath = new URL('../../packages/contracts/out/CommitPot.sol/CommitPot.json', import.meta.url);
const generatedPath = new URL('../../apps/web/src/generated/commitPotAbi.ts', import.meta.url);
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
if (!Array.isArray(artifact.abi) || typeof artifact.bytecode?.object !== 'string' || artifact.bytecode.object.length === 0) {
  throw new Error('CommitPot compiler artifact is missing ABI or bytecode');
}

const generated = await readFile(generatedPath, 'utf8');
const match = generated.match(/^export const commitPotAbi = ([\s\S]*?) as const;\s*$/m);
if (!match) throw new Error('Generated TypeScript ABI export has an unexpected format');
const generatedAbi = JSON.parse(match[1]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

if (JSON.stringify(canonical(artifact.abi)) !== JSON.stringify(canonical(generatedAbi))) {
  throw new Error('CommitPot compiler-artifact ABI differs from apps/web/src/generated/commitPotAbi.ts; regenerate only after review, then rerun');
}

console.log('CommitPot compiler-artifact ABI matches the tracked TypeScript ABI. Run a fresh forced Forge build before this read-only comparison; it does not establish deployed-runtime, source, or Fuji parity.');
