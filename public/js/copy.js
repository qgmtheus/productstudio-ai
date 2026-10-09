// Gerador de textos de venda. Na demo é feito por regras (sem servidor);
// numa versão de produção esta função chamaria um modelo de linguagem com os mesmos campos.

export const CATEGORIES = {
  beleza:      { label: 'Beleza e cuidados', benefit: 'realça sua beleza natural', use: 'na sua rotina de cuidados', tags: ['beleza', 'skincare', 'autocuidado'] },
  perfumaria:  { label: 'Perfumaria',        benefit: 'deixa uma assinatura marcante por onde você passa', use: 'do dia a dia às ocasiões especiais', tags: ['perfume', 'fragrancia', 'perfumaria'] },
  casa:        { label: 'Casa e cozinha',    benefit: 'deixa a casa mais bonita e prática', use: 'no dia a dia da sua casa', tags: ['casa', 'decor', 'cozinha'] },
  moda:        { label: 'Moda e acessórios', benefit: 'completa o look com personalidade', use: 'em qualquer produção', tags: ['moda', 'estilo', 'look'] },
  eletronicos: { label: 'Eletrônicos',       benefit: 'entrega desempenho sem complicação', use: 'em casa, no trabalho ou em viagem', tags: ['tecnologia', 'eletronicos', 'gadgets'] },
  alimentos:   { label: 'Alimentos e bebidas', benefit: 'traz sabor de verdade para o seu momento', use: 'no café da manhã, no lanche ou para presentear', tags: ['gastronomia', 'sabor', 'artesanal'] },
};

export const TONES = {
  profissional: { label: 'Profissional' },
  descontraido: { label: 'Descontraído' },
  luxo:         { label: 'Sofisticado' },
};

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const listPt = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1];
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function generateCopy({ name, brand, category, features, audience, tone, price, promo }) {
  const c = CATEGORIES[category] || CATEGORIES.beleza;
  const feats = String(features || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean).slice(0, 6);
  const n = (name || 'Produto').trim();
  const b = (brand || '').trim();
  const who = (audience || '').trim();
  const f = feats.length ? feats : ['acabamento premium', 'alta durabilidade', 'ótimo custo-benefício'];
  const fl = f.map(x => x.toLowerCase());
  const p = Number(price) || 0, q = Number(promo) || 0;
  const hasPromo = p && q && q < p;

  const title = [n, b && `– ${b}`, f[0] && `| ${cap(f[0])}`].filter(Boolean).join(' ').slice(0, 70);

  const short = {
    profissional: `${n}${b ? ` da ${b}` : ''}: ${listPt(fl.slice(0, 3))}. Um produto que ${c.benefit}${who ? `, pensado para ${who}` : ''}.`,
    descontraido: `Conheça ${n}! ${cap(listPt(fl.slice(0, 2)))} num só produto — do jeitinho que ${c.benefit.replace(/^deixa/, 'deixa tudo')}. ${who ? `Perfeito para ${who}.` : 'Você vai amar.'}`,
    luxo:         `${n}${b ? `, por ${b}` : ''}. ${cap(fl[0])} e ${fl[1] || 'acabamento impecável'} em uma peça que ${c.benefit}. Feito para quem não abre mão do melhor.`,
  }[tone] || '';

  const long = [
    {
      profissional: `${n} foi desenvolvido para quem busca qualidade ${c.use}. Combina ${listPt(fl)} para entregar um resultado consistente desde o primeiro uso.`,
      descontraido: `Sabe aquele produto que você usa uma vez e não larga mais? Esse é o ${n}. Tem ${listPt(fl)} e cabe direitinho ${c.use}.`,
      luxo:         `Cada detalhe de ${n} foi pensado com cuidado. ${cap(listPt(fl))} se unem em uma experiência que ${c.benefit}, ${c.use}.`,
    }[tone],
    who ? `Ideal para ${who}.` : '',
    hasPromo ? `Aproveite: de ${brl(p)} por apenas ${brl(q)} — ${Math.round((1 - q / p) * 100)}% de desconto por tempo limitado.` : p ? `Valor: ${brl(p)}.` : '',
  ].filter(Boolean).join(' ');

  const bullets = f.map(x => `✓ ${cap(x)}`);

  const tags = [...new Set([slug(n), b && slug(b), ...c.tags, ...fl.slice(0, 3).map(slug), hasPromo && 'promocao', 'compreonline'].filter(Boolean))]
    .filter(t => t.length > 2 && t.length < 26).slice(0, 10).map(t => '#' + t);

  const caption = {
    profissional: `${n} chegou. ${cap(fl[0])}${fl[1] ? ` e ${fl[1]}` : ''} para ${who || 'você'}.${hasPromo ? ` Condição especial: ${brl(q)}.` : ''}\n\nGaranta o seu pelo link da bio.`,
    descontraido: `Aquele momento em que você encontra o produto perfeito 😍\n${n}: ${listPt(fl.slice(0, 3))}.${hasPromo ? `\nE tá com ${Math.round((1 - q / p) * 100)}% OFF!` : ''}\n\nCorre no link da bio 🏃‍♀️`,
    luxo:         `${n}.\n${cap(listPt(fl.slice(0, 2)))}.\nPara momentos que merecem o extraordinário.\n\nDisponível no link da bio.`,
  }[tone];

  const seo = `${n}${b ? ` ${b}` : ''} com ${listPt(fl.slice(0, 2))}. ${hasPromo ? `${Math.round((1 - q / p) * 100)}% OFF. ` : ''}Compre online com entrega rápida.`.slice(0, 158);

  return { title, short, long, bullets, tags, caption: caption + '\n\n' + tags.join(' '), seo };
}
