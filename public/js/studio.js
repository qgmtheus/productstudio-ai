import { FORMATS, SCENES, TEMPLATES, loadImage, removeBackgroundFast, removeBackgroundAI, render, toBlob } from './engine.js';
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
  id: null, file: null, source: null, cut: null, sample: null,
  mode: 'ai', tolerance: 34,
  scene: 'estudio', template: 'lancamento', accent: COLORS[0], scale: 1,
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

function chipGroup(el, items, key, render) {
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.dataset.id = it.id;
    b.innerHTML = render ? render(it) : it.label;
    b.onclick = () => { state[key] = it.id; store.count(key === 'scene' ? 'scenes' : 'templates', it.id); sync(); };
    el.append(b);
  }
}
chipGroup($('scenes'), SCENES, 'scene', s => `<i style="background:${s.swatch}"></i>${s.label}`);
chipGroup($('templates'), TEMPLATES, 'template');

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
    if (k === 'name') state.autoName = false;
    if (k === 'name') $('crumb').textContent = e.target.value || 'Novo projeto';
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

let raf = 0;
function sync() {
  document.querySelectorAll('#scenes button').forEach(b => b.classList.toggle('on', b.dataset.id === state.scene));
  document.querySelectorAll('#templates button').forEach(b => b.classList.toggle('on', b.dataset.id === state.template));
  document.querySelectorAll('#colors button').forEach(b => b.classList.toggle('on', b.dataset.c === state.accent));
  document.querySelectorAll('#formats button').forEach(b => b.classList.toggle('on', b.dataset.id === state.format));
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(draw);
}

function renderState() {
  return { cut: state.cut, scene: state.scene, template: state.template, accent: state.accent, scale: state.scale,
    info: { ...state.info, price: parseFloat(state.info.price) || 0, promo: parseFloat(state.info.promo) || 0 } };
}

function draw() {
  if (!state.cut) return;
  const rs = renderState();
  const fmt = FORMATS.find(f => f.id === state.format);
  render($('main-canvas'), fmt, rs);
  $('fmt-info').textContent = `${fmt.label} · ${fmt.w} × ${fmt.h} px${fmt.forceScene ? ' · fundo branco exigido por marketplaces' : ''}`;
  for (const f of FORMATS) render(thumbs[f.id], { ...f, w: Math.round(f.w / 4), h: Math.round(f.h / 4) }, rs);
  saveSoon();
}

/* ---------- foto e recorte ---------- */

async function openFile(file) {
  if (!file || !file.type.startsWith('image/')) return toast('Envie um arquivo de imagem (JPG, PNG ou WEBP).');
  if (file.size > 15e6) return toast('Imagem muito grande (máx. 15 MB).');
  const url = URL.createObjectURL(file);
  try {
    state.source = await loadImage(url);
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
      state.cut = await removeBackgroundAI(await sourceBlob(), (phase, p) => {
        if (phase === 'fetch') busy(true, 'Baixando o modelo de IA…', 'Só na primeira vez. Depois fica salvo no navegador.', p);
        else busy(true, 'Recortando o produto com IA…', 'Leva alguns segundos.', null);
      });
    } else {
      busy(true, 'Removendo o fundo…');
      await new Promise(r => setTimeout(r, 30)); // deixa o overlay aparecer
      state.cut = removeBackgroundFast(state.source, { tolerance: state.tolerance });
      if (state.cut.lowConfidence) note = 'O fundo da foto não é liso — use “Precisão (IA)” para um recorte melhor.';
    }
  } catch (e) {
    console.error('Falha na remoção de fundo por IA:', e);
    setMode('fast');
    state.cut = removeBackgroundFast(state.source, { tolerance: state.tolerance });
    note = 'Não foi possível rodar a IA neste navegador. Usamos o modo rápido — funciona melhor com fundo liso.';
  } finally { busy(false); }

  const cc = $('cut-canvas');
  cc.width = state.cut.width; cc.height = state.cut.height;
  cc.getContext('2d').drawImage(state.cut, 0, 0);
  $('drop').hidden = true; $('cut-preview').hidden = false;
  $('empty').hidden = true; $('work').hidden = false;
  $('dl-all').disabled = false;
  const ms = Math.round(performance.now() - t0);
  toast(note || `Fundo removido em ${(ms / 1000).toFixed(1).replace('.', ',')}s`, note ? 6000 : 2400);
  sync();
}

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

/* ---------- downloads ---------- */

const fileBase = () => (state.info.name || 'produto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'produto';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

$('dl-one').onclick = async () => {
  const fmt = FORMATS.find(f => f.id === state.format);
  download(await toBlob($('main-canvas')), `${fileBase()}-${fmt.id}.png`);
  store.track('downloads'); store.count('formats', fmt.id);
  saveProject([fmt.id]);
};

$('dl-all').onclick = async () => {
  if (!window.JSZip) return toast('Ainda carregando… tente de novo em um instante.');
  busy(true, 'Montando o kit…', 'Gerando todas as peças em alta resolução.');
  try {
    const zip = new JSZip(), rs = renderState(), c = document.createElement('canvas');
    for (const f of FORMATS) {
      render(c, f, rs);
      zip.file(`${fileBase()}-${f.id}-${f.w}x${f.h}.png`, await toBlob(c));
      store.count('formats', f.id);
    }
    const tr = document.createElement('canvas');
    tr.width = state.cut.width; tr.height = state.cut.height;
    tr.getContext('2d').drawImage(state.cut, 0, 0);
    zip.file(`${fileBase()}-sem-fundo.png`, await toBlob(tr));
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
  const c = document.createElement('canvas');
  render(c, { w: 320, h: 320 }, renderState());
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
