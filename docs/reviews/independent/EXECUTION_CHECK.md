# Independent execution check

## Commands and results

- `pnpm --filter @commitpot/web test` — exit `0`; **11 tests passed**, 4 test files, 0 failed.
- `C:\AI-workspace\commitpot\.tools\foundry\forge.exe test --root packages/contracts -q` — exit `0`; **35 tests passed**, 0 failed, 0 skipped; includes **1,024 fuzz runs** for the reported fuzz case.
- `pnpm --filter @commitpot/web typecheck` — exit `0` (optional check run).

The web test count is the actual current command output (11), not the 10-test baseline described in the existing verification note. The Foundry output reports 35 total tests across 3 suites (5 + 16 + 14), matching the documented baseline.

## Production-source integrity

Manifest-listed production hashes were measured before and after all commands. Aggregate manifest hash:

`c3b1fca2e3a1916e59133889c1677df4f880ed8993938817d3c860d4cee98b88`

Before and after values are identical: **source unchanged during this check**. The manifest’s expected per-file hashes do not all match the current tree: `apps/web/src/app/globals.css` and `apps/web/src/presentation/CommitPotApp.tsx` differ from the recorded manifest values. The aggregate was identical before and after, so these differences were present throughout this check and are not attributable to these commands; they are a coverage/integrity limitation.

## Existing browser evidence joined (not rerun)

- Mock browser report: **7 steps passed**, 0 page errors; normal UI flow, EN/VI, 390px viewport, four attestations, finalize/claim/reload; mock-only.
- Local browser-to-chain report: **4 major stages passed**, 0 page errors; actual local Anvil transactions, five wallets, four typed signatures/check-ins, finalize and four exact claims; synthetic provider/local-only.

Gaps: no browser rerun, no physical camera/device test, no real wallet or Fuji/public-network validation, and no formal security audit. This is local development verification, not third-party security certification.
