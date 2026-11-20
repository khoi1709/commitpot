'use client';

import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { DomainError, validateTimestamp, type Address, type ChainContext, type IPotRepository, type IWalletPort, type ParticipantStatus, type PotSummary, type WalletConnection } from '../domain';

export type ReadState<T> = Readonly<{
  data: T | null;
  status: 'idle' | 'loading' | 'ready' | 'stale' | 'error';
  error: unknown | null;
}>;
export type PublicPotRepository = Pick<IPotRepository, 'getPot' | 'getChainTimestamp' | 'getChainContext' | 'listPots' | 'getParticipantStatus'>;
export type PublicPotWallet = Pick<IWalletPort, 'getConnection' | 'getTokenBalance' | 'getTokenAllowance'>;
export type PublicPotParticipant = Readonly<{
  account: Address;
  potId: bigint;
  status: ParticipantStatus;
  balance: bigint;
  allowance: bigint;
}>;
export type PublicPotSnapshot = Readonly<{
  selected: bigint | null;
  pot: ReadState<PotSummary>;
  time: ReadState<number>;
  chain: ReadState<ChainContext>;
  list: ReadState<PotSummary[]>;
  wallet: ReadState<WalletConnection>;
  participant: ReadState<PublicPotParticipant>;
  refreshing: boolean;
  publicVerified: boolean;
  writesEnabled: boolean;
}>;
export interface PublicPotController {
  getSnapshot(): PublicPotSnapshot;
  subscribe(listener: () => void): () => void;
  setSelected(id: bigint | null): void;
  refresh(): Promise<void>;
  startPolling(intervalMs?: number): () => void;
  cancel(): void;
}

const idle = <T>(): ReadState<T> => ({ data: null, status: 'idle', error: null });
const loading = <T>(value: ReadState<T>): ReadState<T> => ({ ...value, status: 'loading' });
const unverified = <T>(value: ReadState<T>): ReadState<T> => ({ ...value, status: value.data !== null ? 'stale' : value.error !== null ? 'error' : 'idle' });
const failed = <T>(value: ReadState<T>, error: unknown): ReadState<T> => ({ data: value.data, status: value.data !== null ? 'stale' : 'error', error });
const sameAccount = (a: Address, b: Address) => a.toLowerCase() === b.toLowerCase();

