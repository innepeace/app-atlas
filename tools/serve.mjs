// tools/serve.mjs
// 本地开发服务：托管静态页 + /api/status + /api/collect（服务端 spawn claude）。
// 用法: node tools/serve.mjs [port]   仅监听 127.0.0.1。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, rmSync, openSync, closeSync, mkdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mimeFor, safeResolve, buildCollectPrompt } from '../lib/serve-core.mjs';
import { removeView } from '../lib/screenshot.mjs';
import { readConfig, writeConfig, getSourceProject } from '../lib/config.mjs';

function detectClaude() {
  try { execFileSync('claude', ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

// 默认实现：真正 spawn claude -p，流式回调
function defaultSpawnClaude(prompt, onData, onEnd) {
  const cwd = path.resolve(fileURLToPath(import.meta.url), '../..');
  const sourceDir = getSourceProject();
  if (!sourceDir) {
    onData('[错误] 源码项目路径未配置或不存在，请先在 Web 界面配置或编辑 atlas.config.json\n');
    onEnd(1);
    return;
  }
  const devNull = openSync('/dev/null', 'r');
  const child = spawn('claude', [
    '-p', prompt,
    '--verbose',
    '--permission-mode', 'bypassPermissions',
    '--add-dir', sourceDir,
    '--output-format', 'stream-json'
  ], { cwd, stdio: [devNull, 'pipe', 'pipe'] });

  // stream-json 格式：每行是一个 JSON 对象，提取文本内容实时转发
  let buffer = '';
  child.stdout.on('data', d => {
    buffer += d.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 最后一个可能不完整
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        // 提取 assistant 消息中的文本内容
        if (obj.type === 'assistant' && obj.message?.content) {
          for (const block of obj.message.content) {
            if (block.type === 'text' && block.text) {
              onData(block.text);
            }
          }
        }
        // content_block_delta: 流式文本片段
        if (obj.type === 'content_block_delta' && obj.delta?.text) {
          onData(obj.delta.text);
        }
        // result 类型（最终输出）
        if (obj.type === 'result' && obj.result) {
          onData(obj.result);
        }
      } catch {
        // 非 JSON 行直接转发
        onData(line + '\n');
      }
    }
  });
  child.stderr.on('data', d => onData(d.toString()));
  child.on('close', code => {
    // 处理剩余 buffer
    if (buffer.trim()) {
      try {
        const obj = JSON.parse(buffer);
        if (obj.type === 'result' && obj.result) onData(obj.result);
        else if (obj.type === 'assistant' && obj.message?.content) {
          for (const block of obj.message.content) {
            if (block.type === 'text' && block.text) onData(block.text);
          }
        }
      } catch { onData(buffer); }
    }
    try { closeSync(devNull); } catch {}
    onEnd(code ?? 0);
  });
  child.on('error', () => { try { closeSync(devNull); } catch {} onEnd(1); });
}

// 默认实现：从 manifest 删 view + 删磁盘图片
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function makeDefaultDeleteView(root) {
  return (module, screenId, viewId) => {
    if (!SAFE_ID.test(module || '') || !SAFE_ID.test(screenId || '') || !SAFE_ID.test(viewId || '')) {
      return { ok: false, error: '非法参数' };
    }
    const mfPath = path.join(root, `data/modules/${module}/screens/${screenId}/manifest.json`);
    if (!existsSync(mfPath)) return { ok: false, error: 'manifest 不存在' };
    const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
    const { manifest, removedFile } = removeView(mf, viewId);
    if (!removedFile) return { ok: false, error: 'view 不存在' };
    const rootAbs = path.resolve(root);
    const imgAbs = path.resolve(root, 'web', removedFile); // file 相对 web/，实际指向兄弟目录 data/
    if (imgAbs !== rootAbs && !imgAbs.startsWith(rootAbs + path.sep)) {
      return { ok: false, error: 'file 路径越界' }; // 不写盘、不删，避免越界删除
    }
    writeFileSync(mfPath, JSON.stringify(manifest, null, 2) + '\n');
    if (existsSync(imgAbs)) rmSync(imgAbs);
    return { ok: true };
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => resolve(b));
  });
}

// 自动将 manifest.hotspots 中有固定位置含义的热区匹配到 view.hotspots
// 排除纯手势类热区（下拉刷新、上拉加载等无固定坐标的交互）
const GESTURE_PATTERNS = /pull[-_]?refresh|load[-_]?more|swipe|pan[-_]?gesture|long[-_]?press/i;
function autoMatchHotspots(manifest) {
  const hotspots = manifest.hotspots || [];
  if (!hotspots.length) return [];

  // 收集 layout 中所有 block id，用于判断热区是否有对应的可见 UI 块
  const layoutIds = new Set();
  function walkLayout(blocks) {
    for (const b of blocks || []) {
      if (b.id) layoutIds.add(b.id);
      if (b.children) walkLayout(b.children);
    }
  }
  walkLayout(manifest.layout);

  const matched = [];
  for (const hs of hotspots) {
    // 跳过纯手势热区
    if (GESTURE_PATTERNS.test(hs.id)) continue;
    // 热区在 layout 中有对应块，说明是可见 UI 元素
    if (layoutIds.has(hs.id)) {
      matched.push({ id: hs.id, label: hs.label });
    }
  }
  return matched;
}

