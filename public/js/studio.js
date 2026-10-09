import { FORMATS, SCENES, TEMPLATES, POSES, ANIMS, loadImage, segmentFast, segmentAI, render, toBlob } from './engine.js';
import { ENHANCE_DEFAULT, REFINE_DEFAULT, autoEnhance, buildCut, composeFull, enhancedCanvas } from './refine.js';
import { CATEGORIES, TONES, generateCopy } from './copy.js';
import { store } from './store.js';

const $ = id => document.getElementById(id);
const SAMPLES = {
  serum:   { name: 'Sérum Vitamina C', brand: 'LUMA', tagline: 'Pele luminosa em 14 dias', price: 129.9, promo: 89.9, accent: '#8a5cc7', cat: 'beleza', feats: 'vitamina C pura, textura leve, absorção rápida, sem perfume', aud: 'quem quer uma pele mais uniforme' },
  perfume: { name: 'Ambre Eau de Parfum', brand: 'Maison Ambre', tagline: 'Notas de âmbar e baunilha', price: 349, promo: 279, accent: '#b07a3c', cat: 'perfumaria', feats: 'notas de âmbar e baunilha, fixação de 10 horas, frasco de vidro 100 ml', aud: 'quem gosta de fragrâncias quentes' },
  caneca:  { name: 'Caneca Bom Dia', brand: 'Casa Verde', tagline: 'Cerâmica artesanal, 350 ml', price: 69.9, promo: 49.9, accent: '#2f6f61', cat: 'casa', feats: 'cerâmica artesanal, 350 ml, vai ao micro-ondas, esmalte atóxico', aud: 'quem ama um café caprichado' },
};
const COLORS = ['#ff5a1f', '#131313', '#2f6f61', '#8a5cc7', '#2563eb', '#d63f6e', '#b07a3c'];

const state = {
  id: null, file: null, source: null, sample: null,
  seg: null,          // { src, alpha } — resultado bruto da remoção de fundo
  cut: null,          // produto final (refinado, melhorado, girado e cortado)
  refine: { ...REFINE_DEFAULT }, enhance: { ...ENHANCE_DEFAULT }, manual: null,
  mode: 'ai', tolerance: 34,
  scene: 'estudio', template: 'lancamento', pose: 'padrao', anim: 'none', accent: COLORS[0], scale: 1,
  format: 'feed',
  info: { name: '', brand: '', tagline: '', price: '', promo: '', cta: 'Comprar agora' },
};

/* ---------- interface ---------- */

function toast(msg, ms = 2400) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
function busy(on, title = '', sub = '', pct = null) {
  $('busy').hidden = !on;
  $('busy-t').textContent = title; $('busy-s').textContent = sub;
  $('busy-bar').parentElement.hidden = pct === null;
  if (pct !== null) $('busy-bar').style.width = Math.round(pct * 100) + '%';
}
const nextFrame = () => new Promise(r => setTimeout(r, 30)); // deixa o overlay aparecer antes de trabalho pesado

function sampleButtons(el) {
  for (const id of Object.keys(SAMPLES)) {
    const b = document.createElement('button');
    b.title = SAMPLES[id].name;
    b.innerHTML = `<img src="img/samples/${id}.svg" alt="">`;
    b.onclick = () => useSample(id);
    el.append(b);
  }
}
sampleButtons($('samples')); sampleButtons($('empty-samples'));

const COUNT_GROUP = { scene: 'scenes', template: 'templates' };
function chipGroup(el, items, key, html) {
  for (const it of items) {
    const b = document.createElement('button');
    b.dataset.id = it.id;
    b.innerHTML = html ? html(it) : it.label;
    b.onclick = () => { state[key] = it.id; if (COUNT_GROUP[key]) store.count(COUNT_GROUP[key], it.id); sync(); };
    el.append(b);
  }
}
chipGroup($('scenes'), SCENES, 'scene', s => `<i style="background:${s.swatch}"></i>${s.label}`);
chipGroup($('templates'), TEMPLATES, 'template');
chipGroup($('poses'), POSES, 'pose');
chipGroup($('anims'), ANIMS, 'anim');

