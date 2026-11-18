# CommitPot — active implementation contract

## Authority

The human first requested planning-only delegation, then explicitly authorized **Implement directly in this session** after repeated builder failures. This current lead now owns direct code/config, project-local setup and local verification, using independent agents when available without repeating failed broad dispatches. This authority supersedes earlier delegation-only statements and calendars. Implementation choices below are lead-selected, not claims of individual human approval. Original downloads remain unchanged. No timelines; execute dependency-ready work and report actual evidence.

Root: C:\AI-workspace\commitpot. Direct implementation/testing is now authorized. No Ares changes. Necessary project-local dependencies and disposable private local-chain fixtures in scope; existing/user keys, real-wallet signing, Fuji broadcasts, Git publication, hosting and submission remain separately gated.

## Fixed business rules

Solidity + Foundry contracts and Next.js/TypeScript/Tailwind/wagmi/viem web app in pnpm monorepo. No real money, fee, admin withdrawal, proxy upgrade, mutable pot settings, database, AI decision or relayer service.

- Supported token immutable per core deployment. createPot rejects any config token other than supportedToken. Token code/nonzero validated. Intended token has six decimals; local fixtures clearly mock. Reject non-exact incoming transfer amount.
- IDs begin at 1. Explicitly validate existence for every read/write; no zero/default pot operations.
- Creation: now < registrationClose <= checkInOpen < checkInClose; stake >0; verifier nonzero. No later edits or cancellation.
- Join: now < registrationClose, once per wallet, fixed stake with safe ERC20 transferFrom and guarded exact balance delta.
- Check-in: inclusive checkInOpen <= now <= checkInClose and now <= deadline. Joined beneficiary, not already checked in, unused per-pot nonce, valid verifier signature. Sender may be anyone; copied proof can only check in the same participant. Increment 1-based checkInOrder once.
- Finalize: now > checkInClose, exactly once, anyone. N=0 yields zero; K=0 refunds each joined wallet stake; K>0 sets floor(N*s/K) and dust=(N*s)%K.
- Claim: finalized, joined and eligible, unclaimed. K>0 requires checked-in; earliest orders 1..dust get one token base unit extra. K=0 refunds all joined wallets. Any sender may call; token always goes to beneficiary. Mark before safeTransfer; revert preserves claim on transfer failure. No payout loop, expiry or sweep.
- Account obligations by pot N*s, never global balance. Direct donations do not enlarge rewards and may remain locked. All deposits settle exactly after all eligible claims; isolated balance zero only without donations/other pots.
- Core domain: EIP712(name=CommitPot,version=1,chainId=runtime block.chainid,verifyingContract=core address). Type: CheckIn(uint256 potId,address participant,uint256 nonce,uint64 deadline). Signature bytes excluded from digest. Stateless helper verify(address expectedSigner,bytes32 digest,bytes signature) external view returns(bool), using standard OZ SignatureChecker for EOA/ERC1271. Core computes complete digest; helper never reconstructs domain. Immutable helper/strategy, no setters. Standard SafeERC20/ReentrancyGuard/EIP712, pin compatible versions, no custom crypto.
- QR v1 JSON exactly {v:1,potId:decimal-string,participant:address}. This identifies a wallet/pot, NOT presence or ownership. Validate size, IDs/address, expected active pot/core/network context. On-site human verifier explicitly confirms presence. Generate random uint256 nonce; deadline=min(chainNow+300,checkInClose). Lost verifier/partial attendance and no dispute handling disclosed. Safe threshold signer collection unresolved external requirement; ERC1271 validation alone is not a Safe signing UI.

## Solidity interface freeze

One core with constructor(address supportedToken,address attendanceVerifier,address payoutStrategy). Use struct types names/fields from preserved TECHSPEC: PotConfig,PotState,CheckInProof; status Open/Finalized. Public operations createPot(PotConfig) returns(uint256), joinPot(uint256), checkIn(CheckInProof), finalize(uint256), claim(uint256,address). Required TECHSPEC events. Add explicit getPot(uint256) returns(PotState memory), getParticipantStatus(uint256,address) returns(bool joined,bool checkedIn,bool claimed,uint256 order), claimable(uint256,address) returns(uint256), nextPotId getter, public mappings as appropriate. Expose digest helper hashCheckIn for golden-vector tests if useful. Pure strategy calculatePayout(uint256 N,uint256 K,uint256 stake) returns(uint256 base,uint256 dust). No frontend handwritten ABI; bootstrap/integration exports built artifact after contracts close.

