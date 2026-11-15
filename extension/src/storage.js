const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('monero-one-vault', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('wallets', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function walletStore(mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('wallets', mode);
    const request = operation(transaction.objectStore('wallets'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Wallet storage failed.'));
  });
}

export const listWallets = () => walletStore('readonly', store => store.getAll());
export const putWallet = record => walletStore('readwrite', store => store.put(record));
