// PnL card: drawn in the tab from your own fills. It carries the result and never the wallet.
// d: { symbol, inSol, outSol, valueSol, solUsd, since }   o: { theme: 'violet'|'mint'|'mono', amounts: bool, tag: string }
const THEMES = {
  violet: { bg: ['#1a0f3a', '#06040c'], glow: ['rgba(124,58,237,.75)', 'rgba(217,70,239,.45)'], ink: '#f6f2ff', dim: '#b1a6d2', acc: '#a78bfa' },
  mint: { bg: ['#06241c', '#04070a'], glow: ['rgba(16,185,129,.6)', 'rgba(56,189,248,.35)'], ink: '#effdf7', dim: '#9cc9b9', acc: '#6fe3b1' },
  mono: { bg: ['#17171a', '#050506'], glow: ['rgba(255,255,255,.2)', 'rgba(160,160,170,.16)'], ink: '#fafafa', dim: '#a1a1aa', acc: '#e4e4e7' },
};
export const PNL_THEMES = Object.keys(THEMES);
const UP = '#6fe3b1', DOWN = '#ff6d94';
const sol = (n) => (Math.abs(n) >= 100 ? n.toFixed(1) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(4));
const usd = (n) => '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 });
const held = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };

export function drawPnl(cv, d, o = {}) {
  const W = 1200, H = 675, T = THEMES[o.theme] || THEMES.violet, g = cv.getContext('2d'); cv.width = W; cv.height = H;
  const pnl = d.outSol + d.valueSol - d.inSol, pct = d.inSol > 0 ? pnl / d.inSol * 100 : 0, win = pnl >= 0, C = win ? UP : DOWN, F = "'Bricolage', system-ui, sans-serif", M = "'Geist Mono', ui-monospace, monospace";
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, T.bg[0]); bg.addColorStop(1, T.bg[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of [[W * 0.82, H * 0.18, 520, T.glow[0]], [W * 0.1, H * 1.02, 460, T.glow[1]]]) { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(0, 0, W, H); }
  // a faint tape that ends where the trade ended
  let s = [...d.symbol].reduce((a, ch) => a + ch.charCodeAt(0), 7) * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  let p = 0.5; g.lineWidth = 2; for (let i = 0; i < 34; i++) { const o0 = p, drift = (rnd() - 0.5) * 0.11 + (win ? 0.012 : -0.012); p = Math.min(0.95, Math.max(0.05, p + drift)); const up = p >= o0, x = 640 + i * 16.5, y0 = 600 - o0 * 420, y1 = 600 - p * 420;
    g.globalAlpha = 0.2 + 0.25 * (i / 34); g.fillStyle = g.strokeStyle = up ? UP : DOWN; g.beginPath(); g.moveTo(x + 5, Math.min(y0, y1) - 8 * rnd()); g.lineTo(x + 5, Math.max(y0, y1) + 8 * rnd()); g.stroke(); g.fillRect(x, Math.min(y0, y1), 10, Math.max(3, Math.abs(y1 - y0))); } g.globalAlpha = 1;
  // brand
  g.strokeStyle = T.acc; g.lineWidth = 5; g.lineCap = 'round'; [[70, 62, 104, 1], [64, 76, 94, 0.55], [76, 90, 110, 0.28]].forEach(([a, y, b, al]) => { g.globalAlpha = al; g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.stroke(); }); g.globalAlpha = 1;
  g.fillStyle = T.ink; g.font = `700 30px ${F}`; g.textBaseline = 'middle'; g.fillText('M I S T', 126, 77);
  g.font = `400 15px ${M}`; g.fillStyle = T.dim; g.textAlign = 'right'; g.fillText('T R A D E   U N S E E N', W - 64, 77); g.textAlign = 'left';
  // the trade
  g.fillStyle = T.dim; g.font = `400 18px ${M}`; g.fillText((o.tag || 'POSITION').toUpperCase().split('').join(' '), 66, 176);
  g.fillStyle = T.ink; g.font = `800 92px ${F}`; g.fillText('$' + d.symbol.slice(0, 12), 62, 248);
  g.fillStyle = C; g.font = `800 ${Math.abs(pct) >= 10000 ? 150 : 178}px ${F}`; g.shadowColor = C; g.shadowBlur = 50; g.fillText((win ? '+' : '−') + (Math.abs(pct) >= 1000 ? Math.round(Math.abs(pct)).toLocaleString('en-US') : Math.abs(pct).toFixed(1)) + '%', 56, 396); g.shadowBlur = 0;
  const rows = o.amounts === false ? [['Held', held(Date.now() - (d.since || Date.now()))], ['Result', win ? 'In profit' : 'In loss']] : [['Bought', sol(d.inSol) + ' SOL'], [d.valueSol > 0 ? 'Now worth' : 'Sold for', sol(d.outSol + d.valueSol) + ' SOL'], ['PnL', (win ? '+' : '−') + sol(Math.abs(pnl)) + ' SOL' + (d.solUsd ? '  ' + (win ? '+' : '−') + usd(pnl * d.solUsd) : '')]];
  rows.forEach(([k, v], i) => { const x = 66 + i * 300; g.fillStyle = T.dim; g.font = `400 15px ${M}`; g.fillText(k.toUpperCase().split('').join(' '), x, 516); g.fillStyle = i === 2 ? C : T.ink; g.font = `500 27px ${M}`; g.fillText(v, x, 554); });
  // the point of the card
  g.font = `400 15px ${M}`; const tag = 'W A L L E T   H I D D E N', tw = g.measureText(tag).width + 44; g.strokeStyle = T.acc; g.lineWidth = 1.5; g.globalAlpha = 0.7; g.beginPath(); g.roundRect(64, 606, tw, 38, 19); g.stroke(); g.globalAlpha = 1; g.fillStyle = T.acc; g.fillText(tag, 86, 626);
  g.fillStyle = T.dim; g.textAlign = 'right'; g.fillText('m i s t t e r m i n a l . x y z', W - 64, 626); g.textAlign = 'left';
  return { pnl, pct };
}
