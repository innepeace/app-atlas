import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderNavTree, coveragePct,
  renderLayoutBlock, renderWireframe,
  renderHotspots, renderBranchPopup,
  renderLogicPanel, renderScreen,
} from '../web/render.mjs';

const reg = {
  roots: [{ kind: 'tab', label: '交易', screen: 's1' }],
  modules: [{
    id: 'trade', name: '交易', coverage: { total: 2, collected: 1, collecting: 0, uncollected: 1 },
    screens: [
      { id: 's1', title: '下单页', status: 'collected' },
      { id: 's2', title: '确认页', status: 'uncollected' },
    ],
  }],
};

test('coveragePct 计算百分比', () => {
  assert.equal(coveragePct({ total: 2, collected: 1 }), 50);
  assert.equal(coveragePct({ total: 0, collected: 0 }), 0);
});

test('renderNavTree 含模块名与屏标题', () => {
  const html = renderNavTree(reg);
  assert.ok(html.includes('交易'));
  assert.ok(html.includes('下单页'));
  assert.ok(html.includes('确认页'));
});

test('renderNavTree 给每屏带 data-screen 供点击', () => {
  const html = renderNavTree(reg);
  assert.ok(html.includes('data-screen="s1"'));
  assert.ok(html.includes('data-screen="s2"'));
});

test('renderNavTree 未收集屏标未收集', () => {
  const html = renderNavTree(reg);
  assert.match(html, /确认页[\s\S]*未收集/);
});

test('renderNavTree 陈旧屏带 stale 徽标，非陈旧屏不带', () => {
  const html = renderNavTree({
    modules: [{
      id: 'm', name: 'M', coverage: { total: 2, collected: 2 },
      screens: [
        { id: 'a', title: '陈旧屏', status: 'collected', stale: true },
        { id: 'b', title: '正常屏', status: 'collected', stale: false },
      ],
    }],
  });
  assert.ok(html.includes('is-stale'));
  assert.match(html, /陈旧屏[\s\S]*源码已变/);
  // 正常屏行不应含 stale 标记
  const rows = html.split('data-screen=');
  const normalRow = rows.find(r => r.includes('正常屏'));
  assert.ok(!normalRow.includes('is-stale'));
});

test('renderNavTree 转义屏幕标题与 data-screen 防止 XSS', () => {
  const html = renderNavTree({
    modules: [{
      id: 'xss',
      name: '安全',
      coverage: { total: 1, collected: 1 },
      screens: [{
        id: '"><img src=x onerror=alert(1)>',
        title: '<script>alert(1)</script>',
        status: 'collected',
      }],
    }],
  });

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
});

test('renderNavTree 转义单引号', () => {
  const html = renderNavTree({
    modules: [{
      id: 'quote',
      name: "Bob's Module",
      coverage: { total: 1, collected: 1 },
      screens: [],
    }],
  });

  assert.ok(!html.includes("Bob's Module"));
  assert.ok(html.includes('Bob&#39;s Module'));
});

test('coveragePct 对缺失、越界与非法 total 安全兜底', () => {
  assert.equal(coveragePct({ total: 2 }), 0);
  assert.equal(coveragePct({ total: 2, collected: 5 }), 100);
  assert.equal(coveragePct({ total: 0, collected: 0 }), 0);
  assert.equal(coveragePct(undefined), 0);
});

test('renderNavTree 对空 registry 安全返回导航容器', () => {
  assert.doesNotThrow(() => renderNavTree(undefined));
  assert.ok(renderNavTree(undefined).includes('nav-tree'));
});

test('renderNavTree 导航入口分组置顶，从 TAB_ENTRIES 合成引用真实屏', () => {
  const html = renderNavTree({
    modules: [
      { id: 'trade', name: '交易', coverage: { total: 1, collected: 0 }, screens: [{ id: 't1', title: '下单', status: 'uncollected' }] },
      { id: 'market', name: '行情', coverage: { total: 1, collected: 1 }, screens: [{ id: 'marketMain', title: '行情首页', status: 'collected' }] },
      { id: 'watchlist', name: '自选', coverage: { total: 1, collected: 1 }, screens: [{ id: 'watchlistMain', title: '自选首页', status: 'collected' }] },
    ],
  });
  assert.ok(html.includes('nav-group--entry'));
  // 6 条 TAB_ENTRIES → 导航入口 (6)
  assert.ok(html.includes('导航入口 (6)'));
  // 引用真实屏 id，可点击跳转（data-screen 指向真实屏）
  assert.ok(html.includes('data-screen="watchlistMain"'));
  assert.ok(html.includes('data-screen="marketMain"'));
  // 覆盖展示名
  assert.ok(html.includes('Watchlist 自选'));
  // 置顶
  assert.ok(html.indexOf('导航入口') < html.indexOf('交易'));
  // 真实屏仍保留在原模块分组（watchlistMain 在导航入口与自选模块各出现一次）
  const occurrences = html.split('data-screen="watchlistMain"').length - 1;
  assert.ok(occurrences >= 2);
});

