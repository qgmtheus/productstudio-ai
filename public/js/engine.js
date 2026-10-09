// Motor de imagem: remoção de fundo, cenários, formatos e peças — tudo em <canvas>, no navegador.

export const FORMATS = [
  { id: 'feed',     label: 'Post Instagram', ratio: '1:1',    w: 1080, h: 1080 },
  { id: 'retrato',  label: 'Feed retrato',   ratio: '4:5',    w: 1080, h: 1350 },
  { id: 'story',    label: 'Story / Reels',  ratio: '9:16',   w: 1080, h: 1920 },
  { id: 'anuncio',  label: 'Anúncio Facebook', ratio: '1.91:1', w: 1200, h: 628 },
  { id: 'banner',   label: 'Banner do site', ratio: '16:5',   w: 1920, h: 600 },
  { id: 'marketplace', label: 'Marketplace', ratio: '1:1',    w: 1000, h: 1000, forceScene: 'branco', forceTemplate: 'limpo' },
];

export const SCENES = [
  { id: 'estudio',  label: 'Estúdio',     swatch: 'linear-gradient(#f2f1ee,#cfccc6)' },
  { id: 'podio',    label: 'Pódio',       swatch: 'linear-gradient(#f6d9c9,#e7b9a3)' },
  { id: 'marmore',  label: 'Mármore',     swatch: 'linear-gradient(135deg,#f7f6f3,#dcdad5)' },
  { id: 'madeira',  label: 'Madeira',     swatch: 'linear-gradient(#efe6da 55%,#9a6b43 55%)' },
  { id: 'por-do-sol', label: 'Pôr do sol', swatch: 'linear-gradient(#ffb36b,#ff6f91)' },
  { id: 'natureza', label: 'Natureza',    swatch: 'linear-gradient(#dfeedd,#7fb38a)' },
  { id: 'neon',     label: 'Neon',        swatch: 'radial-gradient(circle,#5a2bff,#0b0b14 70%)' },
  { id: 'branco',   label: 'Fundo branco', swatch: '#fff' },
];

export const TEMPLATES = [
  { id: 'limpo',      label: 'Só a foto' },
  { id: 'lancamento', label: 'Lançamento' },
  { id: 'promo',      label: 'Promoção' },
  { id: 'frete',      label: 'Frete grátis' },
  { id: 'minimal',    label: 'Minimalista' },
];

/* ---------- utilidades ---------- */

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    img.src = src;
  });
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Copia a imagem para um canvas com no máximo `max` px no maior lado. */
export function toCanvas(img, max = 1200) {
  const s = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.round((img.naturalWidth || img.width) * s), h = Math.round((img.naturalHeight || img.height) * s);
  const c = canvasOf(w, h);
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c;
}

