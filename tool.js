import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const M = window.DLModel;
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const fmt = (v, d = 1) => (v == null || !isFinite(v) ? "–" : Number(v).toFixed(d));
const round05 = t => Math.round(t * 2) / 2;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------------- libraries ---------------- */
const MATS = {
  si: { name: "Si", type: "semi", fill: "#9AA1AB" }, sio2: { name: "SiO2", type: "ins", fill: "#CFDBE4" },
  mo: { name: "Mo", type: "metal", fill: "#717886" }, tin: { name: "TiN", type: "metal", fill: "#C4A45B" },
  tan: { name: "TaN", type: "metal", fill: "#8E8A76" }, w: { name: "W", type: "metal", fill: "#5E6572" },
  ti: { name: "Ti", type: "metal", fill: "#A5AAB2" }, pt: { name: "Pt", type: "metal", fill: "#BABDC3" },
  au: { name: "Au", type: "metal", fill: "#D9AC3D" }, ni: { name: "Ni", type: "metal", fill: "#8B8E96" },
  al: { name: "Al", type: "metal", fill: "#C9CDD3" }, ito: { name: "ITO", type: "metal", fill: "#9CC8BE" },
  hzo: { name: "HZO", type: "ins", fill: "#E08F5D" }, hfo2: { name: "HfO2", type: "ins", fill: "#E9BF8E" },
  zro2: { name: "ZrO2", type: "ins", fill: "#EAD0A3" }, al2o3: { name: "Al2O3", type: "ins", fill: "#DDE7EF" },
  sinx: { name: "SiNx", type: "ins", fill: "#C9D2C4" }, ta2o5: { name: "Ta2O5", type: "ins", fill: "#D8C8A8" },
  tio2: { name: "TiO2", type: "ins", fill: "#E4DCC4" }, y2o3: { name: "Y2O3", type: "ins", fill: "#D9D4E6" },
  igzo: { name: "IGZO", type: "semi", fill: "#5EA89B" }, in2o3: { name: "In2O3", type: "semi", fill: "#6FB3A2" },
  zno: { name: "ZnO", type: "semi", fill: "#86B7A0" }, ga2o3: { name: "Ga2O3", type: "semi", fill: "#7FA6C9" },
  mos2: { name: "MoS2", type: "semi", fill: "#4F7FAE" }, teox: { name: "TeOx", type: "semi", fill: "#A67BC0" },
  te: { name: "Te", type: "semi", fill: "#8A62A4" }, sno: { name: "SnO", type: "semi", fill: "#9C8AB8" },
  cu2o: { name: "Cu2O", type: "semi", fill: "#B07A62" }, nio: { name: "NiO", type: "semi", fill: "#8A9A6B" }
};
const ALIAS = { hf05zr05o2: "hzo", hfzro2: "hzo", hfzro: "hzo", hfxzr1xo2: "hzo", hf1xzrxo2: "hzo", alumina: "al2o3", siliconoxide: "sio2", tellurium: "te" };
const normKey = n => { const k = String(n || "").toLowerCase().replace(/[^a-z0-9]/g, ""); return ALIAS[k] || k; };
const matInfo = n => MATS[normKey(n)] || null;

const ROLES = { substrate: "기판", gate: "게이트", ins: "절연막", fe: "강유전막", channel: "채널", player: "p형 층", electrode: "전극", pass: "보호막" };
const ROLE_FILL = { substrate: "#9AA1AB", gate: "#717886", ins: "#D3DDE6", fe: "#E08F5D", channel: "#5EA89B", player: "#A67BC0", electrode: "#8B8E96", pass: "#C5D2CC" };
const PATS = { blanket: "전면", gate: "게이트 영역", channel: "채널 영역", sd: "S/D 패드" };
const METHODS = ["ALD", "PEALD", "스퍼터", "E-beam", "열증착", "PLD", "CVD", "열산화", "기판"];
const METHOD_EN = { ALD: "atomic layer deposition", PEALD: "plasma enhanced atomic layer deposition", "스퍼터": "sputtering", "E-beam": "electron beam evaporation", "열증착": "thermal evaporation", PLD: "pulsed laser deposition", CVD: "chemical vapor deposition", "열산화": "thermal oxidation", "기판": "" };
const fillOf = l => matInfo(l.mat)?.fill || ROLE_FILL[l.role] || "#999999";

const DEVICES = {
  fefet: { label: "메모리 트랜지스터 (FeFET)", geo: { L: 10, W: 100, Lg: 16, ov: 2 }, target: 3, layers: [
    { role: "substrate", mat: "Si", t: 500, method: "기판", pat: "blanket" },
    { role: "ins", mat: "SiO2", t: 100, method: "열산화", pat: "blanket" },
    { role: "gate", mat: "Mo", t: 50, method: "스퍼터", pat: "gate" },
    { role: "fe", mat: "HZO", t: 10, method: "ALD", pat: "blanket" },
    { role: "channel", mat: "IGZO", t: 10, method: "ALD", pat: "channel" },
    { role: "player", mat: "TeOx", t: 10, method: "ALD", pat: "channel" },
    { role: "electrode", mat: "Mo", t: 50, method: "스퍼터", pat: "sd" }] },
  tft: { label: "박막 트랜지스터 (TFT)", geo: { L: 10, W: 100, Lg: 12, ov: 2 }, target: 2, layers: [
    { role: "substrate", mat: "Si", t: 500, method: "기판", pat: "blanket" },
    { role: "ins", mat: "SiO2", t: 100, method: "열산화", pat: "blanket" },
    { role: "channel", mat: "IGZO", t: 15, method: "ALD", pat: "channel" },
    { role: "electrode", mat: "Mo", t: 50, method: "스퍼터", pat: "sd" },
    { role: "ins", mat: "Al2O3", t: 10, method: "ALD", pat: "blanket" },
    { role: "gate", mat: "Mo", t: 50, method: "스퍼터", pat: "gate" }] },
  mfm: { label: "강유전 커패시터 (MFM)", geo: { L: 20, W: 20, Lg: 20, ov: 2 }, target: 3, layers: [
    { role: "substrate", mat: "Si", t: 500, method: "기판", pat: "blanket" },
    { role: "ins", mat: "SiO2", t: 100, method: "열산화", pat: "blanket" },
    { role: "electrode", mat: "TiN", t: 50, method: "스퍼터", pat: "blanket" },
    { role: "fe", mat: "HZO", t: 10, method: "ALD", pat: "blanket" },
    { role: "gate", mat: "TiN", t: 50, method: "스퍼터", pat: "gate" }] },
  mim: { label: "커패시터 (MIM)", geo: { L: 20, W: 20, Lg: 20, ov: 2 }, target: 3, layers: [
    { role: "substrate", mat: "Si", t: 500, method: "기판", pat: "blanket" },
    { role: "ins", mat: "SiO2", t: 100, method: "열산화", pat: "blanket" },
    { role: "electrode", mat: "TiN", t: 50, method: "스퍼터", pat: "blanket" },
    { role: "ins", mat: "Al2O3", t: 10, method: "ALD", pat: "blanket" },
    { role: "gate", mat: "TiN", t: 50, method: "스퍼터", pat: "gate" }] }
};

