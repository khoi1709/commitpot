# CommitPot domain API (v1 baseline with current additive protocol)

## Current candidate additions

The baseline models/financial rules below are retained. Current code adds `OperationStage = 'preparing' | 'signing' | 'preflight' | 'submitting' | 'confirming'` and optional final `OperationContext { account: Address; chainId: number; onStage?: (stage: OperationStage) => void }` to repository writes, approval and signing. Existing one-argument calls remain valid; App uses explicit captured contexts. `waitForTransaction(hash, intent?: OperationIntent)` validates the actual chain transaction against the expected public JSON-safe operation; full intent fields depend on kind, including create config or check-in participant/nonce/deadline. `validateOperationIntent` rejects unknown/secret/noncanonical fields, detaches and normalizes values; `operationIntentsMatch` binds all specified expected fields. Neither persisted intent nor activity contains signature bytes/private keys.

`IWalletPort.getNativeBalance(address?): Promise<bigint | null>` returns native base units or unavailable, not an estimated fee. `StageAwareError` retains `stage`, `submitted: boolean | 'unknown'`, structured provider code and cause; proof signing alone is never a broadcast. A known preflight/rejection can retire an own hashless intent; unknown sends retain recovery data. Receipt context may additionally contain chain/core/from/to/operation/pot/beneficiary/amount/block timestamp and `requestedHash` only for a validated equivalent repricing. Actual effective receipt hash stays in `hash`.

Current exact definitions live in [types](<../apps/web/src/domain/types.ts>), [ports](<../apps/web/src/domain/ports.ts>) and [stage errors](<../apps/web/src/domain/errors.ts>). Application recovery v2 and Web Lock coordination live in [recovery](<../apps/web/src/application/recovery.ts>), separate from this pure domain. Historical v1 pending bytes remain incomplete/quarantined evidence, not automatically upgraded or replayed. See [current seam decisions](<improvements/luna/API_DECISIONS.md>) for R3 public reader/R4 receipt/R5 quarantine semantics. This additive API paragraph reflects inspected current source; it is not a claim of public deployment or formal certification.

This document is the stable frontend boundary for the attendance-commitment MVP. It is provider/browser independent: consumers import from `apps/web/src/domain/index.ts`, while mock-only implementation is under `apps/web/src/infrastructure/mock/`. The mock is synthetic local state; it is not a wallet, a chain, or cryptographic proof of attendance.

## Value conventions

- `Address` and `TxHash` are branded-looking TypeScript template-literal types (`0x` plus hexadecimal text). Runtime boundaries validate 20-byte addresses and 32-byte transaction hashes.
- Domain money, counts, pot IDs, nonces and check-in orders are `bigint`. URL/QR/storage adapters convert IDs to decimal strings with `parsePotId`/`potIdToString`; JSON never serializes a bare bigint.
- Timestamps are integer Unix seconds (`number`) and are compared with inclusive/exclusive rules below.
- Token amounts use the token's smallest unit. The standard synthetic mock token is USDC with six decimals (`10_000_000n` is 10 USDC).

## Stable models

```ts
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
export interface TokenInfo { address: Address; symbol: string; decimals: number; }
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
export interface TransactionReceipt {
  hash: TxHash;
  status: 'success' | 'failure';
  blockNumber: bigint;
  createdPotId?: PotId;
  error?: DomainError;
}
```

`ParticipantStatus.claimable` is zero until finalization. For `checkedInCount > 0`, only checked-in participants are eligible and the first `dustAmount` check-in orders receive one smallest-unit extra. For `checkedInCount === 0`, every joined participant receives the fixed stake refund. A pot with no participants has no claims.

## Ports

```ts
export interface IPotRepository {
  getPot(potId: PotId): Promise<PotSummary>;
  getParticipantStatus(potId: PotId, participant: Address): Promise<ParticipantStatus>;
  getTokenInfo(): Promise<TokenInfo>;
  getChainTimestamp(): Promise<number>;
  listPots(): Promise<PotSummary[]>;
  getChainContext(): Promise<ChainContext>;

  createPot(config: PotConfig): Promise<TxHash>;
  joinPot(potId: PotId): Promise<TxHash>;
  submitCheckIn(proof: CheckInProof): Promise<TxHash>;
  finalizePot(potId: PotId): Promise<TxHash>;
  claimPayout(potId: PotId, beneficiary: Address): Promise<TxHash>;
  waitForTransaction(hash: TxHash): Promise<TransactionReceipt>;
}

export interface IWalletPort {
  getConnection(): Promise<WalletConnection>;
  getTokenBalance(address?: Address): Promise<bigint>;
  getTokenAllowance(owner?: Address, spender?: Address): Promise<bigint>;
  approveToken(amount: bigint): Promise<TxHash>;
  signCheckIn(input: CheckInSigningInput): Promise<CheckInProof>;
}
export interface CheckInSigningInput {
  potId: PotId;
  participant: Address;
  nonce: bigint;
  deadline: number;
}
```

