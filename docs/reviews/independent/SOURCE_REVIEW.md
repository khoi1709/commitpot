# Independent Source Review

Scope: read-only review of `apps/web/src/domain/amounts.ts`, `apps/web/src/domain/rules.ts`, `apps/web/src/infrastructure/mock/index.ts`, `apps/web/src/infrastructure/avalanche/repository.ts`, and `apps/web/src/presentation/CommitPotApp.tsx`. No source edits or tests/network activity.

## Findings

### M1 — Production can silently boot the local mock

**Path/lines:** `apps/web/src/presentation/CommitPotApp.tsx:56-58`.

**Trigger:** Any deployment where `NEXT_PUBLIC_USE_MOCK` is missing, misspelled, or has a value other than the exact string `"false"` takes the `createDemoRuntime()` branch. The app then uses localStorage-backed balances, approvals, pots, signatures, and successful mock receipts (`infrastructure/mock/index.ts:100-235`) rather than a chain. The UI does show a mock banner, but a configuration mistake can still present a functioning Test USDC workflow with no chain settlement.

**Minimal fix:** Fail closed unless the mode is an explicitly allowed value (for example, `"true"` for a deliberate demo build and `"false"` for Avalanche); otherwise render a configuration error. In non-mock mode, require successful deployment validation before enabling actions.

### M2 — Pending transaction reconciliation is not account-scoped

**Path/lines:** `apps/web/src/presentation/CommitPotApp.tsx:119-122,136-147`.

**Trigger:** A pending record stores `account`, but `reconcile()` checks only chain ID and core address (`:140-142`), not the currently connected account. If the wallet changes while an unknown transaction remains, a different account can reconcile/clear the old account’s pending record and refresh under its own identity. The receipt itself is public and funds are not redirected by this path, but the UI can attribute completion/state to the wrong account and lose the original account’s recovery context.

**Minimal fix:** Require a connected current address matching `pending.account` (normalized) before reconciliation; otherwise instruct the user to switch back. Also capture/verify the actual wallet account at submission rather than relying only on React connection state.

## Explicit limits

No issue was claimed for arithmetic in `amounts.ts` or payout/time predicates in `rules.ts`; their checked paths are internally consistent. The mock’s client-controlled localStorage is inherently forgeable, but that is an explicit demo limitation, not a chain-security claim. `AvalanchePotRepository` receipt waiting remains intentionally public-chain receipt lookup; no account authorization should be inferred from a tx hash. No Solidity, runtime factory, generated ABI, tests, or live deployment were reviewed, so this is not a formal audit.
