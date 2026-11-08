/* DepoLens thickness model
 * Property vs thickness for one material and process, learned from literature points.
 *   ln y = a + f(t; θ) + b_paper + ε
 *   f = ln(1 − e^{−(t−t0)/λ}) − ln(1 + e^{(t−tm)/w})   (rise from a dead layer, fall past a phase limit)
 *   b_paper ~ N(0, τ²): how much better or worse each lab's process is
 *   ε ~ N(0, σ²): measurement scatter inside one paper
 * The shape θ = (t0, λ, tm, w) is found by grid search; a and b by ridge regression.
 * Uncertainty for a new process = bootstrap over papers + τ² + σ².
 */
(function (root) {
  "use strict";

  const shape = (t, th) => {
    const [t0, lam, tm, w] = th;
    // floor at 2% of the peak: measured values rarely fall below that, and a deeper floor
    // lets one near-zero point dominate the log-space fit
    const FLOOR = Math.log(0.02);
    if (t <= t0 + 1e-6) return FLOOR;
    const rise = Math.log(1 - Math.exp(-(t - t0) / lam));
    const fall = Math.log(1 + Math.exp((t - tm) / w));
    return Math.max(FLOOR, rise - fall);
  };

  function grid(coarse) {
    const t0s = coarse ? [0, 1, 2] : [0, 0.5, 1, 1.5, 2, 2.5];
    const lams = coarse ? [1, 2.5, 5] : [0.75, 1.5, 2.5, 4, 6];
    const tms = coarse ? [12, 18, 25, 32, 40] : [10, 13, 16, 19, 22, 25, 28, 32, 36, 40, 45];
    const ws = coarse ? [2, 4, 7] : [1.5, 2.5, 4, 6, 8];
    const out = [];
    for (const a of t0s) for (const b of lams) for (const c of tms) for (const d of ws) out.push([a, b, c, d]);
    return out;
  }

  // points: [{p: paperIndex, t, y}] with y > 0
  function fitGiven(points, nP, th, k) {
    const f = points.map(q => shape(q.t, th));
    const ly = points.map(q => Math.log(q.y));
    let a = 0, b = new Float64Array(nP);
    for (let it = 0; it < 30; it++) {
      let s = 0;
      for (let i = 0; i < points.length; i++) s += ly[i] - f[i] - b[points[i].p];
      a = s / points.length;
      const sum = new Float64Array(nP), cnt = new Float64Array(nP);
      for (let i = 0; i < points.length; i++) { sum[points[i].p] += ly[i] - a - f[i]; cnt[points[i].p]++; }
      for (let j = 0; j < nP; j++) b[j] = cnt[j] ? sum[j] / (cnt[j] + k) : 0;
    }
    let sse = 0, pen = 0;
    for (let i = 0; i < points.length; i++) { const r = ly[i] - a - f[i] - b[points[i].p]; sse += r * r; }
    for (let j = 0; j < nP; j++) pen += k * b[j] * b[j];
    return { a, b, sse, loss: sse + pen };
  }

  // sigma (scatter inside one lab: sample-to-sample and measurement) is a stated assumption, SIGMA_IN;
  // with most papers giving one or two points it cannot be estimated from the data itself.
  // tau (lab-to-lab difference) is estimated from the paper offsets.
  const SIGMA_IN = 0.15;
  function fit(points, nP, opts = {}) {
    const G = grid(opts.coarse);
    const sigma2 = (opts.sigmaIn ?? SIGMA_IN) ** 2;
    let tau2 = opts.tau2 ?? 0.16, best = null;
    for (let round = 0; round < (opts.coarse ? 1 : 4); round++) {
      const k = sigma2 / tau2;
      best = null;
      for (const th of G) {
        const r = fitGiven(points, nP, th, k);
        if (!best || r.loss < best.loss) best = { th, ...r };
      }
      best.k = k; best.sigma2 = sigma2; best.tau2 = tau2;
      if (opts.coarse) break;
      const used = [...new Set(points.map(q => q.p))];
      let sb = 0; for (const j of used) sb += best.b[j] * best.b[j];
      tau2 = Math.max(0.01, sb / Math.max(1, used.length - 1));
    }
    return best;
  }

  // deterministic RNG for repeatable bootstrap
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function bootstrap(points, nP, base, n = 80) {
    const papers = [...new Set(points.map(q => q.p))];
    const rand = rng(12345), fits = [];
    for (let r = 0; r < n; r++) {
      const pick = papers.map(() => papers[Math.floor(rand() * papers.length)]);
      const pts = [];
      pick.forEach((p, slot) => points.filter(q => q.p === p).forEach(q => pts.push({ p: slot, t: q.t, y: q.y })));
      fits.push(fit(pts, pick.length, { coarse: true, tau2: base.tau2 }));
    }
    return fits;
  }

  const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; };
  const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));

  // prediction for a NEW process at thicknesses ts; calib: optional {points:[{t,y}]} from the user's own run
  function predict(model, boots, ts, calib) {
    let bNew = 0, tauLeft = model.tau2;
    if (calib && calib.length) {
      let s = 0; for (const c of calib) s += Math.log(c.y) - model.a - shape(c.t, model.th);
      bNew = s / (calib.length + model.k);
      tauLeft = 1 / (1 / model.tau2 + calib.length / model.sigma2);
    }
    return ts.map(t => {
      const mu = model.a + shape(t, model.th) + bNew;
      let v = 0;
      if (boots && boots.length) { const m = boots.map(b => b.a + shape(t, b.th)); const mean = m.reduce((x, y) => x + y, 0) / m.length; v = m.reduce((x, y) => x + (y - mean) ** 2, 0) / m.length; }
      const sd = Math.sqrt(v + tauLeft + model.sigma2);
      return { t, mu, sd, med: Math.exp(mu), lo: Math.exp(mu - 1.2816 * sd), hi: Math.exp(mu + 1.2816 * sd) };
    });
  }

  function successCurve(pred, target, dir = "ge") {
    return pred.map(p => ({ t: p.t, p: dir === "ge" ? 1 - Phi((Math.log(target) - p.mu) / p.sd) : Phi((Math.log(target) - p.mu) / p.sd) }));
  }

  // leave-one-paper-out: honest accuracy; nothing is tuned on the held-out paper
  function lopo(data) {
    const P = data.papers;
    const rows = [], calRows = [], baseRows = [];
    P.forEach((paper, i) => {
      const others = P.filter((_, j) => j !== i);
      const pts = []; others.forEach((q, j) => q.points.forEach(([t, y]) => pts.push({ p: j, t, y })));
      const m = fit(pts, others.length);
      const allY = pts.map(q => q.y).sort((x, y) => x - y), median = allY[Math.floor(allY.length / 2)];
      paper.points.forEach(([t, y]) => {
        const pr = Math.exp(m.a + shape(t, m.th));
        rows.push({ paper: paper.id, t, y, pred: pr, ape: Math.abs(pr - y) / y * 100 });
        baseRows.push({ ape: Math.abs(median - y) / y * 100 });
      });
      if (paper.points.length >= 2) {
        paper.points.forEach(([t, y], k) => {
          const rest = paper.points.filter((_, j) => j !== k).map(([tt, yy]) => ({ t: tt, y: yy }));
          let s = 0; for (const c of rest) s += Math.log(c.y) - m.a - shape(c.t, m.th);
          const b = s / (rest.length + m.k);
          const pr = Math.exp(m.a + shape(t, m.th) + b);
          calRows.push({ paper: paper.id, t, y, pred: pr, ape: Math.abs(pr - y) / y * 100 });
        });
      }
    });
    const stat = r => { const a = r.map(x => x.ape).sort((x, y) => x - y); return { n: a.length, median: a[Math.floor(a.length / 2)], mean: a.reduce((x, y) => x + y, 0) / a.length }; };
    return { rows, calRows, none: stat(rows), calibrated: calRows.length ? stat(calRows) : null, baseline: stat(baseRows) };
  }

  function prepare(data, extra) {
    const papers = data.papers.concat(extra || []);
    const pts = []; papers.forEach((q, j) => q.points.forEach(([t, y]) => { if (y > 0 && t > 0) pts.push({ p: j, t, y }); }));
    return { papers, pts };
  }

  const API = { shape, fit, bootstrap, predict, successCurve, lopo, prepare, Phi };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.DLModel = API;
})(typeof window !== "undefined" ? window : globalThis);