test('renderNavTree 按 Tab 分组并输出组标题', () => {
  const html = renderNavTree({
    modules: [
      { id: 'trade', name: '交易', coverage: { total: 1, collected: 0 }, screens: [] },
      { id: 'market', name: '行情', coverage: { total: 1, collected: 0 }, screens: [] },
    ],
  });
  assert.ok(html.includes('data-tab="market"'));
  assert.ok(html.includes('data-tab="trade"'));
  assert.match(html, /class="group-title">行情/);
  assert.ok(html.indexOf('data-tab="market"') < html.indexOf('data-tab="trade"'));
});

test('renderNavTree 未映射模块归入其他分组', () => {
  const html = renderNavTree({
    modules: [{ id: 'zzzUnknown', name: '未知', coverage: { total: 1, collected: 0 }, screens: [] }],
  });
  assert.ok(html.includes('data-tab="other"'));
  assert.match(html, /其他（未归类）/);
});

test('renderNavTree 空分组不渲染标题', () => {
  const html = renderNavTree({
    modules: [{ id: 'trade', name: '交易', coverage: { total: 1, collected: 0 }, screens: [] }],
  });
  assert.ok(!html.includes('data-tab="market"'));
  assert.ok(!html.includes('data-tab="other"'));
});

// ── T7 线框渲染 ──
test('renderLayoutBlock 按 type 输出对应 class', () => {
  const html = renderLayoutBlock({ type: 'button', id: 'b1', label: '买入' });
  assert.ok(html.includes('wf-button'));
  assert.ok(html.includes('买入'));
  assert.ok(html.includes('data-block="b1"'));
});

test('未知 type 回退为通用块', () => {
  const html = renderLayoutBlock({ type: 'weird', id: 'x', label: 'X' });
  assert.ok(html.includes('wf-generic'));
});

test('renderWireframe 顺序渲染所有块', () => {
  const mf = { layout: [
    { type: 'navbar', id: 'n', label: '下单' },
    { type: 'button', id: 'b', label: '提交' },
  ] };
  const html = renderWireframe(mf);
  assert.ok(html.indexOf('下单') < html.indexOf('提交'));
});

test('renderLayoutBlock 转义 label 与 note 防 XSS', () => {
  const html = renderLayoutBlock({ type: 'button', id: 'x', label: '<b>x</b>', note: '<i>n</i>' });
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(html.includes('&lt;i&gt;n&lt;/i&gt;'));
});

test('renderLayoutBlock 带 goto 时可点击并转义', () => {
  const html = renderLayoutBlock({ type: 'button', id: 'add', label: '＋', goto: 'watchlistAddStock' });
  assert.ok(html.includes('wf-clickable'));
  assert.ok(html.includes('data-goto="watchlistAddStock"'));
});

test('renderLayoutBlock 无 goto 时不可点击', () => {
  const html = renderLayoutBlock({ type: 'button', id: 'b', label: 'X' });
  assert.ok(!html.includes('wf-clickable'));
  assert.ok(!html.includes('data-goto'));
});

test('renderLayoutBlock goto 转义防 XSS', () => {
  const html = renderLayoutBlock({ type: 'button', id: 'b', label: 'X', goto: '"><img src=x>' });
  assert.ok(!html.includes('"><img src=x>'));
  assert.ok(html.includes('data-goto="&quot;&gt;&lt;img src=x&gt;"'));
});

// ── T8 热区 + 分支弹框 ──
const hotspotMf = {
  hotspots: [
    { id: 'btn-submit', label: '提交', kind: 'popup', branches: [
      { condition: '已登录', label: '直接提交', goto: 'order-confirm' },
      { condition: '未登录', label: '跳登录', goto: 'login' },
    ] },
    { id: 'btn-cancel', label: '取消', kind: 'navigate', branches: [
      { condition: '', label: '返回', goto: 'stock-detail' },
    ] },
  ],
};

