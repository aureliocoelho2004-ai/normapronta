/* NormaPronta — motor de formatação ABNT
 * NBR 14724:2024 (errata 2025), NBR 6023:2025, NBR 10520:2023, NBR 6024:2012, NBR 6027:2012, NBR 6028:2021
 * Funciona no navegador (DOMParser/XMLSerializer/JSZip globais) e no Node (injetados).
 */
(function (root) {
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const CM = 567; // twips por cm (aprox.)

  const PPR_ORDER = ['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange'];
  const RPR_ORDER = ['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','strike','dstrike','outline','shadow','emboss','imprint','noProof','snapToGrid','vanish','webHidden','color','spacing','w','kern','position','sz','szCs','highlight','u','effect','bdr','shd','fitText','vertAlign','rtl','cs','em','lang','eastAsianLayout','specVanish','oMath'];
  const SECT_ORDER = ['headerReference','footerReference','footnotePr','endnotePr','type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid','printerSettings','sectPrChange'];
  const STYLE_ORDER = ['name','aliases','basedOn','next','link','autoRedefine','hidden','uiPriority','semiHidden','unhideWhenUsed','qFormat','locked','personal','personalCompose','personalReply','rsid','pPr','rPr','tblPr','trPr','tcPr','tblStylePr'];
  const KEEP_FONTS = /symbol|wingdings|webdings|cambria math|math/i;

  const MESES = { janeiro:'jan.', fevereiro:'fev.', 'março':'mar.', marco:'mar.', abril:'abr.', maio:'maio', junho:'jun.', julho:'jul.', agosto:'ago.', setembro:'set.', outubro:'out.', novembro:'nov.', dezembro:'dez.' };

  const PRE_TITLES = /^(RESUMO|ABSTRACT|RESUMEN|R[ÉE]SUM[ÉE]|SUM[ÁA]RIO|AGRADECIMENTOS?|LISTA D[EO]S? .+|ERRATA|DEDICAT[ÓO]RIA|EP[ÍI]GRAFE|FOLHA DE APROVA[ÇC][ÃA]O)$/i;
  const POST_TITLES = /^(REFER[ÊE]NCIAS( BIBLIOGR[ÁA]FICAS)?|BIBLIOGRAFIA|GLOSS[ÁA]RIO|AP[ÊE]NDICES?(\s+[A-Z])?(\s*[–—-].*)?|ANEXOS?(\s+[A-Z])?(\s*[–—-].*)?|[ÍI]NDICE)$/i;
  const REF_TITLE = /^(REFER[ÊE]NCIAS( BIBLIOGR[ÁA]FICAS)?|BIBLIOGRAFIA)$/i;
  const CAPTION = /^(Figura|Tabela|Quadro|Gr[áa]fico|Ilustra[çc][ãa]o|Fotografia|Mapa|Desenho|Esquema|Fluxograma|Organograma|Imagem|Diagrama|Planta|Retrato|Prancha|Lâmina)\s+\d+/i;
  const SOURCE = /^(Fonte|Fontes|Nota|Notas|Legenda)\s*:/i;
  const SOURCE_SELF = /^(Fonte|Fontes)\s*:\s*(o\s+|a\s+)?(pr[óo]prio\s+|pr[óo]pria\s+)?(autor|autora|autores|autoras|autoria\s+pr[óo]pria|elaborad[oa]\s+pel[oa]s?\s+(pr[óo]pri[oa]s?\s+)?autor(a|es|as)?|dados\s+da\s+pesquisa\s+\(?autor)[^.]*\.?\s*$/i;

  function deaccent(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // ---------- utilidades XML ----------
  function kids(el, name) {
    const out = [];
    if (!el) return out;
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.localName === name && n.namespaceURI === W) out.push(n);
    return out;
  }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function all(el, name) { return Array.from(el.getElementsByTagNameNS(W, name)); }
  function attr(el, name) { return el ? el.getAttributeNS(W, name) || el.getAttribute('w:' + name) : null; }
  function mk(doc, name, attrs) {
    const e = doc.createElementNS(W, 'w:' + name);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttributeNS(W, 'w:' + k, String(attrs[k]));
    return e;
  }
  function insertOrdered(parent, el, order) {
    const idx = order.indexOf(el.localName);
    for (let n = parent.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const j = order.indexOf(n.localName);
      if (j > idx) { parent.insertBefore(el, n); return el; }
    }
    parent.appendChild(el);
    return el;
  }
  function setProp(parent, name, attrs, order) {
    kids(parent, name).forEach(n => parent.removeChild(n));
    return insertOrdered(parent, mk(parent.ownerDocument, name, attrs), order);
  }
  function delProp(parent, name) { kids(parent, name).forEach(n => parent.removeChild(n)); }
  function ensure(parent, name, order) {
    let e = kid(parent, name);
    if (!e) { e = mk(parent.ownerDocument, name); if (order) insertOrdered(parent, e, order); else parent.insertBefore(e, parent.firstChild); }
    return e;
  }
  function pPr(p) { return ensure(p, 'pPr'); }
  function runs(p) { return all(p, 'r').filter(r => !hasAncestor(r, 'pPr')); }
  function hasAncestor(n, name) { for (let a = n.parentNode; a; a = a.parentNode) if (a.localName === name) return true; return false; }
  function ancestor(n, name) { for (let a = n.parentNode; a; a = a.parentNode) if (a.localName === name) return a; return null; }
  function textNodes(p) { return all(p, 't').filter(t => !hasAncestor(t, 'del')); }
  function pText(p) { return textNodes(p).map(t => t.textContent).join(''); }
  function hasDrawing(p) { return all(p, 'drawing').length + all(p, 'pict').length + p.getElementsByTagName('m:oMath').length > 0; }

  // Edição de texto preservando runs: aplica fn ao texto concatenado com mesmo comprimento
  function mapChars(p, start, end, fn) {
    let pos = 0;
    for (const t of textNodes(p)) {
      const s = t.textContent, a = pos, b = pos + s.length;
      if (b > start && a < end) {
        const i0 = Math.max(0, start - a), i1 = Math.min(s.length, end - a);
        t.textContent = s.slice(0, i0) + fn(s.slice(i0, i1)) + s.slice(i1);
      }
      pos = b;
    }
  }
  function setPreserve(t) { t.setAttribute('xml:space', 'preserve'); }

  // Divide um run em [antes][alvo][depois] e devolve o run do alvo
  function splitRun(r, t, i0, i1) {
    const doc = r.ownerDocument, s = t.textContent;
    const mkRun = (txt) => {
      const nr = r.cloneNode(true);
      // mantém só rPr e um único t
      for (let n = nr.firstChild; n;) { const nx = n.nextSibling; if (n.nodeType === 1 && n.localName !== 'rPr') nr.removeChild(n); n = nx; }
      const nt = mk(doc, 't'); nt.textContent = txt; setPreserve(nt); nr.appendChild(nt); return nr;
    };
    if (kids(r, 't').length !== 1) return null;
    const parent = r.parentNode;
    const before = s.slice(0, i0), mid = s.slice(i0, i1), after = s.slice(i1);
    const mr = mkRun(mid);
    if (before) parent.insertBefore(mkRun(before), r);
    parent.insertBefore(mr, r);
    if (after) parent.insertBefore(mkRun(after), r);
    parent.removeChild(r);
    return mr;
  }

  // ---------- estilos ----------
  function fontAttrs(font) { return { ascii: font, hAnsi: font, cs: font, eastAsia: font }; }

  function fixStyles(sdoc, o, rep) {
    const styles = sdoc.documentElement;
    const dd = ensure(styles, 'docDefaults', ['docDefaults', 'latentStyles', 'style']);
    const rprD = ensure(ensure(dd, 'rPrDefault', ['rPrDefault', 'pPrDefault']), 'rPr');
    setProp(rprD, 'rFonts', fontAttrs(o.font), RPR_ORDER);
    setProp(rprD, 'sz', { val: o.SZ }, RPR_ORDER); setProp(rprD, 'szCs', { val: o.SZ }, RPR_ORDER);
    setProp(rprD, 'lang', { val: 'pt-BR', eastAsia: 'en-US', bidi: 'ar-SA' }, RPR_ORDER);
    const pprD = ensure(ensure(dd, 'pPrDefault', ['rPrDefault', 'pPrDefault']), 'pPr');
    setProp(pprD, 'spacing', { after: 0, line: o.LINE, lineRule: 'auto' }, PPR_ORDER);

    const byName = {};
    for (const st of kids(styles, 'style')) {
      const nm = (attr(kid(st, 'name'), 'val') || '').toLowerCase();
      byName[nm] = st;
      // fontes: tirar fontes de tema e cores de todos os estilos
      const rpr = kid(st, 'rPr');
      if (rpr) {
        const rf = kid(rpr, 'rFonts');
        if (rf && !KEEP_FONTS.test(attr(rf, 'ascii') || '')) setProp(rpr, 'rFonts', fontAttrs(o.font), RPR_ORDER);
        if (attr(st, 'type') !== 'character' || !/hyperlink/i.test(nm)) delProp(rpr, 'color');
      }
    }
    rep.styleIndex = {};
    for (const st of kids(styles, 'style')) {
      rep.styleIndex[attr(st, 'styleId')] = { name: (attr(kid(st, 'name'), 'val') || '').toLowerCase(), outline: attr(kid(kid(st, 'pPr'), 'outlineLvl'), 'val'), basedOn: attr(kid(st, 'basedOn'), 'val') };
    }
    function upsert(id, name, type, build) {
      let st = byName[name.toLowerCase()];
      if (!st) {
        st = mk(sdoc, 'style', { type, styleId: id });
        styles.appendChild(st);
        insertOrdered(st, mk(sdoc, 'name', { val: name }), STYLE_ORDER);
        byName[name.toLowerCase()] = st;
      }
      delProp(st, 'pPr'); delProp(st, 'rPr');
      const ppr = insertOrdered(st, mk(sdoc, 'pPr'), STYLE_ORDER);
      const rpr = insertOrdered(st, mk(sdoc, 'rPr'), STYLE_ORDER);
      setProp(rpr, 'rFonts', fontAttrs(o.font), RPR_ORDER);
      setProp(rpr, 'color', { val: '000000' }, RPR_ORDER);
      build(ppr, rpr, st);
      return attr(st, 'styleId');
    }
    const ids = {};
    ids.normal = upsert('Normal', 'Normal', 'paragraph', (ppr, rpr) => {
      setProp(ppr, 'spacing', { before: 0, after: 0, line: o.LINE, lineRule: 'auto' }, PPR_ORDER);
      setProp(ppr, 'jc', { val: 'both' }, PPR_ORDER);
      setProp(rpr, 'sz', { val: o.SZ }, RPR_ORDER); setProp(rpr, 'szCs', { val: o.SZ }, RPR_ORDER);
    });
    // NBR 6024: primária MAIÚSC+negrito; secundária MAIÚSC; terciária negrito; quaternária normal; quinária itálico
    const H = o.HEAD;
    ids.h = [null];
    for (let lv = 1; lv <= 5; lv++) {
      ids.h[lv] = upsert('Heading' + lv, 'heading ' + lv, 'paragraph', (ppr, rpr, st) => {
        delProp(st, 'basedOn'); delProp(st, 'next');
        insertOrdered(st, mk(sdoc, 'basedOn', { val: ids.normal }), STYLE_ORDER);
        insertOrdered(st, mk(sdoc, 'next', { val: ids.normal }), STYLE_ORDER);
        if (!kid(st, 'qFormat')) insertOrdered(st, mk(sdoc, 'qFormat'), STYLE_ORDER);
        setProp(ppr, 'keepNext', null, PPR_ORDER); setProp(ppr, 'keepLines', null, PPR_ORDER);
        setProp(ppr, 'spacing', { before: lv === 1 ? 0 : o.LINE, after: o.LINE, line: o.LINE, lineRule: 'auto' }, PPR_ORDER);
        setProp(ppr, 'ind', { left: 0, firstLine: 0 }, PPR_ORDER);
        setProp(ppr, 'jc', { val: H[lv].center ? 'center' : 'left' }, PPR_ORDER);
        setProp(ppr, 'outlineLvl', { val: lv - 1 }, PPR_ORDER);
        if (H[lv].b) { setProp(rpr, 'b', null, RPR_ORDER); setProp(rpr, 'bCs', null, RPR_ORDER); } else { setProp(rpr, 'b', { val: 0 }, RPR_ORDER); setProp(rpr, 'bCs', { val: 0 }, RPR_ORDER); }
        setProp(rpr, 'i', { val: H[lv].i ? 1 : 0 }, RPR_ORDER); setProp(rpr, 'iCs', { val: H[lv].i ? 1 : 0 }, RPR_ORDER);
        setProp(rpr, 'caps', { val: H[lv].caps ? 1 : 0 }, RPR_ORDER);
        setProp(rpr, 'sz', { val: o.SZ }, RPR_ORDER); setProp(rpr, 'szCs', { val: o.SZ }, RPR_ORDER);
      });
    }
    ids.pre = upsert('ABNTTituloSemIndicativo', 'ABNT Título sem indicativo', 'paragraph', (ppr, rpr, st) => {
      insertOrdered(st, mk(sdoc, 'basedOn', { val: ids.normal }), STYLE_ORDER);
      setProp(ppr, 'keepNext', null, PPR_ORDER);
      setProp(ppr, 'spacing', { before: 0, after: o.LINE, line: o.LINE, lineRule: 'auto' }, PPR_ORDER);
      setProp(ppr, 'ind', { left: 0, firstLine: 0 }, PPR_ORDER);
      setProp(ppr, 'jc', { val: 'center' }, PPR_ORDER);
      setProp(rpr, 'b', null, RPR_ORDER); setProp(rpr, 'caps', null, RPR_ORDER);
    });
    upsert('FootnoteText', 'footnote text', 'paragraph', (ppr, rpr) => {
      setProp(ppr, 'spacing', { before: 0, after: 0, line: 240, lineRule: 'auto' }, PPR_ORDER);
      setProp(ppr, 'jc', { val: 'both' }, PPR_ORDER);
      setProp(rpr, 'sz', { val: o.SM }, RPR_ORDER); setProp(rpr, 'szCs', { val: o.SM }, RPR_ORDER);
    });
    upsert('Caption', 'caption', 'paragraph', (ppr, rpr) => {
      setProp(ppr, 'spacing', { before: 0, after: 0, line: 240, lineRule: 'auto' }, PPR_ORDER);
      setProp(rpr, 'sz', { val: o.SM }, RPR_ORDER); setProp(rpr, 'szCs', { val: o.SM }, RPR_ORDER);
      setProp(rpr, 'i', { val: 0 }, RPR_ORDER);
    });
    // TOC 1..5 (NBR 6027): mesma grafia dos títulos
    for (let lv = 1; lv <= 5; lv++) {
      upsert('TOC' + lv, 'toc ' + lv, 'paragraph', (ppr, rpr, st) => {
        insertOrdered(st, mk(sdoc, 'basedOn', { val: ids.normal }), STYLE_ORDER);
        setProp(ppr, 'tabs', null, PPR_ORDER);
        const tabs = kid(ppr, 'tabs'); tabs.appendChild(mk(sdoc, 'tab', { val: 'right', leader: 'dot', pos: 9061 }));
        setProp(ppr, 'spacing', { before: 0, after: 0, line: o.LINE, lineRule: 'auto' }, PPR_ORDER);
        setProp(ppr, 'ind', { left: 0, firstLine: 0 }, PPR_ORDER);
        setProp(ppr, 'jc', { val: 'left' }, PPR_ORDER);
        if (H[lv].b) setProp(rpr, 'b', null, RPR_ORDER);
        if (H[lv].i) setProp(rpr, 'i', null, RPR_ORDER);
        if (H[lv].caps) setProp(rpr, 'caps', null, RPR_ORDER);
      });
    }
    return ids;
  }

  // ---------- classificação ----------
  function headingLevelFromStyle(p, rep) {
    const ps = attr(kid(kid(p, 'pPr'), 'pStyle'), 'val');
    let ol = attr(kid(kid(p, 'pPr'), 'outlineLvl'), 'val');
    if (ol !== null && ol !== '' && +ol < 9) return +ol + 1;
    let id = ps, guard = 0;
    while (id && rep.styleIndex[id] && guard++ < 6) {
      const s = rep.styleIndex[id];
      let m = s.name.match(/^(heading|t[íi]tulo)\s*(\d)$/);
      if (m) return Math.min(5, +m[2]);
      if (s.outline !== null && s.outline !== '' && +s.outline < 9) return Math.min(5, +s.outline + 1);
      id = s.basedOn;
    }
    return 0;
  }
  function isBoldPara(p) {
    const rs = runs(p).filter(r => kids(r, 't').some(t => t.textContent.trim()));
    if (!rs.length) return false;
    return rs.every(r => { const b = kid(kid(r, 'rPr'), 'b'); return b && attr(b, 'val') !== '0' && attr(b, 'val') !== 'false'; });
  }
  function isUpper(s) { return s === s.toUpperCase() && /\p{L}/u.test(s); }

  function classifyHeading(p, text, rep) {
    const t = text.trim();
    if (!t || t.length > 160) return null;
    const lvStyle = headingLevelFromStyle(p, rep);
    const bare = t.replace(/[.:]\s*$/, '').trim();
    if (PRE_TITLES.test(bare) && (isUpper(bare) || lvStyle || isBoldPara(p))) return { kind: 'pre', level: 1 };
    if (POST_TITLES.test(bare) && (isUpper(bare.split(/\s+[–—-]\s+/)[0]) || lvStyle || isBoldPara(p))) return { kind: 'post', level: 1, refs: REF_TITLE.test(bare) };
    const t0 = t.length < 100 ? t.replace(/\s*[.:]$/, '') : t;
    const m = t0.match(/^(\d{1,2}(?:\.\d{1,2}){0,4})(?:\.\s*|\s*[-–—)]\s*|\s+)(\p{L}.*)$/u);
    if (m && !/[.;,]$/.test(t0) && m[2].length < 140 && /^\p{Lu}/u.test(m[2])) {
      const lv = m[1].split('.').length;
      if (lvStyle || isBoldPara(p) || isUpper(m[2]) || t.length < 90) return { kind: 'num', level: lv, number: m[1], styled: !!lvStyle };
    }
    if (lvStyle) return { kind: 'style', level: lvStyle };
    if (/^(\d+\s*[.\-–—)]?\s*)?INTRODU[ÇC][ÃA]O$/i.test(bare)) return { kind: 'style', level: 1 };
    return null;
  }

  // ---------- formatação de parágrafo ----------
  function cleanRuns(p, o, size) {
    for (const r of runs(p)) {
      const rpr = kid(r, 'rPr'); if (!rpr && !size) continue;
      const rp = rpr || ensure(r, 'rPr');
      const rf = kid(rp, 'rFonts');
      if (rf && !KEEP_FONTS.test(attr(rf, 'ascii') || '') && !kid(r, 'sym')) delProp(rp, 'rFonts');
      delProp(rp, 'color'); delProp(rp, 'highlight'); delProp(rp, 'shd'); delProp(rp, 'kern'); delProp(rp, 'spacing'); delProp(rp, 'w');
      const isRefMark = kid(rp, 'vertAlign') || /FootnoteReference|EndnoteReference/i.test(attr(kid(rp, 'rStyle'), 'val') || '');
      if (size && !isRefMark) { setProp(rp, 'sz', { val: size }, RPR_ORDER); setProp(rp, 'szCs', { val: size }, RPR_ORDER); }
      else if (!isRefMark) { delProp(rp, 'sz'); delProp(rp, 'szCs'); }
      // hiperlinks: ABNT não pede azul/sublinhado nas referências
      if (ancestor(r, 'hyperlink')) { const rs = kid(rp, 'rStyle'); if (rs && /hyperlink|link/i.test(attr(rs, 'val'))) { rp.removeChild(rs); delProp(rp, 'u'); } }
    }
  }
  function stripRunEmphasisForHeading(p) {
    for (const r of runs(p)) {
      const rp = kid(r, 'rPr'); if (!rp) continue;
      ['b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'u', 'sz', 'szCs', 'color', 'rFonts', 'highlight'].forEach(n => delProp(rp, n));
    }
  }
  function setPara(p, cfg) {
    const pp = pPr(p);
    if (cfg.style !== undefined) { if (cfg.style) setProp(pp, 'pStyle', { val: cfg.style }, PPR_ORDER); else delProp(pp, 'pStyle'); }
    if (cfg.keepNext) setProp(pp, 'keepNext', null, PPR_ORDER); else if (cfg.keepNext === false) delProp(pp, 'keepNext');
    if (cfg.pageBreak) setProp(pp, 'pageBreakBefore', null, PPR_ORDER); else if (cfg.pageBreak === false) delProp(pp, 'pageBreakBefore');
    if (cfg.spacing) setProp(pp, 'spacing', Object.assign({ lineRule: 'auto' }, cfg.spacing), PPR_ORDER);
    if (cfg.ind) setProp(pp, 'ind', cfg.ind, PPR_ORDER);
    if (cfg.ind === null) delProp(pp, 'ind');
    if (cfg.jc) setProp(pp, 'jc', { val: cfg.jc }, PPR_ORDER);
    if (cfg.outline === null) delProp(pp, 'outlineLvl');
    delProp(pp, 'shd'); delProp(pp, 'pBdr'); delProp(pp, 'contextualSpacing');
    const mark = kid(pp, 'rPr');
    if (mark) { delProp(mark, 'rFonts'); delProp(mark, 'color'); if (cfg.size) { setProp(mark, 'sz', { val: cfg.size }, RPR_ORDER); setProp(mark, 'szCs', { val: cfg.size }, RPR_ORDER); } else { delProp(mark, 'sz'); delProp(mark, 'szCs'); } }
  }
  function isPageBreakOnly(p) {
    if (pText(p).trim() || hasDrawing(p)) return false;
    return all(p, 'br').some(b => attr(b, 'type') === 'page') || !!kid(kid(p, 'pPr'), 'pageBreakBefore');
  }
  function isEmpty(p) {
    if (pText(p).trim() || hasDrawing(p)) return false;
    if (kid(kid(p, 'pPr'), 'sectPr')) return false;
    if (all(p, 'fldChar').length || all(p, 'instrText').length || all(p, 'footnoteReference').length || all(p, 'object').length) return false;
    if (all(p, 'br').some(b => attr(b, 'type') === 'page')) return false;
    return true;
  }
  function firstTextEdit(p, re, rep) {
    const ts = textNodes(p);
    const t = ts.find(x => x.textContent.length);
    if (!t) return false;
    const before = t.textContent; const after = before.replace(re, rep);
    if (after !== before) { t.textContent = after; setPreserve(t); return true; }
    return false;
  }
  function trimTrailingDot(p) {
    const ts = textNodes(p).filter(t => t.textContent.trim());
    const t = ts[ts.length - 1]; if (!t) return false;
    const s = t.textContent; const n = s.replace(/\s*[.:]\s*$/, '');
    if (n !== s && !/\b(et al|etc|p|v|n)$/i.test(n)) { t.textContent = n; return true; }
    return false;
  }
  function replaceAllText(p, text) {
    const ts = textNodes(p); if (!ts.length) return;
    ts[0].textContent = text; setPreserve(ts[0]);
    for (let i = 1; i < ts.length; i++) ts[i].textContent = '';
  }

  // ---------- referências (NBR 6023:2025) ----------
  function parseAuthors(text) {
    // devolve [{s,e}] intervalos de sobrenomes a pôr em MAIÚSCULAS, e o fim do bloco de autoria
    const spans = []; let i = 0; const L = text.length;
    for (let guard = 0; guard < 25 && i < L; guard++) {
      while (text[i] === ' ') i++;
      if (/^et al\.?/i.test(text.slice(i))) break;
      const comma = text.indexOf(',', i);
      if (comma < 0 || comma - i > 60) break;
      const surname = text.slice(i, comma);
      if (!/^\p{Lu}[\p{L}'’\- ]*$/u.test(surname) || surname.trim().split(/\s+/).length > 4) break;
      spans.push({ s: i, e: comma });
      // nomes
      let j = comma + 1, end = -1, next = -1;
      while (j < L) {
        while (text[j] === ' ') j++;
        let k = j; while (k < L && !/[ ;]/.test(text[k])) k++;
        let tok = text.slice(j, k);
        if (text[k] === ';') { next = k + 1; break; }
        if (!tok) { end = j; break; }
        if (/\.$/.test(tok)) {
          const core = tok.replace(/\.$/, '');
          const isInit = /^\p{Lu}(\.?-?\p{Lu})?$/u.test(core) || /^\p{Lu}\.\p{Lu}$/u.test(core);
          if (!isInit) { end = k; break; }
          // inicial: continua se o próximo também for inicial ou partícula
          let m = k; while (text[m] === ' ') m++;
          let q = m; while (q < L && !/[ ;]/.test(text[q])) q++;
          const nx = text.slice(m, q);
          if (text[q] === ';' && /^\p{Lu}\.?$/u.test(nx.replace(/\.$/, ''))) { j = m; continue; }
          if (/^(\p{Lu}\.)+(-\p{Lu}\.)?;?$/u.test(nx) || /^(de|da|do|dos|das|e)$/i.test(nx)) { j = m; continue; }
          end = k; break;
        }
        j = k; if (j - comma > 80) { end = -2; break; }
      }
      if (end === -2) { spans.pop(); break; }
      if (next > 0) { i = next; continue; }
      break;
    }
    return spans;
  }
  function titleCase(w) { return w.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, x => x.toLowerCase()); }

  function fixReference(p, rep) {
    let changed = [];
    const text = pText(p);
    const spans = parseAuthors(text);
    for (const sp of spans) {
      const seg = text.slice(sp.s, sp.e);
      if (seg !== seg.toUpperCase()) { mapChars(p, sp.s, sp.e, s => s.toUpperCase()); changed.push('autoria em maiúsculas'); }
      rep.surnames.add(deaccent(seg.trim().toUpperCase()));
      seg.trim().split(/\s+/).forEach(w => w.length > 2 && rep.surnames.add(deaccent(w.toUpperCase())));
    }
    if (!spans.length) {
      const m = text.match(/^([^.]{2,90})\./);
      if (m && m[1] === m[1].toUpperCase() && /\p{L}{2}/u.test(m[1])) { /* entidade já em maiúsculas */ }
      else rep.refNoAuthor.push(text.slice(0, 70));
    }
    for (const t of textNodes(p)) {
      let s = t.textContent, o = s;
      s = s.replace(/<\s*((?:https?:\/\/|www\.)[^>\s]+)\s*>/gi, '$1');
      s = s.replace(/Dispon[ií]vel\s+(em|no\s+site|na\s+internet|on-?line)\s*:?\s*/gi, 'Disponível em: ');
      s = s.replace(/Acess(?:o|ado)\s+(?:em|no\s+dia)\s*:?\s*/gi, 'Acesso em: ');
      s = s.replace(/(Acesso em: )(\d{1,2})(?:º)?\s*(?:de\s+)?(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s+)?(\d{4})/gi,
        (m, a, d, mes, y) => a + (+d) + ' ' + MESES[mes.toLowerCase()] + ' ' + y);
      s = s.replace(/(Acesso em: )(\d{1,2})\/(\d{1,2})\/(\d{4})/g, (m, a, d, mo, y) => a + (+d) + ' ' + Object.values(MESES).filter((v, i, arr) => arr.indexOf(v) === i)[+mo - 1] + ' ' + y);
      s = s.replace(/\bdoi\s*:\s*/gi, 'DOI: ').replace(/DOI: (?:https?:\/\/)?(?:dx\.)?doi\.org\//gi, 'DOI: https://doi.org/');
      s = s.replace(/\s{2,}/g, ' ');
      if (s !== o) { t.textContent = s; setPreserve(t); changed.push('elementos complementares'); }
    }
    const hasEmph = runs(p).some(r => { const rp = kid(r, 'rPr'); return rp && (kid(rp, 'b') || kid(rp, 'i')) && kids(r, 't').some(t => t.textContent.trim()); });
    if (!hasEmph && spans.length) rep.refNoEmph.push(text.slice(0, 70));
    return changed.length > 0;
  }

  // ---------- citações (NBR 10520:2023) ----------
  function fixCitations(p, rep) {
    let n = 0;
    for (const t of textNodes(p)) {
      let s = t.textContent, o = s;
      // (SILVA, 2020, p. 3) -> (Silva, 2020, p. 3) ; também 'SILVA; SOUZA, 2019'
      s = s.replace(/\(([^()]{2,200}?\d{4}[a-z]?[^()]*)\)/g, (m, inner) => '(' + inner.replace(/\b(\p{Lu}[\p{Lu}'’\-]+(?:\s+\p{Lu}[\p{Lu}'’\-]+){0,3})\b/gu, (w) => { if (rep.surnames.has(deaccent(w)) || rep.surnames.has(deaccent(w.split(/\s+/)[0]))) { rep.diag.citUpper++; return titleCase(w); } return w; }) + ')');
      // narrativa: SILVA (2020) / SILVA et al. (2020)
      s = s.replace(/\b(\p{Lu}[\p{Lu}'’\-]{2,})(\s+et\s+al\.?)?(\s*\(\d{4})/gu, (m, w, ea, rest) => (rep.surnames.has(deaccent(w)) ? (rep.diag.citUpper++, titleCase(w)) : w) + (ea || '') + rest);
      s = s.replace(/\bet\s+al\b\.?/g, 'et al.').replace(/\bet al\.\./g, 'et al.');
      if (s !== o) { t.textContent = s; setPreserve(t); n++; }
    }
    // itálico em et al. e apud
    for (const t of textNodes(p)) {
      const r = t.parentNode; if (r.localName !== 'r') continue;
      const rp = kid(r, 'rPr'); if (rp && kid(rp, 'i')) continue;
      const m = t.textContent.match(/\bet al\.|\bapud\b/);
      if (!m) continue;
      const mr = splitRun(r, t, m.index, m.index + m[0].length);
      if (mr) { setProp(ensure(mr, 'rPr', null), 'i', null, RPR_ORDER); n++; rep.diag.citItalic++; return n + fixCitations(p, rep); }
    }
    return n;
  }

  // ---------- documento principal ----------
  function bodyParas(body) { return all(body, 'p'); }

  function makeHeaderXml(o) {
    const tag = /^bottom/.test(o.pageNumPos) ? 'ftr' : 'hdr', jc = /center/.test(o.pageNumPos) ? 'center' : 'right';
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:hdr xmlns:w="' + W + '" xmlns:r="' + R + '"><w:p><w:pPr><w:jc w:val="' + jc + '"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr>' +
      '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
      '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>1</w:t></w:r>' +
      '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>').replace(/w:hdr/g, 'w:' + tag);
  }

  function fixSect(sp, o) {
    kids(sp, 'headerReference').forEach(n => sp.removeChild(n));
    kids(sp, 'footerReference').forEach(n => sp.removeChild(n));
    delProp(sp, 'titlePg');
    const old = kid(sp, 'pgSz');
    const land = old && attr(old, 'orient') === 'landscape';
    setProp(sp, 'pgSz', land ? { w: 16838, h: 11906, orient: 'landscape' } : { w: 11906, h: 16838 }, SECT_ORDER);
    // anverso: esquerda/superior 3 cm; direita/inferior 2 cm
    setProp(sp, 'pgMar', { top: o.MAR.top, right: o.MAR.right, bottom: o.MAR.bottom, left: o.MAR.left, header: 709, footer: 709, gutter: 0 }, SECT_ORDER);
    delProp(sp, 'pgNumType');
    const cols = kid(sp, 'cols'); if (cols && +attr(cols, 'num') > 1) setProp(sp, 'cols', { space: 708 }, SECT_ORDER);
  }

  // ---------- diagnóstico (estado original, antes de formatar) ----------
  function snapshotStyles(sdoc) {
    const S = sdoc.documentElement, out = { font: '', sz: 0, line: 0, rule: '', after: 0, jc: '', first: 0 };
    const dd = kid(S, 'docDefaults');
    const take = (rpr, ppr) => {
      const rf = kid(rpr, 'rFonts');
      if (rf) { const f = attr(rf, 'ascii') || (attr(rf, 'asciiTheme') ? '(tema)' : ''); if (f) out.font = f; }
      const sz = kid(rpr, 'sz'); if (sz) out.sz = +attr(sz, 'val');
      const sp = kid(ppr, 'spacing');
      if (sp) { if (attr(sp, 'line')) { out.line = +attr(sp, 'line'); out.rule = attr(sp, 'lineRule') || 'auto'; } if (attr(sp, 'after')) out.after = +attr(sp, 'after'); }
      const jc = kid(ppr, 'jc'); if (jc) out.jc = attr(jc, 'val');
      const ind = kid(ppr, 'ind'); if (ind && attr(ind, 'firstLine')) out.first = +attr(ind, 'firstLine');
    };
    if (dd) take(kid(kid(dd, 'rPrDefault'), 'rPr'), kid(kid(dd, 'pPrDefault'), 'pPr'));
    const normal = kids(S, 'style').find(st => attr(st, 'type') === 'paragraph' && (attr(st, 'default') === '1' || attr(st, 'styleId') === 'Normal'));
    if (normal) take(kid(normal, 'rPr'), kid(normal, 'pPr'));
    if (!out.font || out.font === '(tema)') out.font = out.font || '(tema)';
    if (!out.sz) out.sz = 20;
    if (!out.line) { out.line = 240; out.rule = 'auto'; }
    if (!out.jc) out.jc = 'left';
    return out;
  }
  const OK_FONT = /^(times new roman|arial)$/i;
  function paraDeviations(p, base, o) {
    const pp = kid(p, 'pPr');
    const sp = kid(pp, 'spacing'), jc = kid(pp, 'jc'), ind = kid(pp, 'ind');
    const line = sp && attr(sp, 'line') ? +attr(sp, 'line') : base.line;
    const rule = sp && attr(sp, 'line') ? (attr(sp, 'lineRule') || 'auto') : base.rule;
    const after = sp && attr(sp, 'after') ? +attr(sp, 'after') : base.after;
    const before = sp && attr(sp, 'before') ? +attr(sp, 'before') : 0;
    const align = jc ? attr(jc, 'val') : base.jc;
    const first = ind && attr(ind, 'firstLine') ? +attr(ind, 'firstLine') : (ind && attr(ind, 'hanging') ? -attr(ind, 'hanging') : base.first);
    const r = runs(p).find(r => kids(r, 't').some(t => t.textContent.trim()));
    const rp = r ? kid(r, 'rPr') : null;
    const rf = kid(rp, 'rFonts');
    const font = rf ? (attr(rf, 'ascii') || (attr(rf, 'asciiTheme') ? '(tema)' : base.font)) : base.font;
    const sz = kid(rp, 'sz') ? +attr(kid(rp, 'sz'), 'val') : base.sz;
    return {
      font: !OK_FONT.test(font) || sz !== o.SZ,
      spacing: rule !== 'auto' || Math.abs(line - o.LINE) > 12 || after > 40 || before > 40,
      align: align !== 'both' && align !== 'distribute',
      indent: Math.abs(first - o.IND) > 40
    };
  }

  function derive(o) {
    const n = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    o.SZ = Math.round(n(o.fontSize, 12) * 2); o.SM = Math.round(n(o.smallSize, 10) * 2);
    o.LINE = Math.round(240 * n(o.lineSpacing, 1.5));
    const m = o.margins || {};
    o.MAR = { top: Math.round(n(m.top, 3) * CM), left: Math.round(n(m.left, 3) * CM), bottom: Math.round(n(m.bottom, 2) * CM), right: Math.round(n(m.right, 2) * CM) };
    o.IND = o.indent === false ? 0 : Math.round(n(o.indentCm, 1.25) * CM);
    o.QIND = o.longQuoteIndent === false ? 0 : Math.round(n(o.quoteIndentCm, 4) * CM);
    o.REFLINE = Math.round(240 * n(o.refsLine, 1)); o.REFAFTER = o.refsGap === false ? 0 : 240;
    const H = Array.isArray(o.headings) ? o.headings : [];
    const def = [null, { b: 1, caps: 1 }, { caps: 1 }, { b: 1 }, {}, { i: 1 }];
    o.HEAD = def.map((d, i) => i ? Object.assign({}, d, H[i] || {}) : null);
    return o;
  }
  async function formatDocx(zip, opts, env) {
    const o = Object.assign({ font: 'Times New Roman', indent: true, longQuoteIndent: true, refsSort: true, refsFix: true, citations: true, removeBlank: true, pageBreaks: true, figAlign: 'center', fixSource: true, pageNumbers: true, hasCover: true,
      fontSize: 12, smallSize: 10, lineSpacing: 1.5, margins: { top: 3, left: 3, bottom: 2, right: 2 }, indentCm: 1.25, quoteIndentCm: 4, pageNumPos: 'top-right',
      headings: [null, { b: 1, caps: 1 }, { caps: 1 }, { b: 1 }, {}, { i: 1 }], refsLine: 1, refsGap: true, refsAlign: 'left', sourceText: 'Fonte: elaborado pelo próprio autor.' }, opts || {});
    derive(o);
    const DP = env.DOMParser, XS = env.XMLSerializer;
    const parse = s => new DP().parseFromString(s, 'application/xml');
    const ser = d => new XS().serializeToString(d);
    const rep = { changes: {}, warnings: [], surnames: new Set(), refNoAuthor: [], refNoEmph: [], words: 0, stats: {},
      diag: { pageSize: false, margins: false, marginsTxt: '', paraTotal: 0, paraWrong: 0, paraFont: 0, paraSpacing: 0, paraAlign: 0, paraIndent: 0,
        headings: 0, headNoStyle: 0, citUpper: 0, citItalic: 0, quotes: 0, figs: 0, refs: 0, refsOrder: false, refNoEmph: 0, pageNum: 'ok', blank: 0, capitulo: 0, defaultFont: '' } };
    const inc = (k, n = 1) => { rep.changes[k] = (rep.changes[k] || 0) + n; };

    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('Arquivo .docx inválido (word/document.xml não encontrado).');
    const doc = parse(await docFile.async('string'));
    let stylesXml = zip.file('word/styles.xml') ? await zip.file('word/styles.xml').async('string') :
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="' + W + '"/>';
    const sdoc = parse(stylesXml);
    const base = snapshotStyles(sdoc);
    rep.diag.defaultFont = base.font + ' ' + (base.sz / 2).toString().replace('.', ',');
    // margens e papel originais
    {
      const bs = kid(kid(doc.documentElement, 'body'), 'sectPr');
      const sz = kid(bs, 'pgSz'), mg = kid(bs, 'pgMar');
      if (sz) { const w = +attr(sz, 'w'), h = +attr(sz, 'h'); const a = Math.min(w, h), b = Math.max(w, h); if (Math.abs(a - 11906) > 60 || Math.abs(b - 16838) > 60) rep.diag.pageSize = true; }
      if (mg) {
        const v = ['top', 'left', 'bottom', 'right'].map(k => +attr(mg, k));
        const want = [o.MAR.top, o.MAR.left, o.MAR.bottom, o.MAR.right];
        if (v.some((x, i) => Math.abs(x - want[i]) > 30)) { rep.diag.margins = true; rep.diag.marginsTxt = v.map(x => (x / CM).toFixed(1).replace('.0', '').replace('.', ',')).join(' / ') + ' cm'; }
      } else rep.diag.margins = true;
      // numeração original
      const files = Object.keys(zip.files);
      const hasPage = async re => { for (const f of files.filter(f => re.test(f))) { if (/PAGE/.test(await zip.file(f).async('string'))) return true; } return false; };
      if (await hasPage(/^word\/footer[^/]*\.xml$/)) rep.diag.pageNum = 'rodape';
      else if (!(await hasPage(/^word\/header[^/]*\.xml$/))) rep.diag.pageNum = 'nenhuma';
    }
    const ids = fixStyles(sdoc, o, rep);
    inc('Fonte ' + o.font + ' 12 e entrelinha 1,5 como padrão');

    const body = kid(doc.documentElement, 'body');
    const paras = bodyParas(body);
    rep.words = paras.reduce((a, p) => a + (pText(p).match(/\S+/g) || []).length, 0);

    // 1ª passada: títulos e regiões
    const info = new Map();
    let firstText = -1;
    const isToc = p => { const s = attr(kid(kid(p, 'pPr'), 'pStyle'), 'val') || ''; const sdt = ancestor(p, 'sdt'); return /^TOC|^Sum[aá]rio\d|^toc/i.test(s) || (sdt && all(sdt, 'docPartGallery').some(g => /Table of Contents/i.test(attr(g, 'val')))); };
    paras.forEach((p, idx) => {
      if (ancestor(p, 'tbl') || ancestor(p, 'txbxContent') || isToc(p)) return;
      const t = pText(p);
      const h = classifyHeading(p, t, rep);
      if (h) info.set(p, h);
      if (firstText < 0 && h && h.level === 1 && (h.kind === 'num' || /^INTRODU/i.test(t.replace(/^[\d.\s]+/, '')))) firstText = idx;
    });
    // TOC: parágrafos dentro de sdt de sumário ou com estilo TOC
    const hasPre = firstText > 0;
    if (hasPre && o.hasCover) {
      // só desconta a capa se houver conteúdo antes do primeiro título pré-textual
      const firstPreTitle = paras.findIndex(p => info.get(p) && info.get(p).kind === 'pre');
      const limit = firstPreTitle >= 0 ? Math.min(firstPreTitle, firstText) : firstText;
      if (!paras.slice(0, limit).some(p => pText(p).trim() && !isToc(p))) o.hasCover = false;
    }

    let region = hasPre ? 'pre' : 'text';
    let preTitle = '', refParas = [];
    let sawTocField = paras.some(p => all(p, 'instrText').some(i => /\bTOC\b/.test(i.textContent)));

    for (let idx = 0; idx < paras.length; idx++) {
      const p = paras[idx];
      if (!p.parentNode) continue;
      const inTbl = ancestor(p, 'tbl'), inBox = ancestor(p, 'txbxContent');
      const t = pText(p), tt = t.trim();
      if (idx === firstText) region = 'text';
      const h = info.get(p);

      if (inBox) { cleanRuns(p, o); continue; }
      if (inTbl) {
        cleanRuns(p, o, o.SM);
        setPara(p, { spacing: { before: 0, after: 0, line: 240 }, ind: { left: 0, right: 0, firstLine: 0 } });
        inc('Texto de tabelas e quadros em tamanho menor, espaço simples');
        continue;
      }
      if (isToc(p)) { cleanRuns(p, o); inc('Sumário ajustado'); continue; }

      if (h) {
        if (h.kind === 'pre') {
          preTitle = tt.toUpperCase();
          stripRunEmphasisForHeading(p);
          setPara(p, { style: ids.pre, pageBreak: o.pageBreaks, ind: null, jc: 'center', outline: null });
          trimTrailingDot(p);
          inc('Títulos sem indicativo numérico centralizados (NBR 6024)');
          continue;
        }
        if (h.kind === 'post') {
          region = h.refs ? 'refs' : 'post';
          stripRunEmphasisForHeading(p);
          setPara(p, { style: ids.h[1], pageBreak: o.pageBreaks, ind: null, jc: 'center' });
          trimTrailingDot(p);
          firstTextEdit(p, /\s*[-–—]\s+/, ' – ');
          inc('Títulos sem indicativo numérico centralizados (NBR 6024)');
          continue;
        }
        if (region === 'pre' && h.kind !== 'num') { cleanRuns(p, o); continue; }
        region = region === 'refs' || region === 'post' ? region : 'text';
        if (region !== 'text') { /* títulos dentro de apêndices */ }
        let headBad = h.kind === 'num' && !h.styled;
        if (headBad) rep.diag.headNoStyle++;
        stripRunEmphasisForHeading(p);
        const lv = Math.min(5, h.level);
        setPara(p, { style: ids.h[lv], pageBreak: lv === 1 && o.pageBreaks && idx !== firstText ? true : (lv === 1 ? undefined : false), ind: null, jc: 'left', spacing: null });
        delProp(pPr(p), 'spacing'); delProp(pPr(p), 'jc');
        if (firstTextEdit(p, /^(\d{1,2}(?:\.\d{1,2}){0,4})(?:\s*[.\-–—)]+(?!\d)\s*|(?=\p{L}))/u, '$1 ')) { inc('Indicativo numérico separado do título só por espaço (NBR 6024)'); headBad = true; }
        if (trimTrailingDot(p)) { inc('Ponto final removido de títulos'); headBad = true; }
        if (headBad) rep.diag.headings++;
        inc('Títulos de seção ' + lv + 'ª ordem padronizados (NBR 6024)');
        if (/^cap[íi]tulo\b/i.test(tt)) rep.warnings.push('Título “' + tt.slice(0, 50) + '”: a NBR 14724:2024 usa “seções”, não “capítulos”. Revise o texto.');
        continue;
      }

      // parágrafos comuns
      if (region === 'pre') {
        cleanRuns(p, o, o.SZ);
        if (/^(RESUMO|ABSTRACT|RESUMEN)/.test(preTitle) && tt) {
          setPara(p, { jc: 'both', ind: { left: 0, firstLine: 0 }, spacing: { before: 0, after: 0, line: o.LINE } });
          if (/^(palavras?-chave|keywords?|palabras clave)\s*:/i.test(tt)) { setPara(p, { spacing: { before: o.LINE, after: 0, line: o.LINE } }); inc('Resumo em parágrafo único, palavras-chave destacadas (NBR 6028)'); }
        } else if (/apresentad[oa]\s+(ao|à|a)|requisito\s+parcial|como\s+requisito|para\s+obten[çc][ãa]o\s+do\s+t[íi]tulo/i.test(tt)) {
          setPara(p, { jc: 'both', ind: { left: 8 * CM, firstLine: 0 }, spacing: { before: 0, after: 0, line: 240 } });
          inc('Natureza do trabalho recuada do meio da mancha, espaço simples');
        }
        continue;
      }

      if (region === 'refs') {
        if (!tt && !hasDrawing(p)) { if (o.removeBlank && isEmpty(p)) { p.parentNode.removeChild(p); inc('Linhas em branco extras removidas'); rep.diag.blank++; } continue; }
        cleanRuns(p, o, o.SZ);
        setPara(p, { style: ids.normal, jc: o.refsAlign === 'both' ? 'both' : 'left', ind: { left: 0, right: 0, firstLine: 0, hanging: 0 }, spacing: { before: 0, after: o.REFAFTER, line: o.REFLINE } });
        delProp(pPr(p), 'numPr');
        if (o.refsFix && fixReference(p, rep)) { inc('Referências padronizadas (NBR 6023:2025)'); rep.diag.refs++; }
        refParas.push(p);
        inc('Referências alinhadas à esquerda, espaço simples, separadas por linha em branco');
        continue;
      }

      // região textual e pós-textual
      if (o.removeBlank && !tt && isEmpty(p)) {
        p.parentNode.removeChild(p); inc('Linhas em branco extras removidas'); rep.diag.blank++; continue;
      }
      if (isPageBreakOnly(p)) {
        const next = paras.slice(idx + 1).find(x => x.parentNode && !ancestor(x, 'tbl') && (pText(x).trim() || hasDrawing(x)));
        if (o.pageBreaks && next && info.get(next) && info.get(next).level === 1) { p.parentNode.removeChild(p); inc('Quebras de página manuais substituídas por início de seção em nova página'); }
        continue;
      }
      if (hasDrawing(p) && !tt) {
        cleanRuns(p, o);
        setPara(p, { jc: o.figAlign, ind: { left: 0, firstLine: 0 }, spacing: { before: 0, after: 0, line: 240 }, keepNext: true });
        inc('Ilustrações alinhadas de forma consistente (NBR 14724:2024)');
        continue;
      }
      if (CAPTION.test(tt)) {
        let pv = p.previousSibling; while (pv && pv.nodeType !== 1) pv = pv.previousSibling;
        if (pv && (pv.localName === 'tbl' || (pv.localName === 'p' && hasDrawing(pv) && !pText(pv).trim()))) {
          let pv2 = pv.previousSibling; while (pv2 && pv2.nodeType !== 1) pv2 = pv2.previousSibling;
          if (!(pv2 && pv2.localName === 'p' && CAPTION.test(pText(pv2).trim()))) { pv.parentNode.insertBefore(p, pv); inc('Título de tabela/ilustração movido para cima do elemento (NBR 14724:2024)'); p._figBad = true; }
        }
        cleanRuns(p, o, o.SM);
        setPara(p, { jc: o.figAlign, ind: { left: 0, firstLine: 0 }, spacing: { before: 240, after: 0, line: 240 }, keepNext: true });
        if (firstTextEdit(p, /^((?:\S+)\s+\d+)\s*[-–—:.]\s*/, '$1 – ')) { inc('Designação de ilustrações e tabelas com travessão'); p._figBad = true; }
        if (p._figBad) rep.diag.figs++;
        inc('Títulos de ilustrações e tabelas na parte superior, tamanho menor');
        continue;
      }
      if (SOURCE.test(tt)) {
        cleanRuns(p, o, o.SM);
        if (o.fixSource && o.sourceText && SOURCE_SELF.test(tt) && tt.replace(/\.$/, '') !== o.sourceText.trim().replace(/\.$/, '')) { rep.diag.figs++; replaceAllText(p, o.sourceText.trim()); inc('“Fonte: o autor” atualizado para “elaborado pelo próprio autor” (NBR 14724:2024)'); }
        setPara(p, { jc: o.figAlign, ind: { left: 0, firstLine: 0 }, spacing: { before: 0, after: 240, line: 240 } });
        inc('Fontes e notas de ilustrações em tamanho menor, espaço simples');
        continue;
      }
      const curInd = kid(pPr(p), 'ind');
      const leftInd = curInd ? +(attr(curInd, 'left') || attr(curInd, 'start') || 0) : 0;
      const sName = (rep.styleIndex[attr(kid(pPr(p), 'pStyle'), 'val')] || {}).name || '';
      const isList = !!kid(pPr(p), 'numPr') || /^([•●▪◦\-–]\s|[a-z]\)\s|\d+\)\s)/.test(tt) || /list/i.test(sName);
      const quoteLike = /quote|cita[çc][ãa]o|citacao/i.test(sName) || (leftInd >= 2 * CM && !isList && !kid(pPr(p), 'numPr')) ||
        (/^[“"«]/.test(tt) && /[”"»]\s*\(?[^()]*\d{4}[^()]*\)?\.?$/.test(tt) && tt.length > 300);
      if (quoteLike && o.longQuoteIndent !== 'off') {
        {
          const sp0 = kid(pPr(p), 'spacing'); const line0 = sp0 && attr(sp0, 'line') ? +attr(sp0, 'line') : base.line;
          const r0 = runs(p).find(r => kids(r, 't').some(t => t.textContent.trim())); const sz0 = kid(kid(r0, 'rPr'), 'sz') ? +attr(kid(kid(r0, 'rPr'), 'sz'), 'val') : base.sz;
          if (Math.abs(leftInd - o.QIND) > 60 || line0 > 260 || sz0 > o.SM || /^[“"«]/.test(tt)) rep.diag.quotes++;
        }
        cleanRuns(p, o, o.SM);
        if (/^[“"«]/.test(tt)) { mapChars(p, t.indexOf(tt[0]), t.indexOf(tt[0]) + 1, () => ''); const t2 = pText(p); const m = t2.match(/[”"»](?=\s*(\(|$|\.))/); if (m) mapChars(p, m.index, m.index + 1, () => ''); inc('Aspas removidas de citações longas'); }
        setPara(p, { style: ids.normal, jc: 'both', ind: { left: o.QIND, right: 0, firstLine: 0 }, spacing: { before: o.LINE, after: o.LINE, line: 240 } });
        p._needsCite = true;
        inc('Citações diretas longas: recuo 4 cm, fonte menor, espaço simples (NBR 10520:2023)');
        continue;
      }
      {
        const dv = paraDeviations(p, base, o);
        if (isList) dv.indent = false;
        rep.diag.paraTotal++;
        if (dv.font) rep.diag.paraFont++; if (dv.spacing) rep.diag.paraSpacing++; if (dv.align) rep.diag.paraAlign++; if (dv.indent) rep.diag.paraIndent++;
        if (dv.font || dv.spacing || dv.align || dv.indent) rep.diag.paraWrong++;
      }
      cleanRuns(p, o);
      if (isList) {
        setPara(p, { style: ids.normal, jc: 'both', spacing: { before: 0, after: 0, line: o.LINE } });
        inc('Alíneas justificadas, entrelinha 1,5');
      } else {
        setPara(p, { style: ids.normal, jc: 'both', ind: { left: 0, right: 0, firstLine: o.IND }, spacing: { before: 0, after: 0, line: o.LINE } });
        inc('Parágrafos justificados, recuo 1,25 cm, entrelinha 1,5');
      }
      p._needsCite = true;
    }

    // ordem alfabética das referências (sistema autor-data)
    if (o.refsSort && refParas.length > 1) {
      const numbered = refParas.filter(p => /^\s*(\[\d+\]|\d+[.)\s])/.test(pText(p))).length > refParas.length / 2;
      if (!numbered) {
        const key = p => deaccent(pText(p)).toUpperCase().replace(/[^A-Z0-9 ,.]/g, '');
        const sorted = refParas.slice().sort((a, b) => key(a).localeCompare(key(b), 'pt'));
        if (sorted.some((p, i) => p !== refParas[i])) {
          const anchor = refParas[0].previousSibling, parent = refParas[0].parentNode;
          const marker = doc.createComment('refs');
          parent.insertBefore(marker, refParas[0]);
          refParas.forEach(p => p.parentNode.removeChild(p));
          sorted.forEach(p => parent.insertBefore(p, marker));
          parent.removeChild(marker);
          inc('Referências em ordem alfabética (sistema autor-data)'); rep.diag.refsOrder = true;
        }
      }
    }
    // citações no texto (depois de conhecer os sobrenomes das referências)
    if (o.citations) {
      for (const p of paras) if (p._needsCite && p.parentNode) { const n = fixCitations(p, rep); if (n) inc('Chamadas de autoria em maiúsculas e minúsculas (NBR 10520:2023)', n); }
    }

    // seções e paginação
    const bodySect = kid(body, 'sectPr') || body.appendChild(mk(doc, 'sectPr'));
    const sects = all(body, 'sectPr');
    sects.forEach(sp => fixSect(sp, o));
    inc('Papel A4 e margens 3 cm (sup./esq.) e 2 cm (inf./dir.)');
    if (o.pageNumbers) {
      // parte do cabeçalho
      let n = 1; while (zip.file('word/headerABNT' + n + '.xml') || zip.file('word/footerABNT' + n + '.xml')) n++;
      const isFtr = /^bottom/.test(o.pageNumPos), kind = isFtr ? 'footer' : 'header';
      const hdrName = kind + 'ABNT' + n + '.xml';
      zip.file('word/' + hdrName, makeHeaderXml(o));
      const relsPath = 'word/_rels/document.xml.rels';
      const rdoc = parse(zip.file(relsPath) ? await zip.file(relsPath).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
      const RNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
      let rid = 'rIdABNT' + n;
      const rel = rdoc.createElementNS(RNS, 'Relationship');
      rel.setAttribute('Id', rid); rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + kind); rel.setAttribute('Target', hdrName);
      rdoc.documentElement.appendChild(rel);
      zip.file(relsPath, ser(rdoc));
      const ct = parse(await zip.file('[Content_Types].xml').async('string'));
      const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
      const ov = ct.createElementNS(CT, 'Override');
      ov.setAttribute('PartName', '/word/' + hdrName); ov.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.' + kind + '+xml');
      ct.documentElement.appendChild(ov);
      zip.file('[Content_Types].xml', ser(ct));

      const addHdr = sp => { const hr = mk(doc, kind + 'Reference', { type: 'default' }); hr.setAttributeNS(R, 'r:id', rid); sp.insertBefore(hr, sp.firstChild); };
      if (hasPre) {
        // quebra de seção antes da primeira seção textual: pré-textuais sem número visível
        const target = paras[firstText];
        let prev = target.previousSibling; while (prev && prev.nodeType !== 1) prev = prev.previousSibling;
        let holder;
        if (prev && prev.localName === 'p' && !kid(kid(prev, 'pPr'), 'sectPr')) {
          holder = prev;
          all(holder, 'br').filter(b => attr(b, 'type') === 'page').forEach(b => b.parentNode.removeChild(b));
          delProp(pPr(holder), 'pageBreakBefore');
        }
        else { holder = mk(doc, 'p'); target.parentNode.insertBefore(holder, target); }
        const sp = bodySect.cloneNode(true);
        kids(sp, 'headerReference').forEach(x => sp.removeChild(x));
        delProp(sp, 'type'); insertOrdered(sp, mk(doc, 'type', { val: 'nextPage' }), SECT_ORDER);
        // sempre retrato nas pré-textuais
        setProp(sp, 'pgSz', { w: 11906, h: 16838 }, SECT_ORDER);
        if (o.hasCover) insertOrdered(sp, mk(doc, 'pgNumType', { start: 0 }), SECT_ORDER);
        insertOrdered(pPr(holder), sp, PPR_ORDER);
        // seções anteriores (se houver várias): também sem cabeçalho, contagem começa na primeira
        const pre = all(body, 'sectPr').filter(s => s !== sp && s !== bodySect && (s.compareDocumentPosition ? (s.compareDocumentPosition(sp) & 4) : true));
        if (pre.length && o.hasCover) { delProp(sp, 'pgNumType'); insertOrdered(pre[0], mk(doc, 'pgNumType', { start: 0 }), SECT_ORDER); }
        delProp(pPr(target), 'pageBreakBefore');
        // primeira seção textual em diante: número no canto superior direito
        const after = all(body, 'sectPr'); const iSp = after.indexOf(sp);
        addHdr(after[iSp + 1]);
        inc('Numeração no canto superior direito a partir da primeira seção textual (capa não contada)');
      } else {
        addHdr(sects[0] === bodySect ? bodySect : sects[0]);
        inc('Numeração de páginas no canto superior direito');
      }
    }

    // notas de rodapé
    if (zip.file('word/footnotes.xml')) {
      const fdoc = parse(await zip.file('word/footnotes.xml').async('string'));
      for (const p of all(fdoc.documentElement, 'p')) {
        cleanRuns(p, o, o.SM);
        setPara(p, { jc: 'both', ind: { left: 0, firstLine: 0 }, spacing: { before: 0, after: 0, line: 240 } });
      }
      zip.file('word/footnotes.xml', ser(fdoc));
      inc('Notas de rodapé em tamanho menor, espaço simples');
    }
    // atualizar sumário/campos ao abrir
    if (zip.file('word/settings.xml')) {
      const st = parse(await zip.file('word/settings.xml').async('string'));
      const S = st.documentElement;
      if (!kid(S, 'updateFields')) { const u = mk(st, 'updateFields', { val: 'true' }); S.appendChild(u); }
      zip.file('word/settings.xml', ser(st));
    }

    zip.file('word/document.xml', ser(doc));
    zip.file('word/styles.xml', ser(sdoc));

    // avisos
    const capCount = paras.filter(p => p.parentNode && /\bcap[íi]tulos?\b/i.test(pText(p))).length;
    if (capCount) rep.warnings.push('A palavra “capítulo” aparece em ' + capCount + ' parágrafo(s). A NBR 14724:2024 divide o trabalho em “seções”; troque por “seção” onde se referir à estrutura do trabalho.');
    if (!refParas.length) rep.warnings.push('Não encontrei a seção REFERÊNCIAS. Confira se o título está escrito exatamente “REFERÊNCIAS”.');
    if (rep.refNoAuthor.length) rep.warnings.push(rep.refNoAuthor.length + ' referência(s) sem autoria pessoal reconhecida (entidade ou título como entrada). Confira manualmente: “' + rep.refNoAuthor.slice(0, 3).join('”, “') + '”.');
    if (rep.refNoEmph.length) rep.warnings.push(rep.refNoEmph.length + ' referência(s) sem destaque no título (negrito ou itálico, NBR 6023). Ex.: “' + rep.refNoEmph.slice(0, 2).join('”, “') + '”.');
    if (!hasPre) rep.warnings.push('Não identifiquei elementos pré-textuais (capa, folha de rosto). A numeração foi aplicada a todas as páginas.');
    if (sawTocField) rep.warnings.push('O sumário automático será atualizado quando você abrir o arquivo no Word (aceite “atualizar campos”).');
    rep.diag.capitulo = capCount; rep.diag.refNoEmph = rep.refNoEmph.length;
    rep.stats = { palavras: rep.words, paginasEstimadas: Math.max(1, Math.round(rep.words / 280)), referencias: refParas.length, titulos: info.size };
    delete rep.styleIndex; rep.surnames = rep.surnames.size;
    return rep;
  }

  // ---------- PDF → DOCX (texto) ----------
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function buildDocxFromBlocks(JSZip, blocks) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>');
    zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="' + W + '"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
    zip.file('word/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="' + W + '"/>');
    let body = '';
    for (const b of blocks) {
      let ppr = '';
      if (b.center) ppr += '<w:jc w:val="center"/>';
      if (b.pageBreak) ppr = '<w:pageBreakBefore/>' + ppr;
      if (b.indentLeft) ppr += '';
      const indent = b.indentLeft ? '<w:ind w:left="' + Math.round(b.indentLeft) + '"/>' : '';
      const pp = '<w:pPr>' + (b.pageBreak ? '<w:pageBreakBefore/>' : '') + indent + (b.center ? '<w:jc w:val="center"/>' : '') + '</w:pPr>';
      const rs = b.runs.map(r => '<w:r>' + ((r.b || r.i) ? '<w:rPr>' + (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '') + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(r.t) + '</w:t></w:r>').join('');
      body += '<w:p>' + pp + rs + '</w:p>';
    }
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="' + W + '" xmlns:r="' + R + '"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>');
    return zip;
  }

  // pages: [{width,height,items:[{str,x,y,h,bold,italic}]}]  (y medido do topo)
  function blocksFromPdfPages(pages) {
    // remove cabeçalhos/rodapés repetidos e números de página
    const edgeCount = {};
    const lineize = pg => {
      const items = pg.items.filter(i => i.str.trim() || i.str === ' ').sort((a, b) => a.y - b.y || a.x - b.x);
      const lines = [];
      for (const it of items) {
        let L = lines.find(l => Math.abs(l.y - it.y) < Math.max(2, it.h * 0.4));
        if (!L) { L = { y: it.y, h: it.h, items: [] }; lines.push(L); }
        L.items.push(it); L.h = Math.max(L.h, it.h);
      }
      lines.sort((a, b) => a.y - b.y);
      lines.forEach(l => { l.items.sort((a, b) => a.x - b.x); l.x = l.items[0].x; l.xEnd = Math.max(...l.items.map(i => i.x + (i.w || 0))); l.text = l.items.map(i => i.str).join('').replace(/\s+/g, ' ').trim(); });
      return lines.filter(l => l.text);
    };
    const pls = pages.map(pg => ({ pg, lines: lineize(pg) }));
    pls.forEach(({ lines }) => [lines[0], lines[lines.length - 1]].forEach(l => { if (l) { const k = l.text.replace(/\d+/g, '#'); edgeCount[k] = (edgeCount[k] || 0) + 1; } }));
    const blocks = [];
    let cur = null;
    const allH = []; pls.forEach(({ lines }) => lines.forEach(l => allH.push(l.h)));
    allH.sort((a, b) => a - b);
    const bodyH = allH[Math.floor(allH.length / 2)] || 12;
    const gaps = []; pls.forEach(({ lines }) => { for (let i = 1; i < lines.length; i++) { const g = lines[i].y - lines[i - 1].y; if (g > 0) gaps.push(g / lines[i].h); } });
    gaps.sort((a, b) => a - b);
    const gapRatio = gaps[Math.floor(gaps.length * 0.4)] || 1.5;
    const flush = () => { if (cur && cur.runs.length) blocks.push(cur); cur = null; };
    pls.forEach(({ pg, lines }, pi) => {
      const lefts = lines.map(l => l.x).sort((a, b) => a - b);
      const marginL = lefts[Math.floor(lefts.length * 0.15)] || 0;
      const rights = lines.map(l => l.xEnd).sort((a, b) => a - b);
      const marginR = rights[Math.floor(rights.length * 0.85)] || pg.width;
      let prevY = null, prevH = bodyH;
      lines.forEach((l, li) => {
        const k = l.text.replace(/\d+/g, '#');
        if ((li === 0 || li === lines.length - 1) && (/^\d{1,4}$/.test(l.text) || (edgeCount[k] >= Math.max(3, pages.length * 0.5)))) return;
        const gap = prevY === null ? 0 : l.y - prevY;
        const bold = l.items.every(i => i.bold || !i.str.trim());
        const big = l.h > bodyH * 1.15;
        const centered = Math.abs((l.x - marginL) - (marginR - l.xEnd)) < 20 && l.x - marginL > 30;
        const indentFirst = l.x - marginL > 10 && l.x - marginL < 60;
        const indentBlock = l.x - marginL >= 60 && !centered;
        const newPara = !cur || prevY === null || gap > prevH * gapRatio * 1.45 || CAPTION.test(l.text) || SOURCE.test(l.text) || /^\d{1,2}\p{Lu}/u.test(l.text) && l.h < bodyH * 0.95 || bold !== cur.bold || big || cur.big || (indentFirst && !cur.quote) || centered !== cur.center || indentBlock !== !!cur.quote || /^(\d+(\.\d+)*\s+\p{Lu}|[•●▪]\s|[a-z]\)\s)/u.test(l.text) && gap > 0;
        const prevLine = li > 0 ? lines[li - 1] : null;
        const prevFull = prevLine && !/[.:!?]$/.test(prevLine.text) && prevLine.xEnd >= marginR - 50 && cur && !cur.center;
        const cont = cur && prevFull && prevY !== null && gap < prevH * 3.2 && !big && !cur.big && bold === cur.bold && !centered && !indentFirst && !CAPTION.test(l.text) && !SOURCE.test(l.text);
        if (newPara && !cont) {
          flush();
          cur = { runs: [], bold, big, center: centered, quote: indentBlock, indentLeft: indentBlock ? (l.x - marginL) * 20 : 0, pageBreak: li === 0 && pi > 0 && blocks.length > 0 && false };
        } else {
          if (!newPara) { } 
          const last = cur.runs[cur.runs.length - 1];
          if (last && /[A-Za-zÀ-ÿ]-$/.test(last.t) && /^\p{Ll}/u.test(l.text)) last.t = last.t.slice(0, -1);
          else if (last) last.t += ' ';
        }
        for (const it of l.items) {
          const last = cur.runs[cur.runs.length - 1];
          const s = it.str;
          if (last && !!last.b === !!it.bold && !!last.i === !!it.italic) last.t += s;
          else cur.runs.push({ t: s, b: it.bold, i: it.italic });
        }
        cur.runs.forEach(r => r.t = r.t.replace(/\s{2,}/g, ' '));
        prevY = l.y; prevH = l.h;
        if (/[.:]$/.test(l.text) && l.xEnd < marginR - 40) { flush(); prevY = null; }
      });
      // quebra de página: mantém parágrafo se a última linha não fechou frase
      if (cur && /[.:!?]$/.test(cur.runs.map(r => r.t).join('').trim())) flush();
      prevY = null;
    });
    flush();
    blocks.forEach(b => { b.runs = b.runs.map(r => ({ ...r, t: r.t })).filter(r => r.t); if (b.runs.length) { b.runs[0].t = b.runs[0].t.replace(/^\s+/, ''); b.runs[b.runs.length - 1].t = b.runs[b.runs.length - 1].t.replace(/\s+$/, ''); } });
    return blocks.filter(b => b.runs.length);
  }

  async function extractPdfPages(pdfjsLib, data, onProgress) {
    const pdf = await pdfjsLib.getDocument({ data, disableFontFace: true, isEvalSupported: false }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      try { await page.getOperatorList(); } catch (e) { }
      const fontInfo = {};
      const items = [];
      for (const it of tc.items) {
        if (!('str' in it)) continue;
        let fi = fontInfo[it.fontName];
        if (!fi) {
          let name = '';
          try { const f = page.commonObjs.get(it.fontName); name = (f && (f.name || f.loadedName)) || ''; } catch (e) { }
          name += ' ' + ((tc.styles[it.fontName] || {}).fontFamily || '');
          fi = fontInfo[it.fontName] = { bold: /bold|black|heavy|semibold|,b\b/i.test(name), italic: /italic|oblique/i.test(name) };
        }
        const tr = it.transform;
        const h = Math.hypot(tr[2], tr[3]) || Math.abs(tr[3]) || 10;
        items.push({ str: it.str, x: tr[4], y: vp.height - tr[5], h, w: it.width, bold: fi.bold, italic: fi.italic });
      }
      pages.push({ width: vp.width, height: vp.height, items });
      if (onProgress) onProgress(n, pdf.numPages);
    }
    return pages;
  }


  // ---------- leitura do manual da instituição (sem IA: busca por padrões) ----------
  function rulesFromManualText(raw) {
    const text = String(raw || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
    const sents = text.split(/\n+|(?<=[.;!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9“"(])/).map(x => x.trim()).filter(x => x.length > 8 && x.length < 700);
    const N = x => parseFloat(String(x).replace(',', '.'));
    const low = x => deaccent(x.toLowerCase());
    const rules = {}, found = [];
    const ev = (field, label, value, sent) => { if (found.some(f => f.field === field)) return false; found.push({ field, label, value, sentence: sent.length > 220 ? sent.slice(0, 217) + '…' : sent }); return true; };
    const NUMCM = /(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:cm|centimetros?)\b/g;
    // margens
    const mg = {};
    let mgSent = '';
    for (const s of sents) {
      const l = low(s); if (!/margem|margens/.test(l)) continue;
      const nums = [...l.matchAll(NUMCM)].map(m => ({ v: N(m[1]), i: m.index, e: m.index + m[0].length }));
      if (!nums.length) continue;
      const before = Object.keys(mg).length;
      for (const m of l.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:cm|centimetros?)\s*\(([^)]{3,60})\)/g))
        for (const side of ['superior', 'inferior', 'esquerda', 'direita']) if (m[2].includes(side) && mg[side] == null) mg[side] = N(m[1]);
      for (const side of ['superior', 'inferior', 'esquerda', 'direita']) {
        if (mg[side] != null) continue;
        let idx = l.indexOf(side); if (idx < 0) continue;
        const after = nums.find(n => n.i > idx && n.i - idx < 45);
        const bef = nums.filter(n => n.e <= idx && idx - n.e < 25).pop();
        const pick = after || bef; if (pick && pick.v >= 1 && pick.v <= 5) mg[side] = pick.v;
      }
      if (Object.keys(mg).length > before) mgSent = mgSent ? mgSent : s;
    }
    if (Object.keys(mg).length) {
      rules.margins = { top: mg.superior ?? 3, left: mg.esquerda ?? 3, bottom: mg.inferior ?? 2, right: mg.direita ?? 2 };
      const r = rules.margins;
      ev('margins', 'Margens', `superior ${r.top} · esquerda ${r.left} · inferior ${r.bottom} · direita ${r.right} cm`.replace(/\./g, ','), mgSent);
    }
    for (const s of sents) {
      const l = low(s);
      const aboutQuote = /citac/.test(l), aboutNote = /nota|rodape|legenda|paginac|ficha|tabela/.test(l), aboutRef = /referenc/.test(l);
      // família da fonte
      if (!rules.font && /fonte|letra|tipo/.test(l)) {
        const hasT = /times new roman/.test(l), hasA = /\barial\b/.test(l);
        if (hasT !== hasA) { rules.font = hasT ? 'Times New Roman' : 'Arial'; ev('font', 'Fonte', rules.font, s); }
      }
      // tamanho da fonte do texto
      const exc = l.search(/excet|exceto|excec|salvo|com excecao|menos as|menos nas/);
      const head = exc > 0 ? l.slice(0, exc) : l, tail = exc > 0 ? l.slice(exc) : '';
      const headMain = !/citac|nota|rodape|legenda|paginac|ficha|tabela/.test(head);
      if (rules.fontSize == null && /(fonte|tamanho|corpo|letra)/.test(head) && headMain) {
        const m = head.match(/(?:tamanho|corpo|fonte|letra)[^0-9]{0,20}(1[0-4])(?!\s*(?:cm|,\d))\b/) || head.match(/\b(1[0-4])\s*(?:pt|pontos)\b/);
        if (m) { rules.fontSize = +m[1]; ev('fontSize', 'Tamanho do texto', m[1], s); }
      }
      // tamanho menor
      const smallSrc = tail || ((aboutQuote || aboutNote) ? l : '');
      if (rules.smallSize == null && smallSrc && /(tamanho|corpo|fonte|letra)/.test(smallSrc)) {
        const m = smallSrc.match(/(?:tamanho|corpo|fonte|letra)[^0-9]{0,40}(\d{1,2})(?!\s*(?:cm|,\d))\b/) || smallSrc.match(/\b(\d{1,2})\s*(?:pt|pontos)\b/);
        if (m && +m[1] >= 8 && +m[1] <= 11) { rules.smallSize = +m[1]; ev('smallSize', 'Tamanho menor (citações longas, notas, legendas)', m[1], s); }
      }
      // entrelinha do texto
      if (rules.lineSpacing == null && /(espacamento|entrelinha|espaco entre (as )?linhas|espaco entrelinhas)/.test(l) && !aboutQuote && !aboutNote && !aboutRef) {
        let v = null;
        if (/\b1[,.]5\b|um e meio/.test(l)) v = 1.5; else if (/\bduplo\b|\b2[,.]0\b/.test(l)) v = 2; else if (/\b1[,.]15\b/.test(l)) v = 1.15; else if (/\bsimples\b/.test(l) && !/1[,.]5/.test(l)) v = 1;
        if (v) { rules.lineSpacing = v; ev('lineSpacing', 'Entrelinha do texto', String(v).replace('.', ','), s); }
      }
      // recuo do parágrafo
      if (rules.indentCm == null && /(paragrafo|primeira linha)/.test(l) && /(recuo|entrada|adentramento|tabulac|afastamento)/.test(l) && !aboutQuote) {
        const m = [...l.matchAll(NUMCM)].map(x => N(x[1])).find(v => v > 0 && v <= 3);
        if (m != null) { rules.indentCm = m; ev('indentCm', 'Recuo da primeira linha', String(m).replace('.', ',') + ' cm', s); }
      }
      // recuo da citação longa
      if (rules.quoteIndentCm == null && aboutQuote && /(recuo|margem esquerda|afastamento|adentramento)/.test(l)) {
        const m = [...l.matchAll(NUMCM)].map(x => N(x[1])).find(v => v >= 1.5 && v <= 7);
        if (m != null) { rules.quoteIndentCm = m; ev('quoteIndentCm', 'Recuo da citação longa', String(m).replace('.', ',') + ' cm', s); }
      }
      // numeração das páginas
      if (!rules.pageNumPos && /(numerac|paginac|numero da pagina|numero das paginas|numeradas|numero da folha)/.test(l)) {
        let v = null;
        if (/(canto )?superior direit/.test(l)) v = 'top-right';
        else if (/(canto )?inferior direit/.test(l)) v = 'bottom-right';
        else if (/(rodape|inferior)[^.]{0,40}(centr)|(centr)[^.]{0,40}(rodape|inferior)/.test(l)) v = 'bottom-center';
        else if (/(superior|cabecalho)[^.]{0,40}(centr)|(centr)[^.]{0,40}(superior|cabecalho)/.test(l)) v = 'top-center';
        if (v) { rules.pageNumPos = v; ev('pageNumPos', 'Numeração das páginas', { 'top-right': 'canto superior direito', 'bottom-right': 'canto inferior direito', 'bottom-center': 'rodapé, ao centro', 'top-center': 'cabeçalho, ao centro' }[v], s); }
      }
      // títulos das seções primárias centralizados
      if (!rules.headCenter && /(titulo|secao|secoes)/.test(l) && /(primari|capitulo|secoes principais)/.test(l) && /centraliz/.test(l) && !/sem indicativo|nao numerad/.test(l)) {
        rules.headCenter = true; ev('headCenter', 'Títulos das seções primárias', 'centralizados', s);
      }
      // referências
      if (aboutRef && /(espaco|espacamento|entrelinha)/.test(l)) {
        if (rules.refsLine == null) { if (/simples/.test(l)) { rules.refsLine = 1; ev('refsLine', 'Entrelinha das referências', 'simples', s); } else if (/1[,.]5/.test(l)) { rules.refsLine = 1.5; ev('refsLine', 'Entrelinha das referências', '1,5', s); } }
        if (rules.refsGap == null && /(linha em branco|espaco simples em branco|espaco duplo entre|separad)/.test(l)) { rules.refsGap = true; ev('refsGap', 'Linha em branco entre referências', 'sim', s); }
      }
      if (aboutRef && rules.refsAlign == null && /(alinhad|justificad)/.test(l)) {
        if (/justificad/.test(l) && !/nao (devem ser )?justificad/.test(l)) { rules.refsAlign = 'both'; ev('refsAlign', 'Alinhamento das referências', 'justificado', s); }
        else if (/esquerda/.test(l)) { rules.refsAlign = 'left'; ev('refsAlign', 'Alinhamento das referências', 'à esquerda', s); }
      }
    }
    return { rules, found };
  }
  const api = { rulesFromManualText, extractPdfPages, formatDocx, buildDocxFromBlocks, blocksFromPdfPages, parseAuthors };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NormaPronta = api;
})(typeof window !== 'undefined' ? window : globalThis);
