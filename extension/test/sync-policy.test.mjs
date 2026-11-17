import test from 'node:test';
import assert from 'node:assert/strict';
import { canAutoSync } from '../src/sync-policy.js';

const ready = { hasWallet: true, node: 'https://node.example', busy: false, syncing: false,
  modalOpen: false, pendingTransaction: false, inactiveMs: 1000 };

test('automatic scanning requires an unlocked configured wallet and does not overlap operations', () => {
  assert.equal(canAutoSync(ready), true);
  for (const change of [{ hasWallet: false }, { node: '' }, { busy: true }, { syncing: true }]) {
    assert.equal(canAutoSync({ ...ready, ...change }), false);
  }
});

test('automatic scanning never interrupts dialogs, a pending transaction, or inactivity locking', () => {
  for (const change of [{ modalOpen: true }, { pendingTransaction: true }, { inactiveMs: 300000 }, { inactiveMs: 300001 }]) {
    assert.equal(canAutoSync({ ...ready, ...change }), false);
  }
  assert.equal(canAutoSync({ ...ready, inactiveMs: 299999 }), true);
});
