# Interaction API — assignment 003

Consumer: application owner004. Only the two application modules below are owned by003; App, domain, recovery, adapters, styles and manifests stay read-only. This contract is published before implementation. No writes/signatures, new adapter, camera access or financial authority are added.

## Attendance — `apps/web/src/application/useAttendanceCandidate.ts`

```ts
type AttendanceContext = Readonly<{
  chainId: number; coreAddress: Address; potId: bigint;
  verifier: Address; account: Address | null;
}>;
type AttendanceCandidate = Readonly<{ address: Address; status: Readonly<ParticipantStatus> }>;
type AttendanceReview = Readonly<{
  generation: number; input: string; context: AttendanceContext;
  candidate: AttendanceCandidate;
}>;
// Snapshot: input, context, generation, candidate, present, inspecting, error.
createAttendanceCandidateController(
  repository: Pick<IPotRepository, 'getParticipantStatus'>,
  context?: AttendanceContext | null,
): AttendanceCandidateController;
// Controller methods:
getSnapshot(): AttendanceCandidateSnapshot;
subscribe(listener: () => void): () => void;
setContext(context: AttendanceContext | null): void;
setInput(input: string): void;
setPresent(present: boolean): void;
inspect(): Promise<AttendanceCandidate | null>;
getReview(): AttendanceReview;
assertCurrent(review: AttendanceReview): void;
clear(): void;
cancel(): void;
// Hook returns snapshot fields plus the controller methods above.
useAttendanceCandidate(repository, context);
```

**One ingestion path:** manual textarea changes AND camera detections must call `setInput(raw)`. Every call (even identical input), changed account/pot/chain/core/verifier, explicit clear/cancel, and new inspection invalidates previous candidate/presence/review and drops late successes AND errors. Context addresses compare case-insensitively. Context changes preserve raw input, never its attestation. `inspect()` uses the existing QR decoder and selected pot, reads membership, rejects nonmembers, and stores errors in the snapshot without rejecting. A checked-in candidate may render, but cannot be attested/reviewed.

**Final review:** capture `const review = attendance.getReview()` only after explicit presence confirmation. Render/sign **`review.candidate.address` and `review.context.potId`**, never a candidate read later from mutable UI state. Call `attendance.assertCurrent(review)` after every asynchronous pre-sign read and again after the signing prompt/before submission. Any input/context/reinspection/presence revocation invalidates that exact review. `getReview` also requires the current account to equal the verifier. Controllers do not validate current chain time or submit:004 must re-read time/connection and enforce domain rules/protocol operation context at the write boundary. Wallet account/chain events must feed changed context immediately; periodic public reads alone are not a wallet event subscription.

## Public reads — `apps/web/src/application/usePublicPot.ts`

```ts
type ReadState<T> = Readonly<{
  data: T | null;
  status: 'idle' | 'loading' | 'ready' | 'stale' | 'error';
  error: unknown | null;
}>;
// Snapshot: selected, pot, time, chain, list, wallet, participant,
// refreshing, publicVerified, writesEnabled.
// pot/time/chain/list/wallet are ReadState of their domain result.
// participant is ReadState<{account, potId, status, balance, allowance}>.
createPublicPotController(repository, wallet = null, selected = null): PublicPotController;
getSnapshot(): PublicPotSnapshot;
subscribe(listener: () => void): () => void;
setSelected(id: bigint | null): void;
refresh(): Promise<void>;
startPolling(intervalMs?: number): () => void;
cancel(): void;
// Hook owns selection, subscriptions, and polling; defaults to 5000ms.
// Returns snapshot fields plus refresh(). Stable repository/wallet references required.
usePublicPot(repository, wallet, selected, intervalMs = 5000);
```

Read ports are structural `Pick`s of existing repository/wallet read methods. No connection request or implicit wallet creation occurs. `getPot(selected)`, chain time/context, discovery list, and wallet/member reads settle independently; **known selected IDs never depend on latest-list success or wallet availability**. A successful list does not silently replace selection;004 may choose its first result only when no ID was explicitly selected.

On refresh, retained data is `loading` (not verified); on failure it is `stale` if available, otherwise `error`. Original errors remain visible until that read succeeds. Selected-pot changes clear only selection-specific data, invalidate older responses, and preserve unrelated UI forms (forms are not controller state). `publicVerified` requires ready chain/time plus selected pot when selected; `writesEnabled` additionally requires a connected same-chain/mode wallet and, for selected-pot writes, ready participant/funds. A list failure alone does not disable writes. No selection permits create-readiness without requiring a pot. These booleans are conservative read-readiness only:004 must additionally enforce operation-specific rules, recovery lock, gas readiness and protocol preflight.

Polling is serial, minimum1000ms/maximum60000ms (default5000ms), with one scheduled loop; cancel/cleanup changes generation so late results cannot publish. Domain read promises have no AbortSignal: cancellation is logical, not transport abortion, and a hung read pauses the automatic loop instead of accumulating requests. Manual refresh supersedes older work. Stopping polling marks retained data unverified and disables writes. Refresh/poll never resets input forms.

## Integration/testing notes

- Remove the old App `Promise.all(listPots,getConnection,time)` dependency and duplicate candidate state when004 integrates.
- Both modules use only existing read methods;001's optional write context does not change this API.
- Vitest's current root include omits `tests/interaction`.003 will use an owned test config;007/lead should include these tests in normal CI.
- Required regressions: A attested → scan B; delayed A after B/context change; exact-review invalidation; selected pot with wallet/list failure; critical RPC stale/error disables writes; serial polling and cancellation.
- Implementation/check results and any exact-contract corrections will be recorded here and in `docs/improvements/reports/003.md` before close.
