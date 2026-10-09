import { FORMATS, SCENES, TEMPLATES } from './engine.js';
import { store } from './store.js';

const $ = id => document.getElementById(id);
const label = (list, id) => list.find(x => x.id === id)?.label || id;
const sum = a => a.reduce((s, v) => s + v, 0);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

function bars(el, counts, list) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(1, ...rows.map(r => r[1]));
  el.innerHTML = rows.map(([id, n]) => `<div><span>${esc(label(list, id))}</span><u><i style="width:${(n / max) * 100}%"></i></u><b>${n}</b></div>`).join('');
}

function draw() {
  const db = store.get();
  const ev = db.events;
  const week = ev.slice(-7), prev = ev.slice(-14, -7);
  const up = sum(week.map(e => e.uploads)), upPrev = sum(prev.map(e => e.uploads));
  const dl = sum(week.map(e => e.downloads)), dlPrev = sum(prev.map(e => e.downloads));
  const delta = (a, b) => b ? `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}% vs. semana anterior` : '';
  const hours = (dl * 12 / 60).toFixed(0); // ~12 min economizados por peça feita à mão

  $('kpis').innerHTML = [
    ['Produtos no estúdio', db.projects.length, (n => `${n} ${n === 1 ? 'criado' : 'criados'} por você`)(db.projects.filter(p => !p.example).length)],
    ['Fotos enviadas (7 dias)', up, delta(up, upPrev)],
    ['Peças baixadas (7 dias)', dl, delta(dl, dlPrev)],
    ['Horas de edição poupadas', hours + ' h', '~12 min por peça'],
  ].map(([t, v, s]) => `<div class="kpi"><span>${t}</span><b>${v}</b><small>${s}</small></div>`).join('');

  const max = Math.max(1, ...ev.map(e => e.uploads + e.downloads));
  const todayKey = new Date().toISOString().slice(0, 10);
  $('chart').innerHTML = ev.map(e => {
    const d = new Date(e.day + 'T12:00');
    return `<div class="col${e.day === todayKey ? ' today' : ''}" title="${d.toLocaleDateString('pt-BR')}: ${e.uploads} fotos, ${e.downloads} peças">
      <i class="d" style="height:${(e.downloads / max) * 100}%"></i><i class="u" style="height:${(e.uploads / max) * 100}%"></i>
      <em>${d.getDate()}</em></div>`;
  }).join('');

  bars($('b-formats'), db.counters.formats, FORMATS);
  bars($('b-scenes'), db.counters.scenes, SCENES);
  bars($('b-templates'), db.counters.templates, TEMPLATES);

  const topF = Object.entries(db.counters.formats).sort((a, b) => b[1] - a[1]);
  const lowF = topF[topF.length - 1]?.[0];
  $('tip').innerHTML = `Você usa muito <b>${esc(label(FORMATS, topF[0][0]))}</b>, mas quase não baixa <b>${esc(label(FORMATS, lowF))}</b>. ` +
    `Com o botão <b>Baixar kit</b> você gera todos os formatos de uma vez e mantém a vitrine igual em todos os canais.`;

  const g = $('gallery');
  if (!db.projects.length) { g.innerHTML = '<p class="empty-g">Nenhum produto ainda. Abra o estúdio e envie uma foto.</p>'; return; }
  g.innerHTML = db.projects.map(p => `
    <a class="proj" href="/studio${p.example ? `?sample=${p.thumb.match(/samples\/(\w+)/)?.[1]}&scene=${p.scene}` : ''}">
      <img src="${esc(p.thumb)}" alt="" loading="lazy">
      ${p.example ? '<span class="ex">Exemplo</span>' : ''}
      <button class="del" data-id="${esc(p.id)}" title="Remover">✕</button>
      <div class="meta"><b>${esc(p.name)}</b><small>${ago(p.ts)} · ${esc(label(SCENES, p.scene))} · ${esc(label(TEMPLATES, p.template))}</small>
        <div class="pills">${(p.formats || []).map(f => `<span>${esc(label(FORMATS, f))}</span>`).join('') || '<span>Sem downloads ainda</span>'}</div>
      </div>
    </a>`).join('');
  g.querySelectorAll('.del').forEach(b => b.onclick = e => { e.preventDefault(); store.removeProject(b.dataset.id); draw(); });
}

$('reset').onclick = () => { if (confirm('Voltar o painel para os dados de exemplo?')) { store.reset(); draw(); } };
addEventListener('storage', () => { store.reload(); draw(); }); // atualiza se o estúdio estiver aberto em outra aba
draw();
