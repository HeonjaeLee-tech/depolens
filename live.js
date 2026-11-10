/* DepoLens live panel: rotating 3D device, animated IV measurement, 2D heat (or field) map, design warnings, Q&A, data pig.
 * Reads the page state through window.DL (set by the main script). Nothing here is TCAD:
 * IV comes from the page's compact model, heat from a steady-state 2D conduction solve with representative conductivities. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DL = window.DL;
const $ = s => document.querySelector(s);
const num = v => DL.num(v);
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;
const DEVNAME = { fefet: "FeFET", tft: "TFT", mfm: "MFM 커패시터", mim: "MIM 커패시터", custom: "신구조" };
const key = n => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// thermal conductivity, W/m·K, representative thin-film values (cross-plane where it matters)
const KTH = { si: 148, sio2: 1.4, mo: 138, tin: 25, w: 170, ti: 22, pt: 72, au: 315, ni: 90, ito: 4, ru: 60, hzo: 1.0, hfo2: 1.1, zro2: 1.6, al2o3: 1.5, sinx: 2.0, igzo: 1.4, in2o3: 2.0, ga2o3: 5, mos2: 2, teox: 0.6, te: 2, glass: 1.0, pi: 0.2 };
const ROLE_K = { substrate: 148, gate: 60, electrode: 60, ins: 1.5, fe: 1.0, channel: 1.5, player: 1.0, pass: 1.5 };
const kOf = l => KTH[key(l.mat)] ?? ROLE_K[l.role] ?? 1.5;
const K_AIR = 0.026;

/* ================= 3D ================= */
const canvas = $("#lv3d");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(3.6, 2.5, 3.9);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.minDistance = 2.2; controls.maxDistance = 12; controls.autoRotate = !reduced; controls.autoRotateSpeed = 1.4;
controls.enablePan = false;
if (coarse) {
  // on phones the canvas must not trap page scrolling: rotation by touch is opt-in
  controls.enabled = false; canvas.style.touchAction = "pan-y";
  const b = document.createElement("button"); b.type = "button"; b.id = "lv-touch"; b.textContent = "손으로 돌리기"; b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => { controls.enabled = !controls.enabled; canvas.style.touchAction = controls.enabled ? "none" : "pan-y"; b.setAttribute("aria-pressed", String(controls.enabled)); });
  $(".lv-ctl").prepend(b);
}
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad98, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(3, 6, 4); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-4, 2, -3); scene.add(fill);
const group = new THREE.Group(); scene.add(group);
let meshes = [], explode = false, hoverId = null, edHL = null, warnIds = new Set(), heatLevel = 0;

const visH = t => 0.05 + 0.11 * Math.log10(1 + t / 3);
function footprint(l, geo) {
  const L = Math.max(0.5, num(geo.L) || 10), W = Math.max(1, num(geo.W) || 100), Lg = Math.max(0.5, num(geo.Lg) || 16), ov = Math.max(0, num(geo.ov) || 0);
  const pad = Math.max(4, 0.6 * L), spanX = Math.max(Lg, L + 2 * pad, L + 2 * ov) + Math.max(6, 0.5 * L), u = 3.0 / spanX;
  const chZ = spanX * Math.min(0.75, Math.max(0.28, 0.22 + 0.14 * Math.log2(W / L + 1))), subZ = chZ + 0.6 * spanX * 0.35;
  const R = (x0, x1, z) => ({ x0: x0 * u, x1: x1 * u, z0: -z / 2 * u, z1: z / 2 * u });
  switch (l.pat) {
    case "gate": return [R(-Lg / 2, Lg / 2, chZ * 1.15)];
    case "channel": return [R(-(L / 2 + ov), L / 2 + ov, chZ)];
    case "sd": return [R(-(L / 2 + pad), -L / 2, chZ * 1.05), R(L / 2, L / 2 + pad, chZ * 1.05)];
    default: return [R(-spanX / 2, spanX / 2, subZ)];
  }
}
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
function build3D() {
  const S = DL.S;
  for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); m.children.forEach(c => { c.geometry.dispose(); c.material.dispose(); }); }
  group.clear(); meshes = [];
  const placed = [];
  S.layers.forEach((l, i) => {
    const t = Math.max(0.5, num(l.t) || 0), hgt = visH(Math.min(t, 600)) * (l.role === "substrate" ? 1.3 : 1);
    const info = DL.matInfo(l.mat), metal = info?.type === "metal" || l.role === "gate" || l.role === "electrode", isT = l.id === S.targetId;
    for (const r of footprint(l, S.geo)) {
      let base = 0;
      for (const p of placed) if (overlap(p, r)) base = Math.max(base, p.top);
      base += explode && i ? 0.14 : 0;
      const geo = new THREE.BoxGeometry(r.x1 - r.x0, hgt, r.z1 - r.z0);
      const mat = new THREE.MeshStandardMaterial({ color: DL.fillOf(l), roughness: metal ? 0.36 : 0.8, metalness: metal ? 0.45 : 0.03, emissive: 0x000000 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((r.x0 + r.x1) / 2, base + hgt / 2, (r.z0 + r.z1) / 2);
      mesh.userData = { id: l.id, l, i };
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: isT ? 0x8f520a : 0x14171c, transparent: true, opacity: isT ? 0.95 : 0.26 })));
      group.add(mesh); meshes.push(mesh);
      placed.push({ ...r, top: base + hgt });
    }
  });
  const top = placed.reduce((a, p) => Math.max(a, p.top), 0);
  controls.target.set(0, top * 0.42, 0);
}
function resize3D() {
  const w = canvas.clientWidth, hh = canvas.clientHeight; if (!w || !hh) return;
  renderer.setSize(w, hh, false); camera.aspect = w / hh;
  const far = camera.aspect < 1.25 ? 1.45 : 1.05, d = camera.position.length(), want = 5.9 * far;
  if (Math.abs(d - want) > 0.5) camera.position.multiplyScalar(want / d);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize3D).observe(canvas);
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), tip = $("#lv-tip");
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(meshes, false)[0];
  hoverId = hit ? hit.object.userData.id : null;
  if (hit) { const l = hit.object.userData.l; tip.hidden = false; tip.textContent = `${l.mat} ${l.role === "substrate" ? "기판" : `${num(l.t)} nm`}  ${DL.ROLES[l.role] || ""}  ${l.method || ""}`; }
  else tip.hidden = true;
}
canvas.addEventListener("pointermove", e => { if (e.pointerType === "mouse") pick(e); });
canvas.addEventListener("click", pick);
canvas.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { hoverId = null; tip.hidden = true; } });
$("#lv-spin").addEventListener("click", e => { controls.autoRotate = !controls.autoRotate; e.currentTarget.setAttribute("aria-pressed", String(controls.autoRotate)); });
$("#lv-exp").addEventListener("click", e => { explode = !explode; e.currentTarget.setAttribute("aria-pressed", String(explode)); build3D(); });
document.addEventListener("dl:hl", e => { edHL = e.detail; });

