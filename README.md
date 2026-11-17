# Monero Mobile

<img src="extension/public/monero-mobile-logo.svg" width="128" height="128" alt="Monero Mobile pixel-art M coin logo">

## Standalone Chrome extension (experimental)

This fork adds a standalone Manifest V3 Chrome wallet in [`extension/`](extension/README.md), with local WebAssembly wallet operations, encrypted storage, send/receive screens, subaddresses and an address book. No desktop companion app is required. **Unaudited alpha: use stagenet first.** The existing native iOS source is preserved.

A native iOS wallet, now branded Monero Mobile, built with SwiftUI.

[![CI](https://github.com/bwgh0/MoneroOne/actions/workflows/ci.yml/badge.svg)](https://github.com/bwgh0/MoneroOne/actions/workflows/ci.yml)

## Features

- Create, restore, and manage multiple Monero wallets
- Polyseed and legacy 25-word seed support
- Send and receive XMR with QR code scanning
- Face ID / Touch ID unlock
- Live price charts and price alerts
- Home screen widgets
- Live Activity sync progress in Dynamic Island
- iPad support
- Connect to any Monero node (remote or local)
- SOCKS proxy / Tor support

## Building from source

### Requirements

- Xcode 16+
- iOS 17.0+ deployment target
- [MoneroKit.Swift](https://github.com/bwgh0/MoneroKit.Swift) cloned alongside this repo

### Setup

```bash
# Clone both repos side by side
git clone https://github.com/bwgh0/MoneroOne.git
git clone https://github.com/bwgh0/MoneroKit.Swift.git

# Open in Xcode
open MoneroOne/MoneroOne.xcodeproj
```

The project expects `MoneroKit.Swift` at `../MoneroKit.Swift` relative to the MoneroOne directory:

```
parent/
  MoneroOne/
  MoneroKit.Swift/
```

Select the `MoneroOne` scheme, pick a simulator or your device, and build.

### CI

CI runs automatically on every push and pull request to `main` — it builds for the iOS Simulator (no signing required). Tagged releases (`v*`) trigger a TestFlight deploy and publish a sideloadable IPA to [GitHub Releases](https://github.com/bwgh0/MoneroOne/releases).

## Releases

Every tagged release publishes:
- **TestFlight build** — available through the App Store
- **Sideloadable IPA** — attached to the [GitHub Release](https://github.com/bwgh0/MoneroOne/releases) with a SHA-256 hash for verification

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) for responsible disclosure guidelines.

## License

MIT — see [LICENSE](LICENSE).
