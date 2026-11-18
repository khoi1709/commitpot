# Independent acceptance — execution after maker closure

No checker assigned yet. This is the lead's acceptance specification, not a test result or instruction to inspect moving WIP as a release. Read current execution contract and exact source API after all relevant scopes close; record source identity before tests and after. Independent checkers never modify production files, domain API, manifests or another owner's tests to get green.

## Contract check

- Exact supported-token constructor validation, nonzero/code dependency checks, existence1+, immutableconfig, no adminwithdraw/setters/proxy/payoutloops.
- Every time edge one second before/at/after. Joinexclusive, checkininclusive, finalizeexclusive. uint64proofdeadline parity, no overlappingfuturejoin/checkin.
- Complete5*10e6,4checkins=>4*12.5e6; noparticipant rejected; duplicatejoin/checkin/finalize/claim; K0refundall; empty;allattend; dust5/3 earliest2+1baseunit; interleavedpots/donations do not change obligations.
- Failedincomingtransfer rollsbackjoined/counter; failedclaimtransfer rollsbackclaimflag; senderthirdparty never redirectsbeneficiary; nohallucinatedreentrancy result from meremodifier.
- EIP712 typehash exact, coreaddress/runtimechain; sign viem golden vectors matches hashCheckIn/solidity; wrongchain/core/helperreuse/pot/participant/nonce/deadline/signer/malformedEOA denied. Replayusednonce/checkedin distinct constraints; copiedvalidproof onlysameoutcome. ERC1271 pass/fail validation does not establish Safe collectionUX.
- Puremath includesinvalidK>N/overflowchecks; Uint256limits; proportionalcomplexityconstant. Fuzzactualselectedcount/seeds/duration recorded. Fresh modelverifier after meaningful repair.

## Domain/mock check

- Actual exported code not a toy duplicated machine. Portreturnshashes+receipt/potID; fullmoneybigint, parseprecision/noexponent/overflow rejection, countsordersnonnegative.
- Mocktrustedproof issuer checks not anysignature; mockrole/accountswitch visible, chaincontextforkdescriptionshonest, nocryptoproofclaim. Storage reload validates entire schema, preservesoriginalcorrupt/futurebytes, norewriteonimport, mockedlatencyactualreceiptdistinct.
- Statechangesatomicif persistence fails, no partial balances or repeatedpayments. Two tabs/storage stale policy explicit, no silent loss.

## Browser/local-chain acceptance

Use one project-owned assigned server and temporary browser profile, no existing userbrowser/profile, securityflagchanges or debugstateinjection. Local testaccounts must be fixture-only never shipped publicclient. Don't start servers or install tooling without exact assignedscope; no Fuji/realwallet/networkscan.

- Fullnative UI mockcreate/share/open/approve/join/QR/attest/checkin/finalize/claim. Role/clockcontrols mockonly and labelledsynthetic, store reloadstable.
- Real localchain5distinctwallet complete lifecycle with actual EIP712/allowance/receipt; decodedcoreeventcreateID, onchain balances/entitlements/laterclaims exact. Stubbedprovider/mocks not actualintegrationproof.
- EN/VI languagecontrol everywhere, keepspot/account/pendingstate, translatedfinancialtrustmeaningconsistent. Correctdocumentlang and timezone.
- Wrongwallet/chain, insufficientfunds/gas/allowance, rejection/timeout/replacement/revert, duplicateandpendingclicks, unknowntxbroadcast/nohashnotblindresend, no fallbackreal→mock.
- Cameraaccept/deny/unavailable/manualfallback, unknownQR/pot/version/address/size, contextmismatch, nocameraleak, invalidproof/expired/repeat, finalreceiptrealconfirm.
- Observedesktop/mobile390+lowheight: readableamounts/time/longaddresses, keyboardfocus/noncolorstatus/reducedmotion/44targets, nooverflow/overlap, staticserverhydration noerrors.
- Screenshotfiles must be opened and show actualstate; hashsourceidentity stated; no claim of physicalphonecamera or externalwalletpermissions from viewportemulation.

## Closing report

Provide exact commands/exits/testnames/skips/evidencepaths, confirmedfindingswithsource/trigger/smallfix, sourceidentity, coveragegaps and explicitreadonlyscopeclosure. Source/build/staticUI/livebrowser/localchain are separate evidencelevels. Do not call tests unrun, scriptprepared or workerdispatched a pass. Formal security target-code validation requires OS offline isolation; if unavailable label that coverageunverified, not hostexecutionasformal audit.
