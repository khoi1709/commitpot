// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IAttendanceVerifier} from "./IAttendanceVerifier.sol";

contract EIP712AttendanceVerifier is IAttendanceVerifier {
    function verify(address expectedSigner, bytes32 digest, bytes calldata signature)
        external
        view
        returns (bool)
    {
        return SignatureChecker.isValidSignatureNow(expectedSigner, digest, signature);
    }
}
