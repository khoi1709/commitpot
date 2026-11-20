# Protocol API — Assignment 001 frozen consumer boundary

Published before adapter implementation. Domain types/ports are now available; final implementation/checks are recorded in [report 001](<docs/improvements/reports/001.md>). No financial policy or token-identity assertion is added.

## Additive method signatures

All existing names remain. Append `context?: OperationContext` to `createPot(config)`, `joinPot(id)`, `submitCheckIn(proof)`, `finalizePot(id)`, `approveToken(amount)`, and `signCheckIn(input)`. Claim is **`claimPayout(id, beneficiary, context?)`**. Context is `{account: Address; chainId: number; onStage?: (stage: OperationStage) => void}`.

`OperationStage = 'preparing' | 'signing' | 'preflight' | 'submitting' | 'confirming'`.

Writes emit preparing, preflight before simulation, submitting immediately before the wallet write, confirming only after receiving a hash. Signatures emit preparing/signing only; signing is never broadcast. Runtime account/chain is checked before and after preflight and before/after signing. Stage callbacks may throw before submission to block a write. A callback error after a returned hash must not hide that hash. No automatic wallet authorization for reads.

`getNativeBalance(address?: Address): Promise<bigint | null>` reads native base units via public getBalance. `null` means unavailable (including mock gas), **not zero**; `0n` is a real empty balance. No fake gas estimate/minimum or guarantee that a positive balance suffices.

## Durable intent

`OperationIntent` is a discriminated union with common `account`, `chainId`, `core`; variants:

- create: `config: { token, verifier, stakeAmount: string, registrationClose: number, checkInOpen: number, checkInClose: number }`
- approve: `token: Address`, `amount: string` (spender is `core`)
- join: `potId: string`
- checkIn: `potId: string`, `proof: {participant: Address, nonce: string, deadline: number}`
- finalize: `potId: string`
- claim: `potId: string`, `beneficiary: Address`

Optional relevant metadata `token`, `amount`, `beneficiary` is validated if supplied (join amount means fixed deposit, claim amount expected payout, checkIn beneficiary means proof participant). No signature/private-key field is accepted. `validateOperationIntent(unknown): OperationIntent` validates canonical decimal uint256s, positive pot IDs, nonzero addresses, safe timestamps and shape, returning a normalized copy. `operationIntentsMatch(actual, expected): boolean` checks every expected field after validation. Both export from domain/index.

## Confirmation

`waitForTransaction(hash: TxHash, intent?: OperationIntent): Promise<TransactionReceipt>` never uses the active wallet; it works read-only. Pass the persisted intent for exact recovery. Without it, it verifies transaction/event self-consistency but cannot know the human's prior intent.

A successful receipt has optional contextual fields `chainId:number`, `coreAddress:Address`, `from:Address`, `to:Address`, `operation:OperationIntent['kind']`, `potId:bigint`, `beneficiary:Address`, `amount:bigint`, `blockTimestamp:number`; existing `hash`, `status`, `blockNumber`, `createdPotId` stay. Numeric receipt fields remain bigint where appropriate (storage owners serialize them).

Actual runtime chain, transaction sender/destination/function arguments, configured token, and exact core/token event arguments must match. Check-in compares public proof fields, never persists signature. Repricing is accepted only for an equivalent actual operation; cancellation is not confirmation. Mismatch/replacement/revert returns `status:'failure'` with a typed error. Unavailable confirmation rejects with a stage-aware error; preserve pending intent/hash, do not blindly resubmit. A failure receipt is **not permission to discard an unrelated pending intent**.

## Errors

`StageAwareError extends DomainError`: `stage:OperationStage`, `submitted:boolean|'unknown'`, `originalCode?:string|number`, and original `cause`. Use `toStageAwareError(error, stage, submitted)` or `toDomainError(error)` for stable classification. Never infer stage from translated/localized strings.

New stable codes: ACCOUNT_CHANGED, WALLET_REJECTED, WALLET_UNAVAILABLE, INSUFFICIENT_GAS, RPC_UNAVAILABLE, PREFLIGHT_FAILED, SUBMISSION_UNKNOWN, TRANSACTION_REVERTED, TRANSACTION_CANCELLED, TRANSACTION_REPLACED, RECEIPT_MISMATCH, CONFIRMATION_UNAVAILABLE, FINALIZE_TOO_EARLY. Existing contract-domain codes are retained. Nested 4001 is WALLET_REJECTED with originalCode 4001 and submitted false. Simulation errors are preflight/false. Unknown wallet-send errors are submitting/'unknown' even when their text sounds deterministic. Confirmation errors are confirming/true (a known hash was already submitted).

Mock keeps atomic state/storage commits, checks optional context through delayed operations, stores public receipt intents for reload matching, and keeps newly issued synthetic proof signatures in memory only. Legacy saved data remains readable; old receipts without intent cannot satisfy exact recovery.