/** Recorta as bordas transparentes, deixando uma pequena margem. */
export function trim(src, pad = 6) {
  const { width: w, height: h } = src;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
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

/* ---------- remoção de fundo ---------- */

/**
 * Modo rápido: estima a cor do fundo pelas bordas e "inunda" a partir delas,
 * aceitando degradês suaves. Ótimo para fotos em fundo liso (o caso mais comum).
 */
export function removeBackgroundFast(img, { tolerance = 34 } = {}) {
  const c = toCanvas(img, 1200);
  const { width: w, height: h } = c;
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;

  // cor média das bordas (mediana por canal, resistente a ruído)
  const rs = [], gs = [], bs = [];
  const push = i => { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
  for (let x = 0; x < w; x += 2) { push(x * 4); push(((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y += 2) { push(y * w * 4); push((y * w + w - 1) * 4); }
  const med = a => a.sort((p, q) => p - q)[a.length >> 1];
  const bg = [med(rs), med(gs), med(bs)];

  const dist = (i, r, g, b) => Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b);
  const mask = new Uint8Array(w * h); // 1 = fundo
  const stack = [];
  const seed = p => { if (!mask[p] && dist(p * 4, ...bg) < tolerance * 2.2) { mask[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }

  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p / w) | 0, i = p * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const tryN = q => {
      if (mask[q]) return;
      const j = q * 4;
      if (dist(j, r, g, b) < tolerance * 0.45 && dist(j, ...bg) < tolerance * 3) { mask[q] = 1; stack.push(q); }
    };
    if (x > 0) tryN(p - 1); if (x < w - 1) tryN(p + 1);
    if (y > 0) tryN(p - w); if (y < h - 1) tryN(p + w);
  }

  // buracos fechados (ex.: dentro da alça de uma caneca): regiões grandes com a cor do fundo
  const seen = new Uint8Array(w * h), minArea = w * h * 0.0015;
  for (let p0 = 0; p0 < w * h; p0++) {
    if (mask[p0] || seen[p0] || dist(p0 * 4, ...bg) >= tolerance * 1.2) continue;
    const comp = [p0]; seen[p0] = 1;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k], x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || mask[q] || seen[q] || dist(q * 4, ...bg) >= tolerance * 1.2) continue;
        seen[q] = 1; comp.push(q);
      }
    }
    if (comp.length > minArea) for (const p of comp) mask[p] = 1;
  }

  // bordas suaves: média 3x3 da máscara vira o alfa
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      s += mask[yy * w + xx]; n++;
    }
    d[(y * w + x) * 4 + 3] = Math.round(255 * (1 - s / n));
  }
  ctx.putImageData(id, 0, 0);
  let removed = 0;
  for (let p = 0; p < w * h; p++) removed += mask[p];
  const out = trim(c);
  out.lowConfidence = removed < w * h * 0.12; // quase nada saiu: o fundo não é liso
  return out;
}

let aiModule = null;
/**
 * Modo precisão: rede neural rodando no próprio navegador (@imgly/background-removal).
 * Baixa o modelo na primeira vez (~80 MB) e depois fica em cache.
 */
export async function removeBackgroundAI(file, onProgress) {
  if (!aiModule) aiModule = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
  const blob = await aiModule.removeBackground(file, {
    model: 'isnet_fp16',
    output: { format: 'image/png' },
    // a biblioteca valida que o callback não retorna nada — por isso o corpo em bloco
    progress: (key, cur, total) => { onProgress?.(key.startsWith('fetch') ? 'fetch' : 'compute', total ? cur / total : 0); },
  });
  const img = await loadImage(URL.createObjectURL(blob));
  return trim(dropIslands(toCanvas(img, 1400)));
}

