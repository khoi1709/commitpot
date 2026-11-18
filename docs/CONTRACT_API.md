# CommitPot contract API

**Status: compiled and locally verified.** Solidity 0.8.24/Paris and the pinned Foundry dependencies compile the actual source. The executed suite currently passes 35 cases (including inherited fixture repetitions) with one 1,024-run fuzz property. Real adapter and browser-to-Anvil transactions are separately verified. This document describes the interface; the generated TypeScript ABI comes from the compiler artifact through `scripts/abi/export.mjs`, never a handwritten export. No Fuji deployment or formal security-audit approval is claimed.

## Data types

```solidity
enum PotStatus { Open, Finalized }

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
```

## `CommitPot`

### Constructor

```solidity
constructor(
    address supportedToken_,
    address attendanceVerifier_,
    address payoutStrategy_
)
```

The constructor initializes EIP-712 with `name = "CommitPot"` and `version = "1"`. Each constructor address must be nonzero contract code. Deployment order is: supported token fixture/contract, `EIP712AttendanceVerifier`, `EqualSplitStrategy`, then `CommitPot` with those three addresses. The core stores all three dependencies as immutable values.

### State and generated getters

```solidity
bytes32 CHECK_IN_TYPEHASH();
address supportedToken();
address attendanceVerifier();
address payoutStrategy();
uint256 nextPotId();

pots(uint256 potId) -> PotState fields:
    config (token, verifier, stakeAmount, registrationClose, checkInOpen, checkInClose),
    status, participantCount, checkedInCount, payoutPerWinner, dustAmount
hasJoined(uint256 potId, address participant) -> bool
hasCheckedIn(uint256 potId, address participant) -> bool
checkInOrder(uint256 potId, address participant) -> uint256
hasClaimed(uint256 potId, address participant) -> bool
usedNonces(uint256 potId, uint256 nonce) -> bool
```

`nextPotId` starts at `1`. Authoritative `getPot`, `getParticipantStatus`, `claimable` and business writes reject unknown IDs. Solidity-generated public mapping getters retain their normal default-value behavior; the frontend must not infer pot existence from a default mapping value.

### Methods

```solidity
createPot(PotConfig calldata config) external returns (uint256 potId)
joinPot(uint256 potId) external
checkIn(CheckInProof calldata proof) external
finalize(uint256 potId) external
claim(uint256 potId, address beneficiary) external
getPot(uint256 potId) external view returns (PotState memory)
getParticipantStatus(uint256 potId, address participant)
    external view returns (bool joined, bool checkedIn, bool claimed, uint256 order)
claimable(uint256 potId, address beneficiary) external view returns (uint256 amount)
hashCheckIn(uint256 potId, address participant, uint256 nonce, uint64 deadline)
    public view returns (bytes32)
```

`hashCheckIn` is the complete digest used by the core:

```text
keccak256("\\x19\\x01" || domainSeparator ||
  keccak256(abi.encode(
    CHECK_IN_TYPEHASH,
    potId, participant, nonce, deadline
  )))
```

The EIP-712 domain is `CommitPot`, version `1`, runtime `block.chainid`, and the deployed core address. The signature bytes are excluded from the digest. The helper receives the already-computed digest and never reconstructs the domain.

### Events

```solidity
event PotCreated(
    uint256 indexed potId, address indexed creator, address indexed verifier,
    address token, uint256 stakeAmount
);
event PotJoined(uint256 indexed potId, address indexed participant);
event CheckedIn(uint256 indexed potId, address indexed participant, uint256 order);
event PotFinalized(
    uint256 indexed potId, uint256 participantCount, uint256 checkedInCount,
    uint256 payoutPerWinner, uint256 dustAmount
);
event PayoutClaimed(uint256 indexed potId, address indexed beneficiary, uint256 amount);
```

### Custom errors

`ZeroAddress()`, `MissingCode(address)`, `InvalidToken(address)`, `InvalidStake()`, `InvalidTimeWindow()`, `PotNotFound(uint256)`, `PotNotOpen(uint256)`, `PotAlreadyFinalized(uint256)`, `PotNotFinalized(uint256)`, `RegistrationClosed(uint256)`, `FinalizeTooEarly(uint256)`, `AlreadyJoined(uint256,address)`, `NotJoined(uint256,address)`, `AlreadyCheckedIn(uint256,address)`, `NonceAlreadyUsed(uint256,uint256)`, `CheckInNotOpen(uint256)`, `DeadlineExpired(uint64)`, `InvalidSignature()`, `InvalidParticipant()`, `InvalidBeneficiary()`, `AlreadyClaimed(uint256,address)`, `NotEligible(uint256,address)`, and `TransferAmountMismatch(uint256,uint256)`.

## Pinned helper implementations

### `EIP712AttendanceVerifier`

```solidity
verify(address expectedSigner, bytes32 digest, bytes calldata signature)
    external view returns (bool)
```

Uses OpenZeppelin `SignatureChecker` for EOA and ERC-1271 validation. It has no constructor arguments or setters.

### `EqualSplitStrategy`

```solidity
calculatePayout(uint256 participantCount, uint256 checkedInCount, uint256 stakeAmount)
    external pure returns (uint256 payoutPerWinner, uint256 dustAmount)
```

For zero participants it returns `(0, 0)`; for zero check-ins it returns `(stakeAmount, 0)`; otherwise it returns `(participantCount * stakeAmount / checkedInCount, participantCount * stakeAmount % checkedInCount)`.

Interfaces `IAttendanceVerifier` and `IPayoutStrategy` declare the helper methods above and are not deployed directly.
