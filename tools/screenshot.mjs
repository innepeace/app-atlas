// tools/screenshot.mjs
// 用法:
//   node tools/screenshot.mjs capture <module> <screenId> <viewId> [label]
//   node tools/screenshot.mjs remove  <module> <screenId> <viewId>
// capture: 截当前 booted 模拟器屏 -> data 目录 -> upsert 到 manifest.views（热区一致则去重）。
// remove : 删 view + 图文件。
// 仅在用户明确要求「截图 / 删截图」时由 agent 调用。
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { screenshotDataPath, viewImageFile, upsertView, removeView } from '../lib/screenshot.mjs';

const [, , cmd, module, screenId, viewId, label] = process.argv;
const manifestPath = (m, s) => `data/modules/${m}/screens/${s}/manifest.json`;

function loadManifest(p) { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; }
function saveManifest(p, mf) { writeFileSync(p, JSON.stringify(mf, null, 2) + '\n'); }

if (cmd === 'capture') {
  if (!module || !screenId || !viewId) {
    console.error('用法: node tools/screenshot.mjs capture <module> <screenId> <viewId> [label]');
    process.exit(1);
  }
  const out = screenshotDataPath(module, screenId, viewId);
  mkdirSync(dirname(out), { recursive: true });
  try {
    execFileSync('xcrun', ['simctl', 'io', 'booted', 'screenshot', out], { stdio: 'inherit' });
  } catch {
    console.error('截图失败：请确认有 booted 模拟器（xcrun simctl list devices | grep Booted）。');
    process.exit(1);
  }
  const p = manifestPath(module, screenId);
  const mf = loadManifest(p);
  if (!mf) { console.log(`已写入 ${out}（未找到 manifest，需手动补 views）`); process.exit(0); }
  const view = { id: viewId, label: label || viewId, file: viewImageFile(module, screenId, viewId), kind: 'device',
    hotspots: (mf.views && mf.views.find(v => v.id === viewId)?.hotspots) || [] };
  const { manifest, action } = upsertView(mf, view);
  saveManifest(p, manifest);
  console.log(`已写入 ${out}，manifest views: ${action}`);
} else if (cmd === 'remove') {
  if (!module || !screenId || !viewId) {
    console.error('用法: node tools/screenshot.mjs remove <module> <screenId> <viewId>');
    process.exit(1);
  }
  const p = manifestPath(module, screenId);
  const mf = loadManifest(p);
  if (!mf) { console.error(`未找到 ${p}`); process.exit(1); }
  const { manifest, removedFile } = removeView(mf, viewId);
  if (!removedFile) { console.error(`未找到 view: ${viewId}`); process.exit(1); }
  saveManifest(p, manifest);
  const abs = resolve('web', removedFile); // file 是相对 web/ 的路径
  if (existsSync(abs)) rmSync(abs);
  console.log(`已删除 view ${viewId} 及图片 ${removedFile}`);
} else {
  console.error('用法: node tools/screenshot.mjs <capture|remove> ...');
  process.exit(1);
}
