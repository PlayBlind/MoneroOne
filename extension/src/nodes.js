import { validateNode } from './core.js';

export const DEFAULT_NODES = {
  mainnet: 'https://xmr.triplebit.org',
  stagenet: 'https://xmr.nodely.dev:38089'
};

export async function inspectNode(value, network) {
  const node = validateNode(value);
  const response = await fetch(`${node}/json_rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'monero-one', method: 'get_info' }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Node returned HTTP ${response.status}.`);
  const data = await response.json();
  const info = data.result;
  if (data.error || !Number.isSafeInteger(info?.height) || info.height < 1) throw new Error('This endpoint did not return a valid Monero daemon response.');
  if ((network === 'stagenet' && info.stagenet !== true) || (network === 'mainnet' && (info.mainnet !== true || info.stagenet || info.testnet))) {
    throw new Error(`This node is not on ${network}. Your wallet network cannot be changed.`);
  }
  if (info.synchronized !== true || info.busy_syncing === true) throw new Error('This node is still synchronizing. Choose an up-to-date node.');
  return info;
}

export function freshWalletHeight(height) {
  if (!Number.isSafeInteger(height) || height < 1) throw new Error('A valid node height is required.');
  return Math.max(0, height - 30);
}
