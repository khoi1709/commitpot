import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicPotController } from '../../src/application/usePublicPot';
import type { Address, ChainContext, ParticipantStatus, PotSummary, WalletConnection } from '../../src/domain';

const account: Address = '0x0000000000000000000000000000000000000001';
const other: Address = '0x0000000000000000000000000000000000000002';
const chain: ChainContext = { chainId: 31337, coreAddress: '0x0000000000000000000000000000000000002000', token: '0x0000000000000000000000000000000000001000', mode: 'local' };
const connection: WalletConnection = { address: account, chainId: chain.chainId, mode: chain.mode, connected: true };
const member: ParticipantStatus = { joined: true, checkedIn: false, claimed: false, order: 0n, claimable: 0n };
const pot = (id = 1n): PotSummary => ({
  id, config: { token: chain.token, verifier: other, stakeAmount: 10_000_000n, registrationClose: 2000, checkInOpen: 2000, checkInClose: 3000 },
  status: 'OPEN', participantCount: 5n, checkedInCount: 0n, payoutPerWinner: 0n, dustAmount: 0n,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(selected: bigint | null = 1n) {
  const repository = {
    getPot: vi.fn(async (id: bigint) => pot(id)), getChainTimestamp: vi.fn(async () => 1000),
    getChainContext: vi.fn(async () => chain), listPots: vi.fn(async () => [pot(99n)]),
    getParticipantStatus: vi.fn(async () => member),
  };
  const wallet = {
    getConnection: vi.fn(async () => connection), getTokenBalance: vi.fn(async () => 20_000_000n),
    getTokenAllowance: vi.fn(async () => 10_000_000n),
  };
  return { repository, wallet, controller: createPublicPotController(repository, wallet, selected) };
}
afterEach(() => { vi.useRealTimers(); });

describe('selected public pot is independent of wallet and discovery', () => {
  it('renders a known selected pot and time when wallet and latest list both fail', async () => {
    const { repository, wallet, controller } = setup();
    const listError = new Error('list unavailable'); const walletError = new Error('wallet unavailable');
    repository.listPots.mockRejectedValue(listError); wallet.getConnection.mockRejectedValue(walletError);
    await controller.refresh();
    expect(repository.getPot).toHaveBeenCalledWith(1n);
    expect(controller.getSnapshot()).toMatchObject({
      selected: 1n, pot: { status: 'ready', data: { id: 1n } }, time: { status: 'ready', data: 1000 },
      list: { status: 'error', error: listError }, wallet: { status: 'error', error: walletError },
      publicVerified: true, writesEnabled: false, refreshing: false,
    });
    expect(repository.getParticipantStatus).not.toHaveBeenCalled();
  });

  it('publishes public reads without waiting for a hung wallet/list and cancels late failures', async () => {
    const { repository, wallet, controller } = setup();
    const list = deferred<PotSummary[]>(); const connectionRead = deferred<WalletConnection>();
    repository.listPots.mockReturnValue(list.promise); wallet.getConnection.mockReturnValue(connectionRead.promise);
    const work = controller.refresh();
    await vi.waitFor(() => expect(controller.getSnapshot().pot.status).toBe('ready'));
    expect(controller.getSnapshot()).toMatchObject({ publicVerified: true, writesEnabled: false, time: { data: 1000 }, list: { status: 'loading' } });
    controller.cancel(); const cancelled = controller.getSnapshot();
    list.reject(new Error('old list')); connectionRead.reject(new Error('old wallet')); await work;
    expect(controller.getSnapshot()).toBe(cancelled);
  });

  it('reads without any wallet and never auto-selects a discovery result', async () => {
    const { repository } = setup();
    const controller = createPublicPotController(repository, null, 1n);
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ selected: 1n, pot: { data: { id: 1n } }, list: { data: [{ id: 99n }] }, publicVerified: true, writesEnabled: false });
    controller.setSelected(null); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ selected: null, pot: { status: 'idle', data: null }, list: { status: 'ready' }, publicVerified: true });
    expect(repository.getPot).toHaveBeenCalledTimes(1);
  });

  it('a list failure alone preserves confirmed selected pot and write readiness', async () => {
    const { repository, controller } = setup();
    await controller.refresh();
    repository.listPots.mockRejectedValue(new Error('discovery RPC failure')); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ pot: { data: { id: 1n }, status: 'ready' }, list: { data: [{ id: 99n }], status: 'stale' }, writesEnabled: true });
  });

  it('supports create readiness without requiring an existing or auto-selected pot', async () => {
    const { repository, controller } = setup(null);
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ selected: null, pot: { data: null }, participant: { data: null }, writesEnabled: true });
    expect(repository.getPot).not.toHaveBeenCalled(); expect(repository.getParticipantStatus).not.toHaveBeenCalled();
  });
});

