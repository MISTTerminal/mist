// Hero: a live tape sits behind the headline and a bank of mist rolls over both. The cursor clears the mist where it passes.
const hero = document.getElementById('hero'), tape = document.getElementById('tape'), mist = document.getElementById('mist');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the tape: an endless candle chart drifting left ----------
const tg = tape.getContext('2d'); let candles = [], px = 100, W = 0, H = 0, dpr = 1;
const next = () => { const o = px, drift = (Math.random() - 0.47) * 5, c = Math.max(20, o + drift), h = Math.max(o, c) + Math.random() * 2.4, l = Math.min(o, c) - Math.random() * 2.4; px = c; return { o, c, h, l }; };
function size() { dpr = Math.min(2, window.devicePixelRatio || 1); W = hero.clientWidth; H = hero.clientHeight; for (const cv of [tape, mist]) { cv.width = W * dpr; cv.height = H * dpr; } if (gl) gl.viewport(0, 0, mist.width, mist.height); const n = Math.ceil(W / 22) + 4; while (candles.length < n) candles.push(next()); }
let shift = 0;
function drawTape(dt) {
  shift += dt * 0.012; if (shift >= 22) { shift -= 22; candles.shift(); candles.push(next()); }
  tg.setTransform(dpr, 0, 0, dpr, 0, 0); tg.clearRect(0, 0, W, H); const lo = Math.min(...candles.map((c) => c.l)), hi = Math.max(...candles.map((c) => c.h)), y = (v) => H * 0.14 + (hi - v) / (hi - lo) * H * 0.72;
  candles.forEach((c, i) => { const x = i * 22 - shift, up = c.c >= c.o; tg.fillStyle = tg.strokeStyle = up ? 'rgba(111,227,177,.9)' : 'rgba(255,109,148,.9)'; tg.lineWidth = 1.5; tg.beginPath(); tg.moveTo(x + 7, y(c.h)); tg.lineTo(x + 7, y(c.l)); tg.stroke(); tg.fillRect(x, Math.min(y(c.o), y(c.c)), 14, Math.max(2, Math.abs(y(c.o) - y(c.c)))); });
}

