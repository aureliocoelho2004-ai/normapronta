// Gera o blog estático a partir de src/blog/posts/*.md
// Uso: node src/blog/build-blog.js   (precisa do pacote "marked"; caminho em MARKED_PATH ou node_modules)
const fs = require('fs');
const path = require('path');
const { marked } = require(process.env.MARKED_PATH || 'marked');

const ROOT = path.join(__dirname, '..', '..');
const SITE = 'https://normaprontatcc.com.br';
const WHATS = '5521975978875';
const POSTS_DIR = path.join(__dirname, 'posts');
const OUT = path.join(ROOT, 'blog');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const wa = msg => `https://wa.me/${WHATS}?text=${encodeURIComponent(msg)}`;

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('Sem cabeçalho: ' + file);
  const meta = {}; let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) { key = kv[1]; meta[key] = kv[2].trim(); if (meta[key] === '') meta[key] = []; continue; }
    const li = line.match(/^\s*-\s*(.*)$/);
    if (li && key) { if (!Array.isArray(meta[key])) meta[key] = []; meta[key].push(li[1].trim()); }
  }
  meta.body = m[2];
  meta.slug = meta.slug || slugify(meta.title);
  // faq: "Pergunta? || Resposta"
  meta.faq = (meta.faq || []).map(x => { const [q, a] = x.split('||').map(s => s.trim()); return { q, a }; });
  meta.sources = (meta.sources || []).map(x => { const [t, u] = x.split('||').map(s => s.trim()); return { t, u }; });
  return meta;
}

const CTA = (p, final) => `
<aside class="cta-box${final ? ' final' : ''}">
  <div>
    <strong>${final ? 'Quer o seu trabalho assim, sem dor de cabeça?' : 'Prazo apertado? A gente formata para você.'}</strong>
    <p>${final ? 'Mande o seu Word e receba grátis o diagnóstico, o orçamento e uma prévia de como vai ficar. A partir de R$ 39,90 até 50 páginas, entrega em até 24 horas.' : 'Formatação completa nas normas ABNT atualizadas, sem mexer no seu texto. Diagnóstico e prévia grátis.'}</p>
  </div>
  <a class="btn wa" href="${wa('Oi! Vim pelo blog (' + p.title + ') e quero o diagnóstico grátis do meu trabalho.')}" target="_blank" rel="noopener">Pedir diagnóstico grátis</a>
</aside>`;

