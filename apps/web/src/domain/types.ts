import { DomainError } from './errors';
import { MAX_UINT256 } from './amounts';
import { normalizeAddress, validatePotConfig, validateTimestamp } from './rules';

export type Address = `0x${string}`;
export type TxHash = `0x${string}`;
export type PotId = bigint;

export type PotStatus = 'OPEN' | 'FINALIZED';
export type RuntimeMode = 'mock' | 'local' | 'fuji';

export interface PotConfig {
  token: Address;
  verifier: Address;
  stakeAmount: bigint;
  registrationClose: number;
  checkInOpen: number;
  checkInClose: number;
}

export interface PotSummary {
  id: PotId;
  config: PotConfig;
  status: PotStatus;
  participantCount: bigint;
  checkedInCount: bigint;
  payoutPerWinner: bigint;
  dustAmount: bigint;
}

export interface ParticipantStatus {
  joined: boolean;
  checkedIn: boolean;
  claimed: boolean;
  order: bigint;
  claimable: bigint;
}

export interface CheckInProof {
  potId: PotId;
  participant: Address;
  nonce: bigint;
  deadline: number;
  signature: `0x${string}`;
}

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface ChainContext {
  chainId: number;
  coreAddress: Address;
  token: Address;
  mode: RuntimeMode;
}

export interface WalletConnection {
  connected: boolean;
  address: Address | null;
  chainId: number | null;
  mode: RuntimeMode;
}

export type OperationStage = 'preparing' | 'signing' | 'preflight' | 'submitting' | 'confirming';
export interface OperationContext {
  account: Address;
  chainId: number;
  onStage?: (stage: OperationStage) => void;
}
export type OperationConfig = Omit<PotConfig, 'stakeAmount'> & { stakeAmount: string };
interface IntentFields {
  account: Address;
  chainId: number;
  core: Address;
  potId?: string;
  token?: Address;
  amount?: string;
  beneficiary?: Address;
  config?: OperationConfig;
  proof?: { participant: Address; nonce: string; deadline: number };
}
/** Public, JSON-safe arguments only. Never include signature bytes or private keys. */
export type OperationIntent = IntentFields & (
  | { kind: 'create'; config: OperationConfig }
  | { kind: 'approve'; token: Address; amount: string }
  | { kind: 'join'; potId: string }
  | { kind: 'checkIn'; potId: string; proof: NonNullable<IntentFields['proof']> }
  | { kind: 'finalize'; potId: string }
  | { kind: 'claim'; potId: string; beneficiary: Address }
);

/** Validate untrusted persisted intent and return a canonical, secret-free copy. */
export function validateOperationIntent(input: unknown): OperationIntent {
  const invalid = (): never => { throw new DomainError('INVALID_ARGUMENT', 'Invalid operation intent'); };
  const object = (value: unknown, keys: string[]): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return invalid();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !keys.includes(key)) return invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor) || descriptor.value === undefined) return invalid();
    }
    return value as Record<string, unknown>;
  };
  const decimal = (value: unknown, positive = false): string => {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,77})(?![\s\S])/.test(value)) return invalid();
    const n = BigInt(value); if (n > MAX_UINT256 || (positive && n === 0n)) return invalid(); return value;
  };
  const value = object(input, ['kind', 'account', 'chainId', 'core', 'potId', 'token', 'amount', 'beneficiary', 'config', 'proof']);
  if (!Number.isSafeInteger(value.chainId) || Number(value.chainId) <= 0) return invalid();
  const base = { account: normalizeAddress(value.account), chainId: Number(value.chainId), core: normalizeAddress(value.core) };
  const extras = {
    ...(value.token === undefined ? {} : { token: normalizeAddress(value.token) }),
    ...(value.amount === undefined ? {} : { amount: decimal(value.amount) }),
    ...(value.beneficiary === undefined ? {} : { beneficiary: normalizeAddress(value.beneficiary) }),
  };
  if (value.kind === 'create') {
    if (value.potId !== undefined || value.proof !== undefined || value.beneficiary !== undefined) return invalid();
    const config = object(value.config, ['token', 'verifier', 'stakeAmount', 'registrationClose', 'checkInOpen', 'checkInClose']);
    const normalized = { token: normalizeAddress(config.token), verifier: normalizeAddress(config.verifier), stakeAmount: decimal(config.stakeAmount, true), registrationClose: config.registrationClose as number, checkInOpen: config.checkInOpen as number, checkInClose: config.checkInClose as number };
    validatePotConfig({ ...normalized, stakeAmount: BigInt(normalized.stakeAmount) }, 0);
    if ((extras.token && extras.token !== normalized.token) || (extras.amount !== undefined && extras.amount !== normalized.stakeAmount)) return invalid();
    return { ...base, ...extras, kind: 'create', config: normalized };
  }
  if (value.config !== undefined) return invalid();
  if (value.kind === 'approve') {
    if (value.potId !== undefined || value.proof !== undefined || value.beneficiary !== undefined) return invalid();
    return { ...base, kind: 'approve', token: normalizeAddress(value.token), amount: decimal(value.amount) };
  }
  const potId = decimal(value.potId, true);
  if (value.kind === 'checkIn') {
    const proof = object(value.proof, ['participant', 'nonce', 'deadline']);
    validateTimestamp(proof.deadline as number);
    const participant = normalizeAddress(proof.participant);
    if (value.amount !== undefined || (extras.beneficiary && extras.beneficiary !== participant)) return invalid();
    return { ...base, ...extras, kind: 'checkIn', potId, proof: { participant, nonce: decimal(proof.nonce), deadline: proof.deadline as number } };
  }
  if (value.proof !== undefined) return invalid();
  if (value.kind === 'claim') return { ...base, ...extras, kind: 'claim', potId, beneficiary: normalizeAddress(value.beneficiary) };
  if (value.beneficiary !== undefined || (value.kind === 'finalize' && value.amount !== undefined)) return invalid();
  if (value.kind === 'join' || value.kind === 'finalize') return { ...base, ...extras, kind: value.kind, potId };
  return invalid();
}

/** Every specified expected field must equal the actual decoded operation. */
export function operationIntentsMatch(actual: OperationIntent, expected: OperationIntent): boolean {
  const a = validateOperationIntent(actual); const e = validateOperationIntent(expected);
  const equal = (left: unknown, right: unknown): boolean => {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, i) => equal(value, right[i]));
    const leftKeys = Object.keys(left).sort(); const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, i) => key === rightKeys[i] && equal((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
  };
  return (Object.keys(e) as (keyof OperationIntent)[]).every(key => equal(a[key], e[key]));
}

export interface TransactionReceipt {
  hash: TxHash;
  status: 'success' | 'failure';
  blockNumber: bigint;
  createdPotId?: PotId;
  chainId?: number;
  coreAddress?: Address;
  from?: Address;
  to?: Address;
  operation?: OperationIntent['kind'];
  potId?: PotId;
  beneficiary?: Address;
  amount?: bigint;
  /** Original hash requested by a caller when a verified identical replacement was repriced. */
  requestedHash?: TxHash;
  blockTimestamp?: number;
  error?: import('./errors').DomainError;
}

export interface CheckInSigningInput {
  potId: PotId;
  participant: Address;
  nonce: bigint;
  deadline: number;
}

export interface ICheckInSignatureVerifier {
  verify(expectedSigner: Address, proof: CheckInProof, context: ChainContext): boolean;
}
