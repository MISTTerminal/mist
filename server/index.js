// MIST relay. The browser only ever talks to this server: market data, quotes, images and transaction relay all pass
// through here, so no third party sees a visitor's address or what they are looking at. It stores nothing about anyone:
// no accounts, no cookies, no request log. Keys never reach it; transactions arrive already signed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), CLIENT = path.join(ROOT, 'client');
const PORT = +process.env.PORT || 8316;
const RPCS = (process.env.RPC_URL || 'https://solana-rpc.publicnode.com,https://api.mainnet-beta.solana.com').split(',').map((s) => s.trim()).filter(Boolean);
const JITO = process.env.JITO_URL || 'https://mainnet.block-engine.jito.wtf/api/v1/transactions';
const JUP = process.env.JUP_URL || 'https://lite-api.jup.ag', GT = 'https://api.geckoterminal.com/api/v2', DATA = 'https://datapi.jup.ag', DS = 'https://api.dexscreener.com', ONE = process.env.ONECLICK_URL || 'https://1click.chaindefuser.com';
const FEE_BPS = Math.min(100, Math.max(0, +process.env.FEE_BPS || 0)), FEE_ACCOUNT = process.env.FEE_ACCOUNT || '', ROUTE_FEE_TO = process.env.ROUTE_FEE_TO || '', ROUTE_FEE_BPS = +process.env.ROUTE_FEE_BPS || 0;
const TOKEN_MINT = process.env.TOKEN_MINT || 'ExdT9yyZojJ8ktkSUq6T3fG6m2Gc1RUjMXTHwns2pump', X_DEFAULT = 'https://x.com/MISTTerminal', GH_DEFAULT = 'https://github.com/MISTTerminal/mist', SITE = { x: /^https:\/\//.test(process.env.X_URL || '') ? process.env.X_URL : X_DEFAULT, gh: /^https:\/\//.test(process.env.GH_URL || '') ? process.env.GH_URL : GH_DEFAULT, mint: TOKEN_MINT };
const SOL = 'So11111111111111111111111111111111111111112', SOL_ASSET = 'nep141:sol.omft.near';
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
process.on('uncaughtException', (e) => { console.error('uncaught', e?.message || e); if (e?.code === 'EADDRINUSE') process.exit(1); });
process.on('unhandledRejection', (e) => console.error('unhandled', e?.message || e));

// ---------- upstream fetch with a last-good cache: a slow or failing source never becomes an error page ----------
const store = new Map(), flights = new Map();
async function get(url, opt = {}) {
  const r = await fetch(url, { method: opt.method || (opt.body ? 'POST' : 'GET'), body: opt.body ? JSON.stringify(opt.body) : undefined, headers: { accept: 'application/json', ...(opt.body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(opt.timeout || 12000) });
  const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = null; }
  if (!r.ok) { const e = new Error(j?.message || j?.error?.message || j?.error || ('upstream ' + r.status)); e.status = r.status; throw e; }
  return j;
}
async function cached(key, ttl, make) {
  const hit = store.get(key), now = Date.now();
  if (hit && now - hit.at < ttl) return hit.v;
  if (flights.has(key)) return hit ? hit.v : flights.get(key);
  const p = (async () => { try { const v = await make(); if (store.size > 4000) store.delete(store.keys().next().value); store.delete(key); store.set(key, { v, at: Date.now() }); return v; } catch (e) { if (hit) return hit.v; throw e; } finally { flights.delete(key); } })();
  flights.set(key, p); return hit && now - hit.at < ttl * 20 ? hit.v : p;
}
let rpcAt = 0;
async function rpc(method, params = [], urls = RPCS) {
  let last;
  for (let i = 0; i < urls.length; i++) { const u = urls[(rpcAt + i) % urls.length];
    try { const j = await get(u, { body: { jsonrpc: '2.0', id: 1, method, params }, timeout: 15000 }); if (j?.error) { const e = new Error(j.error.message || 'rpc error'); e.rpc = true; throw e; } return j.result; }
    catch (e) { last = e; if (e.rpc) throw e; rpcAt++; } }
  throw last || new Error('rpc unavailable');
}

// ---------- market data ----------
const num = (x) => (x == null || x === '' || !isFinite(+x) ? null : +x);
const img = (u) => (u && /^https:\/\//.test(u) && !/missing/.test(u) ? '/api/img?u=' + encodeURIComponent(u) : '');
function fromGT(j) {
  const tok = new Map((j.included || []).filter((x) => x.type === 'token').map((x) => [x.id, x.attributes]));
  const dex = new Map((j.included || []).filter((x) => x.type === 'dex').map((x) => [x.id, x.attributes.name]));
  const seen = new Set(), out = [];
  for (const p of j.data || []) { const a = p.attributes, b = tok.get(p.relationships?.base_token?.data?.id); if (!b || seen.has(b.address)) continue; seen.add(b.address);
    const tx = a.transactions?.h24 || {};
    out.push({ mint: b.address, pool: a.address, name: b.name, symbol: b.symbol, image: img(b.image_url), dex: dex.get(p.relationships?.dex?.data?.id) || p.relationships?.dex?.data?.id || '', price: num(a.base_token_price_usd), mcap: num(a.market_cap_usd) ?? num(a.fdv_usd), liq: num(a.reserve_in_usd),
      vol: { m5: num(a.volume_usd?.m5), h1: num(a.volume_usd?.h1), h6: num(a.volume_usd?.h6), h24: num(a.volume_usd?.h24) }, chg: { m5: num(a.price_change_percentage?.m5), h1: num(a.price_change_percentage?.h1), h6: num(a.price_change_percentage?.h6), h24: num(a.price_change_percentage?.h24) },
      buys: tx.buys ?? null, sells: tx.sells ?? null, created: a.pool_created_at ? Date.parse(a.pool_created_at) : null }); }
  return out;
}
const TF = { m5: '5m', h1: '1h', h6: '6h', h24: '24h' };
async function discover(tab, tf) {
  if (tab === 'new') return cached('disc:new', 20000, async () => { try { return fromGT(await get(GT + '/networks/solana/new_pools?include=base_token,dex&page=1')); } catch { const r = fromJup(await get(DATA + '/v1/pools/toptrending/5m?limit=60')).filter((x) => x.created).sort((a, b) => b.created - a.created); if (!r.length) throw new Error('Market data is catching up'); return r; } });
  const rows = await cached('disc:tr:' + tf, 30000, async () => { const pages = await Promise.all([1, 2].map((p) => get(GT + `/networks/solana/trending_pools?include=base_token,dex&duration=${TF[tf] || '24h'}&page=${p}`).catch(() => ({ data: [] })))); let all = pages.flatMap(fromGT);
    if (!all.length) all = fromJup(await get(DATA + `/v1/pools/toptrending/${TF[tf] || '24h'}?limit=60`)); if (!all.length) throw new Error('Market data is catching up'); const s = new Set(); return all.filter((r) => !s.has(r.mint) && s.add(r.mint)); });
  return tab === 'gainers' ? [...rows].filter((r) => (r.liq || 0) > 5000).sort((a, b) => (b.chg[tf] ?? -1e9) - (a.chg[tf] ?? -1e9)) : rows;
}
function fromDS(p) {
  return { mint: p.baseToken.address, pool: p.pairAddress, name: p.baseToken.name, symbol: p.baseToken.symbol, image: img(p.info?.imageUrl), dex: p.dexId, quote: p.quoteToken?.symbol, price: num(p.priceUsd), priceNative: num(p.priceNative), mcap: num(p.marketCap) ?? num(p.fdv), fdv: num(p.fdv), liq: num(p.liquidity?.usd), liqBase: num(p.liquidity?.base), liqQuote: num(p.liquidity?.quote),
    vol: { m5: num(p.volume?.m5), h1: num(p.volume?.h1), h6: num(p.volume?.h6), h24: num(p.volume?.h24) }, chg: { m5: num(p.priceChange?.m5), h1: num(p.priceChange?.h1), h6: num(p.priceChange?.h6), h24: num(p.priceChange?.h24) }, buys: p.txns?.h24?.buys ?? null, sells: p.txns?.h24?.sells ?? null, created: p.pairCreatedAt || null,
    links: [...(p.info?.websites || []).map((w) => ({ t: 'web', u: w.url })), ...(p.info?.socials || []).map((s) => ({ t: s.type, u: s.url }))].filter((l) => /^https:\/\//.test(l.u)).slice(0, 4) };
}
async function token(mint) {
  return cached('tok:' + mint, 6000, async () => { const j = await get(DS + '/tokens/v1/solana/' + mint); const pairs = (Array.isArray(j) ? j : []).filter((p) => p.baseToken?.address === mint).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)); if (!pairs.length) { const e = new Error('No market found for this token'); e.status = 404; throw e; } return fromDS(pairs[0]); });
}
async function supplyInfo(mint) {
  return cached('mint:' + mint, 600000, async () => { const r = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]); const i = r?.value?.data?.parsed?.info; if (!i) return null; return { decimals: i.decimals, supply: +i.supply / 10 ** i.decimals, mintAuthority: i.mintAuthority || null, freezeAuthority: i.freezeAuthority || null, program: r.value.owner }; });
}
// charts and the tape come from two independent sources; the second answers when the first is busy
const AGG = { '1m': ['minute', 1, '1_MINUTE'], '5m': ['minute', 5, '5_MINUTE'], '15m': ['minute', 15, '15_MINUTE'], '1h': ['hour', 1, '1_HOUR'], '4h': ['hour', 4, '4_HOUR'], '1d': ['day', 1, '1_DAY'] };
const ohlcv = (pool, tf, mint) => cached('oh:' + pool + tf, 12000, async () => { const [unit, agg, iv] = AGG[tf] || AGG['15m'];
  if (mint) try { const j = await get(DATA + `/v2/charts/${mint}?interval=${iv}&to=${Date.now()}&candles=300&type=price`, { timeout: 8000 }); if (j?.candles?.length) return j.candles.map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume]); } catch {}
  const j = await get(GT + `/networks/solana/pools/${pool}/ohlcv/${unit}?aggregate=${agg}&limit=300&currency=usd`); return (j.data?.attributes?.ohlcv_list || []).map((c) => c.map(Number)).reverse(); });