// ---------- the mist ----------
const gl = mist.getContext('webgl', { premultipliedAlpha: false, alpha: true });
const N = 24, trail = new Float32Array(N * 3).fill(-9); let head = 0, prog, uT, uR, uTrail;
if (gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision highp float;uniform float t;uniform vec2 r;uniform vec3 tr[${N}];
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<6;i++){s+=a*n(p);p=p*2.03+vec2(11.3,7.1);a*=.5;}return s;}
    void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=vec2(uv.x*r.x/r.y,uv.y);
      vec2 w=vec2(fbm(p*1.6+vec2(t*.035,t*.012)),fbm(p*1.6+vec2(-t*.02,t*.03)+5.2));
      float d=fbm(p*2.1+w*1.7+vec2(t*.05,0.));
      float dens=smoothstep(.22,.74,d)*.94+.05;
      dens*=mix(.72,1.,smoothstep(.0,.5,abs(uv.y-.52)));            // thinner across the headline so it reads
      float clear=0.;for(int i=0;i<${N};i++){vec3 m=tr[i];if(m.z<0.)continue;vec2 q=vec2(m.x*r.x/r.y,m.y);float rad=.2+.07*fbm(p*6.+m.z);clear=max(clear,(1.-smoothstep(rad*.35,rad,distance(p,q)))*(1.-smoothstep(.0,2.6,m.z)));}
      dens*=1.-clear;
      float lum=smoothstep(.3,.85,d+w.x*.25);
      vec3 col=mix(vec3(.018,.012,.045),vec3(.30,.17,.62),lum);col=mix(col,vec3(.72,.42,.98),pow(lum,4.)*.55);
      col+=vec3(.55,.3,.95)*clear*.0;
      gl_FragColor=vec4(col,clamp(dens,0.,1.));}`));
  gl.linkProgram(prog); gl.useProgram(prog); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  uT = gl.getUniformLocation(prog, 't'); uR = gl.getUniformLocation(prog, 'r'); uTrail = gl.getUniformLocation(prog, 'tr'); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
} else mist.style.background = 'radial-gradient(ellipse at 50% 55%, rgba(124,58,237,.12), rgba(6,4,12,.85))';
let lastDrop = 0;
function drop(x, y) { const now = performance.now(); if (now - lastDrop < 28) return; lastDrop = now; trail[head * 3] = x; trail[head * 3 + 1] = y; trail[head * 3 + 2] = 0; head = (head + 1) % N; }
hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); drop((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height); });
// with no cursor (phones, or before the first move) a slow sweep clears the headline on its own
let touched = false; hero.addEventListener('pointermove', () => { touched = true; }, { once: true });

let last = performance.now(), visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);
function frame(now) {
  const dt = Math.min(50, now - last); last = now;
  if (visible) { drawTape(still ? 0 : dt);
    if (!touched) { const s = now / 1000; drop(0.5 + 0.36 * Math.sin(s * 0.55), 0.52 + 0.2 * Math.sin(s * 0.9)); }
    for (let i = 0; i < N; i++) if (trail[i * 3 + 2] >= 0) trail[i * 3 + 2] += dt / 1000;
    if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1f(uT, still ? 12 : now / 1000); gl.uniform2f(uR, mist.width, mist.height); gl.uniform3fv(uTrail, trail); gl.drawArrays(gl.TRIANGLES, 0, 3); } }
  requestAnimationFrame(frame);
}
size(); window.addEventListener('resize', size); requestAnimationFrame(frame);

// ---------- below the fold ----------
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
document.querySelectorAll('.band > *, .four article, .steps li, .cmp tbody tr').forEach((el, i) => { el.classList.add('rise'); el.style.transitionDelay = (i % 5) * 60 + 'ms'; io.observe(el); });
// the statement lights up word by word as it crosses the screen
const words = document.getElementById('words');
if (words) { const KEY = /^(MIST|wallet|thread|trades|trader\.?)$/; words.innerHTML = words.textContent.trim().split(/\s+/).map((w) => `<span${KEY.test(w) ? ' class="k"' : ''}>${w}</span>`).join(' '); const spans = [...words.children];
  const light = () => { const r = words.getBoundingClientRect(), p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height + innerHeight * 0.35))); spans.forEach((s, i) => s.classList.toggle('lit', i < p * spans.length + 0.5)); }; addEventListener('scroll', light, { passive: true }); light(); }
// live tokens from the terminal's own feed
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (n >= 1 ? '$' + n.toFixed(2) : n >= 0.001 ? '$' + n.toFixed(5) : '$' + n.toPrecision(3));
fetch('/api/discover?tab=trending&tf=h24').then((r) => r.json()).then(({ rows }) => { if (!rows?.length) throw 0;
  const chip = (t) => `<a class="tick" href="/app#/t/${esc(t.mint)}"><span class="av">${t.image ? `<img src="${esc(t.image)}" alt="" loading="lazy">` : esc(t.symbol.slice(0, 2))}</span><b>${esc(t.symbol)}</b><span>${money(t.price)}</span><span class="${t.chg.h24 >= 0 ? 'up' : 'down'}">${t.chg.h24 >= 0 ? '+' : ''}${(t.chg.h24 ?? 0).toFixed(1)}%</span></a>`;
  const half = Math.ceil(rows.length / 2), a = rows.slice(0, half).map(chip).join(''), b = rows.slice(half).map(chip).join(''); document.getElementById('m1').innerHTML = a + a; document.getElementById('m2').innerHTML = b + b;
}).catch(() => { document.getElementById('live').hidden = true; });
document.addEventListener('error', (e) => { if (e.target?.tagName === 'IMG' && e.target.parentElement?.classList.contains('av')) e.target.remove(); }, true);
fetch('/api/config').then((r) => r.json()).then((c) => {
  if (c.x) { const x = document.getElementById('xlink'); x.href = c.x; x.hidden = false; }
  if (c.gh) { const g = document.getElementById('ghlink'); g.href = c.gh; g.hidden = false; }
  if (c.mint) { document.getElementById('ca').textContent = c.mint; document.getElementById('calead').textContent = '$MIST is live on Solana. This is the only contract address; copy it from here or open it straight in the terminal.'; const tb = document.getElementById('tradebtn'); tb.href = '/app#/t/' + c.mint; tb.hidden = false; const b = document.getElementById('cabtn'); b.hidden = false; b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(c.mint); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); } catch {} }); }
}).catch(() => {});
