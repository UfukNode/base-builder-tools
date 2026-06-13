# Base Builder Tools

Static task dapp for Base and GitHub flows:

- **Builder:** deploy 1, 5, or 10 minimal contracts from the connected wallet.
- **Onchain:** send explicit, wallet-confirmed, zero-value self transactions to increase the connected wallet's Base transaction count.
- **GitHub:** generate local commands for 1, 50, or 100 public commits and check public commit count by username.

## Security Model

This app is intentionally small and dependency-free.

- No private key input
- No backend
- No database
- No analytics
- No external scripts or CDN assets
- Read-only Blockscout API call for historical deploy count
- Read-only GitHub Search API call for public commit count
- No token approvals
- No `personal_sign`, `eth_sign`, or typed-data signature requests
- Only Base mainnet transaction requests are built

The wallet confirmation screen is the final source of truth. Before confirming, users should check:

- Contract deploy transactions have no `to` address and `value = 0`.
- Minimal transaction helper transactions have `to = your own address` and `value = 0`.

The contract deploy counter sends the connected wallet address to Base Blockscout's public API. The GitHub panel sends the entered username to GitHub's public Search API. Neither API call grants wallet or GitHub permissions.

## Gas

Base mainnet transactions are not free. The onchain helper uses low-cost zero-value self transactions, but every transaction still needs gas.

## Run Locally

Use the included dependency-free server:

```bash
npm start
```

Or run it directly:

```bash
node serve.js
```

Any other static web server also works:

```bash
python -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## Publish

This folder can be published as a static site on GitHub Pages, Cloudflare Pages, Netlify, Vercel, or any regular web server.

For GitHub Pages:

1. Put these files in a public repository.
2. Enable Pages for the repository branch/folder.
3. Share the Pages URL.

## Contract Bytecode

The builder flow deploys a small proof contract instead of a token, approval contract, or admin-controlled contract.

Its constructor stores the deployer address in storage slot `0`. The runtime returns that stored address for read calls. In Solidity-like terms, it behaves like:

```text
contract BaseBuilderProof {
    address public builder;

    constructor() {
        builder = msg.sender;
    }
}
```

Creation bytecode:

```text
0x33600055600b6010600039600b6000f360005460005260206000f3
```

Runtime bytecode:

```text
0x60005460005260206000f3
```

This creates a real contract account and records the deployer address. It has no token logic, no approvals, no transfer function, no owner-only controls, and no external calls.
