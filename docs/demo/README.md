# CommitPot — pitch and demonstration source pack

**Local document assets, not a publication or release.** No video has been recorded and no human pilot has been run by this assignment. Public testnet release pending. The current public source repository is [khoi1709/commitpot](https://github.com/khoi1709/commitpot); its URL matches the local Git remote and the [cached public observation](<../competitive-review/EVIDENCE_CACHE.md#L88-L90>). No network availability check was made here.

## Open and use

- [English deck: eight slides](<../../output/pitch/commitpot-en.html>)
- [Bộ slide tiếng Việt: tám trang](<../../output/pitch/commitpot-vi.html>)
- [Eight-slide pitch outline, English](<PITCH_EN.md>) and [Tiếng Việt](<PITCH_VI.md>) — brief Markdown counterparts to the offline HTML decks.
- [2:45 narrated-demo script, EN/VI](<NARRATED_DEMO.md>) — choose one language per take; includes preparation, cut disclosure and positive/negative controls.
- [Consent-based test-token pilot protocol, EN/VI](<PILOT_PROTOCOL.md>) — proposed exercise and measurement definitions, not recruitment or results.

Open either HTML file directly in a browser. No server, JavaScript, fonts, images or remote resources are required. Links are references, not automatically fetched assets. Screen slides use a 16:9 canvas; small screens stack naturally. Print using **A4, landscape, 100% scale, browser headers/footers off**. CSS requests one slide per page. Color is optional: evidence labels remain textual in monochrome. The two files are parallel language editions, not sixteen slides for one talk.

The [cached official requirements](<../competitive-review/EVIDENCE_CACHE.md#L9-L13>) call for accessible Canva/Google Slides and a 2–3 minute video. These offline HTML sources are **not** those externally accessible submission deliverables. A native slide artifact, recording, access check and any publication need a separate authorized step; no Office library installation is needed here.

## Evidence ledger — do not promote one tier into another

| Claim used in these assets | Source and actual scope | Limit |
|---|---|---|
| Five wallets deposited 10; four checked in and received 12.5 each | [Saved browser-to-Anvil report](<../../output/verification/local-browser/browser-report.json>), [fixture identity](<../../output/verification/local-browser/deployment.json>) and [verification narrative](<../../output/verification/VERIFICATION.md>) | Historical local chain 31337, pot 3; synthetic wallet provider, real local transactions. Not five humans, Fuji or a live service. |
| No-show ineligible | Historical [browser assertion](<../../apps/web/tests/e2e/local-chain-browser.mjs#L104-L110>) checks the UI message; historical [adapter integration](<../../apps/web/tests/integration/local-chain.test.ts#L77-L84>) expects `NOT_ELIGIBLE`; the current [contract unit case](<../../packages/contracts/test/unit/CommitPotLifecycle.t.sol#L49-L81>) expects exact `NotEligible(potId, wallet)` and checks unchanged beneficiary balance and `hasClaimed` before/after. | The exact-selector/state assertions are current unit-test source, not a newly executed receipt or a mined revert. Historical browser/Anvil artifacts are not promoted to current-candidate acceptance. |
| Beneficiary-safe claim; no admin withdrawal or editable pot policy | [Core contract](<../../packages/contracts/src/CommitPot.sol>) and [fixed business rules](<../EXECUTION_CONTRACT.md#L9-L22>) | Source guarantees within this implementation, not proof of any public deployment. Human attendance verification and token/RPC/wallet dependencies remain trusted. |
| Zero-attendance refund; deterministic dust | [Equal-split strategy](<../../packages/contracts/src/EqualSplitStrategy.sol>), [refund/dust unit cases](<../../packages/contracts/test/unit/CommitPotLifecycle.t.sol#L77-L130>) | Separate local fixtures, not extra actions or receipts from historical pot 3. The saved refund unit case has two joined wallets, not a demonstrated five-person refund pot. |
| Local checks executed at the previous finish boundary | [Verification record](<../../output/verification/VERIFICATION.md>), [closing source manifest](<../../output/verification/CLOSING_SOURCE_MANIFEST.json>) | Historical 11 web tests / 35 executed Forge cases, with inherited repetitions. Not current-candidate acceptance, distinct-requirement count, CI certification or a security audit. |
| Public repo exists; no public Fuji/HTTPS proof supplied | [Cached observation](<../competitive-review/EVIDENCE_CACHE.md#L88-L90>) and local Git remote | Publication occurred at the historical baseline; this local evidence does not refresh the hosted source or imply a new publication. Historical verification files retain stale “no Git publication” / service-running language; preserve those snapshots without treating those sentences as current status. |
| Official judging weights | [Cached official page body](<../competitive-review/EVIDENCE_CACHE.md#L9-L13>), original [Team1 Vietnam page](https://team1vn.xyz/) | Technical 25 / Avalanche 25 / creativity 15 / impact 15 / pitch 10 / UI-demo 10 are criterion weights, not predicted CommitPot points. No fresh fetch in this task. |

Historical evidence is associated by the [competitive baseline record](<../competitive-review/IMPROVEMENT_PLAN.md#L15-L21>) with source `fea386bdde0bf6051af1116790f0762609dcf891`. The repository was already public at that historical baseline; local completion does not publish or refresh the hosted source. New improvement candidates are not silently covered by those results. The saved browser report records pot/core/token and action classes, **not a complete transaction-hash, block and timestamp ledger**. Do not invent those missing fields or send local hashes/addresses to a Fuji explorer.

### Exact historical financial trace

All amounts below are **local test-token units**, six decimals; “A–E” are explanatory aliases for the first five fixture wallets, not people or personal identifiers.

| Fixture | Deposit | Valid check-in | Gross payout | Net token change, excluding gas |
|---|---:|---|---:|---:|
| A | 10 | Yes | 12.5 | +2.5 |
| B | 10 | Yes | 12.5 | +2.5 |
| C | 10 | Yes | 12.5 | +2.5 |
| D | 10 | Yes | 12.5 | +2.5 |
| E | 10 | No | 0 | −10 |
| Total | **50** | **4 of 5 wallets** | **50** | **0** |

`5 × 10,000,000 = 50,000,000` base units; `50,000,000 / 4 = 12,500,000` per eligible wallet; dust `0`. After all four claims, the recorded pot obligation is zero. The saved isolated browser run reports the core balance reconciled to zero; a global core balance is not generally a per-pot liability measure because other pots or unsolicited transfers can coexist. The extra 2.5 comes from the forfeited deposit, not yield or an external return guarantee.

## Release and recording gates

1. Freeze the candidate source and rerun its permitted local acceptance; keep the historical snapshot separately labelled.
2. Prepare a same-run receipt ledger: chain, core, token, pot, source/artifact identity, full hashes, block/time, sender, beneficiary, amount, status and before/after balances. Record the exact control result and its tier (simulation versus mined transaction).
3. Only after explicit authorization: verify the intended Fuji token and issuer restrictions, fund a named testnet signer, deploy exact artifacts, verify source/runtime identity with immutables, and publish an HTTPS entry. No Fuji address or live URL is supplied by this pack.
4. Record and caption the demo; preserve visible labels for prepared transactions and local time advances. Complete the proposed usability exercise only with separate permission and consent. Do not relabel synthetic fixtures as a pilot.
5. Check slide/video/repository access as a fresh judge before any authorized submission. Current permission covers none of those external actions.

## Artifact design boundary

Read-mode supporting documents inherit the [existing CommitPot palette and hierarchy](<../../apps/web/DESIGN.md>). The deck leads with the accountable-deposit mechanism, then uses a fixed-rules sequence, a reconciliation table and an evidence-tier comparison. White pages and indigo headings remain legible in a bright judging room and on paper. A system sans-serif fallback is intentional for a self-contained bilingual document; no font asset is copied. There are no app changes, interactive pitch controls, decorative charts, animations or unmeasured benefit graphics. Rendering checks here concern these HTML documents only, not app acceptance or physical printer certification.
