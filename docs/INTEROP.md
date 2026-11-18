# CommitPot — current integration notes

Coordination only; no change of source ownership from this file. Read active EXECUTION_CONTRACT and actual APIs. Lead never edits makers' code.

## Published interfaces

- docs/DOMAIN_API.md published actual frontend contract: bigint PotId and counts, number timestamps; IPotRepository includes getChainContext/listPots/getTokenInfo/getChainTimestamp, writes return hash and waitForTransaction returns confirmed receipt/createdPotId; wallet port getConnection/getTokenBalance/getTokenAllowance/approveToken/signCheckIn. Domain/mock implementation remains maker-owned; published docs alone are not compile evidence.
- Contract worker source currently uses flat packages/contracts/src/{PotTypes,IAttendanceVerifier,IPayoutStrategy,EIP712AttendanceVerifier,EqualSplitStrategy}. Paths differ from initial folder illustration, not a duplicate architecture. Final ABI generated from actual artifact; no hand ABI.
- QR parser/schema remains a separate reserved component, but maker9b39 finalFAILED with no files and no current QR writer. Futurechain consumes only the eventual authoritativecodec, not a secondvalidator.
- UXd1fa and replacement27ad plus UI1bdd finalFAILED with no artifacts. Both EN+VI and delegatedvisualchoice remain direct human requirements; no actual direction/stylesheet/interface exists yet. Scope released, not accepted.

## Important final checks (risks, not claims of defects)

- Public equal-split helper should define invalid K>N policy even though core enforces checkedInCount<=joined. Don't claim live exploit from missing guard alone.
- Signature domain must be runtime chain/core, stateless helper accepts digest. EOA/ERC1271 library returns errors/failures handled, copyingproof onlysamebeneficiary. No nonce uniqueness-by-signature assumptions.
- DOM/mock numbertimestamp and Solidity uint64 need explicit validated integer range. Frontendbigint256 and canonical QRID limit must agree. No parseFloat tokenmoney.
- Mockbrowser storage corrupt/future bytes are preserved; latency/receipt vsstate equality explicit; no localStorage importsideeffects. Mocksigner cannot accept arbitraryunissuedsignature.
- Dev mock role/clock switches must not appear in real adapter, and realconfig errors cannot fallback to mock. No testwallet publicclient keys.
- Sourcefreeze once writers close, then independentchecker tests actual code. Per-worker scoped tests while othersWIP may report foreignerrors honestly, not coedit or falselyglobalPASS.

## Tooling scope

Priorbootstrap4a/b6 and minimalconfig957 finalFAILED with no configs; no installer active. Single rootmanifest writecheckd37edb35 currently reserved. Foundryconfig11e9 and lifecycletest070 each separate scope remain reserved until closingnotice. No TOOLING_STATUS/toolchainexistsyet. Do not guess globallyinstalledforge/npxautoinstall or infer configresultfromdispatch. All codeexecution still delegated.

> ⚠️ [DEPRECATED] Approach Flash bootstrap dispatch failed due to the worker ending without a closing report or bootstrap artifacts. Superseded by the explicitly permitted scoped Fosta bootstrap replacement after filesystem reconciliation. This is a route/task failure, not evidence that any application test failed.
