// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {CommitPot} from "../../src/CommitPot.sol";
import {EIP712AttendanceVerifier} from "../../src/EIP712AttendanceVerifier.sol";
import {EqualSplitStrategy} from "../../src/EqualSplitStrategy.sol";
import {CheckInProof, PotConfig} from "../../src/PotTypes.sol";

// Authored local-only fixture. Failures happen AFTER the ordinary ERC20 state
// changes so the tests must prove transaction-wide rollback, not just rejection.
contract ControlledTokenFixture is ERC20 {
    enum Mode {
        Normal,
        ReturnFalse,
        Revert,
        Malformed,
        IncomingFee
    }

    error FixtureTransferRejected(address from, address to, uint256 amount);

    Mode public incomingMode;
    mapping(address => Mode) public outgoingMode;
    uint256 public callbackPot;
    address public callbackTrigger;
    address public callbackBeneficiary;
    bool public propagateCallbackFailure;
    uint256 public callbackAttempts;
    bool public callbackSucceeded;
    bytes public callbackResult;
    bool public claimedDuringCallback;

    constructor() ERC20("Controlled local token", "FIXTURE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setIncomingMode(Mode mode) external {
        incomingMode = mode;
    }

    function setOutgoingMode(address recipient, Mode mode) external {
        outgoingMode[recipient] = mode;
    }

    function setClaimCallback(uint256 potId, address trigger, address beneficiary, bool propagate) external {
        callbackPot = potId;
        callbackTrigger = trigger;
        callbackBeneficiary = beneficiary;
        propagateCallbackFailure = propagate;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        if (incomingMode == Mode.IncomingFee) _burn(to, 1);
        return _returnOrFail(incomingMode, from, to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        super.transfer(to, amount);
        if (to == callbackTrigger) {
            ++callbackAttempts;
            claimedDuringCallback = CommitPot(msg.sender).hasClaimed(callbackPot, to);
            (bool success, bytes memory result) =
                msg.sender.call(abi.encodeCall(CommitPot.claim, (callbackPot, callbackBeneficiary)));
            callbackSucceeded = success;
            callbackResult = result;
            if (!success && propagateCallbackFailure) {
                assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
            }
        }
        return _returnOrFail(outgoingMode[to], msg.sender, to, amount);
    }

    function _returnOrFail(Mode mode, address from, address to, uint256 amount) private pure returns (bool) {
        if (mode == Mode.ReturnFalse) return false;
        if (mode == Mode.Revert) revert FixtureTransferRejected(from, to, amount);
        if (mode == Mode.Malformed) {
            // One byte (0x01), NOT the 32-byte ABI bool and NOT an empty return.
            assembly ("memory-safe") {
                mstore(0, 1)
                return(31, 1)
            }
        }
        return true;
    }
}

// Invalid magic or an explicit revert; acceptance requires the exact digest.
// This is not a Safe wallet or a threshold-signature implementation.
contract ControlledERC1271Fixture is IERC1271 {
    error FixtureSignatureRejected();
    bool public reverts;
    bytes32 public allowedDigest;

    constructor(bool reverts_) {
        reverts = reverts_;
    }

    function allow(bytes32 digest) external {
        reverts = false;
        allowedDigest = digest;
    }

    function isValidSignature(bytes32 digest, bytes memory) external view returns (bytes4) {
        if (reverts) revert FixtureSignatureRejected();
        return digest == allowedDigest ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

abstract contract FailureTestBase is Test {
    uint256 internal constant STAKE = 10e6;
    uint256 internal constant DONATION = 123;
    uint256 internal constant VERIFIER_KEY = 0xA11CE; // Synthetic vm.sign key; never broadcast.
    address internal constant ALICE = address(0xA1);
    address internal constant BOB = address(0xB2);
    address internal constant DONOR = address(0xD3);
    address internal constant CALLER = address(0xC4);

    ControlledTokenFixture internal token;
    CommitPot internal core;
    address internal verifierSigner;
    uint256 internal potId;

    function setUp() public virtual {
        vm.warp(100);
        token = new ControlledTokenFixture();
        core = new CommitPot(address(token), address(new EIP712AttendanceVerifier()), address(new EqualSplitStrategy()));
        verifierSigner = vm.addr(VERIFIER_KEY);
        potId = _createPot(verifierSigner);
        token.mint(ALICE, 2 * STAKE);
        token.mint(BOB, 2 * STAKE);
        vm.prank(ALICE);
        token.approve(address(core), 2 * STAKE);
        vm.prank(BOB);
        token.approve(address(core), 2 * STAKE);
    }

    function _createPot(address signer) internal returns (uint256) {
        return core.createPot(PotConfig(address(token), signer, STAKE, 110, 120, 220));
    }

    function _join(uint256 id, address participant) internal {
        vm.prank(participant);
        core.joinPot(id);
    }

    function _checkIn(uint256 id, address participant, uint256 nonce) internal {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY, core.hashCheckIn(id, participant, nonce, 200));
        core.checkIn(CheckInProof(id, participant, nonce, 200, abi.encodePacked(r, s, v)));
    }

    function _donate() internal {
        token.mint(DONOR, DONATION);
        vm.prank(DONOR);
        assertTrue(token.transfer(address(core), DONATION));
        assertEq(token.balanceOf(DONOR), 0);
    }
}
