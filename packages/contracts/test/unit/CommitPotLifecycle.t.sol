// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {CommitPot} from "../../src/CommitPot.sol";
import {EIP712AttendanceVerifier} from "../../src/EIP712AttendanceVerifier.sol";
import {EqualSplitStrategy} from "../../src/EqualSplitStrategy.sol";
import {CheckInProof, PotConfig, PotState, NotEligible} from "../../src/PotTypes.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CommitPotLifecycleTest is Test {
    uint256 internal constant STAKE = 10e6;
    uint256 internal constant VERIFIER_KEY = 0xA11CE;
    uint256[5] internal walletKeys = [uint256(101), 102, 103, 104, 105];

    MockUSDC internal token;
    EIP712AttendanceVerifier internal verifier;
    EqualSplitStrategy internal strategy;
    CommitPot internal core;
    address internal verifierSigner;
    address[5] internal wallets;

    function setUp() public {
        vm.warp(100);
        token = new MockUSDC();
        verifier = new EIP712AttendanceVerifier();
        strategy = new EqualSplitStrategy();
        core = new CommitPot(address(token), address(verifier), address(strategy));
        verifierSigner = vm.addr(VERIFIER_KEY);

        for (uint256 i; i < wallets.length; ++i) {
            wallets[i] = vm.addr(walletKeys[i]);
            token.mint(wallets[i], STAKE);
        }
    }

    function test_fiveWalletsFourCheckInsSplitAndNoShowReverts() public {
        uint256 potId = _createPot();
        _joinAll(potId);

        vm.warp(120);
        for (uint256 i; i < 4; ++i) {
            _checkIn(potId, i, i + 1);
        }

        vm.warp(221);
        core.finalize(potId);
        PotState memory pot = core.getPot(potId);
        assertEq(pot.participantCount, 5);
        assertEq(pot.checkedInCount, 4);
        assertEq(pot.payoutPerWinner, 12_500_000);
        assertEq(pot.dustAmount, 0);

        for (uint256 i; i < 4; ++i) {
            address caller = vm.addr(900 + i);
            vm.prank(caller);
            core.claim(potId, wallets[i]);
            assertEq(token.balanceOf(wallets[i]), 12_500_000);
        }

        uint256 noShowBalance = token.balanceOf(wallets[4]);
        assertFalse(core.hasClaimed(potId, wallets[4]));
        vm.prank(vm.addr(999));
        vm.expectRevert(abi.encodeWithSelector(NotEligible.selector, potId, wallets[4]));
        core.claim(potId, wallets[4]);
        assertEq(token.balanceOf(wallets[4]), noShowBalance);
        assertFalse(core.hasClaimed(potId, wallets[4]));
        assertEq(token.balanceOf(address(core)), 0);
    }

    function test_noCheckInsRefundAllJoinedStake() public {
        uint256 potId = _createPot();
        _join(potId, 0);
        _join(potId, 1);

        vm.warp(221);
        core.finalize(potId);
        assertEq(core.claimable(potId, wallets[0]), STAKE);
        assertEq(core.claimable(potId, wallets[1]), STAKE);

        vm.prank(vm.addr(901));
        core.claim(potId, wallets[0]);
        vm.prank(vm.addr(902));
        core.claim(potId, wallets[1]);
        assertEq(token.balanceOf(wallets[0]), STAKE);
        assertEq(token.balanceOf(wallets[1]), STAKE);
        assertEq(token.balanceOf(address(core)), 0);
    }

    function test_emptyPotFinalizesWithZeroPayout() public {
        uint256 potId = _createPot();
        vm.warp(221);
        core.finalize(potId);

        PotState memory pot = core.getPot(potId);
        assertEq(pot.participantCount, 0);
        assertEq(pot.checkedInCount, 0);
        assertEq(pot.payoutPerWinner, 0);
        assertEq(pot.dustAmount, 0);
        assertEq(token.balanceOf(address(core)), 0);
    }

    function test_fiveOfThreeDustAndConservation() public {
        uint256 potId = _createPot();
        _joinAll(potId);

        vm.warp(120);
        for (uint256 i; i < 3; ++i) {
            _checkIn(potId, i, i + 1);
        }
        vm.warp(221);
        core.finalize(potId);

        PotState memory pot = core.getPot(potId);
        assertEq(pot.payoutPerWinner, 16_666_666);
        assertEq(pot.dustAmount, 2);

        uint256 paid;
        for (uint256 i; i < 3; ++i) {
            vm.prank(vm.addr(910 + i));
            core.claim(potId, wallets[i]);
            paid += token.balanceOf(wallets[i]);
        }
        assertEq(paid, 50_000_000);
        assertEq(token.balanceOf(address(core)), 0);
    }

    function test_allAttendEachReceivesStakeAndConservation() public {
        uint256 potId = _createPot();
        _joinAll(potId);
        vm.warp(120);
        for (uint256 i; i < wallets.length; ++i) {
            _checkIn(potId, i, i + 1);
        }
        vm.warp(221);
        core.finalize(potId);

        for (uint256 i; i < wallets.length; ++i) {
            vm.prank(vm.addr(920 + i));
            core.claim(potId, wallets[i]);
            assertEq(token.balanceOf(wallets[i]), STAKE);
        }
        assertEq(token.balanceOf(address(core)), 0);
    }

    function _createPot() internal returns (uint256) {
        return core.createPot(
            PotConfig({
                token: address(token),
                verifier: verifierSigner,
                stakeAmount: STAKE,
                registrationClose: 110,
                checkInOpen: 120,
                checkInClose: 220
            })
        );
    }

    function _joinAll(uint256 potId) internal {
        for (uint256 i; i < wallets.length; ++i) {
            _join(potId, i);
        }
    }

    function _join(uint256 potId, uint256 index) internal {
        vm.startPrank(wallets[index]);
        token.approve(address(core), STAKE);
        core.joinPot(potId);
        vm.stopPrank();
    }

    function _checkIn(uint256 potId, uint256 index, uint256 nonce) internal {
        uint64 deadline = uint64(block.timestamp + 30);
        bytes32 digest = core.hashCheckIn(potId, wallets[index], nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, digest);
        core.checkIn(
            CheckInProof({
                potId: potId,
                participant: wallets[index],
                nonce: nonce,
                deadline: deadline,
                signature: abi.encodePacked(r, s, v)
            })
        );
    }
}
