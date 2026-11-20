# Actual chain adapter

## Current inspected additive boundary

[Browser factory](<../apps/web/src/infrastructure/avalanche/browser.ts>) now exports the canonical `createPublicBrowserReader(): Promise<{ repository: AvalanchePotRepository; publicClient: PublicClient }>`; it constructs no wallet client and never reads `window` or injected accounts. Repository constructor accepts a nullable wallet client for public-only reads. Existing no-arg connected `createBrowserRuntime()` stays distinct; no extra aliases/options are introduced.

Writes/signing accept optional captured `OperationContext`, recheck actual RPC/wallet chain and selected account after stage callbacks and before send, and preserve explicit viem local Account objects. The exact [domain additions](<DOMAIN_API.md>) describe stage-aware certainty and contextual receipts. `waitForTransaction(hash,intent?)` checks canonical actual calldata, sender/target/core/chain and appropriate events/state at the receipt block. Known reverts must bind the full expected intent before recovery may retire pending state; cancellation/different replacement/mismatch cannot settle another intent. Equivalent repricing requires identical from/to/input/value/nonce and associates original `requestedHash` with the effective `hash`.

Current [independent adapter execution](<improvements/luna/L32/HANDOFF.md>) passed one disposable owned Anvil31337 case: five10-token deposits, four actual typed check-ins, four12.5-token beneficiary payouts, zero residual and cross-core/intent/historical-claim/public-reader negatives. [Receipt fixtures](<../apps/web/tests/acceptance/receipt-binding.test.ts>) separately cover repricing/cancellation/revert/retention with inert clients. These are local tests, not Fuji deployment, physical presence/ownership proof or source/runtime certification. Older concise baseline description follows.

`AvalanchePotRepository(publicClient,walletClient,context)` in infrastructure/avalanche/repository implements publishedIPotRepository/IWalletPort. Explicitlocalclientaccountishonored; injectedbrowseraccountcomesfromcurrentprovider. CoreABI generatedfromcompiledFoundryartifact via scripts/abi/export.mjs. Standarderc20Abifromviem, nothandwrittenCommitPotABI.

Factory browser/createBrowserRuntime requires explicitnonmockmode, matchingchainID/localvsFuji, loopbackRPCforlocalorHTTPSforFuji, nonzerocore/tokenaddress. validateDeploymentchecksactualchain/code/supportedToken/sixdecimals. Missing/invalidmodeconfigfailsclosedandneverfallbackstomock.

Readmethodsmaptypedcontracttuples/countsbigint/safeuint64timestamps. listPotsboundedlatest30, directIDlookupretained. Writes simulateactualoperationbeforewalletprompt, waitforsuccessfulreceipt, decodeactualdestination/input+expectedcoreeventorapprovespender. CreateIDcomesfromthatcorePotCreatedevent. Failedreceiptreturnsfailure; transportunknownisnotrelabeleddefinitivefailure. Walletrejectionretainsknown4001code. SignCheckInusesruntimechain/coreEIP712CommitPot1andexactspecifiedfieldtypes; walletmustmatchconfiguredverifier.

LocaltestRPCwalletsonlyfixtures, noproductionprivatekeys/testwalletbackdoor. BrowserintegrationforwardsitsisolatedtestproviderrequeststoownedAnvil31337; noexternalaccountsigningpermissionorFujideploymentclaim.