/* ================= design warnings ================= */
function checkDesign() {
  const S = DL.S, out = [], L = num(S.geo.L) || 10, Lg = num(S.geo.Lg) || 16, vg = Math.abs(num(S.vg) || 0);
  const g = DL.gateStack();
  S.layers.forEach((l, i) => {
    const k = key(l.mat), t = num(l.t) || 0, info = DL.matInfo(l.mat), id = l.id;
    const add = (title, detail, q) => out.push({ id, title, detail, q });
    if (l.role === "substrate") return;
    if (l.role === "fe" && ["hzo", "hfo2", "zro2", "hf05zr05o2"].includes(k)) {
      if (t < 5) add(`${l.mat} ${t} nm: 분극이 급히 줄어드는 두께`, "5 nm 아래에서는 계면층과 정방정상의 비중이 커져 분극이 크게 줄어듭니다. 모은 HZO 논문에서도 3, 5 nm 값이 낮게 나왔습니다.", "thin");
      if (t > 20) add(`${l.mat} ${t} nm: 강유전성이 사라지기 쉬운 두께`, "20 nm를 넘으면 결정립이 커지며 강유전성이 없는 단사정상이 늘어납니다. 모은 논문 중 40 nm 단일층은 2Pr 2.1 μC/cm²였습니다.", "thick");
    }
    if ((l.role === "channel" || l.role === "player") && t < 3) add(`${l.mat} ${t} nm: 연속막이 안 될 수 있는 두께`, "3 nm 아래 박막은 섬 형태로 자라 막이 끊기기 쉽고, 끊기면 전류 경로가 사라집니다.", "island");
    if ((l.role === "channel" || l.role === "player") && t > 50) add(`${l.mat} ${t} nm: 채널을 끄기 어려운 두께`, "채널이 두꺼우면 게이트 전계가 반대쪽까지 닿지 않아 꺼진 상태에서도 전류가 흐르기 쉽습니다.", "thickch");
    if (l.role === "ins" && k === "sio2" && t < 3 && i > 1) add(`SiO2 ${t} nm: 직접 터널링 누설`, "3 nm 아래 SiO2는 전자가 절연막을 바로 터널링해 누설 전류가 급격히 늘어납니다.", "tunnel");
    if ((l.role === "gate" || l.role === "electrode") && t < 10) add(`${l.mat || "금속"} ${t} nm: 전극 저항이 커지는 두께`, "10 nm 아래 금속막은 표면과 결정립계 산란으로 저항이 커지고 끊기기 쉽습니다.", "metal");
    if (info && info.type === "metal" && ["channel", "fe", "ins", "player"].includes(l.role)) add(`${l.mat}를 ${DL.ROLES[l.role]}으로 지정함`, `${l.mat}는 금속이라 ${DL.ROLES[l.role]} 역할을 할 수 없습니다. 역할이나 물질을 확인하세요.`, "role");
  });
  if (g && !g.err && vg > 0) {
    for (const l of g.diel) {
      const E = 10 * vg / (DL.erOf(l) * g.sumTE), lim = l.role === "fe" ? 4 : key(l.mat) === "sio2" ? 10 : 6;
      if (E > lim) out.push({ id: l.id, title: `${l.mat} 전계 ${E.toFixed(1)} MV/cm @ ${vg} V: 절연 파괴 위험`, detail: `직렬 커패시터로 나눈 ${l.mat} 전계가 ${E.toFixed(1)} MV/cm로, 보통 견디는 ${lim} MV/cm 근처를 넘습니다. 게이트 전압을 낮추거나 막을 두껍게 하세요.`, q: "bd" });
    }
  }
  const gate = S.layers.find(l => l.role === "gate" && l.pat === "gate"), ch = S.layers.some(l => l.pat === "channel");
  if (gate && ch && !DL.isCap() && Lg < L) out.push({ id: gate.id, title: `게이트 ${Lg} μm가 채널 ${L} μm보다 짧음`, detail: "게이트가 덮지 못한 채널 부분은 켜지지 않아 직렬 저항이 되고 전류가 크게 줄어듭니다.", q: "gate" });
  return out;
}
let warnings = [];
function renderWarnings() {
  warnIds = new Set(warnings.map(w => w.id));
  const box = $("#lv-warn"); box.replaceChildren();
  warnings.slice(0, 4).forEach((w, k) => {
    const d = document.createElement("div"); d.className = "w";
    d.innerHTML = `<span aria-hidden="true">!</span><span><b></b></span><button type="button">왜?</button>`;
    d.querySelector("b").textContent = w.title;
    d.querySelector("button").addEventListener("click", () => openQA(`warn:${k}`));
    box.append(d);
  });
}
function renderLegend() {
  const S = DL.S, ol = $("#lv-legend"); ol.replaceChildren();
  [...S.layers].reverse().forEach(l => {
    const li = document.createElement("li");
    li.className = [l.id === S.targetId ? "tgt" : "", warnIds.has(l.id) ? "warn" : ""].join(" ").trim();
    li.innerHTML = `<i></i><span></span>`;
    li.querySelector("i").style.background = DL.fillOf(l);
    li.querySelector("span").textContent = `${l.id === S.targetId ? "★ " : ""}${l.mat} ${l.role === "substrate" ? "기판" : num(l.t) + " nm"}`;
    ol.append(li);
  });
}

