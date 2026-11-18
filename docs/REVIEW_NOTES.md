# Lead source-reading notes — provisional, not acceptance

The lead reads actual source and coordinates; it does not edit code or execute tests. All makers retain their assigned source scopes until actual closure. Do not apply fixes concurrently on another maker's WIP.

## Contract source snapshot

Read initial src/CommitPot.sol in full,236 lines, and flat helper/strategy/types files. Present lifecycle has immutable supportedToken/helper/strategy, ID1+, ordered creation deadlines, guardedjoin with exactincomingdelta, coreEIP712+statelesshelper, checkinperpotnonce/1basedorder, finalizethreshold, beneficiarysafeCEIclaim and explicittypedgetters. These are source observations, not compilation or behavioral passes. Initialtypes readpredatedcore and may still be changing; don'tmisreport missingtype as finalcompilererror.

Things independentchecker must verify against finalsource:

- join executes transfer before membership/counter effects but nonReentrant guardsfund paths; ensure ownedcallbackfixtures cover rule integrity and atomicity rather than calling any departure from genericCEI a vulnerability.
- createPot has no externalcall; arbitrarysenderallowed per specification. Constructorcodechecks don't prove dependencysemanticcorrectness; actual immutabledeploy artifacts matter.
- finalize calls pure strategy through interface and onlythen setsstatus with guard; verify K<=N consequence and payout math; unsupportedK>N directstrategy policy needs clearstatement not falsefundexploit.
- hashCheckIn can hash a nonexistentpot as puretypeddatautility but nofundoperation bypass because checkinvalidatesID; don't treat helperdigest availability as paymentauthority.
- Publicmapping getters returndefault for unknownIDs asSolidity semantics, while authoritativegetPot/getParticipantStatus/claimable validate. Frontend must use explicitgetPot and no publicgetterzero as existingpot.
- Currentcoreseparatespotobligations fromtokenbalance asneeded, but exactoutgoingtransfer/functioningissuerassumption remains disclosed rather than generalizedtokencompatibilityclaim.
- Meaningful integrationverification still entirely pending: actualcompiler, receipts,digestcrosslanguage, zero/refund/dust/allclaims, two pots/donations, realbrowser/sourcefreeze.

## Lifecycle test source finding — wait for maker closure

Read new test/unit/CommitPotLifecycle.t.sol186L. In test_fiveWalletsFourCheckInsSplitAndNoShowReverts, five deposits sum50,000,000 and four claims12,500,000 each sum50,000,000. Line74 currently expects core token balance10,000,000, which is mathematically wrong; expected0. This is a confirmed assertion defect from source/arithmetic, not an executed productfailure. Testmaker070 still ownsfile; do NOTcoedit. Afteractualclosure, assign sole testfixer to replaceonlyexpectedbalance thenexecuteactualforgewhenavailable. Other sourcefixtures need time/signatureboundarycoverage later; no tests passedyet.

## Current dependent work

DOMAIN_API.md is written before domainimplementation, deliberately to unblock interfaces. UI/chain makers must verify actualexports before compile. No sourcewriting owner is replaced from an old note. QRschema is independentmaker-owned; manifest/ABI/integration ownership remain single.
