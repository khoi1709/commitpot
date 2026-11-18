// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum PotStatus {
    Open,
    Finalized
}

struct PotConfig {
    address token;
    address verifier;
    uint256 stakeAmount;
    uint64 registrationClose;
    uint64 checkInOpen;
    uint64 checkInClose;
}

struct PotState {
    PotConfig config;
    PotStatus status;
    uint256 participantCount;
    uint256 checkedInCount;
    uint256 payoutPerWinner;
    uint256 dustAmount;
}

struct CheckInProof {
    uint256 potId;
    address participant;
    uint256 nonce;
    uint64 deadline;
    bytes signature;
}

error ZeroAddress();
error MissingCode(address account);
error InvalidToken(address token);
error InvalidStake();
error InvalidTimeWindow();
error PotNotFound(uint256 potId);
error PotNotOpen(uint256 potId);
error PotAlreadyFinalized(uint256 potId);
error PotNotFinalized(uint256 potId);
error RegistrationClosed(uint256 potId);
error FinalizeTooEarly(uint256 potId);
error AlreadyJoined(uint256 potId, address participant);
error NotJoined(uint256 potId, address participant);
error AlreadyCheckedIn(uint256 potId, address participant);
error NonceAlreadyUsed(uint256 potId, uint256 nonce);
error CheckInNotOpen(uint256 potId);
error DeadlineExpired(uint64 deadline);
error InvalidSignature();
error InvalidParticipant();
error InvalidBeneficiary();
error AlreadyClaimed(uint256 potId, address beneficiary);
error NotEligible(uint256 potId, address beneficiary);
error TransferAmountMismatch(uint256 expected, uint256 actual);
