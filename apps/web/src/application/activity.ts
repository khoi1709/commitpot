import { normalizeAddress, type Address, type ChainContext, type OperationIntent, type TransactionReceipt, type TxHash } from '../domain';
import type { OperationKind } from './pending';

export interface LegacyConfirmedActivity { version?: 1; kind: OperationKind; hash: TxHash; time: number }
export interface ContextualConfirmedActivity extends Omit<LegacyConfirmedActivity, 'version'> {
  version: 2;
  operationId: string;
  chainId: number;
  coreAddress: Address;
  from: Address;
  to: Address;
  potId?: string;
  beneficiary?: Address;
  amount?: string;
  blockNumber: string;
  blockTimestamp?: number;
}
export type ConfirmedActivity = LegacyConfirmedActivity | ContextualConfirmedActivity;
export type ActivityStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const ACTIVITY_LIMIT = 50;
export const activityStorageKey = (context: ChainContext | Pick<ChainContext, 'chainId' | 'coreAddress'>) => `commitpot-activity-v1:${context.chainId}:${context.coreAddress.toLowerCase()}`;

function kind(value: unknown): value is OperationKind {
  return value === 'create' || value === 'approve' || value === 'join' || value === 'checkIn' || value === 'finalize' || value === 'claim';
}
function decimal(value: unknown, positive = false): value is string {
  if (typeof value !== 'string' || !(/^(0|[1-9]\d{0,77})(?![\s\S])/.test(value))) return false;
  const number = BigInt(value);
  return number < (1n << 256n) && (!positive || number > 0n);
}
function timestamp(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function address(value: unknown): value is Address {
  if (typeof value !== 'string' || value.length !== 42 || !/^0x[0-9a-fA-F]{40}$/.test(value)) return false;
  try { normalizeAddress(value); return true; } catch { return false; }
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function legacy(value: Record<string, unknown>): value is Record<string, unknown> & LegacyConfirmedActivity {
  return Object.keys(value).every(key => ['kind', 'hash', 'time', 'version'].includes(key))
    && (value.version === undefined || value.version === 1)
    && kind(value.kind) && typeof value.hash === 'string' && value.hash.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(value.hash)
    && Number.isSafeInteger(value.time) && Number(value.time) > 0;
}
function contextual(value: Record<string, unknown>): value is Record<string, unknown> & ContextualConfirmedActivity {
  const allowed = ['version', 'operationId', 'kind', 'hash', 'time', 'chainId', 'coreAddress', 'from', 'to', 'potId', 'beneficiary', 'amount', 'blockNumber', 'blockTimestamp'];
  if (Object.keys(value).some(key => !allowed.includes(key)) || value.version !== 2
    || typeof value.operationId !== 'string' || !(/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(value.operationId))
    || !kind(value.kind) || typeof value.hash !== 'string' || value.hash.length !== 66 || !/^0x[0-9a-fA-F]{64}$/.test(value.hash)
    || !Number.isSafeInteger(value.time) || Number(value.time) <= 0
    || !Number.isSafeInteger(value.chainId) || Number(value.chainId) <= 0
    || typeof value.blockNumber !== 'string' || !decimal(value.blockNumber)) return false;
  if (!address(value.coreAddress) || !address(value.from) || !address(value.to)
    || (value.beneficiary !== undefined && !address(value.beneficiary))) return false;
  return (value.potId === undefined || (typeof value.potId === 'string' && decimal(value.potId, true)))
    && (value.amount === undefined || (typeof value.amount === 'string' && decimal(value.amount)))
    && (value.blockTimestamp === undefined || timestamp(value.blockTimestamp));
}
function parseDetailed(raw: string | null): { entries: ConfirmedActivity[]; valid: boolean } {
  if (raw === null) return { entries: [], valid: true };
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > ACTIVITY_LIMIT || !data.every(record)) return { entries: [], valid: false };
    const entries: ConfirmedActivity[] = [];
    for (const item of data as Record<string, unknown>[]) {
      if (legacy(item)) {
        const { kind: entryKind, hash, time } = item;
        entries.push({ kind: entryKind, hash: hash as TxHash, time: Number(time) });
      } else if (contextual(item)) {
        entries.push({ ...item, coreAddress: normalizeAddress(item.coreAddress), from: normalizeAddress(item.from), to: normalizeAddress(item.to), ...(item.beneficiary === undefined ? {} : { beneficiary: normalizeAddress(item.beneficiary) }) } as ContextualConfirmedActivity);
      } else return { entries: [], valid: false };
    }
    return { entries, valid: true };
  } catch { return { entries: [], valid: false }; }
}

