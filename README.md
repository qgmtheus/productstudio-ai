# ProductStudio AI · Estúdio de imagens de produtos

O cliente envia uma foto simples do produto e a plataforma devolve imagens publicitárias com fundo removido,
cenários, banners, peças promocionais em vários formatos e descrições de venda prontas.

**Demo:** https://productstudio-ai.vercel.app · **Estúdio:** /studio · **Painel:** /admin

## Funcionalidades

**Estúdio** (`/studio`)
- Envio por clique, arrastar e soltar ou colar (Ctrl+V); três produtos de exemplo
- Remoção de fundo em dois modos: **rápido** (algoritmo próprio, instantâneo, remove até o fundo dentro de alças)
  e **precisão (IA)** — rede neural rodando no navegador (`@imgly/background-removal`, ~80 MB baixados só na 1ª vez; é o modo padrão para fotos enviadas)
- Refino do recorte: remover partes finas (cabos, fios), bordas suaves/nítidas, girar o produto e
  pincel para apagar/restaurar à mão (com desfazer)
- Melhorar imagem: automático (níveis do próprio produto) + brilho, contraste, saturação, temperatura e nitidez
- 5 composições (padrão, flutuando, inclinado, dupla, trio) e **variações** prontas da mesma foto
- 5 animações (flutuar, zoom, brilho, balanço, entrada) com prévia ao vivo e **download em vídeo** (MP4; WebM onde não há MP4)
- 8 cenários gerados na hora (estúdio, pódio, mármore, madeira, pôr do sol, natureza, neon, fundo branco),
  com sombra de contato e reflexo
- 5 peças (só a foto, lançamento, promoção com selo de desconto, frete grátis, minimalista) com a cor da marca
- 6 formatos: post 1:1, feed 4:5, story 9:16, anúncio 1.91:1, banner 16:5 e marketplace (fundo branco obrigatório)
- Descrição automática: título SEO, descrição curta e completa, destaques, meta descrição, legenda e hashtags,
  em três tons de voz
- Download de cada peça em PNG ou do kit inteiro em `.zip` (peças + recorte sem fundo + descrição .txt)

**Painel** (`/admin`): produtos recentes com miniatura, atividade de 14 dias, formatos/cenários/peças mais usados.

## Como funciona

Template de demonstração **sem backend**: todo o processamento de imagem acontece em `<canvas>` no navegador
e o histórico fica no `localStorage` do visitante. Os textos são gerados por regras (`public/js/copy.js`);
numa versão comercial essa função chamaria um modelo de linguagem com os mesmos campos, e os cenários
poderiam ser complementados por um modelo de geração de imagem.

- `public/js/engine.js` — recorte, cenários, formatos e composição das peças
- `public/js/copy.js` — gerador de descrições
- `public/js/store.js` — "banco" local e dados de exemplo do painel

## Rodar localmente

```bash
npm run dev   # http://localhost:3001
```
