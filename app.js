"use strict";

const $ = (s, r = document) => r.querySelector(s);

/* ---------- colormaps ---------- */
const poly = (c, t) => c.map(k => k.reduceRight((a, b) => a * t + b, 0));
const CM = {
  turbo: t => [0.13572138 + t * (4.6153926 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943)))),
    0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604)))),
    0.1066733 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))],
  inferno: t => poly([[0.0002189, 0.1065134, 11.6024931, -41.7039961, 77.1629357, -71.3194282, 25.1311262], [0.001651, 0.5639564, -3.9728531, 17.4363995, -33.4023589, 32.6260642, -12.242659], [-0.0195483, 3.9327123, -15.9423941, 44.3541452, -81.8073092, 73.2095198, -23.070325]], t),
  viridis: t => poly([[0.2777273, 0.1050930, -0.3308618, -4.6342305, 6.2282699, 4.7763850, -5.4354559], [0.0054073, 1.4046135, 0.2148476, -5.7991010, 14.1799334, -13.7451454, 4.6458526], [0.3340998, 1.3845902, 0.0950952, -19.3324410, 56.6905526, -65.3530326, 26.3124352]], t),
  rdbu: t => { const a = [33, 102, 172], m = [247, 247, 247], b = [178, 24, 43]; const [p, q, u] = t < 0.5 ? [a, m, t * 2] : [m, b, (t - 0.5) * 2]; return p.map((v, i) => (v + (q[i] - v) * u) / 255); }
};
const rgb = (f, t) => f(Math.max(0, Math.min(1, t))).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255));

