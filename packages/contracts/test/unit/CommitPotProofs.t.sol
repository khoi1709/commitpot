// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommitPotLifecycleTest} from "./CommitPotLifecycle.t.sol";
import {CommitPot} from "../../src/CommitPot.sol";
import {CheckInProof, PotConfig, InvalidSignature, DeadlineExpired, NonceAlreadyUsed} from "../../src/PotTypes.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

contract ContractVerifierFixture is IERC1271 {
    bytes32 public validDigest;
    function allow(bytes32 digest) external { validDigest = digest; }
    function isValidSignature(bytes32 digest, bytes memory) external view returns (bytes4) {
        return digest == validDigest ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}

contract CommitPotProofsTest is CommitPotLifecycleTest {
    function proofFor(uint256 id, uint256 index, uint256 nonce, uint64 deadline, uint256 key) internal view returns (CheckInProof memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, core.hashCheckIn(id, wallets[index], nonce, deadline));
        return CheckInProof(id, wallets[index], nonce, deadline, abi.encodePacked(r, s, v));
    }
    function test_wrongSignerRejectedWithoutConsumingNonce() public {
        uint256 id = _createPot(); _join(id, 0); vm.warp(120);
        CheckInProof memory bad = proofFor(id, 0, 1, 200, 12345);
        vm.expectRevert(InvalidSignature.selector);
        core.checkIn(bad);
        assertFalse(core.usedNonces(id, 1));
        core.checkIn(proofFor(id, 0, 1, 200, VERIFIER_KEY));
        assertTrue(core.usedNonces(id, 1));
    }
    function test_signedParticipantCannotBeSubstituted() public {
        uint256 id = _createPot(); _join(id, 0); _join(id, 1); vm.warp(120);
        CheckInProof memory proof = proofFor(id, 0, 1, 200, VERIFIER_KEY);
        proof.participant = wallets[1];
        vm.expectRevert(InvalidSignature.selector); core.checkIn(proof);
    }
    function test_expiredDeadlineAndExactDeadline() public {
        uint256 id = _createPot(); _join(id, 0); vm.warp(120);
        CheckInProof memory expired = proofFor(id, 0, 1, 119, VERIFIER_KEY);
        vm.expectRevert(abi.encodeWithSelector(DeadlineExpired.selector, uint64(119))); core.checkIn(expired);
        core.checkIn(proofFor(id, 0, 1, 120, VERIFIER_KEY));
    }
    function test_sameNonceCannotCheckInAnotherParticipant() public {
        uint256 id = _createPot(); _join(id, 0); _join(id, 1); vm.warp(120);
        core.checkIn(proofFor(id, 0, 1, 200, VERIFIER_KEY));
        CheckInProof memory second = proofFor(id, 1, 1, 200, VERIFIER_KEY);
        vm.expectRevert(abi.encodeWithSelector(NonceAlreadyUsed.selector, id, uint256(1))); core.checkIn(second);
    }
    function test_wrongChainRejectsOriginalProof() public {
        uint256 id = _createPot(); _join(id, 0); vm.warp(120);
        CheckInProof memory proof = proofFor(id, 0, 1, 200, VERIFIER_KEY);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(InvalidSignature.selector); core.checkIn(proof);
    }
    function test_coreAddressSeparatesSharedHelper() public {
        uint256 id = _createPot(); _join(id, 0);
        CommitPot other = new CommitPot(address(token), address(verifier), address(strategy));
        other.createPot(core.getPot(id).config);
        token.mint(wallets[0], STAKE); vm.startPrank(wallets[0]); token.approve(address(other), STAKE); other.joinPot(id); vm.stopPrank();
        vm.warp(120); CheckInProof memory proof = proofFor(id, 0, 1, 200, VERIFIER_KEY);
        vm.expectRevert(InvalidSignature.selector); other.checkIn(proof);
        core.checkIn(proof);
    }
    function test_contractVerifierUsesERC1271() public {
        ContractVerifierFixture signer = new ContractVerifierFixture();
        uint256 id = _createPot();
        // Create a second immutable pot with the contract as attendance signer.
        token.mint(wallets[0], STAKE);
        importConfig(signer);
        _join(id, 0); _join(2, 0); vm.warp(120);
        bytes32 digest = core.hashCheckIn(2, wallets[0], 1, 200); signer.allow(digest);
        core.checkIn(CheckInProof(2, wallets[0], 1, 200, hex"01"));
        assertTrue(core.hasCheckedIn(2, wallets[0]));
    }
    function importConfig(ContractVerifierFixture signer) internal {
        // Reuse the exact time and token configuration while choosing the signer before creation.
        uint256 id = 1; // first pot already exists
        // Explicit copy, no mutable verifier setter exists.
        PotConfig memory config = core.getPot(id).config;
        config.verifier = address(signer); core.createPot(config);
    }
    function test_twoPotsAndDonationsRemainIndependent() public {
        uint256 first = _createPot(); uint256 second = _createPot();
        _join(first, 0); _join(second, 1);
        token.mint(address(core), 123);
        vm.warp(221); core.finalize(first); core.finalize(second);
        core.claim(first, wallets[0]); assertEq(token.balanceOf(address(core)), STAKE + 123);
        core.claim(second, wallets[1]); assertEq(token.balanceOf(address(core)), 123);
    }
    function testFuzz_equalSplitConservesRecordedPool(uint64 nSeed, uint64 kSeed, uint64 stakeSeed) public view {
        uint256 n = bound(nSeed, 1, 1000); uint256 k = bound(kSeed, 1, n); uint256 stake = bound(stakeSeed, 1, 1e18);
        (uint256 base, uint256 dust) = strategy.calculatePayout(n, k, stake);
        assertLt(dust, k); assertEq(base * k + dust, n * stake);
    }
}
