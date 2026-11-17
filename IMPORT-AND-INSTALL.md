# Monero Mobile — imported Chrome wallet

## Source preserved

- Fork: https://github.com/PlayBlind/MoneroOne
- Imported branch: `feat/standalone-chrome-wallet`
- Imported commit: `174e0ce95193d0d9e8305d4edecd4633f8934fdd`
- Existing draft PR: https://github.com/PlayBlind/MoneroOne/pull/1
- Version: **0.2.5** (pixel-art M coin logo; automatic scanning retained)

The remote branches and draft PR were inspected before importing; the specified wallet branch was still the PR head, with no newer wallet successor identified. All tracked fork files were imported, including `extension/`, the native iOS source, Xcode project, tests, widgets, workflows, license and original README. The fork's ignore rules were merged with Replit's rules.

The original GitHub remote and wallet branch history are available locally without replacing Replit checkpoint history. The GitHub integration is connected. Nothing was pushed and the draft PR was not changed.

## Continue in Replit

Open **Monero Mobile — Chrome Wallet** from this project's Library. The actual imported code is in `extension/`, not the generic frontend scaffold. Run starts the existing extension development preview using its webpack server.

The preview is **not an installed Chrome extension**, does not have native Chrome extension permissions, and stores data separately from the installed extension. Never enter a real-funds recovery phrase into the development preview. Use fresh throwaway test wallets only.

## Build and package

```sh
cd extension
npm ci
npm test
npm run build
cd ..
python3 scripts/package-extension.py
```

The reproducible packaging helper archives only `extension/dist/`, checks that the MV3 manifest is at archive root, and writes a ZIP plus SHA-256 checksum to `generated-artifacts/`. Dependency versions remain pinned by the existing npm lockfile.

## First installation

1. Download the ZIP and extract it into a permanent folder, for example `Monero-Mobile-Chrome`. `manifest.json` must be directly inside that folder.
2. In Chrome 120+, open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Pin the extension and click its icon to open its dedicated wallet tab.

## Upgrade an already installed unpacked extension

1. First verify that you have your recovery phrase stored safely offline and export an encrypted wallet backup. Do not share either here.
2. Close the wallet tab before replacing files.
3. Extract the new ZIP's contents into the **same folder Chrome already loaded**, replacing the old build files.
4. In `chrome://extensions`, click **Reload** for Monero Mobile.
5. Reopen and unlock the wallet. With a configured node, scanning starts automatically.

**Do not uninstall to upgrade.** Uninstalling can erase wallet storage. Loading a different folder may create a different extension identity with separate storage. Existing stagenet wallets stay on stagenet; they do not become mainnet wallets.

## Mainnet and safety

The extension defaults to mainnet through editable public HTTPS node `https://xmr.triplebit.org`. In connected setup, the user must explicitly choose **Authorize and check node** before creating the wallet; that is when Chrome may show its native, per-node permission dialog. The wallet-creation button does not request browser permissions. Offline setup does not request node access. Stagenet is separate. Keys, scanning and signing remain local. There is no desktop or phone companion and no account backend.

No independent security audit or funded real-mainnet transfer has been completed. Prior verification covered live mainnet synchronization and valueless isolated-regression-chain transfers. Do not trust this build with meaningful funds.

See `extension/README.md` for the full existing feature list, security model, limitations and optional packaged-browser/mainnet/regression-chain test commands.