test('renderHotspots 为每个热区输出可点击标记', () => {
  const html = renderHotspots(hotspotMf);
  assert.ok(html.includes('data-hotspot="btn-submit"'));
  assert.ok(html.includes('data-hotspot="btn-cancel"'));
});

test('多分支热区标记为 has-branches', () => {
  const html = renderHotspots(hotspotMf);
  assert.match(html, /data-hotspot="btn-submit"[^>]*has-branches|has-branches[^>]*data-hotspot="btn-submit"/);
});

test('带 rect 的热区绝对定位到百分比坐标', () => {
  const html = renderHotspots({ hotspots: [
    { id: 'p', label: 'P', rect: { x: 10, y: 20, w: 30, h: 40 }, branches: [] },
  ] });
  assert.ok(html.includes('is-positioned'));
  assert.ok(html.includes('left:10%;top:20%;width:30%;height:40%;'));
});

test('无 rect 的热区不含定位样式', () => {
  const html = renderHotspots({ hotspots: [{ id: 'q', label: 'Q', branches: [] }] });
  assert.ok(!html.includes('is-positioned'));
});

test('renderScreen 输出手机外框与热区叠加层', () => {
  const html = renderScreen(imgMf, 'image');
  assert.ok(html.includes('class="phone"'));
  assert.ok(html.includes('hotspot-layer'));
});

test('renderScreen 无 rect 的热区列在截图旁（图片模式）', () => {
  const mf = {
    image: { file: 'web/assets/x.png' },
    hotspots: [
      { id: 'positioned', label: '定位热区', rect: { x: 1, y: 1, w: 1, h: 1 }, branches: [] },
      { id: 'floating', label: '无位置入口', branches: [{ condition: '', label: '去', goto: 'target' }] },
    ],
  };
  const html = renderScreen(mf, 'image');
  assert.ok(html.includes('hotspot-aside-list'));
  assert.ok(html.includes('无位置入口'));
  assert.match(html, /hotspot-aside[^>]*data-hotspot="floating"|data-hotspot="floating"[^>]*hotspot-aside/);
  // 定位热区不进旁列表
  assert.ok(!/data-hotspot="positioned"[^>]*hotspot-aside/.test(html));
});

test('renderScreen 无 rect 多分支热区旁列表标多分支', () => {
  const mf = {
    image: { file: 'web/assets/x.png' },
    hotspots: [{ id: 'm', label: 'M', branches: [
      { condition: 'a', label: 'A', goto: 'x' },
      { condition: 'b', label: 'B', goto: 'y' },
    ] }],
  };
  const html = renderScreen(mf, 'image');
  assert.ok(html.includes('hotspot-aside-list'));
  assert.match(html, /data-hotspot="m"[^>]*has-branches|has-branches[^>]*data-hotspot="m"/);
});

test('renderScreen 全部热区有 rect 时不输出旁列表', () => {
  const mf = {
    image: { file: 'web/assets/x.png' },
    hotspots: [{ id: 'p', label: 'P', rect: { x: 1, y: 1, w: 1, h: 1 }, branches: [] }],
  };
  assert.ok(!renderScreen(mf, 'image').includes('hotspot-aside-list'));
});

test('renderBranchPopup 列出所有分支及条件', () => {
  const html = renderBranchPopup(hotspotMf.hotspots[0]);
  assert.ok(html.includes('已登录'));
  assert.ok(html.includes('未登录'));
  assert.ok(html.includes('data-goto="order-confirm"'));
  assert.ok(html.includes('data-goto="login"'));
});

// ── T9 业务逻辑面板 ──
test('renderLogicPanel 嵌入正文并渲染前后链条', () => {
  const html = renderLogicPanel({
    contentHtml: '<h2>概述</h2><p>下单</p>',
    links: { prev: ['stock-detail'], next: ['order-confirm', 'login'] },
    status: 'collected',
  });
  assert.ok(html.includes('概述'));
  assert.ok(html.includes('data-goto="stock-detail"'));
  assert.ok(html.includes('data-goto="order-confirm"'));
});

test('未收集屏显示未收集/未整理占位', () => {
  const html = renderLogicPanel({ contentHtml: '', links: {}, status: 'uncollected' });
  assert.ok(html.includes('未收集'));
});