for (const c of COLORS) {
  const b = document.createElement('button');
  b.style.background = c; b.dataset.c = c; b.title = c;
  b.onclick = () => { state.accent = c; sync(); };
  $('colors').append(b);
}
$('colors').insertAdjacentHTML('beforeend', '<label title="Outra cor"><input type="color" id="color-any"></label>');
$('color-any').addEventListener('input', e => { state.accent = e.target.value; sync(); });

$('scale').addEventListener('input', e => { state.scale = e.target.value / 100; sync(); });
$('tol').addEventListener('change', e => { state.tolerance = +e.target.value; if (state.source && state.mode === 'fast') cutout(); });

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x.dataset.mode === mode));
  $('tol-wrap').hidden = mode !== 'fast';
}
setMode(state.mode);
document.querySelectorAll('#mode button').forEach(b => b.onclick = () => {
  if (b.dataset.mode === state.mode) return;
  setMode(b.dataset.mode);
  if (state.source) cutout();
});

const fields = { name: 'f-name', brand: 'f-brand', tagline: 'f-tagline', price: 'f-price', promo: 'f-promo', cta: 'f-cta' };
for (const [k, id] of Object.entries(fields)) {
  $(id).addEventListener('input', e => {
    state.info[k] = e.target.value;
    if (k === 'name') { state.autoName = false; $('crumb').textContent = e.target.value || 'Novo projeto'; }
    sync();
  });
}
function fillFields() {
  for (const [k, id] of Object.entries(fields)) $(id).value = state.info[k] ?? '';
  $('crumb').textContent = state.info.name || 'Novo projeto';
}

// formatos (miniaturas clicáveis)
const thumbs = {};
for (const f of FORMATS) {
  const b = document.createElement('button');
  b.dataset.id = f.id;
  const c = document.createElement('canvas');
  thumbs[f.id] = c;
  b.append(c);
  b.insertAdjacentHTML('beforeend', `<span>${f.label}<small>${f.ratio}</small></span>`);
  b.onclick = () => { state.format = f.id; sync(); };
  $('formats').append(b);
}

/* ---------- desenho ---------- */

let raf = 0, animRaf = 0;
const currentFormat = () => FORMATS.find(f => f.id === state.format);