## Frontend shared boundary — domain owner publishes first

Location apps/web/src/domain/index.ts reexports named models/ports/rules, with imports usable without provider/browser side effects. Domain maker owns exact type definitions but preserve these semantics and public names:

Address=`0x${string}`, TxHash=`0x${string}`; all money/counts/nonces/pot IDs bigint internally, IDs strings at URLs/QR/storage. PotConfig token/verifier/stakeAmount/registrationClose/checkInOpen/checkInClose; timestamps Unix integer seconds. PotSummary includes id,config,status,participantCount,checkedInCount,payoutPerWinner,dustAmount. ParticipantStatus has joined/checkedIn/claimed/order plus exact claimable. CheckInProof has potId,participant,nonce,deadline,signature. TokenInfo address/symbol/decimals; ChainContext chainId/coreAddress/token/mode. Context must distinguish mock/local/Fuji.

IPotRepository reads getPot(id), getParticipantStatus(id,address), getTokenInfo(), getChainTimestamp(), listPots if concise. Writes createPot(config),joinPot(id),submitCheckIn(proof),finalizePot(id),claimPayout(id,beneficiary) return transaction hash; waitForTransaction(hash) returns confirmed success/typed failure and optional createdPotId from core event. Wallet port address/chain connection, token balance/allowance, approveToken exact amount and signCheckIn typed-data. Domain maker may implement combined mock class exposing both ports. Publish actual API in docs/DOMAIN_API.md immediately, then implementation/tests; don't leave consumers guessing. No duplicated payout authority in UI.

Pending operations store public intent before wallet request and returned hash immediately; distinguish unknown outcome from failure. Wait for successful receipts and re-read contract state; don't blindly resubmit. Mock bigint storage uses strings and schema validation, injected clock/latency; no real-mode silent mock fallback. Pure math uses bigint; decimal parse without float. Estimate pool/currentK labelled if attendance closed now, not a guarantee; no K=0 divide; final dust exact.

## Initial scopes

Bootstrap: root manifests/lockfile, apps/web manifests/config only, scripts/tooling, docs/sources and tooling report; preserve source docs with hashes. No apps/web/src or packages/contracts source. Package-contract dependency installation allowed in packages/contracts/lib/node_modules only, coordinated exact versions; contract maker owns foundry.toml.

Domain maker: apps/web/src/domain/**, infrastructure/mock/**, tests/domain/**, tests/mock/**, docs/DOMAIN_API.md. No manifests, UI, Solidity or chain/QR adapter.

Contract maker: packages/contracts/src/**, test/**, script/**, foundry.toml, docs/CONTRACT_API.md and own report. No web or root manifests. Unit/fuzz source can be written before tools arrive; execute only locally available approved toolchain, report unknowns. Independent checker later gets its own tests, not concurrent overlap.

UI/chain scopes assigned after API exists. UI owns presentation/application and camera controls. Personal QR codec/schema is transferred to a separate bounded QR implementer now (apps/web/src/infrastructure/qr, tests/qr, docs/QR_API.md); the future chain adapter consumes it read-only and never writes those files. Integration wiring and ABI exporter assigned one implementer, never lead code edits. Direct human requires both English/Vietnamese language options and delegates visual direction/build.

## Verification acceptance

5*10 USDC with4 attendees=>12.5 each, no-show rejected; N=0;K=0;K=N; dust N=5,s=10000000,K=3=>16666666 base,dust2. Check timestamp endpoints, wrong/nonexistent IDs, duplicate/replay/expired/wrong signer/chain/core/pot/participant, cross-core shared helper, two pots, donations, false/failed transfers and beneficiary-safe claims. Confirm typed digest vs viem on local/Fuji vectors. Ordinary tests/builds and local E2E required; independent review not source certification alone. Formal security exploit testing requires enforced offline isolation; unavailable capabilities remain explicitly unverified. No secrets/live probes. Final UI needs observed desktop/phone/input/error/reload evidence and a real local-chain lifecycle, not mock-only completion.
