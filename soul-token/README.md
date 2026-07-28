# $SOUL Token

A real ERC-20 token for the Injustice Reform Network, built as a **self-contained
module** that is deliberately **isolated from the Sanctuary vault app**.

> **Why separate?** Sanctuary's core guarantee is *no network egress + subpoena
> resistance* — client PHI keys live in RAM and nothing leaves the device. A live
> blockchain wallet is the opposite (it broadcasts signed transactions to a public
> network). It must **never** share a process with the vault. This module runs on
> its own, has its own toolchain, and adds **no** web3 dependencies to the root app.

## Deployments

| Network | Contract address | Owner / initial holder | Supply | Explorer |
|---------|------------------|------------------------|--------|----------|
| Sepolia (testnet) | `0x48A8a547B3B6C763D3ABDc9bC65AA17054d7DDCC` | `0x415fdc2c2A375b9bB2C8687958446c156004F533` | 1,000,000 SOUL | [view](https://sepolia.etherscan.io/token/0x48A8a547B3B6C763D3ABDc9bC65AA17054d7DDCC) |

> The Sepolia owner is a **throwaway testnet deployer** — it holds no real value.
> Do not reuse it for anything with real funds. Mainnet has no deployment (by design).

## ⚠️ Testnet only (for now)

Everything here targets **Ethereum Sepolia** (a test network). Sepolia ETH is free
from a faucet and has **no real-world value**. Mainnet deployment is intentionally
**not configured** and must not happen until:

1. The testnet flow is fully proven, **and**
2. Legal/financial sign-off is obtained. IRN is a 501(c)(3); token issuance can
   carry securities/tax/regulatory implications. That gate is out of scope for code.

**Never** put a mainnet key, or any key controlling real funds, in `.env`.

## Layout

```
soul-token/
  src/SoulToken.sol       ERC-20 (OpenZeppelin ERC20 + Ownable, owner-only mint)
  test/SoulToken.t.sol    Foundry tests (mint, supply, owner-only enforcement)
  script/Deploy.s.sol     Deploy script (reads config from .env)
  index.html + app.js     Standalone wallet UI (viem + MetaMask) — NOT imported by React
  foundry.toml            Foundry config (Sepolia only)
  .env.example            Config template (copy to .env, which is gitignored)
```

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`):
  ```bash
  curl -L https://foundry.paradigm.xyz | bash && foundryup
  ```
- A Sepolia RPC URL (Alchemy / Infura / public endpoint).
- A **throwaway** testnet wallet, funded from a Sepolia faucet:
  - https://sepoliafaucet.com
  - https://www.alchemy.com/faucets/ethereum-sepolia

## Install dependencies

Foundry libraries (`lib/`) are **not** committed to the repo. After cloning,
fetch them once:

```bash
cd soul-token
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
```

## Build & test

```bash
forge build      # compile
forge test -vv   # run the contract test suite
```

## Deploy to Sepolia

```bash
cp .env.example .env         # then fill in real values
source .env                  # or use --env-file, depending on your shell

forge script script/Deploy.s.sol \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

The script prints the deployed contract address. View it on
[Sepolia Etherscan](https://sepolia.etherscan.io) to confirm the minted supply.

## Mint / interact via the wallet UI

Open `index.html` in a browser with MetaMask installed (set to the Sepolia
network). Paste the deployed contract address, connect your wallet, and — if you
are the owner — mint. **Your private key never leaves MetaMask; this app never
sees it.**

Alternatively, mint from the CLI with `cast`:

```bash
cast send <CONTRACT_ADDRESS> "mint(address,uint256)" <TO> <AMOUNT_WEI> \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$PRIVATE_KEY"
```
