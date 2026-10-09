/* Vocab engine: grade-calibrated word simplification + readability scoring.
   Pure logic (no DOM) so it runs in the browser and in Node tests.
   Difficulty = frequency rank in lexicon.js (wordfreq), not word length. */
(function (root) {
  'use strict';

  // A swap must rank in the top few context-aware matches. Looser values let wrong senses through
  // (e.g. gases->guns, submarine->hero); 4 keeps precision high at the cost of recall.
  const NEAR_TOP = 4;
  const LEARN_MIN = 5000;  // words rarer than this (and above grade) are flagged as words to learn
  const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
  // A word is "known" at grade g if its frequency rank is <= CUTOFFS[g].
  const CUTOFFS = [800, 1400, 2200, 3400, 5000, 7000, 9500, 13000, 18000];

  let RANK = new Map();
  function init(words) {
    RANK = new Map();
    for (let i = 0; i < words.length; i++) if (!RANK.has(words[i])) RANK.set(words[i], i);
  }
  const rank = (w) => (RANK.has(w) ? RANK.get(w) : Infinity);
  const knownAt = (w, g) => rank(w) <= CUTOFFS[g];

  // ---------- readability ----------
  function syllables(word) {
    let w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = w.match(/[aeiouy]+/g);
    return Math.max(1, m ? m.length : 1);
  }
  function fkGrade(text) {
    const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
    if (words.length < 5) return null;
    const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) || []).length);
    const syl = words.reduce((n, w) => n + syllables(w), 0);
    const g = 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
    return Math.max(-1, Math.round(g * 10) / 10);
  }

  // ---------- inflection ----------
  const V = /[aeiou]/;
  const isCVC = (b) => b.length >= 3 && !V.test(b[b.length - 1]) && !/[wxy]/.test(b[b.length - 1]) &&
    V.test(b[b.length - 2]) && !V.test(b[b.length - 3]) && syllables(b) === 1;

  // Possible (base, kind) readings of a surface form. kind: '', 's', 'ed', 'ing'
  function decompose(w) {
    const out = [{ base: w, kind: '' }];
    const add = (base, kind) => { if (base.length >= 3 && RANK.has(base)) out.push({ base, kind }); };
    if (w.endsWith('ing') && w.length > 5) {
      const s = w.slice(0, -3);
      add(s, 'ing'); add(s + 'e', 'ing');
      if (s.length > 2 && s[s.length - 1] === s[s.length - 2]) add(s.slice(0, -1), 'ing');
    }
    if (w.endsWith('ied')) add(w.slice(0, -3) + 'y', 'ed');
    else if (w.endsWith('ed') && w.length > 4) {
      const s = w.slice(0, -2);
      add(s, 'ed'); add(s + 'e', 'ed');
      if (s.length > 2 && s[s.length - 1] === s[s.length - 2]) add(s.slice(0, -1), 'ed');
    }
    if (w.endsWith('ies')) add(w.slice(0, -3) + 'y', 's');
    else if (w.endsWith('es')) { add(w.slice(0, -2), 's'); add(w.slice(0, -1), 's'); }
    else if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1), 's');
    // prefer the reading whose base is most frequent (most likely real lemma)
    return out.sort((a, b) => rank(a.base) - rank(b.base) || (a.kind ? 1 : -1));
  }
  function inflections(base, kind) {
    if (!kind) return [base];
    const last = base[base.length - 1];
    if (kind === 's') {
      if (/(s|x|z|ch|sh)$/.test(base)) return [base + 'es'];
      if (last === 'y' && !V.test(base[base.length - 2])) return [base.slice(0, -1) + 'ies'];
      return [base + 's'];
    }
    if (kind === 'ed') {
      if (last === 'e') return [base + 'd'];
      if (last === 'y' && !V.test(base[base.length - 2])) return [base.slice(0, -1) + 'ied'];
      return isCVC(base) ? [base + last + 'ed', base + 'ed'] : [base + 'ed'];
    }
    if (kind === 'ing') {
      if (base.endsWith('ie')) return [base.slice(0, -2) + 'ying'];
      if (last === 'e' && !/(ee|ye|oe)$/.test(base)) return [base.slice(0, -1) + 'ing'];
      return isCVC(base) ? [base + last + 'ing', base + 'ing'] : [base + 'ing'];
    }
    return [base];
  }

  // ---------- Datamuse client ----------
  const cache = new Map();
  function makeClient(fetchJson) {
    // One call per word: synonyms, biased toward the article's topic words to favour the right sense.
    const lookup = (word, topics) => {
      const t = (topics || []).filter((x) => x !== word).slice(0, 5);
      const key = word + '|' + t.join(',');
      if (cache.has(key)) return cache.get(key);
      let u = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&md=p&max=14`;
      if (t.length) u += `&topics=${encodeURIComponent(t.join(','))}`;
      const p = fetchJson(u).catch(() => []).then((syns) => ({
        pos: [],
        syns: (Array.isArray(syns) ? syns : [])
          .filter((s) => /^[a-z]+$/.test(s.word))
          .map((s) => ({ word: s.word, pos: (s.tags || []).filter((t) => /^(n|v|adj|adv)$/.test(t)) }))
      }));
      cache.set(key, p);
      return p;
    };
    // Context-aware "means like" ranking, used only to VERIFY an easy candidate (second call, only when needed).
    const ctxCache = new Map();
    const context = (word, topics) => {
      const t = (topics || []).filter((x) => x !== word).slice(0, 5);
      const key = word + '|' + t.join(',');
      if (ctxCache.has(key)) return ctxCache.get(key);
      let u = `https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=40`;
      if (t.length) u += `&topics=${encodeURIComponent(t.join(','))}`;
      const p = fetchJson(u).then((j) => (Array.isArray(j) ? j.map((x) => x.word) : [])).catch(() => []);
      ctxCache.set(key, p);
      return p;
    };
    return { lookup, context };
  }

  // Best easier replacement for `surface` at grade g, or null.
  async function pickReplacement(surface, g, client, ctx) {
    for (const { base, kind } of decompose(surface)) {
      const topics = ctx && ctx.topics;
      const info = await client.lookup(base, topics);
      // easy candidates first (cheap, local checks); only then spend a second call to verify the sense
      const easy = [];
      for (const s of info.syns.slice(0, 10)) {
        if (s.word === base || s.pos.length >= 3) continue;
        for (const form of inflections(s.word, kind)) {
          if (knownAt(form, g) && rank(form) < rank(surface)) { easy.push({ syn: s.word, form }); break; }
        }
      }
      if (!easy.length) continue;
      const near = await client.context(base, topics);
      const ok = easy.filter((e) => near.indexOf(e.syn) >= 0 && near.indexOf(e.syn) < NEAR_TOP)
        .sort((a, b) => near.indexOf(a.syn) - near.indexOf(b.syn));
      if (ok.length) return ok[0].form;
    }
    return null;
  }

  function matchCase(src, repl) {
    if (src.length > 1 && src === src.toUpperCase()) return repl.toUpperCase();
    if (src[0] === src[0].toUpperCase()) return repl[0].toUpperCase() + repl.slice(1);
    return repl;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Simplify one paragraph for grade index g (0..8).
     strength 0..1: fraction of the above-grade words (hardest first) to attempt.
     Returns { html, swaps:[{from,to}], hard:[word] } */
  async function simplifyParagraph(text, g, strength, client, topicsIn) {
    const parts = text.match(/[A-Za-z]+(?:['’][A-Za-z]+)*|[^A-Za-z]+/g) || [];
    const cand = []; // {i, lower, rank}
    let sentenceStart = true;
    parts.forEach((p, i) => {
      if (/^[A-Za-z]/.test(p)) {
        const lower = p.toLowerCase();
        const proper = /^[A-Z][a-z]/.test(p) && !sentenceStart;
        const acronym = p.length > 1 && p === p.toUpperCase();
        const compound = /^-/.test(parts[i + 1] || '') || /-$/.test(parts[i - 1] || '');
        if (!proper && !acronym && !compound && !/['’]/.test(p) && p.length >= 4 && !knownAt(lower, g)) {
          cand.push({ i, lower, r: rank(lower) });
        }
        sentenceStart = false;
      } else if (/[.!?]["”’')\]]*\s*$/.test(p) || /\n/.test(p)) sentenceStart = true;
    });

    const budget = Math.ceil(cand.length * Math.max(0, Math.min(1, strength)));
    const chosen = new Set(
      cand.slice().sort((a, b) => b.r - a.r).slice(0, budget).map((c) => c.i)
    );
    const topics = topicsIn || [...new Set((text.toLowerCase().match(/[a-z]{5,}/g) || []))]
      .sort((x, y) => rank(y) - rank(x)).slice(0, 4);
    const repl = new Map(); // part index -> replacement
    await Promise.all(cand.filter((c) => chosen.has(c.i)).map(async (c) => {
      const r = await pickReplacement(c.lower, g, client, { lc: '', rc: '', topics: topics.filter((w) => w !== c.lower) });
      if (r) repl.set(c.i, r);
    }));

    // a/an agreement for words we swapped in
    const artFix = new Map();
    repl.forEach((to, i) => {
      const art = parts[i - 2];
      if (art && /^an?$/i.test(art) && /^\s$/.test(parts[i - 1] || '')) {
        const want = /^[aeiou]/i.test(to) ? 'an' : 'a';
        artFix.set(i - 2, art[0] === 'A' ? want[0].toUpperCase() + want.slice(1) : want);
      }
    });

    const swaps = [], hard = [];
    const candAt = new Map(cand.map((c) => [c.i, c]));
    const html = parts.map((p, i) => {
      const c = candAt.get(i);
      if (artFix.has(i)) return esc(artFix.get(i));
      if (!c) return esc(p);
      const to = repl.get(i);
      if (to) {
        swaps.push({ from: c.lower, to });
        return `<span class="sw" data-word="${esc(c.lower)}" data-was="${esc(c.lower)}" title="was: ${esc(c.lower)}">${esc(matchCase(p, to))}</span>`;
      }
      hard.push(c.lower);
      if (c.r <= LEARN_MIN) return esc(p);   // merely above-grade: not worth flagging
      return `<span class="hd" data-word="${esc(c.lower)}" title="Above grade ${GRADES[g]} — click to save">${esc(p)}</span>`;
    }).join('');
    return { html, swaps, hard };
  }

  function articleTopics(paras) {
    const freq = new Map();
    for (const w of (paras.join(' ').toLowerCase().match(/[a-z]{5,}/g) || [])) freq.set(w, (freq.get(w) || 0) + 1);
    return [...freq].filter(([w, n]) => n >= 2 && rank(w) > 600).sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]);
  }

  const Engine = { LEARN_MIN, articleTopics, GRADES, CUTOFFS, init, rank, knownAt, syllables, fkGrade, decompose, inflections, makeClient, pickReplacement, simplifyParagraph, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
