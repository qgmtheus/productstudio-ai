// Refino do recorte e melhoria da imagem. Tudo trabalha sobre { src, alpha }:
// src = canvas da foto original (até 1200 px) e alpha = máscara 0–255 do mesmo tamanho.

export const ENHANCE_DEFAULT = { bright: 0, contrast: 0, sat: 0, sharp: 0, warmth: 0 };
export const REFINE_DEFAULT = { thin: 0, edge: 0, rotate: 0 };

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;

/* ---------- máscara ---------- */

/** Apaga manchas soltas: mantém só regiões com pelo menos 4% do tamanho da maior. */
export function dropIslands(a, w, h) {
  const label = new Int32Array(w * h), sizes = [0], stack = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (label[p0] || a[p0] < 128) continue;
    const n = sizes.length;
    label[p0] = n; stack.push(p0);
    let size = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % w; size++;
      if (x > 0 && !label[p - 1] && a[p - 1] >= 128) { label[p - 1] = n; stack.push(p - 1); }
      if (x < w - 1 && !label[p + 1] && a[p + 1] >= 128) { label[p + 1] = n; stack.push(p + 1); }
      if (p >= w && !label[p - w] && a[p - w] >= 128) { label[p - w] = n; stack.push(p - w); }
      if (p < w * (h - 1) && !label[p + w] && a[p + w] >= 128) { label[p + w] = n; stack.push(p + w); }
    }
    sizes.push(size);
  }
  if (sizes.length < 2) return;
  const keep = Math.max(...sizes) * 0.04;
  for (let p = 0; p < w * h; p++) {
    const l = label[p];
    if (l ? sizes[l] < keep : a[p] < 40) a[p] = 0;
  }
}

// erosão/dilatação binária com janela quadrada, via somas acumuladas (O(n) independente do raio)
function boxPass(m, w, h, r, erode) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), row = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x + 1] = row[x] + m[y * w + x];
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), s = row[x1] - row[x0];
      tmp[y * w + x] = erode ? (s === 2 * r + 1 ? 1 : 0) : (s > 0 ? 1 : 0);
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) row[y + 1] = row[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1), s = row[y1] - row[y0];
      out[y * w + x] = erode ? (s === 2 * r + 1 ? 1 : 0) : (s > 0 ? 1 : 0);
    }
  }
  return out;
}

/** Remove partes finas presas ao produto (cabos, fios, hastes) — "abertura" morfológica. */
function removeThin(a, w, h, level) {
  const s = Math.min(1, 420 / Math.max(w, h));
  const lw = Math.ceil(w * s), lh = Math.ceil(h * s);
  const m = new Uint8Array(lw * lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    m[y * lw + x] = a[Math.min(h - 1, Math.floor(y / s)) * w + Math.min(w - 1, Math.floor(x / s))] >= 128 ? 1 : 0;
  }
  const r = Math.max(1, Math.round(level * Math.max(lw, lh) * 0.008));
  const opened = boxPass(boxPass(m, lw, lh, r, true), lw, lh, r + 1, false);
  for (let y = 0; y < h; y++) {
    const ly = Math.min(lh - 1, Math.floor(y * s));
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (a[p] && !opened[ly * lw + Math.min(lw - 1, Math.floor(x * s))]) a[p] = 0;
    }
  }
}

/** edge < 0 suaviza a borda; edge > 0 deixa nítida e "come" o halo do fundo antigo. */
function applyEdge(a, w, h, edge) {
  if (edge > 0) {
    const k = 1 + edge / 40, shift = edge * 0.3;
    for (let p = 0; p < a.length; p++) if (a[p] && a[p] < 255) a[p] = clamp((a[p] - 128 - shift) * k + 128);
    // pixels sólidos na fronteira também recebem o deslocamento (encolhe a borda ~1px)
    if (edge > 50) {
      const copy = a.slice();
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (copy[p] && (!copy[p - 1] || !copy[p + 1] || !copy[p - w] || !copy[p + w])) a[p] = Math.min(a[p], 110);
      }
    }
  } else if (edge < 0) {
    const r = Math.ceil(-edge / 40);
    const tmp = new Float32Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
      tmp[y * w + x] = s / n;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
      a[y * w + x] = Math.min(a[y * w + x] + 30, s / n); // não "engorda" o produto, só suaviza
    }
  }
}

/* ---------- cor ---------- */

