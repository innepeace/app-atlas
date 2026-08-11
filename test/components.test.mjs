import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findComponent, componentsForType, applyComponent, validateComponentRefs } from '../lib/components.mjs';

const catalog = {
  components: [
    { id: 'stock-quote-cell', type: 'cell', label: '<name> <code>', desc: '行情单元格' },
    { id: 'main-tabbar', type: 'tabbar', label: 'A · B · C', desc: '底部 Tab' },
  ],
};

test('findComponent 按 id 取组件', () => {
  assert.equal(findComponent(catalog, 'main-tabbar').type, 'tabbar');
  assert.equal(findComponent(catalog, 'nope'), null);
  assert.equal(findComponent(null, 'x'), null);
});

test('componentsForType 按类型筛选', () => {
  assert.equal(componentsForType(catalog, 'cell').length, 1);
  assert.equal(componentsForType(catalog, 'navbar').length, 0);
});

test('applyComponent 用目录补全缺失字段，block 显式字段优先', () => {
  const merged = applyComponent({ id: 'c1', component: 'stock-quote-cell', label: '自定义' }, catalog);
  assert.equal(merged.type, 'cell');
  assert.equal(merged.label, '自定义');
  assert.equal(merged.note, '行情单元格');
  assert.equal(merged._component, 'stock-quote-cell');
});

test('applyComponent 无 component 引用时原样返回', () => {
  const b = { id: 'c2', type: 'button', label: 'x' };
  assert.deepEqual(applyComponent(b, catalog), { ...b });
});

test('validateComponentRefs 报出未知组件引用', () => {
  const errs = validateComponentRefs({ layout: [
    { id: 'ok', component: 'main-tabbar' },
    { id: 'bad', component: 'ghost' },
  ] }, catalog);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /ghost/);
});
