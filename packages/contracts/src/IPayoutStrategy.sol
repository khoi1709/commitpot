// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPayoutStrategy {
    function calculatePayout(uint256 participantCount, uint256 checkedInCount, uint256 stakeAmount)
        external
        pure
        returns (uint256 payoutPerWinner, uint256 dustAmount);
}