describe('critical data fails closed and retains honest stale state', () => {
  it.each(['getPot', 'getChainTimestamp', 'getChainContext'] as const)('disables writes and keeps prior data when %s fails', async method => {
    const { repository, controller } = setup();
    await controller.refresh(); expect(controller.getSnapshot().writesEnabled).toBe(true);
    const error = new Error(`${method} RPC unavailable`);
    repository[method].mockRejectedValueOnce(error);
    const key = { getPot: 'pot', getChainTimestamp: 'time', getChainContext: 'chain' }[method] as 'pot' | 'time' | 'chain';
    const prior = controller.getSnapshot()[key].data;
    const failedRead = controller.refresh();
    expect(controller.getSnapshot().writesEnabled).toBe(false);
    expect(controller.getSnapshot()[key]).toMatchObject({ data: prior, status: 'loading' });
    await failedRead;
    expect(controller.getSnapshot()[key]).toMatchObject({ data: prior, status: 'stale', error });
    expect(controller.getSnapshot()).toMatchObject({ publicVerified: false, writesEnabled: false, pot: { data: { id: 1n } } });
    const retry = controller.refresh();
    expect(controller.getSnapshot()[key].error).toBe(error); // Not cleared while merely retrying.
    await retry;
    expect(controller.getSnapshot()[key]).toMatchObject({ status: 'ready', error: null });
    expect(controller.getSnapshot().writesEnabled).toBe(true);
  });

  it('does not invent pot/time values on first-read failure or accept malformed clock values', async () => {
    const { repository, controller } = setup();
    repository.getPot.mockRejectedValue(new Error('missing')); repository.getChainTimestamp.mockResolvedValue(Number.NaN);
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({
      pot: { data: null, status: 'error' }, time: { data: null, status: 'error', error: { code: 'INVALID_ARGUMENT' } },
      publicVerified: false, writesEnabled: false,
    });
  });

  it('a wallet/account read failure disables writes but keeps public data', async () => {
    const { wallet, controller } = setup();
    await controller.refresh(); const error = new Error('account query unavailable');
    wallet.getConnection.mockRejectedValue(error); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({
      pot: { status: 'ready', data: { id: 1n } }, publicVerified: true, writesEnabled: false,
      wallet: { status: 'stale', data: connection, error }, participant: { status: 'stale' },
    });
  });

  it('a member/funds RPC failure is not represented as zero balance or verified membership', async () => {
    const { wallet, controller } = setup(); await controller.refresh();
    const error = new Error('balance RPC failure'); wallet.getTokenBalance.mockRejectedValue(error); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ publicVerified: true, writesEnabled: false,
      participant: { status: 'stale', data: { account, balance: 20_000_000n }, error } });
  });

  it('never reuses previous account balances for a newly selected wallet account', async () => {
    const { wallet, controller } = setup(); await controller.refresh();
    wallet.getConnection.mockResolvedValue({ ...connection, address: other });
    wallet.getTokenBalance.mockRejectedValue(new Error('new account balance failed')); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ wallet: { data: { address: other } }, participant: { data: null, status: 'error' }, writesEnabled: false });
  });

  it.each([
    { ...connection, connected: false, address: null }, { ...connection, chainId: 43113 }, { ...connection, mode: 'fuji' as const },
  ])('does not enable writes for a disconnected/wrong-context wallet', async next => {
    const { wallet, controller } = setup(); wallet.getConnection.mockResolvedValue(next); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ publicVerified: true, writesEnabled: false });
  });

  it('rejects a different pot result and fails closed for mismatched token context', async () => {
    const { repository, controller } = setup(); repository.getPot.mockResolvedValueOnce(pot(99n)); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ pot: { status: 'error', error: { code: 'POT_NOT_FOUND' } }, writesEnabled: false });
    repository.getPot.mockResolvedValue({ ...pot(), config: { ...pot().config, token: other } }); await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ publicVerified: false, writesEnabled: false });
  });
});