function sync() {
  for (const [el, key] of [['scenes', 'scene'], ['templates', 'template'], ['poses', 'pose'], ['anims', 'anim']]) {
    document.querySelectorAll(`#${el} button`).forEach(b => b.classList.toggle('on', b.dataset.id === state[key]));
  }
  document.querySelectorAll('#colors button').forEach(b => b.classList.toggle('on', b.dataset.c === state.accent));
  document.querySelectorAll('#formats button').forEach(b => b.classList.toggle('on', b.dataset.id === state.format));
  const fmt = currentFormat();
  const animated = state.anim !== 'none' && !fmt.forceScene;
  $('dl-video').hidden = !animated;
  $('anim-note').textContent = state.anim === 'none'
    ? 'Escolha um movimento para baixar a peça em vídeo (Reels, Stories, anúncios).'
    : fmt.forceScene ? 'Marketplace aceita só foto: escolha outro formato para o vídeo.' : 'A prévia já está animada. Use “Baixar vídeo” embaixo da peça.';
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

function renderState(extra = {}) {
  return { cut: state.cut, scene: state.scene, template: state.template, pose: state.pose, anim: state.anim,
    accent: state.accent, scale: state.scale,
    info: { ...state.info, price: parseFloat(state.info.price) || 0, promo: parseFloat(state.info.promo) || 0 }, ...extra };
}

const PERIOD = 3000; // duração de um ciclo da animação (ms)
const VIDEO_MS = 6000;
/** Instante da animação (0–1). Na prévia a "entrada" se repete; no vídeo ela acontece uma vez e segura. */
function animT(anim, elapsed, loop = true) {
  if (anim !== 'entrada') return (elapsed % PERIOD) / PERIOD;
  return Math.min(1, (loop ? elapsed % (PERIOD + 1500) : elapsed) / PERIOD);
}

function draw() {
  if (!state.cut) return;
  const rs = renderState();
  const fmt = currentFormat();
  cancelAnimationFrame(animRaf);
  if (state.anim !== 'none' && !fmt.forceScene) {
    // prévia animada em meia resolução (o vídeo final sai em resolução cheia)
    const half = { ...fmt, w: Math.round(fmt.w / 2), h: Math.round(fmt.h / 2) };
    const t0 = performance.now();
    const loop = now => {
      render($('main-canvas'), half, { ...rs, t: animT(state.anim, now - t0) });
      animRaf = requestAnimationFrame(loop);
    };
    animRaf = requestAnimationFrame(loop);
  } else render($('main-canvas'), fmt, rs);
  $('fmt-info').textContent = `${fmt.label} · ${fmt.w} × ${fmt.h} px${fmt.forceScene ? ' · fundo branco exigido por marketplaces' : ''}`;
  for (const f of FORMATS) render(thumbs[f.id], { ...f, w: Math.round(f.w / 4), h: Math.round(f.h / 4) }, rs);
  drawVariants();
  saveSoon();
}

/* ---------- foto, recorte e refino ---------- */

async function openFile(file) {
  if (!file || !file.type.startsWith('image/')) return toast('Envie um arquivo de imagem (JPG, PNG ou WEBP).');
  if (file.size > 15e6) return toast('Imagem muito grande (máx. 15 MB).');
  try {
    state.source = await loadImage(URL.createObjectURL(file));
  } catch (e) { return toast(e.message); }
  state.file = file; state.sample = null;
  setMode('ai'); // foto real quase nunca tem fundo liso
  state.id = 'p' + Date.now().toString(36);
  // nome sugerido pelo arquivo, a não ser que seja nome genérico de câmera/WhatsApp ou o usuário já tenha digitado um
  if (!state.info.name || state.autoName) {
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    const generic = /whatsapp|^img|^dsc|^pxl|screenshot|captura|^image|^foto|^photo|^\d|\d{4}.*\d{2}/i.test(base);
    state.info.name = generic ? '' : base.slice(0, 40);
    state.autoName = true;
  }
  fillFields();
  store.track('uploads');
  await cutout();
}

async function useSample(id) {
  const s = SAMPLES[id];
  state.source = await loadImage(`img/samples/${id}.svg`);
  state.file = null; state.sample = id;
  state.id = 'p' + Date.now().toString(36);
  state.autoName = true;
  Object.assign(state.info, { name: s.name, brand: s.brand, tagline: s.tagline, price: String(s.price), promo: String(s.promo) });
  state.accent = s.accent;
  setMode('fast'); // amostras têm fundo liso: o modo rápido basta
  $('c-cat').value = s.cat; $('c-feats').value = s.feats; $('c-aud').value = s.aud;
  fillFields();
  store.track('uploads');
  await cutout();
}

async function sourceBlob() {
  if (state.file) return state.file;
  // amostras em SVG: rasteriza para PNG antes de mandar para a rede neural
  const c = document.createElement('canvas');
  c.width = state.source.naturalWidth || 900; c.height = state.source.naturalHeight || 900;
  c.getContext('2d').drawImage(state.source, 0, 0, c.width, c.height);
  return toBlob(c);
}

async function cutout() {
  const t0 = performance.now();
  let note = '';
  try {
    if (state.mode === 'ai') {
      busy(true, 'Removendo o fundo com IA…', 'Na primeira vez o modelo (~80 MB) é baixado e fica salvo no navegador.', 0);
      state.seg = await segmentAI(await sourceBlob(), state.source, (phase, p) => {
        if (phase === 'fetch') busy(true, 'Baixando o modelo de IA…', 'Só na primeira vez. Depois fica salvo no navegador.', p);
        else busy(true, 'Recortando o produto com IA…', 'Leva alguns segundos.', null);
      });
    } else {
      busy(true, 'Removendo o fundo…');
      await nextFrame();
      state.seg = segmentFast(state.source, { tolerance: state.tolerance });
      if (state.seg.lowConfidence) note = 'O fundo da foto não é liso — use “Precisão (IA)” para um recorte melhor.';
    }
  } catch (e) {
    console.error('Falha na remoção de fundo por IA:', e);
    setMode('fast');
    state.seg = segmentFast(state.source, { tolerance: state.tolerance });
    note = 'Não foi possível rodar a IA neste navegador. Usamos o modo rápido — funciona melhor com fundo liso.';
  }
  // foto nova: zera refino, ajustes e edição manual
  state.refine = { ...REFINE_DEFAULT }; state.enhance = { ...ENHANCE_DEFAULT }; state.manual = null;
  fillRefineControls();
  rebuild();
  busy(false);

  $('drop').hidden = true; $('cut-preview').hidden = false; $('refine').hidden = false; $('enh-group').hidden = false;
  $('empty').hidden = true; $('work').hidden = false;
  $('dl-all').disabled = false;
  const ms = Math.round(performance.now() - t0);
  toast(note || `Fundo removido em ${(ms / 1000).toFixed(1).replace('.', ',')}s`, note ? 6000 : 2400);
}

/** Refaz o produto final a partir do recorte bruto + refino + ajustes + edição manual. */
function rebuild() {
  if (!state.seg) return;
  state.cut = buildCut(state.seg, state.refine, state.enhance, state.manual);
  const cc = $('cut-canvas');
  cc.width = state.cut.width; cc.height = state.cut.height;
  cc.getContext('2d').drawImage(state.cut, 0, 0);
  sync();
}
let rebuildT = 0;
const rebuildSoon = () => { clearTimeout(rebuildT); rebuildT = setTimeout(rebuild, 60); };

const EDGE_LABEL = v => v === 0 ? 'originais' : v < 0 ? `mais suaves (${-v})` : `mais nítidas (${v})`;
function fillRefineControls() {
  $('r-thin').value = state.refine.thin; $('r-edge').value = state.refine.edge; $('r-rot').value = state.refine.rotate;
  $('r-edge-v').textContent = EDGE_LABEL(state.refine.edge);
  $('r-rot-v').textContent = state.refine.rotate + '°';
  document.querySelectorAll('[data-e]').forEach(i => { i.value = state.enhance[i.dataset.e]; });
  document.querySelectorAll('[data-v]').forEach(i => { i.textContent = state.enhance[i.dataset.v]; });
}
$('r-thin').addEventListener('change', e => { state.refine.thin = +e.target.value; rebuild(); });
$('r-edge').addEventListener('input', e => { state.refine.edge = +e.target.value; $('r-edge-v').textContent = EDGE_LABEL(+e.target.value); rebuildSoon(); });
$('r-rot').addEventListener('input', e => { state.refine.rotate = +e.target.value; $('r-rot-v').textContent = e.target.value + '°'; rebuildSoon(); });
document.querySelectorAll('[data-e]').forEach(inp => inp.addEventListener('input', () => {
  state.enhance[inp.dataset.e] = +inp.value;
  document.querySelector(`[data-v="${inp.dataset.e}"]`).textContent = inp.value;
  rebuildSoon();
}));
$('e-auto').onclick = () => { state.enhance = autoEnhance(state.seg); fillRefineControls(); rebuild(); toast('Imagem ajustada automaticamente — refine nos controles se quiser.'); };
$('e-reset').onclick = () => { state.enhance = { ...ENHANCE_DEFAULT }; fillRefineControls(); rebuild(); };

$('file').addEventListener('change', e => { openFile(e.target.files[0]); e.target.value = ''; });
$('change').onclick = () => $('file').click();
$('empty-upload').onclick = () => $('file').click();

// arrastar e soltar em qualquer lugar da área de trabalho
const stage = document.querySelector('.stage');
for (const el of [stage, $('drop')]) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); });
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); openFile(e.dataTransfer.files[0]); });
}
addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) openFile(f); });

