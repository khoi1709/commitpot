import { describe, expect, it, vi } from 'vitest';
import { appendConfirmedActivity, isLegacyActivity, loadConfirmedActivity, parseActivity } from '../../src/application/activity';
import { createRecoveryController, RecoveryError, type RecoveryStorage } from '../../src/application/recovery';
import { parsePendingOperation, validTransactionHash } from '../../src/application/pending';
import type { OperationIntent, TransactionReceipt, TxHash } from '../../src/domain';

const account = '0x0000000000000000000000000000000000000001' as const;
const core = '0x0000000000000000000000000000000000002000' as const;
const token = '0x0000000000000000000000000000000000001000' as const;
const hash = `0x${'a'.repeat(64)}` as TxHash;
const intent: OperationIntent = { kind: 'join', potId: '1', account, chainId: 31337, core, amount: '10000000' };
const receipt = (overrides: Partial<TransactionReceipt> = {}): TransactionReceipt => ({ hash, status: 'success', blockNumber: 8n, chainId: 31337, coreAddress: core, from: account, to: core, operation: 'join', potId: 1n, amount: 10_000_000n, ...overrides });
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  let failGet = false; let failSet = false; let failRemove = false; let afterSet = false; let afterRemove = false;
  const storage: RecoveryStorage & { failGet(v: boolean): void; failSet(v: boolean, after?: boolean): void; failRemove(v: boolean, after?: boolean): void; raw(key: string): string | null; put(key: string, value: string): void } = {
    getItem: vi.fn((key: string) => { if (failGet) throw new Error('get denied'); return values.get(key) ?? null; }),
    setItem: vi.fn((key: string, value: string) => { if (failSet && !afterSet) throw new Error('set denied'); values.set(key, value); if (failSet && afterSet) throw new Error('set stored then denied'); }),
    removeItem: vi.fn((key: string) => { if (failRemove && !afterRemove) throw new Error('remove denied'); values.delete(key); if (failRemove && afterRemove) throw new Error('remove stored then denied'); }),
    failGet(v) { failGet = v; }, failSet(v, after = false) { failSet = v; afterSet = after; }, failRemove(v, after = false) { failRemove = v; afterRemove = after; }, raw(key) { return values.get(key) ?? null; }, put(key, value) { values.set(key, value); },
  };
  return storage;
}
const pendingKey = 'commitpot-pending-v1';
const future = JSON.stringify({ version: 3, secret: 'future' });
const invalid = '{bad';
const legacy = JSON.stringify({ version: 1, kind: 'join', potId: '1', account, chainId: 31337, core, hash, started: 123 });
const legacyWithSecret = JSON.stringify({ version: 1, kind: 'join', potId: '1', account, chainId: 31337, core, hash, started: 123, signature: 'fixture-secret' });

