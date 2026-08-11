import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRoutesFile } from '../lib/routes-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sample = readFileSync(join(here, 'fixtures/Routes.sample.swift'), 'utf8');

test('解析出 3 条路由', () => {
  assert.equal(parseRoutesFile(sample).length, 3);
});

test('带注释的路由取中文标题', () => {
  const r = parseRoutesFile(sample).find(x => x.id === 'tradeOrderPost');
  assert.deepEqual(r, { id: 'tradeOrderPost', path: '/trade/order/post', title: '下单页（买入/卖出）' });
});

test('无注释的路由用 id 兜底作标题', () => {
  const r = parseRoutesFile(sample).find(x => x.id === 'noDocRoute');
  assert.equal(r.title, 'noDocRoute');
});

test('被注释掉的路由不应出现在结果中', () => {
  const content = `
/// 某个路由
static let activeRoute = Route("/active")

// static let oldRoute = Route("/old")

static let anotherRoute = Route("/another")
`;
  const result = parseRoutesFile(content);
  assert.equal(result.length, 2);
  assert.equal(result.some(x => x.id === 'oldRoute'), false);
  assert.deepEqual(result.map(x => x.id), ['activeRoute', 'anotherRoute']);
});

test('文档注释后遇到无关代码行时应断开 title 关联', () => {
  const content = `
/// 有注释的路由
static let docRoute = Route("/doc")

// 这是一些无关代码
const someVar = 42;

static let laterRoute = Route("/later")
`;
  const result = parseRoutesFile(content);
  assert.equal(result.length, 2);
  const docRoute = result.find(x => x.id === 'docRoute');
  const laterRoute = result.find(x => x.id === 'laterRoute');
  assert.deepEqual(docRoute, { id: 'docRoute', path: '/doc', title: '有注释的路由' });
  assert.deepEqual(laterRoute, { id: 'laterRoute', path: '/later', title: 'laterRoute' });
});
