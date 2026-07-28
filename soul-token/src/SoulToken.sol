// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title SoulToken ($SOUL)
/// @notice Standard ERC-20 for the Injustice Reform Network.
///         Owner-only minting; initial supply minted to the deployer-designated
///         owner at construction. 18 decimals (OZ default).
/// @dev Audited OpenZeppelin base contracts only. No custom crypto.
contract SoulToken is ERC20, Ownable {
    /// @param initialOwner   Address that receives the initial supply and holds mint rights.
    /// @param initialSupply  Whole-token amount to mint at genesis (scaled by 1e18 internally).
    constructor(address initialOwner, uint256 initialSupply)
        ERC20("Soul", "SOUL")
        Ownable(initialOwner)
    {
        _mint(initialOwner, initialSupply * 10 ** decimals());
    }

    /// @notice Mint additional supply. Restricted to the contract owner.
    /// @param to      Recipient of the newly minted tokens.
    /// @param amount  Raw token amount (already scaled by 1e18).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
