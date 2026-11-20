# Lead adjudication notes — source and competitive evidence

## What is independently known

Reviewed CommitPot at local commit `fea386bdde0bf6051af1116790f0762609dcf891`, clean before research. Existing completed local verification is real historical evidence; this pass ran no build, unit suite, wallet, deployment or live local UI. Current 3100 listener absent. Git publication and public visibility already occurred, despite older local README/STATE wording.

Official rubric weights Avalanche and technical implementation equally at25points each. The organizer explicitly hides actual submissions from other teams. Public GitHub search found self-identified projects, not the complete entrant list or judge ranking. No competitor commitSHA/tree was obtained before anonymousAPI403; detailed README and ordinary livepage text were successfully captured. This is a fair product/evidence comparison, **not a certified competitor code-quality audit**. No totaltestcount, techwordcount or stars used as rank.

## Most useful competitive observations

1. **StudyStake** is close on student commitments, but not the same bargain. Its README says principal remains claimable subject to vaultloss; rewards depend on course-completionoracle/yield/bonus. CommitPot intentionally redistributes offline attendance no-show deposits without a vault. Learning: concrete course/event identity, public explanation and proof route, honest simulated-yield disclosure. Do not copy vault/guardian/oracle system as superficial parity.
2. **MissionPay** offers a rendered no-wallet judge page with negative/positive receiptcards, source/version limitations and explorer links. Actual page text observed; RPCresults weren't independently checked. Learning: judge-verifiable proof inoneentrypoint and clearly separate sourceHEAD fromdeployedbytecode. No need AI/passkey/ICM to reuse that evaluation pattern.
3. **Pact** renders a mobile payment entrypoint, explicittesttokenlanguage andpasskeyentry. READMEclaims gasless and timing/multichain settlement; not personally measured. Learning: reduce wallet/gas confusion. Do not adopt backendsolver/AA/paymasterwithoutuserneedandseparatekey/custodyreview.
4. **AvaHui** renders a complete localizedusecasestoryand concreteexample. Collateral/yield/0%risk/sub2sclaims are marketinguntilvalidated, notnewCommitPotpromises.
5. **AgentLeash** publicpage presents read-only policy/explorerentry; observedloading states, notproofthatallbalancesloaded. Pattern=read-onlyinspectionbeforeauth.
6. **IntraCampus/Sixduck** READMEexplicitlyseparatelocalproofandpendingpublicnetworkroutes. Technologybreadthdoesnotautomaticallyestablishreadiness. **ScamLens** demonstratesproduct-specificsample/benignnegativecasepatternatREADMElevel; do notaddAItoattendancejusttomatch.

## Accepted source findings (no runtime reproduction in this pass)

| ID | Finding and source | Classification / smallest proposed acceptance |
|---|---|---|
| F1 | Camera detection callback writes new qrInput only (`CommitPotApp.tsx:112`); manual input clears candidate/present (`:229`); recordAttendance uses existing candidate (`:180–188`). Scanning B after inspecting/attesting A can leave A actionable. | Confirmed state-invalidation gap by staticcontrolflow, notproofinvalidsignature/fundtheft. One ingestionfunctioninvalidatescandidate/attestationonanyinputsourceandcontext/account/potchange. TestAattested→scanB:AbuttoncannotrecorduntilBreinspectedandfreshlyattested. |
| F2 | Reconcile clears pending and refreshes but omits confirmedactivity append/persistence (`:153–166`), unlike normal transact (`:138–142`). | Confirmed receipt-continuity omission. Sharedconfirmedoperationhandlingonceforallpaths, matchedintentreplay-safe;reconcilesuccesssurvivesreloadwithoutduplicateactivity. |
| F3 | Init sets runtime then parses pending; parse throws at `:71–74`, leaving Reactpendingnull; next operation overwritesglobalPENDING_KEY (`:130–131`). | Confirmed fail-open recovery-controlpathforinvalidsavedrecord, notautomaticonchainfundloss. Recoveryblocked/quarantinedstatepreservesrawbytesandknownreferences; explicitvalidatedexport/resetnotautomaticoverwrite. Testcorruptpending+livehashblocksnewsubmissionuntilresolvedchoice. |
| F4 | Storage removal may throw inside success/catch (`:136,:149,:162`), then errorhandlingcanthrowagain. | Source-grounded recoveryrobustnessgap. Separateknownonchainsuccessfromoptionalhistory/pendingcleanup;showconfirmedreceipt + storagewarning,noblindresend. Faultinjectset/remove/quotaexceptionatintent/hash/receiptstages. |
| F5 | waitForTransaction accepts hash only and verifies supported destination/function/event class (`repository.ts:104–134`); PendingOperation lacksbeneficiary/config/proofnonce/expectedcalldata (`pending.ts:2–13`). | Confirmed missingexpected-intentbinding, impactiswrongactivity/intentclearingforincorrectrecoveryhash,NOTfundredirectionclaim. Persistoperationfingerprint/nonce/account/chain/core/pot/argsandcompareactualtx/receiptbeforeclear; forgedorcancelled/repriced/differentpot receiptmustnotfulfilwrongintent. |
| F6 | refresh awaits listPots+wallet+timestamp before selectedgetPot; failureclearspot (`CommitPotApp.tsx:79–90`). listPotsfansoutlatest30every5s (`repository.ts:69–74`). | Confirmed availabilitycoupling; simulate unrelatedlist/walletRPCfailureand selectedvaliddeeplinkstillrenderfinancialrules/proof with localizedpartialerror. Reuseexistingpublicclient, no duplicateadapter/indexer. |
| F7 | Only injectedwindow.ethereum supported; nativegasbalance/estimate/readinessnotexposed;connect/walletswitchthrowrawerrors (`browser.ts:17–29`,walletporttokenonly). | Verified capabilitygap, notsecuritybug. SeparateTestUSDCdepositbalancefromAVAXgas,missingwallet/wrongchaininstructionsandread-onlyfallback;donotstartembeddedwallet/paymasterprojectbydefault. |
| F8 | Event title/place/creator/contextabsentfromPotConfig; UIgenericpotsandglobalfeedlabelled'Your events'; localactivitysixentriesunlinkedhashes. | Verified presentation/evidencegap. RelabelEventsunlessactualownershipfilter;publicdemoeventcontextboundtochain/core/pot, clearlynon-authoritative;fullcopyablehash/block/from/to/status/amount/explorer+sourceversion. Sharedmetadataauth/privacyneedsdecision. |

## Priority logic to preserve

- Fix F1–F6 before advertising production robustness or expanding wallet features. No immutablefundrulechange needed.
- PublicFuji+HTTPSdemo+deploymentmanifest+read-onlyproofpage is a critical acceptance gate, not permission granted by this research. Existing Anvil proof is a strong base but does not earn a claim that our Avalancheintegrationispubliclyverifiabletoday.
- Keep a single smallattendanceproduct. Preserve EN/VI, no-adminwithdrawal, fixedrules,coreboundEIP712,permissionlessfinalize,beneficiarysafeclaims,zeroattendance refunds andexactdust.
- Add CI/reproduciblesetup and statefulmulti-pot invariants/failuretokenfixtures to closeactualcoverage, never inflatecountsfrominheritedcases. Nocompetitorsecurity/vulnerabilityclaimwithoutsourceandvalidatedboundary.
- Pilotimpactmustbereal: recruitconsentingorganizer/participants,testtokensonly,measurecompletedjourney/walletpromptfriction/checkinmedian+p95/refundunderstanding,do notfabricateno-showreduction.
