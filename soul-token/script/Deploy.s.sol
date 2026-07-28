// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SoulToken} from "../src/SoulToken.sol";

/// @notice Deploys SoulToken to the configured network (Sepolia testnet).
/// @dev Reads config from env:
///        PRIVATE_KEY     - deployer key (TESTNET ONLY; never a real-funds key)
///        SOUL_OWNER      - address to receive initial supply + mint rights
///                          (defaults to the deployer if unset)
///        SOUL_SUPPLY     - initial whole-token supply (defaults to 1_000_000)
contract Deploy is Script {
    function run() external returns (SoulToken token) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address owner = vm.envOr("SOUL_OWNER", deployer);
        uint256 supply = vm.envOr("SOUL_SUPPLY", uint256(1_000_000));

        vm.startBroadcast(deployerKey);
        token = new SoulToken(owner, supply);
        vm.stopBroadcast();

        console.log("SoulToken deployed at:", address(token));
        console.log("Owner / initial holder:", owner);
        console.log("Initial supply (whole tokens):", supply);
    }
}
