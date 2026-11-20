// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommitPot} from "../../src/CommitPot.sol";
import {LocalTestUSDC} from "../../src/LocalTestUSDC.sol";
import {
    PotConfig,
    PotState,
    PotStatus,
    CheckInProof,
    AlreadyJoined,
    AlreadyCheckedIn,
    AlreadyClaimed,
    NonceAlreadyUsed,
    NotEligible,
    PotAlreadyFinalized
} from "../../src/PotTypes.sol";

/// @dev Owned local test driver, not a deployment contract. Ghost values are updated
/// only from successful actions, never copied from the core's accounting getters.
contract CommitPotHandler is Test {
    uint256 public constant MAX_POTS = 6;
    uint256 public constant ACTORS = 6;
    uint256 public constant MAX_STAKE = 10_000_007;
    uint256 public constant INITIAL_BALANCE = 1_000_000_000;
    uint256 public constant MAX_DONATION = 10_000;
    uint256 private constant VERIFIER_KEY_BASE = 0xA11CE;

    struct PotLedger {
        PotConfig config;
        uint256 joined;
        uint256 attended;
        uint256 deposited;
        uint256 paid;
        uint256 claims;
        bool finalized;
    }

    struct PersonLedger {
        uint256 joins;
        uint256 checkIns;
        uint256 claims;
        uint256 order;
        uint256 nonce;
        uint256 paid;
    }

    struct Metrics {
        uint256 calls;
        uint256 skipped;
        uint256 creates;
        uint256 joins;
        uint256 checkIns;
        uint256 finalizes;
        uint256 claims;
        uint256 donations;
        uint256 warps;
        uint256 emptyPots;
        uint256 refundPots;
        uint256 winnerPots;
        uint256 allAttendPots;
        uint256 dustPots;
        uint256 noShowRejections;
        uint256 duplicateJoinRejections;
        uint256 duplicateCheckInRejections;
        uint256 nonceReplayRejections;
        uint256 duplicateClaimRejections;
        uint256 duplicateFinalizeRejections;
        uint256 refundClaims;
        uint256 dustBonuses;
        uint256 maxFundedOutstandingPots;
    }

    CommitPot public immutable core;
    LocalTestUSDC public immutable token;
    address private immutable controller;
    address public immutable donor;
    address public immutable relayer;
    address[6] public actors;
    uint256 public potCount;
    uint256 public totalDeposited;
    uint256 public totalPaid;
    uint256 public totalDonated;
    mapping(uint256 => PotLedger) private pots;
    mapping(uint256 => mapping(address => PersonLedger)) private people;
    mapping(address => uint256) private actorDeposits;
    mapping(address => uint256) private actorPayouts;
    Metrics private metrics;

    constructor(CommitPot core_, LocalTestUSDC token_) {
        controller = msg.sender;
        core = core_;
        token = token_;
        donor = vm.addr(0xD0A7);
        relayer = vm.addr(0xCA11);
        for (uint256 i; i < ACTORS; ++i) {
            actors[i] = vm.addr(1001 + i);
            token.mint(actors[i], INITIAL_BALANCE);
            vm.prank(actors[i]);
            token.approve(address(core), type(uint256).max);
        }
        token.mint(donor, INITIAL_BALANCE);
    }

    function getMetrics() external view returns (Metrics memory) {
        return metrics;
    }

    function economicTransitions() external view returns (uint256) {
        return
            metrics.creates + metrics.joins + metrics.checkIns + metrics.finalizes + metrics.claims + metrics.donations;
    }

    function createPot(uint256 stakeSeed, uint256 delaySeed) external {
        ++metrics.calls;
        if (potCount == MAX_POTS) {
            ++metrics.skipped;
            return;
        }
        _createPot(stakeSeed, delaySeed);
    }

    /// @dev Randomized invariant selector: every call progresses one campaign step
    /// until six pots have completed join/check-in/finalize/claim. All stakes are odd
    /// so K=2/N=3 pots necessarily exercise nonzero dust; K=0 and K=N pots recur.
    /// A donation accompanies every call, including post-campaign no-ops.
    function advanceCampaign(uint256 stakeSeed, uint256 delaySeed, uint256 donationSeed) external {
        ++metrics.calls;
        _recordDonation(1 + donationSeed % MAX_DONATION);

        // Populate concurrent pots before settlement. Random scan origins then interleave
        // the independent lifecycles without permitting premature finalization.
        if (potCount < MAX_POTS) {
            _createPot(stakeSeed, delaySeed);
            return;
        }
        uint256 start = stakeSeed % potCount;
        for (uint256 offset; offset < potCount; ++offset) {
            uint256 id = 1 + (start + offset) % potCount;
            PotLedger storage pot = pots[id];
            if (pot.joined < 3) {
                uint256 actorStart = delaySeed % ACTORS;
                for (uint256 a; a < ACTORS; ++a) {
                    address actor = actors[(actorStart + a) % ACTORS];
                    if (people[id][actor].joins == 0) {
                        _join(id, actor);
                        return;
                    }
                }
            }
        }
        for (uint256 offset; offset < potCount; ++offset) {
            uint256 id = 1 + (start + offset) % potCount;
            PotLedger storage pot = pots[id];
            uint256 targetAttendance = _plannedAttendance(id);
            if (!pot.finalized && pot.attended < targetAttendance) {
                uint256 actorStart = delaySeed % ACTORS;
                for (uint256 a; a < ACTORS; ++a) {
                    address actor = actors[(actorStart + a) % ACTORS];
                    if (people[id][actor].joins == 1 && people[id][actor].checkIns == 0) {
                        _warpTo(pot.config.checkInOpen);
                        _checkIn(id, actor);
                        return;
                    }
                }
            }
        }
        for (uint256 offset; offset < potCount; ++offset) {
            uint256 id = 1 + (start + offset) % potCount;
            if (!pots[id].finalized) {
                _finalize(id);
                return;
            }
        }
        for (uint256 offset; offset < potCount; ++offset) {
            uint256 id = 1 + (start + offset) % potCount;
            for (uint256 a; a < ACTORS; ++a) {
                address actor = actors[(delaySeed % ACTORS + a) % ACTORS];
                if (_unpaidReward(id, actor) != 0) {
                    _claim(id, actor);
                    return;
                }
            }
        }
        ++metrics.skipped;
    }

    function join(uint256 potSeed, uint256 actorSeed) external {
        ++metrics.calls;
        for (uint256 p; p < potCount; ++p) {
            uint256 id = 1 + (potSeed % potCount + p) % potCount;
            PotLedger storage pot = pots[id];
            if (pot.finalized || block.timestamp >= pot.config.registrationClose) continue;
            for (uint256 a; a < ACTORS; ++a) {
                address actor = actors[(actorSeed % ACTORS + a) % ACTORS];
                if (people[id][actor].joins == 0) {
                    _join(id, actor);
                    return;
                }
            }
        }
        ++metrics.skipped;
    }

    function checkIn(uint256 potSeed, uint256 actorSeed) external {
        ++metrics.calls;
        for (uint256 p; p < potCount; ++p) {
            uint256 id = 1 + (potSeed % potCount + p) % potCount;
            PotLedger storage pot = pots[id];
            if (pot.finalized || block.timestamp > pot.config.checkInClose) continue;
            for (uint256 a; a < ACTORS; ++a) {
                address actor = actors[(actorSeed % ACTORS + a) % ACTORS];
                PersonLedger storage person = people[id][actor];
                if (person.joins == 1 && person.checkIns == 0) {
                    _warpTo(pot.config.checkInOpen);
                    _checkIn(id, actor);
                    return;
                }
            }
        }
        ++metrics.skipped;
    }

    function finalize(uint256 potSeed) external {
        ++metrics.calls;
        for (uint256 p; p < potCount; ++p) {
            uint256 id = 1 + (potSeed % potCount + p) % potCount;
            if (!pots[id].finalized) {
                _finalize(id);
                return;
            }
        }
        ++metrics.skipped;
    }

    function claim(uint256 potSeed, uint256 actorSeed) external {
        ++metrics.calls;
        for (uint256 p; p < potCount; ++p) {
            uint256 id = 1 + (potSeed % potCount + p) % potCount;
            if (!pots[id].finalized) continue;
            for (uint256 a; a < ACTORS; ++a) {
                address actor = actors[(actorSeed % ACTORS + a) % ACTORS];
                if (_unpaidReward(id, actor) != 0) {
                    _claim(id, actor);
                    return;
                }
            }
        }
        ++metrics.skipped;
    }

    function donate(uint256 amountSeed) external {
        ++metrics.calls;
        _recordDonation(1 + amountSeed % MAX_DONATION);
    }

    function advanceTime(uint256 secondsSeed) external {
        ++metrics.calls;
        _warpTo(block.timestamp + 1 + secondsSeed % 11);
    }

    /// @dev Post-sequence drain is NOT fuzz-targeted and does not count as random calls.
    /// It checks eventual conservation, including pots left open/unclaimed by the sequence.
    function settleAll() external {
        require(msg.sender == controller, "test controller only");
        for (uint256 id = 1; id <= potCount; ++id) {
            if (!pots[id].finalized) _finalize(id);
            for (uint256 a; a < ACTORS; ++a) {
                if (_unpaidReward(id, actors[a]) != 0) _claim(id, actors[a]);
            }
            assertEq(pots[id].paid, pots[id].deposited, "fully settled pot");
        }
        assertEq(token.balanceOf(address(core)), totalDonated, "only donations remain after drain");
    }

    function assertPerPotAccounting() public view {
        assertEq(core.nextPotId(), potCount + 1);
        for (uint256 id = 1; id <= potCount; ++id) {
            PotLedger storage model = pots[id];
            PotState memory actual = core.getPot(id);
            assertEq(abi.encode(actual.config), abi.encode(model.config), "immutable config");
            assertEq(actual.participantCount, model.joined, "recorded N");
            assertEq(actual.checkedInCount, model.attended, "recorded K");
            assertEq(model.deposited, model.joined * model.config.stakeAmount, "pot recorded deposits");
            assertLe(model.paid, model.deposited, "pot cannot spend another pot or donations");
            assertEq(uint256(actual.status), uint256(model.finalized ? PotStatus.Finalized : PotStatus.Open));

            uint256 remaining;
            uint256 accountedPaid;
            uint256 accountedClaims;
            for (uint256 a; a < ACTORS; ++a) {
                address actor = actors[a];
                uint256 reward = _unpaidReward(id, actor);
                assertEq(core.claimable(id, actor), reward, "independent beneficiary entitlement");
                remaining += reward;
                accountedPaid += people[id][actor].paid;
                accountedClaims += people[id][actor].claims;
            }
            assertEq(accountedPaid, model.paid, "per-pot accounted transfers");
            assertEq(accountedClaims, model.claims, "per-pot accounted claims");
            if (!model.finalized) {
                assertEq(model.paid, 0);
                assertEq(actual.payoutPerWinner, 0);
                assertEq(actual.dustAmount, 0);
            } else {
                assertEq(remaining + model.paid, model.deposited, "dust and claims conserve pot deposits");
                if (model.attended == 0) {
                    assertEq(actual.payoutPerWinner, model.joined == 0 ? 0 : model.config.stakeAmount);
                    assertEq(actual.dustAmount, 0);
                } else {
                    assertEq(actual.payoutPerWinner, model.deposited / model.attended, "donations not rewards");
                    assertEq(actual.dustAmount, model.deposited % model.attended);
                    assertLt(actual.dustAmount, model.attended);
                    assertEq(actual.payoutPerWinner * model.attended + actual.dustAmount, model.deposited);
                }
            }
        }
    }

    function assertAggregateAccounting() public view {
        uint256 deposits;
        uint256 paid;
        uint256 obligations;
        for (uint256 id = 1; id <= potCount; ++id) {
            deposits += pots[id].deposited;
            paid += pots[id].paid;
            obligations += pots[id].deposited - pots[id].paid;
        }
        assertEq(deposits, totalDeposited);
        assertEq(paid, totalPaid);
        assertEq(token.balanceOf(address(core)), obligations + totalDonated, "aggregate obligations plus donations");
        for (uint256 a; a < ACTORS; ++a) {
            address actor = actors[a];
            assertEq(token.balanceOf(actor), INITIAL_BALANCE - actorDeposits[actor] + actorPayouts[actor]);
        }
        assertEq(token.balanceOf(donor), INITIAL_BALANCE - totalDonated);
        assertEq(token.balanceOf(relayer), 0, "relayer never receives beneficiary funds");
        assertEq(token.totalSupply(), (ACTORS + 1) * INITIAL_BALANCE, "no minting after funding");
    }

    function assertAttendanceAndClaims() public view {
        for (uint256 id = 1; id <= potCount; ++id) {
            uint256 joins;
            uint256 checkIns;
            uint256 claims;
            uint256 orderMask;
            for (uint256 a; a < ACTORS; ++a) {
                address actor = actors[a];
                PersonLedger storage model = people[id][actor];
                (bool joined, bool checkedIn, bool claimed, uint256 order) = core.getParticipantStatus(id, actor);
                assertLe(model.joins, 1);
                assertLe(model.checkIns, model.joins);
                assertLe(model.claims, model.joins);
                assertEq(joined, model.joins == 1);
                assertEq(checkedIn, model.checkIns == 1);
                assertEq(claimed, model.claims == 1);
                assertEq(order, model.order);
                if (checkedIn) {
                    assertGt(order, 0);
                    assertLe(order, pots[id].attended);
                    assertEq(orderMask & (1 << order), 0, "unique check-in order");
                    orderMask |= 1 << order;
                    assertTrue(core.usedNonces(id, model.nonce));
                } else {
                    assertEq(order, 0);
                    if (pots[id].attended > 0) assertFalse(claimed, "K>0 no-show cannot claim");
                }
                if (claimed) {
                    assertTrue(pots[id].finalized);
                    assertEq(model.paid, _reward(id, actor), "one exact beneficiary payout");
                    if (pots[id].attended == 0) assertEq(model.paid, pots[id].config.stakeAmount, "K=0 refund");
                }
                joins += model.joins;
                checkIns += model.checkIns;
                claims += model.claims;
            }
            assertEq(joins, pots[id].joined);
            assertEq(checkIns, pots[id].attended);
            assertEq(claims, pots[id].claims);
            assertEq(orderMask, (1 << (pots[id].attended + 1)) - 2, "contiguous attendance order");
        }
    }

    function _createPot(uint256 stakeSeed, uint256 delaySeed) private {
        // Odd stakes preserve a guaranteed dust case whenever N=3 and K=2.
        uint256 stake = 1 + 2 * (stakeSeed % ((MAX_STAKE - 1) / 2 + 1));
        if (stake > MAX_STAKE) stake = MAX_STAKE;
        uint64 registrationClose = uint64(block.timestamp + 20 + delaySeed % 31);
        uint256 id = potCount + 1;
        PotConfig memory config = PotConfig({
            token: address(token),
            verifier: vm.addr(VERIFIER_KEY_BASE + id),
            stakeAmount: stake,
            registrationClose: registrationClose,
            checkInOpen: registrationClose + 10,
            checkInClose: registrationClose + 50
        });
        assertEq(core.createPot(config), id, "sequential pot identity");
        pots[id].config = config;
        potCount = id;
        ++metrics.creates;
        _updateOutstandingPots();
    }

    function _updateOutstandingPots() private {
        uint256 fundedOutstanding;
        for (uint256 id = 1; id <= potCount; ++id) {
            PotLedger storage pot = pots[id];
            if (pot.deposited > pot.paid) ++fundedOutstanding;
        }
        if (fundedOutstanding > metrics.maxFundedOutstandingPots) {
            metrics.maxFundedOutstandingPots = fundedOutstanding;
        }
    }

    function _plannedAttendance(uint256 id) private pure returns (uint256) {
        // Cycle deterministically through K=2, K=0 and K=3 for each N=3 pot.
        uint256 branch = (id - 1) % 3;
        if (branch == 0) return 2;
        if (branch == 1) return 0;
        return 3;
    }

    function _recordDonation(uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(core));
        vm.prank(donor);
        assertTrue(token.transfer(address(core), amount));
        assertEq(token.balanceOf(address(core)), beforeBalance + amount, "donation transfer");
        totalDonated += amount;
        ++metrics.donations;
    }

    function _join(uint256 id, address actor) private {
        uint256 stake = pots[id].config.stakeAmount;
        uint256 beforeCore = token.balanceOf(address(core));
        uint256 beforeActor = token.balanceOf(actor);
        vm.prank(actor);
        core.joinPot(id);
        assertEq(token.balanceOf(address(core)), beforeCore + stake);
        assertEq(token.balanceOf(actor), beforeActor - stake);
        ++people[id][actor].joins;
        ++pots[id].joined;
        pots[id].deposited += stake;
        actorDeposits[actor] += stake;
        totalDeposited += stake;
        ++metrics.joins;
        _updateOutstandingPots();
        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(AlreadyJoined.selector, id, actor));
        core.joinPot(id);
        ++metrics.duplicateJoinRejections;
    }

    function _checkIn(uint256 id, address actor) private {
        // The same nonce numbers recur across pots, but never across attendees in a pot.
        uint256 nonce = pots[id].attended + 1;
        if (nonce > 1) {
            CheckInProof memory replay = _proof(id, actor, nonce - 1);
            vm.expectRevert(abi.encodeWithSelector(NonceAlreadyUsed.selector, id, nonce - 1));
            core.checkIn(replay);
            ++metrics.nonceReplayRejections;
        }
        CheckInProof memory proof = _proof(id, actor, nonce);
        vm.prank(relayer);
        core.checkIn(proof);
        PersonLedger storage person = people[id][actor];
        ++person.checkIns;
        person.order = ++pots[id].attended;
        person.nonce = nonce;
        ++metrics.checkIns;

        CheckInProof memory duplicate = _proof(id, actor, nonce + ACTORS);
        vm.expectRevert(abi.encodeWithSelector(AlreadyCheckedIn.selector, id, actor));
        core.checkIn(duplicate);
        assertFalse(core.usedNonces(id, duplicate.nonce), "failed duplicate cannot consume nonce");
        ++metrics.duplicateCheckInRejections;
    }

    function _finalize(uint256 id) private {
        PotLedger storage pot = pots[id];
        // Advance only to this pot's first legal finalization timestamp; never warp backwards.
        _warpTo(uint256(pot.config.checkInClose) + 1);
        vm.prank(relayer);
        core.finalize(id);
        pot.finalized = true;
        ++metrics.finalizes;
        _updateOutstandingPots();
        if (pot.joined == 0) {
            ++metrics.emptyPots;
        } else if (pot.attended == 0) {
            ++metrics.refundPots;
        } else {
            ++metrics.winnerPots;
            if (pot.attended == pot.joined) ++metrics.allAttendPots;
            if (pot.deposited % pot.attended != 0) ++metrics.dustPots;
            for (uint256 a; a < ACTORS; ++a) {
                address actor = actors[a];
                if (people[id][actor].joins == 1 && people[id][actor].checkIns == 0) {
                    vm.prank(relayer);
                    vm.expectRevert(abi.encodeWithSelector(NotEligible.selector, id, actor));
                    core.claim(id, actor);
                    ++metrics.noShowRejections;
                }
            }
        }
        vm.expectRevert(abi.encodeWithSelector(PotAlreadyFinalized.selector, id));
        core.finalize(id);
        ++metrics.duplicateFinalizeRejections;
    }

    function _claim(uint256 id, address actor) private {
        uint256 amount = _reward(id, actor);
        uint256 beforeActor = token.balanceOf(actor);
        uint256 beforeCore = token.balanceOf(address(core));
        uint256 beforeRelayer = token.balanceOf(relayer);
        vm.prank(relayer);
        core.claim(id, actor);
        assertEq(token.balanceOf(actor), beforeActor + amount, "payout always goes to beneficiary");
        assertEq(token.balanceOf(address(core)), beforeCore - amount);
        assertEq(token.balanceOf(relayer), beforeRelayer, "caller gets no payout");
        ++people[id][actor].claims;
        people[id][actor].paid += amount;
        ++pots[id].claims;
        pots[id].paid += amount;
        actorPayouts[actor] += amount;
        totalPaid += amount;
        ++metrics.claims;
        _updateOutstandingPots();
        if (pots[id].attended == 0) ++metrics.refundClaims;
        else if (people[id][actor].order <= pots[id].deposited % pots[id].attended) ++metrics.dustBonuses;
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(AlreadyClaimed.selector, id, actor));
        core.claim(id, actor);
        ++metrics.duplicateClaimRejections;
    }

    function _proof(uint256 id, address actor, uint256 nonce) private view returns (CheckInProof memory) {
        uint64 deadline = pots[id].config.checkInClose;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(VERIFIER_KEY_BASE + id, core.hashCheckIn(id, actor, nonce, deadline));
        return CheckInProof(id, actor, nonce, deadline, abi.encodePacked(r, s, v));
    }

    function _reward(uint256 id, address actor) private view returns (uint256) {
        PotLedger storage pot = pots[id];
        PersonLedger storage person = people[id][actor];
        if (person.joins == 0) return 0;
        if (pot.attended == 0) return pot.config.stakeAmount;
        if (person.checkIns == 0) return 0;
        return pot.deposited / pot.attended + (person.order <= pot.deposited % pot.attended ? 1 : 0);
    }

    function _unpaidReward(uint256 id, address actor) private view returns (uint256) {
        if (!pots[id].finalized || people[id][actor].claims != 0) return 0;
        return _reward(id, actor);
    }

    function _warpTo(uint256 timestamp) private {
        if (timestamp > block.timestamp) {
            vm.warp(timestamp);
            ++metrics.warps;
        }
    }
}
