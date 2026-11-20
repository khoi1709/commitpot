// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CheckInProof, InvalidSignature} from "../../src/PotTypes.sol";
import {FailureTestBase, ControlledERC1271Fixture} from "./FailureFixtures.sol";

contract CommitPotSignatureFailuresTest is FailureTestBase {
    // SEC 2 secp256k1 group order; n - s with flipped v is the malleable twin.
    uint256 internal constant SECP256K1_GROUP_ORDER =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function test_invalidERC1271MagicLeavesNonceAndAttendanceUnconsumed() public {
        _contractSignatureFailure(false);
    }

    function test_revertingERC1271LeavesNonceAndAttendanceUnconsumed() public {
        _contractSignatureFailure(true);
    }

    function test_highSEoaSignatureRejectedAndCanonicalSameNonceSucceeds() public {
        _join(potId, ALICE);
        vm.warp(120);
        bytes32 digest = core.hashCheckIn(potId, ALICE, 7, 200);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, digest);
        bytes32 highS = bytes32(SECP256K1_GROUP_ORDER - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        assertGt(uint256(highS), SECP256K1_GROUP_ORDER / 2);
        assertEq(ecrecover(digest, flippedV, r, highS), verifierSigner);
        CheckInProof memory proof = CheckInProof(potId, ALICE, 7, 200, abi.encodePacked(r, highS, flippedV));
        vm.expectRevert(InvalidSignature.selector);
        core.checkIn(proof);
        _assertUnconsumed(potId, 7);

        proof.signature = abi.encodePacked(r, s, v);
        core.checkIn(proof);
        _assertCheckedIn(potId, 7);
    }

    function _contractSignatureFailure(bool reverts) internal {
        ControlledERC1271Fixture signer = new ControlledERC1271Fixture(reverts);
        uint256 id = _createPot(address(signer));
        _join(id, ALICE);
        vm.warp(120);
        CheckInProof memory proof = CheckInProof(id, ALICE, 7, 200, hex"01");
        vm.expectRevert(InvalidSignature.selector);
        core.checkIn(proof);
        _assertUnconsumed(id, 7);

        signer.allow(core.hashCheckIn(id, ALICE, 7, 200));
        core.checkIn(proof);
        _assertCheckedIn(id, 7);
    }

    function _assertUnconsumed(uint256 id, uint256 nonce) internal view {
        assertFalse(core.usedNonces(id, nonce));
        assertFalse(core.hasCheckedIn(id, ALICE));
        assertEq(core.checkInOrder(id, ALICE), 0);
        assertEq(core.getPot(id).checkedInCount, 0);
        assertEq(core.getPot(id).participantCount, 1);
        assertTrue(core.hasJoined(id, ALICE));
        assertFalse(core.hasClaimed(id, ALICE));
        assertEq(token.balanceOf(ALICE), STAKE);
        assertEq(token.balanceOf(address(core)), STAKE);
    }

    function _assertCheckedIn(uint256 id, uint256 nonce) internal view {
        assertTrue(core.usedNonces(id, nonce));
        assertTrue(core.hasCheckedIn(id, ALICE));
        assertEq(core.checkInOrder(id, ALICE), 1);
        assertEq(core.getPot(id).checkedInCount, 1);
        assertEq(core.getPot(id).participantCount, 1);
        assertEq(token.balanceOf(ALICE), STAKE);
        assertEq(token.balanceOf(address(core)), STAKE);
    }
}
