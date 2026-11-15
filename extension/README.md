# Monero One — standalone Chrome extension

An experimental Manifest V3 browser wallet inspired by Monero One's native iOS app. The Swift app is preserved unchanged. This extension is a separate implementation, using **monero-ts 0.11.22** and the Monero wallet2 engine compiled to WebAssembly. It does not require the iOS app, a desktop wallet, a wallet-RPC server, or a hosted key service.

**Unaudited alpha. Test on stagenet. Do not trust this build with meaningful funds.**

## Build and install

Requires Node 22+ and npm.

```sh
cd extension
npm ci
npm test
npm run build
```

1. Open `chrome://extensions` in Chrome 120+.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select `extension/dist`.
4. Pin Monero One and click its toolbar icon.

The extension opens a dedicated wallet tab, rather than a short-lived popup. Closing a popup must not interrupt a long-running wallet sync or transaction operation. Only one wallet tab can hold the local wallet lock at a time.

For the visual development preview, run `npm run dev` and open port 3000 over HTTPS. The preview uses its own origin's storage: it is **not** the installed extension's wallet. Never enter an existing real-funds recovery phrase into the development preview. Host permissions and the production CSP must be tested in the installed extension.

## Available features

- Create independent mainnet or stagenet wallets; stagenet is the default.
- Restore a **legacy 25-word** Monero seed with an explicit restore height.
- Multiple local wallets, each with its own password and encrypted vault.
- Password-confirmed recovery phrase reveal and backup confirmation before receiving/sending.
- Local WebAssembly key generation, scanning, and signing; no companion app.
- Configure a Monero **daemon** directly, verify its network, and manually sync with progress.
- Exact atomic-unit XMR arithmetic, spendable balances, pending/locked status.
- Prepare a transaction without relaying, then review full recipient, amount, fee and total. Password and explicit confirmation are required before broadcast.
- Receive QR codes and Monero payment URIs with optional amount and note.
- New receive subaddresses, encrypted address book, activity filters/search and CSV export.
- Encrypted backup export/import and a balance visibility toggle.
- Five-minute inactivity lock that terminates the wallet worker.
- Responsive keyboard-accessible UI and reduced-motion support.

## Connection model

Standalone means that the wallet engine is in the browser. Network operations still need a Monero **node**. Supply a node you trust on the wallet's selected network. There is deliberately no silent connection to a third-party node or price provider.

- Remote nodes require HTTPS. HTTP is allowed for `localhost` and `127.0.0.1`.
- Chrome requests optional access only to the node origin the user chooses.
- The node's `get_info` response is checked before saving, syncing or preparing a send.
- The development web preview additionally depends on the node enabling CORS.
- No wallet RPC is used. No seed or private key is sent to a node.
- A remote node sees your IP address and may learn request timing. Built-in Tor/SOCKS is not implemented.
- Keep the wallet tab open while syncing. Manual sync is required before sending. Large restores can take substantial time and memory.

## Storage and security

Wallet keys and cache from `wallet.getData()` are encrypted again together with contacts, connection configuration and backup state using Web Crypto **AES-256-GCM**, a fresh random 96-bit IV per write and a non-exportable key derived using **PBKDF2-HMAC-SHA-256 (600,000 iterations)** with a random 128-bit salt. The wallet engine's keys file is also password-encrypted. IndexedDB stores the ciphertext; the wallet name, network and creation time are unencrypted metadata.

Passwords and derived keys are not persisted. Locking terminates the worker and drops session references, but JavaScript cannot guarantee zeroization of garbage-collected memory. The inactivity timer defers locking until an in-flight operation completes to avoid interrupting a broadcast or losing cache state.

The extension has no content scripts, dApp provider, remote scripts, analytics, or externally connectable API. Dependencies and the wallet worker are bundled locally. The production CSP allows WebAssembly compilation but not JavaScript `unsafe-eval`. A Web Lock prevents competing wallet tabs from overwriting local data.

Clearing browser data or removing the extension can permanently delete local wallets. Keep the recovery phrase offline and keep the password if you export an encrypted backup. CSV activity exports and payment request notes are **not private encrypted backups**.

## Limits and validation

No Polyseed, hardware wallet, biometric authentication, price feed/alerts, notifications, native Tor, or mobile widgets are implemented. A Chrome extension cannot safely inherit these iOS capabilities merely by copying their screens.

Run `npm test` for amount, URI, node URL, encryption, escaping and CSV tests. `npm run test:extension` runs a Chromium smoke test when Playwright and a compatible Chromium binary are available (see the script for `CHROMIUM_PATH`). It exercises the packaged extension, not just the web preview.

End-to-end sending requires a funded stagenet wallet and a reachable node. Offline creation, restore, persistence, backup and UI checks are not evidence that real-network sends or scanning have passed. An independent security audit is required before release for real funds.

## Attribution

Original project: [bwgh0/MoneroOne](https://github.com/bwgh0/MoneroOne), MIT. This fork retains its license and native app.

Wallet library: [woodser/monero-ts](https://github.com/woodser/monero-ts), MIT, with bundled dependency notices in the build output.
