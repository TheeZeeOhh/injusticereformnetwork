// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SoulToken} from "../src/SoulToken.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract SoulTokenTest is Test {
    SoulToken internal token;
    address internal owner = address(0xA11CE);
    address internal alice = address(0xBEEF);

    uint256 internal constant INITIAL = 1_000_000; // whole tokens

    function setUp() public {
        token = new SoulToken(owner, INITIAL);
    }

    function test_Metadata() public view {
        assertEq(token.name(), "Soul");
        assertEq(token.symbol(), "SOUL");
        assertEq(token.decimals(), 18);
    }

    function test_InitialSupplyMintedToOwner() public view {
        uint256 expected = INITIAL * 10 ** 18;
        assertEq(token.totalSupply(), expected);
        assertEq(token.balanceOf(owner), expected);
    }

    function test_OwnerIsInitialOwner() public view {
        assertEq(token.owner(), owner);
    }

    function test_OwnerCanMint() public {
        uint256 amount = 500 * 10 ** 18;
        vm.prank(owner);
        token.mint(alice, amount);
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.totalSupply(), INITIAL * 10 ** 18 + amount);
    }

    function test_NonOwnerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice)
        );
        token.mint(alice, 1 ether);
    }

    function test_Transfer() public {
        uint256 amount = 100 * 10 ** 18;
        vm.prank(owner);
        bool ok = token.transfer(alice, amount);
        assertTrue(ok);
        assertEq(token.balanceOf(alice), amount);
    }
}