const trades = (pool, mint) => cached('tr:' + pool, 6000, async () => {
  if (mint) try { const j = await get(DATA + `/v1/txs/${mint}?limit=60`, { timeout: 8000 }); if (j?.txs?.length) return j.txs.map((t) => ({ t: Date.parse(t.timestamp), side: t.type === 'buy' ? 'buy' : 'sell', usd: num(t.usdVolume), price: num(t.usdPrice), amount: num(t.amount), who: t.traderAddress, sig: t.txHash })); } catch {}
  const j = await get(GT + `/networks/solana/pools/${pool}/trades`); return (j.data || []).slice(0, 60).map((t) => { const a = t.attributes; return { t: Date.parse(a.block_timestamp), side: a.kind, usd: num(a.volume_in_usd), price: num(a.kind === 'buy' ? a.price_to_in_usd : a.price_from_in_usd), amount: num(a.kind === 'buy' ? a.to_token_amount : a.from_token_amount), who: a.tx_from_address, sig: a.tx_hash }; }); });
function fromJup(j) { const s = new Set(), st = (b, k) => b['stats' + k] || {}; return (j.pools || []).filter((p) => p.baseAsset?.id && !s.has(p.baseAsset.id) && s.add(p.baseAsset.id)).map((p) => { const b = p.baseAsset, v = (k) => { const x = st(b, k); return x.buyVolume != null || x.sellVolume != null ? (x.buyVolume || 0) + (x.sellVolume || 0) : null; };
  return { mint: b.id, pool: p.id, name: b.name, symbol: b.symbol, image: img(b.icon), dex: p.dex || '', price: num(b.usdPrice), mcap: num(b.mcap) ?? num(b.fdv), liq: num(p.liquidity ?? b.liquidity), vol: { m5: v('5m'), h1: v('1h'), h6: v('6h'), h24: v('24h') ?? num(p.volume24h) }, chg: { m5: num(st(b, '5m').priceChange), h1: num(st(b, '1h').priceChange), h6: num(st(b, '6h').priceChange), h24: num(st(b, '24h').priceChange) }, buys: st(b, '24h').numBuys ?? null, sells: st(b, '24h').numSells ?? null, created: p.createdAt ? Date.parse(p.createdAt) : null }; }); }
