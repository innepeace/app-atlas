import { isStatus } from './schema.mjs';

export function validateRegistry(reg) {
  const errors = [];
  if (reg.schemaVersion !== 1) errors.push('registry.schemaVersion 必须为 1');
  if (!Array.isArray(reg.roots)) errors.push('registry.roots 必须为数组');
  if (!Array.isArray(reg.modules)) {
    errors.push('registry.modules 必须为数组');
    return errors;
  }
  const ids = new Set();
  for (const m of reg.modules) {
    if (!m.id) errors.push('module 缺少 id');
    if (!Array.isArray(m.screens)) {
      errors.push(`module ${m.id} 缺少 screens 数组`);
      continue;
    }
    for (const s of m.screens) {
      if (!s.id) { errors.push(`module ${m.id} 下有 screen 缺少 id`); continue; }
      if (ids.has(s.id)) errors.push(`screen id 重复: ${s.id}`);
      ids.add(s.id);
      if (!isStatus(s.status)) errors.push(`screen ${s.id} status 非法: ${s.status}`);
    }
  }
  for (const r of (Array.isArray(reg.roots) ? reg.roots : [])) {
    if (r.screen && !ids.has(r.screen)) {
      errors.push(`root "${r.label}" 指向不存在的 screen: ${r.screen}`);
    }
  }
  return errors;
}

export function validateManifest(mf, screenIds, imageFiles) {
  const errors = [];
  const sid = mf.screen && mf.screen.id;
  if (!sid) errors.push('manifest.screen.id 缺失');
  if (!Array.isArray(mf.layout)) errors.push(`${sid}: layout 必须为数组`);
  for (const b of (mf.layout || [])) {
    if (!b.type) errors.push(`${sid}: layout 块缺少 type`);
  }
  for (const h of (mf.hotspots || [])) {
    if (!h.id) errors.push(`${sid}: hotspot 缺少 id`);
    for (const br of (h.branches || [])) {
      if (br.goto && !screenIds.has(br.goto)) {
        errors.push(`${sid}: hotspot ${h.id} 分支 goto 指向不存在的 screen: ${br.goto}`);
      }
    }
  }
  for (const key of ['prev', 'next']) {
    for (const l of ((mf.links && mf.links[key]) || [])) {
      if (!screenIds.has(l)) errors.push(`${sid}: links.${key} 指向不存在的 screen: ${l}`);
    }
  }
  if (mf.image && mf.image.file && imageFiles && !imageFiles.has(mf.image.file)) {
    errors.push(`${sid}: image.file 不存在: ${mf.image.file}`);
  }
  return errors;
}
