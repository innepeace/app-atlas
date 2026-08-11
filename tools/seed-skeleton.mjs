import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseRoutesFile } from '../lib/routes-parse.mjs';
import { buildSkeleton } from '../lib/registry-build.mjs';
import { validateRegistry } from '../lib/validate.mjs';

// 用法: node tools/seed-skeleton.mjs [--app-repo ../fix]
const args = process.argv.slice(2);
const appRepo = (() => {
  const i = args.indexOf('--app-repo');
  return i >= 0 ? args[i + 1] : '../fix';
})();

const routeFiles = [
  'Modules/HSARRouter/HSARRouter/Classes/Routes/Routes.swift',
  'Modules/HSARRouter/HSARRouter/Classes/Routes/Route+Service.swift',
].map(p => join(appRepo, p)).filter(existsSync);

if (!routeFiles.length) {
  console.error(`未找到路由文件，检查 --app-repo（当前 ${appRepo}）`);
  process.exit(1);
}

const routes = routeFiles.flatMap(f => parseRoutesFile(readFileSync(f, 'utf8')));
// 去重（不同文件可能重复定义同名 route）
const seen = new Set();
const uniq = routes.filter(r => (seen.has(r.id) ? false : seen.add(r.id)));

// 5 底部 Tab + 侧边栏为根（screen 用占位入口 id，收集时替换/细化）
const roots = [
  { kind: 'tab', label: '行情', screen: 'root-market' },
  { kind: 'tab', label: '交易', screen: 'root-trade' },
  { kind: 'tab', label: '资讯', screen: 'root-news' },
  { kind: 'tab', label: '社区', screen: 'root-community' },
  { kind: 'tab', label: '我的', screen: 'root-mine' },
  { kind: 'sidebar', label: '侧边栏', screen: 'root-sidemenu' },
];

const reg = buildSkeleton(uniq, roots);
const errors = validateRegistry(reg);
if (errors.length) {
  console.error('生成的 registry 校验失败:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

const out = join(process.cwd(), 'data/registry.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(reg, null, 2) + '\n', 'utf8');
console.log(`已生成 ${out}：${reg.modules.length} 模块，${uniq.length} 屏（含入口）`);