const search = (q) => cached('q:' + q.toLowerCase(), 20000, async () => { const j = await get(DS + '/latest/dex/search?q=' + encodeURIComponent(q)); const s = new Set(); return (j.pairs || []).filter((p) => p.chainId === 'solana' && !s.has(p.baseToken.address) && s.add(p.baseToken.address)).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)).slice(0, 12).map(fromDS); });
const solPrice = () => cached('solpx', 15000, async () => { const j = await get(JUP + '/price/v3?ids=' + SOL); return j[SOL].usdPrice; });
async function prices(mints) { const out = {}; const need = [...new Set(mints)].slice(0, 100); if (!need.length) return out;
  const j = await cached('px:' + need.slice().sort().join(','), 10000, () => get(JUP + '/price/v3?ids=' + need.join(','))); for (const m of need) if (j?.[m]) out[m] = j[m].usdPrice; return out; }

// ---------- wallets (read-only lookups by address; nothing is remembered) ----------
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
async function wallet(addr) {
  const [bal, ...accs] = await Promise.all([rpc('getBalance', [addr]), ...TOKEN_PROGRAMS.map((p) => rpc('getTokenAccountsByOwner', [addr, { programId: p }, { encoding: 'jsonParsed' }]).catch(() => ({ value: [] })))]);
  const tokens = accs.flatMap((a) => a.value || []).map((a) => { const i = a.account.data.parsed.info; return { mint: i.mint, raw: i.tokenAmount.amount, amount: +i.tokenAmount.uiAmountString, decimals: i.tokenAmount.decimals }; }).filter((t) => t.amount > 0);
  const px = await prices([SOL, ...tokens.map((t) => t.mint)]).catch(() => ({}));
  for (const t of tokens) { t.price = px[t.mint] ?? null; t.usd = t.price != null ? t.price * t.amount : null; }
  return { address: addr, lamports: bal.value, sol: bal.value / 1e9, solUsd: px[SOL] ?? null, tokens: tokens.sort((a, b) => (b.usd || 0) - (a.usd || 0)) };
}
async function balances(addrs) { const r = await rpc('getMultipleAccounts', [addrs, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }]); return Object.fromEntries(addrs.map((a, i) => [a, r.value[i]?.lamports || 0])); }