/* what each layer role is judged by */
const PROPS = {
  fe: [{ id: "2Pr", label: "잔류 분극 2Pr", unit: "µC/cm²", dir: "ge", def: 30, en: "remanent polarization", measure: "P–V 루프로 2Pr 측정 (깨우기 사이클 뒤), 누설 전류 함께 확인" }],
  channel: [{ id: "mu", label: "전계효과 이동도", unit: "cm²/Vs", dir: "ge", def: 10, en: "field-effect mobility", measure: "Id–Vg로 이동도, 문턱 전압, on/off 비 측정" }],
  player: [{ id: "mu", label: "정공 이동도", unit: "cm²/Vs", dir: "ge", def: 5, en: "hole mobility", measure: "Hall 측정으로 정공 이동도와 농도, Id–Vg로 on/off 비" }],
  ins: [{ id: "k", label: "유전 상수", unit: "", dir: "ge", def: 15, en: "dielectric constant", measure: "C–V로 유전 상수, I–V로 누설 전류와 항복 전압" }],
  pass: [{ id: "k", label: "유전 상수", unit: "", dir: "ge", def: 7, en: "dielectric constant", measure: "C–V, 누설 전류" }],
  gate: [{ id: "rho", label: "비저항", unit: "µΩcm", dir: "le", def: 100, en: "resistivity", measure: "4점 탐침으로 면저항, 두께로 비저항 환산" }],
  electrode: [{ id: "rho", label: "비저항", unit: "µΩcm", dir: "le", def: 100, en: "resistivity", measure: "4점 탐침으로 면저항, 두께로 비저항 환산" }],
  substrate: []
};
const DATASETS = { "hzo|2Pr": "data/hzo_2pr.json" };
const RANGE = { fe: [5, 20], channel: [5, 25], player: [5, 15], ins: [5, 30], pass: [10, 60], gate: [20, 100], electrode: [20, 100] };
const PALETTE = ["#3E6E8E", "#8E5A3E", "#5E7F4E", "#7A4E7F", "#3F8A84", "#9A7B2E", "#6B6F76", "#A0524A", "#3F5A9A", "#7F7A3E"];

/* ---------------- state ---------------- */
const fresh = dev => ({ device: dev, geo: { ...DEVICES[dev].geo }, layers: DEVICES[dev].layers.map(l => ({ ...l })), target: DEVICES[dev].target, goal: {}, gpc: { ALD: 0.1, PEALD: 0.1 }, results: {}, extra: {} });
let S = store.get("depolens.v2", null) || fresh("fefet");
if (!S.layers || !S.layers.length) S = fresh("fefet");
const save = () => store.set("depolens.v2", S);

const targetLayer = () => S.layers[Math.min(S.target, S.layers.length - 1)];
const propOf = l => (PROPS[l.role] || [])[0] || null;
const keyOf = (l, p) => `${normKey(l.mat)}|${p ? p.id : ""}`;
const goalOf = (l, p) => { const k = keyOf(l, p); return S.goal[k] ?? p?.def ?? 0; };

/* ---------------- step 1 UI ---------------- */
function renderRoles() {
  const box = $("#roles"); box.replaceChildren();
  for (const [id, d] of Object.entries(DEVICES)) {
    box.append(h("button", { type: "button", "aria-pressed": String(S.device === id), onclick: () => { const keep = { results: S.results, extra: S.extra, goal: S.goal, gpc: S.gpc }; S = { ...fresh(id), ...keep }; save(); renderAll(); } }, d.label));
  }
}
function renderGeo() {
  const g = $("#geo"); g.replaceChildren();
  const field = (k, label) => h("label", null, label, h("input", { type: "number", min: "0.1", step: "0.1", value: S.geo[k], oninput: e => { const v = parseFloat(e.target.value); if (v > 0) { S.geo[k] = v; changed(); } } }));
  g.append(field("L", "채널 길이 L (µm)"), field("W", "채널 폭 W (µm)"), field("Lg", "게이트 길이 (µm)"), field("ov", "S/D 겹침 (µm)"));
}
function renderLayers() {
  const tb = $("#layers tbody"); tb.replaceChildren();
  const order = S.layers.map((l, i) => i).reverse();
  for (const i of order) {
    const l = S.layers[i];
    const sel = (opts, val, on) => h("select", { onchange: e => on(e.target.value) }, ...Object.entries(opts).map(([k, v]) => h("option", { value: k, selected: k === val }, v)));
    const tr = h("tr", { "data-i": i, class: i === S.target ? "target" : null,
      onmouseenter: () => hover(i), onmouseleave: () => hover(-1) },
      h("td", null, h("input", { type: "radio", name: "target", checked: i === S.target, "aria-label": `${i + 1}번 층 최적화`, disabled: l.role === "substrate", onchange: () => { S.target = i; changed(true); } })),
      h("td", null, h("span", { class: "swatch", style: `background:${fillOf(l)}` }), sel(ROLES, l.role, v => { l.role = v; changed(true); renderLayers(); })),
      h("td", null, h("input", { class: "mat", list: "matlist", value: l.mat, "aria-label": "물질", oninput: e => { l.mat = e.target.value; changed(true); tr.querySelector(".swatch").style.background = fillOf(l); } })),
      h("td", null, h("input", { type: "number", min: "0.1", step: "0.1", value: l.t, "aria-label": "두께 nm", oninput: e => { const v = parseFloat(e.target.value); if (v > 0) { l.t = v; changed(i === S.target); } } })),
      h("td", null, h("select", { "aria-label": "증착 방법", onchange: e => { l.method = e.target.value; changed(true); } }, ...METHODS.map(m => h("option", { value: m, selected: m === l.method }, m)))),
      h("td", null, sel(PATS, l.pat, v => { l.pat = v; changed(); })),
      h("td", null, h("button", { type: "button", class: "del", "aria-label": `${i + 1}번 층 삭제`, title: "삭제", onclick: () => { if (S.layers.length <= 1) return; S.layers.splice(i, 1); if (S.target >= S.layers.length) S.target = S.layers.length - 1; if (S.target === i) S.target = Math.max(0, S.layers.findIndex(x => x.role !== "substrate")); else if (S.target > i) S.target--; changed(true); renderLayers(); } }, "×"))
    );
    tb.append(tr);
  }
  markWarnRows();
}
function renderGoal() {
  const l = targetLayer(), p = propOf(l), box = $("#goal"); box.replaceChildren();
  if (!p) { box.append(h("p", { class: "goal-t" }, "기판은 최적화 대상이 아닙니다. 다른 층을 고르세요.")); return; }
  box.append(
    h("p", { class: "goal-t" }, `최적화할 층: ${l.mat || "(물질 없음)"} ${ROLES[l.role]}, ${l.method}`),
    h("label", null, `목표 ${p.label} ${p.dir === "ge" ? "이상" : "이하"}${p.unit ? ` (${p.unit})` : ""}`,
      h("input", { type: "number", step: "any", min: "0", value: goalOf(l, p), oninput: e => { const v = parseFloat(e.target.value); if (v > 0) { S.goal[keyOf(l, p)] = v; save(); scheduleAnalyze(); } } })),
    h("p", { class: "hint" }, `측정 방법: ${p.measure}`)
  );
}

/* ---------------- 3D ---------------- */
const canvas = $("#c3d");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(3.4, 2.6, 3.8);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.target.set(0, 0.35, 0); controls.minDistance = 2.2; controls.maxDistance = 12;
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ad98, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(3, 6, 4); scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-4, 2, -3); scene.add(fill);
const group = new THREE.Group(); scene.add(group);
let explode = false, meshes = [], warnSet = new Set(), hoverI = -1;

