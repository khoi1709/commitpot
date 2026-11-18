// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAttendanceVerifier {
    function verify(address expectedSigner, bytes32 digest, bytes calldata signature) external view returns (bool);
}
