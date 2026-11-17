# Monero Mobile — standalone Chrome wallet

An independent Manifest V3 browser wallet using **monero-ts 0.11.22** and the Monero wallet2 engine compiled to WebAssembly. The existing native iOS source is preserved. This extension does not require the iOS app, a desktop wallet, a wallet-RPC server, or a hosted key service.

**Mainnet is enabled and live synchronization is tested. No independent security audit or funded real-mainnet transfer has been completed. Do not trust this build with meaningful funds.**

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
4. Pin Monero Mobile and click its toolbar icon.

The extension opens a dedicated wallet tab, rather than a short-lived popup. Closing a popup must not interrupt a long-running wallet sync or transaction operation. Only one wallet tab can hold the local wallet lock at a time.

For the visual development preview, run `npm run dev` and open port 3000 over HTTPS. The preview uses its own origin's storage: it is **not** the installed extension's wallet. Never enter an existing real-funds recovery phrase into the development preview. Host permissions and the production CSP must be tested in the installed extension.

## Available features

- Create independent mainnet or stagenet wallets; mainnet is the default.
- Connected setup with an editable suggested HTTPS node and explicit privacy consent. Users authorize and verify the selected node in a separate step before the wallet-creation action. New connected wallets begin scanning 30 blocks before creation, rather than scanning the entire chain.
- Restore a **legacy 25-word** Monero seed with an explicit restore height.
- Multiple local wallets, each with its own password and encrypted vault.
- Password-confirmed recovery phrase reveal and backup confirmation before receiving/sending.
- Local WebAssembly key generation, scanning, and signing; no companion app.
- Configure a Monero **daemon** directly, verify its network, and automatically scan for incoming funds after unlock and while the wallet is open. Manual sync remains available.
- Exact atomic-unit XMR arithmetic, spendable balances, pending/locked status.
- Prepare a transaction without relaying, then review full recipient, amount, fee and total. Password and explicit confirmation are required before broadcast.
- Receive QR codes and Monero payment URIs with optional amount and note.
- New receive subaddresses, encrypted address book, activity filters/search and CSV export.
- Encrypted backup export/import and a balance visibility toggle.
- Five-minute inactivity lock that terminates the wallet worker.
- Responsive keyboard-accessible UI and reduced-motion support.

## Connection model

Standalone means that the wallet engine is in the browser. Network operations still need a Monero **node**. Setup suggests Triplebit (`https://xmr.triplebit.org`) for mainnet and Nodely (`https://xmr.nodely.dev:38089`) for stagenet. The node URL is editable and the privacy acknowledgment explicitly covers that connection. There is no connection before submitting setup with consent, no silent failover to a different provider, and no price provider.

- Remote nodes require HTTPS. HTTP is allowed for `localhost` and `127.0.0.1`.
- Before wallet creation, the user explicitly chooses “Authorize and check node.” Chrome then requests optional access only to the node origin they selected; the create-wallet action itself never triggers a browser permission prompt. Permission is not requested in offline setup.
- The node's `get_info` response is checked before saving, syncing or preparing a send.
- New connected wallets record a restore height from the verified chain tip **before** key generation, with a 30-block safety margin. Offline wallets still scan from genesis; restores use the user's explicit restore height and never silently jump to the current tip.
- The development web preview additionally depends on the node enabling CORS.
- No wallet RPC is used. No seed or private key is sent to a node.
- A remote node sees your IP address and may learn request timing. Built-in Tor/SOCKS is not implemented.
- Keep the wallet tab open while syncing. Automatic scans run about once a minute while open; manual sync is also available before sending. Large restores can take substantial time and memory.
- Automatic checks pause during dialogs, transaction review, and other wallet operations. They do not prevent the five-minute inactivity lock. Once locked or closed, the wallet does not scan until reopened and unlocked.
- If a payment is missing, first check that the receive address belongs to this installation and network, that scanning has completed, and that the restore height precedes the payment. The development website and installed extension do not share wallets or balances.

## Storage and security

Wallet keys and cache from `wallet.getData()` are encrypted again together with contacts, connection configuration and backup state using Web Crypto **AES-256-GCM**, a fresh random 96-bit IV per write and a non-exportable key derived using **PBKDF2-HMAC-SHA-256 (600,000 iterations)** with a random 128-bit salt. The wallet engine's keys file is also password-encrypted. IndexedDB stores the ciphertext; the wallet name, network and creation time are unencrypted metadata.