/** Aplica brilho/contraste/saturação/temperatura/nitidez nos pixels (sem mexer no alfa). */
export function enhancePixels(src, e) {
  const { width: w, height: h } = src;
  const id = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  const d = id.data;
  if (e.sharp > 0) { // máscara de nitidez: px + k·(px − média 3×3)
    const o = new Uint8ClampedArray(d), k = e.sharp / 45;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const m = (o[i - 4 + c] + o[i + 4 + c] + o[i - w * 4 + c] + o[i + w * 4 + c] + o[i + c] +
          o[i - w * 4 - 4 + c] + o[i - w * 4 + 4 + c] + o[i + w * 4 - 4 + c] + o[i + w * 4 + 4 + c]) / 9;
        d[i + c] = o[i + c] + k * (o[i + c] - m);
      }
    }
  }
  const c = e.contrast * 1.5, f = (259 * (c + 255)) / (255 * (259 - c));
  const b = e.bright * 1.2, s = 1 + e.sat / 100, wr = e.warmth * 0.35;
  if (!c && !b && !e.sat && !wr && !(e.sharp > 0)) return src;
  for (let i = 0; i < d.length; i += 4) {
    let r = f * (d[i] - 128) + 128 + b + wr, g = f * (d[i + 1] - 128) + 128 + b, bl = f * (d[i + 2] - 128) + 128 + b - wr;
    const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
    d[i] = gray + (r - gray) * s; d[i + 1] = gray + (g - gray) * s; d[i + 2] = gray + (bl - gray) * s;
  }
  const out = canvasOf(w, h);
  out.getContext('2d').putImageData(id, 0, 0);
  return out;
}

/** Sugere ajustes olhando só para os pixels do produto (níveis automáticos). */
export function autoEnhance(seg) {
  const { src, alpha } = seg, d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height).data;
  const hist = new Uint32Array(256);
  let n = 0, sum = 0, satSum = 0;
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    if (alpha[p] < 200 || p % 3) continue; // amostra 1/3 dos pixels sólidos
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    hist[l]++; n++; sum += l; satSum += mx ? (mx - mn) / mx : 0;
  }
  if (!n) return { ...ENHANCE_DEFAULT };
  const pct = q => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * q) return i; } return 255; };
  const lo = pct(0.02), hi = pct(0.98), mean = sum / n, sat = satSum / n;
  const f = Math.min(1.45, Math.max(1, 225 / Math.max(40, hi - lo)));
  const c = (66045 * (f - 1)) / (259 + 255 * f);
  const meanAfter = f * (mean - 128) + 128;
  return {
    bright: Math.round(Math.max(-15, Math.min(15, (128 - meanAfter) / 1.5))),
    contrast: Math.round(c / 1.5),
    sat: sat < 0.18 ? 18 : sat < 0.35 ? 10 : 4,
    sharp: 35,
    warmth: 0,
  };
}

/* ---------- montagem ---------- */

let enhCache = { src: null, key: '', canvas: null };
function enhancedSource(seg, e) {
  const key = JSON.stringify(e);
  if (enhCache.src !== seg.src || enhCache.key !== key) enhCache = { src: seg.src, key, canvas: enhancePixels(seg.src, e) };
  return enhCache.canvas;
}

/** Recorta as bordas transparentes, deixando uma pequena margem. */
export function trim(src, pad = 6) {
  const { width: w, height: h } = src;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return src;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = canvasOf(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(src, -x0, -y0);
  return out;
}

/** Máscara final (antes da rotação): partes finas, manchas, bordas e edição manual. */
export function finalAlpha(seg, refine, manual) {
  const { width: w, height: h } = seg.src;
  const a = new Uint8ClampedArray(seg.alpha);
  if (refine.thin > 0) removeThin(a, w, h, refine.thin);
  dropIslands(a, w, h);
  applyEdge(a, w, h, refine.edge || 0);
  if (manual) for (let p = 0; p < a.length; p++) { if (manual[p] === 1) a[p] = 0; else if (manual[p] === 2) a[p] = 255; }
  return a;
}

/** Junta foto melhorada + máscara num canvas do tamanho original (sem girar nem cortar). */
export function composeFull(seg, refine, enhance, manual) {
  const { width: w, height: h } = seg.src;
  const rgb = enhancedSource(seg, enhance);
  const id = rgb.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  const a = finalAlpha(seg, refine, manual);
  for (let p = 0, i = 3; p < a.length; p++, i += 4) id.data[i] = a[p];
  const out = canvasOf(w, h);
  out.getContext('2d').putImageData(id, 0, 0);
  return out;
}

export function enhancedCanvas(seg, enhance) { return enhancedSource(seg, enhance); }

/** Produto final usado nas peças: compõe, gira e corta as sobras. */
export function buildCut(seg, refine, enhance, manual) {
  let c = composeFull(seg, refine, enhance, manual);
  const deg = refine.rotate || 0;
  if (deg) {
    const rad = deg * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const W = Math.ceil(c.width * cos + c.height * sin), H = Math.ceil(c.width * sin + c.height * cos);
    const r = canvasOf(W, H), ctx = r.getContext('2d');
    ctx.translate(W / 2, H / 2); ctx.rotate(rad);
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
    c = r;
  }
  return trim(c);
}
