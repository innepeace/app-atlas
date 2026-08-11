import { searchCorpus } from '../lib/search.mjs';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

export function highlightSnippet(snippet, _query) {
  return `${escHtml(snippet.before)}<mark class="gs-hit">${escHtml(snippet.hit)}</mark>${escHtml(snippet.after)}`;
}

export async function buildCorpus(registry, loadText, logicPath) {
  const jobs = [];
  for (const module of registry?.modules || []) {
    for (const screen of module.screens || []) {
      if (screen.status !== 'collected') continue;
      jobs.push((async () => {
        try {
          const text = await loadText(logicPath(module, screen.id));
          if (!text || !text.trim()) return null;
          return {
            module: module.id,
            screenId: screen.id,
            title: screen.title || screen.id,
            text,
          };
        } catch {
          return null;
        }
      })());
    }
  }

  const rows = await Promise.all(jobs);
  return rows.filter(Boolean);
}

export function renderResults(matches, query) {
  if (!matches.length) {
    const safeQuery = escHtml(query);
    return `<div class="gs-empty" data-collect-query="${safeQuery}">
      <p class="logic-empty">未收集 / 未整理</p>
      <button class="gs-collect" type="button" data-collect-query="${safeQuery}" hidden>让 Claude 收集</button>
      <p class="gs-collect-note" hidden>此环境未配置收集能力</p>
    </div>`;
  }

  const items = matches.map(match => {
    const snippets = (match.snippets || []).map(snippet => (
      `<p class="gs-snippet">…${highlightSnippet(snippet, query)}…</p>`
    )).join('');
    return `<li class="gs-result" data-screen="${escHtml(match.screenId)}" data-query="${escHtml(query)}">
      <div class="gs-result-head">
        <span class="gs-title">${escHtml(match.title)}</span>
        <span class="gs-module">${escHtml(match.module)}</span>
        <span class="gs-count">${match.count}</span>
      </div>
      ${snippets}
    </li>`;
  }).join('');

  return `<ul class="gs-list">${items}</ul>`;
}

export { searchCorpus };