const SUP = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = n => String(n).split("").map(c => SUP[c] ?? c).join("");
const sci = x => {
  if (!isFinite(x) || x <= 0) return "0";
  const e = Math.floor(Math.log10(x)), m = x / 10 ** e;
  return `${m.toFixed(1)}×10${sup(e)}`;
};
const volt = v => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} V`;

const Q = {
  logn: { label: "전자 농도", unit: "cm⁻³, 로그 눈금", cm: CM.turbo, regs: [2, 3], fmt: v => `${sci(10 ** v)} cm⁻³`, tick: v => `10${sup(Math.round(v))}` },
  psi: { label: "전위", unit: "V, 소스 기준", cm: CM.viridis, regs: [1, 2, 3, 4, 5], fmt: v => `${v.toFixed(2)} V`, tick: v => `${v.toFixed(1)} V` },
  emag: { label: "전기장 세기", unit: "MV/cm", cm: CM.inferno, regs: [1, 2, 3, 4, 5], fmt: v => `${v.toFixed(2)} MV/cm`, tick: v => `${v.toFixed(0)}` },
  pol: { label: "HZO 분극", unit: "μC/cm², 양수는 채널 쪽", cm: CM.rdbu, regs: [4], fmt: v => `${v > 0 ? "+" : ""}${v.toFixed(1)} μC/cm²`, tick: v => `${v > 0 ? "+" : ""}${v.toFixed(0)}` }
};
const LUT = {};
const lut = q => (LUT[q] ||= Array.from({ length: 255 }, (_, k) => rgb(Q[q].cm, k / 254)));

const PAPER = [220, 213, 198];
const MAT = { 1: [196, 205, 214], 2: [166, 123, 192], 3: [94, 168, 155], 4: [224, 143, 93], 5: [214, 221, 229], 6: [104, 111, 125] };
const dim = c => MAT[c].map((v, i) => Math.round(v * 0.42 + PAPER[i] * 0.58));

/* ---------- data ---------- */
let R, G, M, REG, REGN;
const cache = new Map();
const st = { q: "logn", f: 16, timer: null, hover: null };

async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (typeof DecompressionStream === "undefined") throw new Error("nostream");
  const s = new Blob([bin]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function frame(i, q) {
  const k = `${i}:${q}`;
  if (!cache.has(k)) cache.set(k, inflate(M.snaps[i][q]));
  return cache.get(k);
}

/* ---------- cross-section ---------- */
const canvas = $("#map");
let geo = null, base = null;
const near = (arr, v) => { let lo = 0, hi = arr.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid; } return v - arr[lo] <= arr[hi] - v ? lo : hi; };
const inWL = z => G.wl.some(([a, b]) => z >= a && z <= b);
function codeAt(r, z, iy, ix) {
  if (r > G.r3 + 1e-6 && inWL(z)) return 6;
  const c = REG[iy * M.nx + ix];
  return c === 0 ? (r > G.r3 ? 5 : 1) : c;
}

function layout() {
  const W = Math.round(canvas.parentElement.clientWidth);
  const left = 52, right = 10, top = 10, bot = 10, sx = 2;
  const physW = 2 * G.r4 * sx;
  const plotW = W - left - right, plotH = Math.round(plotW * G.ztop / physW);
  const H = plotH + top + bot, dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.height = H + "px";
  geo = { W, H, left, top, plotW, plotH, physW, sx, dpr };
}

async function drawMap() {
  const q = st.q, i = st.f;
  let data;
  try { data = await frame(i, q); } catch (e) { fail(); return; }
  if (q !== st.q || i !== st.f) return;
  if (!geo) layout();
  const { plotW, plotH, physW, sx, dpr } = geo;
  const pw = Math.round(plotW * dpr), ph = Math.round(plotH * dpr);
  const img = new ImageData(pw, ph), L = lut(q), regs = Q[q].regs;
  const colIx = new Int32Array(pw), colR = new Float64Array(pw);
  for (let x = 0; x < pw; x++) { const xp = ((x + 0.5) / pw) * physW - physW / 2, r = Math.abs(xp) / sx; colR[x] = r; colIx[x] = near(M.r_nm, r); }
  for (let y = 0; y < ph; y++) {
    const z = G.ztop * (1 - (y + 0.5) / ph), iy = near(M.z_nm, z);
    for (let x = 0; x < pw; x++) {
      const code = codeAt(colR[x], z, iy, colIx[x]);
      let col;
      if (regs.includes(code)) { const b = data[iy * M.nx + colIx[x]]; col = b === 255 ? dim(code) : L[b]; }
      else col = dim(code);
      const o = (y * pw + x) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
  }
  base = { img, data, q, i };
  paint();
  updateBar();
  updateReadout();
}

function paint() {
  if (!base || !geo) return;
  const c = canvas.getContext("2d"), { left, top, plotW, plotH, physW, sx, dpr, W, H } = geo;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = "#DCD5C6"; c.fillRect(0, 0, canvas.width, canvas.height);
  c.putImageData(base.img, Math.round(left * dpr), Math.round(top * dpr));
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const Xr = r => left + plotW / 2 + r * sx * plotW / physW, Zy = z => top + plotH * (1 - z / G.ztop);
  c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,0.55)";
  for (const rr of [G.rc, G.rb, G.r2, G.r3]) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(Xr(s * rr), top); c.lineTo(Xr(s * rr), top + plotH); c.stroke(); }
  c.setLineDash([3, 4]); c.strokeStyle = "rgba(20,23,28,0.45)";
  c.beginPath(); c.moveTo(Xr(0), top); c.lineTo(Xr(0), top + plotH); c.stroke(); c.setLineDash([]);
  c.font = "600 13px 'Pretendard Variable', Pretendard, sans-serif"; c.textBaseline = "middle"; c.textAlign = "right";
  G.wl.forEach(([a, b], k) => {
    const y = (Zy(a) + Zy(b)) / 2, sel = k === G.sel;
    c.fillStyle = sel ? "#8F520A" : "#6B6F76";
    c.fillText(sel ? "선택 셀" : `WL${k + 1}`, left - 8, y);
    if (sel) { c.fillRect(left - 4, Zy(b), 3, Zy(a) - Zy(b)); }
  });
  if (st.hover) {
    const { x, y } = st.hover;
    c.strokeStyle = "#14171C"; c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "#F1EDE4"; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, 7.5, 0, Math.PI * 2); c.stroke();
  }
}

function updateBar() {
  const q = Q[st.q], sc = M.scales[st.q], L = lut(st.q);
  const stops = Array.from({ length: 9 }, (_, k) => { const c = L[Math.round(k / 8 * 254)]; return `rgb(${c[0]},${c[1]},${c[2]}) ${k * 12.5}%`; });
  $("#cb-grad").style.background = `linear-gradient(90deg, ${stops.join(",")})`;
  $("#cb-lo").textContent = q.tick(sc[0]);
  $("#cb-hi").textContent = q.tick(sc[1]);
  $("#cb-unit").textContent = `${q.label} (${q.unit})`;
  canvas.setAttribute("aria-label", `${frameLabel(st.f)}, ${q.label} 단면`);
}

function pick(ev) {
  if (!geo) return;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  const { left, top, plotW, plotH, physW, sx } = geo;
  if (x < left || x > left + plotW || y < top || y > top + plotH) return;
  st.hover = { x, y };
  paint(); updateReadout();
}
function updateReadout() {
  const out = $("#readout");
  if (!st.hover || !base) return;
  const { left, top, plotW, plotH, physW, sx } = geo, { x, y } = st.hover;
  const r = Math.abs(((x - left) / plotW) * physW - physW / 2) / sx, z = G.ztop * (1 - (y - top) / plotH);
  const iy = near(M.z_nm, z), ix = near(M.r_nm, r), code = codeAt(r, z, iy, ix);
  const q = Q[st.q], where = `${REGN[code]} (반지름 ${r.toFixed(0)} nm, 높이 ${z.toFixed(0)} nm)`;
  let val = "이 층은 이 물리량을 계산하지 않음";
  if (q.regs.includes(code)) {
    const b = base.data[iy * M.nx + ix], sc = M.scales[st.q];
    if (b !== 255) val = q.fmt(sc[0] + (sc[1] - sc[0]) * b / 254);
  }
  out.textContent = `${where}: ${val}`;
}

/* ---------- I–V chart ---------- */
const NS = "http://www.w3.org/2000/svg";
const CH = { W: 560, H: 320, L: 66, R: 16, T: 14, B: 44 };
const cx = v => CH.L + (v + 5) / 10 * (CH.W - CH.L - CH.R);
const cy = lg => CH.T + (-4 - lg) / 11 * (CH.H - CH.T - CH.B);
const lg = a => Math.log10(Math.max(a, 1e-15));
function el(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }

function drawChart() {
  const svg = $("#iv"); svg.replaceChildren();
  const g = el("g", { "font-family": "'Barlow Condensed', 'Pretendard Variable', sans-serif", "font-size": "17", fill: "#6B6F76" });
  svg.append(g);
  for (let e = -14; e <= -4; e += 2) {
    g.append(el("line", { x1: CH.L, x2: CH.W - CH.R, y1: cy(e), y2: cy(e), stroke: "#CBC3B3", "stroke-width": 1 }));
    g.append(el("text", { x: CH.L - 10, y: cy(e) + 6, "text-anchor": "end" }, `10${sup(e)}`));
  }
  for (let v = -4; v <= 4; v += 2) g.append(el("text", { x: cx(v), y: CH.H - CH.B + 24, "text-anchor": "middle" }, v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`));
  g.append(el("text", { x: CH.W - CH.R, y: CH.H - 4, "text-anchor": "end", "font-family": "'Pretendard Variable', sans-serif", "font-size": "14" }, "게이트 전압 (V)"));
  const m = R.metrics, ith = lg(m.i_th_a || 1e-8);
  g.append(el("line", { x1: CH.L, x2: CH.W - CH.R, y1: cy(ith), y2: cy(ith), stroke: "#6B6F76", "stroke-dasharray": "2 4" }));
  const path = arr => R.vg.map((v, k) => `${k ? "L" : "M"}${cx(v).toFixed(1)},${cy(lg(arr[k])).toFixed(1)}`).join("");
  svg.append(el("path", { d: path(R.id_forward), fill: "none", stroke: "#14171C", "stroke-width": 2.5 }));
  svg.append(el("path", { d: path(R.id_backward), fill: "none", stroke: "#8F520A", "stroke-width": 2.5, "stroke-dasharray": "7 5" }));
  const a = cx(m.vth_program_v), b = cx(m.vth_erase_v), y = cy(ith) - 16;
  const mw = el("g", { stroke: "#14171C", "stroke-width": 1.5 });
  mw.append(el("line", { x1: a, x2: b, y1: y, y2: y }), el("line", { x1: a, x2: a, y1: y - 6, y2: y + 6 }), el("line", { x1: b, x2: b, y1: y - 6, y2: y + 6 }));
  svg.append(mw);
  svg.append(el("text", { x: (a + b) / 2, y: y - 10, "text-anchor": "middle", "font-family": "'Barlow Condensed', sans-serif", "font-size": "20", "font-weight": 700, fill: "#14171C" }, `${m.memory_window_v.toFixed(2)} V`));
  svg.append(el("line", { id: "iv-v", y1: CH.T, y2: CH.H - CH.B, stroke: "#14171C", "stroke-opacity": 0.35, "stroke-dasharray": "3 3" }));
  svg.append(el("circle", { id: "iv-dot", r: 7, stroke: "#F1EDE4", "stroke-width": 2.5 }));
}
function updateChart() {
  const sn = M.snaps[st.f], k = near(R.vg, sn.vg), fw = sn.branch === "forward";
  const x = cx(R.vg[k]), y = cy(lg((fw ? R.id_forward : R.id_backward)[k]));
  const v = $("#iv-v"), d = $("#iv-dot");
  v.setAttribute("x1", x); v.setAttribute("x2", x);
  d.setAttribute("cx", x); d.setAttribute("cy", y); d.setAttribute("fill", fw ? "#14171C" : "#8F520A");
}

