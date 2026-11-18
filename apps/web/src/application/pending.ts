import { normalizeAddress, parsePotId, type Address, type ChainContext, type TxHash } from '../domain';
export type OperationKind = 'create' | 'approve' | 'join' | 'checkIn' | 'finalize' | 'claim';
export interface PendingOperation { kind: OperationKind; potId?: string; account: Address | null; chainId: number; core: Address; hash?: TxHash; started: number }
export function parsePendingOperation(raw: string): PendingOperation {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid pending transaction');
  const value = data as Record<string, unknown>;
  if (!['create', 'approve', 'join', 'checkIn', 'finalize', 'claim'].includes(String(value.kind)) || !Number.isSafeInteger(value.chainId) || Number(value.chainId) <= 0 || !Number.isSafeInteger(value.started) || Number(value.started) < 0) throw new Error('Invalid pending context');
  const core = normalizeAddress(value.core);
  const account = value.account === null ? null : normalizeAddress(value.account);
  if (value.potId !== undefined) parsePotId(String(value.potId));
  if (value.hash !== undefined && (typeof value.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value.hash))) throw new Error('Invalid transaction hash');
  return { kind: value.kind as OperationKind, chainId: Number(value.chainId), started: Number(value.started), core, account, ...(value.potId === undefined ? {} : { potId: String(value.potId) }), ...(value.hash === undefined ? {} : { hash: value.hash as TxHash }) };
}
export function matchesPendingContext(pending: PendingOperation, context: ChainContext): boolean {
  return pending.chainId === context.chainId && pending.core.toLowerCase() === context.coreAddress.toLowerCase();
}
