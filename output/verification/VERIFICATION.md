# CommitPot — local verification record

## Accepted execution scope

A bilingual English/Vietnamese local application. The default [local app](http://localhost:3100) is explicitly labelled synthetic mock mode. A separately configured app at 127.0.0.1:3101 exercised the actual chain adapter against disposable Anvil chain 31337 with a test-only injected wallet provider. No existing user keys, real-wallet signatures, Fuji broadcasts, Git publication, public hosting or event submission occurred.

## Executed checks

| Gate | Actual result and limits |
|---|---|
| `pnpm --filter @commitpot/web test` | **11 tests passed**, four files: exact amounts, payout/time/QR rules, mock lifecycle, atomic storage/corrupt preservation, pending context and confirmed activity validation. |
| `pnpm --filter @commitpot/web typecheck` | Exit 0 on the implemented application, adapters and tests. |
| Foundry 1.9.0 / Solidity 0.8.24 | **35 executed cases passed**, zero failures/skips, including one 1,024-run fuzz property. Base fixture tests are inherited across suites; this is not 35 distinct requirements. Covers zero/refund/all/dust, exact time endpoints, duplicates/nonexistent IDs, wrong signer/participant/chain/core, shared helper, proof expiry/nonce and ERC-1271, two pots and donations. |
| Actual Anvil adapter integration | **One integration test passed** with real deployments, five distinct RPC fixture wallets, exact allowances/deposits, matching viem/core digests, actual EIP-712 signatures, four check-ins, finalization and all four 12.5 payouts. Forged-participant and cross-core proof reuse rejected; residual balance zero. |
| Production build | Exit 0 after final receipt/activity repairs. Root first-load JS approximately **128 kB**. Native Next SWC DLL fails initialization on this host; the official WASM fallback compiles successfully. The warning is retained, not suppressed. |
| [Mock Edge UI report](<browser/report.json>) | Seven stage checks passed, zero page errors. Normal UI actions; explicit synthetic state; EN/VI and 390px overflow; four QR attestations; finalization/claim; normal reload preserves both claimed state **and actual confirmed receipt history**. No product state injection. |
| [Browser-to-chain report](<local-browser/browser-report.json>) | Four major stages passed after final repairs. UI creates a new pot and decodes its actual event; five wallets approve/deposit; four wallet `eth_signTypedData_v4` calls plus check-in transactions; finalizes and claims all four exact payouts. Chain balances reconciled after each claim. A rerun uses a new pot ID and before/after balances, never replays an uncertain operation. |
| Mechanical UI detector | Guarded Impeccable detector returned `[]` once for the app and stylesheet. This is not accessibility or visual-quality certification. |

## Evidence identity

[Final source/test manifest](<FINAL_SOURCE_MANIFEST.json>) records the source/test inputs at the explicit finish-review repair boundary. A post-test comparison initially found zero changes. One later surgical field-name correction added a translated `aria-label` to the verifier textarea after invalid-input recovery exposed an unstable exact accessible name; it changed no business, wallet or layout logic. The [additional 390×640 input flow](<browser/input-boundaries.json>) then passed five checks: precision rejection, untrusted QR rejection, required presence attestation, EN/VI candidate preservation, and no horizontal overflow. The [closing manifest](<CLOSING_SOURCE_MANIFEST.json>) records 38 source/test inputs including that added boundary test; the only changed prior source is the explicit textarea accessible-name attribute. Its post-check comparison found zero changes. Earlier evidence is never silently relabelled.

The lead opened the actual desktop, Vietnamese phone, verifier and settled captures. The real browser-to-chain flow uses a fresh isolated Edge context and a test-harness-only provider forwarding exclusively to the owned loopback node. No private key is shipped in the application. Local timestamp controls are test setup, not product progression injection or Fuji manipulation.

## Independent review

- [Source review](<../../docs/reviews/independent/SOURCE_REVIEW.md>) found two bounded issues: unknown mode selecting mock and recovery not account-scoped. Both accepted and fixed.
- [Fresh source recheck](<../../docs/reviews/independent/SOURCE_RECHECK.md>) marked those two findings resolved in the actual code. It is source-only, not a formal audit.
- [Finish review](<../../docs/reviews/independent/FINISH_REVIEW.md>) requested real receipt continuity across reload and reduced QR-driven desktop dead space. Both implemented: only actual confirmed history is persisted by chain/core and translated by operation code; native personal-QR details are collapsed before check-in and open during check-in. Fresh captures and the updated browser assertion were produced for the verdict pass.
- [Independent execution report](<../../docs/reviews/independent/EXECUTION_CHECK.md>) ran web tests, Forge and typecheck successfully with its own before/after source hashes unchanged. The older expected manifest and mistaken child date are explicitly qualified in the [evidence reconciliation](<../../docs/reviews/independent/EVIDENCE_RECONCILIATION.md>).
- The fresh [finish verdict](<../../docs/reviews/independent/FINISH_VERDICT.md>) is **ship for the two scored fixes**, with no visible introduced regressions. It does not certify every possible UI state or device.
- [Design documentation](<../../apps/web/DESIGN.md>) and its sidecar were extracted from the actual build; no raster art or speculative visual assets ship.

## Remaining limits

Phone captures are browser viewport emulation, not physical-device camera certification. Real browser-extension wallet permission UX, camera hardware, all rejection/replacement/timeout paths and exhaustive adversarial token behavior have not been certified. The test wallet bridge exists only in test files. The contracts have development unit/fuzz coverage, **not a formal third-party security audit**; no comprehensive invariant/security coverage claim is made.

Fuji token identity/issuer restrictions, organizer multisig requirements, testnet funding, public deployment and submission readiness remain separate external gates. No mainnet or real-money readiness claim. The Ares project and original downloads remain unchanged; preserved input copies are byte-identical.
