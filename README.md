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
