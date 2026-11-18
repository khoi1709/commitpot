// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IAttendanceVerifier} from "./IAttendanceVerifier.sol";
import {IPayoutStrategy} from "./IPayoutStrategy.sol";
import {
    PotStatus,
    PotConfig,
    PotState,
    CheckInProof,
    ZeroAddress,
    MissingCode,
    InvalidToken,
    InvalidStake,
    InvalidTimeWindow,
    PotNotFound,
    PotNotOpen,
    PotAlreadyFinalized,
    PotNotFinalized,
    RegistrationClosed,
    FinalizeTooEarly,
    AlreadyJoined,
    NotJoined,
    AlreadyCheckedIn,
    NonceAlreadyUsed,
    CheckInNotOpen,
    DeadlineExpired,
    InvalidSignature,
    InvalidBeneficiary,
    AlreadyClaimed,
    NotEligible,
    TransferAmountMismatch
} from "./PotTypes.sol";

contract CommitPot is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CHECK_IN_TYPEHASH =
        keccak256("CheckIn(uint256 potId,address participant,uint256 nonce,uint64 deadline)");

    address public immutable supportedToken;
    IAttendanceVerifier public immutable attendanceVerifier;
    IPayoutStrategy public immutable payoutStrategy;
    uint256 public nextPotId;

    mapping(uint256 => PotState) public pots;
    mapping(uint256 => mapping(address => bool)) public hasJoined;
    mapping(uint256 => mapping(address => bool)) public hasCheckedIn;
    mapping(uint256 => mapping(address => uint256)) public checkInOrder;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => mapping(uint256 => bool)) public usedNonces;

    event PotCreated(
        uint256 indexed potId,
        address indexed creator,
        address indexed verifier,
        address token,
        uint256 stakeAmount
    );
    event PotJoined(uint256 indexed potId, address indexed participant);
    event CheckedIn(uint256 indexed potId, address indexed participant, uint256 order);
    event PotFinalized(
        uint256 indexed potId,
        uint256 participantCount,
        uint256 checkedInCount,
        uint256 payoutPerWinner,
        uint256 dustAmount
    );
    event PayoutClaimed(uint256 indexed potId, address indexed beneficiary, uint256 amount);

    constructor(address supportedToken_, address attendanceVerifier_, address payoutStrategy_)
        EIP712("CommitPot", "1")
    {
        _requireContract(supportedToken_);
        _requireContract(attendanceVerifier_);
        _requireContract(payoutStrategy_);
        supportedToken = supportedToken_;
        attendanceVerifier = IAttendanceVerifier(attendanceVerifier_);
        payoutStrategy = IPayoutStrategy(payoutStrategy_);
        nextPotId = 1;
    }

    function createPot(PotConfig calldata config) external returns (uint256 potId) {
        if (config.token != supportedToken) revert InvalidToken(config.token);
        if (config.verifier == address(0)) revert ZeroAddress();
        if (config.stakeAmount == 0) revert InvalidStake();
        if (
            block.timestamp >= config.registrationClose || config.registrationClose > config.checkInOpen
                || config.checkInOpen >= config.checkInClose
        ) revert InvalidTimeWindow();

        potId = nextPotId++;
        pots[potId] = PotState({
            config: config,
            status: PotStatus.Open,
            participantCount: 0,
            checkedInCount: 0,
            payoutPerWinner: 0,
            dustAmount: 0
        });
        emit PotCreated(potId, msg.sender, config.verifier, config.token, config.stakeAmount);
    }

    function joinPot(uint256 potId) external nonReentrant {
        _requirePot(potId);
        PotState storage pot = pots[potId];
        if (pot.status != PotStatus.Open) revert PotNotOpen(potId);
        if (block.timestamp >= pot.config.registrationClose) revert RegistrationClosed(potId);
        if (hasJoined[potId][msg.sender]) revert AlreadyJoined(potId, msg.sender);

        IERC20 token = IERC20(supportedToken);
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), pot.config.stakeAmount);
        uint256 afterBalance = token.balanceOf(address(this));
        uint256 received = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (received != pot.config.stakeAmount) revert TransferAmountMismatch(pot.config.stakeAmount, received);

        hasJoined[potId][msg.sender] = true;
        pot.participantCount += 1;
        emit PotJoined(potId, msg.sender);
    }

    function checkIn(CheckInProof calldata proof) external nonReentrant {
        _requirePot(proof.potId);
        PotState storage pot = pots[proof.potId];
        if (pot.status != PotStatus.Open) revert PotNotOpen(proof.potId);
        if (block.timestamp < pot.config.checkInOpen || block.timestamp > pot.config.checkInClose) {
            revert CheckInNotOpen(proof.potId);
        }
        if (block.timestamp > proof.deadline) revert DeadlineExpired(proof.deadline);
        if (!hasJoined[proof.potId][proof.participant]) revert NotJoined(proof.potId, proof.participant);
        if (hasCheckedIn[proof.potId][proof.participant]) {
            revert AlreadyCheckedIn(proof.potId, proof.participant);
        }
        if (usedNonces[proof.potId][proof.nonce]) revert NonceAlreadyUsed(proof.potId, proof.nonce);
        if (
            !attendanceVerifier.verify(
                pot.config.verifier, hashCheckIn(proof.potId, proof.participant, proof.nonce, proof.deadline), proof.signature
            )
        ) revert InvalidSignature();

        usedNonces[proof.potId][proof.nonce] = true;
        hasCheckedIn[proof.potId][proof.participant] = true;
        pot.checkedInCount += 1;
        checkInOrder[proof.potId][proof.participant] = pot.checkedInCount;
        emit CheckedIn(proof.potId, proof.participant, pot.checkedInCount);
    }

    function finalize(uint256 potId) external nonReentrant {
        _requirePot(potId);
        PotState storage pot = pots[potId];
        if (pot.status != PotStatus.Open) revert PotAlreadyFinalized(potId);
        if (block.timestamp <= pot.config.checkInClose) revert FinalizeTooEarly(potId);

        (pot.payoutPerWinner, pot.dustAmount) = payoutStrategy.calculatePayout(
            pot.participantCount, pot.checkedInCount, pot.config.stakeAmount
        );
        pot.status = PotStatus.Finalized;
        emit PotFinalized(
            potId, pot.participantCount, pot.checkedInCount, pot.payoutPerWinner, pot.dustAmount
        );
    }

    function claim(uint256 potId, address beneficiary) external nonReentrant {
        _requirePot(potId);
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        PotState storage pot = pots[potId];
        if (pot.status != PotStatus.Finalized) revert PotNotFinalized(potId);
        if (!hasJoined[potId][beneficiary]) revert NotEligible(potId, beneficiary);
        if (hasClaimed[potId][beneficiary]) revert AlreadyClaimed(potId, beneficiary);

        uint256 amount;
        if (pot.checkedInCount == 0) {
            amount = pot.config.stakeAmount;
        } else {
            if (!hasCheckedIn[potId][beneficiary]) revert NotEligible(potId, beneficiary);
            amount = pot.payoutPerWinner;
            if (checkInOrder[potId][beneficiary] <= pot.dustAmount) amount += 1;
        }

        hasClaimed[potId][beneficiary] = true;
        IERC20(supportedToken).safeTransfer(beneficiary, amount);
        emit PayoutClaimed(potId, beneficiary, amount);
    }

    function getPot(uint256 potId) external view returns (PotState memory) {
        _requirePot(potId);
        return pots[potId];
    }

    function getParticipantStatus(uint256 potId, address participant)
        external
        view
        returns (bool joined, bool checkedIn, bool claimed, uint256 order)
    {
        _requirePot(potId);
        return (
            hasJoined[potId][participant],
            hasCheckedIn[potId][participant],
            hasClaimed[potId][participant],
            checkInOrder[potId][participant]
        );
    }

    function claimable(uint256 potId, address beneficiary) external view returns (uint256 amount) {
        _requirePot(potId);
        if (pots[potId].status != PotStatus.Finalized || hasClaimed[potId][beneficiary]) return 0;
        PotState storage pot = pots[potId];
        if (!hasJoined[potId][beneficiary]) return 0;
        if (pot.checkedInCount == 0) return pot.config.stakeAmount;
        if (!hasCheckedIn[potId][beneficiary]) return 0;
        amount = pot.payoutPerWinner;
        if (checkInOrder[potId][beneficiary] <= pot.dustAmount) amount += 1;
    }

    function hashCheckIn(uint256 potId, address participant, uint256 nonce, uint64 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(CHECK_IN_TYPEHASH, potId, participant, nonce, deadline)));
    }

    function _requirePot(uint256 potId) internal view {
        if (potId == 0 || potId >= nextPotId) revert PotNotFound(potId);
    }

    function _requireContract(address account) private view {
        if (account == address(0)) revert ZeroAddress();
        if (account.code.length == 0) revert MissingCode(account);
    }
}
