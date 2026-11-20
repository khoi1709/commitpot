import type { OperationStage } from './types';

export type DomainErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_ADDRESS"
  | "INVALID_HASH"
  | "INVALID_CONFIG"
  | "POT_NOT_FOUND"
  | "POT_ALREADY_FINALIZED"
  | "REGISTRATION_CLOSED"
  | "CHECK_IN_NOT_OPEN"
  | "CHECK_IN_CLOSED"
  | "NOT_JOINED"
  | "ALREADY_JOINED"
  | "ALREADY_CHECKED_IN"
  | "NONCE_REUSED"
  | "PROOF_EXPIRED"
  | "INVALID_PROOF"
  | "WRONG_VERIFIER"
  | "NOT_FINALIZED"
  | "ALREADY_CLAIMED"
  | "NOT_ELIGIBLE"
  | "INSUFFICIENT_ALLOWANCE"
  | "INSUFFICIENT_BALANCE"
  | "TRANSFER_FAILED"
  | "ACCOUNT_NOT_CONNECTED"
  | "WRONG_CHAIN"
  | "ACCOUNT_CHANGED"
  | "WALLET_REJECTED"
  | "WALLET_UNAVAILABLE"
  | "INSUFFICIENT_GAS"
  | "RPC_UNAVAILABLE"
  | "PREFLIGHT_FAILED"
  | "SUBMISSION_UNKNOWN"
  | "TRANSACTION_REVERTED"
  | "TRANSACTION_CANCELLED"
  | "TRANSACTION_REPLACED"
  | "RECEIPT_MISMATCH"
  | "CONFIRMATION_UNAVAILABLE"
  | "FINALIZE_TOO_EARLY"
  | "TRANSACTION_NOT_FOUND"
  | "STORAGE_CORRUPT"
  | "STORAGE_VERSION"
  | "STORAGE_SCHEMA";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: unknown;

  constructor(code: DomainErrorCode, message?: string, details?: unknown) {
    super(message ?? code);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

const contractErrors: Record<string, DomainErrorCode> = {
  PotNotFound: 'POT_NOT_FOUND', InvalidToken: 'INVALID_CONFIG', InvalidStake: 'INVALID_CONFIG',
  InvalidTimeWindow: 'INVALID_CONFIG', MissingCode: 'INVALID_CONFIG', AddressEmptyCode: 'INVALID_CONFIG',
  ZeroAddress: 'INVALID_ADDRESS', InvalidBeneficiary: 'INVALID_ADDRESS', RegistrationClosed: 'REGISTRATION_CLOSED',
  AlreadyJoined: 'ALREADY_JOINED', NotJoined: 'NOT_JOINED', AlreadyCheckedIn: 'ALREADY_CHECKED_IN',
  NonceAlreadyUsed: 'NONCE_REUSED', CheckInNotOpen: 'CHECK_IN_NOT_OPEN', DeadlineExpired: 'PROOF_EXPIRED',
  InvalidSignature: 'INVALID_PROOF', AlreadyClaimed: 'ALREADY_CLAIMED', NotEligible: 'NOT_ELIGIBLE',
  PotNotFinalized: 'NOT_FINALIZED', PotAlreadyFinalized: 'POT_ALREADY_FINALIZED', PotNotOpen: 'POT_ALREADY_FINALIZED',
  FinalizeTooEarly: 'FINALIZE_TOO_EARLY', TransferAmountMismatch: 'TRANSFER_FAILED',
  SafeERC20FailedOperation: 'TRANSFER_FAILED', FailedInnerCall: 'TRANSFER_FAILED',
  ERC20InsufficientAllowance: 'INSUFFICIENT_ALLOWANCE', ERC20InsufficientBalance: 'INSUFFICIENT_BALANCE',
};
function errorNodes(error: unknown): Record<string, unknown>[] {
  const queue = [error]; const seen = new Set<unknown>(); const result: Record<string, unknown>[] = [];
  while (queue.length && result.length < 20) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node); const value = node as Record<string, unknown>; result.push(value);
    queue.push(value.cause, value.error);
    if (value.data && typeof value.data === 'object') queue.push((value.data as Record<string, unknown>).originalError);
  }
  return result;
}
function originalCode(error: unknown): string | number | undefined {
  const nodes = errorNodes(error);
  if (nodes.some(node => node.code === 4001 || node.code === '4001' || node.name === 'UserRejectedRequestError')) return 4001;
  return nodes.map(node => node.code).find((code): code is string | number => typeof code === 'string' || typeof code === 'number');
}

/** Translate structured provider/contract causes, never infer safety from human text. */
export function toDomainError(error: unknown, fallback: DomainErrorCode = 'RPC_UNAVAILABLE'): DomainError {
  if (error instanceof DomainError) return error;
  const nodes = errorNodes(error);
  let code: DomainErrorCode = fallback;
  if (originalCode(error) === 4001) code = 'WALLET_REJECTED';
  else {
    for (const node of nodes) {
      const data = node.data as { errorName?: string } | undefined;
      if (data?.errorName && contractErrors[data.errorName]) { code = contractErrors[data.errorName]; break; }
      if (node.name === 'InsufficientFundsError') { code = 'INSUFFICIENT_GAS'; break; }
      if (node.name === 'ChainMismatchError' || node.code === 4901) { code = 'WRONG_CHAIN'; break; }
      if (node.code === 4100 || node.code === 4900 || node.name === 'AccountNotFoundError') { code = 'WALLET_UNAVAILABLE'; break; }
    }
  }
  const translated = new DomainError(code);
  translated.cause = error;
  return translated;
}

export class StageAwareError extends DomainError {
  readonly stage: OperationStage;
  readonly submitted: boolean | 'unknown';
  readonly originalCode?: string | number;
  constructor(error: DomainError, stage: OperationStage, submitted: boolean | 'unknown', cause: unknown = error) {
    super(error.code, error.message, error.details);
    this.name = 'StageAwareError'; this.stage = stage; this.submitted = submitted;
    this.originalCode = originalCode(cause); this.cause = cause;
  }
}

export function toStageAwareError(error: unknown, stage: OperationStage, submitted: boolean | 'unknown'): StageAwareError {
  if (error instanceof StageAwareError) return error;
  const rejected = originalCode(error) === 4001;
  const fallback = stage === 'submitting' ? (submitted === 'unknown' ? 'SUBMISSION_UNKNOWN' : 'PREFLIGHT_FAILED') : stage === 'confirming' ? 'CONFIRMATION_UNAVAILABLE' : stage === 'preflight' ? 'PREFLIGHT_FAILED' : stage === 'signing' ? 'WALLET_UNAVAILABLE' : 'RPC_UNAVAILABLE';
  let translated = toDomainError(error, fallback);
  // A provider's explicit 4001 is a definitive refusal even when nested under
  // arbitrary wrappers. Everything else thrown by wallet-send stays ambiguous;
  // simulation owns deterministic preflight classification.
  if (stage === 'submitting' && submitted === 'unknown' && !rejected) translated = new DomainError('SUBMISSION_UNKNOWN');
  const outcome = rejected && stage !== 'confirming' ? false : submitted;
  return new StageAwareError(translated, stage, outcome, error);
}
