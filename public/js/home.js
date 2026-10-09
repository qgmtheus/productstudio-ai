import { FORMATS, SCENES, loadImage, removeBackgroundFast, render } from './engine.js';

const SAMPLES = [
  { id: 'serum',   name: 'Sérum Vitamina C', brand: 'LUMA', tagline: 'Pele luminosa em 14 dias', price: 129.9, promo: 89.9, accent: '#8a5cc7', scene: 'podio' },
  { id: 'perfume', name: 'Ambre Eau de Parfum', brand: 'Maison Ambre', tagline: 'Notas de âmbar e baunilha', price: 349, promo: 279, accent: '#b07a3c', scene: 'marmore' },
  { id: 'caneca',  name: 'Caneca Bom Dia', brand: 'Casa Verde', tagline: 'Cerâmica artesanal, 350 ml', price: 69.9, promo: 49.9, accent: '#2f6f61', scene: 'madeira' },
];
const cuts = {};

async function cutOf(id) {
  if (!cuts[id]) cuts[id] = removeBackgroundFast(await loadImage(`img/samples/${id}.svg`));
  return cuts[id];
}
const stateFor = (s, cut, over = {}) => ({
  cut, scene: s.scene, template: 'lancamento', accent: s.accent,
  info: { name: s.name, brand: s.brand, tagline: s.tagline, price: s.price, promo: s.promo, cta: 'Comprar agora' }, ...over,
});

// antes/depois arrastável
const cmp = document.getElementById('compare');
const setPos = e => {
  const r = cmp.getBoundingClientRect();
  const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0.02), 0.98);
  cmp.style.setProperty('--pos', (x * 100).toFixed(1) + '%');
};
let drag = false;
cmp.addEventListener('pointerdown', e => { drag = true; cmp.setPointerCapture(e.pointerId); setPos(e); });
cmp.addEventListener('pointermove', e => drag && setPos(e));
cmp.addEventListener('pointerup', () => drag = false);

let current = SAMPLES[0];
async function show(s) {
  current = s;
  document.getElementById('cmp-before').src = `img/samples/${s.id}.svg`;
  const cut = await cutOf(s.id);
  render(document.getElementById('cmp-after'), FORMATS[0], stateFor(s, cut));
  document.querySelectorAll('#sample-pick button').forEach(b => b.classList.toggle('on', b.dataset.id === s.id));
  drawStrip(s, cut);
  drawScenes(s, cut);
}

const pick = document.getElementById('sample-pick');
for (const s of SAMPLES) {
  const b = document.createElement('button');
  b.dataset.id = s.id; b.title = s.name;
  b.innerHTML = `<img src="img/samples/${s.id}.svg" alt="${s.name}">`;
  b.onclick = () => show(s);
  pick.append(b);
}

function drawStrip(s, cut) {
  const row = document.getElementById('strip');
  row.innerHTML = '';
  const tpls = { feed: 'promo', retrato: 'minimal', story: 'lancamento', anuncio: 'promo', banner: 'frete' };
  for (const f of FORMATS) {
    const c = document.createElement('canvas');
    render(c, f, stateFor(s, cut, { template: tpls[f.id] || 'limpo' }));
    const fig = document.createElement('figure');
    fig.append(c);
    fig.insertAdjacentHTML('beforeend', `<figcaption><span>${f.label}</span><span>${f.ratio}</span></figcaption>`);
    row.append(fig);
  }
}

function drawScenes(s, cut) {
  const grid = document.getElementById('scene-grid');
  grid.innerHTML = '';
  for (const sc of SCENES) {
    const c = document.createElement('canvas');
    render(c, { w: 600, h: 600 }, stateFor(s, cut, { scene: sc.id, template: 'limpo' }));
    const a = document.createElement('a');
    a.href = `/studio?sample=${s.id}&scene=${sc.id}`;
    a.innerHTML = `<figure></figure>`;
    a.firstChild.append(c);
    a.firstChild.insertAdjacentHTML('beforeend', `<figcaption>${sc.label}</figcaption>`);
    grid.append(a);
  }
}

// troca automática de amostra no hero até o visitante interagir
let auto = setInterval(() => show(SAMPLES[(SAMPLES.indexOf(current) + 1) % SAMPLES.length]), 6000);
[cmp, pick].forEach(el => el.addEventListener('pointerdown', () => clearInterval(auto)));

document.fonts.ready.then(() => show(current));

// cabeçalho e animações de entrada
const nav = document.querySelector('.nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });
const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));
