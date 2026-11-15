import monero from 'monero-ts';
import { walletConfig } from './core.js';

export async function createLocalWallet(data, restore) {
  if (restore) return monero.createWalletFull(walletConfig(data, true));
  // Random full wallets require a live daemon height. Generate keys offline, then open at genesis so no incoming outputs can be skipped.
  const keys = await monero.createWalletKeys(walletConfig(data, false));
  try {
    return await monero.createWalletFull({ password: data.password, networkType: data.network, seed: await keys.getSeed(), restoreHeight: 0 });
  } finally {
    await keys.close();
  }
}
