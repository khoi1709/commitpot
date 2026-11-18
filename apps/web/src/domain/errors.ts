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
