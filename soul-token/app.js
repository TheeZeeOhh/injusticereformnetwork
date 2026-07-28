// $SOUL token console — standalone, wallet-based signing.
//
// Isolation guarantees:
//   * Loaded only by soul-token/index.html. NEVER imported by the Sanctuary app.
//   * All signing happens in the user's wallet (MetaMask). This code never sees,
//     requests, or stores a private key.
//   * Targets Sepolia testnet (chain id 11155111).
//
// viem is pulled from a CDN as ESM so this module needs no build step and adds
// no dependency to the repo's package.json.

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatUnits,
  parseUnits,
  getAddress,
} from "https://esm.sh/viem@2.21.55";
import { sepolia } from "https://esm.sh/viem@2.21.55/chains";

const SEPOLIA_CHAIN_ID = 11155111;

// Minimal ABI — only what this console uses.
const SOUL_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
];

const $ = (id) => document.getElementById(id);
const setStatus = (msg, kind) => {
  const el = $("status");
  el.textContent = msg;
  el.style.color = kind === "ok" ? "var(--ok)" : kind === "bad" ? "var(--bad)" : "var(--bone)";
};

let publicClient = createPublicClient({ chain: sepolia, transport: http() });
let walletClient = null;
let account = null;
let token = null; // { address, decimals, symbol }

function requireWallet() {
  if (!window.ethereum) {
    setStatus("No browser wallet detected. Install MetaMask to continue.", "bad");
    return false;
  }
  return true;
}

async function connect() {
  if (!requireWallet()) return;
  try {
    setStatus("Requesting wallet connection…");
    walletClient = createWalletClient({ chain: sepolia, transport: custom(window.ethereum) });
    const [addr] = await walletClient.requestAddresses();
    account = addr;

    const chainId = await walletClient.getChainId();
    $("account").style.display = "block";
    $("acct-addr").textContent = addr;
    $("acct-net").textContent =
      chainId === SEPOLIA_CHAIN_ID ? "Sepolia ✓" : `chain ${chainId} — switch to Sepolia!`;

    if (chainId !== SEPOLIA_CHAIN_ID) {
      setStatus("Wallet is not on Sepolia. Switch networks, then reconnect.", "bad");
      return;
    }
    setStatus("Wallet connected.", "ok");
  } catch (err) {
    setStatus(`Connect failed: ${err.shortMessage || err.message}`, "bad");
  }
}

async function loadToken() {
  const raw = $("contract").value.trim();
  let address;
  try {
    address = getAddress(raw); // checksums + validates
  } catch {
    setStatus("Invalid contract address.", "bad");
    return;
  }

  try {
    setStatus("Reading token…");
    const [name, symbol, decimals, supply, owner] = await Promise.all([
      publicClient.readContract({ address, abi: SOUL_ABI, functionName: "name" }),
      publicClient.readContract({ address, abi: SOUL_ABI, functionName: "symbol" }),
      publicClient.readContract({ address, abi: SOUL_ABI, functionName: "decimals" }),
      publicClient.readContract({ address, abi: SOUL_ABI, functionName: "totalSupply" }),
      publicClient.readContract({ address, abi: SOUL_ABI, functionName: "owner" }),
    ]);

    token = { address, decimals, symbol };

    let balance = 0n;
    let isOwner = false;
    if (account) {
      balance = await publicClient.readContract({
        address, abi: SOUL_ABI, functionName: "balanceOf", args: [account],
      });
      isOwner = getAddress(owner) === getAddress(account);
    }

    $("token").style.display = "block";
    $("tk-name").textContent = name;
    $("tk-symbol").textContent = symbol;
    $("tk-supply").textContent = `${formatUnits(supply, decimals)} ${symbol}`;
    $("tk-balance").textContent = account ? `${formatUnits(balance, decimals)} ${symbol}` : "connect wallet";
    $("tk-owner").textContent = owner;
    $("tk-isowner").textContent = account ? (isOwner ? "yes ✓" : "no") : "connect wallet";
    $("mint-box").style.display = isOwner ? "block" : "none";

    setStatus("Token loaded.", "ok");
  } catch (err) {
    setStatus(`Load failed: ${err.shortMessage || err.message}`, "bad");
  }
}

async function mint() {
  if (!walletClient || !account) { setStatus("Connect your wallet first.", "bad"); return; }
  if (!token) { setStatus("Load a token first.", "bad"); return; }

  let to;
  try {
    to = getAddress($("mint-to").value.trim());
  } catch {
    setStatus("Invalid recipient address.", "bad");
    return;
  }

  const whole = $("mint-amt").value.trim();
  if (!whole || Number(whole) <= 0) { setStatus("Enter an amount > 0.", "bad"); return; }
  const amount = parseUnits(whole, token.decimals);

  try {
    setStatus("Confirm the transaction in your wallet…");
    const hash = await walletClient.writeContract({
      account,
      address: token.address,
      abi: SOUL_ABI,
      functionName: "mint",
      args: [to, amount],
    });
    setStatus(`Broadcast. Waiting for confirmation… tx: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") {
      setStatus(`Minted ${whole} ${token.symbol} to ${to}. tx: ${hash}`, "ok");
      await loadToken(); // refresh balances/supply
    } else {
      setStatus(`Transaction reverted. tx: ${hash}`, "bad");
    }
  } catch (err) {
    setStatus(`Mint failed: ${err.shortMessage || err.message}`, "bad");
  }
}

$("connect").addEventListener("click", connect);
$("load").addEventListener("click", loadToken);
$("mint").addEventListener("click", mint);
