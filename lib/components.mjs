// 组件目录（data/components.json）纯函数：查询、按类型检索、把组件默认值合并进 layout block。
// 浏览器与 Node 共享，无副作用。

export function findComponent(catalog, id) {
  if (!catalog || !id) return null;
  return (catalog.components || []).find(c => c.id === id) || null;
}

export function componentsForType(catalog, type) {
  if (!catalog || !type) return [];
  return (catalog.components || []).filter(c => c.type === type);
}

// block 若带 component 引用，则用目录里的默认 label/type/note 补全缺失字段；
// block 自身的显式字段优先，不被覆盖。
export function applyComponent(block, catalog) {
  const comp = block && block.component ? findComponent(catalog, block.component) : null;
  if (!comp) return { ...block };
  return {
    ...block,
    type: block.type ?? comp.type,
    label: block.label ?? comp.label,
    note: block.note ?? comp.desc,
    _component: comp.id,
  };
}

// 校验 manifest 里所有 block.component 引用都存在于目录，返回错误信息数组。
export function validateComponentRefs(manifest, catalog) {
  const errors = [];
  const known = new Set((catalog?.components || []).map(c => c.id));
  for (const block of manifest?.layout || []) {
    if (block.component && !known.has(block.component)) {
      errors.push(`block ${block.id || '?'} 引用了未知组件 ${block.component}`);
    }
  }
  return errors;
}
