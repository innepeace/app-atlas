import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSkeleton, coverageOf, moduleOf } from '../lib/registry-build.mjs';
import { validateRegistry } from '../lib/validate.mjs';

const routes = [
  { id: 'tradeOrderPost', path: '/trade/order/post', title: '下单页' },
  { id: 'tradeOrderList', path: '/trade/order/list', title: '委托列表' },
  { id: 'stockDetail', path: '/stock/detail', title: '详情页' },
];
const roots = [{ kind: 'tab', label: '交易', screen: 'tradeOrderPost' }];

test('moduleOf 取路径首段', () => {
  assert.equal(moduleOf({ path: '/trade/order/post' }), 'trade');
});

test('coverageOf 统计各状态', () => {
  const c = coverageOf([{ status: 'uncollected' }, { status: 'collected' }]);
  assert.deepEqual(c, { total: 2, collected: 1, collecting: 0, uncollected: 1 });
});

test('buildSkeleton 按模块聚合并全标未收集', () => {
  const reg = buildSkeleton(routes, roots);
  const trade = reg.modules.find(m => m.id === 'trade');
  assert.equal(trade.screens.length, 2);
  assert.ok(trade.screens.every(s => s.status === 'uncollected'));
  assert.equal(reg.schemaVersion, 1);
});

test('buildSkeleton 产物通过 validateRegistry', () => {
  const reg = buildSkeleton(routes, roots);
  assert.deepEqual(validateRegistry(reg), []);
});

test('buildSkeleton 空输入返回合规 registry', () => {
  const reg = buildSkeleton([], []);
  assert.equal(reg.schemaVersion, 1);
  assert.equal(reg.modules.length, 0);
  assert.deepEqual(validateRegistry(reg), []);
});

test('buildSkeleton 重复路由 id 去重', () => {
  const duplicateRoutes = [
    { id: 'home', path: '/home', title: '首页' },
    { id: 'home', path: '/home', title: '首页' },
    { id: 'detail', path: '/detail', title: '详情' },
  ];
  const reg = buildSkeleton(duplicateRoutes, []);
  const allScreenIds = [];
  for (const m of reg.modules) {
    for (const s of m.screens) {
      allScreenIds.push(s.id);
    }
  }
  assert.equal(allScreenIds.filter(id => id === 'home').length, 1, 'home id 应该只出现一次');
  assert.deepEqual(validateRegistry(reg), [], 'validateRegistry 应该无错误');
});

test('buildSkeleton 虚拟入口屏落入 nav 模块', () => {
  const someRoutes = [
    { id: 'trade', path: '/trade/main', title: '交易' },
  ];
  const someRoots = [
    { kind: 'tab', label: '交易', screen: 'trade' },
    { kind: 'tab', label: '发现', screen: 'discover' },
  ];
  const reg = buildSkeleton(someRoutes, someRoots);
  const navModule = reg.modules.find(m => m.id === 'nav');
  assert.ok(navModule, 'nav 模块应该存在');
  const discoverScreen = navModule.screens.find(s => s.id === 'discover');
  assert.ok(discoverScreen, 'discover 应该在 nav 模块中');
  assert.deepEqual(validateRegistry(reg), [], 'validateRegistry 应该通过，roots 指向的 screen 存在');
});

test('buildSkeleton nav 冲突追加不覆盖', () => {
  const navRoutes = [
    { id: 'navHome', path: '/nav/home', title: 'Nav 首页' },
    { id: 'navProfile', path: '/nav/profile', title: 'Nav 个人页' },
  ];
  const navRoots = [
    { kind: 'tab', label: '首页', screen: 'navHome' },
    { kind: 'tab', label: '发现', screen: 'discoverTab' },
  ];
  const reg = buildSkeleton(navRoutes, navRoots);
  const navModule = reg.modules.find(m => m.id === 'nav');
  assert.ok(navModule, 'nav 模块应该存在');
  const screenIds = navModule.screens.map(s => s.id);
  assert.ok(screenIds.includes('navHome'), 'navHome 应该在 nav 模块中');
  assert.ok(screenIds.includes('navProfile'), 'navProfile 应该在 nav 模块中');
  assert.ok(screenIds.includes('discoverTab'), 'discoverTab 虚拟入口屏应该在 nav 模块中');
  assert.equal(navModule.screens.length, 3, 'nav 模块应该包含 3 个 screen');
  assert.deepEqual(validateRegistry(reg), [], 'validateRegistry 应该通过');
});
