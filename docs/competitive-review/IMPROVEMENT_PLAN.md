# CommitPot — competitive improvement and orchestration plan

**Status:** the research recommendations below were subsequently approved for bounded local implementation. Current execution routing supersedes the historical Astra wave: lead/Sol children plan and review only; `cliproxyapi/gpt-6-luna`, `reasoning_effort: max` workers implement and test. Actual candidate state/ownership is in [current routing](<../improvements/ROUTING.md>) and [ledger](<../improvements/LEDGER.md>); the dated research observations below are not current test evidence. No timelines, perfect scores, winning guarantees or feature-count contest.

## 1. Verdict

**Keep the narrow attendance product. Make it independently provable, safer to recover, and unmistakably useful at an actual event.**

Recommended positioning:

> CommitPot replaces personally held attendance deposits with fixed on-chain rules and inspectable payouts, while keeping one named human accountable for offline check-in.

The present application has a meaningful verified local lifecycle. It is not yet an accessible public Fuji product with judge-ready evidence. That is a more consequential gap than lacking AI, yield, NFTs, a custom L1 or account abstraction.

## 2. Evidence boundary

- Our reviewed code: **`fea386bdde0bf6051af1116790f0762609dcf891`**. Existing local tests and browser captures are historical verification at that revision; this research did not rerun them. Local3100listener was absent when checked. GitHub publication/public visibility happened after some local documentation, whose old unpublished wording is stale.
- The [official FAQ](https://team1vn.xyz/) says submissions are visible only to each team and organizers. We cannot see or rank the complete opponent field. Repositories are **publicly self-identified entrants** unless specifically marked an unconfirmed comparable.
- Public GitHub search metadata and several full README bodies were read successfully. Anonymous GitHub API403rate-limit then prevented competitor SHA/tree/decisive source inspection. No bypass, account switch or alternative backend used. **Competitor contract correctness, test counts, latency, security and actual transaction success are not independently certified.** Branch README references are unpinned snapshots.
- Ordinary deployed page text was inspected without sign-in, wallet prompts, simulations or transactions. A loading-only response is neither a proven working flow nor proof a JavaScript application is broken.
- Full evidence, caveats and sources: [competitor matrix](<COMPETITOR_MATRIX.md>) and [cached successful observations](<EVIDENCE_CACHE.md>). Local static defects below are source-grounded, not reproduced exploits or a formal audit.

## 3. What the strongest comparisons teach us

| Reference | Useful pattern we should earn | What we must not copy or assume |
|---|---|---|
| [StudyStake](https://github.com/ndgthuan/studystake), [README](https://raw.githubusercontent.com/ndgthuan/studystake/main/README.md) | Named student scenario, an explicit proof route, outcome explanation and disclosed mock/network limits. It is the closest commitment-market overlap. | Course-completion oracle/yield/badges/guardian authority are a different product. Its principal claimable subject to vault loss is not CommitPot's no-show forfeiture rule. Claimed test/Fuji receipts were not independently rerun here. |
| [MissionPay judge page](https://unihack-missionpay.vercel.app/judge), [repository](https://github.com/lenamkhanhh/UniHack) | A judge can see positive and negative evidence without installing a wallet, and see exactly which deployed version is being demonstrated. | Its page discloses deployed historical bytecode vs locally patched source. Never label our source HEAD as the deployed contract unless matched. No need to add an AI agent, passkeys or ICM to adopt proof-first judging. |
| [Pact](https://github.com/agenticbernie/pact), [public entry](https://thepact.click/) | Mobile QR entry, clear test-token message and minimal upfront wallet friction. | Public landing text does not verify gasless timing or cross-chain settlement. A paymaster/embedded-wallet/solver stack is not a prerequisite for a good attendance app. |
| [AvaHui](https://github.com/QCuong-SW/avahui-unihack-2026), [public page](https://avahui-unihack-2026-web.vercel.app/) | A concrete Vietnamese five-person example and a clear explanation before sign-in. | Do not imitate zero-risk, fixed APY, absolute identity or unmeasured sub-second claims. Financial breadth and marketing confidence are not verified superiority. |
| [AgentLeash](https://github.com/ZzIsSs/agentleash), [public page](https://agentleash-two.vercel.app/) | Guest read-only inspection before authenticated owner actions. | Its observed loading policy/Privy states do not establish completed live payment behavior. |

Other public candidates and starter-code exclusions are documented in the matrix. No opponent is described as insecure merely because a feature was not verified.

## 4. Priority order — by dependency and observable benefit

### P0-A. Repair decision and recovery correctness before expansion

These are local improvements that preserve the financial contract and current visual identity.

| Work item | Current evidence | Required acceptance |
|---|---|---|
| Distinguish signing/preflight from actual broadcast uncertainty | Attendance proof signing and contract submission share one generic action; only selected simulation errors are localized as deterministic. A signing transport error or unmapped simulation revert can leave a hashless "unknown transaction" even when no wallet send occurred. [Signing/submission](<../../apps/web/src/presentation/CommitPotApp.tsx#L180-L188>), [adapter stages](<../../apps/web/src/infrastructure/avalanche/repository.ts#L12-L24>) and [simulation/write](<../../apps/web/src/infrastructure/avalanche/repository.ts#L77-L85>). | Preserve an explicit stage: preparing/signing/preflight/submitting/receipt. Known pre-send failure makes zero transaction calls and permits a deliberate retry; uncertain send retains recovery intent. Re-read chain time after a long signing prompt; an expired attestation must be inspected/confirmed again, not silently re-signed. Test `FinalizeTooEarly`, token simulation revert and signing rejection/timeout separately from post-broadcast timeout. |
| One authoritative QR ingestion/candidate boundary | Camera callback changes `qrInput` without invalidating candidate/attestation, unlike manual entry. [App:102–118](<../../apps/web/src/presentation/CommitPotApp.tsx#L102-L118>) and [App:174–188](<../../apps/web/src/presentation/CommitPotApp.tsx#L174-L188>). | Inspect/attest A, scan B: A cannot remain signable. Manual input, camera input, pot/network/account change and out-of-order asynchronous inspection all invalidate/rebind the candidate. A fresh inspection and explicit presence attestation are required. The final signing review shows the same pot and participant. |
| Fail closed on corrupted or unresolved recovery data | Pending parse errors leave React pending null, while new intent overwrites the single storage key. [App:56–75](<../../apps/web/src/presentation/CommitPotApp.tsx#L56-L75>), [pending parser](<../../apps/web/src/application/pending.ts#L4-L13>). | Invalid/future/malformed pending data is preserved and quarantines new writes for that context until explicit recovery/reset. Raw public transaction evidence can be inspected/exported. A missing hash after an uncertain send is `outcome unknown`, never silently discarded or an invitation to resend; a recorded failure before any send is not labelled a broadcast. Two tabs cannot overwrite or clear each other's newer operation: conditional cleanup checks operation identity, and the schema/version is validated. Optional language preference storage cannot prevent public reading; inability to durably record a new intent must block that write safely. |
| Storage-independent known transaction results | `removeItem` can throw inside receipt success/catch; reconcile does not use the same confirmed activity path. [App:120–166](<../../apps/web/src/presentation/CommitPotApp.tsx#L120-L166>). | Inject `setItem`/`removeItem` failures before intent, after broadcast and after a confirmed receipt. No false failed-payment banner or second payment; known receipt/status stays visible with a localized storage warning. Normal confirmation and reconciliation share one idempotent finalization path; history survives reload without duplicate rows. |
| Bind receipt to the exact pending intent | The adapter checks supported destination/function/event class but receives no expected sender/pot/beneficiary/config. [Receipt validation](<../../apps/web/src/infrastructure/avalanche/repository.ts#L104-L134>), [pending model](<../../apps/web/src/application/pending.ts#L2-L13>). | Store a validated operation fingerprint: chain/core/account/kind and exact arguments relevant to the action, nonce/replacement identity when available. Wrong sender, pot, beneficiary, amount/config or cancelled/replaced calldata cannot complete another intent. A genuine repriced replacement may complete the same intended operation. No invented wallet nonce before it is available. |
| Preserve direct event inspection during partial RPC/wallet failure | Refresh couples list/wallet/timestamp and clears the event on any error; latest30 pots are fetched every5s. [Refresh](<../../apps/web/src/presentation/CommitPotApp.tsx#L79-L92>), [discovery](<../../apps/web/src/infrastructure/avalanche/repository.ts#L69-L74>). | A known valid share link displays its fixed rules and last verified public result even when unrelated list or injected-wallet reads fail. Clearly mark unavailable/stale data. Load the selected event independently, bound/paginate discovery and avoid resetting valid user work. Reuse the existing read-only adapter; no new database/indexer/framework. |

**Impact wording:** these are correctness/recovery risks supported by source. This pass has not demonstrated fund diversion, a signature bypass or an exploit against the core. Wallet/account changes while a prompt is open require targeted runtime regression before a stronger claim.

### P0-B. Make public Avalanche integration independently verifiable

**After separate testnet/hosting authorization**, deliver one exact release candidate with:

1. **An HTTPS app and wallet-free `/verify/<potId>` or equivalent entrypoint.** Same existing reader/state authority, not a second application or copied business rules. A fresh visitor can understand the event and inspect historical evidence without an account, wallet extension, seed phrase or gas.
2. **A deployment identity manifest:** chain43113; vetted token address and decimals; core/helper/strategy addresses; deployment block and transaction; compiler/EVM/optimizer settings; generated ABI/build identity; source commit; immutable constructor values; runtime-code identity appropriate to those immutable values and Solidity metadata. Do not naively compare a placeholder immutable bytecode blob. Current local `validateDeployment` only checks chain/code/token/decimals, not full source parity.
3. **A same-pot complete financial trace:** five confirmed deposits of10, four valid verifier check-ins, finalization, four exact12.5 beneficiary receipts and balances, no-show ineligible, remaining recorded liabilities zero. A second zero-attendance pot demonstrates five refunds; a true-dust local fixture remains separately labelled unless also executed publicly.
4. **Negative evidence paired with positive controls:** exact `NotEligible(potId,beneficiary)` expectation, unchanged beneficiary balance/claim flag, invalid proof/expiry/replay cases. Existing [no-show test](<../../packages/contracts/test/unit/CommitPotLifecycle.t.sol#L49-L74>) uses generic `expectRevert`; tighten the exact intended reason. If a negative case is an `eth_call` simulation rather than a mined revert, label it accordingly. Do not burn test gas just to manufacture a transaction if read-only evidence is enough.
5. **Correct historical/live semantics:** an already-claimed positive payment is proved by its actual historical receipt; current simulation should correctly say `AlreadyClaimed`, not pretend the positive route is broken. A network error, stale snapshot or unsupported deployment is never a green verification badge.
6. **A clear token identity:** official Circle Test USDC only after address/code/decimals/source verification; an explicitly self-issued demo token is named as such and requires an approved scope adjustment, never relabelled official USDC. Issuer pause/blacklist risk remains.

Observed competitor receipt cards inform the design pattern, but our acceptance requires our own independently checked evidence. A public source repository alone is not this gate.

### P1. Turn generic pots into recognizable events and legible proof

- Rename **“Your events”** to **“Events”** unless actual account ownership filtering is implemented. Current discovery is global, not a user-specific/private event list.
- Add a human-approved **public event brief**—title, broad location, purpose, organizer/verifier label and clear time zone—bound to `{chainId,core,potId}`. Keep this explicitly **non-authoritative presentation metadata**; on-chain token, amount and deadlines win in any conflict. No personal attendee names or private meeting details in a public QR/chain record.
- The minimum demonstration needs no new database: a published immutable/reviewed manifest for the showcase pot is sufficient. Self-service editable metadata later needs a separately approved editor/authenticity/storage/privacy design; localStorage alone does not make a colleague's share link meaningful.
- Replace the six-entry local activity list as a purported public ledger with **expandable context-bound receipt details**: full copyable hash, chain, core, source, pot/participant/beneficiary, status, block/time, amount and correct explorer link. Mark mock receipts synthetic. Derive authoritative details from the selected transaction, not from cached untrusted display text.
- Explain the exact financial bargain **before deposit** in both EN/VI: voluntary stake can be forfeited, reward depends on others' attendance, all-no-show refund, rounding, trusted verifier, no cancellation/disputes/replacement. “No admin withdrawal” is not “nobody is trusted.”

### P1. Make the real verifier desk usable on a phone

The [historical 390px verifier capture](<../../output/verification/browser/mobile-verifier.png>) places the active scanner beneath a large phase summary, then shows an irrelevant participant panel for the verifier. That is a role-flow problem, not a reason to replace the entire design system.

Acceptance:

- Keep the current indigo/Be Vietnam Pro identity and EN/VI. On the **active desk**, surface current event/phase, correct signer, native AVAX gas readiness, camera/paste entry and an unambiguous participant confirmation first. Hide unrelated “not yet joined”/deposit actions for this role without hiding financial rules.
- A verifier with Test USDC but no AVAX sees the correct gas problem before signing/submitting. Participant approval/deposit and gas are separately explained. Provide official faucet/network/wallet setup guidance without capturing keys or bypassing consent.
- Wallet missing, rejected request, unsupported chain-add/switch and RPC failure receive specific translated recovery instructions. Read-only event inspection remains available. Existing injected provider is retained; WalletConnect/embedded wallets/paymasters require a measured user need, not competitor envy.
- Camera scan and manual entry share the same validation/invalidation path; denied/unsupported camera remains usable. Verify two actual HTTPS devices if making a physical-device claim; desktop viewport emulation is not that proof.
- Measure scan-to-confirmation and wallet-prompt counts for an explicitly stated sample; report median/p95 and pending/failed cases. Current signature+submit+receipt loop is serial and consumes verifier gas. Do not promise sub-second check-in or add parallel queues/nonces before measurements and correctness tests justify them.

### P1. Raise assurance and reproducibility, not the badge count

- Introduce a narrowly scoped CI workflow: immutable dependency lock, web type/unit/build, contract format/build/unit/fuzz, generated ABI parity and controlled local-chain integration. Pin actions/toolchain versions; no wallet keys or public writes in CI. External code/PR inputs cannot access secrets.
- A clean checkout should reproduce the specified environment and known test set. Current tool setup is Windows-specific; document the supported platform first, then add a small portable verified path only if judge/contributor requirements demand it.
- Add **stateful multi-pot invariants**: no entitlement exceeds that pot's recorded deposits, aggregate claims conserve obligations, one check-in/claim per eligible wallet, no-show cannot claim when K>0, all-no-show refunds, donations do not affect rewards, third-party caller cannot redirect funds. Actual randomized sequences and seeds must be recorded.
- Add token failure fixtures for revert/false/malformed return, incoming fee delta, reentrancy attempts and claim-transfer failure rollback; ERC-1271 invalid/reverting signatures and malformed/high-s EOA proofs. These are targeted development tests; formal security testing requires enforced isolation and does not become an audit certificate merely by running Foundry.
- Map each guarantee to a distinct assertion and evidence tier. Existing35 executed cases include inherited repetitions and one payout fuzz property; don't relabel them35 distinct requirements or add empty tests to match StudyStake's badge.

### P1. Complete the argument: a pilot, proof, deck and video

The [official rubric](https://team1vn.xyz/) is technical25 / Avalanche25 / creativity15 / impact15 / pitch10 / UI-demo10. These are criterion weights, not predicted points for us.

- A short bilingual use-case explanation: a consenting university club or workshop with limited seats/preparation costs, voluntary participants and staffed check-in. Not mandatory class attendance or a real-money investment proposition.
- Compare honestly with Google Form + bank transfer: both can record attendance; our value is inspectable custody/financial rules and deterministic reconciliation, offset by wallet/gas and human-verifier friction.
- Conduct a consented test-token usability exercise or pilot. Record actual sample, completion, wallet failures, verifier attempts and claim success, plus organizer reconciliation effort. Synthetic accounts are not five users. Worthless test stakes cannot establish a reduction in real no-show rates; a stronger causal claim needs a suitable comparative study.
- Produce accessible slides and required **2–3 minute video**, showing one complete outcome and one correctly denied wrong action with actual recorded receipts. Pre-staged transactions/time compression are disclosed. The video is a network-failure fallback, not a substitute for a working HTTPS/Fuji release claim.
- Verify repository/slides/video access as a fresh judge before submission. CommitPot is already public, but submission/account actions remain separately authorized; this planning pass does not submit anything.

## 5. Consequential decisions to return to the human

| Decision | Recommended bounded choice | Why this is not an automatic engineering change |
|---|---|---|
| Financial bargain | Keep **opt-in Test USDC forfeiture** for this MVP, with plain disclosure and modest configurable stake. | Sponsor/no-loss rewards move toward StudyStake and change the product. Real-life emergencies and unequal resources make forfeiture a fairness tradeoff, not an unqualified benefit. |
| Event cancellation / verifier failure | Keep existing bounded-demo limitations explicit; decide a separate remedy design before broader adoption. | After partial attendance, verifier loss can unfairly penalize others. Cancellation, verifier rotation, disputes or exceptions alter authority/entitlements and cannot be implemented as a UI-only fix or admin withdrawal. |
| Event context and privacy | Approve a public showcase brief bound to chain/core/pot; keep private logistics out-of-band. | Shared editable metadata needs ownership/authentication and privacy/storage choices. A copied QR also does not prove wallet ownership; event staff policy must be honest about that. |
| Wallet access | Improve guided injected-wallet/gas readiness and wallet-free reading first. | Embedded wallets, permits, paymasters and relaying add provider, token compatibility, custody/operation and abuse boundaries. Consider only after observing actual onboarding failures. |
| Release permission | Authorize a named testnet signer/funding, Fuji broadcast, token selection, host/project and exact release revision separately. | Prior GitHub publication approval does not authorize wallet transactions, new account services or public hosting. Multisig requirements need actual organizer evidence, not assumption. |

## 6. Orchestration to implement once authorized

The lead remains responsible for specification, scopes, dependencies and acceptance. Use `cliproxyapi/astra/max` specialists under the user's current routing preference; fresh checker differs from maker. Do not create recursive managers or copy competitor code/assets.

| Workstream | Exclusive scope to assign | Dependencies and completion proof |
|---|---|---|
| Protocol / recovery owner | Shared pending/receipt types, repository port and exact intent validation; application recovery/history orchestration | Owns cross-layer receipt contract first. Regression cases F2–F5, no unknown outcome erased, no duplicate writes. One owner for shared interfaces, not simultaneous edits by UI/chain makers. |
| Verifier interaction owner | Scanner/manual candidate state and role-specific desk UI; no receipt schema or financial rules edits | Consumes frozen receipt/state API; F1 and out-of-order candidate tests, EN/VI, phone/keyboard/physical-device evidence at its true level. Shared app component edits serialized with recovery owner. |
| Evidence / release owner | Deployment/build manifest, generated ABI parity, read-only proof component/data and release scripts; no application policy rewrites | Consumes tested protocol; local proof first, public Fuji/HTTPS only after permission. Source/deployed immutables/runtime identity and historical/live proof classes explicit. |
| Product presentation owner | Approved event brief, “Events” labels, exact financial/trust copy, judge explanation, deck/video source | Human metadata/privacy decisions; no assumed cancellation, identity, no-loss or APY claims. No separate database by default. |
| Assurance owner | Own CI and assigned new unit/invariant/edge-case tests, no production fixes | Runs actual assertions on frozen candidate; false/missing/skipped evidence stays visible. Source mismatches invalidate acceptance, not silently refreshed old reports. |
| Independent acceptance checker | Read-only source plus isolated permitted test/browser evidence; own review files | Adjudicates confirmed findings, public proof and required flows after maker closure; source/build/browser/testnet evidence remain separate. |

### Dependency order (not a calendar)

1. Freeze expected-intent/recovery and QR state invariants.
2. Repair bounded correctness and disconnected reads; improve native wallet/gas/desk feedback.
3. Build reusable context-rich receipts and wallet-free proof view, approved event brief and guarantee-to-test map.
4. Run new CI/local invariants and fresh multi-device/candidate/reload/negative-control evidence.
5. After explicit release permission, deploy the exact reviewed artifacts and verify the public Fuji lifecycle/HTTPS judge URL.
6. Rehearse and publish accessible supporting material; user controls organizer submission.

## 7. What “finished” should mean

No promise of perfection. A release is acceptable when a fresh disconnected judge can identify an event, understand the trust/loss policy, verify a source-bound public Avalanche settlement and inspect a correctly labelled negative control; a real participant and verifier can complete the chosen flow on the supported devices without losing or misattributing an uncertain transaction; the declared test suite/CI matches the release revision; and supporting links work without hidden credentials. Every remaining limitation stays visible.

**Anti-goals:** no AI judge, yield vault, NFT badge, LMS oracle, marketplace, cross-chain solver, custom L1, real-money launch, fabricated adoption, copied competitor visuals or technology-for-points expansion. Do not sacrifice a complete, honest attendance agreement to look broader.

## Research artifacts

- [Evidence matrix and discovery limits](<COMPETITOR_MATRIX.md>)
- [Lead source adjudication notes](<LEAD_FINDINGS.md>)
- [Research state / specialist identities](<RESEARCH_STATE.md>)
- [Social-finance comparison](<workers/social-finance.md>)
- [Judge-evidence comparison](<workers/judge-evidence.md>)
- [Onboarding/demo comparison and limits](<workers/onboarding-demo.md>)
- [Current technical gaps](<workers/technical-gaps.md>)
- [Product strategy and human policy choices](<workers/product-strategy.md>)
- [Fresh independent priority adjudication](<workers/priority-adjudication.md>) supports the bounded recovery/QR/read-only fixes and critical gated public Fuji proof. It correctly challenged an initial cache provenance gap; [later already-existing page observations](<EVIDENCE_CACHE.md>) now explicitly supply that provenance. No fresh GitHub requests or inferred source audit were used to resolve it.
- [Synthesis disposition](<REVIEW_DISPOSITION.md>) records accepted findings, scope guards and evidence limits. This document is a proposal and changes no code or external runtime.
