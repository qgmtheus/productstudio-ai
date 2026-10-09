// "Banco" local da demo: tudo fica no navegador do visitante (localStorage).
const KEY = 'productstudio:v1';

const day = 864e5;
function seed() {
  const now = Date.now();
  const ex = (i, name, scene, template, formats, ago, sample) => ({
    id: 'ex' + i, ts: now - ago, name, scene, template, formats, thumb: `img/samples/${sample}.svg`, example: true,
  });
  return {
    projects: [
      ex(1, 'Sérum Vitamina C Luma', 'podio', 'lancamento', ['feed', 'story', 'marketplace'], day * 0.3, 'serum'),
      ex(2, 'Ambre Eau de Parfum', 'marmore', 'minimal', ['feed', 'retrato'], day * 1.2, 'perfume'),
      ex(3, 'Caneca Bom Dia', 'madeira', 'promo', ['feed', 'anuncio', 'banner'], day * 2.6, 'caneca'),
      ex(4, 'Ambre 100ml', 'neon', 'promo', ['story'], day * 4.1, 'perfume'),
      ex(5, 'Sérum Luma – kit', 'natureza', 'frete', ['retrato', 'marketplace'], day * 6.8, 'serum'),
    ],
    events: Array.from({ length: 14 }, (_, k) => ({
      day: new Date(now - (13 - k) * day).toISOString().slice(0, 10),
      uploads: 3 + ((k * 7) % 9), downloads: 6 + ((k * 13) % 17), copies: 2 + ((k * 5) % 7),
    })),
    counters: {
      formats: { feed: 41, retrato: 18, story: 33, anuncio: 12, banner: 9, marketplace: 27 },
      scenes: { estudio: 22, podio: 31, marmore: 17, madeira: 11, 'por-do-sol': 8, natureza: 12, neon: 14, branco: 25 },
      templates: { limpo: 26, lancamento: 19, promo: 34, frete: 12, minimal: 15 },
    },
  };
}

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v?.projects) return v; } catch {}
  return seed();
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { // cota cheia: descarta miniaturas antigas e tenta de novo
    db.projects = db.projects.slice(0, 12);
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  }
}

function today() {
  const d = new Date().toISOString().slice(0, 10);
  let e = db.events.find(x => x.day === d);
  if (!e) { e = { day: d, uploads: 0, downloads: 0, copies: 0 }; db.events.push(e); db.events = db.events.slice(-14); }
  return e;
}

export const store = {
  get: () => db,
  reload() { db = load(); },
  track(kind, n = 1) { today()[kind] += n; save(); },
  count(group, id, n = 1) { db.counters[group][id] = (db.counters[group][id] || 0) + n; save(); },
  saveProject(p) {
    const i = db.projects.findIndex(x => x.id === p.id);
    if (i >= 0) db.projects[i] = { ...db.projects[i], ...p };
    else db.projects.unshift(p);
    db.projects = db.projects.slice(0, 24);
    save();
  },
  removeProject(id) { db.projects = db.projects.filter(p => p.id !== id); save(); },
  reset() { db = seed(); save(); },
};
