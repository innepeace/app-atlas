import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCorpus, makeSnippet } from '../lib/search.mjs';

const corpus = [
  { module: 'trade', screenId: 'tradeCenterShow', title: '交易中心', text: '点底部中间 ⊕ 弹出交易中心半屏，含账户切换条与订单摘要。' },
  { module: 'portfolio', screenId: 'portfolioMain', title: '持仓', text: '持仓页展示总资产与订单摘要，弹窗队列互斥。订单摘要再次出现。' },
];

test('空查询返回空数组', () => {
  assert.deepEqual(searchCorpus(corpus, '   '), []);
});

test('大小写不敏感子串命中并计数', () => {
  const r = searchCorpus(corpus, '订单摘要');
  assert.equal(r.length, 2);
  // portfolioMain 命中 2 次应排在前
  assert.equal(r[0].screenId, 'portfolioMain');
  assert.equal(r[0].count, 2);
  assert.equal(r[1].screenId, 'tradeCenterShow');
  assert.equal(r[1].count, 1);
});

test('片段包含命中词与前后文', () => {
  const r = searchCorpus(corpus, '半屏');
  assert.equal(r.length, 1);
  const s = r[0].snippets[0];
  assert.equal(s.hit, '半屏');
  assert.ok(s.before.includes('交易中心'));
});

test('maxSnippets 限制片段数量', () => {
  const r = searchCorpus(corpus, '订单摘要', { maxSnippets: 1 });
  const p = r.find(x => x.screenId === 'portfolioMain');
  assert.equal(p.snippets.length, 1);
  assert.equal(p.count, 2); // count 仍是总命中数
});

test('makeSnippet 截取指定上下文长度', () => {
  const s = makeSnippet('abcdefGHIJdefxyz', 6, 4, 3);
  assert.equal(s.hit, 'GHIJ');
  assert.equal(s.before, 'def');
  assert.equal(s.after, 'def');
});

import { renderResults, highlightSnippet } from '../web/search.mjs';

test('renderResults 空结果给出未整理占位并带查询', () => {
  const html = renderResults([], '不存在的词');
  assert.match(html, /未收集 \/ 未整理/);
  assert.match(html, /data-collect-query="不存在的词"/);
});

test('renderResults 列出命中屏与计数', () => {
  const html = renderResults([
    { module: 'trade', screenId: 'tradeCenterShow', title: '交易中心', count: 2,
      snippets: [{ index: 0, before: '', hit: '订单摘要', after: '再次' }] },
  ], '订单摘要');
  assert.match(html, /data-screen="tradeCenterShow"/);
  assert.match(html, /交易中心/);
  assert.match(html, /<mark[^>]*>订单摘要<\/mark>/);
});

test('highlightSnippet 转义并高亮命中词', () => {
  const html = highlightSnippet({ before: 'a<', hit: 'b', after: '>c' }, 'b');
  assert.match(html, /a&lt;/);
  assert.match(html, /<mark[^>]*>b<\/mark>/);
  assert.match(html, /&gt;c/);
});
