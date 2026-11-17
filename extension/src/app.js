import monero from 'monero-ts';
import QRCode from 'qrcode';
import { toAtomic, fromAtomic, validateNode, paymentUri, deriveKey, seal, unseal, bytesToBase64, base64ToBytes, escapeHtml as e, csvCell } from './core.js';
import { listWallets, putWallet } from './storage.js';
import { createLocalWallet } from './engine.js';
import { DEFAULT_NODES, inspectNode, freshWalletHeight } from './nodes.js';
import { canAutoSync } from './sync-policy.js';

monero.LibraryUtils.setWorkerDistPath(new URL('monero.worker.js', location.href).href);
const $ = selector => document.querySelector(selector);
const app = $('#app'), modal = $('#modal');
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  receive: '<path d="M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  contacts: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="9" r="2.5"/><path d="M8 17c0-4 8-4 8 0"/>',
  settings: '<path d="m10 3-1 3-3 1-3 3 2 2-1 4 4 1 2 4 4-1 2-3 4-1-1-4 2-2-3-3-4-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  down: '<path d="M7 7 17 17M7 17h10V7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  wallet: '<path d="M21 8H5a2 2 0 0 1 0-4h13v4M3 6v13a2 2 0 0 0 2 2h16V8"/><path d="M21 12h-6v5h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.wallet}</svg>`;
const logo = '<img class="logo-mark" src="icon.png" alt="" aria-hidden="true">';
let records = [], record = null, wallet = null, key = null, payload = null;
let route = 'overview', hidden = false, busy = false, synced = false, syncProgress = '', connected = false, syncInProgress = false;
let balance = 0n, unlocked = 0n, transfers = [], addresses = [], receiveIndex = 0, filter = 'all', search = '';
let lastActivity = Date.now(), lockRequested = false, pendingTx = null;
let releaseLock;
let saveChain = Promise.resolve();
const isExtension = location.protocol === 'chrome-extension:';
const short = text => text ? `${text.slice(0, 9)}…${text.slice(-7)}` : 'No wallet connected';
const money = amount => hidden ? '••••••' : fromAtomic(amount, 6);
const network = () => record?.network || 'mainnet';
const networkLabel = () => network() === 'mainnet' ? 'Mainnet' : 'Stagenet';
const activeAddress = () => addresses[receiveIndex]?.address || addresses[0]?.address || '';
const contacts = () => payload?.contacts || [];

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  setTimeout(() => $('#toast').classList.remove('visible'), 4000);
}
function dialog(title, subtitle, body) {
  modal.innerHTML = `<header><div><span class="eyebrow">MONERO MOBILE</span><h2>${e(title)}</h2></div><button class="icon-button" data-close aria-label="Close dialog">${icon('close')}</button></header>${subtitle ? `<p class="muted">${e(subtitle)}</p>` : ''}${body}<p class="form-error" role="alert"></p>`;
  modal.showModal();
}
function closeDialog() { modal.close(); modal.innerHTML = ''; pendingTx = null; }
modal.addEventListener('cancel', event => { if (busy) event.preventDefault(); else closeDialog(); });
modal.addEventListener('click', event => { if (event.target.closest('[data-close]') && !busy) closeDialog(); });
async function task(fn) {
  if (busy) return;
  busy = true;
  document.body.classList.add('busy');
  modal.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = true; });
  try { await fn(); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (modal.open) modal.querySelector('.form-error').textContent = message;
    else toast(message);
  } finally {
    busy = false;
    document.body.classList.remove('busy');
    modal.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = false; });
    if (lockRequested) { lockRequested = false; await lock(); }
  }
}
async function persist() {
  if (!wallet || !key || !payload || !record) return;
  const current = { wallet, key, payload, record };
  saveChain = saveChain.catch(() => {}).then(async () => {
    const [keysData, cacheData] = await current.wallet.getData();
    const data = { ...current.payload, keys: bytesToBase64(new Uint8Array(keysData)), cache: bytesToBase64(new Uint8Array(cacheData)) };
    const encrypted = await seal(data, current.key);
    const updated = { ...current.record, ...encrypted };
    await putWallet(updated);
    if (record?.id === updated.id) record = updated;
    records = await listWallets();
  });
  return saveChain;
}
async function refresh() {
  if (!wallet) return;
  transfers = (await wallet.getTransfers(connected ? undefined : { txQuery: { inTxPool: false } })).map(transfer => {
    const tx = transfer.getTx();
    return { hash: tx.getHash(), amount: transfer.getAmount().toString(), outgoing: transfer.getIsOutgoing(),
      confirmed: tx.getIsConfirmed(), locked: tx.getIsLocked(), timestamp: tx.getBlock()?.getTimestamp() || tx.getLastRelayedTimestamp() || 0 };
  }).sort((a, b) => b.timestamp - a.timestamp);
  // Transfer queries also refresh the transaction pool. Read balances afterwards
  // so newly discovered pending payments appear in both places in this refresh.
  balance = await wallet.getBalance();
  unlocked = await wallet.getUnlockedBalance();
  addresses = (await wallet.getSubaddresses(0)).map(address => ({ address: address.getAddress(), label: address.getLabel(), index: address.getIndex() }));
}
async function lock() {
  if (busy) { lockRequested = true; return; }
  busy = true;
  try { await persist(); } catch { toast('Could not save the latest cache. Your recovery phrase remains your backup.'); }
  await monero.LibraryUtils.terminateWorker();
  wallet = null; key = null; payload = null; pendingTx = null;
  balance = unlocked = 0n; transfers = []; addresses = []; connected = synced = false; syncProgress = '';
  closeDialog(); busy = false; render();
}
function render() {
  const currentName = record?.name || 'Your first wallet';
  app.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#" data-route="overview">${logo}<span>monero<span class="brand-light">mobile</span><small>BROWSER WALLET</small></span></a>
      <span class="sidebar-label">WORKSPACE</span>
      <button class="wallet-switch" data-action="wallets"><span class="wallet-avatar">${icon('wallet')}</span><span><strong>${e(currentName)}</strong><small>${wallet ? 'Local wallet' : records.length ? 'Wallet locked' : 'Get started'}</small></span><span class="tiny-chevron">⌄</span></button>
      <nav aria-label="Main navigation">${[['overview', 'Overview'], ['activity', 'Activity'], ['receive', 'Receive'], ['contacts', 'Address book'], ['settings', 'Settings']].map(([id, label]) => `<button data-route="${id}" class="nav-item ${route === id ? 'active' : ''}">${icon(id)}${label}${id === 'receive' ? '<span class="nav-tag">XMR</span>' : ''}</button>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="local-badge"><span class="status-dot"></span>Runs entirely in your browser</div><div class="sidebar-footer"><span>Monero Mobile</span><span>v0.2.5</span></div></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>${({ overview: 'Overview', activity: 'Activity', receive: 'Receive', contacts: 'Address book', settings: 'Settings' })[route]}</strong></div><div class="top-actions"><span class="network-pill"><span class="status-dot ${network() === 'mainnet' ? '' : 'orange'}"></span>${networkLabel()}</span><button class="icon-button" data-action="${wallet ? 'lock' : 'wallets'}" aria-label="${wallet ? 'Lock wallet' : 'Unlock wallet'}">${icon('lock')}</button><img class="profile-dot" src="icon.png" alt="" aria-hidden="true"></div></header>
      <main>${route === 'overview' ? overview() : route === 'activity' ? activityPage() : route === 'receive' ? receivePage() : route === 'contacts' ? contactsPage() : settingsPage()}</main>
      <footer class="page-footer"><span>${icon('shield')} No accounts. No tracking. Just you.</span><span>Open source. Private by design. <span class="footer-dot">✳</span></span></footer>
    </div>`;
  if (route === 'receive' && wallet && payload.backedUp) updateQr();
}
function heading(kicker, title, subtitle, action = '') {
  return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}
function overview() {
  return `${heading('YOUR PRIVATE CORNER OF THE INTERNET', wallet ? `Welcome back${record.name ? `, ${e(record.name)}` : ''}.` : 'Your money. Only yours.', 'A little more freedom. A lot more privacy.', `<button class="button subtle" data-action="${wallet ? 'sync' : 'create'}">${icon(wallet ? 'refresh' : 'plus')}${wallet ? 'Sync wallet' : 'Create wallet'}</button>`)}
    <div class="dashboard-grid">
      <section class="balance-card">
        <div class="card-top"><span class="overline">TOTAL BALANCE <button class="inline-icon" data-action="hide" aria-label="${hidden ? 'Show' : 'Hide'} balance">${icon('eye')}</button></span><span class="glass-tag">${logo} MONERO</span></div>
        <div class="balance-value">${wallet ? money(balance) : '0.00'}<span>XMR</span></div>
        <div class="balance-subtitle">${wallet ? `${money(unlocked)} XMR available to spend` : 'Your next chapter starts with your own keys.'}</div>
        <div class="balance-buttons"><button class="button white" data-action="send">${icon('arrow')} Send</button><button class="button glass" data-route="receive">${icon('down')} Receive</button><button class="icon-button glass" data-action="wallets" aria-label="Manage wallets">${icon('plus')}</button></div>
        <div class="balance-art" aria-hidden="true"><img class="balance-brand-art" src="monero-mobile-logo.svg" alt=""></div>
        <div class="balance-bottom">${icon('shield')} Self-custodial. Always.</div>
      </section>
      <section class="panel connection-card"><div class="panel-heading"><h2>Wallet status</h2><span class="chip ${wallet ? 'green' : ''}">${wallet ? 'Unlocked' : 'Not connected'}</span></div><div class="status-illustration">${icon(wallet ? 'shield' : 'wallet')}<span class="small-status">${icon(wallet ? 'check' : 'plus')}</span></div><h3>${wallet ? (synced ? 'You’re up to date' : 'Your keys stay here') : 'Make yourself at home'}</h3><p>${wallet ? e(syncProgress || (connected ? 'Node connected. Your balance updates automatically.' : 'Connect a node to sync your wallet with the network.')) : 'Create a new wallet or bring an existing one. No sign-up needed.'}</p><button class="button ${wallet ? 'subtle' : 'primary'} full" data-action="${wallet ? 'node' : records.length ? 'wallets' : 'create'}">${wallet ? 'Manage connection' : records.length ? 'Unlock your wallet' : 'Set up your wallet'}${icon('chevron')}</button>${!wallet ? '<button class="text-button" data-action="restore">I already have a wallet</button>' : `<div class="node-label"><span class="status-dot ${connected ? '' : 'gray'}"></span>${connected ? 'Node verified' : 'Offline mode'}</div>`}</section>
      <section class="panel transactions-card"><div class="panel-heading"><h2>Recent activity</h2><button class="text-button" data-route="activity">View all ${icon('arrow')}</button></div>${transactionList(transfers.slice(0, 4))}</section>
      <section class="privacy-card"><span class="privacy-icon">${icon('shield')}</span><span class="eyebrow">PRIVATE IS THE DEFAULT</span><h2>Less exposed.<br>More in control.</h2><p>Your balance, your transactions, your business. Monero keeps it that way.</p><div class="privacy-features"><span>${icon('check')} Hidden balances on-chain</span><span>${icon('check')} Encrypted local storage</span><span>${icon('check')} No companion app</span></div><span class="privacy-decoration" aria-hidden="true">✳</span></section>
    </div>
    <section class="notice"><span class="notice-icon">${icon('info')}</span><p><strong>Keep your wallet backed up.</strong> Store your recovery phrase offline and never share it. Lost passwords or a lost recovery phrase can cause permanent loss of funds.</p><button class="text-button" data-route="settings">Security details ${icon('arrow')}</button></section>`;
}
function transactionList(items) {
  if (!items.length) return `<div class="empty-state"><span class="empty-icon">${icon('activity')}</span><h3>A clean slate</h3><p>${wallet ? 'Your transactions will appear here after syncing.' : 'Once your wallet is ready, your activity lives here.'}</p><span class="empty-label">PRIVATE BY DEFAULT · VISIBLE ONLY TO YOU</span></div>`;
  return `<div class="transaction-list">${items.map(tx => `<button class="transaction" data-tx="${e(tx.hash)}"><span class="tx-icon ${tx.outgoing ? '' : 'incoming'}">${icon(tx.outgoing ? 'arrow' : 'down')}</span><span><strong>${tx.outgoing ? 'Sent Monero' : 'Received Monero'}</strong><small>${tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending'} · ${e(short(tx.hash))}</small></span><span class="tx-value ${tx.outgoing ? '' : 'positive'}">${hidden ? '••••' : `${tx.outgoing ? '−' : '+'}${fromAtomic(tx.amount, 6)}`} <small>XMR · ${tx.confirmed ? tx.locked ? 'Locked' : 'Confirmed' : 'Pending'}</small></span></button>`).join('')}</div>`;
}
function activityPage() {
  const items = transfers.filter(tx => (filter === 'all' || (filter === 'sent' ? tx.outgoing : !tx.outgoing)) && tx.hash.toLowerCase().includes(search.toLowerCase()));
  return `${heading('YOUR TRANSACTIONS', 'A little history.', connected ? 'Every send and receive, without the oversharing.' : 'Offline · cached history only. Sync to include current pending transactions.', `<button class="button subtle" data-action="export">${icon('download')} Export CSV</button>`)}<section class="panel activity-panel"><div class="activity-toolbar"><div class="segmented">${['all', 'sent', 'received'].map(value => `<button class="${value === filter ? 'selected' : ''}" data-filter="${value}">${value[0].toUpperCase() + value.slice(1)}</button>`).join('')}</div><input class="search" id="tx-search" aria-label="Search transaction hash" placeholder="Search transaction hash…" value="${e(search)}"></div><div id="activity-list">${transactionList(items)}</div></section>`;
}
function receivePage() {
  if (!wallet) return lockedPage('Receive, privately.', 'Your own address. No middlemen.');
  if (!payload.backedUp) return backupGate();
  return `${heading('MADE FOR YOUR EYES ONLY', 'Receive, privately.', 'One address for every occasion. One wallet that’s yours.')}<div class="receive-grid"><section class="panel qr-panel"><div class="panel-heading"><h2>Payment request</h2><span class="chip">${networkLabel()}</span></div><div class="qr-wrap"><canvas id="qr" aria-label="Monero payment request QR code"></canvas></div><span class="eyebrow">YOUR RECEIVE ADDRESS</span><p class="full-address">${e(activeAddress())}</p><button class="button subtle full" data-action="copy-address">${icon('copy')} Copy address</button><p class="small muted">Only send ${network() === 'mainnet' ? 'mainnet' : 'stagenet'} XMR to this address.</p></section><section class="panel request-panel"><h2>Make it personal.</h2><p class="muted">Add an amount and a note to your payment request.</p><label>Receive address<select id="receive-address">${addresses.map((address, index) => `<option value="${index}" ${index === receiveIndex ? 'selected' : ''}>${e(address.label || (index ? `Subaddress ${address.index}` : 'Primary address'))}</option>`).join('')}</select></label><button class="text-button" data-action="subaddress">${icon('plus')} Create a new subaddress</button><label>Amount <span class="optional">optional</span><div class="input-unit"><input id="request-amount" inputmode="decimal" placeholder="0.00"><span>XMR</span></div></label><label>Note <span class="optional">optional · included in the QR code</span><input id="request-note" maxlength="140" placeholder="What’s it for?"></label><button class="button primary full" data-action="copy-request">${icon('copy')} Copy payment request</button><p class="callout">${icon('shield')} A fresh subaddress helps keep payments separate. Your primary address stays the same.</p></section></div>`;
}
function lockedPage(title, subtitle) {
  return `${heading('YOUR WALLET', title, subtitle)}<section class="panel locked-panel"><span class="empty-icon">${icon('lock')}</span><h2>${records.length ? 'Your wallet is locked' : 'A wallet of your own'}</h2><p class="muted">${records.length ? 'Unlock locally to see your wallet. Your password never leaves this browser.' : 'Create or restore a wallet to get started. No phone or desktop app required.'}</p><button class="button primary" data-action="${records.length ? 'wallets' : 'create'}">${records.length ? 'Unlock wallet' : 'Create wallet'}${icon('arrow')}</button></section>`;
}
function backupGate() {
  return `${heading('FIRST THINGS FIRST', 'Make a backup.', 'Your recovery phrase is the only way to recover your wallet.')}<section class="panel locked-panel">${icon('shield')}<h2>Before you receive</h2><p class="muted">Write your recovery phrase on paper and store it safely. Never share it.</p><button class="button primary" data-action="backup">Back up recovery phrase</button></section>`;
}
function contactsPage() {
  if (!wallet) return lockedPage('Your people.', 'Addresses you trust. Always double-check before sending.');
  return `${heading('ADDRESS BOOK', 'Your people.', 'A familiar name for those very long addresses.', `<button class="button primary" data-action="contact">${icon('plus')} Add contact</button>`)}<section class="panel contacts-panel">${contacts().length ? contacts().map((contact, index) => `<div class="contact-row"><span class="contact-avatar">${e(contact.name[0].toUpperCase())}</span><span class="contact-detail"><strong>${e(contact.name)}</strong><small>${e(contact.address)}</small></span><button class="icon-button" data-contact-send="${index}" aria-label="Send to ${e(contact.name)}">${icon('arrow')}</button><button class="icon-button" data-contact-delete="${index}" aria-label="Remove ${e(contact.name)}">${icon('close')}</button></div>`).join('') : `<div class="empty-state"><span class="empty-icon">${icon('contacts')}</span><h3>Keep good company</h3><p>Save a name and an address for people you send to.</p><button class="text-button" data-action="contact">Add your first contact ${icon('plus')}</button></div>`}</section>`;
}
function settingsPage() {
  return `${heading('A WALLET ON YOUR TERMS', 'The little details.', 'Stay in control of your connection, your keys, and your privacy.')}<div class="settings-grid"><section class="panel settings-panel"><h2>Connection</h2><div class="setting-row"><span><strong>Network</strong><small>Set when a wallet is created. Wallets never switch networks.</small></span><span class="chip">${networkLabel()}</span></div><div class="setting-row"><span><strong>Monero node</strong><small>${payload?.node ? e(payload.node) : 'No node configured · offline'}</small></span><button class="button subtle small-button" data-action="node">Configure</button></div><p class="callout">${icon('info')} Standalone doesn’t mean offline. Syncing and sending require a Monero node, not a separate wallet app. A remote node can see your IP address.</p></section><section class="panel settings-panel"><h2>Security</h2><div class="setting-row"><span><strong>Auto-lock</strong><small>Locks after 5 minutes without activity.</small></span>${icon('lock')}</div><div class="setting-row"><span><strong>Recovery phrase</strong><small>${payload?.backedUp ? 'Backup confirmed' : 'Back up before receiving funds'}</small></span><button class="button subtle small-button" data-action="backup">Back up</button></div><div class="setting-row"><span><strong>Encrypted wallet backup</strong><small>Includes encrypted keys, cache, and address book.</small></span><button class="button subtle small-button" data-action="backup-file">Export</button></div></section><section class="panel settings-panel wide"><div class="panel-heading"><h2>Built differently.</h2></div><div class="security-columns"><div>${icon('shield')}<h3>Local-first, always</h3><p>AES-256-GCM encryption with a password-derived key. No cloud wallet, analytics, or accounts.</p></div><div>${icon('wallet')}<h3>Wallet engine</h3><p>Monero’s wallet engine via monero-ts WebAssembly. Keys and transaction signing stay inside your browser.</p></div><div>${icon('info')}<h3>Current limits</h3><p>No hardware-wallet support, Polyseed, native Tor, or dApp injection. Legacy 25-word Monero seeds only.</p></div></div></section></div>`;
}
async function createForm(restore = false) {
  let verifiedSetup = null;
  dialog(restore ? 'Welcome home.' : 'A wallet of your own.', restore ? 'Restore using a legacy 25-word Monero recovery phrase.' : 'Your keys are generated right here in your browser.', `<form id="wallet-form"><label>Wallet name<input name="name" placeholder="Everyday wallet" maxlength="32" required autocomplete="off"></label><label>Network<select name="network"><option value="mainnet">Mainnet · real XMR</option><option value="stagenet">Stagenet · test funds</option></select></label><label>Connection<select name="connection"><option value="online">Connect to a node</option><option value="offline">Create or restore offline</option></select></label><label id="setup-node-label">Monero node URL<input name="node" type="url" value="${DEFAULT_NODES.mainnet}" required></label><p id="setup-node-note" class="small muted">Public node: Triplebit. It sees your IP address and request timing, never your keys. You may enter your own HTTPS node.</p><div id="setup-node-access"><p id="setup-node-status" class="small muted" role="status">Before creating a connected wallet, choose “Authorize and check node.” Chrome will ask for access to this node only. The node sees your IP and wallet requests, never your keys.</p><button class="button subtle full" id="setup-node-verify" type="button">Authorize and check node</button></div>${restore ? '<label>Restore height<input type="number" name="height" min="0" max="100000000" step="1" value="0" required></label><p class="small muted">Height 0 scans from genesis. Never choose a height after your first payment.</p><label>Recovery phrase<textarea name="seed" rows="4" required autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Your 25 words, separated by spaces"></textarea></label>' : '<p class="small muted">Connected new wallets start scanning 30 blocks before creation. Offline wallets scan from genesis.</p>'}<label>Local password<input name="password" type="password" minlength="12" maxlength="256" required autocomplete="new-password" placeholder="At least 12 characters"></label><label>Confirm password<input name="confirm" type="password" required autocomplete="new-password" placeholder="One more time"></label><label class="checkbox"><input type="checkbox" name="risk" required><span>I understand this is unaudited software and I can lose funds. If I connect, I consent to the selected node receiving my IP address and wallet requests.</span></label><button class="button primary full" type="submit">${restore ? 'Restore wallet' : 'Create wallet'}${icon('arrow')}</button><p class="small muted center">No account. No companion app. No keys leaving your browser.</p></form>`);
  const form = $('#wallet-form');
  const nodeInput = form.elements.node;
  const connectionInput = form.elements.connection;
  const networkInput = form.elements.network;
  const nodeLabel = $('#setup-node-label');
  const nodeNote = $('#setup-node-note');
  const accessStep = $('#setup-node-access');
  const accessStatus = $('#setup-node-status');
  const verifyButton = $('#setup-node-verify');
  const createButton = form.querySelector('[type=submit]');
  function isCurrentNodeVerified() {
    if (!verifiedSetup || verifiedSetup.network !== networkInput.value) return false;
    try { return verifiedSetup.node === validateNode(nodeInput.value); }
    catch { return false; }
  }
  function updateSetupState(message) {
    const offline = connectionInput.value === 'offline';
    nodeLabel.hidden = offline;
    nodeNote.hidden = offline;
    accessStep.hidden = offline;
    nodeInput.required = !offline;
    createButton.disabled = !offline && !isCurrentNodeVerified();
    if (message) accessStatus.textContent = message;
    else if (!offline && !isCurrentNodeVerified()) {
      accessStatus.textContent = 'Before creating a connected wallet, choose “Authorize and check node.” Chrome will ask for access to this node only. The node sees your IP and wallet requests, never your keys.';
    }
  }
  networkInput.onchange = event => {
    nodeInput.value = DEFAULT_NODES[event.target.value];
    nodeNote.textContent = `Public node: ${event.target.value === 'mainnet' ? 'Triplebit' : 'Nodely'}. It sees your IP address and request timing, never your keys. You may enter your own HTTPS node.`;
    verifiedSetup = null;
    updateSetupState();
  };
  nodeInput.oninput = () => {
    verifiedSetup = null;
    updateSetupState();
  };
  connectionInput.onchange = () => {
    verifiedSetup = null;
    updateSetupState();
  };
  verifyButton.onclick = () => {
    let node;
    try { node = validateNode(nodeInput.value); }
    catch (error) { modal.querySelector('.form-error').textContent = error.message; return; }
    const selectedNetwork = networkInput.value;
    verifiedSetup = null;
    createButton.disabled = true;
    modal.querySelector('.form-error').textContent = '';
    // Call permissions.request directly from this user gesture. In Chrome this
    // is the only point where its native, per-node permission prompt can appear.
    const permission = requestNodePermission(node);
    void task(async () => {
      if (!await permission) throw new Error('Node permission was not granted. Choose offline setup or another node.');
      const info = await inspectNode(node, selectedNetwork);
      verifiedSetup = { node, network: selectedNetwork, height: info.height };
      const startHeight = restore ? '' : ` New wallets will start scanning at block ${freshWalletHeight(info.height).toLocaleString()}.`;
      updateSetupState(`Verified ${selectedNetwork} node at block ${info.height.toLocaleString()}.${startHeight} You can now create the wallet.`);
    }).then(() => updateSetupState());
  };
  updateSetupState();
  $('#wallet-form').onsubmit = event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    if (data.password !== data.confirm) return modal.querySelector('.form-error').textContent = 'The passwords don’t match.';
    if (restore && data.seed.trim().split(/\s+/).length !== 25) return modal.querySelector('.form-error').textContent = 'Enter a legacy 25-word Monero seed. Polyseed is not supported yet.';
    let node = '';
    try { if (data.connection === 'online') node = validateNode(data.node); }
    catch (error) { modal.querySelector('.form-error').textContent = error.message; return; }
    if (node && !isCurrentNodeVerified()) {
      modal.querySelector('.form-error').textContent = 'Authorize and check the selected node before creating a connected wallet, or choose offline setup.';
      return;
    }
    if (node && !restore) data.birthdayHeight = freshWalletHeight(verifiedSetup.height);
    task(async () => {
      if (wallet) await persist();
      await monero.LibraryUtils.terminateWorker();
      wallet = null; key = null; payload = null; connected = synced = false;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const newKey = await deriveKey(data.password, salt);
      const newWallet = await createLocalWallet(data, restore);
      record = { id: crypto.randomUUID(), name: data.name.trim(), network: data.network, salt: bytesToBase64(salt), version: 1, createdAt: Date.now() };
      wallet = newWallet; key = newKey; payload = { contacts: [], node, backedUp: restore };
      if (node) { await wallet.setDaemonConnection(node, false); connected = true; }
      receiveIndex = 0;
      await persist(); await refresh();
      closeDialog(); route = 'overview'; render();
      toast(restore ? 'Wallet restored. Syncing will start automatically.' : 'Wallet created. Back up your recovery phrase before receiving.');
    }).then(() => scheduleWalletSync());
  };
}
function walletPicker() {
  dialog('Your wallets.', 'Each wallet has its own local password and encrypted storage.', `<div class="wallet-list">${records.map(item => `<button class="wallet-choice" data-wallet-id="${e(item.id)}"><span class="wallet-avatar">${icon('wallet')}</span><span><strong>${e(item.name)}</strong><small>${item.network === 'mainnet' ? 'Mainnet' : 'Stagenet'} · ${record?.id === item.id && wallet ? 'Unlocked' : 'Locked'}</small></span>${icon('chevron')}</button>`).join('') || '<p class="muted">No wallets yet. Start with a new one, or restore an existing wallet.</p>'}</div><div class="modal-actions"><button class="button primary" id="new-wallet">${icon('plus')} Create wallet</button><button class="button subtle" id="restore-wallet">Restore wallet</button></div><label class="file-import">Import encrypted backup<input type="file" id="import-backup" accept=".json,application/json"></label>`);
  modal.querySelectorAll('[data-wallet-id]').forEach(button => button.onclick = () => unlockForm(records.find(item => item.id === button.dataset.walletId)));
  $('#new-wallet').onclick = () => { closeDialog(); createForm(); };
  $('#restore-wallet').onclick = () => { closeDialog(); createForm(true); };
  $('#import-backup').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) return toast('Backup file is too large.');
    try {
      const backup = JSON.parse(await file.text());
      if (backup.format !== 'monero-one-backup' || backup.record?.version !== 1 || !['mainnet', 'stagenet'].includes(backup.record.network) || typeof backup.record.ciphertext !== 'string' || typeof backup.record.iv !== 'string' || typeof backup.record.salt !== 'string') throw new Error('Unsupported backup file.');
      unlockForm({ ...backup.record, id: crypto.randomUUID(), name: String(backup.record.name).slice(0, 32) }, true);
    } catch { toast('This is not a valid Monero Mobile encrypted backup.'); }
  };
}
function unlockForm(selected, imported = false) {
  closeDialog();
  dialog(imported ? 'Import encrypted wallet.' : 'Just for you.', `Unlock ${selected.name}. Your password stays in this browser.`, `<form id="unlock-form"><label>Password<input type="password" name="password" required autocomplete="current-password" autofocus></label><button class="button primary full" type="submit">${icon('lock')} ${imported ? 'Unlock and import' : 'Unlock wallet'}</button></form>`);
  $('#unlock-form').onsubmit = event => {
    event.preventDefault();
    const password = new FormData(event.target).get('password');
    task(async () => {
      let newKey, decoded;
      try { newKey = await deriveKey(password, base64ToBytes(selected.salt)); decoded = await unseal(selected, newKey); }
      catch { throw new Error('Could not unlock. Check your password and backup file.'); }
      if (wallet) await persist();
      await monero.LibraryUtils.terminateWorker(); wallet = null; key = null; payload = null;
      const opened = await monero.openWalletFull({ password, networkType: selected.network, keysData: base64ToBytes(decoded.keys), cacheData: base64ToBytes(decoded.cache) });
      record = selected; wallet = opened; key = newKey; payload = decoded;
      connected = synced = false; receiveIndex = 0; syncProgress = '';
      if (imported) await persist();
      await refresh(); closeDialog(); render(); lastActivity = Date.now();
    }).then(() => scheduleWalletSync());
  };
}
function requireWallet() {
  if (wallet) return true;
  walletPicker(); return false;
}
function requireBackup() {
  if (payload.backedUp) return true;
  route = 'receive'; render(); return false;
}
function backupForm() {
  if (!requireWallet()) return;
  dialog('Back up your recovery phrase.', 'Never share these words. Anyone with this phrase can spend your Monero.', `<form id="reveal-form"><label>Confirm your local password<input type="password" name="password" required autocomplete="current-password"></label><button class="button primary full" type="submit">Reveal recovery phrase</button></form>`);
  $('#reveal-form').onsubmit = event => {
    event.preventDefault();
    const password = new FormData(event.target).get('password');
    task(async () => {
      try { await unseal(record, await deriveKey(password, base64ToBytes(record.salt))); }
      catch { throw new Error('Incorrect password.'); }
      const words = (await wallet.getSeed()).split(' ');
      const restoreHeight = await wallet.getRestoreHeight();
      closeDialog();
      dialog('Keep these somewhere safe.', 'Write the words down in order. Don’t take a screenshot or store them in cloud notes.', `<div class="seed-grid"></div><p class="callout">Also write down your restore height: ${e(restoreHeight)}. Use this height or an earlier one when restoring.</p><form id="confirm-backup"><label>Confirm word ${words.length}<input name="word" required autocomplete="off" spellcheck="false" placeholder="The last word of your phrase"></label><label class="checkbox"><input type="checkbox" required><span>I wrote my phrase down and stored it safely.</span></label><button type="submit" class="button primary full">I’ve saved my recovery phrase</button></form>`);
      words.forEach((word, index) => {
        const item = document.createElement('span');
        const number = document.createElement('small'); number.textContent = index + 1;
        item.append(number, document.createTextNode(word)); $('.seed-grid').append(item);
      });
      $('#confirm-backup').onsubmit = event => {
        event.preventDefault();
        if (new FormData(event.target).get('word').trim().toLowerCase() !== words.at(-1)) return modal.querySelector('.form-error').textContent = 'That word doesn’t match. Please check your written backup.';
        task(async () => { payload.backedUp = true; await persist(); closeDialog(); render(); toast('Recovery phrase backup confirmed.'); });
      };
    });
  };
}
function nodeForm() {
  if (!requireWallet()) return;
  dialog('Your connection. Your choice.', 'Use a trusted Monero daemon on the same network as this wallet.', `<form id="node-form"><label>${networkLabel()} node URL<input name="node" type="url" placeholder="https://your-monero-node.example:443" value="${e(payload.node || DEFAULT_NODES[network()])}" required></label><p class="callout">${icon('info')} This connects to monerod, not wallet RPC. Remote nodes must use HTTPS. Your node sees your IP address; no built-in Tor is provided.</p><button class="button primary full" type="submit">Verify and save node${icon('arrow')}</button></form>`);
  $('#node-form').onsubmit = event => {
    event.preventDefault();
    let node;
    try { node = validateNode(new FormData(event.target).get('node')); }
    catch (error) { modal.querySelector('.form-error').textContent = error.message; return; }
    const permission = requestNodePermission(node);
    task(async () => {
      if (!await permission) throw new Error('Node permission was not granted.');
      await verifyNode(node);
      await wallet.setDaemonConnection(node, false);
      payload.node = node; connected = true; synced = false;
      await persist(); closeDialog(); render(); toast('Node verified. Your balance will update automatically.');
    }).then(() => scheduleWalletSync());
  };
}
async function verifyNode(node) {
  return inspectNode(node, network());
}
async function requestNodePermission(node) {
  if (!isExtension) return true;
  const url = new URL(node);
  return chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });
}
function scheduleWalletSync() {
  setTimeout(() => {
    if (automaticScanAllowed()) void syncWallet({ quiet: true });
  }, 0);
}
function automaticScanAllowed() {
  return canAutoSync({ hasWallet: Boolean(wallet), node: payload?.node, busy, syncing: syncInProgress,
    modalOpen: modal.open, pendingTransaction: Boolean(pendingTx), inactiveMs: Date.now() - lastActivity });
}
async function syncWallet({ quiet = false } = {}) {
  if (!wallet) { if (!quiet) requireWallet(); return; }
  if (!payload?.node) { if (!quiet) nodeForm(); return; }
  if (busy || syncInProgress) return;
  // Never disable or re-render a send review, recovery phrase, or other dialog
  // because a timer happened to fire. The next scheduled check can retry.
  if (quiet && !automaticScanAllowed()) return;
  await task(async () => {
    syncInProgress = true;
    const wasSynced = synced;
    const knownIncoming = new Set(transfers.filter(tx => !tx.outgoing).map(tx => tx.hash));
    // Receive/payment-request inputs must not reset at every timer tick.
    const renderScan = () => { if (!quiet || ['overview', 'activity'].includes(route)) render(); };
    synced = false; syncProgress = 'Connecting to your node…'; renderScan();
    try {
      await verifyNode(payload.node);
      await wallet.setDaemonConnection(payload.node, false); connected = true;
      await wallet.sync(new class extends monero.MoneroWalletListener {
        async onSyncProgress(height, start, end, fraction) {
          syncProgress = `Scanning block ${height.toLocaleString()} of ${end.toLocaleString()} · ${(fraction * 100).toFixed(1)}%`;
          const paragraph = $('.connection-card p'); if (paragraph) paragraph.textContent = syncProgress;
        }
      });
      synced = await wallet.isSynced() && await wallet.isDaemonSynced();
      syncProgress = synced ? 'Synced with your Monero node. Checking automatically.' : 'Sync incomplete. Your node may still be catching up.';
      await refresh(); await persist(); renderScan();
      const receivedFunds = wasSynced && synced && transfers.some(tx => !tx.outgoing && !knownIncoming.has(tx.hash));
      if (receivedFunds) toast('Incoming funds detected. Check Recent activity.');
      else if (!quiet) toast(syncProgress);
    } catch (error) {
      connected = synced = false;
      syncProgress = `Sync failed: ${error instanceof Error ? error.message : String(error)}. Balance may be out of date. Use Manage connection to check your node.`;
      renderScan();
      if (!quiet) throw error;
    } finally {
      syncInProgress = false;
    }
  });
}
function sendForm(address = '') {
  if (!requireWallet() || !requireBackup()) return;
  if (!synced) { toast('Sync with your node before preparing a transaction.'); return; }
  dialog('Send a little freedom.', 'Transactions are irreversible. Always verify the full recipient address.', `<form id="send-form"><label>Recipient address<textarea name="address" rows="2" required placeholder="Paste a Monero address" spellcheck="false">${e(address)}</textarea></label>${contacts().length ? `<label>Or choose a contact<select id="send-contact"><option value="">Choose a contact</option>${contacts().map((contact, index) => `<option value="${index}">${e(contact.name)}</option>`).join('')}</select></label>` : ''}<label>Amount<div class="input-unit"><input name="amount" inputmode="decimal" placeholder="0.00" required><span>XMR</span></div></label><p class="small muted">Available: ${e(fromAtomic(unlocked))} XMR · network fee calculated next</p><label>Fee priority<select name="priority"><option value="1">Low</option><option value="2" selected>Normal</option><option value="3">High</option></select></label><button type="submit" class="button primary full">Review transaction${icon('arrow')}</button></form>`);
  if ($('#send-contact')) $('#send-contact').onchange = event => { if (event.target.value !== '') $('#send-form [name=address]').value = contacts()[Number(event.target.value)].address; };
  $('#send-form').onsubmit = event => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
    task(async () => {
      const amount = toAtomic(data.amount), recipient = data.address.trim();
      await monero.MoneroUtils.validateAddress(recipient, network());
      if (amount > unlocked) throw new Error('Not enough unlocked XMR.');
      await verifyNode(payload.node);
      if (!await wallet.isSynced()) throw new Error('Wallet needs to sync again before sending.');
      const tx = await wallet.createTx({ accountIndex: 0, address: recipient, amount, priority: Number(data.priority), relay: false, canSplit: false });
      const fee = tx.getFee(); closeDialog(); pendingTx = tx;
      dialog('One last look.', 'Nothing has been broadcast. Confirm only if every detail is correct.', `<dl class="review"><dt>Network</dt><dd>${networkLabel()}</dd><dt>Recipient</dt><dd class="full-address">${e(recipient)}</dd><dt>Amount</dt><dd>${e(fromAtomic(amount))} XMR</dd><dt>Network fee</dt><dd>${e(fromAtomic(fee))} XMR</dd><dt>Total</dt><dd class="review-total">${e(fromAtomic(amount + fee))} XMR</dd></dl><form id="confirm-send"><label>Confirm your local password<input type="password" name="password" required autocomplete="current-password"></label><label class="checkbox"><input type="checkbox" required><span>I verified the recipient, network, amount, and fee. This cannot be undone.</span></label><button class="button primary full" type="submit">Confirm and send${icon('arrow')}</button></form>`);
      $('#confirm-send').onsubmit = event => {
        event.preventDefault(); const password = new FormData(event.target).get('password');
        task(async () => {
          try { await unseal(record, await deriveKey(password, base64ToBytes(record.salt))); }
          catch { throw new Error('Incorrect password. Nothing was broadcast.'); }
          const toRelay = pendingTx;
          pendingTx = null;
          $('#confirm-send').innerHTML = '<p class="callout">Broadcasting transaction. Do not close this tab.</p>';
          try {
            const hash = await wallet.relayTx(toRelay);
            await refresh(); await persist(); closeDialog(); render(); toast(`Transaction broadcast: ${short(hash)}`);
          } catch {
            synced = false;
            try { await refresh(); await persist(); } catch {}
            closeDialog(); render();
            dialog('Check before sending again.', 'Broadcast status could not be confirmed. It may have reached the network.', `<p class="callout warning">Do not retry this payment automatically. Sync your wallet and check this transaction hash first.</p><p class="full-address">${e(toRelay.getHash())}</p>`);
          }
        });
      };
    });
  };
}
function contactForm() {
  if (!requireWallet()) return;
  dialog('A name you know.', `Save an address for this ${networkLabel().toLowerCase()} wallet.`, `<form id="contact-form"><label>Name<input name="name" maxlength="60" required autocomplete="off"></label><label>Monero address<textarea name="address" rows="3" required spellcheck="false"></textarea></label><button class="button primary full" type="submit">Save contact${icon('check')}</button></form>`);
  $('#contact-form').onsubmit = event => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
    task(async () => {
      await monero.MoneroUtils.validateAddress(data.address.trim(), network());
      payload.contacts.push({ name: data.name.trim(), address: data.address.trim() });
      await persist(); closeDialog(); render(); toast('Contact saved, encrypted with your wallet.');
    });
  };
}
async function updateQr() {
  try {
    const uri = paymentUri(activeAddress(), $('#request-amount')?.value, $('#request-note')?.value);
    await QRCode.toCanvas($('#qr'), uri, { width: 240, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#17191e', light: '#ffffff' } });
  } catch { toast('Enter a valid positive XMR amount with up to 12 decimal places.'); }
}
async function copy(text) {
  await navigator.clipboard.writeText(text); toast('Copied to clipboard.');
}
function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const actions = {
  create: () => createForm(), restore: () => createForm(true), wallets: walletPicker, lock, hide: () => { hidden = !hidden; render(); },
  backup: backupForm, node: nodeForm, sync: syncWallet, send: () => sendForm(), contact: contactForm,
  'copy-address': () => copy(activeAddress()),
  'copy-request': () => copy(paymentUri(activeAddress(), $('#request-amount').value, $('#request-note').value)),
  subaddress: async () => {
    if (!wallet || busy) return;
    await task(async () => {
      await wallet.createSubaddress(0, `Private address ${addresses.length}`);
      await persist(); await refresh(); receiveIndex = addresses.length - 1; render(); toast('A fresh receive address, just for you.');
    });
  },
  export: () => {
    if (!requireWallet()) return;
    const rows = [['hash', 'direction', 'amount_xmr', 'status', 'date'], ...transfers.map(tx => [tx.hash, tx.outgoing ? 'sent' : 'received', fromAtomic(tx.amount), tx.confirmed ? tx.locked ? 'locked' : 'confirmed' : 'pending', tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : ''])];
    download(rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'monero-one-activity.csv', 'text/csv');
    toast('Exported activity. This file is not encrypted; store it privately.');
  },
  'backup-file': async () => {
    if (!requireWallet()) return;
    await task(async () => { await persist(); download(JSON.stringify({ format: 'monero-one-backup', record }), 'monero-one-encrypted-backup.json', 'application/json'); toast('Encrypted backup exported. Keep your password and recovery phrase safe.'); });
  }
};
app.addEventListener('click', event => {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton) { event.preventDefault(); if (busy) return; route = routeButton.dataset.route; render(); return; }
  const button = event.target.closest('[data-action]');
  if (button && !busy) Promise.resolve(actions[button.dataset.action]?.()).catch(error => toast(error.message));
  const sent = event.target.closest('[data-contact-send]');
  if (sent && !busy) sendForm(contacts()[Number(sent.dataset.contactSend)].address);
  const removed = event.target.closest('[data-contact-delete]');
  if (removed && !busy) {
    const index = Number(removed.dataset.contactDelete);
    dialog('Remove this contact?', contacts()[index].name, '<p class="muted">This removes the saved address, not any transactions.</p><button class="button primary full" id="remove-contact">Remove contact</button>');
    $('#remove-contact').onclick = () => task(async () => { payload.contacts.splice(index, 1); await persist(); closeDialog(); render(); });
  }
  const filterButton = event.target.closest('[data-filter]');
  if (filterButton) { filter = filterButton.dataset.filter; render(); }
  const txButton = event.target.closest('[data-tx]');
  if (txButton) {
    const tx = transfers.find(tx => tx.hash === txButton.dataset.tx);
    dialog('Transaction details.', tx.outgoing ? 'Sent Monero' : 'Received Monero', `<dl class="review"><dt>Transaction hash</dt><dd class="full-address">${e(tx.hash)}</dd><dt>Amount</dt><dd>${e(fromAtomic(tx.amount))} XMR</dd><dt>Status</dt><dd>${tx.confirmed ? tx.locked ? 'Confirmed · locked' : 'Confirmed' : 'Pending'}</dd></dl><button class="button subtle full" id="copy-hash">${icon('copy')} Copy transaction hash</button>`);
    $('#copy-hash').onclick = () => copy(tx.hash);
  }
});
app.addEventListener('input', event => {
  if (event.target.id === 'tx-search') {
    search = event.target.value;
    $('#activity-list').innerHTML = transactionList(transfers.filter(tx => (filter === 'all' || (filter === 'sent' ? tx.outgoing : !tx.outgoing)) && tx.hash.toLowerCase().includes(search.toLowerCase())));
  }
  if (['request-amount', 'request-note'].includes(event.target.id)) {
    clearTimeout(event.target.qrTimer); event.target.qrTimer = setTimeout(updateQr, 500);
  }
});
app.addEventListener('change', event => { if (event.target.id === 'receive-address') { receiveIndex = Number(event.target.value); render(); } });
for (const name of ['pointerdown', 'keydown', 'input']) document.addEventListener(name, () => { lastActivity = Date.now(); }, { passive: true });
setInterval(() => { if (wallet && Date.now() - lastActivity > 300000) lock(); }, 10000);
setInterval(() => {
  if (automaticScanAllowed()) void syncWallet({ quiet: true });
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && automaticScanAllowed()) void syncWallet({ quiet: true });
});
async function init() {
  records = await listWallets(); record = records[0] || null;
  if (navigator.locks) {
    navigator.locks.request('monero-one-wallet-session', { ifAvailable: true }, async lock => {
      if (!lock) {
        app.innerHTML = '<div class="another-tab"><h1>Your wallet is open in another tab.</h1><p>Use that tab, or close it and reload this one. Only one tab can use your wallets at a time.</p></div>';
        return;
      }
      render();
      await new Promise(resolve => { releaseLock = resolve; });
    });
  } else {
    app.innerHTML = '<div class="another-tab"><h1>A secure browser context is required.</h1><p>Install the Chrome extension or use an HTTPS preview.</p></div>';
  }
}
window.addEventListener('pagehide', () => { releaseLock?.(); monero.LibraryUtils.terminateWorker(); });
init().catch(() => { app.textContent = 'Could not open local wallet storage. Enable IndexedDB and reload.'; });
