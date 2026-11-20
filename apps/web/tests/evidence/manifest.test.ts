import { describe, expect, it } from 'vitest';
import { keccak256, toBytes } from 'viem';
import { parseReleaseManifest, readerAbiHash, validateReleaseManifest } from '../../src/infrastructure/evidence/manifest';

const addresses = {
  core: '0x0000000000000000000000000000000000001001',
  token: '0x0000000000000000000000000000000000001002',
  helper: '0x0000000000000000000000000000000000001003',
  strategy: '0x0000000000000000000000000000000000001004',
} as const;
const hash = (value: string) => keccak256(toBytes(value));
const intent = { kind: 'join', account: '0x0000000000000000000000000000000000002001', chainId: 31337, core: addresses.core, potId: '1', token: addresses.token } as const;
const manifest = () => ({
  version: 1,
  kind: 'release',
  network: 'local',
  chainId: 31337,
  sourceCommit: 'a'.repeat(40),
  compiler: { version: '0.8.28', optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  abiHash: readerAbiHash,
  contracts: Object.fromEntries(Object.entries(addresses).map(([role, address]) => [role, { address, artifactSha256: 'b'.repeat(64), deployedRuntimeHash: hash(role) }])),
  immutableArgs: { supportedToken: addresses.token, attendanceVerifier: addresses.helper, payoutStrategy: addresses.strategy },
  deployment: { blockNumber: '10', blockHash: hash('deployment') },
  potId: '1',
  receipts: [{ hash: hash('receipt'), blockNumber: '11', blockHash: hash('receipt block'), potId: '1', intent }],
});

describe('release evidence manifest', () => {
  it('normalizes identities and retains exact intent-bound receipt references', () => {
    const parsed = validateReleaseManifest(manifest());
    expect(parsed.contracts.core.address).toBe(addresses.core);
    expect(parsed.receipts).toHaveLength(1);
    expect(parsed.receipts[0].intent).toEqual(intent);
    expect(parseReleaseManifest(JSON.stringify(manifest()))).toEqual(parsed);
  });

  it.each([
    { version: 2 }, { kind: 'demo' }, { network: 'fuji' }, { chainId: 43113 },
    { extra: 'untrusted' }, { potId: '01' },
  ])('rejects invalid or unexpected top-level values (%j)', patch => {
    expect(() => validateReleaseManifest({ ...manifest(), ...patch })).toThrow();
  });

  it('rejects a receipt whose core, chain, pot, deployment block or hash identity does not match', () => {
    const source = manifest();
    const wrongCore = { ...intent, core: '0x0000000000000000000000000000000000009999' };
    expect(() => validateReleaseManifest({ ...source, receipts: [{ ...source.receipts[0], intent: wrongCore }] })).toThrow();
    expect(() => validateReleaseManifest({ ...source, receipts: [{ ...source.receipts[0], blockNumber: '9' }] })).toThrow();
    expect(() => validateReleaseManifest({ ...source, receipts: [{ ...source.receipts[0], potId: '2' }] })).toThrow();
    expect(() => validateReleaseManifest({ ...source, receipts: Array.from({ length: 33 }, () => source.receipts[0]) })).toThrow();
  });

  it('rejects cross-pot conflicts, duplicate transaction hashes and malformed artifact hashes', () => {
    const source = manifest();
    expect(() => validateReleaseManifest({ ...source, receipts: [source.receipts[0], source.receipts[0]] })).toThrow();
    expect(() => validateReleaseManifest({ ...source, contracts: { ...source.contracts, token: { ...source.contracts.token, artifactSha256: '0x' + 'a'.repeat(64) } } })).toThrow();
    expect(() => validateReleaseManifest({ ...source, immutableArgs: { ...source.immutableArgs, supportedToken: addresses.helper } })).toThrow();
  });

  it('rejects manifests over the JSON parser size cap', () => {
    expect(() => parseReleaseManifest(' '.repeat(131_073))).toThrow('128 KiB');
  });
});
