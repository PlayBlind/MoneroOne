Monero Mobile project export

Includes native iOS and widget source, the Chrome extension source, current
extension/dist build, workspace configuration, tests, scripts and brand assets.

Chrome: Load extension/dist as an unpacked extension via chrome://extensions.
For an existing installation, replace files in the same folder and click Reload.
Do not uninstall to upgrade. Back up your recovery phrase privately first.

Development: See README.md and IMPORT-AND-INSTALL.md. Install dependencies
before building. Native iOS requires macOS and Xcode.

Excluded: Git history, installed dependencies, caches, environment secrets,
private agent state, original chat attachments and operational history logs.
No user wallet database or credentials are included.
