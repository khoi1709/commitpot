import { normalizeAddress, validateOperationIntent, type ChainContext, type OperationIntent, type OperationStage, type TransactionReceipt, type TxHash } from '../domain';
import { appendConfirmedActivity, loadConfirmedActivity, type ConfirmedActivity } from './activity';
import { parsePendingOperation, PendingValidationError, PENDING_STORAGE_KEY, validTransactionHash, type LegacyPendingOperation, type PendingOperation } from './pending';

export type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type RecoveryLockManager = {
  request<T>(name: string, options: { mode: 'exclusive'; ifAvailable: true }, callback: (lock: unknown | null) => Promise<T>): Promise<T>;
};
export class RecoveryError extends Error {
  constructor(readonly code: 'STORAGE_UNAVAILABLE' | 'STORAGE_UNVERIFIED' | 'PENDING_EXISTS' | 'STALE_OPERATION' | 'LEGACY_CONTEXT' | 'INVALID_RECEIPT' | 'RECEIPT_MISMATCH' | 'LEASE_UNAVAILABLE' | 'LEASE_BUSY', message: string = code) {
    super(message); this.name = 'RecoveryError';
  }
}
export type RecoverySnapshot = Readonly<{
  pending: PendingOperation | null;
  blocked: boolean;
  warning?: string;
  raw?: string;
  confirmed?: TransactionReceipt;
  legacy?: LegacyPendingOperation;
  quarantine?: 'legacy' | 'invalid' | 'future';
  activity?: ConfirmedActivity[];
}>;
export interface RecoveryController {
  load(): RecoverySnapshot;
  begin(intent: OperationIntent): PendingOperation;
  setStage(id: string, stage: OperationStage): RecoverySnapshot;
  setHash(id: string, hash: TxHash): RecoverySnapshot;
  complete(id: string, receipt: TransactionReceipt): RecoverySnapshot;
  discard(id: string): RecoverySnapshot;
  discardQuarantine(exactRaw: string): RecoverySnapshot;
  resolveLegacy(raw: string, intent: OperationIntent): PendingOperation;
  subscribe(listener: (snapshot: RecoverySnapshot) => void): () => void;
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[A-Za-z0-9_-]{1,128}(?![\s\S])/;
let idCounter = 0;
function newId(): string {
  const cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObject && 'randomUUID' in cryptoObject) return cryptoObject.randomUUID().replace(/-/g, '');
  idCounter = (idCounter + 1) >>> 0;
  return `${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
function operationStage(stage: unknown): stage is OperationStage { return stage === 'preparing' || stage === 'signing' || stage === 'preflight' || stage === 'submitting' || stage === 'confirming'; }
function rawFor(pending: PendingOperation): string { return JSON.stringify(pending); }
function freezePending(pending: PendingOperation): PendingOperation {
  const intent = validateOperationIntent(pending.intent);
  if (intent.kind === 'create') Object.freeze(intent.config);
  if (intent.kind === 'checkIn') Object.freeze(intent.proof);
  Object.freeze(intent);
  return Object.freeze({ ...pending, intent });
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : 'Browser storage is unavailable.'; }
function sameAddress(a: string, b: string): boolean { return a.toLowerCase() === b.toLowerCase(); }
function validReceipt(input: unknown): TransactionReceipt {
  if (!isObject(input) || !validTransactionHash(input.hash) || (input.status !== 'success' && input.status !== 'failure') || typeof input.blockNumber !== 'bigint' || input.blockNumber < 0n) throw new RecoveryError('INVALID_RECEIPT', 'Invalid transaction receipt.');
  if (input.requestedHash !== undefined && !validTransactionHash(input.requestedHash)) throw new RecoveryError('INVALID_RECEIPT', 'Invalid requested transaction hash.');
  for (const field of ['chainId'] as const) if (input[field] !== undefined && (!Number.isSafeInteger(input[field]) || Number(input[field]) <= 0)) throw new RecoveryError('INVALID_RECEIPT', `Invalid receipt ${field}.`);
  for (const field of ['coreAddress', 'from', 'to', 'beneficiary'] as const) if (input[field] !== undefined) {
    try { normalizeAddress(input[field]); } catch { throw new RecoveryError('INVALID_RECEIPT', `Invalid receipt ${field}.`); }
  }
  for (const field of ['potId', 'createdPotId', 'amount'] as const) if (input[field] !== undefined && (typeof input[field] !== 'bigint' || input[field] < 0n)) throw new RecoveryError('INVALID_RECEIPT', `Invalid receipt ${field}.`);
  if (input.blockTimestamp !== undefined && (!Number.isSafeInteger(input.blockTimestamp) || Number(input.blockTimestamp) < 0)) throw new RecoveryError('INVALID_RECEIPT', 'Invalid receipt block timestamp.');
  if (input.operation !== undefined && !['create', 'approve', 'join', 'checkIn', 'finalize', 'claim'].includes(String(input.operation))) throw new RecoveryError('INVALID_RECEIPT', 'Invalid receipt operation.');
  return input as unknown as TransactionReceipt;
}
function verifyReceipt(intent: OperationIntent, pending: PendingOperation, receipt: TransactionReceipt): void {
  const requestedHash = (receipt as TransactionReceipt & { requestedHash?: TxHash }).requestedHash;
  if (!pending.hash || (receipt.hash.toLowerCase() !== pending.hash.toLowerCase() && requestedHash?.toLowerCase() !== pending.hash.toLowerCase())) throw new RecoveryError('RECEIPT_MISMATCH', 'Receipt is not for the recorded transaction.');
  const mismatch = (condition: boolean) => { if (condition) throw new RecoveryError('RECEIPT_MISMATCH', 'Receipt context does not match the pending intent.'); };
  mismatch(receipt.chainId !== undefined && receipt.chainId !== intent.chainId);
  mismatch(receipt.coreAddress !== undefined && !sameAddress(receipt.coreAddress, intent.core));
  mismatch(receipt.from !== undefined && !sameAddress(receipt.from, intent.account));
  mismatch(receipt.operation !== undefined && receipt.operation !== intent.kind);
  const expectedTo = intent.kind === 'approve' ? intent.token : intent.core;
  mismatch(receipt.to !== undefined && !sameAddress(receipt.to, expectedTo));
  if (intent.potId !== undefined) mismatch(receipt.potId !== undefined && receipt.potId.toString() !== intent.potId);
  if (intent.kind === 'create' && receipt.createdPotId !== undefined && receipt.potId !== undefined) mismatch(receipt.createdPotId !== receipt.potId);
  const expectedBeneficiary = intent.kind === 'claim' ? intent.beneficiary : intent.kind === 'checkIn' ? intent.proof.participant : undefined;
  if (expectedBeneficiary) mismatch(receipt.beneficiary !== undefined && !sameAddress(receipt.beneficiary, expectedBeneficiary));
  const expectedAmount = intent.kind === 'approve' || intent.kind === 'join' || intent.kind === 'claim'
    ? intent.amount : intent.kind === 'create' ? intent.config.stakeAmount : undefined;
  if (expectedAmount !== undefined) mismatch(receipt.amount !== undefined && receipt.amount.toString() !== expectedAmount);

  if (receipt.status === 'failure') {
    const code = receipt.error?.code;
    if (code === 'RECEIPT_MISMATCH' || code === 'TRANSACTION_REPLACED' || code === 'TRANSACTION_CANCELLED') throw new RecoveryError('RECEIPT_MISMATCH', 'Unbound transaction failure cannot settle the pending operation.');
    // Failure metadata must identify the transaction's signer, target, operation and selected chain/core.
    mismatch(receipt.chainId !== intent.chainId || !receipt.coreAddress || !sameAddress(receipt.coreAddress, intent.core)
      || !receipt.from || !sameAddress(receipt.from, intent.account) || !receipt.to || !sameAddress(receipt.to, expectedTo)
      || receipt.operation !== intent.kind || (intent.potId !== undefined && (receipt.potId === undefined || receipt.potId.toString() !== intent.potId)));
    if (expectedBeneficiary) mismatch(!receipt.beneficiary || !sameAddress(receipt.beneficiary, expectedBeneficiary));
    if (receipt.error?.code === 'TRANSACTION_REVERTED' && expectedAmount !== undefined) mismatch(receipt.amount === undefined || receipt.amount.toString() !== expectedAmount);
    // The exact-intent wait may bind calldata without repeating every decoded argument in a successful receipt.
  }
}

export function createRecoveryController(storage: RecoveryStorage | null, key = PENDING_STORAGE_KEY): RecoveryController {
  let state: RecoverySnapshot = Object.freeze({ pending: null, blocked: false, activity: [] });
  let persistedRaw: string | null = null;
  let memoryHashId: string | null = null;
  let lastCompleted: { id: string; originalHash: TxHash; hashes: string[]; receipt: TransactionReceipt; intent: OperationIntent } | undefined;
  let confirmed: TransactionReceipt | undefined;
  let listeners = new Set<(snapshot: RecoverySnapshot) => void>();
  const publish = (next: RecoverySnapshot) => {
    state = Object.freeze({ ...next, ...(next.pending ? { pending: freezePending(next.pending) } : {}), ...(next.activity ? { activity: Object.freeze([...next.activity]) as unknown as ConfirmedActivity[] } : {}) });
    listeners.forEach(listener => { try { listener(state); } catch { /* Listeners cannot change persistence outcomes. */ } });
    return state;
  };
  const setWarning = (warning: string, changes: Partial<RecoverySnapshot> = {}) => publish({ ...state, ...changes, warning });
  const storageGet = (): string | null => {
    if (!storage) throw new RecoveryError('STORAGE_UNAVAILABLE');
    return storage.getItem(key);
  };
  const parseRaw = (raw: string | null): RecoverySnapshot => {
    if (raw === null) { persistedRaw = null; return { pending: null, blocked: false, activity: state.activity ?? [] }; }
    try {
      const parsed = parsePendingOperation(raw);
      if (parsed.version !== 2) {
        persistedRaw = raw;
        return { pending: null, legacy: parsed, blocked: true, raw, quarantine: 'legacy', warning: 'A legacy transaction is quarantined until its complete intent is verified.', activity: state.activity ?? [] };
      }
      persistedRaw = raw;
      return { pending: freezePending(parsed), blocked: false, raw, activity: loadConfirmedActivity(storage, { chainId: parsed.intent.chainId, coreAddress: parsed.intent.core }), ...(confirmed ? { confirmed } : {}) };
    } catch (error) {
      persistedRaw = raw;
      const future = error instanceof PendingValidationError && error.reason === 'future';
      return { pending: null, blocked: true, raw, quarantine: future ? 'future' : 'invalid', warning: future ? 'A future transaction record is quarantined and preserved.' : 'An invalid transaction record is quarantined and preserved.', activity: state.activity ?? [] };
    }
  };
  const load = (): RecoverySnapshot => {
    let raw: string | null;
    try { raw = storageGet(); }
    catch (error) {
      if (state.pending?.hash) return setWarning(`Known transaction hash is retained in memory; storage could not be read: ${errorText(error)}`, { blocked: true });
      return publish({ pending: state.pending, blocked: true, ...(state.raw === undefined ? {} : { raw: state.raw }), warning: `Recovery storage is unavailable: ${errorText(error)}`, ...(state.legacy ? { legacy: state.legacy, quarantine: state.quarantine } : {}), ...(confirmed ? { confirmed } : {}), activity: state.activity ?? [] });
    }
    if (memoryHashId && state.pending?.id === memoryHashId && state.pending.hash) {
      const expected = rawFor(state.pending);
      if (raw !== expected) return setWarning('Known transaction hash is retained in memory; stored bytes changed or do not include the known hash.', { blocked: true, raw: raw ?? undefined });
      memoryHashId = null;
    }
    const next = parseRaw(raw);
    if (confirmed) return publish({ ...next, confirmed });
    return publish(next);
  };
  const writeVerified = (raw: string): boolean => {
    if (!storage) return false;
    try { storage.setItem(key, raw); } catch { /* Verify the bytes below; some storage shims throw after writing. */ }
    try {
      const stored = storage.getItem(key);
      if (stored === raw) { persistedRaw = raw; return true; }
    } catch { /* Fail closed. */ }
    return false;
  };
  const checkCurrentRaw = (): string | null | undefined => {
    try { return storageGet(); } catch { return undefined; }
  };
  const ensureCurrent = (id: string): PendingOperation => {
    const pending = state.pending;
    if (!pending || pending.id !== id) throw new RecoveryError('STALE_OPERATION', 'Pending operation ID is no longer current.');
    return pending;
  };
  const currentWrite = (pending: PendingOperation, next: PendingOperation, preHash: boolean): RecoverySnapshot => {
    const raw = checkCurrentRaw();
    if (raw === undefined || raw !== persistedRaw) {
      if (preHash) {
        publish({ ...state, blocked: true, warning: 'Pending bytes changed or storage cannot be verified; no wallet operation may start.' });
        throw new RecoveryError('STORAGE_UNVERIFIED', 'Pending bytes changed or storage cannot be verified.');
      }
      if (next.hash) memoryHashId = next.id;
      return setWarning('Transaction hash is known but storage could not be verified; do not close or reload this page.', { pending: next, blocked: true });
    }
    const encoded = rawFor(next);
    if (!writeVerified(encoded)) {
      if (preHash) throw new RecoveryError('STORAGE_UNVERIFIED', 'Pending transaction could not be verified in storage.');
      memoryHashId = next.hash ? next.id : memoryHashId;
      return setWarning('Transaction hash is known but storage could not be verified; do not close or reload this page.', { pending: next, blocked: true });
    }
    persistedRaw = encoded;
    if (next.hash) memoryHashId = next.id;
    return publish({ ...state, pending: next, blocked: false, raw: encoded, warning: undefined, legacy: undefined, quarantine: undefined });
  };

  // Scan once without making construction dependent on any storage method.
  load();
  return {
    load,
    begin(intentInput) {
      const current = load();
      if (current.blocked) throw new RecoveryError(storage ? 'STORAGE_UNVERIFIED' : 'STORAGE_UNAVAILABLE', current.warning ?? 'Recovery storage is not safe for a new operation.');
      if (current.pending || current.legacy || current.raw !== undefined) throw new RecoveryError('PENDING_EXISTS', 'Resolve the existing transaction before starting another.');
      let intent: OperationIntent;
      try { intent = validateOperationIntent(intentInput); } catch (error) { throw error; }
      const id = newId();
      if (!idPattern.test(id)) throw new RecoveryError('INVALID_RECEIPT', 'Unable to create a valid operation ID.');
      const pending = freezePending({ version: 2, id, stage: 'preparing', intent, started: Date.now() });
      const raw = rawFor(pending);
      if (!writeVerified(raw)) {
        state = Object.freeze({ ...state, pending: null, blocked: true, warning: 'Pending intent could not be verified in storage; no wallet operation may start.' });
        throw new RecoveryError('STORAGE_UNVERIFIED', state.warning);
      }
      persistedRaw = raw;
      publish({ pending, blocked: false, raw, activity: state.activity ?? [] });
      return pending;
    },
    setStage(id, stage) {
      if (!operationStage(stage)) throw new RecoveryError('STALE_OPERATION', 'Invalid operation stage.');
      const pending = ensureCurrent(id);
      const next = freezePending({ ...pending, stage });
      return currentWrite(pending, next, !pending.hash);
    },
    setHash(id, hash) {
      if (!validTransactionHash(hash)) throw new RecoveryError('INVALID_RECEIPT', 'Invalid transaction hash.');
      const pending = ensureCurrent(id);
      return currentWrite(pending, freezePending({ ...pending, stage: 'confirming', hash }), false);
    },
    complete(id, receiptInput) {
      const receipt = validReceipt(receiptInput);
      const pending = state.pending?.id === id ? state.pending : undefined;
      if (!pending) {
        if (lastCompleted?.id === id && lastCompleted.hashes.some(hash => hash.toLowerCase() === receipt.hash.toLowerCase())) {
          confirmed = lastCompleted.receipt;
          if (receipt.status === 'success') {
            const appended = appendConfirmedActivity(storage, { chainId: lastCompleted.intent.chainId, coreAddress: lastCompleted.intent.core }, lastCompleted.intent, id, lastCompleted.receipt);
            if (!appended.warning) return publish({ ...state, confirmed, warning: undefined, activity: appended.activity });
            return publish({ ...state, confirmed, warning: appended.warning, activity: state.activity ?? [] });
          }
          return publish({ ...state, confirmed, warning: state.warning, activity: state.activity ?? [] });
        }
        throw new RecoveryError('STALE_OPERATION', 'Pending operation ID is no longer current.');
      }
      verifyReceipt(pending.intent, pending, receipt);
      confirmed = receipt;
      let activity = state.activity ?? [];
      let warning: string | undefined;
      if (receipt.status === 'success') {
        try {
          const context: Pick<ChainContext, 'chainId' | 'coreAddress'> = { chainId: pending.intent.chainId, coreAddress: pending.intent.core };
          const appended = appendConfirmedActivity(storage, context, pending.intent, pending.id, receipt);
          if (!appended.warning) activity = appended.activity;
          else warning = appended.warning;
        } catch { warning = 'Confirmed activity history could not be saved.'; }
      }
      const raw = checkCurrentRaw();
      const requestedHash = (receipt as TransactionReceipt & { requestedHash?: TxHash }).requestedHash;
      const hashes = [receipt.hash, ...(requestedHash ? [requestedHash] : [])];
      if (lastCompleted?.id === id) {
        for (const hash of hashes) if (!lastCompleted.hashes.some(value => value.toLowerCase() === hash.toLowerCase())) lastCompleted.hashes.push(hash);
      } else lastCompleted = { id, originalHash: pending.hash!, hashes, receipt, intent: pending.intent };
      let blocked = false;
      let rawForSnapshot: string | undefined;
      if (raw === undefined) { warning ??= 'Receipt is known, but pending storage could not be checked or cleaned up.'; blocked = true; }
      else if (raw === persistedRaw && raw !== null) {
        try { storage?.removeItem(key); } catch { /* Read back to see whether a throwing remove still succeeded. */ }
        const after = checkCurrentRaw();
        if (after === null) { persistedRaw = null; }
        else { warning ??= 'Receipt is known, but pending cleanup could not be verified.'; blocked = true; rawForSnapshot = after ?? raw; }
      } else if (raw !== null) {
        // The key now belongs to different bytes; do not remove or overwrite it.
        warning ??= 'Receipt is known, but different pending bytes were preserved.'; blocked = true; rawForSnapshot = raw;
      } else persistedRaw = null;
      if (memoryHashId === id) memoryHashId = null;
      return publish({ pending: null, blocked, ...(warning ? { warning } : {}), ...(rawForSnapshot === undefined ? {} : { raw: rawForSnapshot }), confirmed, activity, ...(blocked && rawForSnapshot ? { quarantine: 'invalid' as const } : {}) });
    },
    discard(id) {
      const pending = ensureCurrent(id);
      const raw = checkCurrentRaw();
      if (raw === undefined || raw === null || raw !== persistedRaw) return setWarning('Pending bytes changed or could not be verified; nothing was removed.', { blocked: true });
      try { storage?.removeItem(key); } catch { /* Verify below. */ }
      const after = checkCurrentRaw();
      if (after !== null) return setWarning('Pending intent was not removed; nothing else was changed.', { blocked: true, raw: after ?? raw });
      persistedRaw = null;
      if (memoryHashId === id) memoryHashId = null;
      return publish({ pending: null, blocked: false, raw: undefined, warning: undefined, legacy: undefined, quarantine: undefined, ...(confirmed ? { confirmed } : {}), activity: state.activity ?? [] });
    },
    discardQuarantine(exactRaw) {
      if (typeof exactRaw !== 'string' || state.raw !== exactRaw || !state.blocked || !state.quarantine) throw new RecoveryError('LEGACY_CONTEXT', 'Only the exact currently quarantined bytes may be removed.');
      const raw = checkCurrentRaw();
      if (raw === undefined || raw !== exactRaw) return setWarning('Quarantined bytes changed or could not be verified; nothing was removed.', { blocked: true });
      try {
        const parsed = parsePendingOperation(raw);
        if (parsed.version === 2) throw new RecoveryError('LEGACY_CONTEXT', 'A valid v2 pending operation cannot be cleared as quarantined data.');
        if (state.quarantine !== 'legacy') throw new RecoveryError('LEGACY_CONTEXT', 'The current bytes are not invalid or future quarantined data.');
      } catch (error) {
        if (error instanceof RecoveryError) throw error;
        if (!(error instanceof PendingValidationError) || state.quarantine !== 'future' && state.quarantine !== 'invalid') throw error;
      }
      try { storage?.removeItem(key); } catch { /* Verify removal before releasing the quarantine. */ }
      const after = checkCurrentRaw();
      if (after !== null) return setWarning('Quarantined bytes were preserved because removal could not be verified.', { blocked: true, raw: after ?? exactRaw });
      persistedRaw = null;
      memoryHashId = null;
      return publish({ pending: null, blocked: false, activity: state.activity ?? [], warning: undefined, raw: undefined, legacy: undefined, quarantine: undefined, ...(confirmed ? { confirmed } : {}) });
    },
    resolveLegacy(exactRaw, intentInput) {
      const raw = checkCurrentRaw();
      if (!storage || raw === undefined || raw !== exactRaw || state.raw !== exactRaw || state.quarantine !== 'legacy' || !state.legacy) throw new RecoveryError('LEGACY_CONTEXT', 'Legacy bytes are no longer the exact quarantined record.');
      const legacy = state.legacy;
      let intent: OperationIntent;
      try { intent = validateOperationIntent(intentInput); } catch (error) { throw error; }
      if (!legacy.account || !sameAddress(legacy.account, intent.account) || legacy.chainId !== intent.chainId || !sameAddress(legacy.core, intent.core)
        || legacy.kind !== intent.kind || (legacy.potId !== undefined && intent.potId !== legacy.potId)) throw new RecoveryError('LEGACY_CONTEXT', 'The supplied complete intent does not match the known legacy context.');
      if (legacy.hash && !validTransactionHash(legacy.hash)) throw new RecoveryError('LEGACY_CONTEXT', 'Legacy transaction hash is invalid.');
      const pending = freezePending({ version: 2, id: newId(), stage: legacy.hash ? 'confirming' : 'submitting', intent, ...(legacy.hash ? { hash: legacy.hash } : {}), started: legacy.started });
      const encoded = rawFor(pending);
      if (!writeVerified(encoded)) throw new RecoveryError('STORAGE_UNVERIFIED', 'Resolved intent could not be verified in storage.');
      persistedRaw = encoded;
      if (pending.hash) memoryHashId = pending.id;
      publish({ pending, blocked: false, raw: encoded, warning: undefined, legacy: undefined, quarantine: undefined, activity: loadConfirmedActivity(storage, { chainId: intent.chainId, coreAddress: intent.core }) });
      return pending;
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export async function withRecoveryLease<T>(run: () => Promise<T>, key = PENDING_STORAGE_KEY, locks?: RecoveryLockManager | null): Promise<T> {
  let manager = locks;
  if (manager === undefined) {
    try { manager = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: RecoveryLockManager }).locks ?? null : null; }
    catch { manager = null; }
  }
  if (!manager || typeof manager.request !== 'function') throw new RecoveryError('LEASE_UNAVAILABLE', 'This browser does not provide an exclusive recovery lease.');
  let entered = false;
  try {
    return await manager.request(key, { mode: 'exclusive', ifAvailable: true }, async lock => {
      entered = true;
      if (!lock) throw new RecoveryError('LEASE_BUSY', 'Another tab is already handling this transaction.');
      return run();
    });
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    if (!entered) throw new RecoveryError('LEASE_UNAVAILABLE', 'The browser could not acquire a recovery lease.');
    throw error;
  }
}

export function getBrowserStorage(): RecoveryStorage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
export function readPreference(storage: RecoveryStorage | null, key: string): string | null {
  if (!storage) return null;
  try { return storage.getItem(key); } catch { return null; }
}
export function writePreference(storage: RecoveryStorage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try { storage.setItem(key, value); return storage.getItem(key) === value; } catch { return false; }
}
