import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve('dist');
const profile = await mkdtemp(path.join(tmpdir(), 'monero-mainnet-'));
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : chromium.executablePath()),
  headless: !process.env.HEADED, viewport: { width: 1440, height: 1000 },
  args: ['--no-sandbox', `--disable-extensions-except=${root}`, `--load-extension=${root}`]
});
const errors = [];
const password = randomBytes(24).toString('base64url');
async function approveNativePrompt() {
  if (process.env.APPROVE_NODE_PROMPTS !== '1') return;
  if (!process.env.HEADED) throw new Error('Native permission prompt automation requires a headed browser.');
  await new Promise(resolve => setTimeout(resolve, 1500));
  execFileSync('xdotool', ['key', 'Tab', 'Return']);
}
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
  await page.getByRole('button', { name: 'Create wallet', exact: true }).click();
  await page.getByLabel('Wallet name', { exact: true }).fill('Mainnet connection test');
  assert.equal(await page.locator('[name=network]').inputValue(), 'mainnet');
  await page.getByRole('button', { name: 'Authorize and check node', exact: true }).click();
  await approveNativePrompt();
  await page.getByText(/Verified mainnet node at block/).waitFor({ timeout: 90000 });
  assert.equal(await page.locator('#wallet-form button[type=submit]').isDisabled(), false);
  await page.getByLabel('Local password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.locator('[name=risk]').check();
  await page.locator('#wallet-form button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('.chip.green') || document.querySelector('.form-error')?.textContent, undefined, { timeout: 90000 });
  const error = await page.locator('.form-error').count() ? await page.locator('.form-error').textContent() : '';
  assert.ok(!error, `Mainnet setup error: ${error}`);
  await page.getByText('Unlocked', { exact: true }).waitFor({ timeout: 60000 });
  assert.equal(await page.locator('.network-pill').innerText(), 'Mainnet');
  const permission = await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://xmr.triplebit.org/*'] }));
  assert.ok(permission);
  console.log('PASS: actual optional host permission granted and mainnet wallet created against live HTTPS node');
  await page.getByRole('heading', { name: 'You’re up to date' }).waitFor({ timeout: 180000 });
  console.log('PASS: packaged extension automatically scanned the live mainnet node after wallet creation');
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/mainnet-synced.png', fullPage: true });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await page.locator('#node-form [name=node]').fill('https://xmr.nodely.dev:38089');
  await page.getByRole('button', { name: 'Verify and save node', exact: true }).click();
  await approveNativePrompt();
  await page.getByRole('alert').filter({ hasText: 'not on mainnet' }).waitFor({ timeout: 30000 });
  console.log('PASS: mainnet wallet rejects an actual live stagenet node');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await page.locator('#node-form [name=node]').fill('https://xmr.nodely.dev:18089');
  await page.getByRole('button', { name: 'Verify and save node', exact: true }).click();
  await page.locator('#node-form').waitFor({ state: 'detached', timeout: 30000 });
  // Node saving immediately schedules a scan. Navigation intentionally ignores
  // clicks while the exclusive wallet task is running; wait before changing pages.
  await page.waitForFunction(() => !document.body.classList.contains('busy'), undefined, { timeout: 180000 });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'You’re up to date' }).waitFor({ timeout: 180000 });
  console.log('PASS: changing nodes automatically starts scanning on the selected live mainnet node');
  assert.deepEqual(errors, []);
  console.log('No mainnet funds were received or sent. This test does not prove a funded mainnet round-trip.');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