function head({ title, description, url, type, jsonld }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${type}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="pt_BR">
<meta name="theme-color" content="#15171a">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2315171a'/%3E%3Cpath d='M18 46V18h6l16 18V18h6v28h-6L24 28v18z' fill='%23f6f4ef'/%3E%3Ccircle cx='50' cy='48' r='5' fill='%23d8432b'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
<header class="top"><div class="wrap nav">
  <a class="logo" href="/" aria-label="NormaPronta, início"><i>N</i>NormaPronta</a>
  <nav aria-label="Seções"><a href="/blog/">Blog</a><a href="/#planos">Planos</a><a href="/#duvidas">Dúvidas</a></nav>
  <a class="btn wa sm" href="${wa('Oi! Vim pelo blog e quero o diagnóstico grátis do meu trabalho.')}" target="_blank" rel="noopener">Diagnóstico grátis</a>
</div></header>`;
}
const FOOT = `
<footer class="foot"><div class="wrap">
  <span><strong>NormaPronta</strong> · Formatação de trabalhos acadêmicos nas normas ABNT · <a href="/">normaprontatcc.com.br</a></span>
  <span>Não somos afiliados à ABNT. As normas citadas são publicações da Associação Brasileira de Normas Técnicas. Confira sempre o manual da sua instituição.</span>
</div></footer>
</body>
</html>`;

function render(p, all) {
  const url = `${SITE}/blog/${p.slug}/`;
  // corpo: insere ids nos h2 e um CTA depois do 2º h2
  const toc = [];
  let html = marked.parse(p.body, { mangle: false, headerIds: false });
  html = html.replace(/<h2>(.*?)<\/h2>/g, (m, t) => { const id = slugify(t.replace(/<[^>]+>/g, '')); toc.push({ id, t: t.replace(/<[^>]+>/g, '') }); return `<h2 id="${id}">${t}</h2>`; });
  let n = 0;
  html = html.replace(/<h2 id=/g, m => (++n === 3 ? CTA(p, false) + '\n' : '') + m);
  html = html.replace(/ disabled=""/g, ' aria-label="Marcar item"');
  html = html.replace(/<a href="(https?:\/\/(?!normaprontatcc)[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener"');
  const words = p.body.split(/\s+/).length;
  const mins = Math.max(3, Math.round(words / 200));
  const related = all.filter(x => x.slug !== p.slug).slice(0, 3);
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.description, datePublished: p.date, dateModified: p.updated || p.date,
      author: { '@type': 'Organization', name: 'NormaPronta' }, publisher: { '@type': 'Organization', name: 'NormaPronta', url: SITE }, mainEntityOfPage: url, inLanguage: 'pt-BR' },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog/' }, { '@type': 'ListItem', position: 3, name: p.title, item: url }] }
  ];
  if (p.faq.length) jsonld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  return head({ title: p.title + ' | NormaPronta', description: p.description, url, type: 'article', jsonld }) + `
<main class="wrap post">
  <nav class="crumbs" aria-label="Trilha"><a href="/">Início</a> › <a href="/blog/">Blog</a></nav>
  <article>
    <header class="post-head">
      <span class="kicker">${esc(p.category || 'Normas ABNT')}</span>
      <h1>${esc(p.title)}</h1>
      <p class="lead">${esc(p.description)}</p>
      <p class="meta">Atualizado em ${fmtDate(p.updated || p.date)} · ${mins} min de leitura</p>
    </header>
    ${toc.length > 2 ? `<nav class="toc" aria-label="Neste artigo"><strong>Neste artigo</strong><ol>${toc.map(t => `<li><a href="#${t.id}">${esc(t.t)}</a></li>`).join('')}</ol></nav>` : ''}
    <div class="prose">
${html}
    </div>
    ${p.faq.length ? `<section class="faq"><h2 id="perguntas-frequentes">Perguntas frequentes</h2>${p.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</section>` : ''}
    ${CTA(p, true)}
    ${p.sources.length ? `<section class="sources"><h2>Fontes consultadas</h2><ul>${p.sources.map(s => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a></li>`).join('')}</ul><p class="note">Este artigo resume as normas com as nossas palavras. O texto oficial das normas é vendido pela ABNT, e o manual da sua instituição prevalece quando for diferente.</p></section>` : ''}
  </article>
  ${related.length ? `<section class="related"><h2>Leia também</h2><div class="cards">${related.map(r => `<a class="card" href="/blog/${r.slug}/"><span class="kicker">${esc(r.category || 'Normas ABNT')}</span><strong>${esc(r.title)}</strong><span class="more">Ler artigo →</span></a>`).join('')}</div></section>` : ''}
</main>` + FOOT;
}

function renderIndex(all) {
  const url = SITE + '/blog/';
  const title = 'Blog NormaPronta: normas ABNT, TCC e formatação sem complicação';
  const description = 'Guias práticos e atualizados sobre as normas ABNT para TCC, artigos, dissertações e teses: o que mudou nas normas, citações, referências e checklists de formatação.';
  const jsonld = [{ '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog NormaPronta', url, inLanguage: 'pt-BR', blogPost: all.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE}/blog/${p.slug}/`, datePublished: p.date })) }];
  return head({ title, description, url, type: 'website', jsonld }) + `
<main class="wrap">
  <section class="blog-hero">
    <span class="kicker">Blog</span>
    <h1>Normas ABNT sem complicação</h1>
    <p class="lead">Guias curtos e atualizados para você entregar o TCC dentro da norma. E, se o prazo apertar, a gente formata para você.</p>
  </section>
  <div class="cards list">
    ${all.map(p => `<a class="card big" href="/blog/${p.slug}/"><span class="kicker">${esc(p.category || 'Normas ABNT')}</span><strong>${esc(p.title)}</strong><p>${esc(p.description)}</p><span class="more">Ler artigo →</span></a>`).join('\n    ')}
  </div>
  ${CTA({ title: 'página do blog' }, true)}
</main>` + FOOT;
}

const posts = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md')).map(f => parse(path.join(POSTS_DIR, f)))
  .filter(p => p.draft !== 'true').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
fs.mkdirSync(OUT, { recursive: true });
for (const p of posts) {
  fs.mkdirSync(path.join(OUT, p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, p.slug, 'index.html'), render(p, posts));
}
fs.writeFileSync(path.join(OUT, 'index.html'), renderIndex(posts));
fs.copyFileSync(path.join(__dirname, 'blog.css'), path.join(OUT, 'blog.css'));
// sitemap
const urls = [{ loc: SITE + '/', lastmod: new Date().toISOString().slice(0, 10) }, { loc: SITE + '/blog/', lastmod: posts[0] ? (posts[0].updated || posts[0].date) : undefined }]
  .concat(posts.map(p => ({ loc: `${SITE}/blog/${p.slug}/`, lastmod: p.updated || p.date })));
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n');
console.log('Blog gerado:', posts.length, 'artigo(s)');
