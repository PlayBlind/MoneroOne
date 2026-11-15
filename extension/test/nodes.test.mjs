import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectNode, freshWalletHeight, DEFAULT_NODES } from '../src/nodes.js';

test('a fresh wallet starts before the observed tip, never at a guessed future height', () => {
  assert.equal(freshWalletHeight(3800000), 3799970);
  assert.equal(freshWalletHeight(10), 0);
  for (const invalid of [0, -1, NaN, Infinity, 1.5, '3800000']) assert.throws(() => freshWalletHeight(invalid));
  assert.ok(DEFAULT_NODES.mainnet.startsWith('https://'));
});
test('node inspection checks network, synchronization, height and daemon errors', async context => {
  let result = { height: 3800000, mainnet: true, stagenet: false, testnet: false, synchronized: true };
  let rpcError;
  const mocked = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ result, error: rpcError }), { status: 200 }));
  assert.equal((await inspectNode('https://node.example', 'mainnet')).height, 3800000);
  await assert.rejects(() => inspectNode('https://node.example', 'stagenet'), /not on stagenet/);
  result = { ...result, synchronized: false };
  await assert.rejects(() => inspectNode('https://node.example', 'mainnet'), /still synchronizing/);
  result = { ...result, synchronized: true, height: -1 };
  await assert.rejects(() => inspectNode('https://node.example', 'mainnet'), /valid Monero/);
  result = { ...result, height: 100, mainnet: false, stagenet: true };
  assert.equal((await inspectNode('https://node.example', 'stagenet')).height, 100);
  rpcError = { message: 'unavailable' };
  await assert.rejects(() => inspectNode('https://node.example', 'stagenet'), /valid Monero/);
  mocked.mock.restore();
});