/* ================= IV + heat ================= */
const ivC = $("#lv-iv"), htC = $("#lv-heat");
let P = null, curves = null, TH = null, Tdisp = null, tmaxRun = 0.05, cap = null, mode = "fet";
let vdSel = 1;
const VDS = [0.1, 1, 3];
function renderVd() {
  const box = $("#lv-vd"); box.replaceChildren();
  if (mode !== "fet") { box.hidden = true; return; } box.hidden = false;
  const lab = document.createElement("span"); lab.className = "note"; lab.style.cssText = "padding:4px 6px"; lab.textContent = "Vd";
  box.append(lab);
  VDS.forEach(v => { const b = document.createElement("button"); b.type = "button"; b.textContent = `${v} V`; b.setAttribute("aria-pressed", String(v === vdSel)); b.addEventListener("click", () => { vdSel = v; renderVd(); recompute(); }); box.append(b); });
}
function geometry(S) {
  const L = Math.max(0.5, num(S.geo.L) || 10), Lg = Math.max(0.5, num(S.geo.Lg) || 16), ov = Math.max(0, num(S.geo.ov) || 0);
  const pad = Math.max(4, L * 0.8), Wt = Math.max(Lg, L + 2 * ov + 2 * pad) + 12;
  return { L, Lg, ov, pad, Wt, xc: Wt / 2 };
}
function maskAt(pat, G, x) { const a = Math.abs(x - G.xc); return pat === "gate" ? a <= G.Lg / 2 : pat === "channel" ? a <= G.L / 2 + G.ov : pat === "sd" ? a >= G.L / 2 && a <= G.L / 2 + G.ov + G.pad : true; }

/* banded Cholesky for the conduction matrix (row-major cells, bandwidth = nx) */
function bandChol(n, bw, A) {
  const s1 = bw + 1;
  for (let i = 0; i < n; i++) for (let d = Math.min(i, bw); d >= 0; d--) {
    const j = i - d; let s = A[i * s1 + d];
    for (let k = Math.max(i - bw, 0); k < j; k++) s -= A[i * s1 + (i - k)] * A[j * s1 + (j - k)];
    A[i * s1 + d] = d === 0 ? Math.sqrt(Math.max(s, 1e-300)) : s / A[j * s1];
  }
  return A;
}
function bandSolve(n, bw, Lb, b) {
  const s1 = bw + 1, y = Float64Array.from(b);
  for (let i = 0; i < n; i++) { let s = y[i]; for (let k = Math.max(0, i - bw); k < i; k++) s -= Lb[i * s1 + (i - k)] * y[k]; y[i] = s / Lb[i * s1]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k <= Math.min(n - 1, i + bw); k++) s -= Lb[k * s1 + (k - i)] * y[k]; y[i] = s / Lb[i * s1]; }
  return y;
}
function buildGrid() {
  const S = DL.S, G = geometry(S), nx = 64, dx = G.Wt / nx, rows = [];
  const sub = S.layers.find(l => l.role === "substrate"), kSub = sub ? kOf(sub) : 148;
  const subDepth = 500, Dsub = Math.min(subDepth, Math.max(3 * G.Wt, 30)), nsub = 9;
  const wts = Array.from({ length: nsub }, (_, i) => Math.pow(1.7, nsub - 1 - i)), ws = wts.reduce((a, b) => a + b, 0);
  wts.forEach(w => rows.push({ dy: Dsub * w / ws, k: new Float64Array(nx).fill(kSub), layer: sub, sub: true }));
  const layers = S.layers.filter(l => l.role !== "substrate" && num(l.t) > 0);
  const xs = Array.from({ length: nx }, (_, j) => (j + 0.5) * dx);
  layers.forEach((l, li) => {
    const t = num(l.t), nr = t > 60 ? 3 : 2, k = kOf(l);
    for (let r = 0; r < nr; r++) {
      const kr = new Float64Array(nx), src = new Uint8Array(nx);
      xs.forEach((x, j) => {
        if (maskAt(l.pat, G, x)) { kr[j] = k; if (l.role === "channel" && Math.abs(x - G.xc) <= G.L / 2) src[j] = 1; }
        else { const up = layers.slice(li + 1).find(u => maskAt(u.pat, G, x)); kr[j] = up ? kOf(up) : K_AIR; }
      });
      rows.push({ dy: t / 1000 / nr, k: kr, layer: l, src, first: r === 0 });
    }
  });
  const ny = rows.length, n = nx * ny, bw = nx, A = new Float64Array(n * (bw + 1));
  const idx = (i, j) => i * nx + j;
  const addG = (p, q, g) => { A[p * (bw + 1)] += g; A[q * (bw + 1)] += g; A[Math.max(p, q) * (bw + 1) + Math.abs(p - q)] -= g; };
  for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) {
    const r = rows[i], p = idx(i, j);
    if (j + 1 < nx) addG(p, idx(i, j + 1), r.dy / (dx / 2 / r.k[j] + dx / 2 / r.k[j + 1]));
    if (i + 1 < ny) { const u = rows[i + 1]; addG(p, idx(i + 1, j), dx / (r.dy / 2 / r.k[j] + u.dy / 2 / u.k[j])); }
    if (i === 0) A[p * (bw + 1)] += dx / (r.dy / 2 / r.k[j] + Math.max(0, subDepth - Dsub) / kSub);
  }
  bandChol(n, bw, A);
  const srcCells = []; rows.forEach((r, i) => r.src && r.src.forEach((s, j) => { if (s) srcCells.push([i, j, (xs[j] - G.xc) / G.L]); }));
  const chIdx = layers.findIndex(l => l.role === "channel");
  const below = chIdx > 0 ? layers.slice(0, chIdx).filter(l => maskAt(l.pat, G, G.xc)).map(l => ({ l, r: (num(l.t) / 1000) / kOf(l) })) : [];
  return { G, nx, ny, n, bw, A, rows, xs, dx, srcCells, below, kSub, Dsub };
}
function solveHeat(Pw, sat) {
  if (!TH || !TH.srcCells.length) return null;
  const W = Math.max(1, num(DL.S.geo.W) || 100) * 1e-6, qTot = Pw / W, b = new Float64Array(TH.n);
  const kap = 4 * sat, w = TH.srcCells.map(([, , u]) => Math.exp(kap * (u + 0.5))), ws = w.reduce((a, c) => a + c, 0) || 1;
  TH.srcCells.forEach(([i, j], k) => { b[i * TH.nx + j] += qTot * w[k] / ws; });
  return bandSolve(TH.n, TH.bw, TH.A, b);
}
function fieldMap(v) {
  const g = DL.gateStack(); if (!g || g.err) return null;
  const S = DL.S, G = TH.G, out = new Float64Array(TH.n), gate = S.layers.find(l => l.role === "gate");
  const ids = new Set(g.diel.map(l => l.id));
  TH.rows.forEach((r, i) => { if (!r.layer || !ids.has(r.layer.id)) return; const E = Math.abs(10 * v / (DL.erOf(r.layer) * g.sumTE)); TH.xs.forEach((x, j) => { if (maskAt(gate?.pat || "blanket", G, x) && maskAt(r.layer.pat, G, x)) out[i * TH.nx + j] = E; }); });
  return out;
}

