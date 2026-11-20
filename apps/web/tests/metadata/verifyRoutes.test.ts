import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ProofSnapshot } from '../../src/infrastructure/evidence/reader';
import VerifyPage from '../../src/app/verify/page';
import VerifyPotPage from '../../src/app/verify/[potId]/page';
import { VerificationView } from '../../src/presentation/VerificationView';

vi.mock('../../src/infrastructure/evidence/server', () => ({
  loadServerProof: vi.fn(async (_manifest: string | undefined, potId: string) => ({ status: 'unconfigured', reason: 'missing-manifest', requestedPotId: potId, receipts: [] })),
}));
const render = async (page: Promise<React.ReactNode>) => renderToStaticMarkup(await page);

describe('wallet-free verification route SSR', () => {
  it('renders the public verification lookup without account or wallet content', async () => {
    const html = await render(VerifyPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Verify a public pot');
    expect(html).toContain('No public release manifest is supplied');
    expect(html).toContain('name="potId"');
    expect(html).toContain('Historical Anvil summary for pot #3');
    expect(html).toContain('href="/verify/3?lang=en"');
    expect(html).not.toMatch(/connect wallet|eth_requestAccounts|signTypedData|eth_sendTransaction/i);
  });

  it('renders only the historical Anvil lifecycle for pot 3, with explicit missing receipts limitation', async () => {
    const html = await render(VerifyPotPage({ params: Promise.resolve({ potId: '3' }), searchParams: Promise.resolve({ lang: 'en' }) }));
    expect(html).toContain('Historical local-chain summary');
    expect(html).toContain('5 × 10 Test USDC');
    expect(html).toContain('4 × 12.5 Test USDC');
    expect(html).toContain('no full transaction hashes or block identities');
    expect(html).toContain('synthetic wallet provider');
    expect(html).not.toContain('Matches configured manifest');
  });

  it('renders an unknown pot as unverified and never substitutes historical data', async () => {
    const html = await render(VerifyPotPage({ params: Promise.resolve({ potId: '2' }), searchParams: Promise.resolve({ lang: 'vi' }) }));
    expect(html).toContain('Bằng chứng quỹ #2');
    expect(html).toContain('Chưa cấu hình');
    expect(html).not.toContain('Lượt nạp được ghi nhận');
    expect(html).not.toContain('5 × Test USDC');
  });

  it.each(['01', '0', '-1', '1.0', '1'.repeat(79)])('rejects noncanonical route pot ID %s', async potId => {
    const html = await render(VerifyPotPage({ params: Promise.resolve({ potId }), searchParams: Promise.resolve({}) }));
    expect(html).toContain('Invalid pot reference');
    expect(html).not.toContain(potId);
  });

  it('rejects duplicate lookup query values', async () => {
    const html = await render(VerifyPage({ searchParams: Promise.resolve({ potId: ['1', '2'] }) }));
    expect(html).toContain('Invalid pot reference');
  });

  it('shows declared source/runtime identity and actual receipt context without elevating a claim simulation', async () => {
    const address = (suffix: string) => `0x${suffix.padStart(40, '0')}` as `0x${string}`;
    const hash = `0x${'a'.repeat(64)}` as `0x${string}`;
    const intent = { kind: 'claim' as const, account: address('1'), chainId: 43113, core: address('2'), potId: '1', beneficiary: address('3') };
    const snapshot = {
      status: 'matched' as const, reason: 'matched' as const, requestedPotId: '1', observedBlock: '22', observedBlockHash: hash, chainTimestamp: 1_700_000_000,
      manifest: {
        version: 1 as const, kind: 'release' as const, network: 'fuji' as const, chainId: 43113 as const, sourceCommit: 'b'.repeat(40),
        compiler: { version: '0.8.28', optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' }, abiHash: hash,
        contracts: {
           core: { address: address('2'), artifactSha256: 'c'.repeat(64), deployedRuntimeHash: hash },
           token: { address: address('3'), artifactSha256: 'c'.repeat(64), deployedRuntimeHash: hash },
           helper: { address: address('4'), artifactSha256: 'c'.repeat(64), deployedRuntimeHash: hash },
           strategy: { address: address('5'), artifactSha256: 'c'.repeat(64), deployedRuntimeHash: hash },
         },
        immutableArgs: { supportedToken: address('3'), attendanceVerifier: address('4'), payoutStrategy: address('5') }, deployment: { blockNumber: '10', blockHash: hash }, potId: '1',
        receipts: [{ hash, blockNumber: '11', blockHash: hash, potId: '1', intent }],
      },
      pot: { id: '1', status: 'FINALIZED' as const, token: address('3'), verifier: address('4'), stakeAmount: '10000000', registrationClose: 1_700_000_100, checkInOpen: 1_700_000_200, checkInClose: 1_700_000_300, participantCount: '5', checkedInCount: '4', payoutPerWinner: '12500000', dustAmount: '0' },
      receipts: [{ reference: { hash, blockNumber: '11', blockHash: hash, potId: '1', intent }, status: 'matched' as const, amount: '12500000', beneficiary: address('3'), blockTimestamp: 1_700_000_000, simulation: 'AlreadyClaimed' as const, observed: { hash, blockNumber: '11', blockHash: hash, sender: address('1'), destination: address('2'), core: address('2'), operation: 'claim' as const, potId: '1', beneficiary: address('3'), amount: '12500000', blockTimestamp: 1_700_000_000 } }],
    } satisfies ProofSnapshot;
    const html = renderToStaticMarkup(createElement(VerificationView, { potId: '1', snapshot }));
    expect(html).toContain('Matches configured manifest');
    expect(html).toContain('Declared source commit');
    expect(html).toContain('core deployed runtime hash');
    expect(html).toContain('helper deployed runtime hash');
    expect(html).toContain('Full transaction hash');
    expect(html).toContain('Reference block hash');
    expect(html).toContain('Observed sender');
    expect(html).toContain('Observed destination');
    expect(html).toContain('Observed operation');
    expect(html).toContain('Block time (UTC)');
    expect(html).toContain('Beneficiary');
    expect(html).toContain('12.5 Test USDC');
    expect(html).toContain('Already claimed at the observed block');
    expect(html).toContain('Open Fuji explorer');
    expect(html).toContain('does not establish that a participant was physically present');
  });
});
