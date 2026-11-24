// Keys live here and nowhere else. One 32-byte seed, encrypted with the passphrase (PBKDF2 + AES-GCM), derives every
// compartment wallet. Transactions are signed in this tab with WebCrypto Ed25519 and leave it already signed.
const te = new TextEncoder(), td = new TextDecoder();
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58(bytes) { let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b) break; s = '1' + s; } return s; }
export function unb58(s) { let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) throw new Error('Not a valid address'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const c of s) { if (c !== '1') break; out.unshift(0); } return new Uint8Array(out); }
export const b64 = (u) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const PKCS8 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
const VAULT = 'mist_vault', SESSION = 'mist_session';

export const supported = async () => { try { await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']); return true; } catch { return false; } };

// ---------- vault ----------
let live = null; // { key: CryptoKey, salt, data: { seed: b64, comps: [...], orders: [...] } }
const kdf = async (pass, salt) => crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
async function persist() {
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, live.key, te.encode(JSON.stringify(live.data))));
  localStorage.setItem(VAULT, JSON.stringify({ v: 1, salt: b64(live.salt), iv: b64(iv), ct: b64(ct) }));
  try { sessionStorage.setItem(SESSION, JSON.stringify({ k: b64(new Uint8Array(await crypto.subtle.exportKey('raw', live.key))), salt: b64(live.salt) })); } catch {}
}
export const exists = () => !!localStorage.getItem(VAULT);
export const unlocked = () => !!live;
export const data = () => live?.data;
export async function create(pass, seedBytes) {
  if (String(pass).length < 8) throw new Error('Use a passphrase of at least 8 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16)), seed = seedBytes || crypto.getRandomValues(new Uint8Array(32));
  live = { key: await kdf(pass, salt), salt, data: { seed: b64(seed), next: 1, comps: [{ i: 0, label: 'Reserve', mint: '', src: 'direct', at: Date.now() }], routes: [], fills: [] } };
  await persist(); return live.data;
}
async function open(key, salt) { const v = JSON.parse(localStorage.getItem(VAULT)); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, key, unb64(v.ct)); live = { key, salt, data: JSON.parse(td.decode(pt)) }; return live.data; }
export async function unlock(pass) { const v = JSON.parse(localStorage.getItem(VAULT)), salt = unb64(v.salt); try { const d = await open(await kdf(pass, salt), salt); await persist(); return d; } catch { live = null; throw new Error('Wrong passphrase'); } }
export async function resume() { try { const s = JSON.parse(sessionStorage.getItem(SESSION) || 'null'); if (!s || !exists()) return false; const key = await crypto.subtle.importKey('raw', unb64(s.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); await open(key, unb64(s.salt)); return true; } catch { live = null; return false; } }
export function lock() { live = null; keys.clear(); try { sessionStorage.removeItem(SESSION); } catch {} }
export function destroy() { lock(); localStorage.removeItem(VAULT); }
export const save = () => persist();
export const backup = () => b58(unb64(live.data.seed));
export async function restore(pass, phrase) { const seed = unb58(phrase.trim()); if (seed.length !== 32) throw new Error('That is not a MIST recovery key'); return create(pass, seed); }

// ---------- compartments ----------
const keys = new Map();
async function keyOf(i) {
  if (keys.has(i)) return keys.get(i);
  const mac = await crypto.subtle.importKey('raw', unb64(live.data.seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sk = new Uint8Array(await crypto.subtle.sign('HMAC', mac, te.encode('mist/compartment/' + i)));
  const priv = await crypto.subtle.importKey('pkcs8', cat(PKCS8, sk), { name: 'Ed25519' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', priv), pub = unb64(jwk.x.replace(/-/g, '+').replace(/_/g, '/').padEnd(44, '='));
  const k = { priv, pub, address: b58(pub), secret: () => b58(cat(sk, pub)) }; keys.set(i, k); return k;
}
export const address = async (i) => (await keyOf(i)).address;
export const secretKey = async (i) => (await keyOf(i)).secret();
export async function newCompartment(label, mint = '', src = 'pending') { const d = live.data, c = { i: d.next++, label, mint, src, at: Date.now() }; d.comps.push(c); await persist(); c.address = await address(c.i); return c; }
export async function removeCompartment(i) { live.data.comps = live.data.comps.filter((c) => c.i !== i); keys.delete(i); await persist(); }
export async function compartments() { return Promise.all(live.data.comps.map(async (c) => ({ ...c, address: await address(c.i) }))); }

// ---------- transactions ----------
const shortvec = (bytes, o) => { let n = 0, shift = 0, len = 0; for (;;) { const b = bytes[o + len++]; n |= (b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7; } return [n, len]; };
// Sign a transaction someone else built (the swap route). Our key must be one of the required signers.
export async function signTx(i, txB64) {
  const k = await keyOf(i), tx = unb64(txB64), [nsig, l] = shortvec(tx, 0), msg = tx.subarray(l + 64 * nsig);
  let o = msg[0] & 0x80 ? 1 : 0; const required = msg[o]; o += 3; const [nkeys, kl] = shortvec(msg, o); o += kl;
  let at = -1; for (let j = 0; j < Math.min(required, nkeys); j++) if (msg.subarray(o + 32 * j, o + 32 * j + 32).every((b, x) => b === k.pub[x])) at = j;
  if (at < 0) throw new Error('This transaction is not for this wallet');
  tx.set(new Uint8Array(await crypto.subtle.sign('Ed25519', k.priv, msg)), l + 64 * at); return b64(tx);
}
// Plain SOL transfer, built by hand: header, three accounts, recent blockhash, one System Program instruction.
export async function transferTx(i, to, lamports, blockhash) {
  const k = await keyOf(i), dest = unb58(to); if (dest.length !== 32) throw new Error('Not a valid Solana address');
  const data = new Uint8Array(12), dv = new DataView(data.buffer); dv.setUint32(0, 2, true); dv.setBigUint64(4, BigInt(lamports), true);
  const msg = cat(Uint8Array.from([1, 0, 1, 3]), k.pub, dest, new Uint8Array(32), unb58(blockhash), Uint8Array.from([1, 2, 2, 0, 1, 12]), data);
  return b64(cat(Uint8Array.from([1]), new Uint8Array(await crypto.subtle.sign('Ed25519', k.priv, msg)), msg));
}
export const TRANSFER_FEE = 5000;
