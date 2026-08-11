// 纯检索核心：仅对传入语料文本做大小写不敏感子串匹配（正文检索，与调用方约定语料只含 logic.md 正文）。

export function makeSnippet(text, index, qlen, ctx) {
  const start = Math.max(0, index - ctx);
  const end = Math.min(text.length, index + qlen + ctx);
  return {
    index,
    before: text.slice(start, index),
    hit: text.slice(index, index + qlen),
    after: text.slice(index + qlen, end),
  };
}

export function searchCorpus(corpus, query, opts = {}) {
  const ctx = Number.isFinite(opts.ctx) ? opts.ctx : 30;
  const maxSnippets = Number.isFinite(opts.maxSnippets) ? opts.maxSnippets : 3;
  const q = String(query ?? '').trim();
  if (!q) return [];
  const ql = q.toLowerCase();
  const qlen = q.length;

  const matches = [];
  for (const entry of corpus || []) {
    const text = String(entry.text ?? '');
    const low = text.toLowerCase();
    let count = 0;
    const snippets = [];
    let i = 0;
    for (;;) {
      const j = low.indexOf(ql, i);
      if (j < 0) break;
      count += 1;
      if (snippets.length < maxSnippets) snippets.push(makeSnippet(text, j, qlen, ctx));
      i = j + qlen;
    }
    if (count > 0) {
      matches.push({ module: entry.module, screenId: entry.screenId, title: entry.title, count, snippets });
    }
  }

  matches.sort((a, b) => (b.count - a.count) || (a.screenId < b.screenId ? -1 : a.screenId > b.screenId ? 1 : 0));
  return matches;
}