function recompute() {
  const S = DL.S;
  P = DL.modelParams().P; cap = DL.isCap() ? DL.capModel() : null; mode = cap ? cap.kind : "fet";
  $("#lv-title").textContent = `${DEVNAME[S.tpl] || "소자"} 구조`;
  $("#lv-iv-t").textContent = mode === "fet" ? "Id–Vg 측정" : mode === "pv" ? "P–V 측정" : "Q–V 측정";
  $("#lv-ht-t").textContent = mode === "fet" ? "열 분포 (ΔT)" : "전계 분포";
  $("#lv-note").textContent = mode === "fet"
    ? "IV는 페이지의 컴팩트 모델, 열은 발열 Id·Vd를 채널에 나눠 넣고 2D 정상상태 열전도로 푼 1차 근사예요 (열전도도는 박막 대표값, 색은 박막 구간 최저~최고). TCAD 결과가 아니에요."
    : "커패시터는 전류 대신 분극(전하)과 전압을 측정해요. 전계는 직렬 커패시터로 나눈 값이고, 강유전 분극에 의한 전계 재분배는 빠져 있어요.";
  const vm = P.vmax, xs = []; for (let i = 0; i <= 160; i++) xs.push(-vm + 2 * vm * i / 160);
  if (mode === "fet") {
    const mw = P.mw > 0.001;
    curves = { xs, up: xs.map(v => DL.idTot(P, v, mw ? P.mw / 2 : 0, vdSel)), dn: mw ? xs.map(v => DL.idTot(P, v, -P.mw / 2, vdSel)) : null };
  } else curves = { xs, up: xs.map(v => cap.f(v, 1)), dn: mode === "pv" ? xs.map(v => cap.f(v, -1)) : null };
  try { TH = buildGrid(); } catch { TH = null; }
  Tdisp = null; tmaxRun = mode === "fet" ? 0.02 : 0.1;
  warnings = checkDesign(); renderWarnings(); renderLegend(); renderVd();
  const img = $("#lv-img"); if (S.tpl === "custom" && S.img) { img.hidden = false; img.replaceChildren(Object.assign(document.createElement("img"), { src: S.img, alt: "첨부한 신구조" })); } else img.hidden = true;
}
let rt = 0;
function changed() { clearTimeout(rt); rt = setTimeout(() => { build3D(); recompute(); renderQAList(); }, 60); }
document.addEventListener("dl:change", changed);

