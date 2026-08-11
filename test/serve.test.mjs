import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../tools/serve.mjs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';

// fetch() 会规范化 URL 里的 ..，因此穿越用例用原始 http.request 发送保留路径的请求
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: rawPath }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function listen(server) {
  return new Promise(res => server.listen(0, '127.0.0.1', () => res(server.address().port)));
}

test('GET / 返回 index.html', async () => {
  const server = createServer({ root, claudeAvailable: false });
  const port = await listen(server);
  const r = await fetch(`http://127.0.0.1:${port}/`);
  const body = await r.text();
  assert.equal(r.status, 200);
  assert.match(body, /App Atlas/);
  server.close();
});

test('GET /api/status 反映 claude 可用性', async () => {
  const server = createServer({ root, claudeAvailable: false });
  const port = await listen(server);
  const r = await fetch(`http://127.0.0.1:${port}/api/status`);
  assert.deepEqual(await r.json(), { claude: false });
  server.close();
});

test('POST /api/collect 在 claude 不可用时返回 503', async () => {
  const server = createServer({ root, claudeAvailable: false });
  const port = await listen(server);
  const r = await fetch(`http://127.0.0.1:${port}/api/collect`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'x' }),
  });
  assert.equal(r.status, 503);
  assert.match(await r.text(), /此环境未配置收集能力/);
  server.close();
});

test('POST /api/collect 可用时用注入的 spawnClaude 流式回传', async () => {
  const server = createServer({
    root, claudeAvailable: true,
    spawnClaude: (prompt, onData, onEnd) => { onData('收到：' + prompt.slice(0, 4)); onEnd(0); },
  });
  const port = await listen(server);
  const r = await fetch(`http://127.0.0.1:${port}/api/collect`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '订单摘要' }),
  });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /收到：/);
  server.close();
});

test('目录穿越被拦截', async () => {
  const server = createServer({ root, claudeAvailable: false });
  const port = await listen(server);
  const r = await rawGet(port, '/../../etc/passwd');
  assert.equal(r.status, 400);
  server.close();
});

test('DELETE /api/view 调用注入的 deleteView', async () => {
  let called = null;
  const server = createServer({
    root, claudeAvailable: false,
    deleteView: (m, s, v) => { called = { m, s, v }; return { ok: true }; },
  });
  const port = await listen(server);
  const r = await fetch(`http://127.0.0.1:${port}/api/view`, {
    method: 'DELETE', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ module: 'community', screenId: 'communityShowEnable', viewId: 'latest' }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.deepEqual(called, { m: 'community', s: 'communityShowEnable', v: 'latest' });
  server.close();
});

test('DELETE /api/view 默认实现拒绝穿越参数', async () => {
  // 不注入 deleteView，走真实 makeDefaultDeleteView：非法 module 应被 SAFE_ID 拦下
  const server = createServer({ root, claudeAvailable: false });
  const port = await listen(server);
  const r = await fetch(`http://127.0.0.1:${port}/api/view`, {
    method: 'DELETE', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ module: '../../..', screenId: 'x', viewId: 'y' }),
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, '非法参数');
  server.close();
});

test('DELETE /api/view 默认实现删除真实 ../data/ 截图 view', async () => {
  // 用临时 root 造一屏一 view，file 是 viewImageFile 产出的 ../data/... 兄弟路径；
  // 走真实 makeDefaultDeleteView，验证边界锚定 root 后能删成、manifest 更新、图片被移除。
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'atlas-del-'));
  try {
    const scrDir = path.join(tmp, 'data/modules/community/screens/homeMain');
    mkdirSync(scrDir, { recursive: true });
    const imgAbs = path.join(scrDir, 'screenshot-latest.png');
    writeFileSync(imgAbs, 'PNG');
    const mfPath = path.join(scrDir, 'manifest.json');
    writeFileSync(mfPath, JSON.stringify({
      views: [{ id: 'latest', label: 'latest', kind: 'device',
        file: '../data/modules/community/screens/homeMain/screenshot-latest.png', hotspots: [] }],
    }));
    const server = createServer({ root: tmp, claudeAvailable: false });
    const port = await listen(server);
    const r = await fetch(`http://127.0.0.1:${port}/api/view`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ module: 'community', screenId: 'homeMain', viewId: 'latest' }),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(existsSync(imgAbs), false); // 图片已删
    server.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
