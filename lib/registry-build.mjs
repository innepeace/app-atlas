import { STATUS } from './schema.mjs';

export function moduleOf(routeEntry) {
  const seg = (routeEntry.path || '').split('/').filter(Boolean)[0];
  return seg || 'misc';
}

export function coverageOf(screens) {
  const c = { total: screens.length, collected: 0, collecting: 0, uncollected: 0 };
  for (const s of screens) {
    if (c[s.status] !== undefined) c[s.status]++;
  }
  return c;
}

export function buildSkeleton(routeEntries, roots, groupBy = moduleOf) {
  const modules = new Map();
  const seen = new Set();
  for (const r of routeEntries) {
    if (seen.has(r.id)) {
      continue;
    }
    const modId = groupBy(r) || 'misc';
    if (!modules.has(modId)) {
      modules.set(modId, {
        id: modId, name: modId, path: '', status: STATUS.UNCOLLECTED,
        description: '', screens: [],
      });
    }
    modules.get(modId).screens.push({
      id: r.id, title: r.title, route: r.path, status: STATUS.UNCOLLECTED,
      updatedAt: null, sourceRev: null, stale: false, hasImage: false, tags: [],
    });
    seen.add(r.id);
  }
  // 保证 roots 指向的 screen 存在（未在路由中出现的入口屏，落到 nav 模块）
  const known = new Set([...modules.values()].flatMap(m => m.screens.map(s => s.id)));
  const navScreens = [];
  for (const root of roots) {
    if (root.screen && !known.has(root.screen)) {
      navScreens.push({
        id: root.screen, title: root.label, route: '', status: STATUS.UNCOLLECTED,
        updatedAt: null, sourceRev: null, stale: false, hasImage: false, tags: ['入口'],
      });
      known.add(root.screen);
    }
  }
  if (navScreens.length) {
    if (modules.has('nav')) {
      modules.get('nav').screens.push(...navScreens);
    } else {
      modules.set('nav', {
        id: 'nav', name: '导航入口', path: '', status: STATUS.UNCOLLECTED,
        description: '底部 Tab 与侧边栏入口', screens: navScreens,
      });
    }
  }
  const mods = [...modules.values()].map(m => ({ ...m, coverage: coverageOf(m.screens) }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    roots,
    modules: mods,
  };
}