/** Read coordination only: never connects, signs, writes, or substitutes a second repository. */
export function createPublicPotController(
  repository: PublicPotRepository | null,
  wallet: PublicPotWallet | null = null,
  selected: bigint | null = null,
): PublicPotController {
  let state: PublicPotSnapshot = Object.freeze({
    selected, pot: idle<PotSummary>(), time: idle<number>(), chain: idle<ChainContext>(),
    list: idle<PotSummary[]>(), wallet: idle<WalletConnection>(), participant: idle<PublicPotParticipant>(),
    refreshing: false, publicVerified: false, writesEnabled: false,
  });
  let generation = 0;
  let polling = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pollDue: number | null = null;
  let freshnessDue: number | null = null;
  let pollCallback: (() => void) | undefined;
  let freshnessExpired = false;
  const freshnessDeadlineMs = 15_000;
  const listeners = new Set<() => void>();
  const publish = (change: Partial<PublicPotSnapshot>) => {
    const next = { ...state, ...change };
    const context = next.chain.data;
    const connection = next.wallet.data;
    const member = next.participant.data;
    next.publicVerified = !freshnessExpired && next.chain.status === 'ready' && !!context && next.time.status === 'ready'
      && (next.selected === null || (next.pot.status === 'ready' && next.pot.data?.id === next.selected
        && next.pot.data.config.token.toLowerCase() === context.token.toLowerCase()));
    next.writesEnabled = next.publicVerified && next.wallet.status === 'ready' && !!connection?.connected
      && !!connection.address && connection.chainId === context?.chainId && connection.mode === context.mode
      && (next.selected === null || (next.participant.status === 'ready' && !!member
        && member.potId === next.selected && sameAccount(member.account, connection.address)));
    state = Object.freeze(next);
    listeners.forEach(listener => listener());
  };
  const invalidate = (change: Partial<PublicPotSnapshot> = {}) => {
    generation++;
    publish({ pot: unverified(state.pot), time: unverified(state.time), chain: unverified(state.chain),
      list: unverified(state.list), wallet: unverified(state.wallet), participant: unverified(state.participant),
      refreshing: false, ...change });
  };
  const scheduleTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const now = Date.now();
    const due = [pollDue, freshnessDue].filter((value): value is number => value !== null).sort((a, b) => a - b)[0];
    if (due === undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      const at = Date.now();
      if (freshnessDue !== null && freshnessDue <= at) {
        freshnessDue = null; freshnessExpired = true; invalidate();
      }
      if (pollDue !== null && pollDue <= at && pollCallback) {
        pollDue = null; pollCallback();
      }
      scheduleTimer();
    }, Math.max(0, due - now));
  };
  const scheduleFreshnessExpiry = () => {
    freshnessDue = Date.now() + freshnessDeadlineMs;
    scheduleTimer();
  };
  const cancel = () => {
    polling++;
    pollDue = null; freshnessDue = null; pollCallback = undefined;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    freshnessExpired = true;
    invalidate();
  };
  const refresh = async () => {
    if (!repository) return;
    freshnessExpired = true;
    freshnessDue = null;
    scheduleTimer();
    const request = ++generation;
    const id = state.selected;
    publish({ pot: id === null ? idle() : loading(state.pot), time: loading(state.time), chain: loading(state.chain),
      list: loading(state.list), wallet: wallet ? loading(state.wallet) : idle(),
      participant: wallet && id !== null ? loading(state.participant) : idle(), refreshing: true });
    const current = () => request === generation;
    // Each result is published separately: neither a failed nor a hung optional read hides public data.
    const observe = async <T,>(previous: ReadState<T>, read: () => Promise<T>, apply: (value: ReadState<T>) => void): Promise<T | null> => {
      try {
        const data = await read();
        if (!current()) return null;
        apply({ data, status: 'ready', error: null });
        return data;
      } catch (error) {
        if (current()) apply(failed(previous, error));
        return null;
      }
    };
    const publicReads: Promise<unknown>[] = [
      observe(state.time, async () => { const time = await repository.getChainTimestamp(); validateTimestamp(time); return time; }, time => publish({ time })),
      observe(state.chain, () => repository.getChainContext(), chain => publish({ chain })),
    ];
    const optionalReads: Promise<unknown>[] = [
      observe(state.list, () => repository.listPots(), list => publish({ list })),
    ];
    if (id !== null) publicReads.push(observe(state.pot, async () => {
      const pot = await repository.getPot(id);
      if (pot.id !== id) throw new DomainError('POT_NOT_FOUND', 'Repository returned a different pot.');
      return pot;
    }, pot => publish({ pot })));
    if (wallet) optionalReads.push((async () => {
      const connection = await observe(state.wallet, () => wallet.getConnection(), value => publish({ wallet: value }));
      if (!current()) return;
      if (!connection) {
        if (id !== null) publish({ participant: failed(state.participant, state.wallet.error) });
        return;
      }
      if (!connection.connected || !connection.address || id === null) { publish({ participant: idle() }); return; }
      const account = connection.address;
      // Never retain another account's funds/status as the next account's stale data.
      const previous = state.participant.data && sameAccount(state.participant.data.account, account)
        && state.participant.data.potId === id ? state.participant : idle<PublicPotParticipant>();
      publish({ participant: loading(previous) });
      await observe(previous, async () => {
        const [status, balance, allowance] = await Promise.all([
          repository.getParticipantStatus(id, account), wallet.getTokenBalance(account), wallet.getTokenAllowance(account),
        ]);
        return { account, potId: id, status, balance, allowance };
      }, participant => publish({ participant }));
    })());
    // The discovery list and wallet/member reads cannot delay selected public data, but polling stays serial across all reads.
    const publicReady = Promise.all(publicReads);
    await publicReady;
    if (current() && state.chain.status === 'ready' && state.time.status === 'ready'
      && (id === null || state.pot.status === 'ready')) {
      freshnessExpired = false;
      scheduleFreshnessExpiry();
      publish({ refreshing: true });
    }
    await Promise.all(optionalReads);
    if (current()) publish({ refreshing: false });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setSelected(id) {
      if (id !== state.selected) { freshnessExpired = true; invalidate({ selected: id, pot: idle(), participant: idle() }); }
    },
    refresh,
    startPolling(intervalMs = 5000) {
      const interval = Number.isFinite(intervalMs) ? Math.min(60_000, Math.max(1000, intervalMs)) : 5000;
      const owner = ++polling;
      if (pollDue !== null) { pollDue = null; scheduleTimer(); }
      const tick = async () => {
        await refresh();
        if (owner === polling) { pollDue = Date.now() + interval; scheduleTimer(); }
      };
      pollCallback = () => { void tick(); };
      void tick();
      return () => { if (owner === polling) cancel(); };
    },
    cancel,
  };
}

export function usePublicPot(
  repository: PublicPotRepository | null,
  wallet: PublicPotWallet | null,
  selected: bigint | null,
  intervalMs = 5000,
) {
  const controller = useMemo(() => createPublicPotController(repository, wallet, selected), [repository, wallet]);
  useLayoutEffect(() => { controller.setSelected(selected); }, [controller, selected]);
  useEffect(() => {
    if (!repository) return;
    return controller.startPolling(intervalMs);
  }, [controller, repository, selected, intervalMs]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...snapshot, refresh: controller.refresh };
}
