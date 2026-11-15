import test from 'node:test';
import assert from 'node:assert/strict';
import { toAtomic, fromAtomic, paymentUri, validateNode, deriveKey, seal, unseal, escapeHtml, csvCell, bytesToBase64, base64ToBytes, walletConfig } from '../src/core.js';

test('random creation and seed restore obey different wallet engine contracts', () => {
  const data = { password: 'test-only', network: 'stagenet', height: '0', seed: ' a   b ' };
  assert.deepEqual(walletConfig(data, false), { password: 'test-only', networkType: 'stagenet', language: 'English' });
  assert.deepEqual(walletConfig(data, true), { password: 'test-only', networkType: 'stagenet', restoreHeight: 0, seed: 'a b' });
});

test('XMR amounts use exact atomic units, not floating point', () => {
  assert.equal(toAtomic('0.000000000001'), 1n);
  assert.equal(toAtomic('1.234567890123'), 1234567890123n);
  assert.equal(fromAtomic(1234567890123n), '1.234567890123');
  assert.equal(fromAtomic(1000000000000n), '1');
  assert.equal(fromAtomic(-1500000000000n), '-1.5');
  for (const value of ['0', '-1', '1e2', 'NaN', '1.0000000000001', '18446745', '01', '0x10', '']) assert.throws(() => toAtomic(value));
});
test('payment URI preserves atomic precision and safely encodes notes', () => {
  const uri = paymentUri('address', '0.000000000001', 'Coffee & cake');
  assert.equal(uri, 'monero:address?tx_amount=0.000000000001&tx_description=Coffee+%26+cake');
  assert.equal(paymentUri('address'), 'monero:address');
  assert.throws(() => paymentUri('address', '-1'));
});
test('node URLs require HTTPS except loopback and never embed credentials', () => {
  assert.equal(validateNode('https://node.example:443/'), 'https://node.example');
  assert.equal(validateNode('http://127.0.0.1:38081'), 'http://127.0.0.1:38081');
  for (const url of ['http://node.example', 'ftp://localhost', 'https://user:pass@node.example', 'https://node.example?token=x', 'https://node.example#x', 'javascript:alert(1)']) assert.throws(() => validateNode(url));
});
test('encrypted vault authenticates data, rejects wrong passwords and uses fresh IVs', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey('test-only-long-password', salt);
  const payload = { seed: 'test-only-not-a-seed', contacts: [{ name: 'Test' }] };
  const first = await seal(payload, key), second = await seal(payload, key);
  assert.notEqual(first.iv, second.iv);
  assert.ok(!first.ciphertext.includes('test-only'));
  assert.deepEqual(await unseal(first, key), payload);
  const wrong = await deriveKey('wrong-test-password', salt);
  await assert.rejects(() => unseal(first, wrong));
  const corrupted = base64ToBytes(first.ciphertext); corrupted[0] ^= 1;
  await assert.rejects(() => unseal({ ...first, ciphertext: bytesToBase64(corrupted) }, key));
});
test('HTML and CSV content cannot become executable markup or formulas', () => {
  assert.equal(escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
});
