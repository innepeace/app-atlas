import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistry, validateManifest } from '../lib/validate.mjs';

test('合法 registry 无错误', () => {
  const reg = {
    schemaVersion: 1,
    roots: [{ kind: 'tab', label: '交易', screen: 's1' }],
    modules: [{ id: 'm', screens: [{ id: 's1', status: 'uncollected' }] }],
  };
  assert.deepEqual(validateRegistry(reg), []);
});

test('schemaVersion 错误被报出', () => {
  const reg = { schemaVersion: 2, roots: [], modules: [] };
  assert.ok(validateRegistry(reg).some(e => e.includes('schemaVersion')));
});

test('root 指向不存在的 screen 被报出', () => {
  const reg = {
    schemaVersion: 1,
    roots: [{ kind: 'tab', label: '交易', screen: 'missing' }],
    modules: [{ id: 'm', screens: [] }],
  };
  assert.ok(validateRegistry(reg).some(e => e.includes('missing')));
});

test('非法 status 被报出', () => {
  const reg = {
    schemaVersion: 1,
    roots: [],
    modules: [{ id: 'm', screens: [{ id: 's1', status: 'bogus' }] }],
  };
  assert.ok(validateRegistry(reg).some(e => e.includes('status')));
});

test('screen id 重复被报出', () => {
  const reg = {
    schemaVersion: 1,
    roots: [],
    modules: [{ id: 'm', screens: [
      { id: 'dup', status: 'uncollected' },
      { id: 'dup', status: 'uncollected' },
    ] }],
  };
  assert.ok(validateRegistry(reg).some(e => e.includes('重复')));
});

test('roots 为非数组（如对象）时不抛异常，返回数组，包含错误', () => {
  const reg = {
    schemaVersion: 1,
    roots: {},  // 非数组对象
    modules: [],
  };
  const errors = validateRegistry(reg);
  assert.ok(Array.isArray(errors));
  assert.ok(errors.some(e => e.includes('registry.roots 必须为数组')));
});

// ── T6 manifest 校验 ──
const baseManifest = () => ({
  screen: { id: 'order-entry', module: 'HSAROrder', title: '下单页' },
  layout: [{ type: 'button', id: 'btn-submit', label: '提交' }],
  hotspots: [{ id: 'btn-submit', label: '提交', kind: 'popup',
    branches: [{ condition: '已登录', label: '提交', goto: 'order-confirm' }] }],
  links: { prev: [], next: ['order-confirm'] },
  status: 'collected',
});

test('合法 manifest 无错误', () => {
  const ids = new Set(['order-entry', 'order-confirm']);
  assert.deepEqual(validateManifest(baseManifest(), ids), []);
});

test('分支 goto 指向不存在的屏被报出', () => {
  const mf = baseManifest();
  mf.hotspots[0].branches[0].goto = 'ghost';
  const errs = validateManifest(mf, new Set(['order-entry', 'order-confirm']));
  assert.ok(errs.some(e => e.includes('ghost')));
});

test('links.next 指向不存在的屏被报出', () => {
  const mf = baseManifest();
  const errs = validateManifest(mf, new Set(['order-entry']));
  assert.ok(errs.some(e => e.includes('order-confirm')));
});

test('image.file 不在图片集合中被报出', () => {
  const mf = baseManifest();
  mf.image = { file: 'web/assets/screens/x.png', asset: 'x' };
  const ids = new Set(['order-entry', 'order-confirm']);
  const errs = validateManifest(mf, ids, new Set());
  assert.ok(errs.some(e => e.includes('x.png')));
});