// ---------- trade relay ----------
async function quote(q) {
  const u = new URLSearchParams({ inputMint: q.in, outputMint: q.out, amount: String(q.amount), slippageBps: String(Math.min(5000, Math.max(1, +q.slip || 100))), restrictIntermediateTokens: 'true' });
  if (FEE_BPS && FEE_ACCOUNT) u.set('platformFeeBps', String(FEE_BPS));
  return get(JUP + '/swap/v1/quote?' + u);
}
async function swapTx(b) {
  const tip = Math.min(5_000_000, Math.max(1000, +b.tip || 100_000));
  const j = await get(JUP + '/swap/v1/swap', { body: { quoteResponse: b.quote, userPublicKey: b.user, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, dynamicSlippage: false, ...(FEE_BPS && FEE_ACCOUNT ? { feeAccount: FEE_ACCOUNT } : {}),
    prioritizationFeeLamports: b.shield ? { jitoTipLamports: tip } : { priorityLevelWithMaxLamports: { maxLamports: tip, priorityLevel: 'high' } } }, timeout: 20000 });
  if (!j?.swapTransaction) throw new Error(j?.error || 'No route for this trade'); return { tx: j.swapTransaction, lastValid: j.lastValidBlockHeight };
}
async function send(b) {
  if (b.shield) { const j = await get(JITO + '?bundleOnly=true', { body: { jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [b.tx, { encoding: 'base64' }] }, timeout: 15000 }).catch((e) => { const x = new Error('The private lane did not take the order: ' + e.message); x.status = 502; x.lane = true; throw x; });
    if (j?.error) { const x = new Error('The private lane did not take the order: ' + (j.error.message || 'rejected')); x.status = 502; x.lane = true; throw x; } return { sig: j.result, lane: 'private' }; }
  return { sig: await rpc('sendTransaction', [b.tx, { encoding: 'base64', skipPreflight: false, maxRetries: 5 }]), lane: 'open' };
}