/** Legacy entries remain visible but are not evidence of chain/core context. */
export function isLegacyActivity(entry: ConfirmedActivity): entry is LegacyConfirmedActivity { return !('version' in entry) || entry.version !== 2; }
export function parseActivity(raw: string | null): ConfirmedActivity[] { return parseDetailed(raw).entries; }

export function loadConfirmedActivity(storage: ActivityStorage | null, context: Pick<ChainContext, 'chainId' | 'coreAddress'>): ConfirmedActivity[] {
  if (!storage) return [];
  try { return parseActivity(storage.getItem(activityStorageKey(context))); } catch { return []; }
}

export type ActivityAppendResult = Readonly<{ activity: ConfirmedActivity[]; warning?: string }>;
export function appendConfirmedActivity(
  storage: ActivityStorage | null,
  context: Pick<ChainContext, 'chainId' | 'coreAddress'>,
  intent: OperationIntent,
  operationId: string,
  receipt: TransactionReceipt,
): ActivityAppendResult {
  if (!storage) return { activity: [], warning: 'Activity storage is unavailable.' };
  const key = activityStorageKey(context);
  let raw: string | null;
  try { raw = storage.getItem(key); } catch { return { activity: [], warning: 'Activity history could not be read.' }; }
  const parsed = parseDetailed(raw);
  if (!parsed.valid) return { activity: [], warning: 'Existing activity history is invalid or from a future version; it was preserved.' };

  const hash = receipt.hash.toLowerCase() as TxHash;
  const alreadyRecorded = parsed.entries.some(entry => !isLegacyActivity(entry)
    && entry.hash.toLowerCase() === hash && entry.chainId === context.chainId
    && entry.coreAddress.toLowerCase() === context.coreAddress.toLowerCase());
  if (alreadyRecorded) return { activity: parsed.entries };
  // A legacy row has no stored chain/core identity; this key itself scopes its promotion.
  const existing = parsed.entries.filter(entry => !(isLegacyActivity(entry) && entry.hash.toLowerCase() === hash));

  const operationKind = intent.kind;
  const potId = receipt.potId ?? (receipt.createdPotId !== undefined ? receipt.createdPotId : intent.potId === undefined ? undefined : BigInt(intent.potId));
  const beneficiary = receipt.beneficiary ?? (intent.kind === 'claim' ? intent.beneficiary : intent.kind === 'checkIn' ? intent.proof.participant : undefined);
  const amount = receipt.amount ?? (intent.kind === 'approve' ? BigInt(intent.amount) : intent.kind === 'create' ? BigInt(intent.config.stakeAmount) : intent.kind === 'claim' && intent.amount !== undefined ? BigInt(intent.amount) : undefined);
  const to = receipt.to ?? (intent.kind === 'approve' ? intent.token : intent.core);
  const chainTimeMs = receipt.blockTimestamp === undefined ? undefined : receipt.blockTimestamp * 1000;
  const time = chainTimeMs !== undefined && Number.isSafeInteger(chainTimeMs) ? chainTimeMs : Date.now();
  const entry: ContextualConfirmedActivity = {
    version: 2, operationId, kind: operationKind, hash, time, chainId: intent.chainId,
    coreAddress: intent.core, from: receipt.from ?? intent.account, to,
    ...(potId === undefined ? {} : { potId: potId.toString() }),
    ...(beneficiary === undefined ? {} : { beneficiary }),
    ...(amount === undefined ? {} : { amount: amount.toString() }),
    blockNumber: receipt.blockNumber.toString(),
    ...(receipt.blockTimestamp === undefined ? {} : { blockTimestamp: receipt.blockTimestamp }),
  };
  const next = [entry, ...existing].slice(0, ACTIVITY_LIMIT);
  const encoded = JSON.stringify(next);
  try { storage.setItem(key, encoded); } catch { /* A read-back can still establish that a throwing setter stored the bytes. */ }
  try {
    if (storage.getItem(key) === encoded) return { activity: next };
  } catch { /* Returned below as a non-fatal history warning. */ }
  return { activity: parsed.entries, warning: 'Confirmed activity could not be verified in storage.' };
}
