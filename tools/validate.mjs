import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateRegistry, validateManifest } from '../lib/validate.mjs';
import { validateComponentRefs } from '../lib/components.mjs';

const root = join(process.cwd());
const regPath = join(root, 'data/registry.json');
if (!existsSync(regPath)) {
  console.error('未找到 data/registry.json');
  process.exit(1);
}
const reg = JSON.parse(readFileSync(regPath, 'utf8'));
const errors = validateRegistry(reg);
if (errors.length) {
  console.error('registry 校验失败:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// 所有已知屏 id（供热区 goto / links 目标校验）
const screenIds = new Set();
for (const m of reg.modules) for (const s of m.screens) screenIds.add(s.id);

// 组件目录（可选）
let catalog = null;
const catPath = join(root, 'data/components.json');
if (existsSync(catPath)) catalog = JSON.parse(readFileSync(catPath, 'utf8'));

// 遍历所有 manifest 校验：字段、目标屏存在性、图片存在性、组件引用
const modulesDir = join(root, 'data/modules');
const manifestErrors = [];
let manifestCount = 0;
if (existsSync(modulesDir)) {
  for (const mod of readdirSync(modulesDir)) {
    const screensDir = join(modulesDir, mod, 'screens');
    if (!existsSync(screensDir)) continue;
    for (const sid of readdirSync(screensDir)) {
      const mfPath = join(screensDir, sid, 'manifest.json');
      if (!existsSync(mfPath) || !statSync(mfPath).isFile()) continue;
      manifestCount++;
      const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
      const imageFiles = new Set();
      if (mf.image && mf.image.file && existsSync(join(root, mf.image.file))) {
        imageFiles.add(mf.image.file);
      }
      const errs = [
        ...validateManifest(mf, screenIds, imageFiles),
        ...(catalog ? validateComponentRefs(mf, catalog) : []),
      ];
      for (const e of errs) manifestErrors.push(`${mod}/${sid}: ${e}`);
    }
  }
}
if (manifestErrors.length) {
  console.error('manifest 校验失败:');
  for (const e of manifestErrors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`registry 校验通过：${reg.modules.length} 模块，${reg.modules.reduce((n, m) => n + m.screens.length, 0)} 屏`);
console.log(`manifest 校验通过：${manifestCount} 个 manifest${catalog ? `，组件目录 ${catalog.components.length} 项` : ''}`);
