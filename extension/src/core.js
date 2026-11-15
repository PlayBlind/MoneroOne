const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const ITERATIONS = 600000;

export function walletConfig(data, restore) {
  return { password: data.password, networkType: data.network,
    ...(restore ? { seed: data.seed.trim().replace(/\s+/g, ' '), restoreHeight: Number(data.height) } : { language: 'English' }) };
}

export function toAtomic(value) {
  const text = String(value).trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,12})?$/.test(text)) throw new Error('Enter a positive XMR amount with up to 12 decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const result = BigInt(whole) * 1000000000000n + BigInt(fraction.padEnd(12, '0'));
  if (result <= 0n || result > 18446744073709551615n) throw new Error('Amount is outside the supported range.');
  return result;
}

export function fromAtomic(value, precision = 12) {
  const amount = BigInt(value);
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  const fraction = (absolute % 1000000000000n).toString().padStart(12, '0').slice(0, precision).replace(/0+$/, '');
  return `${sign}${absolute / 1000000000000n}${fraction ? `.${fraction}` : ''}`;
}

export function validateNode(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error('Use a node URL without credentials, a query, or a fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use HTTPS for remote nodes. HTTP is allowed only on localhost.');
  }
  return url.href.replace(/\/$/, '');
}

export function paymentUri(address, amount, description = '') {
  if (!address) throw new Error('A receive address is required.');
  const params = new URLSearchParams();
  if (amount) { toAtomic(amount); params.set('tx_amount', String(amount)); }
  if (description) params.set('tx_description', description);
  return `monero:${address}${params.size ? `?${params}` : ''}`;
}

export const bytesToBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};
export const base64ToBytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));

export async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(payload, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload)));
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)) };
}

export async function unseal(record, key) {
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(record.iv) }, key, base64ToBytes(record.ciphertext));
  return JSON.parse(decoder.decode(decrypted));
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function csvCell(value) {
  const text = String(value);
  return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}