describe('public read generations and bounded polling', () => {
  it('drops delayed old selection even after selecting away and back', async () => {
    const { repository, controller } = setup(); const delayed = deferred<PotSummary>();
    repository.getPot.mockReturnValueOnce(delayed.promise);
    const old = controller.refresh(); controller.setSelected(2n); controller.setSelected(1n);
    expect(controller.getSnapshot()).toMatchObject({ pot: { data: null }, participant: { data: null }, writesEnabled: false });
    await controller.refresh(); const current = controller.getSnapshot();
    delayed.resolve({ ...pot(), participantCount: 900n }); await old;
    expect(controller.getSnapshot()).toBe(current); expect(controller.getSnapshot().pot.data?.participantCount).toBe(5n);
  });

  it('drops older refresh errors after a newer refresh succeeds', async () => {
    const { repository, controller } = setup(); const delayed = deferred<number>();
    repository.getChainTimestamp.mockReturnValueOnce(delayed.promise);
    const old = controller.refresh(); await controller.refresh(); const current = controller.getSnapshot();
    delayed.reject(new Error('out-of-order time failure')); await old;
    expect(controller.getSnapshot()).toBe(current); expect(current.writesEnabled).toBe(true);
  });

  it('logical cancellation drops results, preserves selection/data, and disables writes', async () => {
    const { repository, controller } = setup(); await controller.refresh();
    const delayed = deferred<PotSummary>(); repository.getPot.mockReturnValueOnce(delayed.promise);
    const work = controller.refresh(); controller.cancel(); const stopped = controller.getSnapshot();
    expect(stopped).toMatchObject({ selected: 1n, pot: { data: { id: 1n }, status: 'stale' }, writesEnabled: false, refreshing: false });
    delayed.resolve(pot(2n)); await work; expect(controller.getSnapshot()).toBe(stopped);
    await controller.refresh(); expect(controller.getSnapshot().writesEnabled).toBe(true);
  });

  it('polls serially, clamps short intervals, and cleans up without accumulating hung reads', async () => {
    vi.useFakeTimers();
    const { repository, controller } = setup(); const delayed = deferred<PotSummary>();
    repository.getPot.mockReturnValueOnce(delayed.promise);
    const stop = controller.startPolling(5);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(repository.getPot).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    delayed.resolve(pot()); await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(999); expect(repository.getPot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(repository.getPot).toHaveBeenCalledTimes(2);
    stop(); expect(vi.getTimerCount()).toBe(0);
    expect(controller.getSnapshot().writesEnabled).toBe(false);
    await vi.advanceTimersByTimeAsync(100_000); expect(repository.getPot).toHaveBeenCalledTimes(2);
  });

  it('bounds long intervals and old polling cleanup cannot stop a replacement loop', async () => {
    vi.useFakeTimers(); const { repository, controller } = setup();
    const oldStop = controller.startPolling(); await vi.advanceTimersByTimeAsync(0);
    const stop = controller.startPolling(999_999); oldStop(); await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    const count = repository.getPot.mock.calls.length;
    await vi.advanceTimersByTimeAsync(59_999); expect(repository.getPot).toHaveBeenCalledTimes(count);
    await vi.advanceTimersByTimeAsync(1); expect(repository.getPot).toHaveBeenCalledTimes(count + 1);
    stop(); expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes subscription changes, stops after unsubscribe, and safely waits for runtime', async () => {
    const controller = createPublicPotController(null); const listener = vi.fn(); const unsubscribe = controller.subscribe(listener);
    await controller.refresh(); expect(controller.getSnapshot().writesEnabled).toBe(false);
    controller.setSelected(2n); expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe(); controller.cancel(); expect(listener).toHaveBeenCalledTimes(1);
  });
});
