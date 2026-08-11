// test/screenshot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenshotDataPath, viewImageFile, normalizeViews, sameHotspots, upsertView, removeView, groupViews, defaultView } from '../lib/screenshot.mjs';

test('screenshotDataPath / viewImageFile 拼路径', () => {
  assert.equal(screenshotDataPath('trade', 'tradeCenterShow', 'default'),
    'data/modules/trade/screens/tradeCenterShow/screenshot-default.png');
  assert.equal(viewImageFile('portfolio', 'portfolioMain', 'main'),
    '../data/modules/portfolio/screens/portfolioMain/screenshot-main.png');
});

test('normalizeViews 从旧 image+hotspots 合成 default view', () => {
  const mf = { image: { file: '../x.png', kind: 'device' }, hotspots: [{ id: 'a', label: 'A' }] };
  const views = normalizeViews(mf);
  assert.equal(views.length, 1);
  assert.equal(views[0].id, 'default');
  assert.equal(views[0].file, '../x.png');
  assert.equal(views[0].hotspots.length, 1);
});

test('normalizeViews 无任何图返回空', () => {
  assert.deepEqual(normalizeViews({ layout: [] }), []);
});

test('sameHotspots 顺序无关的深比较', () => {
  const a = [{ id: 'x', label: 'X', rect: { x: 1 } }, { id: 'y', label: 'Y' }];
  const b = [{ id: 'y', label: 'Y' }, { id: 'x', label: 'X', rect: { x: 1 } }];
  assert.equal(sameHotspots(a, b), true);
  assert.equal(sameHotspots(a, [{ id: 'x', label: 'Z' }]), false);
});

test('upsertView 新 id 追加', () => {
  const { manifest, action } = upsertView({ views: [] }, { id: 'v1', label: 'V1', file: 'a.png', hotspots: [] });
  assert.equal(action, 'added');
  assert.equal(manifest.views.length, 1);
});

test('upsertView 同 id 覆盖', () => {
  const base = { views: [{ id: 'v1', label: '旧', file: 'old.png', hotspots: [] }] };
  const { manifest, action } = upsertView(base, { id: 'v1', label: '新', file: 'new.png', hotspots: [] });
  assert.equal(action, 'replaced');
  assert.equal(manifest.views.length, 1);
  assert.equal(manifest.views[0].file, 'new.png');
  assert.equal(base.views[0].file, 'old.png'); // 不改入参
});

test('upsertView 热区完全一致则去重（换图不新增）', () => {
  const hs = [{ id: 'a', label: 'A', rect: { x: 1 } }];
  const base = { views: [{ id: 'old', label: '旧', file: 'old.png', hotspots: hs }] };
  const { manifest, action } = upsertView(base, { id: 'new', label: '新', file: 'new.png', hotspots: hs });
  assert.equal(action, 'deduped');
  assert.equal(manifest.views.length, 1);
  assert.equal(manifest.views[0].file, 'new.png'); // 用新图替换
});

test('removeView 删除并返回被删 file', () => {
  const base = { views: [{ id: 'v1', file: 'a.png', hotspots: [] }, { id: 'v2', file: 'b.png', hotspots: [] }] };
  const { manifest, removedFile } = removeView(base, 'v1');
  assert.equal(removedFile, 'a.png');
  assert.equal(manifest.views.length, 1);
  assert.equal(manifest.views[0].id, 'v2');
});

test('removeView 不存在返回 null', () => {
  assert.equal(removeView({ views: [] }, 'nope').removedFile, null);
});

test('groupViews 按 tab 分组：同 tab 归一组，无 tab 各自成单组', () => {
  const groups = groupViews([
    { id: 'q-kline', tab: 'Quotes', label: 'K-Line', primary: true },
    { id: 'q-trades', tab: 'Quotes', label: 'Trades' },
    { id: 'options', tab: 'Options', label: 'Options' },
    { id: 'loose' },
  ]);
  assert.equal(groups.length, 3);                 // Quotes / Options / loose(单)
  assert.equal(groups[0].tab, 'Quotes');
  assert.equal(groups[0].variants.length, 2);
  assert.equal(groups[0].primary.id, 'q-kline');  // primary 命中
  assert.equal(groups[0].hasTab, true);
  assert.equal(groups[1].variants.length, 1);
  assert.equal(groups[2].hasTab, false);          // 无 tab
  assert.equal(groups[2].tab, 'loose');           // 无 tab → 用 label/id
});

test('groupViews 组内无 primary 时取第一个变体为主图', () => {
  const [g] = groupViews([
    { id: 'a', tab: 'T', label: 'A' },
    { id: 'b', tab: 'T', label: 'B' },
  ]);
  assert.equal(g.primary.id, 'a');
});

test('defaultView：显式 primary 优先，否则第一个', () => {
  assert.equal(defaultView([{ id: 'a' }, { id: 'b', primary: true }]).id, 'b');
  assert.equal(defaultView([{ id: 'a' }, { id: 'b' }]).id, 'a');
  assert.equal(defaultView([]), null);
});