// ── T10 线框⇄图片切换 ──
const imgMf = {
  layout: [{ type: 'button', id: 'b', label: '提交' }],
  hotspots: [{ id: 'b', label: '提交', branches: [] }],
  image: { file: 'web/assets/screens/HSAROrder/order-entry.png', asset: 'x' },
};

test('mode=wireframe 渲染线框', () => {
  assert.ok(renderScreen(imgMf, 'wireframe').includes('wireframe'));
});

test('mode=image 且有图渲染 img', () => {
  const html = renderScreen(imgMf, 'image');
  assert.ok(html.includes('<img'));
  assert.ok(html.includes('order-entry.png'));
  assert.ok(!html.includes('web/assets'));
});

test('mode=image 但无图时显示拖拽上传区域', () => {
  const noImg = { screen: { id: 'testScreen' }, layout: imgMf.layout, hotspots: imgMf.hotspots };
  assert.ok(renderScreen(noImg, 'image').includes('drop-zone'));
});

// ── Task 3b 多 view 渲染 ──
test('renderScreen 多 view：渲染切换器、active view 图与真机图角标', () => {
  const mf = { screen: { id: 's' }, layout: [], views: [
    { id: 'trending', label: 'Trending', kind: 'device',
      file: '../data/modules/m/screens/s/screenshot-trending.png',
      hotspots: [{ id: 'h1', label: '发帖', rect: { x: 10, y: 20, w: 30, h: 5 } }] },
    { id: 'latest', label: 'Latest', kind: 'device',
      file: '../data/modules/m/screens/s/screenshot-latest.png', hotspots: [] },
  ] };
  const html = renderScreen(mf, 'image');
  assert.match(html, /data-view="trending"/);
  assert.match(html, /data-view="latest"/);
  assert.match(html, /src="\.\.\/data\/modules\/m\/screens\/s\/screenshot-trending\.png"/);
  assert.match(html, /真机图/);
  assert.match(html, /data-hotspot="h1"/);           // active view 的热区
  assert.match(html, /class="view-del"[^>]*hidden/); // ✕ 默认隐藏
});

test('renderScreen 指定 activeViewId 渲染对应 view', () => {
  const mf = { screen: { id: 's' }, layout: [], views: [
    { id: 'a', label: 'A', file: '../a.png', hotspots: [] },
    { id: 'b', label: 'B', file: '../b.png', hotspots: [] },
  ] };
  const html = renderScreen(mf, 'image', 'b');
  assert.match(html, /src="\.\.\/b\.png"/);
});

test('renderViewSwitcher 二级分组：同 tab 多变体归一组 + 主图角标 + 变体行', () => {
  const mf = { screen: { id: 's' }, layout: [], views: [
    { id: 'q-kline', tab: 'Quotes', label: 'K-Line', primary: true, kind: 'device', file: '../qk.png', hotspots: [] },
    { id: 'q-trades', tab: 'Quotes', label: 'Trades', kind: 'device', file: '../qt.png', hotspots: [] },
    { id: 'options', tab: 'Options', label: 'Options', kind: 'device', file: '../op.png', hotspots: [] },
  ] };
  // 不传 activeViewId → 默认激活 primary(q-kline)，其所在 Quotes 组为 active
  const html = renderScreen(mf, 'image');
  assert.match(html, /src="\.\.\/qk\.png"/);                         // 默认展示主图
  assert.match(html, /class="tab-group active"[^>]*data-tab="Quotes"/);
  assert.match(html, /class="tab-main"/);                            // 「主」角标
  assert.match(html, /class="tab-count"[^>]*>2</);                   // Quotes 有 2 张变体
  assert.match(html, /class="variant-row"/);                         // active 组多变体 → 出现变体行
  assert.match(html, /data-view="q-trades"/);                        // 变体行含另一变体
  assert.match(html, /data-tab="Options"/);                          // 其他 tab 芯片

  // 切到单变体 tab（Options）：不出现变体行
  const html2 = renderScreen(mf, 'image', 'options');
  assert.doesNotMatch(html2, /class="variant-row"/);
  assert.match(html2, /class="tab-group active"[^>]*data-tab="Options"/);
});

test('renderScreen 旧 image 数据仍可渲染为单 view（兼容）', () => {
  const mf = { screen: { id: 's' }, layout: [], hotspots: [],
    image: { file: '../data/modules/m/screens/s/old.png', kind: 'device' } };
  const html = renderScreen(mf, 'image');
  assert.match(html, /src="\.\.\/data\/modules\/m\/screens\/s\/old\.png"/);
});