Writes return a transaction hash immediately after the local/provider operation has been accepted. Consumers must call `waitForTransaction`, then re-read state. A receipt can include the created pot ID for `createPot`. Pending intent/unknown-outcome handling belongs to the application boundary, not this pure domain package.

## Pure rules and validation

`validatePotConfig(config, now, supportedToken?)` enforces nonzero valid addresses, supported token (when supplied), positive stake and `now < registrationClose <= checkInOpen < checkInClose`. `getPotTimeState`, `isJoinAllowed`, `isCheckInAllowed`, `isFinalizeAllowed`, `isClaimEligible` and `calculateClaimAmount` are pure and contain the lifecycle rules. Check-in is inclusive at both window endpoints; finalize is allowed only when `now > checkInClose`.

`calculatePayout(participantCount, checkedInCount, stakeAmount)` returns `{ base, dust }` using bigint arithmetic. `N === 0` returns zero; `K === 0` returns `{base: stakeAmount, dust: 0n}` (refund policy); otherwise it returns floor `(N * stake) / K` and remainder `(N * stake) % K`.

`parseTokenAmount(text, decimals)` rejects signs, exponent notation, malformed decimals and more fractional digits than `decimals`; it never uses floating point. `formatTokenAmount(amount, decimals)` produces a decimal string without exponent notation. `parsePotId` accepts only positive decimal strings; `potIdToString` is the storage/URL conversion.

## Typed failures

All expected domain failures use `DomainError` with a stable `code` and structured `details`; codes include `INVALID_ARGUMENT`, `INVALID_ADDRESS`, `INVALID_HASH`, `INVALID_CONFIG`, `POT_NOT_FOUND`, `POT_ALREADY_FINALIZED`, `REGISTRATION_CLOSED`, `CHECK_IN_NOT_OPEN`, `CHECK_IN_CLOSED`, `NOT_JOINED`, `ALREADY_JOINED`, `ALREADY_CHECKED_IN`, `NONCE_REUSED`, `PROOF_EXPIRED`, `INVALID_PROOF`, `WRONG_VERIFIER`, `NOT_FINALIZED`, `ALREADY_CLAIMED`, `NOT_ELIGIBLE`, `INSUFFICIENT_ALLOWANCE`, `INSUFFICIENT_BALANCE`, `TRANSFER_FAILED`, `ACCOUNT_NOT_CONNECTED`, `WRONG_CHAIN`, `TRANSACTION_NOT_FOUND`, `STORAGE_CORRUPT`, `STORAGE_VERSION` and `STORAGE_SCHEMA`.

## Synthetic mock surface

Actual implementation exports `MockPotRepository` (implements both repository and wallet ports), `MemoryMockStorage`, `createMockPotEnvironment`, `createMockClock`, the `MockClock`/`MockStorage` types, and constants `MOCK_TOKEN_INFO`, `MOCK_CHAIN_CONTEXT`, `MOCK_DEMO_ACCOUNTS`, `MOCK_DEMO_VERIFIER`. These are explicitly synthetic local-demo APIs, not live chain or cryptographic capabilities. Proposed separate MockWallet/signature-verifier classes were unnecessary and were not created.

The repository constructor accepts injected `clock`, `storage`, `storageKey`, `latencyMs`, and `account`. Five synthetic participant addresses plus a verifier begin with 100 test tokens. `setAccount(address|null)` selects the demo actor; `reset()` explicitly resets local demo data. The factory returns `{repository,wallet:repository,clock,accounts,verifier}`. State is versioned JSON with bigint values stored as decimal strings. Invalid/future-version bytes are rejected without overwriting the originals. Browser storage is injected after mount, never read at import. Omit storage for an in-memory-only run.

Approve-then-join follows the same wallet allowance boundary. `signCheckIn` succeeds only for the configured synthetic verifier and registers an exact proof binding; arbitrary unissued signature text is not trusted. Proof issuance itself is explicitly synthetic, not a blockchain signature. The UI's labelled example action creates a new pot and performs five normal mock approvals/deposits; there is no hidden prefilled on-chain state. Writes validate and persist a complete candidate before replacing live state, preserving atomicity on storage failure. A stale cross-tab snapshot is rejected and requests reload, not silently overwritten.
