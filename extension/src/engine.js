import monero from 'monero-ts';
import { walletConfig } from './core.js';

export async function createLocalWallet(data, restore) {
  if (restore) return monero.createWalletFull(walletConfig(data, true));
  // The height is captured before generating keys. Offline wallets scan from genesis rather than risking skipped payments.
  const keys = await monero.createWalletKeys(walletConfig(data, false));
  try {
    return await monero.createWalletFull({ password: data.password, networkType: data.network, seed: await keys.getSeed(), restoreHeight: data.birthdayHeight ?? 0 });
  } finally {
    await keys.close();
  }
}
