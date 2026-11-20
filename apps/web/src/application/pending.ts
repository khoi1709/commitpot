import { normalizeAddress, parsePotId, validateOperationIntent, type Address, type ChainContext, type OperationIntent, type OperationStage, type TxHash } from '../domain';

export type OperationKind = OperationIntent['kind'];
export interface PendingOperation { version: 2; id: string; stage: OperationStage; intent: OperationIntent; hash?: TxHash; started: number }
export interface LegacyPendingOperation { version?: 1; kind: OperationKind; potId?: string; account: Address | null; chainId: number; core: Address; hash?: TxHash; started: number }
export const PENDING_STORAGE_KEY = 'commitpot-pending-v1';
export const operationStages: readonly OperationStage[] = ['preparing', 'signing', 'preflight', 'submitting', 'confirming'];
const kinds: readonly OperationKind[] = ['create', 'approve', 'join', 'checkIn', 'finalize', 'claim'];

export class PendingValidationError extends Error {
  constructor(readonly reason: 'invalid' | 'future') { super(reason === 'future' ? 'Unsupported pending transaction version' : 'Invalid pending transaction'); this.name = 'PendingValidationError'; }
}
export function validTransactionHash(value: unknown): value is TxHash { return typeof value === 'string' && value.length === 66 && /^0x[0-9a-fA-F]{64}$/.test(value); }

/** Legacy records remain incomplete evidence; only a v2 intent can be reconciled exactly. */
export function parsePendingOperation(raw: string): PendingOperation | LegacyPendingOperation {
  try {
    if (raw.length > 16_384) throw new PendingValidationError('invalid');
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PendingValidationError('invalid');
    const value = data as Record<string, unknown>;
    if (typeof value.version === 'number' && value.version > 2) throw new PendingValidationError('future');
    if (!Number.isSafeInteger(value.started) || Number(value.started) < 0 || (value.hash !== undefined && !validTransactionHash(value.hash))) throw new PendingValidationError('invalid');
    const timing = { started: Number(value.started), ...(value.hash === undefined ? {} : { hash: value.hash as TxHash }) };
    if (value.version === 2) {
      if (Object.keys(value).some(key => !['version', 'id', 'stage', 'intent', 'hash', 'started'].includes(key)) || typeof value.id !== 'string' || !(/^[A-Za-z0-9_-]{1,128}(?![\s\S])/.test(value.id)) || !operationStages.includes(value.stage as OperationStage) || (value.hash !== undefined && value.stage !== 'confirming')) throw new PendingValidationError('invalid');
      return { version: 2, id: value.id, stage: value.stage as OperationStage, intent: validateOperationIntent(value.intent), ...timing };
    }
    if (value.version !== undefined && value.version !== 1) throw new PendingValidationError('invalid');
    if (Object.keys(value).some(key => !['version', 'kind', 'potId', 'account', 'chainId', 'core', 'hash', 'started'].includes(key)) || !kinds.includes(value.kind as OperationKind) || !Number.isSafeInteger(value.chainId) || Number(value.chainId) <= 0) throw new PendingValidationError('invalid');
    const core = normalizeAddress(value.core);
    const account = value.account === null ? null : normalizeAddress(value.account);
    if (value.potId !== undefined) { if (typeof value.potId !== 'string') throw new PendingValidationError('invalid'); parsePotId(value.potId); }
    return { ...(value.version === 1 ? { version: 1 as const } : {}), kind: value.kind as OperationKind, chainId: Number(value.chainId), core, account, ...(value.potId === undefined ? {} : { potId: value.potId as string }), ...timing };
  } catch (error) { if (error instanceof PendingValidationError) throw error; throw new PendingValidationError('invalid'); }
}
export function matchesPendingContext(pending: PendingOperation | LegacyPendingOperation, context: ChainContext): boolean {
  const identity = pending.version === 2 ? pending.intent : pending;
  return identity.chainId === context.chainId && identity.core.toLowerCase() === context.coreAddress.toLowerCase();
}
