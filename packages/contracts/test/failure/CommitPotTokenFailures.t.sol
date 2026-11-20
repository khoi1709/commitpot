// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CommitPot} from "../../src/CommitPot.sol";
import {PotState, PotStatus, TransferAmountMismatch, AlreadyClaimed, NotEligible} from "../../src/PotTypes.sol";
import {FailureTestBase, ControlledTokenFixture} from "./FailureFixtures.sol";

contract CommitPotTokenFailuresTest is FailureTestBase {
    function test_incomingFalseRollsBackAndCanRetry() public {
        _incomingFailure(
            ControlledTokenFixture.Mode.ReturnFalse,
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
    }

    function test_incomingRevertRollsBackAndCanRetry() public {
        _incomingFailure(
            ControlledTokenFixture.Mode.Revert,
            abi.encodeWithSelector(ControlledTokenFixture.FixtureTransferRejected.selector, ALICE, address(core), STAKE)
        );
    }

    function test_incomingMalformedReturnRollsBackAndCanRetry() public {
        // OZ 5.0.2 abi.decode rejects the one-byte bool with empty revert data.
        _incomingFailure(ControlledTokenFixture.Mode.Malformed, bytes(""));
    }

    function test_incomingFeeRollsBackAndCanRetry() public {
        _incomingFailure(
            ControlledTokenFixture.Mode.IncomingFee,
            abi.encodeWithSelector(TransferAmountMismatch.selector, STAKE, STAKE - 1)
        );
    }

    function test_outgoingFalseKeepsWinnerAndOtherWalletClaimable() public {
        _outgoingFailure(
            ControlledTokenFixture.Mode.ReturnFalse,
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token)),
            true
        );
    }

    function test_outgoingRevertKeepsWinnerAndOtherWalletClaimable() public {
        _outgoingFailure(
            ControlledTokenFixture.Mode.Revert,
            abi.encodeWithSelector(
                ControlledTokenFixture.FixtureTransferRejected.selector, address(core), ALICE, STAKE
            ),
            true
        );
    }

    function test_outgoingMalformedReturnKeepsWinnerAndOtherWalletClaimable() public {
        _outgoingFailure(ControlledTokenFixture.Mode.Malformed, bytes(""), true);
    }

    function test_outgoingFalseKeepsRefundAndOtherWalletClaimable() public {
        _outgoingFailure(
            ControlledTokenFixture.Mode.ReturnFalse,
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token)),
            false
        );
    }

    function test_caughtSameBeneficiaryCallbackHitsGuardAndPaysOnlyOnce() public {
        _caughtCallback(ALICE);
    }

    function test_caughtOtherBeneficiaryCallbackHitsGuardWithoutConsumingOtherClaim() public {
        _caughtCallback(BOB);
    }

    function test_propagatedCallbackFailureRollsBackClaimAndOtherWalletCanClaim() public {
        _finalizeTwo(true);
        token.setClaimCallback(potId, ALICE, BOB, true);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(CALLER);
        core.claim(potId, ALICE);
        _assertBothUnconsumed();
        assertEq(token.callbackAttempts(), 0); // Token-side writes rolled back too.
        assertFalse(token.claimedDuringCallback());

        // The failure is recipient-specific, not a globally disabled token.
        vm.prank(CALLER);
        core.claim(potId, BOB);
        _assertBobPaidAlicePending();
        token.setClaimCallback(0, address(0), address(0), false);
        vm.prank(CALLER);
        core.claim(potId, ALICE);
        _assertBothSettled();
    }

    function test_twoPotsDonationDoesNotEnlargeRewardsOrRefunds() public {
        uint256 second = _createPot(verifierSigner);
        _join(potId, ALICE);
        _join(potId, BOB);
        _donate();
        _join(second, BOB);
        vm.warp(120);
        _checkIn(potId, ALICE, 1);
        vm.warp(221);
        core.finalize(potId);
        core.finalize(second);

        PotState memory firstPot = core.getPot(potId);
        PotState memory secondPot = core.getPot(second);
        assertEq(firstPot.participantCount, 2);
        assertEq(firstPot.checkedInCount, 1);
        assertEq(firstPot.payoutPerWinner, 2 * STAKE);
        assertEq(firstPot.dustAmount, 0);
        assertEq(secondPot.participantCount, 1);
        assertEq(secondPot.checkedInCount, 0);
        assertEq(secondPot.payoutPerWinner, STAKE);
        assertEq(secondPot.dustAmount, 0);
        assertEq(core.claimable(potId, ALICE), 2 * STAKE);
        assertEq(core.claimable(potId, BOB), 0);
        assertEq(core.claimable(second, BOB), STAKE);
        assertEq(token.balanceOf(address(core)), 3 * STAKE + DONATION);

        vm.prank(CALLER);
        core.claim(second, BOB);
        assertTrue(core.hasClaimed(second, BOB));
        assertFalse(core.hasClaimed(potId, BOB));
        assertEq(token.balanceOf(address(core)), 2 * STAKE + DONATION);
        assertEq(core.claimable(potId, ALICE), 2 * STAKE);
        uint256 noShowBalance = token.balanceOf(BOB);
        vm.expectRevert(abi.encodeWithSelector(NotEligible.selector, potId, BOB));
        core.claim(potId, BOB);
        assertEq(token.balanceOf(BOB), noShowBalance);
        assertFalse(core.hasClaimed(potId, BOB));
        assertEq(token.balanceOf(address(core)), 2 * STAKE + DONATION);

        vm.prank(CALLER);
        core.claim(potId, ALICE);
        assertTrue(core.hasClaimed(potId, ALICE));
        assertEq(core.claimable(potId, ALICE), 0);
        assertEq(core.claimable(second, BOB), 0);
        assertEq(token.balanceOf(ALICE), 3 * STAKE);
        assertEq(token.balanceOf(BOB), STAKE);
        assertEq(token.balanceOf(CALLER), 0);
        assertEq(token.balanceOf(address(core)), DONATION);
        assertEq(token.balanceOf(ALICE) + token.balanceOf(BOB) + token.balanceOf(address(core)), token.totalSupply());
    }

    function _incomingFailure(ControlledTokenFixture.Mode mode, bytes memory expected) internal {
        _join(potId, BOB);
        _donate();
        token.setIncomingMode(mode);
        vm.expectRevert(expected);
        vm.prank(ALICE);
        core.joinPot(potId);

        PotState memory pot = core.getPot(potId);
        assertEq(pot.participantCount, 1);
        assertEq(pot.checkedInCount, 0);
        assertEq(uint256(pot.status), uint256(PotStatus.Open));
        assertFalse(core.hasJoined(potId, ALICE));
        assertFalse(core.hasCheckedIn(potId, ALICE));
        assertFalse(core.hasClaimed(potId, ALICE));
        assertTrue(core.hasJoined(potId, BOB));
        assertEq(token.balanceOf(ALICE), 2 * STAKE);
        assertEq(token.balanceOf(BOB), STAKE);
        assertEq(token.balanceOf(address(core)), STAKE + DONATION);
        assertEq(token.allowance(ALICE, address(core)), 2 * STAKE);
        assertEq(token.totalSupply(), 4 * STAKE + DONATION); // Fee burn is rolled back.

        token.setIncomingMode(ControlledTokenFixture.Mode.Normal);
        _join(potId, ALICE);
        assertTrue(core.hasJoined(potId, ALICE));
        assertEq(core.getPot(potId).participantCount, 2);
        assertEq(token.allowance(ALICE, address(core)), STAKE);
        assertEq(token.balanceOf(ALICE), STAKE);
        assertEq(token.balanceOf(address(core)), 2 * STAKE + DONATION);
        vm.warp(221);
        core.finalize(potId);
        core.claim(potId, ALICE);
        core.claim(potId, BOB);
        _assertBothSettled();
    }

    function _outgoingFailure(ControlledTokenFixture.Mode mode, bytes memory expected, bool attend) internal {
        _finalizeTwo(attend);
        token.setOutgoingMode(ALICE, mode);
        vm.expectRevert(expected);
        vm.prank(CALLER);
        core.claim(potId, ALICE);
        _assertBothUnconsumed();

        // Bob succeeds while Alice's controlled failure is still active.
        vm.prank(CALLER);
        core.claim(potId, BOB);
        _assertBobPaidAlicePending();
        token.setOutgoingMode(ALICE, ControlledTokenFixture.Mode.Normal);
        vm.prank(CALLER);
        core.claim(potId, ALICE);
        _assertBothSettled();
        vm.expectRevert(abi.encodeWithSelector(AlreadyClaimed.selector, potId, ALICE));
        core.claim(potId, ALICE);
        _assertBothSettled();
    }

    function _caughtCallback(address beneficiary) internal {
        _finalizeTwo(true);
        token.setClaimCallback(potId, ALICE, beneficiary, false);
        vm.prank(CALLER);
        core.claim(potId, ALICE);
        assertEq(token.callbackAttempts(), 1);
        assertTrue(token.claimedDuringCallback()); // Effects precede the transfer.
        assertFalse(token.callbackSucceeded());
        assertEq(token.callbackResult(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        assertTrue(core.hasClaimed(potId, ALICE));
        assertFalse(core.hasClaimed(potId, BOB));
        assertEq(core.claimable(potId, ALICE), 0);
        assertEq(core.claimable(potId, BOB), STAKE);
        assertEq(token.balanceOf(ALICE), 2 * STAKE);
        assertEq(token.balanceOf(BOB), STAKE);
        assertEq(token.balanceOf(address(core)), STAKE + DONATION);
        vm.prank(CALLER);
        core.claim(potId, BOB);
        assertEq(token.callbackAttempts(), 1);
        _assertBothSettled();
    }

    function _finalizeTwo(bool attend) internal {
        _join(potId, ALICE);
        _join(potId, BOB);
        _donate();
        if (attend) {
            vm.warp(120);
            _checkIn(potId, ALICE, 1);
            _checkIn(potId, BOB, 2);
        }
        vm.warp(221);
        core.finalize(potId);
        assertEq(core.getPot(potId).checkedInCount, attend ? 2 : 0);
        _assertBothUnconsumed();
    }

    function _assertBothUnconsumed() internal view {
        assertFalse(core.hasClaimed(potId, ALICE));
        assertFalse(core.hasClaimed(potId, BOB));
        assertEq(core.claimable(potId, ALICE), STAKE);
        assertEq(core.claimable(potId, BOB), STAKE);
        assertEq(token.balanceOf(ALICE), STAKE);
        assertEq(token.balanceOf(BOB), STAKE);
        assertEq(token.balanceOf(address(core)), 2 * STAKE + DONATION);
        assertEq(token.balanceOf(CALLER), 0);
        PotState memory pot = core.getPot(potId);
        assertEq(pot.participantCount, 2);
        assertEq(uint256(pot.status), uint256(PotStatus.Finalized));
        assertEq(pot.payoutPerWinner, STAKE);
        assertEq(pot.dustAmount, 0);
        assertEq(token.totalSupply(), 4 * STAKE + DONATION);
    }

    function _assertBobPaidAlicePending() internal view {
        assertTrue(core.hasClaimed(potId, BOB));
        assertFalse(core.hasClaimed(potId, ALICE));
        assertEq(core.claimable(potId, BOB), 0);
        assertEq(core.claimable(potId, ALICE), STAKE);
        assertEq(token.balanceOf(BOB), 2 * STAKE);
        assertEq(token.balanceOf(ALICE), STAKE);
        assertEq(token.balanceOf(address(core)), STAKE + DONATION);
    }

    function _assertBothSettled() internal view {
        assertTrue(core.hasClaimed(potId, ALICE));
        assertTrue(core.hasClaimed(potId, BOB));
        assertEq(core.claimable(potId, ALICE), 0);
        assertEq(core.claimable(potId, BOB), 0);
        assertEq(token.balanceOf(ALICE), 2 * STAKE);
        assertEq(token.balanceOf(BOB), 2 * STAKE);
        assertEq(token.balanceOf(CALLER), 0);
        assertEq(token.balanceOf(address(core)), DONATION);
        assertEq(token.balanceOf(ALICE) + token.balanceOf(BOB) + token.balanceOf(address(core)), token.totalSupply());
    }
}
