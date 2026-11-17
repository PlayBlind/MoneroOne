# Monero Mobile

Imported from https://github.com/PlayBlind/MoneroOne, branch `feat/standalone-chrome-wallet`, verified at `174e0ce95193d0d9e8305d4edecd4633f8934fdd`. Draft PR: https://github.com/PlayBlind/MoneroOne/pull/1. Both branch and PR still pointed to this commit when imported. The GitHub integration is connected and `origin` points at this fork; its wallet branch history is fetched. Replit's existing checkpoint history was retained rather than reset or replaced. No changes were pushed to GitHub.

## Product and scope

Preserve both the native Swift iOS application and the completed standalone Chrome extension in `extension/`. This is an import, not a replacement app or mockup. Keep the existing dark orange-accent dashboard. The extension requires no desktop/phone companion, account backend, server-held keys, remote code, or injected scripts.

Version 0.2.0 uses Manifest V3 and local monero-ts 0.11.22 WebAssembly workers, encrypted IndexedDB/WebCrypto storage, legacy 25-word recovery, receive QR/subaddresses, contacts/activity, password-confirmed transaction review, explicit broadcast, inactivity lock, and single-tab wallet locking.

Mainnet setup defaults to the editable HTTPS node `https://xmr.triplebit.org`, with explicit privacy consent and optional node host permissions. Preserve network/synchronized-node checks, new connected wallet birthday at observed tip minus 30 blocks, user-specified restore heights, separate stagenet support, restrictive MV3 CSP, and optional permissions.

## Run and build

The Run button starts `artifacts/monero-one: web`, an adapter that runs the **existing extension webpack development preview** at the artifact's assigned port. It does not use the scaffolded React frontend. `extension/` retains its own npm lockfile and dependency installation, independent of the template pnpm packages.

```sh
cd extension
npm ci
npm test
npm run build
```

The standalone local command `npm run dev` uses port 3000. The Replit adapter passes the managed port through the CLI. Package only the contents of `extension/dist/`, with `manifest.json` at archive root. Generated downloads belong in `generated-artifacts/`, excluded from Git and deployment.

See `IMPORT-AND-INSTALL.md` for import provenance, packaging, installation, and safe same-folder upgrades. The native app source remains in `MoneroOne/`, `MoneroOne.xcodeproj/`, `Shared/`, widgets, and test folders, with original project structure, license, and source preserved. Its display name and icon use Monero Mobile branding. Xcode builds require macOS.

## Security and verification boundaries

The hosted web preview is only a convenience: it has separate origin storage and is not an installed Chrome extension or a substitute for Chrome host permissions. Never request user seeds/passwords or move real funds. Use fresh throwaway test wallets only.

Existing upstream verification recorded nine unit tests, packaged Chrome offline create/restore/lock/storage checks, installed Chrome live mainnet sync against Triplebit and Nodely, actual stagenet-node rejection, and funded signing/broadcast/receipt/confirmation/cache reopening on an isolated regression chain. Treat those as prior evidence, not tests rerun during every import.

No funded real-mainnet transfer or independent security audit has been performed. This is an experimental unaudited wallet, not a production fund-safety claim. Never weaken the production manifest/CSP or alter wallet code solely to accommodate a preview.