/* ---------- editor manual (apagar / restaurar com pincel) ---------- */

const ed = { work: null, ghost: null, undo: [], mode: 'erase', size: 28, drawing: false, manual: null };
const edCanvas = $('editor-canvas');

function edRedraw() {
  const ctx = edCanvas.getContext('2d');
  ctx.clearRect(0, 0, edCanvas.width, edCanvas.height);
  if ($('ghost').checked) { // foto original apagada e avermelhada = o que está fora do recorte
    ctx.globalAlpha = 0.35; ctx.drawImage(ed.ghost, 0, 0);
    ctx.globalAlpha = 0.22; ctx.fillStyle = '#ff3b30'; ctx.fillRect(0, 0, edCanvas.width, edCanvas.height);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(ed.work, 0, 0);
}
function openEditor() {
  const { width: w, height: h } = state.seg.src;
  ed.manual = state.manual ? state.manual.slice() : new Uint8Array(w * h);
  ed.work = composeFull(state.seg, { ...state.refine, rotate: 0 }, state.enhance, ed.manual);
  ed.ghost = enhancedCanvas(state.seg, state.enhance);
  ed.undo = [];
  edCanvas.width = w; edCanvas.height = h;
  edRedraw();
  $('editor').hidden = false;
}
function edPoint(e) {
  const r = edCanvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * edCanvas.width / r.width, y: (e.clientY - r.top) * edCanvas.height / r.height, scale: edCanvas.width / r.width };
}
function edPaint(e) {
  const { x, y, scale } = edPoint(e);
  const rad = ed.size / 2 * scale, w = edCanvas.width, h = edCanvas.height;
  const x0 = Math.max(0, Math.floor(x - rad)), x1 = Math.min(w - 1, Math.ceil(x + rad));
  const y0 = Math.max(0, Math.floor(y - rad)), y1 = Math.min(h - 1, Math.ceil(y + rad));
  const val = ed.mode === 'erase' ? 1 : 2;
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    if ((xx - x) ** 2 + (yy - y) ** 2 <= rad * rad) ed.manual[yy * w + xx] = val;
  }
  const ctx = ed.work.getContext('2d');
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
  if (ed.mode === 'erase') { ctx.globalCompositeOperation = 'destination-out'; ctx.fill(); }
  else { ctx.clip(); ctx.clearRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1); ctx.drawImage(ed.ghost, 0, 0); }
  ctx.restore();
  edRedraw();
}
function edCursor(e) {
  const r = $('editor-stage').getBoundingClientRect(), c = $('brush-cursor');
  c.style.left = e.clientX - r.left + 'px'; c.style.top = e.clientY - r.top + 'px';
  c.style.width = c.style.height = ed.size + 'px';
}
edCanvas.addEventListener('pointerdown', e => {
  ed.drawing = true; edCanvas.setPointerCapture(e.pointerId);
  ed.undo.push(ed.manual.slice()); if (ed.undo.length > 15) ed.undo.shift();
  edPaint(e);
});
edCanvas.addEventListener('pointermove', e => { edCursor(e); if (ed.drawing) edPaint(e); });
edCanvas.addEventListener('pointerup', () => { ed.drawing = false; });
function edUndo() {
  if (!ed.undo.length) return;
  ed.manual = ed.undo.pop();
  ed.work = composeFull(state.seg, { ...state.refine, rotate: 0 }, state.enhance, ed.manual);
  edRedraw();
}
$('ed-undo').onclick = edUndo;
$('ed-clear').onclick = () => { ed.undo.push(ed.manual.slice()); ed.manual.fill(0); ed.work = composeFull(state.seg, { ...state.refine, rotate: 0 }, state.enhance, ed.manual); edRedraw(); };
$('ed-cancel').onclick = () => { $('editor').hidden = true; };
$('ed-apply').onclick = () => { state.manual = ed.manual.some(v => v) ? ed.manual : null; $('editor').hidden = true; rebuild(); };
$('ghost').onchange = edRedraw;
$('brush-size').oninput = e => { ed.size = +e.target.value; };
document.querySelectorAll('#brush-mode button').forEach(b => b.onclick = () => {
  ed.mode = b.dataset.b;
  document.querySelectorAll('#brush-mode button').forEach(x => x.classList.toggle('on', x === b));
});
addEventListener('keydown', e => {
  if ($('editor').hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); edUndo(); }
  if (e.key === 'Escape') $('editor').hidden = true;
});
$('open-editor').onclick = openEditor;