Passwords and derived keys are not persisted. Locking terminates the worker and drops session references, but JavaScript cannot guarantee zeroization of garbage-collected memory. The inactivity timer defers locking until an in-flight operation completes to avoid interrupting a broadcast or losing cache state.

The extension has no content scripts, dApp provider, remote scripts, analytics, or externally connectable API. Dependencies and the wallet worker are bundled locally. The production CSP allows WebAssembly compilation but not JavaScript `unsafe-eval`. A Web Lock prevents competing wallet tabs from overwriting local data.

Clearing browser data or removing the extension can permanently delete local wallets. Keep the recovery phrase offline and keep the password if you export an encrypted backup. CSV activity exports and payment request notes are **not private encrypted backups**.

## Limits and validation

No Polyseed, hardware wallet, biometric authentication, price feed/alerts, notifications, native Tor, or mobile widgets are implemented. A Chrome extension cannot safely inherit these iOS capabilities merely by copying their screens.

Run `npm test` for amount, URI, node URL, encryption, escaping and CSV tests. `npm run test:extension` runs a Chromium smoke test when Playwright and a compatible Chromium binary are available (see the script for `CHROMIUM_PATH`). It exercises the packaged extension, not just the web preview.

### Verification completed for version 0.2.0

- `npm test`: 9 focused tests passed.
- `npm run test:extension`: real packaged Chromium extension tests passed offline creation, restoration, backup, subaddresses, QR, contacts and encrypted persistence.
- `npm run test:mainnet`: the packaged extension passed actual Chrome optional-permission prompts, mainnet creation and scanning against **two live independent nodes** (Triplebit and Nodely). It also rejected an actual stagenet endpoint. Use a headed browser and approve native host prompts. For a local Xvfb display with `xdotool`, `HEADED=1 APPROVE_NODE_PROMPTS=1` can approve those native prompts automatically; it does not bypass host permissions. This test is deliberately not part of CI because it depends on public services.
- `npm run test:regtest`: requires a `monerod` executable (`MONEROD_BIN` overrides it). Starts an isolated, offline regression daemon and tests genuinely funded wallet-engine signing, positive fees, no broadcast before relay, explicit broadcast, recipient receipt/unlocking, and cache reopening. These are valueless regression-chain funds, **not real mainnet XMR**.

A funded real-mainnet round-trip has not been performed. Mainnet functionality and security assurance are different: successful sync and local-chain send tests do not constitute an independent wallet audit.

### Version 0.2.3

- Original vector-based Monero Mobile privacy-coin branding and regenerated icons.
- Removed experimental/alpha labels, while retaining the independent-audit disclosure.
- Scans start automatically after connected creation, restoration, unlock, or node changes, with periodic checks while unlocked.
- Pending transfer queries run before balance reads so newly discovered pool payments are reflected in the same refresh.
- Sync errors remain visible rather than leaving an apparently current balance.
- Eleven focused unit tests cover the original checks and automatic-scan safety guards. Offline packaged Chrome smoke checks passed; the installed extension also automatically scanned mainnet through Triplebit and rejected a stagenet node.
- This does not verify any particular user's deposit or constitute a funded mainnet receipt test.

### Updating an installed unpacked extension

Back up the recovery phrase and export an encrypted wallet backup first. Replace files in the **same existing folder** Chrome loaded, then click **Reload** in `chrome://extensions`. Do not uninstall to update: removing it can erase wallet data. Loading a different folder may create a different extension identity and separate IndexedDB storage. Existing stagenet wallets remain on stagenet; create a new mainnet wallet rather than reusing a stagenet address. Monero Mobile 0.2.3 starts a scan after wallet unlock and checks for deposits about once a minute while the tab stays open. No independent security audit or funded real-mainnet transfer has been completed.

## Attribution

Original project: [bwgh0/MoneroOne](https://github.com/bwgh0/MoneroOne), MIT. This fork retains its license and native app.

Wallet library: [woodser/monero-ts](https://github.com/woodser/monero-ts), MIT, with bundled dependency notices in the build output.