/* ---------- controls ---------- */
const frameLabel = i => { const s = M.snaps[i]; return `${s.branch === "forward" ? "정방향" : "역방향"} ${volt(s.vg)}`; };
function setFrame(i) {
  st.f = i; $("#frame").value = i; $("#flabel").textContent = frameLabel(i);
  updateChart(); drawMap();
}
function setQ(q) {
  st.q = q;
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.q === q)));
  drawMap();
  for (let k = 0; k < M.snaps.length; k++) frame(k, q).catch(() => {});
}
function togglePlay() {
  const btn = $("#play");
  if (st.timer) { clearInterval(st.timer); st.timer = null; btn.textContent = "재생"; btn.setAttribute("aria-pressed", "false"); return; }
  btn.textContent = "정지"; btn.setAttribute("aria-pressed", "true");
  st.timer = setInterval(() => setFrame((st.f + 1) % M.snaps.length), 650);
}
function fail() {
  $("#readout").textContent = "이 브라우저에서는 단면을 그릴 수 없습니다. 최신 Chrome, Safari, Edge에서 열어 주세요.";
}

async function initNand() {
  try {
    R = await (await fetch("data/nand.json")).json();
    G = R.geom; M = R.maps;
    REG = await inflate(M.region);
  } catch (e) { fail(); return; }
  REGN = { 1: "코어 SiO₂", 2: R.layers.bk, 3: `${R.layers.ch} 채널`, 4: R.layers.fe, 5: "워드라인 사이 산화막", 6: "워드라인" };
  const m = R.metrics;
  $("#m-mw").textContent = `${m.memory_window_v.toFixed(2)} V`;
  $("#m-onoff").textContent = `${sci(m.on_off)}배`;
  $("#m-sec").textContent = `${Math.round(R.seconds)}초`;
  $("#m-nodes").textContent = m.nodes.toLocaleString("ko-KR");
  $("#frame").max = M.snaps.length - 1;
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => setQ(b.dataset.q)));
  $("#frame").addEventListener("input", e => setFrame(+e.target.value));
  $("#play").addEventListener("click", togglePlay);
  canvas.addEventListener("pointerdown", pick);
  canvas.addEventListener("pointermove", e => { if (e.pointerType === "mouse" || e.buttons) pick(e); });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { layout(); drawMap(); }, 120); });
  layout(); drawChart();
  setFrame(st.f);
  for (let k = 0; k < M.snaps.length; k++) frame(k, st.q).catch(() => {});
}