/* ---------- variações ---------- */

let variantSeed = 1;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function variantList() {
  const r = rng(variantSeed * 7919), out = [], seen = new Set();
  const scenes = SCENES.filter(s => s.id !== 'branco');
  while (out.length < 8) {
    const v = {
      scene: scenes[Math.floor(r() * scenes.length)].id,
      pose: POSES[Math.floor(r() * POSES.length)].id,
      template: TEMPLATES[Math.floor(r() * TEMPLATES.length)].id,
      accent: r() < 0.45 ? state.accent : COLORS[Math.floor(r() * COLORS.length)],
    };
    const key = v.scene + v.pose;
    if (seen.has(key)) continue;
    seen.add(key); out.push(v);
  }
  return out;
}
const labelOf = (list, id) => list.find(x => x.id === id)?.label;
function drawVariants() {
  const box = $('variants');
  box.innerHTML = '';
  const fmt = currentFormat().forceScene ? FORMATS[0] : currentFormat();
  const small = { ...fmt, w: Math.round(fmt.w / 3.6), h: Math.round(fmt.h / 3.6) };
  for (const v of variantList()) {
    const b = document.createElement('button');
    const c = document.createElement('canvas');
    render(c, small, renderState({ ...v, anim: 'none' }));
    b.append(c);
    b.insertAdjacentHTML('beforeend', `<span>${labelOf(SCENES, v.scene)} · ${labelOf(POSES, v.pose)} · ${labelOf(TEMPLATES, v.template)}</span>`);
    b.onclick = () => { Object.assign(state, v); sync(); $('preview').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    box.append(b);
  }
}
$('v-more').onclick = () => { variantSeed++; drawVariants(); };

/* ---------- downloads ---------- */

const fileBase = () => (state.info.name || 'produto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'produto';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

$('dl-one').onclick = async () => {
  const fmt = currentFormat();
  const c = render(document.createElement('canvas'), fmt, renderState()); // sempre em resolução cheia
  download(await toBlob(c), `${fileBase()}-${fmt.id}.png`);
  store.track('downloads'); store.count('formats', fmt.id);
  saveProject([fmt.id]);
};

$('dl-video').onclick = async () => {
  const fmt = currentFormat();
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return toast('Seu navegador não grava vídeo. Tente no Chrome, Edge ou Safari atualizado.');
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) return toast('Seu navegador não grava vídeo.');
  const c = document.createElement('canvas');
  const rs = renderState();
  render(c, fmt, { ...rs, t: 0 });
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => { rec.onstop = r; });
  busy(true, 'Gravando o vídeo…', `${VIDEO_MS / 1000} segundos em ${fmt.w} × ${fmt.h}. Mantenha esta aba aberta.`, 0);
  rec.start(250);
  const t0 = performance.now();
  await new Promise(resolve => {
    const frame = now => {
      const el = now - t0;
      render(c, fmt, { ...rs, t: animT(state.anim, el, false) });
      busy(true, 'Gravando o vídeo…', `${VIDEO_MS / 1000} segundos em ${fmt.w} × ${fmt.h}. Mantenha esta aba aberta.`, Math.min(1, el / VIDEO_MS));
      if (el < VIDEO_MS) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.stop(); await done; busy(false);
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  download(new Blob(chunks, { type: mime.split(';')[0] }), `${fileBase()}-${fmt.id}-${state.anim}.${ext}`);
  store.track('downloads'); store.count('formats', fmt.id);
  saveProject([fmt.id]);
  toast(ext === 'mp4' ? 'Vídeo MP4 baixado.' : 'Vídeo baixado em WebM (este navegador não grava MP4).', 4000);
};

$('dl-all').onclick = async () => {
  if (!window.JSZip) return toast('Ainda carregando… tente de novo em um instante.');
  busy(true, 'Montando o kit…', 'Gerando todas as peças em alta resolução.');
  await nextFrame();
  try {
    const zip = new JSZip(), rs = renderState(), c = document.createElement('canvas');
    for (const f of FORMATS) {
      render(c, f, rs);
      zip.file(`${fileBase()}-${f.id}-${f.w}x${f.h}.png`, await toBlob(c));
      store.count('formats', f.id);
    }
    zip.file(`${fileBase()}-sem-fundo.png`, await toBlob(state.cut));
    if (lastCopy) zip.file(`${fileBase()}-descricao.txt`, copyAsText(lastCopy));
    download(await zip.generateAsync({ type: 'blob' }), `${fileBase()}-kit.zip`);
    store.track('downloads', FORMATS.length);
    saveProject(FORMATS.map(f => f.id));
    toast('Kit baixado: 6 peças + recorte' + (lastCopy ? ' + descrição' : ''));
  } finally { busy(false); }
};

/* ---------- histórico (painel) ---------- */

let saveT = 0;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => saveProject(), 1200); }
function saveProject(formats = []) {
  if (!state.cut || !state.id) return;
  const c = render(document.createElement('canvas'), { w: 320, h: 320 }, renderState());
  const prev = store.get().projects.find(p => p.id === state.id);
  store.saveProject({
    id: state.id, ts: Date.now(), name: state.info.name || 'Sem nome',
    scene: state.scene, template: state.template,
    formats: [...new Set([...(prev?.formats || []), ...formats])],
    thumb: c.toDataURL('image/jpeg', 0.7),
  });
}

/* ---------- descrição ---------- */

for (const [k, v] of Object.entries(CATEGORIES)) $('c-cat').add(new Option(v.label, k));
for (const [k, v] of Object.entries(TONES)) $('c-tone').add(new Option(v.label, k));

let lastCopy = null;
const COPY_BLOCKS = [
  ['title', 'Título (SEO)', false], ['short', 'Descrição curta', false], ['long', 'Descrição completa', true],
  ['bullets', 'Destaques', false], ['seo', 'Meta descrição (Google)', false], ['caption', 'Legenda para Instagram', true],
];
function copyAsText(c) {
  return COPY_BLOCKS.map(([k, label]) => `${label.toUpperCase()}\n${Array.isArray(c[k]) ? c[k].join('\n') : c[k]}`).join('\n\n');
}

$('c-gen').onclick = () => {
  const c = generateCopy({
    name: state.info.name, brand: state.info.brand, category: $('c-cat').value, tone: $('c-tone').value,
    features: $('c-feats').value, audience: $('c-aud').value, price: state.info.price, promo: state.info.promo,
  });
  lastCopy = c;
  const out = $('copy-out');
  out.innerHTML = '';
  for (const [k, label, full] of COPY_BLOCKS) {
    const text = Array.isArray(c[k]) ? c[k].join('\n') : c[k];
    const card = document.createElement('div');
    card.className = 'card-copy' + (full ? ' full' : '');
    card.innerHTML = `<h5>${label}</h5><p></p><button>Copiar</button>`;
    card.querySelector('p').textContent = text;
    card.querySelector('button').onclick = async e => {
      try { await navigator.clipboard.writeText(text); } catch { return toast('Não foi possível copiar.'); }
      e.target.textContent = 'Copiado'; e.target.classList.add('ok');
      setTimeout(() => { e.target.textContent = 'Copiar'; e.target.classList.remove('ok'); }, 1600);
      store.track('copies');
    };
    out.append(card);
  }
  out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

/* ---------- início ---------- */

const qs = new URLSearchParams(location.search);
if (SCENES.some(s => s.id === qs.get('scene'))) state.scene = qs.get('scene');
sync();
if (SAMPLES[qs.get('sample')]) document.fonts.ready.then(() => useSample(qs.get('sample')));