const visH = t => 0.05 + 0.11 * Math.log10(1 + t / 3);
function footprint(l) {
  const { L, W, Lg, ov } = S.geo, pad = Math.max(4, 0.6 * L);
  const spanX = Math.max(Lg, L + 2 * pad, L + 2 * ov) + Math.max(6, 0.5 * L);
  const u = 3.0 / spanX;
  const chZ = spanX * Math.min(0.75, Math.max(0.28, 0.22 + 0.14 * Math.log2(W / L + 1)));
  const subZ = chZ + 0.6 * spanX * 0.35;
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
  for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); }
  group.clear(); meshes = [];
  const placed = [];
  S.layers.forEach((l, i) => {
    const rects = footprint(l), hgt = visH(Math.min(l.t, 600)) * (l.role === "substrate" ? 1.3 : 1);
    const info = matInfo(l.mat), metal = info?.type === "metal" || l.role === "gate" || l.role === "electrode";
    for (const r of rects) {
      let base = 0;
      for (const p of placed) if (overlap(p, r)) base = Math.max(base, p.top);
      base += explode ? (i ? 0.16 : 0) : 0;
      const geo = new THREE.BoxGeometry(r.x1 - r.x0, hgt, r.z1 - r.z0);
      const mat = new THREE.MeshStandardMaterial({ color: fillOf(l), roughness: metal ? 0.38 : 0.78, metalness: metal ? 0.45 : 0.04, emissive: 0x000000 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((r.x0 + r.x1) / 2, base + hgt / 2, (r.z0 + r.z1) / 2);
      mesh.userData.i = i;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: i === S.target ? 0x8f520a : 0x14171c, transparent: true, opacity: i === S.target ? 0.95 : 0.28 }));
      mesh.add(edges);
      group.add(mesh); meshes.push(mesh);
      placed.push({ ...r, top: base + hgt });
    }
  });
  const top = placed.reduce((a, p) => Math.max(a, p.top), 0);
  controls.target.set(0, top * 0.45, 0);
  renderLegend();
}
function renderLegend() {
  const ol = $("#legend3d"); ol.replaceChildren();
  S.layers.map((l, i) => i).reverse().forEach(i => {
    const l = S.layers[i];
    ol.append(h("li", { "data-i": i, class: [i === S.target ? "target" : "", warnSet.has(i) ? "warn" : "", i === hoverI ? "hover" : ""].join(" ").trim() || null, onmouseenter: () => hover(i), onmouseleave: () => hover(-1) },
      h("span", { class: "sw", style: `background:${fillOf(l)}` }),
      h("span", null, h("b", null, l.mat || "?"), ` ${ROLES[l.role] || ""}`),
      h("span", { class: "th" }, `${fmt(l.t, l.t < 10 ? 1 : 0)} nm`)));
  });
  $("#stage-title").textContent = `${DEVICES[S.device]?.label || "소자"} 구조`;
}
function hover(i) {
  hoverI = i;
  document.querySelectorAll("#legend3d li").forEach(li => li.classList.toggle("hover", +li.dataset.i === i));
}
function resize3D() {
  const w = canvas.clientWidth, hh = canvas.clientHeight;
  if (!w || !hh) return;
  renderer.setSize(w, hh, false); camera.aspect = w / hh;
  const far = camera.aspect < 1.3 ? 1.4 : 1;
  camera.position.set(3.4 * far, 2.6 * far, 3.8 * far); camera.updateProjectionMatrix();
}
new ResizeObserver(resize3D).observe(canvas);
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
canvas.addEventListener("pointermove", e => {
  const r = canvas.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(meshes, false)[0];
  hover(hit ? hit.object.userData.i : -1);
});
canvas.addEventListener("pointerleave", () => hover(-1));
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
renderer.setAnimationLoop(time => {
  controls.update();
  const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time / 320);
  for (const m of meshes) {
    const i = m.userData.i;
    if (warnSet.has(i)) m.material.emissive.setRGB(0.55 * pulse, 0.05 * pulse, 0.02 * pulse);
    else if (i === hoverI) m.material.emissive.setRGB(0.12, 0.1, 0.06);
    else if (i === S.target) m.material.emissive.setRGB(0.1, 0.05, 0.0);
    else m.material.emissive.setRGB(0, 0, 0);
  }
  renderer.render(scene, camera);
});
$("#explode").addEventListener("click", e => { explode = !explode; e.currentTarget.setAttribute("aria-pressed", String(explode)); build3D(); });

/* ---------------- warnings ---------------- */
let warnings = [];
function checkDesign(ctx) {
  const out = [];
  S.layers.forEach((l, i) => {
    const k = normKey(l.mat), info = matInfo(l.mat);
    const add = (title, detail, qa) => out.push({ i, title, detail, qa });
    if (l.role === "fe" && (k === "hzo" || k === "hfo2" || k === "zro2")) {
      if (l.t < 5) add(`${l.mat} ${fmt(l.t)} nm: 분극이 크게 줄어드는 두께`, "5 nm 아래에서는 계면 층과 정방정상의 비중이 커져 분극이 급히 줄어듭니다. 모은 논문에서도 3 nm, 5 nm 값이 크게 낮습니다.", "thin");
      if (l.t > 20) add(`${l.mat} ${fmt(l.t)} nm: 강유전성이 사라지기 쉬운 두께`, "20 nm를 넘으면 결정립이 커지면서 강유전성이 없는 단사정상이 늘어납니다. 모은 논문 중 40 nm 단일층은 2Pr 2.1 µC/cm²였습니다.", "thick");
    }
    if ((l.role === "channel" || l.role === "player") && l.t < 3) add(`${l.mat} ${fmt(l.t)} nm: 연속막이 안 될 수 있는 두께`, "3 nm 아래 박막은 섬 형태로 자라 막이 끊기기 쉽고, 끊기면 전류 경로가 사라집니다.", "island");
    if ((l.role === "channel" || l.role === "player") && l.t > 50) add(`${l.mat} ${fmt(l.t)} nm: 채널을 끄기 어려운 두께`, "채널이 두꺼우면 게이트 전계가 반대쪽까지 닿지 않아 꺼진 상태에서도 전류가 흐르기 쉽습니다.", "thickch");
    if (l.role === "ins" && k === "sio2" && l.t < 3 && i > 1) add(`SiO2 ${fmt(l.t)} nm: 터널링 누설이 커지는 두께`, "3 nm 아래 SiO2는 전자가 절연막을 직접 터널링해 누설 전류가 급격히 늘어납니다.", "tunnel");
    if ((l.role === "gate" || l.role === "electrode") && l.t < 10) add(`${l.mat || "금속"} ${fmt(l.t)} nm: 전극 저항이 커지는 두께`, "10 nm 아래 금속막은 표면과 결정립계 산란으로 저항이 커지고 끊기기 쉽습니다.", "metal");
    if (info && info.type === "metal" && (l.role === "channel" || l.role === "fe" || l.role === "ins")) add(`${l.mat}를 ${ROLES[l.role]}으로 지정함`, `${l.mat}는 금속이라 ${ROLES[l.role]} 역할을 할 수 없습니다. 역할이나 물질을 확인하세요.`, "role");
  });
  const hasGate = S.layers.some(l => l.pat === "gate" && l.role === "gate"), hasCh = S.layers.some(l => l.pat === "channel");
  if (hasGate && hasCh && (S.device === "fefet" || S.device === "tft") && S.geo.Lg < S.geo.L) {
    const gi = S.layers.findIndex(l => l.pat === "gate" && l.role === "gate");
    out.push({ i: gi, title: `게이트 ${fmt(S.geo.Lg)} µm가 채널 ${fmt(S.geo.L)} µm보다 짧음`, detail: "게이트가 덮지 못한 채널 부분은 전압으로 켜지지 않아 직렬 저항이 되고 전류가 크게 줄어듭니다.", qa: "gate" });
  }
  if (ctx && ctx.data) {
    const l = targetLayer(), ts = ctx.allT;
    if (l.t < ts[0] || l.t > ts[ts.length - 1]) out.push({ i: S.target, title: `${fmt(l.t)} nm는 모은 논문 범위(${fmt(ts[0], 0)}~${fmt(ts[ts.length - 1], 0)} nm) 밖`, detail: "논문 값이 없는 두께라 예측이 경향을 늘려 본 추정입니다. 이 두께로 가려면 먼저 범위 안 조건과 함께 시험하세요.", qa: "extrap" });
  }
  return out;
}
function renderWarnings() {
  const box = $("#warns"); box.replaceChildren();
  warnSet = new Set(warnings.map(w => w.i));
  for (const w of warnings) box.append(h("div", { class: "warn-item" }, h("b", null, w.title), h("div", null, w.detail), h("button", { type: "button", onclick: () => openQA(`warn:${warnings.indexOf(w)}`) }, "왜 그런지 묻기")));
  markWarnRows(); renderLegend();
}
function markWarnRows() { document.querySelectorAll("#layers tbody tr").forEach(tr => tr.classList.toggle("warn", warnSet.has(+tr.dataset.i))); }

