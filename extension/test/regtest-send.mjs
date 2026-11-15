import monero from 'monero-ts';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { toAtomic, fromAtomic } from '../src/core.js';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const [rpcPort, p2pPort] = await Promise.all([freePort(), freePort()]);
const directory = await mkdtemp(path.join(tmpdir(), 'monero-send-regtest-'));
const url = `http://127.0.0.1:${rpcPort}`;
const password = randomBytes(24).toString('base64url');
const daemon = spawn(process.env.MONEROD_BIN || 'monerod', ['--regtest', '--offline', '--fixed-difficulty', '1', '--data-dir', directory,
  '--rpc-bind-ip', '127.0.0.1', '--rpc-bind-port', String(rpcPort), '--p2p-bind-port', String(p2pPort),
  '--no-zmq', '--non-interactive', '--no-igd', '--log-level', '0'], { stdio: 'ignore' });
let daemonError;
daemon.on('error', error => { daemonError = error; });
async function rpc(method, params) {
  const response = await fetch(`${url}/json_rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'regtest', method, params }), signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (daemonError) throw daemonError;
    if (daemon.exitCode !== null) throw new Error(`Local daemon exited with ${daemon.exitCode}`);
    try { await rpc('get_info'); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Isolated test daemon must be reachable');
  const wallets = [];
  for (let index = 0; index < 2; index++) {
    const keys = await monero.createWalletKeys({ networkType: 'mainnet', language: 'English' });
    try {
      wallets.push(await monero.createWalletFull({ networkType: 'mainnet', regtest: true, password,
        seed: await keys.getSeed(), restoreHeight: 0, server: url }));
    } finally { await keys.close(); }
  }
  const [sender, recipient] = wallets;
  const client = await monero.connectToDaemonRpc(url);
  await rpc('generateblocks', { wallet_address: await sender.getPrimaryAddress(), amount_of_blocks: 80 });
  await sender.sync();
  assert.ok(await sender.getUnlockedBalance() > 0n);
  const amount = toAtomic('1');
  const address = await recipient.getPrimaryAddress();
  await monero.MoneroUtils.validateAddress(address, 'mainnet');
  const transaction = await sender.createTx({ accountIndex: 0, address, amount, priority: 2, relay: false, canSplit: false });
  assert.ok(transaction.getFee() > 0n);
  const before = await client.getTxPool();
  assert.ok(!before.some(tx => tx.getHash() === transaction.getHash()), 'Prepared transaction must not be broadcast before approval');
  console.log('PASS: locally funded real wallet engine signs a transaction and calculates a positive fee without broadcasting');
  await sender.relayTx(transaction);
  const pool = await client.getTxPool();
  assert.ok(pool.some(tx => tx.getHash() === transaction.getHash()));
  console.log('PASS: explicit relay broadcasts the signed transaction to the isolated real daemon');
  await rpc('generateblocks', { wallet_address: await sender.getPrimaryAddress(), amount_of_blocks: 12 });
  await recipient.sync(); await sender.sync();
  assert.equal(await recipient.getBalance(), amount);
  assert.equal(fromAtomic(await recipient.getBalance()), '1');
  assert.equal(await recipient.getUnlockedBalance(), amount);
  console.log('PASS: recipient scans, recognizes and unlocks the expected 1 XMR-equivalent test-chain payment');
  const [keysData, cacheData] = await sender.getData();
  const reopened = await monero.openWalletFull({ networkType: 'mainnet', regtest: true, password, keysData, cacheData, server: url });
  assert.equal(await reopened.getBalance(), await sender.getBalance());
  console.log('PASS: sender transaction state survives wallet cache export and reopen');
  console.log('This is an isolated regression network. No real mainnet XMR was created, spent or tested.');
} finally {
  await monero.shutdown();
  daemon.kill('SIGTERM');
  if (daemon.exitCode === null) await new Promise(resolve => { daemon.once('exit', resolve); setTimeout(() => { daemon.kill('SIGKILL'); resolve(); }, 5000).unref(); });
  await rm(directory, { recursive: true, force: true });
}