/* drawing helpers */
function fitCanvas(c) { const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); const w = Math.max(10, Math.round(r.width * d)), hh = Math.max(10, Math.round(r.height * d)); if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; } return { w, h: hh, d }; }
const CMAP = [[243, 238, 228], [242, 208, 138], [232, 145, 60], [194, 65, 42], [107, 20, 20]];
function cmap(u) { u = Math.max(0, Math.min(1, u)) * (CMAP.length - 1); const i = Math.min(CMAP.length - 2, Math.floor(u)), f = u - i, a = CMAP[i], b = CMAP[i + 1]; return `rgb(${Math.round(a[0] + f * (b[0] - a[0]))},${Math.round(a[1] + f * (b[1] - a[1]))},${Math.round(a[2] + f * (b[2] - a[2]))})`; }
const sciS = v => { if (!isFinite(v) || v <= 0) return "0"; const e = Math.floor(Math.log10(v)); return `${(v / 10 ** e).toFixed(1)}e${e}`; };
function drawIV(vg, dir, val) {
  const { w, h, d } = fitCanvas(ivC), g = ivC.getContext("2d");
  g.clearRect(0, 0, w, h);
  const L = 38 * d, Rr = 8 * d, T = 6 * d, B = 18 * d, vm = P.vmax;
  const log = mode === "fet";
  const all = [...curves.up, ...(curves.dn || [])];
  let lo, hi;
  if (log) { hi = Math.log10(Math.max(...all)) + 0.3; lo = Math.max(hi - 12, Math.log10(Math.max(1e-16, Math.min(...all))) - 0.3); }
  else { hi = Math.max(...all.map(Math.abs)) * 1.1 || 1; lo = -hi; }
  const X = v => L + (v + vm) / (2 * vm) * (w - L - Rr), Y = y => { const q = log ? Math.log10(Math.max(1e-30, y)) : y; return T + (hi - Math.max(lo, Math.min(hi, q))) / (hi - lo) * (h - T - B); };
  g.strokeStyle = "rgba(20,23,28,.08)"; g.lineWidth = 1; g.font = `${10 * d}px IBM Plex Mono, monospace`; g.fillStyle = "#6b6f76";
  if (log) for (let e = Math.ceil(lo); e <= hi; e += 3) { const y = T + (hi - e) / (hi - lo) * (h - T - B); g.beginPath(); g.moveTo(L, y); g.lineTo(w - Rr, y); g.stroke(); g.fillText(`1e${e}`, 2 * d, y + 3 * d); }
  else { [lo / 1.1, 0, hi / 1.1].forEach(q => { const y = Y(q); g.beginPath(); g.moveTo(L, y); g.lineTo(w - Rr, y); g.stroke(); g.fillText(q.toFixed(Math.abs(q) < 10 ? 1 : 0), 2 * d, y + 3 * d); }); }
  g.textAlign = "center"; [-vm, 0, vm].forEach(v => g.fillText(`${v > 0 ? "+" : ""}${+v.toFixed(1)}`, X(v), h - 5 * d)); g.textAlign = "left";
  const line = (ys, col, dash) => { g.beginPath(); curves.xs.forEach((v, i) => { const x = X(v), y = Y(ys[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = col; g.lineWidth = 1.8 * d; g.setLineDash(dash ? [5 * d, 4 * d] : []); g.stroke(); g.setLineDash([]); };
  line(curves.up, dir > 0 ? "#35617F" : "rgba(53,97,127,.45)", false);
  if (curves.dn) line(curves.dn, dir < 0 ? "#C0622A" : "rgba(192,98,42,.45)", true);
  const x = X(vg), y = Y(val);
  g.strokeStyle = "rgba(143,82,10,.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, T); g.lineTo(x, h - B); g.stroke();
  g.fillStyle = "#8F520A"; g.beginPath(); g.arc(x, y, 4.2 * d, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.5 * d; g.stroke();
}
function rowBands(h) {
  const subH = h * 0.26, rest = h - subH, layers = DL.S.layers.filter(l => l.role !== "substrate" && num(l.t) > 0);
  const lh = layers.map(l => 6 + 9 * Math.sqrt(num(l.t))), lsum = lh.reduce((a, b) => a + b, 0) || 1;
  const yb = []; let y = h, li = -1; const subRows = TH.rows.filter(r => r.sub).length;
  TH.rows.forEach(r => {
    let hh;
    if (r.sub) hh = subH / subRows;
    else { if (r.first) li++; const nr = TH.rows.filter(q => q.layer === r.layer).length; hh = rest * lh[li] / lsum / nr; }
    yb.push([y - hh, hh]); y -= hh;
  });
  return yb;
}
function drawMap(vals, vmax, unit, vmin = 0) {
  const { w, h, d } = fitCanvas(htC), g = htC.getContext("2d");
  g.clearRect(0, 0, w, h);
  if (!TH) return;
  const yb = rowBands(h), cw = w / TH.nx, span = Math.max(1e-12, vmax - vmin);
  for (let i = 0; i < TH.ny; i++) for (let j = 0; j < TH.nx; j++) {
    const v = vals ? vals[i * TH.nx + j] : 0, air = TH.rows[i].k[j] === K_AIR;
    g.fillStyle = air ? "#FBF9F4" : cmap((v - vmin) / span);
    g.fillRect(j * cw, yb[i][0], cw + 0.6, yb[i][1] + 0.6);
  }
  g.strokeStyle = "rgba(20,23,28,.35)"; g.lineWidth = 1; g.font = `${9.5 * d}px Pretendard Variable, sans-serif`;
  let prev = null, start = null;
  const lab = (l, y0, y1) => { if (!l || y1 - y0 < 9 * d) return; g.fillStyle = "rgba(20,23,28,.82)"; g.fillText(l.role === "substrate" ? `${l.mat} 기판` : l.mat, 3 * d, (y0 + y1) / 2 + 3 * d); };
  TH.rows.forEach((r, i) => {
    if (r.layer !== prev) {
      const yy = yb[i][0] + yb[i][1]; g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke();
      if (prev) lab(prev, yb[i - 1][0], start);
      prev = r.layer; start = yy;
    }
  });
  lab(prev, yb[TH.ny - 1][0], start);
  $("#lv-cbar").innerHTML = `<i style="background:linear-gradient(0deg,${[0, .25, .5, .75, 1].map(cmap).join(",")})"></i><span>${fmtU(vmax)}</span><span>${fmtU((vmax + vmin) / 2)}</span><span>${fmtU(vmin)}</span>`;
}
const fmtU = v => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v > 0 ? v.toPrecision(2) : "0");

/* animation */
const T_PERIOD = 6000;
let lastT = 0, live = { vg: 0, val: 0, pw: 0, peak: 0, dir: 1 }, tminRun = 0;
let visible = true;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe($("#live"));
renderer.setAnimationLoop(time => {
  if (!visible || document.hidden) return;
  controls.update();
  const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time / 320);
  for (const m of meshes) {
    const { id, l } = m.userData;
    if (warnIds.has(id)) m.material.emissive.setRGB(0.55 * pulse, 0.05 * pulse, 0.02 * pulse);
    else if (id === hoverId || id === edHL) m.material.emissive.setRGB(0.14, 0.11, 0.06);
    else if (mode === "fet" && l.role === "channel") m.material.emissive.setRGB(0.6 * heatLevel, 0.12 * heatLevel, 0);
    else if (id === DL.S.targetId) m.material.emissive.setRGB(0.1, 0.05, 0.0);
    else m.material.emissive.setRGB(0, 0, 0);
  }
  renderer.render(scene, camera);
  if (!P || !curves) return;
  if (time - lastT < 45) return;
  const dt = Math.min(0.2, (time - lastT) / 1000); lastT = time;
  const ph = reduced ? 0.4 : (time % T_PERIOD) / T_PERIOD, vm = P.vmax;
  const dir = ph < 0.5 ? 1 : -1, vg = ph < 0.5 ? -vm + 4 * vm * ph : 3 * vm - 4 * vm * ph;
  if (mode === "fet") {
    const shift = P.mw > 0.001 ? (dir > 0 ? P.mw / 2 : -P.mw / 2) : 0, id = DL.idTot(P, vg, shift, vdSel), pw = Math.abs(id * vdSel);
    const b = P.branch || (P.pol === "p" ? "p" : "n"), vth = (b === "p" ? P.p_vth : P.n_vth) + shift, vov = Math.abs(b === "p" ? vth - vg : vg - vth);
    const sat = Math.max(0, Math.min(1, vdSel / (vov + 0.05)));
    const T = solveHeat(pw, sat);
    if (T) { if (!Tdisp || Tdisp.length !== T.length) Tdisp = Float64Array.from(T); else { const a = 1 - Math.exp(-dt / 0.25); for (let i = 0; i < T.length; i++) Tdisp[i] += (T[i] - Tdisp[i]) * a; } }
    let peak = 0, fmin = Infinity;
    if (Tdisp) for (let i = 0; i < TH.ny; i++) { const film = !TH.rows[i].sub; for (let j = 0; j < TH.nx; j++) { const v = Tdisp[i * TH.nx + j]; if (v > peak) peak = v; if (film && TH.rows[i].k[j] !== K_AIR && v < fmin) fmin = v; } }
    if (!isFinite(fmin)) fmin = 0;
    tmaxRun = Math.max(peak, tmaxRun * 0.997, 1e-6);
    tminRun = tminRun ? tminRun + (fmin - tminRun) * 0.2 : fmin;
    const lo = Math.min(tminRun, tmaxRun * 0.98);
    heatLevel = tmaxRun > lo ? Math.max(0, (peak - lo) / (tmaxRun - lo)) : 0;
    live = { vg, val: id, pw, peak, dir };
    drawIV(vg, dir, id);
    $("#lv-iv-r").textContent = `Vg ${vg >= 0 ? "+" : ""}${vg.toFixed(2)} V  Id ${sciS(id)} A`;
    if (TH?.srcCells.length) { drawMap(Tdisp, tmaxRun, "K", lo); $("#lv-ht-r").textContent = `P ${pw >= 1e-3 ? (pw * 1e3).toFixed(2) + " mW" : (pw * 1e6).toFixed(1) + " μW"}  ΔT최대 ${peak < 0.01 ? peak.toExponential(1) : peak.toFixed(3)} K`; }
    else { drawMap(null, 1, "K"); $("#lv-ht-r").textContent = "채널 층이 없어요"; }
  } else {
    const val = cap.f(vg, dir); live = { vg, val, dir };
    drawIV(vg, dir, val);
    $("#lv-iv-r").textContent = `V ${vg >= 0 ? "+" : ""}${vg.toFixed(2)} V  ${mode === "pv" ? "P" : "Q"} ${val.toFixed(2)} μC/cm²`;
    const F = TH ? fieldMap(vg) : null, Fm = TH ? fieldMap(vm) : null; let fmax = 0.1; if (Fm) for (const v of Fm) if (v > fmax) fmax = v;
    drawMap(F, fmax, "MV/cm");
    let fpk = 0; if (F) for (const v of F) if (v > fpk) fpk = v;
    $("#lv-ht-r").textContent = `|E| 최대 ${fpk.toFixed(2)} MV/cm`;
  }
});

/* ================= Q&A ================= */
const qaPanel = $("#qa"), qaBtn = $("#qa-open");
function openQA(qid) { qaPanel.hidden = false; qaBtn.setAttribute("aria-expanded", "true"); renderQAList(); if (qid) answer(qid); }
function closeQA() { qaPanel.hidden = true; qaBtn.setAttribute("aria-expanded", "false"); }
qaBtn.addEventListener("click", () => (qaPanel.hidden ? openQA() : closeQA()));
$("#qa-close").addEventListener("click", closeQA);
function chLayer() { return DL.S.layers.find(l => l.role === "channel") || DL.S.layers.find(l => l.role === "player"); }
function questions() {
  const qs = [], ch = chLayer(), t = DL.target(), R = DL.R;
  if (mode === "fet" && ch) qs.push({ id: "mob", q: `${ch.mat} 채널 이동도가 낮게 나오는 이유는?` }, { id: "heat", q: "열이 채널 드레인 쪽에 몰리는 이유는?" });
  if (R?.data?.steps?.length) qs.push({ id: "first", q: `왜 ${R.data.steps[0].thickness_nm} nm부터 시작하나요?` });
  qs.push({ id: "tcad", q: "TCAD가 있는데 이 도구가 왜 필요한가요?" });
  qs.push({ id: "runs", q: "장비 기록을 넣으면 왜 예측 범위가 좁아지나요?" });
  const g = DL.gateStack(); if (g && !g.err && g.fe) qs.push({ id: "fe", q: `${g.fe.mat}에 걸리는 전계는 분극 반전에 충분한가요?` });
  if (mode !== "fet") qs.push({ id: "field", q: "전계가 어느 층에 몰리나요?" });
  if (t) qs.push({ id: "trust", q: "이 예측은 얼마나 믿을 수 있나요?" });
  warnings.forEach((w, k) => qs.push({ id: `warn:${k}`, q: `'${w.title}' 경고는 왜 떴나요?` }));
  return qs;
}
function renderQAList() {
  const ul = $("#qa-q"); ul.replaceChildren();
  for (const x of questions().slice(0, 9)) { const li = document.createElement("li"), b = document.createElement("button"); b.type = "button"; b.textContent = x.q; b.addEventListener("click", () => answer(x.id, x.q)); li.append(b); ul.append(li); }
}
function answerText(id) {
  const S = DL.S, ch = chLayer(), R = DL.R;
  if (id.startsWith("warn:")) { const w = warnings[+id.slice(5)]; return w ? [w.detail, "기준은 널리 알려진 박막 물리 경향이고, 이 화면의 계산값이 아니에요."] : ["경고가 사라졌어요."]; }
  switch (id) {
    case "mob": {
      const t = num(ch.t), mp = DL.modelParams(), b = ch.role === "player" || DL.typeOf(ch) === "p" ? "p" : "n", mu = b === "p" ? mp.P.p_mu : mp.P.n_mu, src = mp.src[b + "_mu"];
      const out = [`지금 ${ch.mat} ${t} nm 채널의 ${b === "p" ? "정공" : "전자"} 이동도는 ${(+mu).toPrecision(3)} cm²/Vs로 계산돼요 (근거: ${src}).`];
      if (t < 6) out.push(`채널이 ${t} nm로 얇아 캐리어가 위아래 계면에 가까이 붙어 흐르고, 계면 거칠기와 계면 결함에 의한 산란 비중이 커져 이동도가 떨어지기 쉬워요.`);
      else if (t > 25) out.push(`채널이 ${t} nm로 두꺼우면 이동도 자체보다 꺼짐 특성(Ioff, SS)이 먼저 나빠지기 쉬워요.`);
      else out.push("이 두께에서는 막 안의 결함(산소 공공, 결정립계)과 증착 직후 남는 불순물이 이동도를 주로 정해요. 후열처리 온도와 산화제 조건이 함께 영향을 줘요.");
      const under = S.layers[S.layers.indexOf(ch) - 1]; if (under) out.push(`아래층 ${under.mat}와의 계면 상태도 중요해요. 같은 두께라도 하부층에 따라 핵생성 지연과 계면 결함이 달라져요.`);
      return out;
    }
    case "heat": {
      const below = TH?.below || [], tot = below.reduce((a, x) => a + x.r, 0), top = below.slice().sort((a, b) => b.r - a.r)[0];
      const out = ["포화 영역(Vd가 Vg−Vth보다 큼)에서는 드레인 쪽 채널이 핀치오프되며 전압이 그 짧은 구간에 몰려 걸려요. 발열은 전류 × 그 구간의 전압이라 드레인 쪽에 집중돼요."];
      out.push(`지금 Vd ${vdSel} V에서 소모 전력은 ${live.pw >= 1e-3 ? (live.pw * 1e3).toFixed(2) + " mW" : (live.pw * 1e6).toFixed(1) + " μW"}, 채널 최고 온도 상승은 약 ${(live.peak || 0).toPrecision(2)} K예요.`);
      if (top && tot > 0) out.push(`열이 기판으로 빠지는 길에서 가장 큰 저항은 ${top.l.mat} ${num(top.l.t)} nm (열전도도 ${kOf(top.l)} W/m·K)로, 채널 아래 막 열저항의 ${Math.round(top.r / tot * 100)}%를 차지해요. 이 층을 얇게 하거나 열전도도가 큰 물질로 바꾸면 온도가 내려가요.`);
      out.push("열전도도는 박막 대표값이고, 기판 쪽은 500 μm 기판 바닥을 상온으로 둔 2D 근사예요. 유리나 PI 기판으로 바꾸면 온도 상승이 크게 늘어나요.");
      return out;
    }
    case "first": { const s = R.data.steps[0]; return [s.why || "단계 설명이 없어요.", s.go ? `다음 단계로 넘어갈 기준: ${s.go}` : ""].filter(Boolean); }
    case "tcad": return ["상용 TCAD는 방대한 데이터로 보정돼 이 도구보다 정확해요. 정확도로 겨루려는 도구가 아니에요.",
      "대신 TCAD는 3D 소자 한 번 계산에 수 시간에서 수 일이 걸리고 라이선스도 비싸요. 신소재가 나오면 후보 조건이 수십, 수백 개라 전부 돌리면 대부분 버려지는 조건에 시간과 라이선스를 써요.",
      "이 도구는 그 앞에서 논문 근거로 불가능한 조건을 지우고 가능성이 높은 몇 개만 남겨요. TCAD는 그 몇 개만 정밀하게 확인하고, TCAD가 없는 연구실은 여기서 바로 첫 제작 조건을 골라요."];
    case "runs": {
      const out = ["논문 값이 넓게 흩어지는 가장 큰 이유는 연구실마다 장비, 전구체, 열처리, 전극이 달라서예요. 같은 두께라도 연구실 수준 차이가 결과를 크게 바꿔요.",
        "우리 장비로 한 번이라도 측정하면 그 차이를 우리 장비 값으로 대신할 수 있어요. 그러면 남는 불확실성은 같은 장비 안의 반복 오차 정도로 줄어들어요."];
      const z = DL.hzoCalc?.(); if (z && z.b) out.push(`지금 HZO 예에서 ${z.best.t} nm의 80% 예측 범위가 ${z.a.lo.toFixed(0)}–${z.a.hi.toFixed(0)}에서 ${z.b.lo.toFixed(0)}–${z.b.hi.toFixed(0)} μC/cm²로 좁아졌어요.`);
      return out;
    }
    case "fe": { const g = DL.gateStack(); const ok = Math.abs(g.E) >= g.ec * 1.5; return [`게이트 ${num(S.vg)} V를 직렬 커패시터로 나누면 ${g.fe.mat}에 ${(+g.E).toFixed(2)} MV/cm가 걸려요. 항전계 Ec는 대표값 ${g.ec} MV/cm예요.`, ok ? "Ec의 1.5배를 넘어 분극을 충분히 뒤집을 수 있는 수준이에요." : "Ec 근처라 분극이 일부만 뒤집힐 수 있어요. 게이트 전압을 높이거나 다른 절연막을 얇게 하세요."]; }
    case "field": { const g = DL.gateStack(); if (!g || g.err) return ["절연막 구성을 확인해 주세요."]; return g.diel.map(l => `${l.mat} ${num(l.t)} nm: ${(10 * Math.abs(num(S.vg) || 1) / (DL.erOf(l) * g.sumTE)).toFixed(2)} MV/cm (εr ${DL.erOf(l)})`).concat(["유전율이 낮은 층일수록 같은 전하에서 전계가 커져요. 얇은 저유전율 계면층이 있으면 그 층이 먼저 파괴될 수 있어요."]); }
    case "trust": return ["2단계 확률은 근거 논문 수, 조건이 문헌 범위 안인지, 우리 장비 기록과 맞는지를 보고 AI가 낸 추정치예요. 보정된 통계 확률이 아니에요.", "HZO 2Pr은 실제 논문 9편 값으로 만든 두께 모델이라 수치로 검증했어요. 논문 한 편을 빼고 맞히는 방식의 결과는 두께 모델 검증 페이지에 그대로 공개했어요.", "그래서 이 도구는 값을 맞히기보다 어느 조건부터 시작하고 무엇을 지울지 정하는 데 쓰는 게 맞아요."];
  }
  return ["이 질문은 아직 답할 규칙이 없어요. 위 목록에서 골라 주세요."];
}
function addAnswer(q, ps, srcNote) {
  const box = $("#qa-a"), d = document.createElement("div");
  const qq = document.createElement("p"); qq.className = "qq"; qq.textContent = q; d.append(qq);
  ps.forEach(t => { const p = document.createElement("p"); p.textContent = t; d.append(p); });
  if (srcNote) { const s = document.createElement("p"); s.className = "src"; s.textContent = srcNote; d.append(s); }
  box.prepend(d); box.scrollTop = 0;
  return d;
}
function answer(id, q) { addAnswer(q || questions().find(x => x.id === id)?.q || "", answerText(id)); }
$("#qa-form").addEventListener("submit", async e => {
  e.preventDefault(); const v = $("#qa-in").value.trim(); if (!v) return; $("#qa-in").value = "";
  const sample = DL.caps.sample;
  if (sample) {
    const node = addAnswer(v, ["생각하는 중이에요…"], "Claude 답변, 이 화면의 값 기준");
    const c = DL.ctx(), st = DL.curStep(), mp = DL.modelParams();
    const prompt = `너는 반도체 박막 공정과 소자를 설명하는 엔지니어야. 아래 화면 값만 근거로 한국어로 3~5문장 답해. 모르면 모른다고 말해.\n[소자] ${c.layers.join(" / ")}\n[게이트 스택] ${c.gate}\n[선택 단계] ${st ? JSON.stringify(st.predicted) : "없음"}\n[모델 값] ${JSON.stringify(mp.P)}\n[실시간] Vg ${live.vg?.toFixed?.(2)} V, Id ${live.val} A, 발열 ${live.pw} W, 최고 ΔT ${live.peak} K, Vd ${vdSel} V\n[우리 장비 기록] ${c.notes || "없음"}\n[질문] ${v}`;
    try { const r = await sample(prompt, { modelTier: "quick" }); node.querySelectorAll("p:not(.qq):not(.src)").forEach(p => p.remove()); const p = document.createElement("p"); p.textContent = r.text; node.insertBefore(p, node.querySelector(".src")); }
    catch { node.querySelector("p:not(.qq)").textContent = "지금은 답을 받지 못했어요. 위 목록의 질문을 골라 주세요."; }
    return;
  }
  const rules = [[/tcad|티캐드|시뮬/i, "tcad"], [/이동도|mobility/i, "mob"], [/열|온도|발열|heat/i, "heat"], [/장비|기록|보정|범위|좁/, "runs"], [/전계|분극|반전/, "fe"], [/믿|정확|오차|신뢰/, "trust"], [/먼저|시작|왜.*nm/, "first"]];
  let id = null; for (const [re, k] of rules) if (re.test(v)) { id = k; break; }
  if (id && !questions().some(x => x.id === id)) id = id === "fe" && mode !== "fet" ? "field" : null;
  if (id) addAnswer(v, answerText(id)); else addAnswer(v, ["이 공개 페이지에서는 정해진 질문에만 답할 수 있어요. 위 목록에서 골라 주세요. Claude 앱에서 열면 자유롭게 물어볼 수 있어요."]);
});

/* ================= data pig: grows as data accumulates ================= */
const BASE_DATA = 48; // built in: 15 measured HZO 2Pr values + 33 papers in the saved example analyses
const LEVELS = [[0, "아기 돼지"], [60, "꼬마 돼지"], [100, "통통 돼지"], [200, "왕돼지"]];
let pigPrev = null;
function userRecords() {
  let n = 0;
  const cur = DL.S, seen = new Set([cur.tpl]);
  n += (cur.runs || []).filter(r => r.val !== "" && r.val != null && !r.ex).length;
  for (const k of ["fefet", "tft", "mfm", "mim", "custom"]) {
    if (seen.has(k)) continue;
    try { const c = JSON.parse(localStorage.getItem("depolens.v2.dev." + k) || "null"); n += (c?.S?.runs || []).filter(r => r.val !== "" && r.val != null && !r.ex).length; } catch {}
  }
  const exRuns = (cur.runs || []).filter(r => r.ex && r.val !== "").length;
  const livePapers = DL.R && !DL.R.example ? (DL.R.papers || []).length : 0;
  return { n, exRuns, livePapers };
}
function pigSVG(f) {
  const rx = 30 * f, ry = 20 * (0.92 + 0.18 * f), cx = 56, cy = 50, hx = cx + rx * 0.78, hy = cy - 8;
  const leg = x => `<rect x="${(x - 4).toFixed(1)}" y="${(cy + ry - 6).toFixed(1)}" width="8" height="${(12 - 2 * (f - 1)).toFixed(1)}" rx="2" fill="#E9A3B5" stroke="#C9798F" stroke-width="1.2"/>`;
  return `<svg viewBox="0 0 120 86" xmlns="http://www.w3.org/2000/svg">
    <path d="M${(cx - rx + 2).toFixed(1)} ${cy - 4}c-8 -2 -10 -10 -4 -12c5 -2 6 5 1 6" fill="none" stroke="#C9798F" stroke-width="2" stroke-linecap="round"/>
    ${leg(cx - rx * 0.6)}${leg(cx - rx * 0.2)}${leg(cx + rx * 0.2)}${leg(cx + rx * 0.55)}
    <ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#F4BFCC" stroke="#C9798F" stroke-width="1.5"/>
    <ellipse cx="${(cx - rx * 0.15).toFixed(1)}" cy="${(cy - ry * 0.45).toFixed(1)}" rx="${(rx * 0.45).toFixed(1)}" ry="${(ry * 0.22).toFixed(1)}" fill="#fff" opacity=".35"/>
    <path d="M${(hx - 9).toFixed(1)} ${hy - 13}l-3 -11l10 6z" fill="#EFA9BB" stroke="#C9798F" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M${(hx + 5).toFixed(1)} ${hy - 14}l4 -11l5 11z" fill="#EFA9BB" stroke="#C9798F" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="${hx.toFixed(1)}" cy="${hy}" r="${(15 + 2 * (f - 1)).toFixed(1)}" fill="#F4BFCC" stroke="#C9798F" stroke-width="1.5"/>
    <ellipse cx="${(hx + 10).toFixed(1)}" cy="${hy + 3}" rx="7" ry="5.5" fill="#EE9FB3" stroke="#C9798F" stroke-width="1.2"/>
    <circle cx="${(hx + 8).toFixed(1)}" cy="${hy + 3}" r="1.3" fill="#9C4F66"/><circle cx="${(hx + 12).toFixed(1)}" cy="${hy + 3}" r="1.3" fill="#9C4F66"/>
    <circle cx="${(hx + 2).toFixed(1)}" cy="${hy - 5}" r="2" fill="#3A2A30"/><circle cx="${(hx + 2.6).toFixed(1)}" cy="${hy - 5.7}" r=".7" fill="#fff"/>
    <ellipse cx="${(hx - 3).toFixed(1)}" cy="${hy + 5}" rx="4" ry="2.4" fill="#F08AA6" opacity=".55"/>
  </svg>`;
}
function renderPig() {
  const u = userRecords(), total = BASE_DATA + u.n + u.exRuns + u.livePapers;
  let li = 0; LEVELS.forEach(([t], i) => { if (total >= t) li = i; });
  const next = LEVELS[li + 1], lo = LEVELS[li][0], f = 0.85 + 0.8 * Math.min(1, Math.max(0, (total - 40) / 180));
  $("#pig-svg").innerHTML = pigSVG(f);
  $("#pig-n").textContent = String(total);
  $("#pig-lv").textContent = LEVELS[li][1];
  $("#pig-bar").style.width = `${next ? Math.round((total - lo) / (next[0] - lo) * 100) : 100}%`;
  $("#pig-next").textContent = `${next ? `${next[1]}까지 ${next[0] - total}개. ` : ""}내장 논문 데이터 ${BASE_DATA}, 우리 장비 기록 ${u.n + u.exRuns}${u.livePapers ? `, 실시간 검색 논문 ${u.livePapers}` : ""}. 기록이 쌓일수록 예측 범위가 좁아져요.`;
  if (pigPrev != null && total > pigPrev) { const p = $("#pig"); p.classList.remove("eat"); void p.offsetWidth; p.classList.add("eat"); }
  pigPrev = total;
}
document.addEventListener("dl:change", () => setTimeout(renderPig, 80));

/* boot */
build3D(); recompute(); renderQAList(); resize3D(); renderPig();
