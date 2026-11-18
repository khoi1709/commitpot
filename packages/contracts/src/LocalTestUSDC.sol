// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local development fixture only. Not official USDC and not for a public network.
contract LocalTestUSDC is ERC20 {
    constructor() ERC20("Local Test USDC", "tUSDC") {
        require(block.chainid == 31337, "Local fixture only");
    }

    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address beneficiary, uint256 amount) external { _mint(beneficiary, amount); }
}