// ---------- mist route: move value in through NEAR Intents so the receiving wallet is paid by the route, not by the sender ----------
const routeTokens = () => cached('route:tokens', 300000, async () => { const j = await get(ONE + '/v0/tokens'); const want = ['SOL', 'USDC', 'USDT', 'ETH', 'BTC', 'ZEC', 'BNB', 'NEAR', 'XRP', 'DOGE', 'TRX', 'SUI', 'LTC', 'TON', 'AVAX', 'POL'];
  return j.filter((t) => want.includes(t.symbol) && t.price).map((t) => ({ id: t.assetId, symbol: t.symbol, chain: t.blockchain, decimals: t.decimals, price: t.price })).sort((a, b) => want.indexOf(a.symbol) - want.indexOf(b.symbol) || rank(a.chain) - rank(b.chain) || a.chain.localeCompare(b.chain)); });
const CHAINS = ['sol', 'eth', 'base', 'arb', 'bsc', 'btc', 'zec', 'near', 'tron', 'op', 'pol', 'avax', 'sui', 'ton'], rank = (c) => { const i = CHAINS.indexOf(c); return i < 0 ? 99 : i; };
const units = (amt, dec) => { const [a, b = ''] = String(amt).split('.'); return (BigInt(a || '0') * 10n ** BigInt(dec) + BigInt((b + '0'.repeat(dec)).slice(0, dec) || '0')).toString(); };
async function routeQuote(b) {
  const list = await routeTokens(), from = list.find((t) => t.id === b.asset); if (!from) { const e = new Error('Unknown asset'); e.status = 400; throw e; }
  const order = !!b.order, amount = b.raw ? String(b.raw) : units(b.amount, from.decimals);
  const body = { dry: !order, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: from.id, depositType: 'ORIGIN_CHAIN', destinationAsset: SOL_ASSET, amount, deadline: new Date(Date.now() + 2 * 3600e3).toISOString(),
    ...(order ? { refundTo: String(b.refundTo), refundType: 'ORIGIN_CHAIN', recipient: String(b.recipient), recipientType: 'DESTINATION_CHAIN' } : { refundTo: 'intents.near', refundType: 'INTENTS', recipient: 'intents.near', recipientType: 'INTENTS' }), ...(ROUTE_FEE_TO && ROUTE_FEE_BPS ? { appFees: [{ recipient: ROUTE_FEE_TO, fee: ROUTE_FEE_BPS }] } : {}) };
  const j = await get(ONE + '/v0/quote', { body, timeout: 20000 }); const q = j.quote;
  return { from: from.symbol, chain: from.chain, amountIn: q.amountInFormatted, amountInRaw: q.amountIn, out: q.amountOutFormatted, minOut: (+q.minAmountOut / 1e9).toString(), usd: q.amountInUsd, eta: q.timeEstimate, ...(order ? { deposit: q.depositAddress, memo: q.depositMemo || '', expires: q.deadline } : {}) };
}
async function routeStatus(dep) { const j = await get(ONE + '/v0/status?depositAddress=' + encodeURIComponent(dep)); const d = j.swapDetails || {}; return { status: j.status, out: d.amountOutFormatted || '', refunded: d.refundedAmountFormatted && d.refundedAmountFormatted !== '0' ? d.refundedAmountFormatted : '', txs: (d.destinationChainTxHashes || []).map((t) => t.hash) }; }

