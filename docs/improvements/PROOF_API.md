# Public verification API — L3

## Routes and data flow

- `/verify` is a wallet-free entry: it validates the optional `potId` query, offers a public lookup, and links to the documented historical Anvil sample. It makes no RPC request without a selected ID.
- `/verify/[potId]` validates a canonical positive uint256 decimal ID on the server. Invalid IDs are not echoed or used.
- The selected-pot server route reads `COMMITPOT_PROOF_MANIFEST_JSON` and calls `loadServerProof(manifestJson, potId)` from `src/infrastructure/evidence/server.ts`. The loader delegates manifest validation, runtime/immutable checks, pot reads and receipt matching to `loadProof` in `src/infrastructure/evidence/reader.ts`. It uses the repository's `waitForTransaction(hash, intent)` as the only receipt decoding/matching authority.
- The server loader directly imports the API owner's `createPublicBrowserReader()` export. It never calls `createBrowserRuntime()`, references `window`, connects a wallet, or sends writes.
- `VerificationView` is server-rendered, bilingual EN/VI, and accepts optional `ProofSnapshot`. The read-only UI intentionally has no client state or account provider.

## States and authority

`ProofSnapshot.status` distinguishes `unconfigured`, `invalid-manifest`, `invalid-pot`, `unavailable`, `mismatch`, and `matched`. The UI only presents `matched` when the evidence reader has compared the current chain identity, ABI hash, full runtime hashes at deployment/current heights, immutable getters, and selected-pot repository data. A configured manifest is not itself proof that a pot exists or that a participant attended. Receipt rows enumerate configured references (including an unverified status when a manifest/RPC mismatch prevents checking) and report `matched`, `mismatch`, or `unavailable` separately after reads. Each configured reference is bounded to 32 and bound to a chain/core/pot/beneficiary/intention by the strict validator and repository confirmation path. Matched rows disclose configured and observed hash/block/sender/destination/operation/time, beneficiary/amount when available, and claim simulation separate from historical receipt success. Configured receipts retain a visible row with a not-checked status if current proof is unavailable.

The UI explicitly says that source commit, compiler configuration and artifact SHA are declared rather than independently reproduced. Pot repository reads use latest state rather than a block-pinned atomic snapshot, and the UI discloses that distinction. This is not source parity, a security audit, certification, or a guarantee of real-world presence. RPC absence, errors, runtime/token mismatch, missing manifest, invalid pot, and incomplete receipt evidence never become green.

## Historical fixture

FEA386 is displayed only for pot 3 as a historical local Anvil summary. The saved report records 5 deposits of 10 Test USDC, 4 check-ins, 4 claims of 12.5 and residual 0, using a synthetic wallet provider with actual local-chain transactions. Its saved source data has no transaction hashes or block identities: it cannot verify receipts, establish current chain state, or earn a live/matched/certified badge. Other pot IDs never inherit this summary.

## Configuration and limitations

`COMMITPOT_PROOF_MANIFEST_JSON` must contain a public JSON release manifest matching `src/infrastructure/evidence/manifest.ts`. Do not place secrets, signatures, credentials, or private keys in it. The public-only reader factory is owned by P1 as `createPublicBrowserReader()` in `src/infrastructure/avalanche/browser.ts`. Its actual implementation is present in the current working tree but is unverified here; full config/deployment and reader tests are required before live positive evidence. The approved optional server-only key is `COMMITPOT_PROOF_MANIFEST_JSON` (no `NEXT_PUBLIC_` prefix); no RPC URL or deployment manifest is invented.

Tests are isolated under `tests/evidence` and `tests/metadata`; run them with their scoped Vitest configs. The global web test-discovery config belongs to the manifest/CI owner and remains untouched.
