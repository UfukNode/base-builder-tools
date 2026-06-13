# Security

Report issues by opening a GitHub issue in the public repository where this folder is published.

## Non-Goals

This app does not custody funds, store private keys, route transactions through a backend, sponsor gas, request signatures, or request GitHub OAuth permissions. It uses Base Blockscout's public read-only API to display a connected wallet's historical contract deployment count and GitHub's public Search API to check public commits for an entered username.

## Review Checklist

Before deploying a public copy, verify:

- `index.html` only loads `./styles.css` and `./app.js`.
- `app.js` does not call signing methods.
- `app.js` does not include token approval calldata.
- `app.js` only requests Base chain ID `8453`.
- No analytics, trackers, or third-party scripts were added.
