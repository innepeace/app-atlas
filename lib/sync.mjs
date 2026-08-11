// 同步核心（纯逻辑）：判定各屏收集后 App 源码是否已变更（陈旧 stale）。
// git 副作用通过 changedFilesSince 注入，本模块保持可测、无 I/O。

// 从 registry 抽取需要检查的屏：收集中 / 已收集（未收集屏无收集基准，跳过）。
export function collectSyncTargets(reg) {
  const targets = [];
  for (const m of (reg.modules || [])) {
    for (const s of (m.screens || [])) {
      if (s.status === 'collecting' || s.status === 'collected') {
        targets.push({ id: s.id, status: s.status, sourceRev: s.sourceRev });
      }
    }
  }
  return targets;
}

// 判定陈旧。
// - screens: [{ id, status, sourceRev, files: [] }]
// - currentRev: App 仓库当前 HEAD
// - changedFilesSince(rev, files) => string[] 自 rev 起有变更的文件子集
// 返回：[{ id, stale, changed: [] }]，已跳过 uncollected / 无 sourceRev 的屏。
export function detectStale({ screens, currentRev, changedFilesSince }) {
  const results = [];
  for (const s of (screens || [])) {
    if (s.status === 'uncollected') continue;
    if (!s.sourceRev) continue;
    if (s.sourceRev === currentRev) {
      results.push({ id: s.id, stale: false, changed: [] });
      continue;
    }
    const changed = changedFilesSince(s.sourceRev, s.files || []) || [];
    results.push({ id: s.id, stale: changed.length > 0, changed });
  }
  return results;
}

// 按 detectStale 结果更新 registry 的 stale 字段，返回新对象（不改原对象）。
export function applyStale(reg, results) {
  const map = new Map(results.map(r => [r.id, r.stale]));
  return {
    ...reg,
    modules: (reg.modules || []).map(m => ({
      ...m,
      screens: (m.screens || []).map(s =>
        map.has(s.id) ? { ...s, stale: map.get(s.id) } : s),
    })),
  };
}
