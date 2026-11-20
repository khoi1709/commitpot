import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicPotController } from '../../src/application/usePublicPot';
import type { Address, ChainContext, ParticipantStatus, PotSummary, WalletConnection } from '../../src/domain';

const account: Address = '0x0000000000000000000000000000000000000001';
const core: Address = '0x0000000000000000000000000000000000002000';
const token: Address = '0x0000000000000000000000000000000000001000';
const chain: ChainContext = { chainId: 31337, coreAddress: core, token, mode: 'local' };
const connection: WalletConnection = { connected: true, address: account, chainId: 31337, mode: 'local' };
const member: ParticipantStatus = { joined: true, checkedIn: false, claimed: false, order: 1n, claimable: 0n };
const pot: PotSummary = { id: 1n, config: { token, verifier: account, stakeAmount: 10n, registrationClose: 100, checkInOpen: 100, checkInClose: 200 }, status: 'OPEN', participantCount: 1n, checkedInCount: 0n, payoutPerWinner: 0n, dustAmount: 0n };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const base = () => ({
  repository: { getPot: vi.fn(async () => pot), getChainTimestamp: vi.fn(async () => 101), getChainContext: vi.fn(async () => chain), listPots: vi.fn(async () => [pot]), getParticipantStatus: vi.fn(async () => member) },
  wallet: { getConnection: vi.fn(async () => connection), getTokenBalance: vi.fn(async () => 20n), getTokenAllowance: vi.fn(async () => 20n) },
});
afterEach(() => vi.useRealTimers());

describe('bounded public-read freshness', () => {
  it('keeps public selected data verified despite hung optional discovery, then expires it without polling overlap', async () => {
    vi.useFakeTimers(); const { repository, wallet } = base(); const list = deferred<PotSummary[]>(); repository.listPots.mockReturnValue(list.promise);
    const controller = createPublicPotController(repository, wallet, 1n); const stop = controller.startPolling(1000);
    for (let i = 0; i < 32 && !controller.getSnapshot().publicVerified; i++) await Promise.resolve();
    expect(controller.getSnapshot().pot.status).toBe('ready');
    expect(controller.getSnapshot()).toMatchObject({ publicVerified: true, chain: { status: 'ready' }, time: { status: 'ready' }, pot: { status: 'ready' } });
    expect(repository.listPots).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14_999); expect(controller.getSnapshot()).toMatchObject({ writesEnabled: true, publicVerified: true });
    await vi.advanceTimersByTimeAsync(1); expect(controller.getSnapshot()).toMatchObject({ publicVerified: false, writesEnabled: false, pot: { status: 'stale' } });
    await vi.advanceTimersByTimeAsync(50_000); expect(repository.listPots).toHaveBeenCalledTimes(1);
    stop();
  });

  it('cancels expiry timers and ignores late critical results after stop', async () => {
    vi.useFakeTimers(); const { repository, wallet } = base(); const time = deferred<number>(); repository.getChainTimestamp.mockReturnValue(time.promise);
    const controller = createPublicPotController(repository, wallet, 1n); const stop = controller.startPolling(1000);
    const before = controller.getSnapshot(); stop(); const stopped = controller.getSnapshot();
    time.resolve(101); await vi.advanceTimersByTimeAsync(20_000);
    expect(controller.getSnapshot()).toBe(stopped); expect(stopped).not.toBe(before); expect(vi.getTimerCount()).toBe(0);
  });
});
