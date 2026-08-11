// lib/screenshot.mjs
export function screenshotDataPath(module, screenId, viewId) {
  return `data/modules/${module}/screens/${screenId}/screenshot-${viewId}.png`;
}

export function viewImageFile(module, screenId, viewId) {
  return `../data/modules/${module}/screens/${screenId}/screenshot-${viewId}.png`;
}

// 无 views 但有旧 image 时，合成一个 default view，保证渲染统一走 views
export function normalizeViews(manifest) {
  if (Array.isArray(manifest?.views) && manifest.views.length) return manifest.views;
  if (manifest?.image && manifest.image.file) {
    return [{ id: 'default', label: '默认', file: manifest.image.file, kind: manifest.image.kind, hotspots: manifest.hotspots || [] }];
  }
  return [];
}

function sortById(list) {
  return [...(list || [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function sameHotspots(a, b) {
  const A = sortById(a), B = sortById(b);
  if (A.length !== B.length) return false;
  return JSON.stringify(A) === JSON.stringify(B);
}

export function upsertView(manifest, view) {
  const views = [...(manifest.views || [])];
  const byId = views.findIndex(v => v.id === view.id);
  if (byId >= 0) {
    views[byId] = view;
    return { manifest: { ...manifest, views }, action: 'replaced' };
  }
  const dupIdx = views.findIndex(v => sameHotspots(v.hotspots, view.hotspots));
  if (dupIdx >= 0) {
    views[dupIdx] = { ...views[dupIdx], file: view.file, label: view.label, kind: view.kind };
    return { manifest: { ...manifest, views }, action: 'deduped' };
  }
  views.push(view);
  return { manifest: { ...manifest, views }, action: 'added' };
}

export function removeView(manifest, viewId) {
  const views = manifest.views || [];
  const target = views.find(v => v.id === viewId);
  if (!target) return { manifest: { ...manifest }, removedFile: null };
  return { manifest: { ...manifest, views: views.filter(v => v.id !== viewId) }, removedFile: target.file };
}

// 通用二级 tab 分组：把 views 按 `tab` 字段聚成组，每组内是该 tab 的多个「变体」截图。
// - 有 `tab` 的 view 归入同名 tab 组（按首次出现顺序）。
// - 无 `tab` 的 view 各自成为独立单变体组 → 向后兼容旧的扁平切换器行为。
// - 每组的主图（primary）：组内标了 `primary:true` 的 view，否则取第一个。
// 返回 [{ key, tab, hasTab, variants:[view...], primary:view }]
export function groupViews(views) {
  const groups = [];
  const byKey = new Map();
  for (const v of (views || [])) {
    const hasTab = v.tab != null && v.tab !== '';
    const key = hasTab ? `tab:${v.tab}` : `solo:${v.id}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, tab: hasTab ? v.tab : (v.label || v.id), hasTab, variants: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.variants.push(v);
  }
  for (const g of groups) g.primary = g.variants.find(v => v.primary) || g.variants[0];
  return groups;
}

// 整屏默认激活的 view：显式 primary 优先，否则第一个。
export function defaultView(views) {
  const list = views || [];
  return list.find(v => v.primary) || list[0] || null;
}