/* ---------------- analysis ---------------- */
const dsCache = new Map(), fitCache = new Map();
async function loadDataset(key) {
  if (!DATASETS[key]) return null;
  if (!dsCache.has(key)) dsCache.set(key, fetch(DATASETS[key]).then(r => r.json()).catch(() => null));
  return dsCache.get(key);
}
function predictWith(model, boots, ts, b, tauLeft) {
  return ts.map(t => {
    const mu = model.a + M.shape(t, model.th) + b;
    let v = 0;
    if (boots && boots.length) { const m = boots.map(q => q.a + M.shape(t, q.th)); const mean = m.reduce((x, y) => x + y, 0) / m.length; v = m.reduce((x, y) => x + (y - mean) ** 2, 0) / m.length; }
    const sd = Math.sqrt(v + tauLeft + model.sigma2);
    return { t, mu, sd, med: Math.exp(mu), lo: Math.exp(mu - 1.2816 * sd), hi: Math.exp(mu + 1.2816 * sd) };
  });
}
const success = (pred, goal, dir) => pred.map(p => ({ t: p.t, p: dir === "ge" ? 1 - M.Phi((Math.log(goal) - p.mu) / p.sd) : M.Phi((Math.log(goal) - p.mu) / p.sd) }));

function getFit(key, papers) {
  const sig = key + JSON.stringify(papers.map(p => p.points));
  if (fitCache.has(sig)) return fitCache.get(sig);
  const pts = []; papers.forEach((q, j) => q.points.forEach(([t, y]) => { if (t > 0 && y > 0) pts.push({ p: j, t, y }); }));
  const model = M.fit(pts, papers.length);
  const boots = M.bootstrap(pts, papers.length, model, 60);
  const r = { model, boots, pts }; fitCache.set(sig, r); return r;
}

let ctx = null, timer = null;
function scheduleAnalyze() { clearTimeout(timer); timer = setTimeout(analyze, 180); }
function changed(reanalyze) { save(); build3D(); warnings = checkDesign(ctx); renderWarnings(); renderGoal(); if (reanalyze !== false) scheduleAnalyze(); }

async function analyze() {
  const l = targetLayer(), p = propOf(l);
  if (!p) { ctx = null; renderNoTarget(); return; }
  const key = keyOf(l, p), ds = await loadDataset(key);
  const extra = S.extra[key] || [], mine = S.results[key] || [];
  const extraPapers = extra.length ? Object.values(extra.reduce((acc, e) => { (acc[e.ref] ||= { id: "extra-" + e.ref, ref: e.ref, title: e.ref, points: [], user: true }).points.push([e.t, e.y]); return acc; }, {})) : [];
  const papers = (ds ? ds.papers : []).concat(extraPapers);
  const nPts = papers.reduce((a, q) => a + q.points.length, 0);
  const goal = goalOf(l, p);
  ctx = { l, p, key, ds, papers, goal, mine, data: nPts >= 3 && papers.length >= 2 };
  if (ctx.data) {
    const all = papers.flatMap(q => q.points.map(x => x[0])).sort((a, b) => a - b);
    ctx.allT = all;
    const tMax = Math.max(45, all[all.length - 1] + 5);
    const ts = []; for (let t = 1; t <= tMax + 1e-9; t += 0.5) ts.push(round05(t));
    ctx.ts = ts;
    const base = getFit(key, papers);
    ctx.fit = base;
    ctx.prior = predictWith(base.model, base.boots, ts, 0, base.model.tau2);
    ctx.pPrior = success(ctx.prior, goal, p.dir);
    if (mine.length) {
      const withMine = papers.concat([{ id: "mine", ref: "내 실험", points: mine.map(r => [r.t, r.y]), mine: true }]);
      const f2 = getFit(key + "|mine", withMine), j = withMine.length - 1;
      const tauPost = 1 / (1 / f2.model.tau2 + mine.length / f2.model.sigma2);
      ctx.fit2 = f2;
      ctx.post = predictWith(f2.model, f2.boots, ts, f2.model.b[j], tauPost);
      ctx.pPost = success(ctx.post, goal, p.dir);
    } else { ctx.post = null; ctx.pPost = null; }
  }
  warnings = checkDesign(ctx); renderWarnings();
  renderStep2(); renderStep3(); renderStep4(); renderCheck(); renderQAList();
}

