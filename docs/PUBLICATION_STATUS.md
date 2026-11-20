# Current source and verification status

This public source snapshot describes **local verification, not a product release**. The results below are from independent checks on the current improvement candidate; this publication task did not rerun them.

## Verified local source gates

- **Web tests:** 273 passed across 18 files. The offline Solidity build compiled 54 files, and the generated ABI matched the checked-in ABI exactly.
- **Foundry:** 35 unit, 15 failure and 3 invariant cases passed; no failures or skips. The invariant run used 256 runs, depth 64 and `fail_on_revert=true`; it reported 16,384 handler calls with no reverts or discards. This is guided concurrent multi-pot progression, **not arbitrary action-order fuzzing** or a count of unique requirements. Existing Foundry lint warnings remain.
- **Type checking:** passed (`tsc --noEmit`).
- **Owned local-chain integration:** 1/1 Anvil test passed on chain 31337: five synthetic wallets deposited 10 test tokens each, four checked in, four received 12.5 each, and the isolated pot residual was zero. This was a disposable local chain, not Fuji.

These are development checks, not a formal audit, public deployment, or proof about real attendees.

## Browser acceptance remains incomplete

The latest full browser-controls attempt failed after switching from English to Vietnamese: it reused an English-labelled QR locator and timed out. Its invalid-pot proof subcase passed, and no page, console, HTTP, or transport errors were recorded, but the full suite did not pass. The zero-attendance refund, recovery-quarantine, and receipt browser controls were **not reached**. This locator failure is not evidence of an application defect, nor does it demonstrate those controls work. No full final browser acceptance was obtained.

L38 reported a production build exit 0 with build ID `J8khH4HCvnfujky1BABTN`, which L40 observed. A later out-of-scope build was reported exit 0 with build ID `CbEvbbstLyBKbCiLCu4CZ`; that artifact was not independently accepted. Publication did not run a new build or repair the partial browser suite.

## Not demonstrated or performed

No physical-camera test, real-wallet use, Fuji transaction, public deployment or hosting, hosted-CI pass, formal security audit, or human pilot is established here. The manual hosted workflow intentionally stops at runner provisioning and is not green. Five local fixtures are not five people. Synthetic local transactions and a green source-test suite do not establish public-network readiness, attendance impact, or source-to-deployment parity.
