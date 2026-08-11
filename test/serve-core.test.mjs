import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mimeFor, safeResolve, buildCollectPrompt } from '../lib/serve-core.mjs';
import path from 'node:path';

test('mimeFor 常见类型', () => {
  assert.equal(mimeFor('a.html'), 'text/html; charset=utf-8');
  assert.equal(mimeFor('a.js'), 'text/javascript; charset=utf-8');
  assert.equal(mimeFor('a.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(mimeFor('a.json'), 'application/json; charset=utf-8');
  assert.equal(mimeFor('a.css'), 'text/css; charset=utf-8');
  assert.equal(mimeFor('a.png'), 'image/png');
  assert.equal(mimeFor('a.zzz'), 'application/octet-stream');
});

test('safeResolve 根路径归一到 index', () => {
  const root = '/srv/atlas';
  assert.equal(safeResolve(root, '/'), path.join(root, 'web/index.html'));
});

test('safeResolve 允许 root 内路径', () => {
  const root = '/srv/atlas';
  assert.equal(safeResolve(root, '/web/app.js'), path.join(root, 'web/app.js'));
  assert.equal(safeResolve(root, '/data/registry.json'), path.join(root, 'data/registry.json'));
});

test('safeResolve 拦截目录穿越', () => {
  assert.equal(safeResolve('/srv/atlas', '/../../etc/passwd'), null);
  assert.equal(safeResolve('/srv/atlas', '/web/../../secret'), null);
});

test('buildCollectPrompt 含关键收集步骤与目标', () => {
  const p = buildCollectPrompt({ query: '订单摘要刷新', module: '', screenId: '' });
  assert.match(p, /订单摘要刷新/);
  assert.match(p, /Atlas/);
  assert.match(p, /spec\.md/);
  assert.match(p, /logic\.md/);
});
