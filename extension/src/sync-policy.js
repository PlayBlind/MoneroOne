// Automatic scans share the same exclusive task lock as signing and storage.
// Do not keep an idle wallet unlocked or disturb a transaction/backup dialog.
export function canAutoSync({ hasWallet, node, busy, syncing, modalOpen, pendingTransaction, inactiveMs }) {
  return Boolean(hasWallet && node && !busy && !syncing && !modalOpen && !pendingTransaction && inactiveMs < 300000);
}
