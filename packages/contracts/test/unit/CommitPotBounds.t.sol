// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommitPotLifecycleTest} from "./CommitPotLifecycle.t.sol";
import {
    CheckInProof,
    PotState,
    PotStatus,
    PotNotFound,
    RegistrationClosed,
    CheckInNotOpen,
    FinalizeTooEarly,
    AlreadyJoined,
    AlreadyCheckedIn,
    AlreadyClaimed,
    PotAlreadyFinalized
} from "../../src/PotTypes.sol";

contract CommitPotBoundsTest is CommitPotLifecycleTest {
    function test_joinAtRegistrationCloseReverts() public {
        uint256 potId = _createPot();
        vm.startPrank(wallets[0]);
        token.approve(address(core), STAKE);
        vm.warp(110);
        vm.expectRevert(abi.encodeWithSelector(RegistrationClosed.selector, potId));
        core.joinPot(potId);
        vm.stopPrank();
        assertFalse(core.hasJoined(potId, wallets[0]));
    }

    function test_checkInAtOpenIsInclusive() public {
        uint256 potId = _createPot();
        _join(potId, 0);
        vm.warp(120);
        _checkIn(potId, 0, 1);
        assertTrue(core.hasCheckedIn(potId, wallets[0]));
    }

    function test_checkInAtCloseIsInclusive() public {
        uint256 potId = _createPot();
        _join(potId, 0);
        vm.warp(220);
        _checkIn(potId, 0, 1);
        assertTrue(core.hasCheckedIn(potId, wallets[0]));
    }

    function test_checkInAfterCloseReverts() public {
        uint256 potId = _createPot();
        _join(potId, 0);
        vm.warp(221);
        CheckInProof memory proof = _signedProof(potId, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(CheckInNotOpen.selector, potId));
        core.checkIn(proof);
        assertFalse(core.hasCheckedIn(potId, wallets[0]));
    }

    function test_finalizeAt220Reverts() public {
        uint256 potId = _createPot();
        vm.warp(220);
        vm.expectRevert(abi.encodeWithSelector(FinalizeTooEarly.selector, potId));
        core.finalize(potId);
        PotState memory pot = core.getPot(potId);
        assertEq(uint256(pot.status), uint256(PotStatus.Open));
    }

    function test_finalizeAt221Works() public {
        uint256 potId = _createPot();
        vm.warp(221);
        core.finalize(potId);
        PotState memory pot = core.getPot(potId);
        assertEq(uint256(pot.status), uint256(PotStatus.Finalized));
    }

    function test_duplicateJoinReverts() public {
        uint256 potId = _createPot();
        _join(potId, 0);
        vm.startPrank(wallets[0]);
        vm.expectRevert(abi.encodeWithSelector(AlreadyJoined.selector, potId, wallets[0]));
        core.joinPot(potId);
        vm.stopPrank();
        assertEq(core.getPot(potId).participantCount, 1);
    }

    function test_duplicateCheckInReverts() public {
        uint256 potId = _createPot();
        _join(potId, 0);
        vm.warp(120);
        _checkIn(potId, 0, 1);
        CheckInProof memory duplicate = _signedProof(potId, 0, 2);
        vm.expectRevert(abi.encodeWithSelector(AlreadyCheckedIn.selector, potId, wallets[0]));
        core.checkIn(duplicate);
        assertEq(core.getPot(potId).checkedInCount, 1);
    }

    function test_duplicateClaimReverts() public {
        uint256 potId = _createPot();
        _join(potId, 0);
        vm.warp(221);
        core.finalize(potId);

        address caller = vm.addr(901);
        vm.prank(caller);
        core.claim(potId, wallets[0]);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(AlreadyClaimed.selector, potId, wallets[0]));
        core.claim(potId, wallets[0]);
        assertEq(token.balanceOf(wallets[0]), STAKE);
    }

    function test_duplicateFinalizeReverts() public {
        uint256 potId = _createPot();
        vm.warp(221);
        core.finalize(potId);
        vm.expectRevert(abi.encodeWithSelector(PotAlreadyFinalized.selector, potId));
        core.finalize(potId);
        PotState memory pot = core.getPot(potId);
        assertEq(uint256(pot.status), uint256(PotStatus.Finalized));
    }

    function test_unknownPotIdRevertsAcrossEndpoints() public {
        uint256 unknownPotId = 999;
        bytes memory expected = abi.encodeWithSelector(PotNotFound.selector, unknownPotId);

        vm.expectRevert(expected);
        core.joinPot(unknownPotId);
        vm.expectRevert(expected);
        core.checkIn(
            CheckInProof({
                potId: unknownPotId,
                participant: wallets[0],
                nonce: 1,
                deadline: 0,
                signature: ""
            })
        );
        vm.expectRevert(expected);
        core.finalize(unknownPotId);
        vm.expectRevert(expected);
        core.claim(unknownPotId, wallets[0]);
        vm.expectRevert(expected);
        core.getPot(unknownPotId);
        vm.expectRevert(expected);
        core.getParticipantStatus(unknownPotId, wallets[0]);
        vm.expectRevert(expected);
        core.claimable(unknownPotId, wallets[0]);
    }

    function _signedProof(uint256 potId, uint256 index, uint256 nonce)
        internal
        view
        returns (CheckInProof memory proof)
    {
        uint64 deadline = uint64(block.timestamp + 30);
        bytes32 digest = core.hashCheckIn(potId, wallets[index], nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, digest);
        proof = CheckInProof({
            potId: potId,
            participant: wallets[index],
            nonce: nonce,
            deadline: deadline,
            signature: abi.encodePacked(r, s, v)
        });
    }
}