/* ---------------- charts ---------------- */
const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
function axes(svg, W, H, m, xr, yr, xl, yl, xticks, yticks, yfmt) {
  const X = v => m.l + (v - xr[0]) / (xr[1] - xr[0]) * (W - m.l - m.r), Y = v => m.t + (1 - (v - yr[0]) / (yr[1] - yr[0])) * (H - m.t - m.b);
  const g = s("g", { "font-family": "'Barlow Condensed', 'Pretendard Variable', sans-serif", "font-size": 16, fill: "#6B6F76" });
  for (const v of yticks) { g.append(s("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: "#CBC3B3" })); g.append(s("text", { x: m.l - 8, y: Y(v) + 5, "text-anchor": "end" }, yfmt ? yfmt(v) : v)); }
  for (const v of xticks) g.append(s("text", { x: X(v), y: H - m.b + 22, "text-anchor": "middle" }, v));
  g.append(s("text", { x: W - m.r, y: H - 6, "text-anchor": "end", "font-family": "'Pretendard Variable', sans-serif", "font-size": 13 }, xl));
  if (yl) g.append(s("text", { x: m.l, y: 12, "font-family": "'Pretendard Variable', sans-serif", "font-size": 13 }, yl));
  svg.append(g);
  return { X, Y };
}
const pathOf = (pts, X, Y) => pts.map((q, i) => `${i ? "L" : "M"}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join("");

function drawLit() {
  const svg = $("#lit-chart"); svg.replaceChildren();
  const W = 640, H = 360, m = { l: 52, r: 16, t: 24, b: 40 };
  const { p, papers, goal, mine } = ctx;
  const allY = papers.flatMap(q => q.points.map(x => x[1])).concat(mine.map(r => r.y), [goal]);
  const allT = papers.flatMap(q => q.points.map(x => x[0])).concat(mine.map(r => r.t));
  const xmax = Math.max(45, Math.ceil(((allT.length ? Math.max(...allT) : 40) + 5) / 5) * 5);
  let ymax = Math.max(...allY, 1) * 1.3;
  const band = ctx.post || ctx.prior;
  const step = ymax > 120 ? 40 : ymax > 60 ? 20 : ymax > 25 ? 10 : 5;
  ymax = Math.ceil(ymax / step) * step;
  const yt = []; for (let v = 0; v <= ymax; v += step) yt.push(v);
  const xt = []; for (let v = 0; v <= xmax; v += 10) xt.push(v);
  const { X, Y } = axes(svg, W, H, m, [0, xmax], [0, ymax], "두께 (nm)", `${p.label}${p.unit ? ` (${p.unit})` : ""}`, xt, yt);
  const clip = v => Math.min(ymax, v);
  if (band) {
    const b = band.filter(q => q.t <= xmax);
    const poly = b.map(q => [q.t, clip(q.hi)]).concat(b.slice().reverse().map(q => [q.t, clip(q.lo)]));
    svg.append(s("path", { d: pathOf(poly, X, Y) + "Z", fill: "rgba(143,82,10,0.13)" }));
    svg.append(s("path", { d: pathOf(b.map(q => [q.t, clip(q.med)]), X, Y), fill: "none", stroke: "#8F520A", "stroke-width": 2.2 }));
  }
  svg.append(s("line", { x1: m.l, x2: W - m.r, y1: Y(goal), y2: Y(goal), stroke: "#14171C", "stroke-dasharray": "6 5", "stroke-width": 1.4 }));
  svg.append(s("text", { x: W - m.r - 4, y: Y(goal) - 7, "text-anchor": "end", "font-family": "'Pretendard Variable', sans-serif", "font-size": 13, fill: "#14171C" }, `목표 ${goal}`));
  papers.forEach((q, j) => {
    const col = q.user ? "#14171C" : PALETTE[j % PALETTE.length];
    if (q.points.length > 1) svg.append(s("path", { d: pathOf(q.points.slice().sort((a, b) => a[0] - b[0]), X, Y), fill: "none", stroke: col, "stroke-width": 1.2, "stroke-opacity": 0.6 }));
    for (const [t, y] of q.points) svg.append(s("circle", { cx: X(t), cy: Y(clip(y)), r: 5.5, fill: col, stroke: "#F1EDE4", "stroke-width": 1.5 }));
  });
  for (const r of mine) svg.append(s("rect", { x: X(r.t) - 7, y: Y(clip(r.y)) - 7, width: 14, height: 14, fill: "#14171C", stroke: "#F1EDE4", "stroke-width": 2 }));
  const lt = targetLayer().t;
  if (lt <= xmax) svg.append(s("line", { x1: X(lt), x2: X(lt), y1: m.t, y2: H - m.b, stroke: "#14171C", "stroke-opacity": 0.35, "stroke-dasharray": "2 4" }));
  const lg = $("#lit-legend"); lg.replaceChildren();
  if (band) lg.append(h("span", null, h("i", { style: "background:rgba(143,82,10,0.35)" }), ctx.post ? "내 실험까지 반영한 예측 (80% 범위)" : "논문으로 본 예측 (80% 범위)"));
  lg.append(h("span", null, h("i", { style: "background:#3E6E8E;border-radius:50%" }), "논문 값 (논문마다 색 다름)"));
  if (mine.length) lg.append(h("span", null, h("i", { style: "background:#14171C" }), "내 실험"));
  lg.append(h("span", null, "점선 세로선: 지금 입력한 두께"));
}
function drawP(curve, mark) {
  const svg = $("#p-chart"); svg.replaceChildren();
  if (!curve) { svg.append(s("text", { x: 320, y: 130, "text-anchor": "middle", "font-family": "'Pretendard Variable', sans-serif", "font-size": 15, fill: "#6B6F76" }, "논문 데이터가 없어 확률을 계산하지 않습니다")); return; }
  const W = 640, H = 260, m = { l: 52, r: 16, t: 16, b: 40 };
  const xmax = Math.max(45, ctx.ts[ctx.ts.length - 1]);
  const c = curve.filter(q => q.t <= xmax);
  const xt = []; for (let v = 0; v <= xmax; v += 10) xt.push(v);
  const { X, Y } = axes(svg, W, H, m, [0, xmax], [0, 1], "두께 (nm)", null, xt, [0, 0.25, 0.5, 0.75, 1], v => `${Math.round(v * 100)}%`);
  const [wlo, whi, wlabel] = ruleWindow(targetLayer());
  const zone = (a, b) => { if (b <= a) return; svg.append(s("rect", { x: X(a), y: m.t, width: X(b) - X(a), height: H - m.t - m.b, fill: "rgba(163,38,27,0.08)" })); };
  zone(0, Math.min(wlo, xmax)); zone(Math.max(0, Math.min(whi, xmax)), xmax);
  if (wlabel) svg.append(s("text", { x: whi < xmax ? X(Math.min(xmax, (whi + xmax) / 2)) : X(wlo / 2), y: m.t + 16, "text-anchor": "middle", "font-family": "'Pretendard Variable', sans-serif", "font-size": 12, fill: "#A3261B" }, "경고 구간, 후보 제외"));
  svg.append(s("path", { d: pathOf([[c[0].t, 0], ...c.map(q => [q.t, q.p]), [c[c.length - 1].t, 0]], X, Y) + "Z", fill: "rgba(143,82,10,0.14)" }));
  svg.append(s("path", { d: pathOf(c.map(q => [q.t, q.p]), X, Y), fill: "none", stroke: "#8F520A", "stroke-width": 2.4 }));
  if (ctx.pPost && curve === ctx.pPost) svg.append(s("path", { d: pathOf(ctx.pPrior.filter(q => q.t <= xmax).map(q => [q.t, q.p]), X, Y), fill: "none", stroke: "#6B6F76", "stroke-width": 1.4, "stroke-dasharray": "5 5" }));
  if (mark) {
    const q = c.find(x => x.t === mark) || c.reduce((a, b) => (Math.abs(b.t - mark) < Math.abs(a.t - mark) ? b : a));
    svg.append(s("circle", { cx: X(q.t), cy: Y(q.p), r: 7, fill: "#14171C", stroke: "#F1EDE4", "stroke-width": 2.5 }));
    svg.append(s("text", { x: X(q.t) + 10, y: Y(q.p) - 10, "font-family": "'Barlow Condensed', sans-serif", "font-size": 18, "font-weight": 700, fill: "#14171C" }, `${q.t} nm, ${Math.round(q.p * 100)}%`));
  }
}

/* ---------------- steps 2–5 ---------------- */
const yearOf = r => (String(r).match(/\((\d{4})\)/) || [])[1];
function renderStep2() {
  const { l, p, ds, papers } = ctx, mat = l.mat || "(물질)";
  const sub = $("#s2-sub"), tbl = $("#lit-table"), ex = $("#excluded");
  tbl.replaceChildren(); ex.replaceChildren(); ex.hidden = true;
  if (!papers.length) {
    sub.textContent = `${mat} ${p.label}에 대해 정리된 논문 데이터가 아직 없습니다. 아래에서 관련 논문을 찾고, 논문에 적힌 두께와 값을 직접 넣으면 바로 계산합니다.`;
  } else {
    const ys = papers.map(q => yearOf(q.ref)).filter(Boolean).map(Number);
    const n = papers.reduce((a, q) => a + q.points.length, 0);
    sub.textContent = `${mat} ${p.label}: 논문 ${papers.length}편에서 두께별 값 ${n}개를 모았습니다${ys.length ? ` (${Math.min(...ys)}~${Math.max(...ys)}년)` : ""}. ${ds && ds.note ? ds.note : ""}`;
    tbl.append(h("thead", null, h("tr", null, h("th", { style: "width:46%" }, "논문"), h("th", { style: "width:38%" }, "두께 → 값"), h("th", null, "전극"))));
    const tb = h("tbody");
    papers.forEach((q, j) => tb.append(h("tr", null,
      h("td", null, h("span", { class: "dot", style: `background:${q.user ? "#14171C" : PALETTE[j % PALETTE.length]}` }), q.url ? h("a", { href: q.url, target: "_blank", rel: "noopener" }, q.ref) : q.ref,
        h("span", { class: "src" }, q.src || (q.user ? "직접 입력" : ""))),
      h("td", { class: "v" }, ...q.points.map(([t, y]) => h("span", { class: "pt" }, `${t} nm → ${y}`))),
      h("td", null, q.electrode || "–"))));
    tbl.append(tb);
    if (ds && ds.excluded && ds.excluded.length) {
      ex.hidden = false;
      ex.append(h("summary", null, `뺀 논문 ${ds.excluded.length}건과 이유`), h("ul", null, ...ds.excluded.map(e => h("li", null, `${e.ref}: ${e.why}`))));
    }
  }
  if (ctx.data) drawLit(); else { $("#lit-chart").replaceChildren(); $("#lit-legend").replaceChildren(); if (papers.length) drawLit(); }
  renderExtra();
  $("#oa-list").replaceChildren();
}
function renderExtra() {
  const ul = $("#extra-list"); ul.replaceChildren();
  const arr = S.extra[ctx.key] || [];
  arr.forEach((e, k) => ul.append(h("li", null, `${e.ref}: ${e.t} nm → ${e.y}`, h("button", { type: "button", onclick: () => { arr.splice(k, 1); save(); scheduleAnalyze(); } }, "지우기"))));
}
// thickness window the design rules allow for this layer (same rules as the warnings)
function ruleWindow(l) {
  const k = normKey(l.mat), info = matInfo(l.mat);
  if (l.role === "fe" && (k === "hzo" || k === "hfo2" || k === "zro2")) return [5, 20, "강유전막 경고 구간(5 nm 미만, 20 nm 초과)"];
  if (l.role === "channel" || l.role === "player") return [3, 50, "채널 경고 구간(3 nm 미만, 50 nm 초과)"];
  if (l.role === "ins" && k === "sio2") return [3, Infinity, "SiO2 3 nm 미만"];
  if (l.role === "gate" || l.role === "electrode" || info?.type === "metal") return [10, Infinity, "금속 10 nm 미만"];
  return [0, Infinity, null];
}
function planFrom(curve, tested, l) {
  const [wlo, whi] = ruleWindow(l);
  let free = curve.filter(q => !tested.some(t => Math.abs(t - q.t) < 0.99) && q.t >= wlo && q.t <= whi);
  if (!free.length) free = curve.filter(q => !tested.some(t => Math.abs(t - q.t) < 0.99));
  const best = free.reduce((a, b) => (b.p > a.p + 1e-6 ? b : a), free[0]);
  const top = Math.max(...curve.map(q => q.p));
  const good = curve.filter(q => q.p >= 0.85 * top);
  const half = good.length ? (good[good.length - 1].t - good[0].t) / 2 : 3;
  const d = Math.max(2, round05(Math.min(5, half)));
  const lo = ctx.allT[0], hi = ctx.allT[ctx.allT.length - 1];
  const lo2 = Math.max(lo, wlo), hi2 = Math.min(hi, whi);
  const pick = t => { const tt = Math.min(hi2, Math.max(lo2, round05(t))); return curve.reduce((a, b) => (Math.abs(b.t - tt) < Math.abs(a.t - tt) ? b : a)); };
  return { best, thin: pick(best.t - d), thick: pick(best.t + d), d };
}
function cyclesText(t, l) {
  if (l.method !== "ALD" && l.method !== "PEALD") return null;
  const g = S.gpc[l.method] || 0.1;
  return `${Math.round(t / g)} 사이클`;
}
function renderStep3() {
  const { l, p, goal, mine } = ctx, plan = $("#plan"), sub = $("#s3-sub"), gp = $("#gpc");
  plan.replaceChildren(); gp.replaceChildren();
  if (l.method === "ALD" || l.method === "PEALD") {
    gp.append(h("label", null, `${l.method} 1사이클당 두께 (nm)`, h("input", { type: "number", step: "0.001", min: "0.001", value: S.gpc[l.method] ?? 0.1, oninput: e => { const v = parseFloat(e.target.value); if (v > 0) { S.gpc[l.method] = v; save(); renderStep3(); } } })),
      h("p", { class: "hint", style: "margin:0;align-self:end;font-size:14px;color:var(--muted)" }, "기본값 0.1은 가정값입니다. 장비에서 잰 값으로 바꾸면 사이클 수가 맞춰집니다."));
  }
  const item = (cls, t, prob, why, crit) => h("li", { class: cls },
    h("div", { class: "big" }, h("span", { class: "t" }, fmt(t, t % 1 ? 1 : 0), h("small", null, "nm")), cyclesText(t, l) ? h("span", { class: "c" }, cyclesText(t, l)) : null, prob != null ? h("span", { class: "p" }, "목표 달성 확률 ", h("b", null, `${Math.round(prob * 100)}%`)) : null),
    h("p", { class: "why" }, why), crit ? h("p", { class: "crit" }, crit) : null);
  const crit = `넘어갈 기준: ${p.label} ${goal}${p.unit ? ` ${p.unit}` : ""} ${p.dir === "ge" ? "이상" : "이하"}. 측정: ${p.measure}.`;
  if (!ctx.data) {
    const [a, b] = RANGE[l.role] || [5, 20], mid = round05((a + b) / 2);
    sub.textContent = "모은 논문 값이 3개보다 적어 확률을 계산할 수 없습니다. 일반적인 두께 범위를 세 점으로 나눠 경향부터 확인하는 계획입니다. 논문 값을 추가하면 이 계획이 바로 바뀝니다.";
    plan.append(item("first", mid, null, "일반 범위의 가운데. 먼저 이 두께로 기준값을 잡습니다.", crit), item("", a, null, "더 얇은 쪽 경향 확인.", null), item("", b, null, "더 두꺼운 쪽 경향 확인.", null));
    drawP(null); $("#r-t").value = mid; return;
  }
  const curve = ctx.pPost || ctx.pPrior, tested = mine.map(r => r.t);
  const met = mine.find(r => (p.dir === "ge" ? r.y >= goal : r.y <= goal));
  const P = planFrom(curve, tested, l);
  if (met) {
    sub.textContent = `${met.t} nm에서 목표를 넘었습니다. 같은 조건으로 재현성을 확인하고, 필요하면 주변 두께로 여유 폭을 봅니다.`;
    plan.append(item("first", met.t, null, "같은 조건으로 한 번 더 만들어 재현되는지 확인합니다.", crit), item("", P.best.t, P.best.p, "남은 두께 중 예측이 가장 좋은 곳. 여유 폭 확인용입니다.", null));
    drawP(curve, met.t); $("#r-t").value = met.t; return;
  }
  const n = ctx.papers.length;
  if (!mine.length) {
    const wl = ruleWindow(l)[2];
    sub.textContent = `논문 ${n}편의 경향으로 계산한 두께별 목표 달성 확률이 가장 높은 곳부터 제시합니다.${wl ? ` ${wl}은 확률과 상관없이 후보에서 뺐습니다.` : ""} 1단계 결과를 넣으면 2단계부터 다시 계산합니다.`;
    plan.append(
      item("first", P.best.t, P.best.p, `논문 경향상 목표를 넘길 확률이 가장 높은 두께입니다. 먼저 이 조건으로 한 번 만듭니다.`, crit),
      item("", P.thin.t, P.thin.p, `1단계와 같이 보면 얇은 쪽으로 갈수록 좋아지는지 나빠지는지 알 수 있습니다.`, null),
      item("", P.thick.t, P.thick.p, `두꺼운 쪽 경향 확인. 1단계 결과가 목표를 넘으면 2, 3단계는 건너뛰어도 됩니다.`, null));
  } else {
    const before = ctx.pPrior.find(q => q.t === P.best.t)?.p;
    sub.textContent = `내 실험 ${mine.length}회를 반영해 다시 계산했습니다. 이미 해 본 두께는 빼고 다음으로 가능성이 높은 두께를 제시합니다.`;
    mine.forEach(r => plan.append(h("li", { class: "done first" }, h("div", { class: "big" }, h("span", { class: "t" }, fmt(r.t, r.t % 1 ? 1 : 0), h("small", null, "nm")), h("span", { class: "c" }, `측정 ${r.y}${p.unit ? ` ${p.unit}` : ""}`)), h("p", { class: "why" }, "완료한 실험"))));
    plan.append(item("", P.best.t, P.best.p, `내 결과로 우리 공정 수준을 맞춘 뒤 가장 가능성이 높은 두께입니다.${before != null ? ` 논문만 봤을 때는 ${Math.round(before * 100)}%였습니다.` : ""}`, crit));
  }
  drawP(curve, P.best.t);
  $("#r-t").value = P.best.t;
}
function renderStep4() {
  const { p, mine } = ctx;
  $("#r-y-label").textContent = `측정한 ${p.label}${p.unit ? ` (${p.unit})` : ""}`;
  const ul = $("#results"); ul.replaceChildren();
  mine.forEach((r, k) => ul.append(h("li", null, `${r.t} nm → ${r.y}${p.unit ? ` ${p.unit}` : ""}`, h("button", { type: "button", onclick: () => { mine.splice(k, 1); if (!mine.length) delete S.results[ctx.key]; save(); scheduleAnalyze(); } }, "지우기"))));
  const up = $("#update"); up.replaceChildren();
  if (ctx.data && ctx.post) {
    const width = arr => { const q = arr.find(x => x.t === round05(targetLayer().t)) || arr[Math.floor(arr.length / 3)]; return q.hi / q.lo; };
    const w0 = width(ctx.prior), w1 = width(ctx.post);
    up.append(h("p", null, "예측 범위 폭 (위아래 비): ", h("span", { class: "delta" }, `${fmt(w0, 1)}배 → ${fmt(w1, 1)}배`)),
      h("p", { style: "font-size:14px;color:var(--muted)" }, "범위가 좁아질수록 다음 추천을 더 믿을 수 있습니다. 논문 연구실 간 차이가 내 결과로 대체되기 때문입니다."));
  }
}
function renderCheck() {
  const box = $("#check"); box.replaceChildren();
  if (!ctx.ds || !ctx.data) { box.append(h("p", { class: "check-note" }, "이 물질과 지표는 정리된 논문 데이터가 없어 검증 수치를 낼 수 없습니다. 지금은 일반 범위로 시작하는 계획만 보여 줍니다.")); return; }
  const L = ctx.ds.lopo || (lopoCache[ctx.key] ||= M.lopo({ papers: ctx.ds.papers }));
  box.append(
    h("p", { class: "check-note" }, "논문 한 편을 빼고 나머지로 학습한 뒤, 뺀 논문의 값을 맞히는 방식으로 쟀습니다. 뺀 논문에는 아무것도 맞추지 않았습니다."),
    h("dl", { class: "checks2" },
      h("div", null, h("dt", null, "논문만으로 값 예측"), h("dd", null, `${fmt(L.none.median, 0)}%`, h("small", null, `중앙 오차, ${L.none.n}개 값`))),
      h("div", null, h("dt", null, "비교 기준: 논문 중앙값 그대로"), h("dd", null, `${fmt(L.baseline.median, 0)}%`, h("small", null, "아무 계산 없이 찍었을 때"))),
      h("div", null, h("dt", null, "같은 공정 측정 1회로 보정"), h("dd", null, L.calibrated ? `${fmt(L.calibrated.median, 0)}%` : "–", h("small", null, L.calibrated ? `중앙 오차, ${L.calibrated.n}개 값` : "값이 2개 이상인 논문 없음")))),
    ctx.ds.lopo_history ? h("div", { class: "table-wrap" }, h("table", { class: "lit" }, h("thead", null, h("tr", null, h("th", null, "모델 버전"), h("th", null, "바꾼 점"), h("th", null, "논문만"), h("th", null, "1회 보정"), h("th", null, "기준"))), h("tbody", null, ...ctx.ds.lopo_history.map(r => h("tr", null, h("td", null, r.version), h("td", null, r.change), h("td", { class: "v" }, `${r.none}%`), h("td", { class: "v" }, `${r.calibrated}%`), h("td", { class: "v" }, `${r.baseline}%`)))))) : null,
    h("p", { class: "check-note" }, `데이터가 논문 ${ctx.ds.papers.length}편 ${ctx.ds.papers.reduce((a, q) => a + q.points.length, 0)}개 값뿐이라 지금 추천은 참고용입니다. 모델을 바꿀 때마다 이전 결과도 지우지 않고 함께 남깁니다.`),
    h("p", { class: "check-note" }, "해석: 연구실마다 장비와 공정이 달라 논문 값만으로 절대값을 맞히기는 어렵습니다. 그래서 이 도구는 값을 맞히는 대신 시작 두께와 다음 두께를 안내하고, 내 결과가 들어올수록 우리 공정에 맞춰 범위를 좁힙니다."),
    h("p", { class: "check-note" }, "준비 중인 검증: 논문 그림 속 두께별 데이터를 모아, 이 안내대로 했을 때와 두께를 고르게 바꿔 가며 했을 때 좋은 조건에 도달하기까지 실험 횟수를 비교합니다."));
}
const lopoCache = {};
function renderNoTarget() {
  $("#s2-sub").textContent = "최적화할 층을 골라 주세요."; $("#lit-table").replaceChildren(); $("#lit-chart").replaceChildren(); $("#plan").replaceChildren(); $("#check").replaceChildren(); $("#s3-sub").textContent = "";
}

/* ---------------- OpenAlex ---------------- */
const EN_NAME = { hzo: "Hf0.5Zr0.5O2 HZO", teox: "tellurium oxide TeOx", igzo: "InGaZnO IGZO", al2o3: "Al2O3", sio2: "SiO2" };
$("#oa-search").addEventListener("click", async e => {
  const btn = e.currentTarget, l = targetLayer(), p = propOf(l), list = $("#oa-list");
  const q = `${EN_NAME[normKey(l.mat)] || l.mat} ${METHOD_EN[l.method] || ""} thickness ${p ? p.en : ""}`.replace(/\s+/g, " ").trim();
  btn.disabled = true; list.replaceChildren(h("li", null, "검색 중…"));
  try {
    const r = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=8&select=title,doi,publication_year,cited_by_count,primary_location`);
    const j = await r.json();
    list.replaceChildren(...(j.results || []).map(w => h("li", null,
      w.doi ? h("a", { href: w.doi, target: "_blank", rel: "noopener" }, w.title) : w.title,
      h("span", { class: "meta" }, `${w.publication_year || ""}  ${w.primary_location?.source?.display_name || ""}  인용 ${w.cited_by_count ?? 0}회`))));
    if (!(j.results || []).length) list.replaceChildren(h("li", null, "검색 결과가 없습니다. 물질 이름을 영어로 바꿔 보세요."));
  } catch (err) { list.replaceChildren(h("li", null, "OpenAlex에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.")); }
  btn.disabled = false;
});