export function createServer({ root, claudeAvailable, spawnClaude = defaultSpawnClaude, deleteView }) {
  const doDelete = deleteView || makeDefaultDeleteView(root);
  return http.createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0];

    if (url === '/api/status') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      const sourceProject = getSourceProject();
      res.end(JSON.stringify({ claude: !!claudeAvailable, sourceProject: sourceProject || null }));
      return;
    }

    // GET /api/config — 返回当前配置
    if (url === '/api/config' && req.method === 'GET') {
      const cfg = readConfig();
      const valid = !!getSourceProject();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ...cfg, valid }));
      return;
    }

    // POST /api/config — 更新配置（仅接受 sourceProject）
    if (url === '/api/config' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const payload = JSON.parse(body);
        const { sourceProject } = payload;
        if (!sourceProject || typeof sourceProject !== 'string') {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: '请提供 sourceProject 路径' }));
          return;
        }
        const trimmed = sourceProject.trim();
        if (!existsSync(trimmed)) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: `路径不存在: ${trimmed}` }));
          return;
        }
        writeConfig({ sourceProject: trimmed });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, sourceProject: trimmed }));
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    if (url === '/api/collect' && req.method === 'POST') {
      if (!claudeAvailable) {
        res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('此环境未配置收集能力');
        return;
      }
      let payload = {};
      try { payload = JSON.parse(await readBody(req) || '{}'); } catch {}
      const prompt = buildCollectPrompt({ query: payload.query || '', module: payload.module || '', screenId: payload.screenId || '' });
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' });
      spawnClaude(prompt, (chunk) => res.write(chunk), () => res.end());
      return;
    }

    if (url === '/api/view' && req.method === 'DELETE') {
      let payload = {};
      try { payload = JSON.parse(await readBody(req) || '{}'); } catch {}
      const result = doDelete(payload.module, payload.screenId, payload.viewId);
      res.writeHead(result.ok ? 200 : 400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }

    if (url === '/api/upload-screenshot' && req.method === 'POST') {
      // 接收 base64 图片数据，保存到对应屏幕目录
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const { screenId, imageData } = payload; // imageData = base64 encoded PNG
          if (!screenId || !imageData) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: '缺少 screenId 或 imageData' }));
            return;
          }
          if (!SAFE_ID.test(screenId)) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: '非法 screenId' }));
            return;
          }
          // 从 registry 找到 module
          const regPath = path.join(root, 'data/registry.json');
          const registry = JSON.parse(readFileSync(regPath, 'utf8'));
          let moduleId = null;
          for (const mod of registry.modules) {
            if (mod.screens.some(s => s.id === screenId)) { moduleId = mod.id; break; }
          }
          if (!moduleId) {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: '未找到该屏所属模块' }));
            return;
          }
          // 保存图片
          const imgDir = path.join(root, 'web/assets/screens', screenId);
          mkdirSync(imgDir, { recursive: true });
          const imgFileName = `screenshot-default.png`;
          const imgPath = path.join(imgDir, imgFileName);
          const buffer = Buffer.from(imageData, 'base64');
          writeFileSync(imgPath, buffer);
          // 更新 manifest
          const mfPath = path.join(root, `data/modules/${moduleId}/screens/${screenId}/manifest.json`);
          if (existsSync(mfPath)) {
            const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
            const relFile = `web/assets/screens/${screenId}/${imgFileName}`;
            if (!mf.image) mf.image = {};
            mf.image.file = relFile;
            if (!mf.views || mf.views.length === 0) {
              mf.views = [{ id: 'default', tab: 'Default', label: 'Default', primary: true, kind: 'device', file: relFile, hotspots: [] }];
            }
            // 自动匹配热区到 view：从 manifest.hotspots 中挑选有固定位置的热区
            const viewObj = mf.views.find(v => v.id === 'default') || mf.views[0];
            if (viewObj && (!viewObj.hotspots || viewObj.hotspots.length === 0)) {
              viewObj.hotspots = autoMatchHotspots(mf);
            }
            writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n');
          }
          // 更新 registry hasImage
          for (const mod of registry.modules) {
            const scr = mod.screens.find(s => s.id === screenId);
            if (scr) { scr.hasImage = true; break; }
          }
          writeFileSync(regPath, JSON.stringify(registry, null, 2) + '\n');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, file: `web/assets/screens/${screenId}/${imgFileName}` }));
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // 静态文件
    const abs = safeResolve(root, url);
    if (!abs) { res.writeHead(400); res.end('bad path'); return; }
    try {
      const data = await readFile(abs);
      res.writeHead(200, { 'content-type': mimeFor(abs) });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
}

// 直接运行时启动
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(fileURLToPath(import.meta.url), '../..');
  const port = Number(process.argv[2]) || 8080;
  const claudeAvailable = detectClaude();
  const sourceProject = getSourceProject();
  createServer({ root, claudeAvailable }).listen(port, '0.0.0.0', () => {
    console.log(`Atlas 本地服务: http://127.0.0.1:${port}/  (claude 收集能力: ${claudeAvailable ? '可用' : '不可用，仅搜索'})`);
    if (sourceProject) {
      console.log(`源码项目: ${sourceProject}`);
    } else {
      console.log(`⚠️  源码项目路径未配置，请打开 http://127.0.0.1:${port}/web/ 在页面中配置，或手动编辑 atlas.config.json`);
    }
  });
}
