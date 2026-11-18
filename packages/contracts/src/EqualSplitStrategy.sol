// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPayoutStrategy} from "./IPayoutStrategy.sol";

contract EqualSplitStrategy is IPayoutStrategy {
    function calculatePayout(uint256 participantCount, uint256 checkedInCount, uint256 stakeAmount)
        external
        pure
        returns (uint256 payoutPerWinner, uint256 dustAmount)
    {
        if (participantCount == 0) return (0, 0);
        if (checkedInCount == 0) return (stakeAmount, 0);

        uint256 pool = participantCount * stakeAmount;
        return (pool / checkedInCount, pool % checkedInCount);
    }
}
