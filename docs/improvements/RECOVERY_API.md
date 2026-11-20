# Bounded recovery API — assignment 002

Integration contract published before implementation; implementation/tests are being completed in this exclusive scope. No App, hook, runtime, UI, manifest, domain, or chain-adapter writes belong to 002.

## Public application API

From `apps/web/src/application/recovery.ts`:

```ts
createRecoveryController(storage: RecoveryStorage | null, key = PENDING_STORAGE_KEY): RecoveryController
// RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
// PENDING_STORAGE_KEY = 'commitpot-pending-v1' (retained to discover old/unknown bytes)

controller.load(): RecoverySnapshot
controller.begin(intent: OperationIntent): PendingOperation
controller.setStage(id: string, stage: OperationStage): RecoverySnapshot
controller.setHash(id: string, hash: TxHash): RecoverySnapshot
controller.complete(id: string, receipt: TransactionReceipt): RecoverySnapshot
controller.discard(id: string): RecoverySnapshot
controller.resolveLegacy(raw: string, intent: OperationIntent): PendingOperation
controller.subscribe(listener: (snapshot: RecoverySnapshot) => void): () => void

withRecoveryLease<T>(run: () => Promise<T>, key?: string,
  locks?: RecoveryLockManager | null): Promise<T>
getBrowserStorage(): RecoveryStorage | null
readPreference(storage: RecoveryStorage | null, key: string): string | null
writePreference(storage: RecoveryStorage | null, key: string, value: string): boolean
```

`PendingOperation` is the v2 envelope `{version:2,id,stage,intent,hash?,started}`. `OperationIntent` and `OperationStage` come from the domain. IDs are opaque. `started` is milliseconds. No signature is persisted. Baseline `OperationKind`, `parsePendingOperation`, and `matchesPendingContext` exports remain in `application/pending.ts`; the parser also recognizes validated flat legacy records. Its union return must not be passed directly to exact receipt confirmation.

`RecoverySnapshot` has `{pending:PendingOperation|null,blocked:boolean,warning?:string,raw?:string,confirmed?:TransactionReceipt,legacy?:LegacyPendingOperation,quarantine?:'legacy'|'invalid'|'future',activity?:ConfirmedActivity[]}`. `blocked` prevents **new writes**, not public reads or reconciliation. Missing/inaccessible storage never throws from construction/load; it returns blocked + warning. Optional preferences never prevent read-only initialization. `begin` and pre-hash `setStage` throw `RecoveryError` if their durable write cannot be verified. Do not invoke a wallet write after either throws. `setHash` retains the broadcast hash in memory and returns a warning on storage failure. `complete` preserves known receipts and returns warnings rather than payment failures for storage get/set/remove failures. Invalid receipt inputs remain programmer/validation errors.

## Required App runner integration

Hold `withRecoveryLease(async () => { ... })` around the **entire** begin → wallet/sign/preflight/send → hash → expected-intent receipt → complete sequence, and around reconciliation/discard/legacy resolution. It uses `navigator.locks.request` with an exclusive, non-queued `ifAvailable` lease; absent Web Locks fails closed (`LEASE_UNAVAILABLE`) rather than pretending localStorage is atomic. A competing runner fails `LEASE_BUSY`. Read-only initialization needs no lease. Every caller sharing the pending key must use the same lease key.

Within the lease, call `begin(fullIntent)` before asking the wallet; provide `onStage: stage => controller.setStage(id, stage)` to the protocol context. Stages distinguish signing from submitting; only `setHash` records a known broadcast hash. Pass the exact `pending.intent` to `repository.waitForTransaction(pending.hash, pending.intent)` and feed its validated receipt to `complete` for **both normal and recovery paths**. Storage warnings must not be thrown into the transaction failure handler. Refresh public state independently. A successful receipt remains successful even if cleanup/history persistence fails. Receipt status `failure` remains a known revert, not an ambiguous payment.

`discard(id)` is conditional on the currently persisted v2 ID; the caller must establish deterministic non-submission or obtain explicit informed user consent for unknown outcomes. No automatic timeout or blind retry. Stale IDs never clear another operation. Corrupt/future records remain byte-for-byte at the original key and block writes. Legacy records are quarantined, not silently promoted: `resolveLegacy(exactRaw, completeIntent)` requires separately resolving missing arguments (e.g. from trusted chain transaction decoding), validates the existing account/chain/core/kind/pot context, and preserves the old hash/start time. Never guess missing arguments or resubmit legacy records. Unknown legacy account is not evidence of ownership.

## Confirmed activity

`application/activity.ts` keeps `activityStorageKey`, `parseActivity`, and `ConfirmedActivity`. New exports: `ACTIVITY_LIMIT` (50), `isLegacyActivity`, `loadConfirmedActivity`, and `appendConfirmedActivity`. Activity key stays v1 to discover old entries. New entries are v2 and carry full hash, operation ID, chain/core, sender/destination, pot/beneficiary/amount when applicable, block number, and available chain timestamp. Big integers are decimal strings. Legacy three-field records remain identifiable with `isLegacyActivity(entry)` and must be displayed as legacy, not verified-context evidence. Optional activity failure does not block reads or change receipt status. `complete` is the shared idempotent append path; normal and recovered receipts deduplicate by chain/core/full receipt hash and promote matching legacy entries. History is bounded to 50, independently of how many rows a UI shows. Invalid/future activity bytes are preserved rather than overwritten.

## Limits and verification

Conditional read/check/write is **not atomic CAS**. The Web Locks runner serializes cooperating same-origin tabs only; non-cooperating old clients/extensions can still race. Storage-event subscription refreshes other tabs but cannot make localStorage transactional. If hash persistence fails, recovery survives in this controller's memory only; warn against closing/reloading. A separately verified expected-intent receipt is the trust boundary: this module does not contact chain/wallet services or independently decode a transaction. App initialization and full runner integration are owned by 004; 002's tests cover the controller/storage boundary only.
