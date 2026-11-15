import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

const root = path.resolve('dist');
const profile = await mkdtemp(path.join(tmpdir(), 'monero-one-chrome-'));
const errors = [];
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : chromium.executablePath()),
  headless: true,
  args: ['--no-sandbox', `--disable-extensions-except=${root}`, `--load-extension=${root}`]
});
const password = randomBytes(24).toString('base64url');
let recoveryPhrase;
try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 300)); });
  await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole('heading', { name: 'Your money. Only yours.' }).waitFor();
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await page.getByLabel('Wallet name', { exact: true }).fill('Extension test');
  await page.getByLabel('Local password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.locator('input[name=risk]').check();
  await page.locator('#wallet-form button[type=submit]').click();
  try { await page.getByText('Unlocked', { exact: true }).waitFor({ timeout: 60000 }); }
  catch { throw new Error(`Wallet creation failed. Browser errors: ${JSON.stringify(errors)}. Form error: ${await page.locator('.form-error').textContent()}`); }
  console.log('PASS: packaged MV3 extension created a real offline stagenet wallet under production CSP');
  await page.getByRole('button', { name: 'Receive', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Make a backup.' }).waitFor();
  console.log('PASS: receiving is gated on recovery phrase backup');
  await page.getByRole('button', { name: 'Back up recovery phrase', exact: true }).click();
  await page.locator('#reveal-form input').fill(password);
  await page.getByRole('button', { name: 'Reveal recovery phrase', exact: true }).click();
  await page.locator('.seed-grid>span').last().waitFor();
  recoveryPhrase = await page.locator('.seed-grid>span').evaluateAll(elements => elements.map(el => el.childNodes[1].textContent).join(' '));
  assert.equal(recoveryPhrase.split(' ').length, 25);
  await page.locator('#confirm-backup input[name=word]').fill(recoveryPhrase.split(' ').at(-1));
  await page.locator('#confirm-backup input[type=checkbox]').check();
  await page.getByRole('button', { name: 'I’ve saved my recovery phrase', exact: true }).click();
  await page.locator('#qr').waitFor();
  const originalAddress = await page.locator('.full-address').innerText();
  assert.equal(originalAddress.length, 95);
  const hasQr = await page.locator('#qr').evaluate(canvas => canvas.width > 100 && canvas.height > 100);
  assert.ok(hasQr);
  console.log('PASS: 25-word recovery, backup confirmation and receive QR generation');
  await page.getByRole('button', { name: 'Create a new subaddress', exact: true }).click();
  await page.locator('#receive-address option').nth(1).waitFor({ state: 'attached' });
  const subaddress = await page.locator('.full-address').innerText();
  assert.notEqual(subaddress, originalAddress);
  console.log('PASS: wallet engine generated a distinct receive subaddress');
  await page.getByRole('button', { name: 'Address book', exact: true }).click();
  await page.getByRole('button', { name: 'Add contact', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Test recipient');
  await page.getByLabel('Monero address', { exact: true }).fill(originalAddress);
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByText('Test recipient', { exact: true }).waitFor();
  console.log('PASS: network-validated address book contact');
  await page.getByRole('button', { name: 'Lock wallet', exact: true }).click();
  await page.getByRole('heading', { name: 'Your wallet is locked', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Unlock wallet', exact: true }).last().click();
  await page.locator('[data-wallet-id]').first().click();
  await page.locator('#unlock-form input').fill(`${password}-incorrect`);
  await page.locator('#unlock-form button[type=submit]').click();
  await page.getByRole('alert').filter({ hasText: 'Could not unlock' }).waitFor();
  await page.locator('#unlock-form input').fill(password);
  await page.locator('#unlock-form button[type=submit]').click();
  await page.getByText('Test recipient', { exact: true }).waitFor();
  console.log('PASS: lock, wrong-password rejection and encrypted wallet/contact reopen');
  const atRest = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('monero-one-vault', 1);
    request.onsuccess = () => {
      const read = request.result.transaction('wallets').objectStore('wallets').getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(new Error('read failed'));
    };
  }));
  const serialized = JSON.stringify(atRest);
  assert.ok(!serialized.includes(recoveryPhrase));
  assert.ok(!serialized.includes('Test recipient'));
  assert.ok(!serialized.includes(originalAddress));
  assert.ok(!serialized.includes(password));
  assert.ok(atRest[0].ciphertext && atRest[0].salt && atRest[0].iv);
  console.log('PASS: wallet keys, contact, address and password are absent from plaintext IndexedDB records');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/extension-dashboard.png', fullPage: true });
  await page.getByRole('button', { name: 'Manage wallets', exact: true }).click();
  await page.getByRole('button', { name: 'Restore wallet', exact: true }).click();
  await page.getByLabel('Wallet name', { exact: true }).fill('Restored test');
  await page.locator('[name=seed]').fill(recoveryPhrase);
  await page.getByLabel('Local password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.locator('input[name=risk]').check();
  await page.locator('#wallet-form button[type=submit]').click();
  await page.getByRole('heading', { name: 'Welcome back, Restored test.' }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Receive', exact: true }).first().click();
  await page.locator('#qr').waitFor();
  assert.equal(await page.locator('.full-address').innerText(), originalAddress);
  console.log('PASS: real recovery phrase restore reproduces the original stagenet address');
  await page.reload();
  await page.getByRole('button', { name: 'Receive', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Your wallet is locked', exact: true }).waitFor();
  console.log('PASS: page reload drops unlocked session');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  const manifest = JSON.parse(await readFile('dist/manifest.json'));
  assert.ok(!manifest.content_security_policy.extension_pages.includes("'unsafe-eval'"));
  console.log('PASS: no browser errors and no JavaScript unsafe-eval');
} finally {
  recoveryPhrase = undefined;
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
