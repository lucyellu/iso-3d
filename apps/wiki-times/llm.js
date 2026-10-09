/* LLM layer: provider calls + batched paragraph rewriting + Voice (style) definitions.
   Works in the browser (BYO key, stored in localStorage) and in Node tests. */
(function (root) {
  'use strict';

  // OpenAI-compatible providers all share /v1/chat/completions; Anthropic has its own shape.
  const PROVIDERS = {
    deepseek:  { label: 'DeepSeek',  baseUrl: 'https://api.deepseek.com',            model: 'deepseek-chat' },
    openai:    { label: 'OpenAI',    baseUrl: 'https://api.openai.com',              model: 'gpt-4o-mini' },
    anthropic: { label: 'Anthropic', baseUrl: 'https://api.anthropic.com',           model: 'claude-haiku-5-5' },
    xai:       { label: 'xAI (Grok)', baseUrl: 'https://api.x.ai',                   model: 'grok-2-latest' },
    groq:      { label: 'Groq',      baseUrl: 'https://api.groq.com/openai',         model: 'openai/gpt-oss-20b' },
    cerebras:  { label: 'Cerebras',  baseUrl: 'https://api.cerebras.ai',             model: 'gpt-oss-120b' },
    nvidia:    { label: 'NVIDIA',    baseUrl: 'https://integrate.api.nvidia.com',    model: 'meta/llama-3.3-70b-instruct' },
    builtin:   { label: 'Built-in (free, fast)', baseUrl: '/ai', model: 'openai/gpt-oss-20b', local: true },
    chrome:    { label: 'On-device (Chrome, free)', baseUrl: '', model: 'gemini-nano', local: true }
  };

  // Chrome's built-in model: free, private, no key. Only counts as usable once it is already downloaded.
  async function localStatus() {
    try { return typeof LanguageModel === 'undefined' ? 'unavailable' : await LanguageModel.availability(); }
    catch (e) { return 'unavailable'; }
  }
  async function localChat(system, user) {
    const s = await LanguageModel.create({ initialPrompts: [{ role: 'system', content: system }], temperature: 0.6, topK: 20 });
    try { return String(await s.prompt(user)).trim(); } finally { s.destroy(); }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function chat(cfg, system, user, opts = {}) {
    const { maxTokens = 6000, temperature = 0.7, retries = 3, isStale } = opts;
    if (cfg.provider === 'chrome') return localChat(system, user);
    const base = (cfg.baseUrl || PROVIDERS[cfg.provider].baseUrl).replace(/\/$/, '');
    const model = cfg.model || PROVIDERS[cfg.provider].model;
    let url, headers, body;
    if (cfg.provider === 'anthropic') {
      url = `${base}/v1/messages`;
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' // required for direct browser calls
      };
      body = { model, max_tokens: maxTokens, temperature, system, messages: [{ role: 'user', content: user }] };
    } else {
      url = `${base}/v1/chat/completions`;
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` };
      body = { model, max_tokens: maxTokens, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
      if (/gpt-oss/.test(model) && ['groq', 'cerebras', 'builtin'].includes(cfg.provider)) body.reasoning_effort = 'low';
    }
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if ((r.status === 429 || r.status >= 500) && attempt < retries && !(isStale && isStale())) {
        const ra = parseFloat(r.headers.get('retry-after'));
        await sleep(Math.min(10000, Number.isFinite(ra) ? ra * 1000 + 200 : 1200 * (attempt + 1)));
        continue;
      }
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`${cfg.provider} ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      const out = cfg.provider === 'anthropic' ? j?.content?.find((c) => c.type === 'text')?.text : j?.choices?.[0]?.message?.content;
      if (!out) throw new Error(`${cfg.provider}: empty response`);
      return String(out).trim();
    }
  }

  // Pull n strings out of a model reply. Accepts a JSON array, or an object keyed "1","2",... (models do both).
  function parseArray(text, n) {
    const spans = [];
    const a = text.indexOf('['), b = text.lastIndexOf(']');
    if (a >= 0 && b > a) spans.push(text.slice(a, b + 1));
    const c = text.indexOf('{'), d = text.lastIndexOf('}');
    if (c >= 0 && d > c) spans.push(text.slice(c, d + 1));
    for (const t of spans) {
      // 2nd variant: models sometimes put raw newlines inside strings, which is invalid JSON
      for (const variant of [t, t.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).join(String.fromCharCode(92) + 'n')]) {
       try {
        let v = JSON.parse(variant);
        if (v && !Array.isArray(v) && typeof v === 'object') v = Object.keys(v).sort((x, y) => parseInt(x) - parseInt(y)).map((k) => v[k]);
        if (Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'string')) return v.map((x) => x.trim());
       } catch (e) { /* try next variant */ }
      }
    }
    return null;
  }

  const SYSTEM = 'You are a precise rewriting engine. You never add commentary. You never invent facts: every claim in the output must come from the input.';

  async function rewriteLocal(para, instruction) {
    const out = await localChat('You rewrite text. Reply with only the rewritten text, nothing else. Never add facts.',
      `${instruction}

Text:
${para}`);
    return out.replace(/^(here'?s|here is)[^:]*:\s*/i, '').trim() || para;
  }

  async function rewriteChunk(cfg, paras, instruction, isStale) {
    const numbered = paras.map((p, i) => `[${i + 1}] ${p}`).join('\n\n');
    const user = `${instruction}\n\nRewrite each numbered paragraph below. Return ONLY a JSON array of exactly ${paras.length} strings, e.g. [\"first\", \"second\"], in the same order, one per paragraph (an array, not an object). Use \\n inside a string for line breaks.\n\n${numbered}`;
    const reply = await chat(cfg, SYSTEM, user, { isStale });
    let out = parseArray(reply, paras.length);
    if (out) return out;
    if (paras.length === 1) { // JSON failed: use the text itself, unescaped, never raw JSON
      const raw = reply.replace(/^```\w*\n?|```$/g, '').replace(/^[\[{]\s*("\d+"\s*:\s*)?"?|"?\s*[\]}]$/g, '')
        .replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
      return raw ? [raw] : [paras[0]];
    }
    // array mismatch: fall back to one call per paragraph
    return Promise.all(paras.map((p) => rewriteChunk(cfg, [p], instruction, isStale).then((x) => x[0])));
  }

  // Rewrites paragraphs in parallel chunks. The first chunk is small so text appears fast;
  // onChunk(startIndex, outputs) fires as each chunk lands. Returns all outputs in order.
  async function rewriteParagraphs(cfg, paras, instruction, { firstChars = 700, chunkChars = 2200, concurrency = 3, onChunk, isStale } = {}) {
    if (cfg.provider === 'chrome') {            // small on-device model: one paragraph at a time, in order
      const out = new Array(paras.length);
      for (let i = 0; i < paras.length; i++) {
        if (isStale && isStale()) return out;   // user moved to another lens
        out[i] = await rewriteLocal(paras[i], instruction);
        if (onChunk) onChunk(i, [out[i]]);
      }
      return out;
    }
    const chunks = []; // {start, items}
    let cur = null, len = 0;
    paras.forEach((p, i) => {
      const limit = chunks.length === 0 ? firstChars : chunkChars;
      if (cur && len + p.length > limit) { chunks.push(cur); cur = null; }
      if (!cur) { cur = { start: i, items: [] }; len = 0; }
      cur.items.push(p); len += p.length;
    });
    if (cur) chunks.push(cur);
    const out = new Array(paras.length);
    let next = 0, firstErr = null;
    await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
      while (next < chunks.length) {
        if (isStale && isStale()) return;
        const c = chunks[next++];
        try {
          const res = await rewriteChunk(cfg, c.items, instruction, isStale);
          res.forEach((r, k) => { out[c.start + k] = r; });
          if (onChunk) onChunk(c.start, res);
        } catch (e) { firstErr = firstErr || e; }   // keep going: finished chunks are still shown
      }
    }));
    if (firstErr) { firstErr.partial = out; throw firstErr; }
    return out;
  }

  const GRADE_NAMES = ['kindergarten', '1st grade', '2nd grade', '3rd grade', '4th grade', '5th grade', '6th grade', '7th grade', '8th grade'];
  // Each band gets concrete limits, so the levels actually read differently (a vague "grade N" prompt does not).
  const BANDS = [
    { to: 1, rules: 'Sentences of 5 to 8 words. Only tiny everyday words a 5-year-old says (sun, plant, food, water, grow, big, little). Never use a science word: swap each one for a simple stand-in or a picture-in-words, e.g. photosynthesis = "how a plant makes its food from sunlight", volcano = "a mountain that blows out hot rock", organism = "living thing", energy = "power to move and grow". Say one idea per sentence. A short comparison to something a child knows is welcome. Drop hard details that cannot be said simply, but never state anything false.' },
    { to: 3, rules: 'Sentences of 8 to 12 words. Everyday words only. Replace every science or abstract word with a simple stand-in, and if a term is truly needed, say it once and explain it right away in plain words (for example: "photosynthesis, which is how plants make food from light"). One idea per sentence.' },
    { to: 5, rules: 'Sentences of 10 to 16 words. Common words. Keep a key term when it matters, but explain it in the same sentence in simple words. Avoid long chains of clauses.' },
    { to: 8, rules: 'Sentences up to about 20 words. Keep proper terms but briefly explain the harder ones. Plain, clear prose, like a good school textbook.' }
  ];
  function levelInstruction(g) {
    const band = BANDS.find((b) => g <= b.to);
    return `Rewrite this for ${GRADE_NAMES[g]} readers (age ${5 + g}). ${band.rules} Keep all names, numbers and true facts that fit. Keep the same number of paragraphs.`;
  }

  // Voices: stylistic lenses (not reading level).
  const VOICES = [
    { id: 'orig', label: 'Original', blurb: 'The text as written.', instruction: null },
    { id: 'eli5', label: 'ELI5', blurb: 'Explained to a curious five-year-old.',
      instruction: 'Explain it like I am five: very short sentences, concrete everyday comparisons, friendly and warm. Keep the facts correct.' },
    { id: 'greentext', label: 'Greentext', blurb: '4chan greentext.',
      instruction: 'Rewrite as a 4chan-style greentext story. EVERY line starts with ">" (no space after it), lines are short and fragmentary, deadpan and ironic, with "be me" framing where it fits and a punchline or reaction line at the end. No slurs, no hateful content. Keep the facts accurate. Separate lines with \\n.' },
    { id: 'postdoc', label: 'Postdoc', blurb: 'Dense academic prose.',
      instruction: 'Rewrite as a postdoctoral researcher would write it in a journal paper: dense, precise technical register, hedged claims, nominalizations, discipline-appropriate terminology. Keep the facts exactly.' },
    { id: 'poetic', label: 'Poetic', blurb: 'Lyrical free verse.',
      instruction: 'Rewrite as lyrical free-verse poetry: line breaks, concrete imagery, rhythm. The facts must stay recognizable. Separate lines with \\n.' },
    { id: 'noir', label: 'Noir', blurb: 'Hard-boiled detective.',
      instruction: 'Rewrite as hard-boiled noir detective narration: first person, rain-soaked similes, world-weary cynicism. Keep the facts accurate.' },
    { id: 'sports', label: 'Sportscaster', blurb: 'Breathless play-by-play.',
      instruction: 'Rewrite as breathless live sports commentary, as if every fact were a play in the deciding game. Keep the facts accurate.' },
    { id: 'bard', label: 'Shakespeare', blurb: 'Early Modern English.',
      instruction: 'Rewrite in Early Modern English in the manner of Shakespeare (thee/thou, inverted syntax, a little iambic rhythm). Keep the facts accurate.' },
    { id: 'genz', label: 'Gen Z', blurb: 'Group-chat energy.',
      instruction: 'Rewrite in casual Gen Z group-chat voice: lowercase-ish, slang used sparingly enough to stay readable, dry humor. Keep the facts accurate.' }
  ];

  root.LLM = { PROVIDERS, localStatus, chat, parseArray, rewriteParagraphs, levelInstruction, VOICES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LLM;
})(typeof window !== 'undefined' ? window : globalThis);