/** Apaga manchas soltas (pedaços de fundo que sobraram longe do produto). */
function dropIslands(c) {
  const { width: w, height: h } = c, ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  const label = new Int32Array(w * h), sizes = [0];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (label[p0] || d[p0 * 4 + 3] < 128) continue;
    const n = sizes.length, stack = [p0];
    label[p0] = n; let size = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % w; size++;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || label[q] || d[q * 4 + 3] < 128) continue;
        label[q] = n; stack.push(q);
      }
    }
    sizes.push(size);
  }
  const keep = Math.max(...sizes) * 0.04;
  for (let p = 0; p < w * h; p++) {
    const l = label[p];
    if (l ? sizes[l] < keep : d[p * 4 + 3] < 40) d[p * 4 + 3] = 0;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

/* ---------- cenários ---------- */

function rng(seed) { // pseudoaleatório determinístico: o mármore sai igual em todo formato
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex, other, t) {
  const a = hexToRgb(hex), b = hexToRgb(other);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

/** Desenha o cenário e devolve onde o produto "pisa" (linha do chão). */
function drawScene(ctx, W, H, scene, accent, box) {
  const floorY = box.y + box.h;
  const cx = box.x + box.w / 2;
  let g;
  switch (scene) {
    case 'branco':
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      break;

    case 'estudio':
      g = ctx.createRadialGradient(cx, H * 0.35, 10, cx, H * 0.45, Math.max(W, H) * 0.9);
      g.addColorStop(0, '#f7f6f3'); g.addColorStop(1, '#c9c6bf');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      g = ctx.createLinearGradient(0, floorY - box.h * 0.12, 0, H);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.08)');
      ctx.fillStyle = g; ctx.fillRect(0, floorY - box.h * 0.12, W, H);
      break;

    case 'podio': {
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, mix(accent, '#ffffff', 0.78)); g.addColorStop(1, mix(accent, '#ffffff', 0.55));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // arco ao fundo
      ctx.fillStyle = mix(accent, '#ffffff', 0.68);
      const ar = box.w * 0.75;
      ctx.beginPath();
      ctx.moveTo(cx - ar, floorY); ctx.lineTo(cx - ar, box.y + ar * 0.2);
      ctx.arc(cx, box.y + ar * 0.2, ar, Math.PI, 0); ctx.lineTo(cx + ar, floorY); ctx.fill();
      // pódio cilíndrico
      const pr = box.w * 0.62, ry = pr * 0.22, ph = Math.max(16, Math.min(box.h * 0.16, H - floorY - ry - H * 0.02));
      ctx.fillStyle = mix(accent, '#000000', 0.08);
      ctx.fillRect(cx - pr, floorY, pr * 2, ph);
      ctx.beginPath(); ctx.ellipse(cx, floorY + ph, pr, ry, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = mix(accent, '#ffffff', 0.25);
      ctx.beginPath(); ctx.ellipse(cx, floorY, pr, ry, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }

    case 'marmore': {
      ctx.fillStyle = '#f4f3f0'; ctx.fillRect(0, 0, W, H);
      const r = rng(7);
      ctx.lineCap = 'round';
      for (let k = 0; k < 26; k++) {
        ctx.strokeStyle = `rgba(110,105,100,${0.05 + r() * 0.12})`;
        ctx.lineWidth = 0.6 + r() * 2.6;
        let x = r() * W * 1.2 - W * 0.1, y = r() * H;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          const nx = x + (r() * 0.5 + 0.15) * W * 0.4, ny = y + (r() - 0.5) * H * 0.35;
          ctx.quadraticCurveTo(x + (r() - 0.5) * W * 0.2, y + (r() - 0.5) * H * 0.2, nx, ny);
          x = nx; y = ny;
        }
        ctx.stroke();
      }
      g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,.06)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      break;
    }

    case 'madeira': {
      const top = floorY - box.h * 0.04;
      g = ctx.createLinearGradient(0, 0, 0, top);
      g.addColorStop(0, '#f3ece2'); g.addColorStop(1, '#e2d6c5');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, top);
      // luz de janela
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.moveTo(W * 0.62, 0); ctx.lineTo(W * 0.82, 0); ctx.lineTo(W * 0.55, top); ctx.lineTo(W * 0.35, top); ctx.fill();
      g = ctx.createLinearGradient(0, top, 0, H);
      g.addColorStop(0, '#a87650'); g.addColorStop(1, '#6e4529');
      ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
      const r = rng(3);
      for (let k = 0; k < 40; k++) {
        ctx.strokeStyle = `rgba(60,32,14,${0.08 + r() * 0.14})`;
        ctx.lineWidth = 1 + r() * 2;
        const y = top + r() * (H - top);
        ctx.beginPath(); ctx.moveTo(0, y);
        ctx.bezierCurveTo(W * 0.3, y + (r() - 0.5) * 14, W * 0.7, y + (r() - 0.5) * 14, W, y + (r() - 0.5) * 10);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(0, top, W, 3);
      break;
    }

    case 'por-do-sol': {
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#ffcf8a'); g.addColorStop(0.55, '#ff8a7a'); g.addColorStop(1, '#c4507a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const sr = Math.min(W, H) * 0.32;
      g = ctx.createRadialGradient(cx, floorY - box.h * 0.45, 0, cx, floorY - box.h * 0.45, sr);
      g.addColorStop(0, 'rgba(255,248,220,.95)'); g.addColorStop(0.6, 'rgba(255,220,170,.55)'); g.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(120,40,80,.25)'; ctx.fillRect(0, floorY, W, H - floorY);
      break;
    }

    case 'natureza': {
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#eef6ea'); g.addColorStop(1, '#a9cfa8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const r = rng(11);
      const leaf = (x, y, s, a, col) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * 0.5, -s * 0.28, s, 0); ctx.quadraticCurveTo(s * 0.5, s * 0.28, 0, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = s * 0.012;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.95, 0); ctx.stroke();
        ctx.restore();
      };
      const S = Math.min(W, H);
      for (let k = 0; k < 14; k++) {
        const left = k % 2 === 0;
        leaf(left ? -S * 0.05 : W + S * 0.05, r() * H, S * (0.35 + r() * 0.3),
          (left ? -0.6 : Math.PI + 0.6) + (r() - 0.5) * 1.2, `rgba(${40 + r() * 40},${110 + r() * 50},${60 + r() * 30},${0.55 + r() * 0.35})`);
      }
      ctx.fillStyle = '#e9e3d6';
      ctx.beginPath(); ctx.ellipse(cx, floorY + box.h * 0.02, box.w * 0.75, box.w * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }

    case 'neon': {
      ctx.fillStyle = '#0b0b14'; ctx.fillRect(0, 0, W, H);
      g = ctx.createRadialGradient(cx, box.y + box.h * 0.5, 0, cx, box.y + box.h * 0.5, Math.max(W, H) * 0.7);
      g.addColorStop(0, mix(accent, '#000000', 0.35)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const rr = Math.max(box.w, box.h) * 0.62;
      ctx.save();
      ctx.shadowColor = accent; ctx.shadowBlur = rr * 0.18;
      ctx.strokeStyle = mix(accent, '#ffffff', 0.35); ctx.lineWidth = Math.max(4, rr * 0.025);
      ctx.beginPath(); ctx.arc(cx, box.y + box.h * 0.5, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(0, floorY, W, H - floorY);
      break;
    }
  }
}

/* ---------- produto ---------- */

function drawProduct(ctx, cut, box, scene) {
  const { x, y, w, h } = box;
  const dark = scene === 'neon';
  // sombra de contato
  const g = ctx.createRadialGradient(x + w / 2, y + h, 0, x + w / 2, y + h, w * 0.55);
  g.addColorStop(0, dark ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x + w / 2, y + h); ctx.scale(1, 0.12); ctx.translate(-(x + w / 2), -(y + h));
  ctx.fillStyle = g; ctx.fillRect(x - w * 0.2, y + h - w * 0.6, w * 1.4, w * 1.2);
  ctx.restore();

  // reflexo no chão (cenários lisos)
  if (['neon', 'estudio', 'por-do-sol'].includes(scene)) {
    ctx.save();
    ctx.globalAlpha = dark ? 0.22 : 0.12;
    ctx.translate(0, (y + h) * 2); ctx.scale(1, -1);
    ctx.drawImage(cut, x, y, w, h);
    ctx.restore();
    // desvanece o reflexo
    const fade = ctx.createLinearGradient(0, y + h, 0, y + h + h * 0.45);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = fade; ctx.fillRect(x - 4, y + h, w + 8, h);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = dark ? 'rgba(0,0,0,.6)' : 'rgba(40,30,20,.22)';
  ctx.shadowBlur = Math.max(w, h) * 0.06;
  ctx.shadowOffsetY = Math.max(w, h) * 0.02;
  ctx.drawImage(cut, x, y, w, h);
  ctx.restore();
}

/* ---------- textos das peças ---------- */

const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

/** Calcula onde vai o produto e onde vai o texto, conforme a proporção e a peça. */
function layout(W, H, cut, template, textBottom) {
  const ar = cut.width / cut.height;
  const wide = W / H > 1.4, tall = H / W > 1.4;
  const hasText = template !== 'limpo';
  const m = Math.min(W, H) * 0.07;
  let area, text;
  if (!hasText) area = { x: W * 0.15, y: H * 0.12, w: W * 0.7, h: H * 0.74 };
  else if (wide) {
    area = { x: W * 0.56, y: H * 0.1, w: W * 0.36, h: H * 0.78 };
    text = { x: m * 1.4, y: m, w: W * 0.5 - m, h: H - m * 2, align: 'left' };
  } else {
    text = { x: m, y: m * (tall ? 1.6 : 1), w: W - m * 2, align: 'center' };
    // o produto ocupa o espaço que sobra abaixo do texto
    const top = (textBottom ?? H * 0.3) + H * 0.04;
    const bottom = H * (template === 'frete' ? 0.84 : 0.9);
    const h = Math.max(H * 0.3, bottom - top);
    area = { x: W * 0.14, y: bottom - h, w: W * 0.72, h };
  }
  let w = area.w, h = w / ar;
  if (h > area.h) { h = area.h; w = h * ar; }
  const box = { x: area.x + (area.w - w) / 2, y: area.y + area.h - h, w, h };
  return { box, text, wide, tall };
}

function drawText(ctx, W, H, t, tpl, info, scene, accent) {
  if (tpl === 'limpo' || !t) return 0;
  const dark = ['neon', 'por-do-sol'].includes(scene);
  const ink = dark ? '#ffffff' : '#141414';
  const soft = dark ? 'rgba(255,255,255,.8)' : 'rgba(20,20,20,.68)';
  const U = Math.min(W, H) / 100 * (W / H > 1.4 ? 1.3 : 1); // unidade relativa
  const left = t.align === 'left';
  const ax = left ? t.x : t.x + t.w / 2;
  ctx.textAlign = left ? 'left' : 'center';
  ctx.textBaseline = 'top';
  let y = t.y;

  const name = info.name || 'Seu produto';
  const kicker = { lancamento: 'NOVIDADE', promo: 'OFERTA ESPECIAL', frete: info.brand || 'LOJA', minimal: info.brand || '' }[tpl];

  const pill = (label, bg, fg) => {
    ctx.font = `700 ${U * 3.2}px "Inter Tight", system-ui, sans-serif`;
    const tw = ctx.measureText(label).width + U * 5, th = U * 6.4;
    const px = left ? ax : ax - tw / 2;
    ctx.fillStyle = bg; roundRect(ctx, px, y, tw, th, th / 2);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.fillText(label, px + tw / 2, y + U * 1.55);
    ctx.textAlign = left ? 'left' : 'center';
    y += th + U * 2.4;
  };

  if (kicker) {
    if (tpl === 'minimal') {
      ctx.font = `600 ${U * 2.6}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = soft; ctx.fillText(kicker.toUpperCase().split('').join(' '), ax, y); y += U * 5;
    } else pill(kicker, tpl === 'frete' ? ink : accent, tpl === 'frete' ? (dark ? '#111' : '#fff') : '#fff');
  }

  // título
  const big = tpl === 'minimal' ? U * 8 : U * 7.2;
  ctx.font = tpl === 'minimal' ? `italic 400 ${big}px "Instrument Serif", Georgia, serif` : `800 ${big}px "Inter Tight", system-ui, sans-serif`;
  ctx.fillStyle = ink;
  const lines = wrap(ctx, name, t.w).slice(0, 2);
  for (const l of lines) { ctx.fillText(l, ax, y); y += big * 1.05; }
  y += U * 1.4;

  if (tpl === 'promo') {
    const price = Number(info.price) || 0, promo = Number(info.promo) || 0;
    if (price && promo && promo < price) {
      ctx.font = `500 ${U * 3.4}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = soft;
      const de = 'de ' + brl(price);
      ctx.fillText(de, ax, y);
      const dw = ctx.measureText(de).width, sx = left ? ax : ax - dw / 2;
      ctx.fillRect(sx + U * 2.6, y + U * 1.9, dw - U * 2.6, Math.max(2, U * 0.3));
      y += U * 4.6;
      ctx.font = `800 ${U * 6.4}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = accent; ctx.fillText('por ' + brl(promo), ax, y); y += U * 8;
      // selo de desconto
      const off = Math.round((1 - promo / price) * 100);
      const r = U * 9, bx = W - r - U * 5, by = H - r - U * 5;
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${U * 5.6}px "Inter Tight", system-ui, sans-serif`; ctx.fillText(`-${off}%`, bx, by - U * 0.6);
      ctx.font = `700 ${U * 2.2}px "Inter Tight", system-ui, sans-serif`; ctx.fillText('OFF', bx, by + U * 4);
      ctx.textAlign = left ? 'left' : 'center'; ctx.textBaseline = 'top';
    } else if (price) {
      ctx.font = `800 ${U * 6}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = accent; ctx.fillText(brl(price), ax, y); y += U * 8;
    }
  } else if (tpl === 'lancamento' || tpl === 'minimal') {
    if (info.tagline) {
      ctx.font = `500 ${U * 3.3}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = soft;
      for (const l of wrap(ctx, info.tagline, t.w).slice(0, 2)) { ctx.fillText(l, ax, y); y += U * 4.4; }
      y += U * 1.6;
    }
    if (info.price && tpl === 'minimal') {
      ctx.font = `600 ${U * 3.6}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = ink; ctx.fillText(brl(info.price), ax, y); y += U * 6;
    }
  }

  if (tpl === 'frete') {
    // faixa no rodapé
    const fh = U * 9;
    ctx.fillStyle = accent; ctx.fillRect(0, H - fh, W, fh);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${U * 3.8}px "Inter Tight", system-ui, sans-serif`;
    ctx.fillText('FRETE GRÁTIS  ·  ENVIO EM 24H  ·  FRETE GRÁTIS', W / 2, H - fh / 2);
    ctx.textAlign = left ? 'left' : 'center'; ctx.textBaseline = 'top';
    if (info.price) {
      ctx.font = `700 ${U * 4.6}px "Inter Tight", system-ui, sans-serif`;
      ctx.fillStyle = ink; ctx.fillText(brl(info.promo && info.promo < info.price ? info.promo : info.price), ax, y); y += U * 7;
    }
  }

  if (info.cta && tpl !== 'minimal') {
    ctx.font = `700 ${U * 3.2}px "Inter Tight", system-ui, sans-serif`;
    const label = info.cta + '  →';
    const tw = ctx.measureText(label).width + U * 7, th = U * 7.4;
    const px = left ? ax : ax - tw / 2;
    ctx.fillStyle = ink; roundRect(ctx, px, y, tw, th, U * 1.4);
    ctx.fillStyle = dark ? '#111' : '#fff'; ctx.textAlign = 'center';
    ctx.fillText(label, px + tw / 2, y + U * 2.1);
    y += th;
  }
  return y;
}

/* ---------- composição final ---------- */

/**
 * Desenha uma peça completa.
 * state: { cut, scene, template, accent, info:{name,brand,price,promo,tagline,cta}, scale }
 */
export function render(canvas, format, state) {
  const { w: W, h: H } = format;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const scene = format.forceScene || state.scene;
  const template = format.forceTemplate || state.template;
  const accent = state.accent || '#ff5a1f';
  if (!state.cut) { ctx.fillStyle = '#eceae6'; ctx.fillRect(0, 0, W, H); return canvas; }

  // 1ª passada só mede a altura do texto (desenha num canvas descartável)
  const probe = layout(W, H, state.cut, template);
  let textBottom;
  if (probe.text && !probe.wide) {
    const m = canvasOf(W, H).getContext('2d');
    textBottom = drawText(m, W, H, probe.text, template, state.info || {}, scene, accent);
  }
  const { box, text } = layout(W, H, state.cut, template, textBottom);
  const s = state.scale ?? 1;
  if (s !== 1) {
    const nw = box.w * s, nh = box.h * s;
    box.x += (box.w - nw) / 2; box.y += box.h - nh; box.w = nw; box.h = nh;
  }
  drawScene(ctx, W, H, scene, accent, box);
  drawProduct(ctx, state.cut, box, scene);
  drawText(ctx, W, H, text, template, state.info || {}, scene, accent);
  return canvas;
}

export function toBlob(canvas, type = 'image/png', q) {
  return new Promise(r => canvas.toBlob(r, type, q));
}