/* ---------- DOE ---------- */
const T = [80, 120, 160], C = [63, 75, 100], A = [150, 200, 250];
const RUNS = [];
{ let n = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) RUNS.push({ n: ++n, t: i, c: j, a: (i + j) % 3 }); }
const doe = { mode: "9" };
function cond(t, c, a) { return `증착 ${T[t]} ℃, ${C[c]} 사이클, 후열처리 ${A[a]} ℃`; }
function drawDoe() {
  const root = $("#doe-grid"); root.replaceChildren();
  A.forEach((av, a) => {
    const panel = document.createElement("div"); panel.className = "doe-panel";
    const h = document.createElement("h3"); h.textContent = `후열처리 ${av} ℃`; panel.append(h);
    const tb = document.createElement("div"); tb.className = "doe-table";
    const corner = document.createElement("span"); corner.className = "ax row"; corner.textContent = "사이클"; tb.append(corner);
    T.forEach(t => { const s = document.createElement("span"); s.className = "ax"; s.textContent = `${t} ℃`; tb.append(s); });
    C.forEach((cv, c) => {
      const s = document.createElement("span"); s.className = "ax row"; s.textContent = `${cv}`; tb.append(s);
      T.forEach((_, t) => {
        const run = RUNS.find(r => r.t === t && r.c === c && r.a === a);
        const idx = a * 9 + c * 3 + t + 1;
        const b = document.createElement("button"); b.type = "button"; b.className = "cell";
        if (doe.mode === "27") { b.classList.add("all"); b.textContent = String(idx); }
        if (run) { b.classList.add("on"); if (doe.mode === "9") b.textContent = String(run.n); }
        b.setAttribute("aria-label", run ? `${run.n}번 실험, ${cond(t, c, a)}` : cond(t, c, a));
        b.addEventListener("click", () => {
          const out = $("#doe-read");
          if (run) out.textContent = `${run.n}번 실험: ${cond(t, c, a)}`;
          else if (doe.mode === "27") out.textContent = `조합 ${idx}: ${cond(t, c, a)}. 9회 설계에서는 빠지는 조합입니다.`;
          else out.textContent = `${cond(t, c, a)}: 9회 설계에서 빠지는 조합입니다.`;
        });
        tb.append(b);
      });
    });
    panel.append(tb); root.append(panel);
  });
  $("#doe-count").innerHTML = doe.mode === "9" ? "<b>9</b>회, 1회 약 1주 기준 약 9주" : "<b>27</b>회, 1회 약 1주 기준 약 27주";
}
document.querySelectorAll(".doe-ctl button").forEach(b => b.addEventListener("click", () => {
  doe.mode = b.dataset.mode;
  document.querySelectorAll(".doe-ctl button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  drawDoe();
}));

drawDoe();
initNand();