describe('recovery persistence and quarantine', () => {
  it('constructs and loads safely when storage is missing/getter throws; begins only with verified storage', () => {
    const absent = createRecoveryController(null);
    expect(absent.load()).toMatchObject({ pending: null, blocked: true });
    expect(() => absent.begin(intent)).toThrowError(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
    const storage = memoryStorage(); storage.failGet(true);
    const controller = createRecoveryController(storage);
    expect(controller.load()).toMatchObject({ blocked: true, pending: null });
    expect(() => controller.begin(intent)).toThrowError(expect.objectContaining({ code: 'STORAGE_UNVERIFIED' }));
  });

  it('fail-closes begin and pre-hash stage on setter failure, but keeps known hash across load', () => {
    const storage = memoryStorage(); const controller = createRecoveryController(storage);
    storage.failSet(true);
    expect(() => controller.begin(intent)).toThrowError(expect.objectContaining({ code: 'STORAGE_UNVERIFIED' }));
    expect(storage.raw(pendingKey)).toBeNull();
    storage.failSet(false);
    const pending = controller.begin(intent);
    storage.failSet(true);
    expect(() => controller.setStage(pending.id, 'signing')).toThrowError(expect.objectContaining({ code: 'STORAGE_UNVERIFIED' }));
    storage.failSet(true);
    const hashWarning = controller.setHash(pending.id, hash);
    expect(hashWarning).toMatchObject({ pending: { id: pending.id, hash }, blocked: true, warning: expect.any(String) });
    expect(controller.load()).toMatchObject({ pending: { id: pending.id, hash }, blocked: true });
    expect(() => controller.begin(intent)).toThrow();
  });

  it('preserves valid v2 intent from caller and reloaded snapshot mutation, rejecting foreign bytes on cleanup', () => {
    const storage = memoryStorage(); const controller = createRecoveryController(storage);
    const pending = controller.begin(intent);
    const reloaded = createRecoveryController(storage).load().pending!;
    expect(Object.isFrozen(reloaded.intent)).toBe(true);
    expect(() => { (reloaded.intent as { account: string }).account = token; }).toThrow();
    expect(Object.isFrozen(pending)).toBe(true); expect(Object.isFrozen(pending.intent)).toBe(true);
    expect(() => { (pending.intent as { account: string }).account = token; }).toThrow();
    controller.setStage(pending.id, 'signing'); controller.setHash(pending.id, hash);
    const foreign = { version: 2, id: 'other', stage: 'preparing', intent: { ...intent, account: token }, started: 100 };
    storage.put(pendingKey, JSON.stringify(foreign));
    expect(controller.complete(pending.id, receipt())).toMatchObject({ blocked: true });
    const exact = storage.raw(pendingKey)!;
    expect(() => controller.discardQuarantine(exact)).toThrowError(expect.objectContaining({ code: 'LEGACY_CONTEXT' }));
    expect(storage.raw(pendingKey)).toBe(exact);
  });

  it.each([['invalid', invalid], ['future', future], ['legacy', legacy], ['secret-bearing legacy', legacyWithSecret]] as const)('keeps %s bytes exactly until exact quarantine reset', (_name, raw) => {
    const storage = memoryStorage({ [pendingKey]: raw }); const controller = createRecoveryController(storage);
    expect(controller.load()).toMatchObject({ blocked: true, raw });
    expect(() => controller.begin(intent)).toThrow();
    const changed = `${raw} `; storage.put(pendingKey, changed);
    expect(controller.discardQuarantine(raw)).toMatchObject({ blocked: true });
    expect(storage.raw(pendingKey)).toBe(changed);
  });

  it('explicit quarantine removal clears only exact invalid/future/legacy bytes', () => {
    for (const raw of [invalid, future, legacy]) {
      const storage = memoryStorage({ [pendingKey]: raw }); const controller = createRecoveryController(storage); const snapshot = controller.load();
      expect(controller.discardQuarantine(snapshot.raw!)).toMatchObject({ blocked: false, pending: null });
      expect(storage.raw(pendingKey)).toBeNull();
    }
  });

  it('resolves legacy only with complete validated context and does not copy signature fields', () => {
    const storage = memoryStorage({ [pendingKey]: legacy }); const controller = createRecoveryController(storage); const snapshot = controller.load();
    expect(() => controller.resolveLegacy(snapshot.raw!, { ...intent, account: token })).toThrowError(expect.objectContaining({ code: 'LEGACY_CONTEXT' }));
    const resolved = controller.resolveLegacy(snapshot.raw!, intent);
    expect(resolved).toMatchObject({ version: 2, intent, hash, started: 123 });
    expect(JSON.stringify(resolved)).not.toContain('signature');
  });

  it('strict IDs and hashes reject a final line terminator', () => {
    const valid = { version: 2, id: 'valid_id', stage: 'preparing', intent, started: 10 };
    for (const ending of ['\n', '\r', '\u2028', '\u2029']) {
      expect(() => parsePendingOperation(JSON.stringify({ ...valid, id: `bad${ending}` }))).toThrow();
    }
    expect(validTransactionHash(`${hash}\n`)).toBe(false);
    expect(validTransactionHash(hash)).toBe(true);
  });

  it('lease fails closed when unsupported and distinguishes busy from acquired lock', async () => {
    const { withRecoveryLease } = await import('../../src/application/recovery');
    await expect(withRecoveryLease(async () => 1, pendingKey, null)).rejects.toMatchObject({ code: 'LEASE_UNAVAILABLE' });
    const busy = { request: async <T>(_name: string, _options: unknown, callback: (lock: unknown | null) => Promise<T>): Promise<T> => callback(null) };
    await expect(withRecoveryLease(async () => 1, pendingKey, busy)).rejects.toMatchObject({ code: 'LEASE_BUSY' });
    const locks = { request: async <T>(_name: string, options: unknown, callback: (lock: unknown | null) => Promise<T>): Promise<T> => { expect(options).toMatchObject({ mode: 'exclusive', ifAvailable: true }); return callback({}); } };
    await expect(withRecoveryLease(async () => 7, pendingKey, locks)).resolves.toBe(7);
  });
});

describe('known completion and idempotent contextual history', () => {
  function ready(storage = memoryStorage()) {
    const controller = createRecoveryController(storage); const pending = controller.begin(intent); controller.setHash(pending.id, hash);
    return { storage, controller, pending };
  }
  it('keeps success known through history and cleanup failures and makes replay idempotent', () => {
    const { storage, controller, pending } = ready();
    storage.failSet(true);
    const result = controller.complete(pending.id, receipt());
    expect(result).toMatchObject({ pending: null, confirmed: { status: 'success' }, warning: expect.any(String) });
    storage.failSet(false);
    expect(controller.complete(pending.id, receipt())).toMatchObject({ confirmed: { status: 'success' } });
    const history = loadConfirmedActivity(storage, { chainId: 31337, coreAddress: core });
    expect(history).toHaveLength(1); expect(history[0]).toMatchObject({ version: 2, operationId: pending.id, hash, time: expect.any(Number) });
    expect(isLegacyActivity(history[0])).toBe(false);
  });

  it('records known revert only when contextual failure binds exact intent; never records mismatch/replaced/cancelled', () => {
    const failure = receipt({ status: 'failure', error: { code: 'TRANSACTION_REVERTED', message: 'reverted' } as never });
    const bound = ready();
    expect(bound.controller.complete(bound.pending.id, failure)).toMatchObject({ pending: null, confirmed: { status: 'failure' } });
    expect(loadConfirmedActivity(bound.storage, { chainId: 31337, coreAddress: core })).toHaveLength(0);
    for (const code of ['RECEIPT_MISMATCH', 'TRANSACTION_REPLACED', 'TRANSACTION_CANCELLED']) {
      const test = ready();
      const unsafe = receipt({ status: 'failure', error: { code, message: code } as never });
      expect(() => test.controller.complete(test.pending.id, unsafe)).toThrowError(expect.objectContaining({ code: 'RECEIPT_MISMATCH' }));
      expect(test.storage.raw(pendingKey)).not.toBeNull();
      expect(loadConfirmedActivity(test.storage, { chainId: 31337, coreAddress: core })).toHaveLength(0);
    }
  });

  it('retains receipt success when pending cleanup throws and never deletes replacement operation', () => {
    const test = ready(); test.storage.failRemove(true);
    const retained = test.controller.complete(test.pending.id, receipt());
    expect(retained).toMatchObject({ pending: null, confirmed: { status: 'success' }, blocked: true, warning: expect.any(String) });
    const raw = test.storage.raw(pendingKey)!; expect(raw).toContain(test.pending.id);
    const replacement = createRecoveryController(memoryStorage({ [pendingKey]: raw })); expect(replacement.load().pending?.id).toBe(test.pending.id);
  });

  it('rejects receipt mismatch and bad programmer input without changing pending bytes', () => {
    const test = ready(); const before = test.storage.raw(pendingKey);
    expect(() => test.controller.complete(test.pending.id, receipt({ hash: `0x${'b'.repeat(64)}` as TxHash }))).toThrowError(expect.objectContaining({ code: 'RECEIPT_MISMATCH' }));
    expect(() => test.controller.complete(test.pending.id, { ...receipt(), blockNumber: -1n })).toThrowError(RecoveryError);
    expect(test.storage.raw(pendingKey)).toBe(before);
  });
});

describe('activity compatibility', () => {
  it('keeps legacy three-field entries readable and scopes the key by chain/core', () => {
    const row = { kind: 'claim', hash, time: 12345 };
    expect(parseActivity(JSON.stringify([row]))).toEqual([row]);
    const legacyStorage = memoryStorage({ 'commitpot-activity-v1:31337:0x0000000000000000000000000000000000002000': JSON.stringify([row]) });
    expect(isLegacyActivity(loadConfirmedActivity(legacyStorage, { chainId: 31337, coreAddress: core })[0])).toBe(true);
  });

  it('deduplicates contextual hash and promotes matching legacy row without exceeding 50', () => {
    const storage = memoryStorage(); const context = { chainId: 31337, coreAddress: core };
    const key = 'commitpot-activity-v1:31337:0x0000000000000000000000000000000000002000';
    storage.put(key, JSON.stringify([{ kind: 'join', hash, time: 1000 }]));
    const first = appendConfirmedActivity(storage, context, intent, 'operation_A', receipt({ blockTimestamp: 123 }));
    expect(first.activity).toHaveLength(1); expect(first.activity[0]).toMatchObject({ version: 2, operationId: 'operation_A', time: 123000, blockTimestamp: 123 });
    const second = appendConfirmedActivity(storage, context, intent, 'operation_B', receipt({ blockTimestamp: 456 }));
    expect(second.activity).toEqual(first.activity);
    const many = Array.from({ length: 51 }, (_, i) => ({ ...first.activity[0], hash: `0x${String(i).padStart(64, '0')}` }));
    storage.put(key, JSON.stringify(many.slice(0, 50)));
    const bounded = appendConfirmedActivity(storage, context, intent, 'new_op', receipt({ hash: `0x${'c'.repeat(64)}` as TxHash }));
    expect(bounded.activity).toHaveLength(50);
  });

  it('preserves invalid/future history bytes rather than overwriting', () => {
    const storage = memoryStorage(); const context = { chainId: 31337, coreAddress: core };
    const key = 'commitpot-activity-v1:31337:0x0000000000000000000000000000000000002000';
    for (const raw of ['{invalid', JSON.stringify([{ version: 9 }])]) {
      storage.put(key, raw);
      const result = appendConfirmedActivity(storage, context, intent, 'op', receipt());
      expect(result.warning).toMatch(/preserved/); expect(storage.raw(key)).toBe(raw);
    }
  });
});