// ---------- image relay (so token pictures do not expose visitors to image hosts) ----------
const IMG_HOSTS = /(^|\.)(dexscreener\.com|geckoterminal\.com|coingecko\.com|ipfs\.io|pinata\.cloud|arweave\.net|pump\.fun|irys\.xyz|cf-ipfs\.com|nftstorage\.link|dweb\.link|w3s\.link|jup\.ag|githubusercontent\.com)$/i, imgs = new Map();
async function image(u) {
  let url; try { url = new URL(u); } catch { return null; } if (url.protocol !== 'https:' || !IMG_HOSTS.test(url.hostname)) return null;
  const hit = imgs.get(u); if (hit) return hit;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' }); const type = r.headers.get('content-type') || ''; if (!r.ok || !/^image\/(png|jpe?g|webp|gif|avif)/.test(type)) return null;
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 1_500_000) return null;
  if (imgs.size > 600) imgs.delete(imgs.keys().next().value); const v = { type, buf }; imgs.set(u, v); return v;
}

// ---------- http ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const PAGES = { '/': 'index.html', '/app': 'app.html', '/docs': 'docs.html' };
const SEC = { 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'permissions-policy': 'interest-cohort=(), geolocation=(), camera=(), microphone=()',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC }); res.end(JSON.stringify(body)); };
function file(res, name, code = 200) {
  const p = path.join(CLIENT, name); if (!p.startsWith(CLIENT)) return false; let buf; try { buf = fs.readFileSync(p); } catch { return false; }
  const ext = path.extname(p); res.writeHead(code, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'public, max-age=300', ...SEC }); res.end(buf); return true;
}
const readBody = (req) => new Promise((ok, bad) => { let n = 0; const parts = []; req.on('data', (d) => { n += d.length; if (n > 200_000) { bad(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } else parts.push(d); }); req.on('end', () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {}); } catch { bad(Object.assign(new Error('Bad request body'), { status: 400 })); } }); req.on('error', bad); });
// rate limit keyed by a salted hash that changes on every start; the address itself is never kept
const SALT = crypto.randomBytes(16), hits = new Map(); setInterval(() => hits.clear(), 60_000).unref();
const limited = (req, cost) => { const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); const k = crypto.createHash('sha256').update(SALT).update(ip).digest('base64').slice(0, 12); const n = (hits.get(k) || 0) + cost; hits.set(k, n); return n > 600; };
const need = (cond, msg) => { if (!cond) throw Object.assign(new Error(msg), { status: 400 }); };