/* ---------------- forms ---------------- */
$("#add-data-form").addEventListener("submit", e => {
  e.preventDefault(); if (!ctx) return;
  const f = new FormData(e.target), t = parseFloat(f.get("t")), y = parseFloat(f.get("y")), ref = String(f.get("ref")).trim();
  if (!(t > 0 && y > 0 && ref)) return;
  (S.extra[ctx.key] ||= []).push({ ref, t, y }); save(); e.target.reset(); scheduleAnalyze();
});
$("#result-form").addEventListener("submit", e => {
  e.preventDefault(); if (!ctx) return;
  const f = new FormData(e.target), t = parseFloat(f.get("t")), y = parseFloat(f.get("y"));
  if (!(t > 0 && y > 0)) return;
  (S.results[ctx.key] ||= []).push({ t: round05(t), y }); save(); e.target.querySelector('[name="y"]').value = ""; scheduleAnalyze();
});
$("#add-layer").addEventListener("click", () => { S.layers.push({ role: "pass", mat: "Al2O3", t: 20, method: "ALD", pat: "blanket" }); changed(); renderLayers(); });

/* ---------------- Q&A (rule based, from this page's numbers) ---------------- */
const qaPanel = $("#qa"), qaBtn = $("#qa-open");
function openQA(qid) { qaPanel.hidden = false; qaBtn.setAttribute("aria-expanded", "true"); renderQAList(); if (qid) answer(qid); }
qaBtn.addEventListener("click", () => (qaPanel.hidden ? openQA() : closeQA()));
function closeQA() { qaPanel.hidden = true; qaBtn.setAttribute("aria-expanded", "false"); }
$("#qa-close").addEventListener("click", closeQA);
function questions() {
  const qs = [];
  if (!ctx) return qs;
  const isFE = ctx.l.role === "fe";
  if (ctx.data) {
    const P = planFrom(ctx.pPost || ctx.pPrior, ctx.mine.map(r => r.t), ctx.l);
    qs.push({ id: "why-first", q: `왜 ${P.best.t} nm를 먼저 추천했나요?` });
    qs.push({ id: "range", q: "예측 범위가 왜 이렇게 넓나요?" }, { id: "labs", q: "연구실마다 값이 왜 다른가요?" });
  }
  if (isFE) qs.push({ id: "thick", q: "두꺼우면 왜 분극이 떨어지나요?" }, { id: "thin", q: "얇으면 왜 분극이 떨어지나요?" });
  qs.push({ id: "low", q: "결과가 목표보다 낮게 나오면 어떻게 하나요?" }, { id: "trust", q: "이 안내는 얼마나 믿을 수 있나요?" });
  warnings.forEach((w, k) => qs.push({ id: `warn:${k}`, q: `'${w.title}' 경고는 왜 떴나요?` }));
  return qs;
}
function renderQAList() {
  const ul = $("#qa-q"); if (!ul) return; ul.replaceChildren();
  for (const x of questions().slice(0, 9)) ul.append(h("li", null, h("button", { type: "button", onclick: () => answer(x.id, x.q) }, x.q)));
}
function answerText(id) {
  const c = ctx, p = c?.p, l = c?.l;
  if (id.startsWith("warn:")) { const w = warnings[+id.slice(5)]; return w ? [w.detail, "기준은 일반적으로 알려진 박막 물리 경향이며, 이 화면의 계산값이 아닙니다."] : ["경고가 사라졌습니다."]; }
  switch (id) {
    case "why-first": {
      const curve = c.pPost || c.pPrior, P = planFrom(curve, c.mine.map(r => r.t), l);
      const pred = (c.post || c.prior).find(q => q.t === P.best.t);
      return [`${P.best.t} nm에서 목표(${p.label} ${c.goal}) 이상이 나올 확률이 ${Math.round(P.best.p * 100)}%로 가장 높게 계산됐습니다. 이 두께의 예측 중앙값은 ${fmt(pred.med)}, 80% 범위는 ${fmt(pred.lo)}~${fmt(pred.hi)}${p.unit ? ` ${p.unit}` : ""}입니다.`,
        `근거는 논문 ${c.papers.length}편의 값으로 학습한 두께 경향입니다. 너무 얇으면 계면 층 때문에, 너무 두꺼우면 상이 바뀌어 값이 떨어지는 모양을 가정하고, 그 모양의 위치와 폭은 논문 값에서 정했습니다.`];
    }
    case "range": {
      const m = c.fit.model;
      return [`연구실 간 차이가 가장 큰 원인입니다. 같은 두께에서도 논문마다 값이 평균적으로 약 ${fmt((Math.exp(Math.sqrt(m.tau2 + m.sigma2)) - 1) * 100, 0)}% 정도 흩어집니다.`, "내 실험 결과를 한 번만 넣어도 우리 공정 수준을 알게 되어, 연구실 간 차이 몫이 빠지고 범위가 좁아집니다."];
    }
    case "labs": return ["같은 HZO 두께라도 전극 물질(TiN, W, Mo, Pt), 결정화 열처리 온도와 시간, Zr 비율, 증착 산화제(H2O, O3), 측정 전압과 깨우기 사이클 수가 연구실마다 다릅니다.", "모은 논문에서 10 nm 부근 2Pr은 30.7에서 68.3 µC/cm²까지 두 배 넘게 차이 납니다. 그래서 이 도구는 절대값보다 어느 두께부터 시험할지를 안내합니다."];
    case "thick": return ["HZO가 두꺼워지면 결정립이 커지는데, 큰 결정립에서는 강유전성이 있는 사방정상보다 강유전성이 없는 단사정상이 더 안정해집니다.", "모은 논문 중 Kim 외(2014)는 단일 HZO 40 nm에서 2Pr 2.1 µC/cm²로 크게 떨어졌고, 1 nm Al2O3 층을 중간에 넣어 결정립 성장을 끊으면 다시 회복된다고 보고했습니다."];
    case "thin": return ["얇은 HZO는 전극과 맞닿은 계면 층의 비중이 커지고, 강유전성이 약한 정방정상이 늘어나며, 탈분극 전계도 커집니다.", "모은 논문에서 Smith 외(2018)는 5 nm에서 Pr 2.8 µC/cm²(20 nm에서는 17)로 줄었습니다. 다만 전극과 열처리를 바꿔 5~6 nm에서도 큰 분극을 얻은 연구도 있어 공정 영향이 큽니다."];
    case "low": return ["결과를 4단계에 그대로 넣으세요. 우리 공정 수준을 다시 맞춰 확률을 계산하고, 이미 해 본 두께를 뺀 다음 두께를 추천합니다.", "한 번 결과로는 주로 전체 수준이 바뀌고, 서로 다른 두께로 2~3번 하면 경향(어느 쪽이 좋은지)까지 우리 공정에 맞춰집니다."];
    case "trust": { if (!c.ds || !c.data) return ["이 물질은 정리된 논문 데이터가 없어 검증 수치가 없습니다."]; const L = c.ds.lopo || (lopoCache[c.key] ||= M.lopo({ papers: c.ds.papers })); return [`논문 한 편을 빼고 맞히면 중앙 오차 ${fmt(L.none.median, 0)}%이고, 아무 계산 없이 논문 중앙값을 찍으면 ${fmt(L.baseline.median, 0)}%입니다. 즉 논문만으로 절대값을 맞히는 힘은 약합니다.`, "그래서 값을 맞히는 데 쓰기보다 시작 두께와 다음 두께를 고르는 데 쓰는 것이 맞습니다. 실험 횟수를 얼마나 줄이는지에 대한 검증은 준비 중입니다."]; }
  }
  return ["이 질문은 아직 답할 규칙이 없습니다. 위 목록에서 골라 주세요."];
}
function answer(id, q) {
  const box = $("#qa-a"), qq = q || questions().find(x => x.id === id)?.q || "";
  const ps = answerText(id);
  box.prepend(h("div", null, h("p", { class: "qq" }, qq), ...ps.map(t => h("p", null, t))));
}
$("#qa-form").addEventListener("submit", e => {
  e.preventDefault(); const v = $("#qa-in").value.trim(); if (!v) return;
  const rules = [[/두꺼|thick/, "thick"], [/얇|thin/, "thin"], [/연구실|장비|다르|차이/, "labs"], [/범위|넓|불확/, "range"], [/믿|정확|오차/, "trust"], [/낮|실패|안 나/, "low"], [/추천|먼저|왜.*nm/, "why-first"]];
  let id = null; for (const [re, k] of rules) if (re.test(v)) { id = k; break; }
  if (id && !questions().some(x => x.id === id)) id = null;
  const box = $("#qa-a");
  if (id) answer(id, v);
  else if (/열|온도|발열/.test(v)) box.prepend(h("div", null, h("p", { class: "qq" }, v), h("p", null, "열 분포 계산은 아직 이 도구에 넣지 않았습니다. 지금 답할 수 있는 근거가 없습니다.")));
  else if (/이동도/.test(v)) box.prepend(h("div", null, h("p", { class: "qq" }, v), h("p", null, "이동도 데이터는 아직 정리하지 않아 이 화면의 계산으로 답할 수 없습니다. 일반 원리로는 채널이 얇을수록 계면 거칠기와 결함 산란 비중이 커져 이동도가 낮아지기 쉽습니다."), h("p", { class: "src" }, "일반 원리, 이 화면의 계산값 아님")));
  else box.prepend(h("div", null, h("p", { class: "qq" }, v), h("p", null, "이 질문은 아직 답할 규칙이 없습니다. 위 목록에서 골라 주세요.")));
  $("#qa-in").value = "";
});

/* ---------------- boot ---------------- */
function renderAll() { renderRoles(); renderGeo(); renderLayers(); renderGoal(); build3D(); warnings = checkDesign(ctx); renderWarnings(); scheduleAnalyze(); }
$("#matlist").append(...Object.values(MATS).map(m => h("option", { value: m.name })));
resize3D();
renderAll();
