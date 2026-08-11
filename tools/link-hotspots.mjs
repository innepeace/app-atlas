#!/usr/bin/env node
/**
 * tools/link-hotspots.mjs
 * 
 * 自动将未关联的 hotspot 添加为 layout block（或其 children），
 * 使线框图中每个 hotspot 都有对应可点击的 block。
 * 
 * 策略：
 * 1. 如果 hotspot.id 能通过前缀匹配到某个 layout block（如 "nav-back" 匹配 "nav"），
 *    则作为该 block 的 child 插入。
 * 2. 如果匹配不到，追加到 layout 末尾作为独立 block。
 * 3. block 的 type 根据 hotspot.kind 推断：navigate→button, action→button, 其他→button。
 * 4. block 的 label 取 hotspot.label，note 留空。
 * 
 * 用法: node tools/link-hotspots.mjs [--write]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const DRY_RUN = !process.argv.includes('--write');

function collectBlockIds(blocks) {
  const ids = new Set();
  for (const b of (blocks || [])) {
    if (b.id) ids.add(b.id);
    if (b.children) collectBlockIds(b.children).forEach(id => ids.add(id));
  }
  return ids;
}

function findBestParent(layout, hotspotId) {
  // 策略1: hotspot id 是某 block id 的前缀+后缀（如 "nav-education" 前缀是 "nav"）
  const parts = hotspotId.split('-');
  for (let len = parts.length - 1; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('-');
    const found = layout.find(b => b.id === prefix);
    if (found) return found;
  }
  
  // 策略2: hotspot id 的前缀是某 block id 的前缀（如 "listing-row" → block "listing-card" 共享 "listing"）
  for (let len = parts.length - 1; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('-');
    const found = layout.find(b => b.id && b.id.startsWith(prefix + '-'));
    if (found) return found;
    // 也检查 block id 以 prefix 开头
    const found2 = layout.find(b => b.id && b.id.startsWith(prefix));
    if (found2 && found2.id !== hotspotId) return found2;
  }
  
  // 策略3: 按类型关键词匹配
  const id = hotspotId.toLowerCase();
  if (id.startsWith('nav-') || (id.startsWith('btn-') && (id.includes('search') || id.includes('menu') || id.includes('back')))) {
    const nav = layout.find(b => b.type === 'navbar' || b.id === 'nav');
    if (nav) return nav;
  }
  if (id.startsWith('cell-') || id.startsWith('row-')) {
    const list = layout.find(b => b.type === 'list' || b.id?.includes('list'));
    if (list) return list;
  }
  if (id.startsWith('tab') || id.startsWith('seg')) {
    const seg = layout.find(b => b.type === 'segment' || b.type === 'tabbar');
    if (seg) return seg;
  }
  if (id.includes('refresh') || id.includes('empty')) {
    // 找最近的 list block
    const list = layout.find(b => b.type === 'list');
    if (list) return list;
  }
  
  return null; // 追加到顶层
}

function inferBlockType(hotspot) {
  const kind = hotspot.kind || '';
  const id = hotspot.id || '';
  
  if (id.includes('input') || id.includes('price') || id.includes('count') || id.includes('search-input')) return 'input';
  if (id.includes('cell') || id.includes('row')) return 'cell';
  if (id.includes('tab') || id.includes('seg') || id.includes('direction') || id.includes('toggle')) return 'segment';
  if (id.includes('dialog') || id.includes('confirm') || id.includes('alert')) return 'dialog';
  if (id.includes('list') || id.includes('refresh')) return 'list';
  return 'button';
}

function processManifest(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const hotspots = data.hotspots || [];
  const layout = data.layout || [];
  
  if (hotspots.length === 0 || layout.length === 0) return null;
  
  const existingIds = collectBlockIds(layout);
  const unlinked = hotspots.filter(h => !existingIds.has(h.id) && !h.block);
  
  if (unlinked.length === 0) return null;
  
  let added = 0;
  for (const h of unlinked) {
    const newBlock = {
      type: inferBlockType(h),
      id: h.id,
      label: h.label || h.id,
    };
    // 只在有有意义的 note 时添加
    // note 从 hotspot 的 branches 或 kind 推断
    if (h.branches && h.branches.length > 0) {
      const targets = h.branches.filter(b => b.goto).map(b => b.goto);
      if (targets.length > 0) newBlock.note = `→ ${targets.join(', ')}`;
    }
    
    const parent = findBestParent(layout, h.id);
    if (parent) {
      if (!parent.children) parent.children = [];
      // 避免重复
      if (!parent.children.some(c => c.id === h.id)) {
        parent.children.push(newBlock);
        added++;
      }
    } else {
      // 追加到顶层 layout
      layout.push(newBlock);
      added++;
    }
  }
  
  if (added === 0) return null;
  
  data.layout = layout;
  return { data, added, total: unlinked.length };
}

// Main
const files = execSync('find data/modules -name manifest.json', { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

let totalFiles = 0, totalAdded = 0;
const results = [];

for (const f of files) {
  const fullPath = path.join(ROOT, f);
  const result = processManifest(fullPath);
  if (result) {
    totalFiles++;
    totalAdded += result.added;
    const screenId = f.split('/').slice(-2)[0];
    results.push({ screenId, added: result.added });
    
    if (!DRY_RUN) {
      writeFileSync(fullPath, JSON.stringify(result.data, null, 2) + '\n');
    }
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`线框图 hotspot→block 关联报告`);
console.log(`${'='.repeat(50)}`);
console.log(`处理 manifest: ${files.length} 个`);
console.log(`需要补充 block: ${totalFiles} 个屏`);
console.log(`新增 block 总数: ${totalAdded}`);
console.log();

if (results.length <= 30) {
  results.forEach(r => console.log(`  ${r.screenId}: +${r.added} blocks`));
} else {
  results.slice(0, 15).forEach(r => console.log(`  ${r.screenId}: +${r.added} blocks`));
  console.log(`  ... 还有 ${results.length - 15} 个屏`);
}

if (DRY_RUN) {
  console.log(`\n⚡ 干跑模式。加 --write 写回文件。`);
} else {
  console.log(`\n✅ 已写回 ${totalFiles} 个 manifest 文件。`);
}
