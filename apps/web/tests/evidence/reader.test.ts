import { describe, expect, it, vi } from 'vitest';
import { loadProof, type PublicProofReader } from '../../src/infrastructure/evidence/reader';
import { readerAbiHash } from '../../src/infrastructure/evidence/manifest';
import { keccak256, toBytes, type Hex } from 'viem';

const contractAddresses = {
  core: '0x0000000000000000000000000000000000001001',
  token: '0x0000000000000000000000000000000000001002',
  helper: '0x0000000000000000000000000000000000001003',
  strategy: '0x0000000000000000000000000000000000001004',
} as const;
const runtimeCode = '0x6000' as Hex;
const runtimeHash = keccak256(runtimeCode);
const blockHash = keccak256(toBytes('block'));
const manifest = () => JSON.stringify({
  version: 1, kind: 'release', network: 'local', chainId: 31337, sourceCommit: 'a'.repeat(40),
  compiler: { version: '0.8.28', optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' }, abiHash: readerAbiHash,
  contracts: Object.fromEntries(Object.entries(contractAddresses).map(([role, address]) => [role, { address, artifactSha256: 'b'.repeat(64), deployedRuntimeHash: runtimeHash }])),
  immutableArgs: { supportedToken: contractAddresses.token, attendanceVerifier: contractAddresses.helper, payoutStrategy: contractAddresses.strategy },
  deployment: { blockNumber: '10', blockHash }, potId: '1', receipts: [],
});

function reader(): PublicProofReader {
  const publicClient = {
    getChainId: vi.fn(async () => 31337),
    getBlock: vi.fn(async ({ blockNumber }: { blockNumber?: bigint } = {}) => ({ number: blockNumber ?? 20n, hash: blockHash, timestamp: 1_700_000_000n })),
    getCode: vi.fn(async () => runtimeCode),
    getTransactionReceipt: vi.fn(async () => { throw new Error('no configured receipt'); }),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => functionName === 'supportedToken' ? contractAddresses.token : functionName === 'attendanceVerifier' ? contractAddresses.helper : contractAddresses.strategy),
  } as unknown as PublicProofReader['publicClient'];
  const repository = {
    getChainContext: vi.fn(async () => ({ mode: 'local', chainId: 31337, coreAddress: contractAddresses.core, token: contractAddresses.token })),
    getTokenInfo: vi.fn(async () => ({ address: contractAddresses.token, symbol: 'Test USDC', decimals: 6 })),
    getChainTimestamp: vi.fn(async () => 1_700_000_000),
    getPot: vi.fn(async () => ({ id: 1n, config: { token: contractAddresses.token, verifier: contractAddresses.helper, stakeAmount: 10_000_000n, registrationClose: 1_700_000_100, checkInOpen: 1_700_000_200, checkInClose: 1_700_000_300 }, status: 'OPEN' as const, participantCount: 0n, checkedInCount: 0n, payoutPerWinner: 0n, dustAmount: 0n })),
    waitForTransaction: vi.fn(),
  } as unknown as PublicProofReader['repository'];
  return { publicClient, repository };
}

