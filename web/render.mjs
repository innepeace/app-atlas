import { STATUS_LABEL } from '../lib/schema.mjs';
import { NAV_GROUP_ID, TAB_ORDER, TAB_ENTRIES, tabOf } from './nav-config.mjs';
import { normalizeViews, groupViews, defaultView } from '../lib/screenshot.mjs';

export function coveragePct(coverage) {
  if (!coverage) return 0;
  const total = Number(coverage.total) || 0;
  const collected = Number(coverage.collected) || 0;
  if (total <= 0) return 0;
  const pct = Math.round((collected / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderModule(m) {
  const pct = coveragePct(m.coverage);
  const screens = (m.screens || []).map(s => `
    <li class="nav-screen status-${esc(s.status)}${s.stale ? ' is-stale' : ''}" data-screen="${esc(s.id)}">
      <span class="screen-title">${esc(s.title)}</span>
      ${s.stale ? '<span class="screen-stale" title="收集后 App 源码已变更，需重新核对">源码已变</span>' : ''}
      <span class="screen-status">${esc(STATUS_LABEL[s.status] || s.status)}</span>
    </li>`).join('');
  return `
    <details class="nav-module" open>
      <summary>
        <span class="mod-name">${esc(m.name || m.id)}</span>
        <span class="mod-bar"><i style="width:${pct}%"></i></span>
        <span class="mod-pct">${pct}%</span>
      </summary>
      <ul>${screens}</ul>
    </details>`;
}

function findScreenInModules(modules, id) {
  for (const m of modules) {
    const s = (m.screens || []).find(x => x.id === id);
    if (s) return s;
  }
  return null;
}

// 「导航入口」组：从 TAB_ENTRIES 合成，引用各自真实屏；这些屏同时仍显示在原模块分组内。
function renderEntryGroup(allModules) {
  const screens = TAB_ENTRIES.map(e => {
    const real = findScreenInModules(allModules, e.screen);
    return {
      id: e.screen,
      title: e.title || (real && real.title) || e.screen,
      status: real ? real.status : 'uncollected',
    };
  });
  const collected = screens.filter(s => s.status === 'collected').length;
  const entryModule = { id: '__entry__', name: 'Bottom Tabs', screens, coverage: { total: screens.length, collected } };
  return `
    <section class="nav-group nav-group--entry">
      <h2 class="group-title">Bottom Tabs (${screens.length})</h2>
      ${renderModule(entryModule)}
    </section>`;
}

export function renderNavTree(registry) {
  const allModules = registry?.modules || [];

  const navBlock = renderEntryGroup(allModules);

  const rest = allModules.filter(m => m.id !== NAV_GROUP_ID);
  const byTab = new Map();
  for (const m of rest) {
    const key = tabOf(m.id);
    if (!byTab.has(key)) byTab.set(key, []);
    byTab.get(key).push(m);
  }

  const tabBlocks = TAB_ORDER.map(({ key, label }) => {
    const mods = byTab.get(key);
    if (!mods || mods.length === 0) return '';
    return `
      <section class="nav-group" data-tab="${esc(key)}">
        <h2 class="group-title">${esc(label)}</h2>
        ${mods.map(renderModule).join('')}
      </section>`;
  }).join('');

  return `<nav class="nav-tree">${navBlock}${tabBlocks}</nav>`;
}

const BLOCK_CLASS = {
  navbar: 'wf-navbar', tabbar: 'wf-tabbar', segment: 'wf-segment',
  list: 'wf-list', cell: 'wf-cell', card: 'wf-card', input: 'wf-input',
  button: 'wf-button', image: 'wf-image', 'toast-anchor': 'wf-toast',
  spacer: 'wf-spacer', banner: 'wf-banner', selector: 'wf-selector',
  toolbar: 'wf-toolbar', header: 'wf-header',
};

export function renderLayoutBlock(block, blockHotspotMap = {}) {
  const cls = BLOCK_CLASS[block.type] || 'wf-generic';
  const note = block.note ? `<span class="wf-note">${esc(block.note)}</span>` : '';
  const comp = block.component
    ? `<span class="wf-comp" title="复用组件 ${esc(block.component)}">⧉ ${esc(block.component)}</span>`
    : '';
  const hs = blockHotspotMap[block.id];               // 该块关联的热区（免坐标：块本身即热区）
  const clickable = (block.goto || hs) ? ' wf-clickable' : '';
  const gotoAttr = block.goto ? ` data-goto="${esc(block.goto)}"` : '';
  const gotoTag = block.goto ? `<span class="wf-goto" title="进入 ${esc(block.goto)}">↗</span>` : '';
  const hsAttr = hs ? ` data-hotspot="${esc(hs.id)}"` : '';
  const multi = hs && (hs.branches || []).length > 1;
  const hsTag = hs
    ? `<span class="wf-hotspot-tag" title="热区：${esc(hs.label)}">◉${multi ? '<i class="tag-multi">多分支</i>' : ''}</span>`
    : '';
  const kids = Array.isArray(block.children) && block.children.length
    ? `<div class="wf-children">${block.children.map(c => renderLayoutBlock(c, blockHotspotMap)).join('')}</div>`
    : '';
  return `<div class="wf-block ${cls}${clickable}" data-block="${esc(block.id)}"${block.component ? ` data-component="${esc(block.component)}"` : ''}${gotoAttr}${hsAttr}>
    <span class="wf-label">${esc(block.label ?? '')}</span>${comp}${gotoTag}${hsTag}${note}
    ${kids}
  </div>`;
}

// 由 hotspots 中带 `block` 字段者构建 { blockId: hotspot } 映射，供线框图块关联热区。
export function buildBlockHotspotMap(hotspots) {
  const map = {};
  for (const h of (hotspots || [])) if (h.block) map[h.block] = h;
  return map;
}

export function renderWireframe(manifest, blockHotspotMap = {}) {
  const blocks = (manifest.layout || []).map(b => renderLayoutBlock(b, blockHotspotMap)).join('');
  return `<div class="wireframe">${blocks}</div>`;
}

function rectStyle(r) {
  if (!r) return '';
  const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return `left:${n(r.x)}%;top:${n(r.y)}%;width:${n(r.w)}%;height:${n(r.h)}%;`;
}

export function renderHotspots(manifest) {
  return (manifest.hotspots || []).map(h => {
    const multi = (h.branches || []).length > 1;
    const positioned = h.rect ? ' is-positioned' : '';
    return `<button class="hotspot${multi ? ' has-branches' : ''}${positioned}"
      style="${rectStyle(h.rect)}"
      data-hotspot="${esc(h.id)}" data-kind="${esc(h.kind || '')}"
      title="${esc(h.label)}"><span class="hotspot-tag">${esc(h.label)}${multi ? '<i class="tag-multi">多分支</i>' : ''}</span></button>`;
  }).join('');
}

export function renderBranchPopup(hotspot) {
  const items = (hotspot.branches || []).map(b => `
    <li><button class="branch" data-goto="${esc(b.goto)}">
      <span class="branch-cond">${esc(b.condition || '默认')}</span>
      <span class="branch-label">${esc(b.label)}</span>
    </button></li>`).join('');
  return `<div class="popup-mask"><div class="popup">
    <h3>${esc(hotspot.label)} · 选择下一步</h3>
    <ul class="branch-list">${items}</ul>
    <button class="popup-close">关闭</button>
  </div></div>`;
}

function renderLinks(label, ids) {
  if (!ids || !ids.length) return '';
  const chips = ids.map(id => `<button class="crumb" data-goto="${esc(id)}">${esc(id)}</button>`).join('');
  return `<div class="link-row"><span class="link-label">${label}</span>${chips}</div>`;
}

export function renderLogicPanel({ contentHtml, links, status }) {
  if (status === 'uncollected') {
    return `<div class="logic-empty">未收集 / 未整理</div>`;
  }
  const prev = renderLinks('← 前', (links || {}).prev);
  const next = renderLinks('后 →', (links || {}).next);
  return `<div class="logic-search">
    <input id="logic-search-input" type="search" placeholder="在本页业务描述内搜索…" autocomplete="off" />
    <span class="logic-search-count" aria-hidden="true"></span>
    <button class="logic-search-nav" type="button" data-dir="prev" title="上一个">↑</button>
    <button class="logic-search-nav" type="button" data-dir="next" title="下一个">↓</button>
  </div>
  <article class="logic-body">
    ${prev}
    <div class="markdown">${contentHtml || '<p class="hint">未整理</p>'}</div>
    ${next}
  </article>`;
}

// 无固定坐标（无 rect）的热区：在截图/线框旁边列成可点击清单。
export function renderHotspotAside(hotspots) {
  if (!hotspots || !hotspots.length) return '';
  const items = hotspots.map(h => {
    const multi = (h.branches || []).length > 1;
    return `<button class="hotspot hotspot-aside${multi ? ' has-branches' : ''}"
      data-hotspot="${esc(h.id)}" data-kind="${esc(h.kind || '')}"
      title="${esc(h.label)}">${esc(h.label)}${multi ? '<i class="tag-multi">多分支</i>' : ''}</button>`;
  }).join('');
  return `<aside class="hotspot-aside-list">
    <div class="aside-title">其他入口（截图无固定位置）</div>
    ${items}
  </aside>`;
}

export function imgSrc(file) {
  return file.startsWith('.') || file.startsWith('/') ? file : './' + file.replace(/^web\//, '');
}

// 二级 tab 切换器：
//  第一行 .tab-row  —— 每个 tab 一个 .tab-group 芯片；主图组带「主」角标，多变体组带数量角标。
//  第二行 .variant-row —— 仅当当前 tab 有多张变体截图时出现，逐张列出，明确「同一 tab 下的不同截图」。
// 无 `tab` 字段的旧数据：每个 view 各自成单组，退化为原扁平切换器（向后兼容）。
function renderViewSwitcher(views, activeId) {
  if (!views || views.length <= 1) return '';
  const groups = groupViews(views);
  const active = views.find(v => v.id === activeId) || defaultView(views);
  const activeGroup = groups.find(g => g.variants.some(v => v.id === active.id)) || groups[0];

  const delBtn = (id) => `<button class="view-del" type="button" data-view-del="${esc(id)}" title="删除该截图" hidden>✕</button>`;

  const tabRow = groups.map(g => {
    const isActive = g === activeGroup;
    const single = g.variants.length === 1;
    // 点 tab：激活组保持当前变体，其他组跳到该组主图
    const targetId = isActive ? active.id : g.primary.id;
    const count = single ? '' : `<i class="tab-count" title="${g.variants.length} 张截图">${g.variants.length}</i>`;
    const main = g.primary.primary ? `<i class="tab-main" title="主图">主</i>` : '';
    // 单变体组：tab 芯片本身即可删除的叶子；多变体组的删除交给变体行
    const del = single ? delBtn(g.variants[0].id) : '';
    return `<button class="tab-group${isActive ? ' active' : ''}" data-view="${esc(targetId)}" data-tab="${esc(g.tab)}">
      <span class="tab-name">${esc(g.tab)}</span>${count}${main}${del}
    </button>`;
  }).join('');

  let variantRow = '';
  if (activeGroup.variants.length > 1) {
    const chips = activeGroup.variants.map(v => `<button class="view-tab${v.id === active.id ? ' active' : ''}" data-view="${esc(v.id)}">
      <span class="view-label">${esc(v.label || v.id)}</span>${delBtn(v.id)}
    </button>`).join('');
    variantRow = `<div class="variant-row" title="${esc(activeGroup.tab)} 的多张截图">${chips}</div>`;
  }
  return `<div class="view-switcher"><div class="tab-row">${tabRow}</div>${variantRow}</div>`;
}

export function renderScreen(manifest, mode = 'wireframe', activeViewId = null) {
  const views = normalizeViews(manifest);
  const hasView = views.length > 0;

  if (mode === 'image' && hasView) {
    const active = views.find(v => v.id === activeViewId) || defaultView(views);
    const positioned = (active.hotspots || []).filter(h => h.rect);
    const unpositioned = (active.hotspots || []).filter(h => !h.rect);
    const layer = `<div class="hotspot-layer">${renderHotspots({ hotspots: positioned })}</div>`;
    const aside = renderHotspotAside(unpositioned);
    const badge = active.kind === 'device' ? '<span class="img-badge">真机图</span>' : '';
    const switcher = renderViewSwitcher(views, active.id);
    return `<div class="stage-wrap">${switcher}<div class="phone"><div class="screen-stage screen-image">
      <img src="${esc(imgSrc(active.file))}" alt="screenshot" />${badge}${layer}
    </div></div>${aside}</div>`;
  }

  if (mode === 'image' && !hasView) {
    // 无截图：显示拖拽上传区域
    return `<div class="stage-wrap"><div class="phone"><div class="screen-stage screen-drop">
      <div class="drop-zone" data-screen="${esc(manifest.screen?.id || '')}">
        <div class="drop-icon">📷</div>
        <div class="drop-text">拖拽截图到此处添加</div>
        <div class="drop-hint">支持 PNG 格式</div>
      </div>
    </div></div></div>`;
  }

  // 线框图：块↔热区关联（免坐标，块本身即热区）；仅「有 rect 且未关联块」的热区做定位叠加（向后兼容旧数据）；其余入 aside
  const all = manifest.hotspots || [];
  const blockHotspotMap = buildBlockHotspotMap(all);
  const positioned = all.filter(h => h.rect && !h.block);
  const unpositioned = all.filter(h => !h.rect && !h.block);
  const layer = `<div class="hotspot-layer">${renderHotspots({ hotspots: positioned })}</div>`;
  const aside = renderHotspotAside(unpositioned);
  return `<div class="stage-wrap"><div class="phone"><div class="screen-stage screen-wire">
    ${renderWireframe(manifest, blockHotspotMap)}${layer}
  </div></div>${aside}</div>`;
}
