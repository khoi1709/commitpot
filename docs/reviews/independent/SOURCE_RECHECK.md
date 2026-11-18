# Bounded Source Recheck

Scope: rechecked only the original M1/M2 findings against `SOURCE_REVIEW.md`, `ADJUDICATION.md`, and `CommitPotApp.tsx:50-155`. This is not a runtime test, formal audit, or certification.

- **M1 — resolved (scoped source check).** `CommitPotApp.tsx:60-62` reads `NEXT_PUBLIC_USE_MOCK`, rejects every value except the exact strings `"true"` and `"false"` with `INVALID_CONFIG`, and selects the demo runtime only for `true` or the browser runtime only for `false`. Missing, misspelled, or other values therefore fail closed instead of silently selecting the mock. **Exact lines:** 60-62.

- **M2 — resolved (scoped source check).** Submission snapshots a fresh chain context and wallet connection at `:124-126`, rejects a missing/stale address or chain, and records the actual account plus `chainId` and `core` in the pending intent at `:127`; the intent/hash are persisted at `:128-130`. Reconciliation validates pending chain/core context at `:150-151` and compares the currently connected, normalized address with `pending.account` at `:152-153`. That mismatch throws before the clearing statement at `:155`, preserving the pending record. **Exact lines:** 124-130, 150-155.

**Limitations:** only the requested source range was rechecked; no tests, runtime, network, deployment, or broader source hunt was performed.