describe('public evidence reader', () => {
  it('fails closed for missing, malformed, and noncanonical pot IDs without creating a reader', async () => {
    const createReader = vi.fn(async () => reader());
    await expect(loadProof({ createReader })).resolves.toMatchObject({ status: 'unconfigured', reason: 'missing-manifest' });
    await expect(loadProof({ manifestJson: '{', createReader })).resolves.toMatchObject({ status: 'invalid-manifest', reason: 'invalid-manifest' });
    await expect(loadProof({ manifestJson: manifest(), potId: '01', createReader })).resolves.toMatchObject({ status: 'invalid-pot', reason: 'invalid-pot' });
    expect(createReader).not.toHaveBeenCalled();
  });

  it('separates RPC unavailability and chain identity mismatch from green evidence', async () => {
    const rpcFailure = reader();
    vi.mocked(rpcFailure.publicClient.getChainId).mockRejectedValue(new Error('offline'));
    await expect(loadProof({ manifestJson: manifest(), createReader: async () => rpcFailure })).resolves.toMatchObject({ status: 'unavailable', reason: 'reader-unavailable' });

    const wrongChain = reader();
    vi.mocked(wrongChain.publicClient.getChainId).mockResolvedValue(43113);
    await expect(loadProof({ manifestJson: manifest(), createReader: async () => wrongChain })).resolves.toMatchObject({ status: 'mismatch', reason: 'identity-mismatch' });
  });

  it('rejects mismatched full deployed runtime and immutable getter evidence', async () => {
    const changedRuntime = reader();
    vi.mocked(changedRuntime.publicClient.getCode).mockResolvedValue('0x1234');
    await expect(loadProof({ manifestJson: manifest(), createReader: async () => changedRuntime })).resolves.toMatchObject({ status: 'mismatch', reason: 'identity-mismatch' });

    const changedImmutable = reader();
    vi.mocked(changedImmutable.publicClient.readContract).mockImplementation(async ({ functionName }: { functionName: string }) => functionName === 'supportedToken' ? '0x0000000000000000000000000000000000009999' : functionName === 'attendanceVerifier' ? contractAddresses.helper : contractAddresses.strategy);
    await expect(loadProof({ manifestJson: manifest(), createReader: async () => changedImmutable })).resolves.toMatchObject({ status: 'mismatch', reason: 'identity-mismatch' });
  });

  it('reads a real repository-shaped pot with no receipts as configured evidence, not a transaction claim', async () => {
    const configured = reader();
    const snapshot = await loadProof({ manifestJson: manifest(), potId: '1', createReader: async () => configured });
    expect(snapshot).toMatchObject({ status: 'matched', reason: 'matched', observedBlock: '20', pot: { id: '1', status: 'OPEN', stakeAmount: '10000000' }, receipts: [] });
    expect(snapshot.manifest).toMatchObject({ network: 'local', chainId: 31337, contracts: { core: { address: contractAddresses.core }, token: { address: contractAddresses.token } }, deployment: { blockNumber: '10', blockHash }, sourceCommit: 'a'.repeat(40), abiHash: readerAbiHash });
    expect(configured.repository.waitForTransaction).not.toHaveBeenCalled();
  });

  it('checks a receipt using the repository expected-intent method, not duplicated transaction decoding', async () => {
    const source = JSON.parse(manifest()) as Record<string, any>;
    source.receipts = [{
      hash: keccak256(toBytes('receipt')),
      blockNumber: '11',
      blockHash,
      potId: '1',
      intent: { kind: 'join', account: '0x0000000000000000000000000000000000002001', chainId: 31337, core: contractAddresses.core, potId: '1', token: contractAddresses.token },
    }];
    const configured = reader();
    const txHash = source.receipts[0].hash;
    vi.mocked(configured.publicClient.getTransactionReceipt).mockImplementation(async ({ hash }: { hash: `0x${string}` }) => ({ status: 'success', transactionHash: hash, blockNumber: 11n, blockHash } as never));
    vi.mocked(configured.publicClient.getBlock).mockImplementation(async ({ blockNumber }: { blockNumber?: bigint } = {}) => ({ number: blockNumber ?? 20n, hash: blockHash, timestamp: 1_700_000_000n } as never));
    vi.mocked(configured.repository.waitForTransaction).mockResolvedValue({ hash: txHash, status: 'success', blockNumber: 11n, chainId: 31337, coreAddress: contractAddresses.core, from: '0x0000000000000000000000000000000000002001', to: contractAddresses.core, operation: 'join', potId: 1n });

    const snapshot = await loadProof({ manifestJson: JSON.stringify(source), potId: '1', createReader: async () => configured });
    expect(snapshot.status).toBe('matched');
    expect(snapshot.receipts).toMatchObject([{ status: 'matched', observed: { hash: txHash, blockNumber: '11', blockHash, sender: '0x0000000000000000000000000000000000002001', core: contractAddresses.core, operation: 'join', potId: '1' } }]);
    expect(configured.repository.waitForTransaction).toHaveBeenCalledWith(txHash, source.receipts[0].intent);
  });
});
