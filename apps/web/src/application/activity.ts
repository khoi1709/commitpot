import type { OperationKind } from './pending';
import type { ChainContext, TxHash } from '../domain';
export interface ConfirmedActivity { kind: OperationKind; hash: TxHash; time: number }
export const activityStorageKey = (context: ChainContext) => `commitpot-activity-v1:${context.chainId}:${context.coreAddress.toLowerCase()}`;
export function parseActivity(raw: string | null): ConfirmedActivity[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > 6) return [];
    return data.filter((item): item is ConfirmedActivity => !!item && typeof item === 'object' && ['create', 'approve', 'join', 'checkIn', 'finalize', 'claim'].includes(item.kind) && typeof item.hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(item.hash) && Number.isSafeInteger(item.time) && item.time > 0);
  } catch { return []; }
}
