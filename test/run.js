// End-to-end checks against live sources: relay endpoints, the vault, and that transactions signed by the wallet engine
// pass signature verification on a Solana node (simulation only; nothing is sent and no funds are needed).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), PORT = 21000 + Math.floor(Math.random() * 2000), BASE = 'http://127.0.0.1:' + PORT;
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
const W = await import('../client/wallet.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else fail++; console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  ' + String(extra).slice(0, 200))); };
const get = async (p, body) => { const r = await fetch(BASE + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined); const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { status: r.status, j, text, headers: r.headers }; };
const rpc = async (method, params) => (await (await fetch('https://solana-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json());
const SOL = 'So11111111111111111111111111111111111111112', USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'] }); let log = ''; srv.stdout.on('data', (d) => { log += d; });
try {
  for (let i = 0; i < 40 && !log.includes('mist relay'); i++) await sleep(150);
  console.log('pages');
  for (const p of ['/', '/app', '/docs', '/style.css', '/app.js', '/wallet.js', '/pnl.js', '/favicon.svg', '/fonts/bricolage.woff2', '/healthz']) ok(p, (await get(p)).status === 200);
  const nf = await get('/nope'); ok('unknown page is a styled 404', nf.status === 404 && nf.text.includes('mist'));
  const app = await get('/app'); ok('strict content policy: scripts and connections only to this origin', /script-src 'self'/.test(app.headers.get('content-security-policy')) && /connect-src 'self'/.test(app.headers.get('content-security-policy')) && app.headers.get('referrer-policy') === 'no-referrer');
  ok('no cookies are set', !app.headers.get('set-cookie'));
  ok('pages load nothing from another origin', !/(src|href)="https?:\/\//.test(app.text.replace(/rel="noopener[^>]*>/g, '')));

  console.log('market data');
  const d = await get('/api/discover?tab=trending&tf=h24'); ok('trending has rows', d.j?.rows?.length > 5, d.text); const row = d.j.rows.find((r) => r.liq > 50000) || d.j.rows[0];
  ok('row shape', row.mint && row.pool && row.symbol && row.price > 0, JSON.stringify(row)); ok('images go through the relay', d.j.rows.every((r) => !r.image || r.image.startsWith('/api/img?u=')));
  const np = await get('/api/discover?tab=new'); ok('new pairs', np.j?.rows?.length > 0, np.text);
  const g = (await get('/api/discover?tab=gainers&tf=h24')).j.rows; ok('gainers are sorted by change', g.length > 1 && g[0].chg.h24 >= g[1].chg.h24);
  const t = await get('/api/token/' + row.mint); ok('token detail', t.j?.mint === row.mint && t.j.price > 0 && t.j.info?.decimals >= 0, t.text);
  const oh = await get(`/api/ohlcv/${t.j.pool}?tf=15m&mint=${t.j.mint}`); ok('candles', oh.j?.candles?.length > 0, oh.text); const trd = await get('/api/trades/' + t.j.pool + '?mint=' + t.j.mint); ok('trades', Array.isArray(trd.j?.trades), trd.text);
  ok('search', (await get('/api/search?q=bonk')).j?.rows?.length > 0); ok('bad address is a 400', (await get('/api/token/abc')).status === 400);
  if (row.image) ok('image relay serves a picture', (await get(row.image)).headers.get('content-type')?.startsWith('image/'));
  ok('image relay refuses other hosts', (await get('/api/img?u=' + encodeURIComponent('https://example.com/a.png'))).status === 404);

  console.log('vault');
  ok('browser can sign', await W.supported());
  let threw = false; try { await W.create('short'); } catch { threw = true; } ok('short passphrase refused', threw);
  await W.create('correct horse battery'); const a0 = await W.address(0), key = W.backup(); const c1 = await W.newCompartment('TEST', '', 'route');
  ok('reserve address is a Solana address', /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a0)); ok('each compartment has its own address', c1.address !== a0);
  const stored = localStorage.getItem('mist_vault'); ok('vault at rest holds no seed or address in the clear', !stored.includes(W.data().seed) && !stored.includes(a0));
  W.lock(); ok('locked', !W.unlocked()); threw = false; try { await W.unlock('wrong passphrase'); } catch { threw = true; } ok('wrong passphrase refused', threw);
  await W.unlock('correct horse battery'); ok('unlock restores compartments', (await W.compartments()).length === 2 && (await W.address(0)) === a0);
  ok('session resume after a reload', await W.resume() && (await W.address(0)) === a0); W.lock(); ok('locking ends the session', !(await W.resume())); W.destroy(); await W.restore('another passphrase', key); ok('recovery key rebuilds the same wallets', (await W.address(0)) === a0 && (await W.address(1)) === c1.address);
  const sk = W.unb58(await W.secretKey(0)); ok('exported key is the standard 64-byte form ending in the address', sk.length === 64 && W.b58(sk.subarray(32)) === a0);

  console.log('signing');
  const bh = await get('/api/blockhash'); ok('blockhash', !!bh.j?.blockhash, bh.text);
  const tx = await W.transferTx(0, c1.address, 1000000, bh.j.blockhash); const sim = await rpc('simulateTransaction', [tx, { encoding: 'base64', sigVerify: true }]);
  ok('hand-built transfer passes signature verification on a node', sim.result && JSON.stringify(sim.result.value.err) !== '"SignatureFailure"' && !sim.error, JSON.stringify(sim).slice(0, 200));
  const q = await get(`/api/quote?in=${SOL}&out=${USDC}&amount=10000000&slip=100`); ok('quote', +q.j?.outAmount > 0, q.text);
  const sw = await get('/api/swap', { quote: q.j, user: a0, shield: true }); ok('swap transaction built for our wallet', !!sw.j?.tx, sw.text);
  if (sw.j?.tx) { const signed = await W.signTx(0, sw.j.tx), sim2 = await rpc('simulateTransaction', [signed, { encoding: 'base64', sigVerify: true }]); ok('signed swap passes signature verification on a node', sim2.result && JSON.stringify(sim2.result.value.err) !== '"SignatureFailure"', JSON.stringify(sim2).slice(0, 200));
    threw = false; try { await W.signTx(1, sw.j.tx); } catch { threw = true; } ok('refuses to sign a transaction built for another wallet', threw); }
  ok('garbage transaction refused', (await get('/api/send', { tx: '<script>' })).status === 400);
  const bal = await get('/api/balances', { addrs: [a0, c1.address] }); ok('balances', bal.j?.lamports?.[a0] === 0, bal.text);
  const w = await get('/api/wallet/' + a0); ok('wallet lookup', w.j?.sol === 0 && Array.isArray(w.j.tokens), w.text);

  console.log('mist route');
  const rt = await get('/api/route/tokens'); ok('route assets across chains', rt.j?.tokens?.length > 10 && new Set(rt.j.tokens.map((x) => x.chain)).size > 4, rt.text);
  const usdc = rt.j.tokens.find((x) => x.symbol === 'USDC' && x.chain === 'base') || rt.j.tokens.find((x) => x.symbol === 'USDC');
  const rq = await get('/api/route/quote', { asset: usdc.id, amount: '50' }); ok('estimate: USDC in, SOL out', +rq.j?.out > 0, rq.text);
  const mv = await get('/api/route/quote', { asset: 'nep141:sol.omft.near', raw: '100000000' }); ok('estimate: SOL to SOL between own wallets', +mv.j?.out > 0.09, mv.text);
  const od = await get('/api/route/quote', { asset: 'nep141:sol.omft.near', raw: '100000000', order: true, recipient: c1.address, refundTo: a0 }); ok('order returns a one-time deposit address', /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(od.j?.deposit || '') && od.j.deposit !== c1.address, od.text);
  if (od.j?.deposit) { const st = await get('/api/route/status?deposit=' + od.j.deposit); ok('route status', st.status === 200 && !!st.j.status, st.text); }
  ok('order without a refund address is refused', (await get('/api/route/quote', { asset: usdc.id, amount: '50', order: true, recipient: c1.address })).status === 400);
} catch (e) { fail++; console.log('  FAIL crashed: ' + (e.stack || e)); } finally { srv.kill(); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