async function api(req, res, url) {
  const p = url.pathname, q = url.searchParams, m = req.method;
  if (limited(req, m === 'POST' ? 3 : 1)) return json(res, 429, { error: 'Slow down for a moment' });
  if (p === '/api/config') return json(res, 200, { ...SITE, fee: FEE_BPS && FEE_ACCOUNT ? FEE_BPS : 0, sol: await solPrice().catch(() => null) });
  if (p === '/api/discover') { const tab = ['trending', 'new', 'gainers'].includes(q.get('tab')) ? q.get('tab') : 'trending', tf = TF[q.get('tf')] ? q.get('tf') : 'h24'; return json(res, 200, { rows: await discover(tab, tf), sol: await solPrice().catch(() => null) }); }
  if (p === '/api/search') { const s = (q.get('q') || '').trim().slice(0, 60); need(s.length >= 2, 'Type at least two characters'); return json(res, 200, { rows: await search(s) }); }
  let mm;
  if ((mm = p.match(/^\/api\/token\/([^/]+)$/))) { need(B58.test(mm[1]), 'Not a token address'); const [t, s] = await Promise.all([token(mm[1]), supplyInfo(mm[1]).catch(() => null)]); return json(res, 200, { ...t, info: s }); }
  if ((mm = p.match(/^\/api\/ohlcv\/([^/]+)$/))) { need(B58.test(mm[1]), 'Not a pool address'); const mint = B58.test(q.get('mint') || '') ? q.get('mint') : ''; return json(res, 200, { candles: await ohlcv(mm[1], AGG[q.get('tf')] ? q.get('tf') : '15m', mint) }); }
  if ((mm = p.match(/^\/api\/trades\/([^/]+)$/))) { need(B58.test(mm[1]), 'Not a pool address'); return json(res, 200, { trades: await trades(mm[1], B58.test(q.get('mint') || '') ? q.get('mint') : '') }); }
  if ((mm = p.match(/^\/api\/wallet\/([^/]+)$/))) { need(B58.test(mm[1]), 'Not a wallet address'); return json(res, 200, await wallet(mm[1])); }
  if (p === '/api/balances' && m === 'POST') { const b = await readBody(req); need(Array.isArray(b.addrs) && b.addrs.length <= 100 && b.addrs.every((a) => B58.test(a)), 'Bad address list'); return json(res, 200, { lamports: b.addrs.length ? await balances(b.addrs) : {}, sol: await solPrice().catch(() => null) }); }
  if (p === '/api/prices' && m === 'POST') { const b = await readBody(req); need(Array.isArray(b.mints) && b.mints.every((a) => B58.test(a)), 'Bad mint list'); return json(res, 200, await prices(b.mints)); }
  if (p === '/api/quote') { need(B58.test(q.get('in') || '') && B58.test(q.get('out') || '') && /^\d{1,24}$/.test(q.get('amount') || ''), 'Bad quote request'); return json(res, 200, await quote({ in: q.get('in'), out: q.get('out'), amount: q.get('amount'), slip: q.get('slip') })); }
  if (p === '/api/swap' && m === 'POST') { const b = await readBody(req); need(b.quote && B58.test(b.user || ''), 'Bad swap request'); return json(res, 200, await swapTx(b)); }
  if (p === '/api/send' && m === 'POST') { const b = await readBody(req); need(typeof b.tx === 'string' && b.tx.length < 4000 && /^[A-Za-z0-9+/=]+$/.test(b.tx), 'Bad transaction'); return json(res, 200, await send(b)); }
  if (p === '/api/blockhash') { const r = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]); return json(res, 200, r.value); }
  if (p === '/api/status') { const sigs = (q.get('sigs') || '').split(',').filter((s) => /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(s)).slice(0, 20); need(sigs.length, 'No signatures'); const r = await rpc('getSignatureStatuses', [sigs, { searchTransactionHistory: true }]); return json(res, 200, { statuses: r.value.map((s) => (s ? { state: s.err ? 'failed' : s.confirmationStatus, err: s.err ? JSON.stringify(s.err) : '' } : null)) }); }
  if (p === '/api/route/tokens') return json(res, 200, { tokens: await routeTokens() });
  if (p === '/api/route/quote' && m === 'POST') { const b = await readBody(req); need(typeof b.asset === 'string' && (/^\d+(\.\d+)?$/.test(String(b.amount || '')) || /^\d+$/.test(String(b.raw || ''))), 'Bad amount'); if (b.order) need(B58.test(b.recipient || '') && typeof b.refundTo === 'string' && b.refundTo.length > 10 && b.refundTo.length < 120, 'A refund address on the sending chain is required'); return json(res, 200, await routeQuote(b)); }
  if (p === '/api/route/status') { const d = q.get('deposit') || ''; need(d.length > 10 && d.length < 120, 'Bad deposit address'); return json(res, 200, await routeStatus(d)); }
  if (p === '/api/img') { const v = await image(q.get('u') || '').catch(() => null); if (!v) { res.writeHead(404, { 'cache-control': 'public, max-age=600', ...SEC }); return res.end(); } res.writeHead(200, { 'content-type': v.type, 'cache-control': 'public, max-age=86400', ...SEC }); return res.end(v.buf); }
  return json(res, 404, { error: 'Not found' });
}

http.createServer(async (req, res) => {
  let url; try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end('bad request'); }
  try {
    if (url.pathname === '/healthz') return json(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    const name = PAGES[url.pathname] || (url.pathname.startsWith('/t/') ? 'app.html' : decodeURIComponent(url.pathname).replace(/^\/+/, ''));
    if (!name.includes('..') && file(res, name)) return;
    file(res, '404.html', 404) || json(res, 404, { error: 'Not found' });
  } catch (e) { const code = e.status && e.status >= 400 && e.status < 500 ? e.status : e.lane ? 409 : e.rpc ? 400 : 503; if (!res.headersSent) json(res, code, { error: e.message || 'Something went wrong on our side', ...(e.lane ? { lane: true } : {}), ...(code === 503 ? { retry: true } : {}) }); else res.end(); }
}).listen(PORT, () => console.log(`mist relay on http://localhost:${PORT}`));
