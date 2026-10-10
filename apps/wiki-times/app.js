/* Reading Level UI. Original text appears instantly; each paragraph is swapped in as it is ready. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = Engine.esc;
  const GRADES = Engine.GRADES;
  const VOICES = LLM.VOICES;

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode / full */ } }
  };
  const S = Object.assign({ theme: '', size: 20, face: 'serif', strength: 0.7, changes: true, provider: null }, store.get('wt_settings_v2', {}));
  const saveSettings = () => store.set('wt_settings_v2', S);

  // API profiles share the key used by earlier versions so saved keys keep working.
  const PROFILE_KEY = 'wikigrade_api_profiles_v1';
  const profiles = (() => {
    const saved = store.get(PROFILE_KEY, {});
    const out = {};
    for (const [id, d] of Object.entries(LLM.PROVIDERS)) out[id] = { baseUrl: d.baseUrl, model: d.model, apiKey: '', ...(saved[id] || {}) };
    if (out.anthropic.model === 'claude-3-5-sonnet-latest') out.anthropic.model = LLM.PROVIDERS.anthropic.model;
    return out;
  })();
  const saveProfiles = () => store.set(PROFILE_KEY, profiles);
  if (!S.provider) S.provider = Object.keys(profiles).find((id) => profiles[id].apiKey) || 'none';

  function cfg() {
    if (S.provider === 'none' || !profiles[S.provider]) return { provider: 'none' };
    return { provider: S.provider, ...profiles[S.provider] };
  }
  let builtinOK = false;  // local server has a proxy key
  let localOK = false;   // Chrome's on-device model is downloaded and ready
  const haveKey = () => { const c = cfg(); return c.provider === 'chrome' ? localOK : c.provider === 'builtin' ? builtinOK : c.provider !== 'none' && !!c.apiKey; };

  // ---------- icons ----------
  const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    book: P('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
    moon: P('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    sliders: P('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
    eye: P('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    x: P('<path d="M18 6 6 18M6 6l12 12"/>')
  };
  const fillIcons = () => document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = ICONS[el.dataset.i] || ''; });

  // ---------- toast ----------
  let toastT;
  function toast(msg, err) {
    const t = $('toast');
    t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }

  // ---------- network: Datamuse with concurrency limit + persistent cache ----------
  const DM_KEY = 'wt_dm_cache_v1', DM_MAX = 1500;
  const dmCache = new Map(Object.entries(store.get(DM_KEY, {})));
  let dmSaveT;
  function dmPersist() {
    clearTimeout(dmSaveT);
    dmSaveT = setTimeout(() => {
      while (dmCache.size > DM_MAX) dmCache.delete(dmCache.keys().next().value);
      store.set(DM_KEY, Object.fromEntries(dmCache));
    }, 1500);
  }
  const net = { active: 0, q: [] };
  function limited(fn) {
    return new Promise((res, rej) => {
      const run = () => { net.active++; fn().then(res, rej).finally(() => { net.active--; const n = net.q.shift(); if (n) n(); }); };
      net.active < 10 ? run() : net.q.push(run);
    });
  }
  function dmFetch(url) {
    if (dmCache.has(url)) return Promise.resolve(dmCache.get(url));
    return limited(async () => {
      const j = await (await fetch(url)).json();
      const slim = Array.isArray(j) ? j.map((x) => ({ word: x.word, tags: x.tags, defs: x.defs })) : [];
      dmCache.set(url, slim); dmPersist();
      return slim;
    });
  }
  const datamuse = Engine.makeClient(dmFetch);

  // ---------- definitions (Datamuse/WordNet: fast, unlike most dictionary APIs) ----------
  const POS = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };
  const defCache = new Map();
  function define(word) {
    if (defCache.has(word)) return defCache.get(word);
    const p = Promise.race([
      dmFetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`),
      new Promise((r) => setTimeout(() => r(null), 3500))
    ]).then((r) => {
      const d = r && r[0] && r[0].word === word && r[0].defs && r[0].defs[0];
      if (!d) return null;
      const [pos, ...rest] = d.split('\t');
      return { pos: POS[pos] || pos, text: rest.join(' ') };
    }).catch(() => null);
    defCache.set(word, p);
    return p;
  }

  // ---------- state ----------
  const A = { title: '', source: '', paras: [], topics: [] };
  let mode = 'level';                 // 'level' | 'voice'
  const idx = { level: GRADES.length, voice: 0 };   // level starts on "Original"
  const cache = new Map();            // lens key -> sparse array of paragraph html
  let tok = 0;                        // render token: drops stale async work

  const levelItems = () => [...GRADES, 'Original'];
  const items = () => (mode === 'level' ? levelItems() : VOICES.map((v) => v.label));
  const isOriginal = () => (mode === 'level' ? idx.level === GRADES.length : idx.voice === 0);
  const via = () => (haveKey() ? `${S.provider}:${cfg().model}` : `lite:${S.strength}`);
  const lensKey = () => `${mode}:${idx[mode]}:${via()}`;

  // ---------- rendering ----------
  const R = $('reader');
  const origHtml = (i) => esc(A.paras[i]);

  function voiceHtml(text, v) {
    const lines = String(text).split('\n').map((l) => l.trimEnd());
    return v.id === 'greentext'
      ? lines.filter((l) => l.trim()).map((l) => (l.trim().startsWith('>') ? `<span class="gt">${esc(l.trim())}</span>` : esc(l))).join('')
      : esc(lines.join('\n'));
  }
  function markLlm(text, original, g) {
    const seen = new Set(original.toLowerCase().match(/[a-z]+/g) || []);
    return text.split(/([A-Za-z]+(?:['’][A-Za-z]+)*)/).map((t, i) => {
      if (i % 2 === 0) return esc(t);
      const lw = t.toLowerCase();
      if (t.length >= 4 && !seen.has(lw)) return `<span class="sw" data-word="${esc(lw)}" title="Rewritten">${esc(t)}</span>`;
      if (t.length >= 4 && !/^[A-Z]/.test(t) && !Engine.knownAt(lw, g) && Engine.rank(lw) > Engine.LEARN_MIN) return `<span class="hd" data-word="${esc(lw)}">${esc(t)}</span>`;
      return esc(t);
    }).join('');
  }

  function readerClass() {
    const v = mode === 'voice' && idx.voice > 0 ? VOICES[idx.voice] : null;
    return `reader${S.face === 'sans' ? ' sans' : ''}${S.changes ? ' show-changes' : ''}${v ? ' voice ' + v.id : ''}`;
  }
  function paint(arr) {
    R.className = readerClass();
    R.innerHTML = A.paras.map((_, i) => (arr && arr[i] !== undefined ? `<p>${arr[i]}</p>` : `<p class="pend">${origHtml(i)}</p>`)).join('');
  }
  function setPara(i, html) {
    const p = R.children[i];
    if (!p) return;
    p.className = 'swap'; p.innerHTML = html;
  }

  function setStatus(text, busy) {
    const s = $('status');
    s.hidden = !text; s.textContent = text || '';
    s.classList.toggle('done', !busy);
  }
  function finish(note) {
    const fk = mode === 'level' ? Engine.fkGrade(R.innerText || '') : null;
    $('gradeNow').textContent = fk === null ? '' : `reads at ≈ grade ${fk}`;
    const swaps = R.querySelectorAll('.sw').length;
    if (mode === 'level' && !haveKey() && !isOriginal() && swaps < 6) {
      setStatus(`Lite mode only swaps words when it's confident, and changed ${swaps} here. Add an AI key in Settings for a full rewrite.`, false);
    } else setStatus(note ? `${note}${swaps ? ` · ${swaps} words changed` : ''}` : '', false);
  }

  async function pool(list, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
  }

  const LOCAL_BATCH = 4;
  async function render() {
    if (!A.paras.length) return;
    const my = ++tok;
    updateLensUI();

    if (isOriginal()) {
      paint(A.paras.map((_, i) => origHtml(i)));
      $('gradeNow').textContent = mode === 'level' ? (() => { const f = Engine.fkGrade(A.paras.join(' ')); return f === null ? '' : `reads at ≈ grade ${f}`; })() : '';
      setStatus('', false);
      return;
    }
    if (mode === 'voice' && !haveKey()) {
      paint(A.paras.map((_, i) => origHtml(i)));
      setStatus('Voices need an AI key. Add one in Settings.', false);
      openDrawer('settings');
      return;
    }

    const key = lensKey();
    if (!cache.has(key)) cache.set(key, []);
    const arr = cache.get(key);
    let todo = A.paras.map((_, i) => i).filter((i) => arr[i] === undefined);
    const rest = S.provider === 'chrome' && haveKey() ? Math.max(0, todo.length - LOCAL_BATCH) : 0;   // slow model: a few paragraphs at a time
    if (rest) todo = todo.slice(0, LOCAL_BATCH);
    paint(arr);
    const note = S.provider === 'chrome' ? 'On-device AI · free' : mode === 'voice' ? `Voice · ${S.provider}` : haveKey() ? `AI rewrite · ${S.provider}` : 'Lite mode · thesaurus swaps';
    if (!todo.length) { finish(note); return; }
    setStatus(S.provider === 'chrome' && haveKey() ? 'Rewriting on your device… a few seconds per paragraph' : haveKey() ? 'Rewriting…' : 'Finding easier words…', true);

    const put = (i, html) => { arr[i] = html; if (my === tok) setPara(i, html); };
    try {
      if (mode === 'voice' || haveKey()) {
        const v = VOICES[idx.voice], g = idx.level;
        const instruction = mode === 'voice' ? v.instruction : LLM.levelInstruction(g);
        try {
          await LLM.rewriteParagraphs(cfg(), todo.map((i) => A.paras[i]), instruction, {
            isStale: () => my !== tok,
            onChunk: (start, outs) => outs.forEach((t, k) => {
              const i = todo[start + k];
              put(i, mode === 'voice' ? voiceHtml(t, v) : markLlm(t, A.paras[i], g));
            })
          });
        } catch (e) {
          if (mode === 'voice') throw e;
          toast(`AI failed (${String(e.message).slice(0, 50)}), using lite mode`, true);
          await lite(todo, put, my);
        }
      } else {
        await lite(todo, put, my);
      }
      if (my === tok) {
        finish(note);
        if (rest) setStatus(`Rewrote a few paragraphs on your device (a small model, so check the facts). ${rest} more. Click to continue.`, false);
      }
    } catch (e) {
      console.error(e);
      if (my === tok) {
        const limited = /429|rate limit/i.test(String(e.message));
        setStatus(limited ? 'Rate limit reached, so some paragraphs are still original. Click to retry.' : `Some paragraphs didn't finish (${String(e.message || e).slice(0, 70)}). Click to retry.`, false);
      }
    }
  }

  async function lite(todo, put, my) {
    const g = idx.level;
    await pool(todo, 4, async (i) => {
      if (my !== tok) return;                                  // user moved on: stop spending requests
      const r = await Engine.simplifyParagraph(A.paras[i], g, S.strength, datamuse, A.topics);
      put(i, r.html);
    });
  }

  // Datamuse answers don't depend on grade, so fetch them while the user is still reading the original.
  async function warm(title) {
    if (haveKey()) return;
    await pool(A.paras, 1, async (p) => {
      if (A.title !== title) return;
      await Engine.simplifyParagraph(p, 3, S.strength, datamuse, A.topics);   // typical mid-grade slide
    });
  }

  $('status').addEventListener('click', () => { const t = $('status').textContent; if (/AI key/.test(t)) openDrawer('settings'); else if (/Click to (retry|continue)/.test(t)) render(); });

  // ---------- lens dock ----------
  function buildLens() {
    const L = $('lens');
    L.innerHTML = '<span class="thumb" id="thumb"></span>' + items().map((t, i) => `<button role="radio" data-n="${i}">${esc(t)}</button>`).join('');
    updateLensUI();
  }
  function updateLensUI() {
    const L = $('lens'), btns = [...L.querySelectorAll('button')], cur = idx[mode];
    btns.forEach((b, i) => { b.classList.toggle('on', i === cur); b.setAttribute('aria-checked', i === cur); });
    const b = btns[cur], th = $('thumb');
    if (b && th) {
      th.style.width = `${b.offsetWidth}px`; th.style.transform = `translateX(${b.offsetLeft}px)`;
      const left = b.offsetLeft - (L.clientWidth - b.offsetWidth) / 2;
      L.scrollTo({ left, behavior: 'smooth' });
    }
    $('tabLevel').classList.toggle('on', mode === 'level');
    $('tabVoice').classList.toggle('on', mode === 'voice');
    $('blurb').textContent = mode === 'voice' ? VOICES[idx.voice].blurb : (cur === GRADES.length ? 'The article as written.' : `Same article, ${cur === 0 ? 'kindergarten' : 'grade ' + GRADES[cur]} words.`);
  }
  function setLens(n) { if (n === idx[mode] || n < 0 || n >= items().length) return; idx[mode] = n; render(); }
  function setMode(m) { if (m === mode) return; mode = m; buildLens(); render(); }

  $('lens').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setLens(+b.dataset.n); });
  $('tabLevel').onclick = () => setMode('level');
  $('tabVoice').onclick = () => setMode('voice');
  $('btnChanges').onclick = () => { S.changes = !S.changes; $('btnChanges').setAttribute('aria-pressed', S.changes); R.classList.toggle('show-changes', S.changes); saveSettings(); };
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || e.metaKey || e.ctrlKey || $('dock').hidden) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); setLens(idx[mode] + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setLens(idx[mode] - 1); }
    else if (e.key === 'Escape') closeDrawer();
  });
  window.addEventListener('resize', updateLensUI);

  // ---------- loading articles ----------
  const WIKI = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=extracts&explaintext=1&exlimit=1';
  const cleanPara = (t) => t.replace(/\[[^\]]{1,24}\]/g, '').replace(/\s+/g, ' ').trim();
  function takeParas(list) {
    const out = []; let chars = 0;
    for (const t of list.map(cleanPara)) {
      if (t.length < 60 || /^=+/.test(t)) continue;
      out.push(t); chars += t.length;
      if (out.length >= 24 || chars > 9000) break;
    }
    return out;
  }
  async function fromWikipedia(title, search) {
    const q = search ? `&generator=search&gsrlimit=1&gsrsearch=${encodeURIComponent(title)}` : `&titles=${encodeURIComponent(title)}`;
    const j = await (await fetch(WIKI + q)).json();
    const page = Object.values((j.query && j.query.pages) || {})[0];
    if (!page || page.missing !== undefined || !page.extract) throw new Error('Could not find that article');
    return { title: page.title, source: 'Wikipedia', paras: takeParas(page.extract.split(/\n+/)) };
  }
  async function fromWeb(url) {
    const r = await fetch('https://r.jina.ai/' + url);
    if (!r.ok) throw new Error(`Could not fetch that page (${r.status})`);
    const text = await r.text();
    const title = (text.match(/^Title:\s*(.+)$/m) || [])[1] || url;
    const body = text.split(/Markdown Content:\s*/)[1] || text;
    const lines = body.split(/\n\s*\n/).map((l) => l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`>]+/g, '').trim())
      .filter((l) => !/^#/.test(l));
    return { title: title.trim(), source: new URL(url).hostname.replace(/^www\./, ''), paras: takeParas(lines) };
  }
  async function fetchArticle(input) {
    input = input.trim();
    if (/^https?:\/\//i.test(input)) {
      const u = new URL(input);
      if (/(^|\.)wikipedia\.org$/i.test(u.hostname) && u.pathname.startsWith('/wiki/')) return fromWikipedia(decodeURIComponent(u.pathname.slice(6)).replace(/_/g, ' '));
      return fromWeb(input);
    }
    if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(input) && !/\s/.test(input)) return fromWeb('https://' + input);
    return fromWikipedia(input, true);
  }

  async function load(input) {
    if (!input.trim()) return;
    const my = ++tok;
    $('hero').hidden = true; $('article').hidden = false;
    $('title').textContent = 'Loading…'; $('source').textContent = ''; $('gradeNow').textContent = '';
    R.className = 'reader'; R.innerHTML = '';
    $('dock').hidden = true;
    setStatus('Fetching article…', true);
    try {
      const a = await fetchArticle(input);
      if (my !== tok) return;
      if (!a.paras.length) throw new Error('No readable text found on that page');
      Object.assign(A, a, { topics: Engine.articleTopics(a.paras) });
      cache.clear();
      $('title').textContent = A.title; $('source').textContent = A.source;
      document.title = `${A.title} · Reading Level`;
      $('dock').hidden = false;
      buildLens();
      render();
      warm(A.title);
    } catch (e) {
      if (my !== tok) return;
      $('title').textContent = 'Couldn’t load that';
      setStatus(String(e.message || e), false);
    }
  }
  $('urlForm').addEventListener('submit', (e) => { e.preventDefault(); load($('url').value); });

  const EXAMPLES = [['Photosynthesis', 'Photosynthesis'], ['Black hole', 'Black hole'], ['Stoicism', 'Stoicism'], ['The Great Gatsby', 'The Great Gatsby'], ['Paul Graham: How to Work Hard', 'https://paulgraham.com/hwh.html']];
  $('examples').innerHTML = EXAMPLES.map(([l, v]) => `<button class="chip" data-v="${esc(v)}">${esc(l)}</button>`).join('');
  $('examples').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { $('url').value = b.dataset.v; load(b.dataset.v); } });

  // ---------- word tooltip + saving ----------
  const tip = $('tip');
  let hoverT, hoverSig = '';
  function spanOf(el) { return el.closest && el.closest('.sw, .hd'); }
  R.addEventListener('mouseover', (e) => {
    const t = spanOf(e.target);
    clearTimeout(hoverT);
    if (!t) { tip.classList.remove('on'); hoverSig = ''; return; }
    hoverT = setTimeout(async () => {
      const word = t.dataset.word, now = t.textContent, sig = word + '|' + now;
      hoverSig = sig;
      const d = await define(word);
      if (hoverSig !== sig) return;
      tip.innerHTML = `<b>${esc(word)}</b>${d && d.pos ? ` <i class="hint">${esc(d.pos)}</i>` : ''}` +
        (t.classList.contains('sw') && now.toLowerCase() !== word ? `<div class="now">now: ${esc(now)}</div>` : '') +
        (d ? `<div>${esc(d.text)}</div>` : '<div class="hint">No definition found.</div>') + '<div class="hint">Click to save</div>';
      const r = t.getBoundingClientRect();
      tip.style.left = `${Math.max(12, Math.min(r.left, innerWidth - 306))}px`;
      tip.style.top = `${r.bottom + 8 + 120 > innerHeight ? Math.max(12, r.top - tip.offsetHeight - 8) : r.bottom + 8}px`;
      tip.classList.add('on');
    }, 160);
  });
  R.addEventListener('mouseleave', () => { clearTimeout(hoverT); tip.classList.remove('on'); hoverSig = ''; });
  R.addEventListener('click', (e) => { const t = spanOf(e.target); if (t) addWord(t.dataset.word); });

  let words = (() => {
    const v2 = store.get('wikigrade_flashcards_v2', null);
    if (v2) return v2;
    return store.get('wikigrade_flashcards_v1', []).map((w) => ({ word: w, def: '', pos: '' }));
  })();
  const saveWords = () => { store.set('wikigrade_flashcards_v2', words); renderWords(); };
  function addWord(word) {
    word = String(word || '').toLowerCase();
    if (!word) return;
    if (words.some((c) => c.word === word)) return toast(`“${word}” is already saved`);
    const card = { word, def: '', pos: '' };
    words.unshift(card); saveWords(); toast(`Saved “${word}”`);
    define(word).then((d) => { if (d) { card.def = d.text; card.pos = d.pos; saveWords(); } });
  }
  function renderWords() {
    $('wordCount').hidden = !words.length; $('wordCount').textContent = words.length;
    $('wordsEmpty').hidden = !!words.length;
    $('wordList').innerHTML = words.map((c) => `<li><span><b>${esc(c.word)}</b>${c.pos ? `<i>${esc(c.pos)}</i>` : ''}${c.def ? `<span class="def">${esc(c.def)}</span>` : ''}</span><button data-rm="${esc(c.word)}" aria-label="Remove ${esc(c.word)}">&times;</button></li>`).join('');
  }
  $('wordList').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { words = words.filter((c) => c.word !== b.dataset.rm); saveWords(); } });
  words.filter((c) => !c.def).slice(0, 20).forEach((c) => define(c.word).then((d) => { if (d) { c.def = d.text; c.pos = d.pos; saveWords(); } }));

  // ---------- drawer + settings ----------
  function openDrawer(tab) {
    $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); $('scrim').hidden = false;
    const w = tab === 'words';
    $('dtWords').classList.toggle('on', w); $('dtSettings').classList.toggle('on', !w);
    $('paneWords').hidden = !w; $('paneSettings').hidden = w;
    if (!w) loadProviderFields();
  }
  function closeDrawer() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); $('scrim').hidden = true; }
  $('btnWords').onclick = () => openDrawer('words');
  $('btnSettings').onclick = () => openDrawer('settings');
  $('btnClose').onclick = $('scrim').onclick = closeDrawer;
  $('dtWords').onclick = () => openDrawer('words');
  $('dtSettings').onclick = () => openDrawer('settings');

  // No key? Use Chrome's built-in model when it is ready: free, private, nothing to sign up for.
  LLM.localStatus().then((st) => { localOK = st === 'available'; });
  fetch('/ai/ping').then((r) => r.json()).then((j) => {
    builtinOK = !!j.ok;
    if (builtinOK && (S.provider === 'none' || S.provider === 'chrome') && !S.noAuto) { S.provider = 'builtin'; saveSettings(); }
    loadProviderFields();
    if (A.paras.length && S.provider === 'builtin') render();
  }).catch(() => {});
  $('provider').innerHTML = '<option value="none">None (lite mode)</option>' + Object.entries(LLM.PROVIDERS).map(([id, p]) => `<option value="${id}">${esc(p.label)}</option>`).join('');
  function loadProviderFields() {
    $('provider').value = S.provider;
    const p = profiles[S.provider];
    $('apiKey').value = p ? p.apiKey : ''; $('model').value = p ? p.model : '';
    $('apiKey').disabled = $('model').disabled = !p || S.provider === 'chrome' || S.provider === 'builtin';
    $('size').value = S.size; $('sizeVal').textContent = `${S.size}px`;
    $('face').value = S.face;
    $('strength').value = Math.round(S.strength * 100); $('strengthVal').textContent = `${Math.round(S.strength * 100)}%`;
  }
  $('provider').onchange = () => { S.provider = $('provider').value; S.noAuto = S.provider === 'none'; saveSettings(); loadProviderFields(); render(); };
  $('saveKey').onclick = () => {
    const p = profiles[S.provider]; if (!p) return toast('Pick a provider first', true);
    p.apiKey = $('apiKey').value.trim(); p.model = $('model').value.trim() || LLM.PROVIDERS[S.provider].model;
    saveProfiles(); toast('Saved'); render();
  };
  $('clearKey').onclick = () => { const p = profiles[S.provider]; if (!p) return; p.apiKey = ''; p.model = LLM.PROVIDERS[S.provider].model; saveProfiles(); loadProviderFields(); toast('Key cleared'); render(); };
  $('testKey').onclick = async () => {
    const p = profiles[S.provider]; if (!p) return toast('Pick a provider first', true);
    const c = { provider: S.provider, baseUrl: p.baseUrl, model: $('model').value.trim() || p.model, apiKey: $('apiKey').value.trim() };
    if (!c.apiKey) return toast('Paste a key first', true);
    try { await LLM.chat(c, 'Reply with one word.', 'Say OK', { maxTokens: 400, retries: 0 }); toast('Connection works'); }
    catch (e) { toast(String(e.message).slice(0, 80), true); }
  };
  function applyReading() {
    document.documentElement.style.setProperty('--size', `${S.size}px`);
    R.classList.toggle('sans', S.face === 'sans');
  }
  $('size').oninput = () => { S.size = +$('size').value; $('sizeVal').textContent = `${S.size}px`; saveSettings(); applyReading(); };
  $('face').onchange = () => { S.face = $('face').value; saveSettings(); applyReading(); };
  let strT;
  $('strength').oninput = () => {
    S.strength = +$('strength').value / 100; $('strengthVal').textContent = `${Math.round(S.strength * 100)}%`; saveSettings();
    clearTimeout(strT); strT = setTimeout(render, 350);
  };

  // ---------- theme ----------
  function applyTheme() {
    if (S.theme) document.documentElement.dataset.theme = S.theme; else delete document.documentElement.dataset.theme;
    const dark = S.theme ? S.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('btnTheme').firstElementChild.innerHTML = ICONS[dark ? 'sun' : 'moon'];
  }
  $('btnTheme').onclick = () => {
    const dark = S.theme ? S.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    S.theme = dark ? 'light' : 'dark'; saveSettings(); applyTheme();
  };

  // ---------- boot ----------
  Engine.init(window.LEXICON_WORDS);
  fillIcons(); applyTheme(); applyReading(); renderWords();
  $('btnChanges').setAttribute('aria-pressed', S.changes);
  $('url').focus();
  window.__wt = { load, render, S, A, get mode() { return mode; }, setLens, setMode, cache };
})();
