// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {CommitPot} from "../../src/CommitPot.sol";
import {LocalTestUSDC} from "../../src/LocalTestUSDC.sol";
import {EIP712AttendanceVerifier} from "../../src/EIP712AttendanceVerifier.sol";
import {EqualSplitStrategy} from "../../src/EqualSplitStrategy.sol";
import {CommitPotHandler} from "./CommitPotHandler.sol";

/// @dev Stateful local-only accounting campaign. Handler selectors are explicit so
/// controller-only settleAll and view helpers cannot enter the random call table.
contract CommitPotInvariantTest is Test {
    LocalTestUSDC internal token;
    CommitPot internal core;
    CommitPotHandler internal handler;

    function setUp() public {
        vm.warp(100);
        token = new LocalTestUSDC();
        core = new CommitPot(address(token), address(new EIP712AttendanceVerifier()), address(new EqualSplitStrategy()));
        handler = new CommitPotHandler(core, token);

        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = handler.advanceCampaign.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_campaignAccountingMatchesIndependentGhostLedger() public view {
        handler.assertPerPotAccounting();
        handler.assertAttendanceAndClaims();
        handler.assertAggregateAccounting();

        // Assertions are active during the actual random sequence, not in an unused
        // post-invariant hook: at call 24 all six pots must be funded concurrently;
        // by call 56 every planned branch/lifecycle must have executed non-vacuously.
        CommitPotHandler.Metrics memory m = handler.getMetrics();
        if (m.calls >= 24) {
            assertEq(m.creates, 6, "random campaign did not create six pots");
            assertEq(m.joins, 18, "random campaign did not fund six pots");
            assertGe(m.maxFundedOutstandingPots, 2, "no simultaneous funded multipot liabilities");
        }
        if (m.calls >= 64) {
            assertEq(m.checkIns, 10, "random campaign missed planned attendance");
            assertEq(m.finalizes, 6, "random campaign did not finalize each pot");
            assertEq(m.claims, 16, "random campaign did not settle all entitlements");
            assertEq(m.donations, m.calls, "one donation per random handler call");
            assertEq(m.calls, m.creates + m.joins + m.checkIns + m.finalizes + m.claims + m.skipped);
            assertGt(m.skipped, 0, "expected bounded post-campaign no-ops");
            assertEq(m.dustPots, 2, "dust branch count");
            assertEq(m.dustBonuses, 2, "dust bonus count");
            assertEq(m.refundPots, 2, "K=0 refund branch count");
            assertEq(m.refundClaims, 6, "K=0 refund claim count");
            assertEq(m.emptyPots, 0, "random campaign intentionally creates funded pots only");
            assertEq(m.noShowRejections, 2, "K>0 no-show rejection count");
            assertEq(m.duplicateJoinRejections, m.joins);
            assertEq(m.duplicateCheckInRejections, m.checkIns);
            assertEq(m.duplicateClaimRejections, m.claims);
            assertEq(m.duplicateFinalizeRejections, m.finalizes);
        }
    }

    /// @dev Seeded scheduler replay proves complete economic transitions and emits
    /// measured counters. It is not arbitrary random action-order testing; the Forge
    /// invariant above is the independent randomized call-sequence campaign.
    function test_seededCampaignReplayReportsNonVacuousTransitions() public {
        uint256 seed = 0x5eedc0de;
        for (uint256 i; i < 64; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 actorSeed = uint256(keccak256(abi.encode(seed, "actor")));
            uint256 donationSeed = uint256(keccak256(abi.encode(seed, "donation")));
            handler.advanceCampaign(seed, actorSeed, donationSeed);
        }
        CommitPotHandler.Metrics memory m = handler.getMetrics();
        assertEq(m.calls, 64);
        assertEq(m.creates, 6);
        assertEq(m.joins, 18);
        assertEq(m.checkIns, 10);
        assertEq(m.finalizes, 6);
        assertEq(m.claims, 16);
        assertEq(m.donations, 64);
        assertEq(m.skipped, 8);
        assertEq(handler.economicTransitions(), 120);
        assertEq(m.dustPots, 2);
        assertEq(m.dustBonuses, 2);
        assertEq(m.refundPots, 2);
        assertEq(m.refundClaims, 6);
        assertEq(m.noShowRejections, 2);
        assertEq(m.duplicateJoinRejections, 18);
        assertEq(m.duplicateCheckInRejections, 10);
        assertEq(m.duplicateClaimRejections, 16);
        assertEq(m.duplicateFinalizeRejections, 6);
        assertGe(m.maxFundedOutstandingPots, 2);
        console2.log("seeded_replay initial_seed", uint256(0x5eedc0de));
        console2.log("seeded_replay calls/skipped", m.calls, m.skipped);
        console2.log("seeded_replay creates/joins/checkIns", m.creates, m.joins, m.checkIns);
        console2.log("seeded_replay finalizes/claims/donations", m.finalizes, m.claims, m.donations);
        console2.log(
            "seeded_replay skipped/economicTransitions/maxFundedOutstanding",
            m.skipped,
            handler.economicTransitions(),
            m.maxFundedOutstandingPots
        );
        console2.log("seeded_replay dustPots/dustBonuses/refundPots", m.dustPots, m.dustBonuses, m.refundPots);
        console2.log(
            "seeded_replay refundClaims/noShow/duplicateJoin",
            m.refundClaims,
            m.noShowRejections,
            m.duplicateJoinRejections
        );
        console2.log(
            "seeded_replay duplicateCheckIn/duplicateClaim/duplicateFinalize",
            m.duplicateCheckInRejections,
            m.duplicateClaimRejections,
            m.duplicateFinalizeRejections
        );
        handler.assertPerPotAccounting();
        handler.assertAttendanceAndClaims();
        handler.assertAggregateAccounting();
    }

    /// @dev Deterministic scenario matrix supplements randomized invariant sequences:
    /// one dust-bearing K>0 pot, one K=0 refund pot, and one empty pot. Each flow
    /// exercises successful joins/finalization/claims through the same ghost ledger.
    function test_statefulScenariosCoverDustRefundAndEmptyPot() public {
        handler.createPot(3, 0); // odd-stake fixture maps seed 3 to stake 7
        uint256 dustPot = 1;
        handler.join(dustPot, 0);
        handler.join(dustPot, 1);
        handler.join(dustPot, 2);
        handler.checkIn(dustPot, 0);
        handler.checkIn(dustPot, 1);
        handler.finalize(dustPot); // 3*7 / 2 => base 10, dust 1
        handler.claim(dustPot, 0);
        handler.claim(dustPot, 1);

        handler.createPot(0, 0); // stake 1, no check-ins => full refunds
        uint256 refundPot = 2;
        handler.join(refundPot, 0);
        handler.join(refundPot, 1);
        handler.finalize(refundPot);
        handler.claim(refundPot, 0);
        handler.claim(refundPot, 1);

        handler.createPot(0, 0);
        handler.finalize(3); // N=0, K=0
        handler.settleAll();

        CommitPotHandler.Metrics memory m = handler.getMetrics();
        assertGt(handler.economicTransitions(), 0);
        assertGt(m.joins, 0);
        assertGt(m.checkIns, 0);
        assertGt(m.finalizes, 0);
        assertGt(m.claims, 0);
        assertGt(m.dustPots, 0);
        assertGt(m.dustBonuses, 0);
        assertGt(m.refundPots, 0);
        assertGt(m.refundClaims, 0);
        assertGt(m.emptyPots, 0);
        assertGt(m.noShowRejections, 0);
        assertGt(m.duplicateJoinRejections, 0);
        assertGt(m.duplicateCheckInRejections, 0);
        assertGt(m.duplicateClaimRejections, 0);
        assertGt(m.duplicateFinalizeRejections, 0);
        handler.assertPerPotAccounting();
        handler.assertAttendanceAndClaims();
        handler.assertAggregateAccounting();
    }
}
