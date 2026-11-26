# NormaPronta

Formatação automática de trabalhos acadêmicos (.docx e PDF) nas normas ABNT atualizadas:
NBR 14724:2024, NBR 6023:2025, NBR 10520:2023, NBR 6024:2012, NBR 6027:2012 e NBR 6028:2021.

- Tudo roda no navegador: o arquivo do cliente não é enviado a nenhum servidor.
- Site estático: basta publicar o `index.html` (Hostinger, Netlify, Vercel, GitHub Pages).

## Estrutura

- `index.html` — landing page de vendas (normaprontatcc.com.br).
- `app/index.html` — o app formatador (app.normaprontatcc.com.br, acesso restrito).
- `robots.txt` e `sitemap.xml` — o app fica fora dos buscadores.
- `src/core.js` — motor de formatação ABNT.
- `src/template.html` — interface.
- `src/build.js` — junta os dois e gera o `app/index.html` (`node src/build.js`).

## Blog

- Artigos em `src/blog/posts/*.md` (cabeçalho com title, slug, description, date, category, faq, sources).
- Gerar: `MARKED_PATH=<caminho do pacote marked> node src/blog/build-blog.js` → escreve `blog/` e atualiza `sitemap.xml`.

## Acesso ao app

O app (app.normaprontatcc.com.br) é protegido por senha pela Hostinger (Avançado › Diretórios protegidos por senha). Não versionar `app/.htaccess` nem `.htpasswd`.

## Busca com IA

- `robots.txt` libera Googlebot, Bingbot e robôs de IA (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot etc.); bloqueia /app/ e /src/.
- `llms.txt` é gerado pelo build do blog com o resumo do serviço e a lista de artigos.
- IndexNow: chave em `f6f4b17399ba7c3a6d680ecd89f3baa6.txt`. Após publicar artigo, enviar POST para https://www.bing.com/indexnow com host, key e urlList.
- Depois de publicar, limpar o cache do CDN da Hostinger (Desempenho › CDN › Limpar cache) para robots.txt e sitemap atualizarem.

## Versão offline

`node src/build.js && node src/build-offline.js app/index.html NormaPronta-offline.html` gera um arquivo único com as bibliotecas embutidas (precisa das libs em /home/claude/abnt/node_modules). Não versionar o HTML gerado.
