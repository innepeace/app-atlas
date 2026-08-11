// 同步 CLI：对照 App 源码仓库，检测各已收集屏的源码是否已变更（陈旧），
// 并可将 stale 标记写回 data/registry.json。
//
// 用法：
//   node tools/sync.mjs                 # 干跑：仅报告陈旧屏，不写文件
//   node tools/sync.mjs --write         # 把 stale 标记写回 registry.json
//   node tools/sync.mjs --app <path>    # 指定 App 源码仓库路径（默认 ../fix）
//
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { detectStale, applyStale, collectSyncTargets } from '../lib/sync.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const write = args.includes('--write');
const appIdx = args.indexOf('--app');
const here = dirname(fileURLToPath(import.meta.url));
const appRepo = appIdx >= 0 && args[appIdx + 1]
  ? args[appIdx + 1]
  : join(here, '..', '..', 'fix');

const regPath = join(root, 'data/registry.json');
if (!existsSync(regPath)) {
  console.error('未找到 data/registry.json');
  process.exit(1);
}
if (!existsSync(join(appRepo, '.git'))) {
  console.error(`App 源码仓库不存在或非 git 仓库：${appRepo}`);
  console.error('用 --app <path> 指定正确路径。');
  process.exit(1);
}

const reg = JSON.parse(readFileSync(regPath, 'utf8'));

// 收集需检查的屏（收集中 / 已收集），并补上 manifest 里的 source.files / source.rev
const modulesDir = join(root, 'data/modules');
const manifestBy = new Map(); // screenId -> { files, rev }
if (existsSync(modulesDir)) {
  for (const mod of readdirSync(modulesDir)) {
    const screensDir = join(modulesDir, mod, 'screens');
    if (!existsSync(screensDir)) continue;
    for (const sid of readdirSync(screensDir)) {
      const mfPath = join(screensDir, sid, 'manifest.json');
      if (!existsSync(mfPath) || !statSync(mfPath).isFile()) continue;
      const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
      const src = mf.source || {};
      manifestBy.set(sid, { files: src.files || [], rev: src.rev || null });
    }
  }
}

const targets = collectSyncTargets(reg).map(t => {
  const mf = manifestBy.get(t.id);
  return {
    ...t,
    // manifest 的 source.rev 优先（更精确到该屏收集时点），回退 registry.sourceRev
    sourceRev: (mf && mf.rev) || t.sourceRev,
    files: (mf && mf.files) || [],
  };
});

function git(...gitArgs) {
  return execFileSync('git', ['-C', appRepo, ...gitArgs], { encoding: 'utf8' });
}
const currentRev = git('rev-parse', 'HEAD').trim();

// 注入 git：返回自 rev 起有变更的文件子集
function changedFilesSince(rev, files) {
  if (!files.length) return [];
  let out = '';
  try {
    out = git('log', '--name-only', '--pretty=format:', `${rev}..HEAD`, '--', ...files);
  } catch {
    // rev 不在该仓库（可能记录了错误的 rev）→ 视为无法判定，不误报陈旧
    return [];
  }
  const touched = new Set(out.split('\n').map(l => l.trim()).filter(Boolean));
  return files.filter(f => touched.has(f));
}

const results = detectStale({ screens: targets, currentRev, changedFilesSince });
const staleOnes = results.filter(r => r.stale);
const missingSource = targets.filter(t => !t.files.length);

console.log(`App HEAD: ${currentRev}`);
console.log(`检查 ${targets.length} 个已收集/收集中屏，陈旧 ${staleOnes.length} 个。`);
if (missingSource.length) {
  console.log(`\n⚠ ${missingSource.length} 个屏无 source.files，无法判定（视为非陈旧）：`);
  for (const t of missingSource) console.log(`  - ${t.id}`);
}
if (staleOnes.length) {
  console.log('\n陈旧屏（收集后源码已变更）：');
  for (const r of staleOnes) {
    console.log(`  ⚠ ${r.id}`);
    for (const f of r.changed) console.log(`      ~ ${f}`);
  }
} else {
  console.log('\n所有已收集屏均为最新。');
}

if (write) {
  const next = applyStale(reg, results);
  next.generatedAt = new Date().toISOString();
  writeFileSync(regPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`\n已写回 ${regPath}（更新 ${results.length} 屏 stale 标记）。`);
} else {
  console.log('\n（干跑模式，未写文件；加 --write 以写回 registry.json）');
}
