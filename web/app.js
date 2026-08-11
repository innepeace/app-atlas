import { renderNavTree, renderScreen, renderBranchPopup, renderLogicPanel } from './render.mjs';
import { buildCorpus, renderResults, searchCorpus } from './search.mjs';

let registry = null;
let currentMode = 'image';
let currentScreenId = null;
let currentViewId = null;
const historyStack = [];
let corpusPromise = null;

function syncHash() {
  const parts = [currentScreenId];
  if (currentViewId) parts.push(currentViewId);
  const hash = parts.join('/');
  if (location.hash !== '#' + hash) {
    history.replaceState(null, '', '#' + hash);
  }
}

function readHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return { screenId: null, viewId: null };
  const [screenId, viewId] = raw.split('/');
  return { screenId: screenId || null, viewId: viewId || null };
}

function updateBackBtn() {
  const btn = document.querySelector('.stage-back');
  if (btn) btn.disabled = historyStack.length === 0;
}

function goBack() {
  const prev = historyStack.pop();
  if (prev) openScreen(prev, { record: false });
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`加载失败 ${path}: ${res.status}`);
  return res.json();
}

async function loadText(path) {
  const res = await fetch(path);
  return res.ok ? res.text() : '';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]; // 去掉 data:image/png;base64, 前缀
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showHint(el, text) {
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = text;
  el.replaceChildren(p);
}

const LOGIC_W_KEY = 'atlas.logicWidth.v2';
const LOGIC_W_MIN = 240;
const LOGIC_W_MAX = 1100;

function clampLogicW(px) {
  return Math.max(LOGIC_W_MIN, Math.min(LOGIC_W_MAX, px));
}

function setupResizer() {
  const resizer = document.getElementById('resizer');
  if (!resizer) return;
  const root = document.documentElement;

  const saved = Number(localStorage.getItem(LOGIC_W_KEY));
  if (saved > 0) root.style.setProperty('--logic-w', `${clampLogicW(saved)}px`);

  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const w = clampLogicW(window.innerWidth - e.clientX - 12);
    root.style.setProperty('--logic-w', `${w}px`);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.classList.remove('resizing');
    const cur = getComputedStyle(root).getPropertyValue('--logic-w').trim();
    const px = parseInt(cur, 10);
    if (px > 0) localStorage.setItem(LOGIC_W_KEY, String(px));
  };
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    resizer.classList.add('dragging');
    document.body.classList.add('resizing');
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const low = text.toLowerCase();
  const ql = query.toLowerCase();
  let out = '', i = 0;
  for (;;) {
    const j = low.indexOf(ql, i);
    if (j < 0) { out += escHtml(text.slice(i)); break; }
    out += escHtml(text.slice(i, j)) +
      `<mark class="nav-hit">${escHtml(text.slice(j, j + query.length))}</mark>` ;
    i = j + query.length;
  }
  return out;
}

// 首次渲染后，把各级标题原始文本存入 dataset，供搜索高亮复原使用
function snapshotNavText(host) {
  host.querySelectorAll('.group-title, .mod-name, .screen-title').forEach(el => {
    el.dataset.text = el.textContent;
  });
}

function filterNav(host, rawQuery) {
  const query = rawQuery.trim();
  const ql = query.toLowerCase();
  let anyVisible = false;

  host.querySelectorAll('.nav-group').forEach(group => {
    const gEl = group.querySelector('.group-title');
    const gText = gEl ? gEl.dataset.text || gEl.textContent : '';
    const groupMatch = !!query && gText.toLowerCase().includes(ql);
    let groupHasVisible = false;

    group.querySelectorAll('.nav-module').forEach(mod => {
      const mEl = mod.querySelector('.mod-name');
      const mText = mEl ? mEl.dataset.text || mEl.textContent : '';
      const modMatch = !!query && mText.toLowerCase().includes(ql);
      let modHasVisible = false;

      mod.querySelectorAll('.nav-screen').forEach(scr => {
        const sEl = scr.querySelector('.screen-title');
        const sText = sEl ? sEl.dataset.text || sEl.textContent : '';
        const show = !query || groupMatch || modMatch || sText.toLowerCase().includes(ql);
        scr.classList.toggle('is-hidden', !show);
        if (show) modHasVisible = true;
        if (sEl) sEl.innerHTML = highlight(sText, (query && !groupMatch && !modMatch) ? query : '');
      });

      const showMod = !query || groupMatch || modMatch || modHasVisible;
      mod.classList.toggle('is-hidden', !showMod);
      if (mEl) mEl.innerHTML = highlight(mText, (query && !groupMatch) ? query : '');
      if (query && showMod) mod.open = true;
      if (showMod) groupHasVisible = true;
    });

    const showGroup = !query || groupMatch || groupHasVisible;
    group.classList.toggle('is-hidden', !showGroup);
    if (gEl) gEl.innerHTML = highlight(gText, groupMatch ? query : '');
    if (showGroup) anyVisible = true;
  });

  let empty = host.querySelector('.nav-empty');
  if (!anyVisible && query) {
    if (!empty) {
      empty = document.createElement('p');
      empty.className = 'nav-empty';
      host.appendChild(empty);
    }
    empty.textContent = `无匹配「${query}」的模块或屏幕`;
  } else if (empty) {
    empty.remove();
  }
}

function setupNavControls(host) {
  const search = document.getElementById('nav-search');
  const collapse = document.getElementById('nav-collapse');
  if (search) {
    search.addEventListener('input', () => filterNav(host, search.value));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { search.value = ''; filterNav(host, ''); }
    });
  }
  if (collapse) {
    let collapsed = false;
    collapse.addEventListener('click', () => {
      collapsed = !collapsed;
      host.querySelectorAll('.nav-module').forEach(m => { m.open = !collapsed; });
      collapse.textContent = collapsed ? '展开全部' : '收起全部';
    });
  }
}

function clearLogicHighlights(root) {
  root.querySelectorAll('mark.logic-hit').forEach(m => {
    m.replaceWith(document.createTextNode(m.textContent));
  });
  root.normalize();
}

function collectTextNodes(root) {
  const nodes = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.nodeValue && child.nodeValue.trim()) nodes.push(child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK' ||
            tag === 'INPUT' || tag === 'BUTTON' || child.namespaceURI === 'http://www.w3.org/2000/svg') {
          continue;
        }
        walk(child);
      }
    }
  };
  walk(root);
  return nodes;
}

function applyLogicHighlights(root, query) {
  const ql = query.toLowerCase();
  const hits = [];
  for (const node of collectTextNodes(root)) {
    const text = node.nodeValue;
    const low = text.toLowerCase();
    if (!low.includes(ql)) continue;
    const frag = document.createDocumentFragment();
    let i = 0;
    for (;;) {
      const j = low.indexOf(ql, i);
      if (j < 0) { frag.appendChild(document.createTextNode(text.slice(i))); break; }
      if (j > i) frag.appendChild(document.createTextNode(text.slice(i, j)));
      const mark = document.createElement('mark');
      mark.className = 'logic-hit';
      mark.textContent = text.slice(j, j + query.length);
      frag.appendChild(mark);
      hits.push(mark);
      i = j + query.length;
    }
    node.replaceWith(frag);
  }
  return hits;
}

// mermaid 在 display:none（折叠 details）里渲染会得到 0 尺寸图，故按需渲染：
// 加载时只画可见的；折叠块首次展开时再画其中未处理的。
function isInClosedDetails(el) {
  let p = el.parentElement;
  while (p) {
    if (p.tagName === 'DETAILS' && !p.open) return true;
    p = p.parentElement;
  }
  return false;
}

function setupMermaid(container) {
  if (!window.mermaid) return;
  const renderVisible = async () => {
    const nodes = Array.from(
      container.querySelectorAll('code.language-mermaid:not([data-processed]), .mermaid:not([data-processed])')
    ).filter(n => !isInClosedDetails(n));
    if (!nodes.length) return;
    try { await window.mermaid.run({ nodes }); } catch {}
    // 为渲染完的 mermaid 图添加双击放大
    nodes.forEach(n => {
      // mermaid 渲染后可能替换了原始 node，找到含 SVG 的容器
      const target = n.closest('pre') || n;
      if (target.dataset.zoomBound) return;
      target.dataset.zoomBound = '1';
      target.style.cursor = 'zoom-in';
      target.title = '双击放大流程图';
      target.addEventListener('dblclick', () => showMermaidZoom(target));
    });
  };
  renderVisible();
  container.querySelectorAll('details').forEach(d => {
    d.addEventListener('toggle', () => { if (d.open) renderVisible(); });
  });
}

function showMermaidZoom(node) {
  let svg = node.querySelector('svg') || node.closest('pre')?.querySelector('svg') || (node.tagName === 'svg' ? node : null);
  if (!svg) return;

  const mask = document.createElement('div');
  mask.className = 'mermaid-zoom-mask';
  const wrap = document.createElement('div');
  wrap.className = 'mermaid-zoom-wrap';

  // 克隆 SVG
  const cloned = svg.cloneNode(true);
  // 移除所有尺寸限制，让它尽可能大
  cloned.removeAttribute('style');
  cloned.removeAttribute('width');
  cloned.removeAttribute('height');
  cloned.setAttribute('width', '100%');
  cloned.setAttribute('height', '100%');
  cloned.style.display = 'block';

  wrap.appendChild(cloned);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'mermaid-zoom-close';
  closeBtn.textContent = '✕ 关闭';
  closeBtn.addEventListener('click', () => mask.remove());
  wrap.appendChild(closeBtn);

  mask.appendChild(wrap);
  mask.addEventListener('click', (e) => {
    if (e.target === mask) mask.remove();
  });
  document.body.appendChild(mask);

  const esc = (e) => { if (e.key === 'Escape') { mask.remove(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}

function ensureCorpus() {
  if (!corpusPromise) corpusPromise = buildCorpus(registry, loadText, logicPath);
  return corpusPromise;
}

function jumpToLogicHit(query) {
  const input = document.querySelector('#logic-search-input');
  if (!input || !query) return;
  input.value = query;
  input.dispatchEvent(new Event('input'));
}

let claudeStatus = null; // null=未探测, true/false=探测结果
async function fetchClaudeStatus() {
  if (claudeStatus !== null) return claudeStatus;
  try {
    const r = await fetch('/api/status');
    claudeStatus = r.ok ? (await r.json()).claude === true : false;
  } catch { claudeStatus = false; }
  return claudeStatus;
}

// 结果面板出现空态时：根据 status 决定显示「让 Claude 收集」按钮还是「此环境未配置收集能力」
async function gateCollectEntry(panel) {
  const btn = panel.querySelector('.gs-collect');
  const note = panel.querySelector('.gs-collect-note');
  if (!btn) return;
  const ok = await fetchClaudeStatus();
  if (ok) { btn.hidden = false; if (note) note.hidden = true; }
  else { btn.hidden = true; if (note) note.hidden = false; }

  btn.addEventListener('click', async () => {
    const query = btn.dataset.collectQuery || '';
    btn.disabled = true;
    btn.textContent = '收集中…';
    const log = document.createElement('pre');
    log.className = 'gs-collect-log';
    btn.after(log);
    try {
      const r = await fetch('/api/collect', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let fullOutput = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        fullOutput += chunk;
        log.textContent += chunk;
        log.scrollTop = log.scrollHeight;
      }
      log.textContent += '\n[收集结束]';

      // 收集完成：重新加载 registry 和语料，尝试跳转
      corpusPromise = null;
      try {
        registry = await loadJSON('../data/registry.json');
        // 刷新导航树
        const host = document.getElementById('nav-tree-host');
        if (host) {
          host.innerHTML = renderNavTree(registry);
          snapshotNavText(host);
        }

        // 策略1：从 Claude 输出中提取 screenId（它通常会提到改了哪些屏）
        let targetScreen = null;
        // 匹配常见模式：screenId、"改动了 xxx"、data/modules/.../screens/xxx/
        const screenIdPattern = /data\/modules\/[^/]+\/screens\/([^/]+)\//g;
        let m;
        const mentionedScreens = new Set();
        while ((m = screenIdPattern.exec(fullOutput)) !== null) {
          mentionedScreens.add(m[1]);
        }
        // 也匹配 "screenId: xxx" 或 "screen xxx"
        const idPattern2 = /(?:screenId|screen)[:\s=]+["']?([a-zA-Z][a-zA-Z0-9_-]+)/g;
        while ((m = idPattern2.exec(fullOutput)) !== null) {
          mentionedScreens.add(m[1]);
        }

        // 在 registry 中验证这些 screenId 存在
        const validScreens = [...mentionedScreens].filter(id => {
          for (const mod of registry.modules) {
            if (mod.screens.some(s => s.id === id)) return true;
          }
          return false;
        });

        if (validScreens.length > 0) {
          targetScreen = validScreens[0];
        }

        // 策略2：如果没从输出提取到，用全文搜索
        if (!targetScreen) {
          const corpus = await ensureCorpus();
          const matches = searchCorpus(corpus, query);
          if (matches.length > 0) {
            targetScreen = matches[0].screenId;
          }
        }

        if (targetScreen) {
          log.textContent += `\n→ 跳转到: ${targetScreen}`;
          setTimeout(() => {
            panel.hidden = true;
            openScreen(targetScreen);
            jumpToLogicHit(query);
          }, 800);
        } else {
          log.textContent += '\n（未自动匹配到结果，请在左侧导航树中查看）';
        }
      } catch (reloadErr) {
        log.textContent += `\n（刷新失败: ${reloadErr.message}）`;
      }
    } catch (e) {
      log.textContent += `\n[收集失败] ${e.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '让 Claude 收集';
    }
  }, { once: true });
}

function setupGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const panel = document.getElementById('global-search-panel');
  if (!input || !panel) return;

  let timer = null;
  const run = async () => {
    const q = input.value.trim();
    if (!q) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    const corpus = await ensureCorpus();
    const matches = searchCorpus(corpus, q);
    panel.innerHTML = renderResults(matches, q);
    panel.hidden = false;
    if (typeof gateCollectEntry === 'function') gateCollectEntry(panel);
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      panel.hidden = true;
      panel.innerHTML = '';
    }
  });

  panel.addEventListener('click', (e) => {
    const li = e.target.closest('.gs-result');
    if (!li) return;
    const id = li.dataset.screen;
    const q = li.dataset.query;
    panel.hidden = true;
    Promise.resolve(openScreen(id)).then(() => jumpToLogicHit(q));
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.global-search')) panel.hidden = true;
  });
}

function setupLogicSearch(container) {
  const input = container.querySelector('#logic-search-input');
  const root = container.querySelector('.logic-body');
  const countEl = container.querySelector('.logic-search-count');
  if (!input || !root) return;

  let hits = [];
  let active = -1;

  const setActive = (idx) => {
    if (!hits.length) return;
    if (active >= 0 && hits[active]) hits[active].classList.remove('active');
    active = ((idx % hits.length) + hits.length) % hits.length;
    const el = hits[active];
    el.classList.add('active');
    let p = el.parentElement;
    while (p && p !== root) {
      if (p.tagName === 'DETAILS') p.open = true;
      p = p.parentElement;
    }
    el.scrollIntoView({ block: 'center' });
    if (countEl) countEl.textContent = `${active + 1}/${hits.length}`;
  };

  const runSearch = () => {
    clearLogicHighlights(root);
    active = -1;
    const q = input.value.trim();
    hits = q ? applyLogicHighlights(root, q) : [];
    if (!q) { if (countEl) countEl.textContent = ''; return; }
    if (!hits.length) { if (countEl) countEl.textContent = '0/0'; return; }
    setActive(0);
  };

  input.addEventListener('input', runSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); setActive(active + (e.shiftKey ? -1 : 1)); }
    else if (e.key === 'Escape') { input.value = ''; runSearch(); }
  });
  container.querySelectorAll('.logic-search-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!hits.length) return;
      setActive(active + (btn.dataset.dir === 'prev' ? -1 : 1));
    });
  });
}

function findScreen(id) {
  for (const m of registry.modules) {
    const s = (m.screens || []).find(x => x.id === id);
    if (s) return { module: m, screen: s };
  }
  return null;
}
function manifestPath(module, id) {
  return `../data/modules/${module.id}/screens/${id}/manifest.json`;
}
function logicPath(module, id) {
  return `../data/modules/${module.id}/screens/${id}/logic.md`;
}

async function openScreen(id, { record = true } = {}) {
  const found = findScreen(id);
  const stage = document.getElementById('stage');
  const logic = document.getElementById('logic');
  if (!found) { showHint(stage, `未找到屏幕 ${id}`); return; }
  const { module, screen } = found;

  if (record && currentScreenId && currentScreenId !== id) {
    historyStack.push(currentScreenId);
  }
  if (currentScreenId !== id) currentViewId = null;
  currentScreenId = id;
  syncHash();

  // Highlight current screen in nav tree
  document.querySelectorAll('.nav-screen.is-active').forEach(el => el.classList.remove('is-active'));
  const navItem = document.querySelector(`.nav-screen[data-screen="${id}"]`);
  if (navItem) {
    navItem.classList.add('is-active');
    // Ensure parent <details> is open so the active item is visible
    const details = navItem.closest('details');
    if (details) details.open = true;
    // Scroll into view if not visible
    navItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  if (screen.status === 'uncollected') {
    stage.innerHTML = `<div class="screen-wire"><p class="logic-empty">未收集 / 未整理</p></div>`;
    logic.innerHTML = renderLogicPanel({ status: 'uncollected' });
    updateBackBtn();
    return;
  }

  let manifest;
  try { manifest = await loadJSON(manifestPath(module, id)); }
  catch { showHint(stage, '该屏 manifest 缺失'); logic.innerHTML = renderLogicPanel({ status: 'uncollected' }); return; }

  const { normalizeViews, defaultView } = await import('../lib/screenshot.mjs');
  const views = normalizeViews(manifest);
  const hasImage = views.length > 0;
  const effMode = (currentMode === 'image') ? 'image' : 'wireframe';
  const toolbar = `<div class="stage-toolbar">
    <div class="stage-toolbar-left">
      <button class="stage-back" title="返回上一步">← 返回</button>
      <button class="stage-locate" title="在左侧导航树中定位当前屏幕">⊕ 定位</button>
    </div>
    <div class="mode-toggle">
      <button data-mode="wireframe" class="${effMode === 'wireframe' ? 'active' : ''}">线框图</button>
      <button data-mode="image" class="${effMode === 'image' ? 'active' : ''}">图片</button>
    </div>
  </div>`;
  const defView = defaultView(views);
  const activeViewId = currentViewId && views.some(v => v.id === currentViewId) ? currentViewId : (defView && defView.id);
  stage.innerHTML = toolbar + renderScreen(manifest, effMode, activeViewId);
  updateBackBtn();
  stage.querySelector('.stage-back').addEventListener('click', goBack);
  stage.querySelector('.stage-locate').addEventListener('click', () => {
    const navItem = document.querySelector(`.nav-screen[data-screen="${id}"]`);
    if (navItem) {
      const details = navItem.closest('details');
      if (details) details.open = true;
      navItem.classList.add('is-active');
      navItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });

  const md = await loadText(logicPath(module, id));
  const contentHtml = md && window.marked ? window.marked.parse(md) : (md ? `<pre>${escHtml(md)}</pre>` : '');
  logic.innerHTML = renderLogicPanel({ contentHtml, links: manifest.links, status: screen.status });
  setupMermaid(logic);
  setupLogicSearch(logic);

  stage.querySelectorAll('.mode-toggle button[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      currentMode = btn.dataset.mode;
      openScreen(id, { record: false });
    });
  });

  // 拖拽上传截图
  const dropZone = stage.querySelector('.drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drop-active'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drop-active'); });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drop-active');
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) { dropZone.querySelector('.drop-text').textContent = '请拖入图片文件'; return; }
      dropZone.querySelector('.drop-text').textContent = '上传中…';
      try {
        const base64 = await fileToBase64(file);
        const r = await fetch('/api/upload-screenshot', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ screenId: dropZone.dataset.screen, imageData: base64 })
        });
        const result = await r.json();
        if (result.ok) {
          dropZone.querySelector('.drop-text').textContent = '上传成功，刷新中…';
          currentMode = 'image';
          setTimeout(() => openScreen(id, { record: false }), 500);
        } else {
          dropZone.querySelector('.drop-text').textContent = '上传失败: ' + (result.error || '未知错误');
        }
      } catch (err) {
        dropZone.querySelector('.drop-text').textContent = '上传失败: ' + err.message;
      }
    });
  }

  const activeHotspots = (effMode === 'image')
    ? ((views.find(v => v.id === activeViewId) || views[0] || {}).hotspots || []).map(vh => {
        // view.hotspots 只存 id/label/rect，需从 manifest.hotspots 合并完整数据（branches/goto）
        const full = (manifest.hotspots || []).find(mh => mh.id === vh.id);
        return full ? { ...full, ...vh } : vh;
      })
    : (manifest.hotspots || []);
  stage.querySelectorAll('.hotspot').forEach(hs => {
    hs.addEventListener('click', () => {
      const h = activeHotspots.find(x => x.id === hs.dataset.hotspot);
      if (!h) return;
      const branches = h.branches || [];
      if (branches.length > 1) {
        showPopup(h);
      } else if (branches.length === 1) {
        const branch = branches[0];
        if (branch.targetView) {
          // Switch to another view within the same screen (e.g. fullscreen, sheet overlay)
          currentViewId = branch.targetView;
          openScreen(id, { record: false });
        } else if (branch.goto) {
          openScreen(branch.goto);
        }
      }
    });
    hs.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      document.getElementById('logic').scrollTop = 0;
    });
  });

  stage.querySelectorAll('.wf-block[data-goto]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.goto) openScreen(el.dataset.goto);
    });
  });

  stage.querySelectorAll('.tab-group, .view-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.view-del')) return; // 点 ✕ 不切换
      currentViewId = tab.dataset.view;
      openScreen(id, { record: false });
    });
  });

  // ✕ 删除：仅在 serve.mjs 可用时显示；点后调 DELETE /api/view
  (async () => {
    const dels = stage.querySelectorAll('.view-del');
    if (!dels.length) return;
    let ok = false;
    try { const r = await fetch('/api/status'); ok = r.ok && (await r.json()).claude !== undefined; } catch { ok = false; }
    if (!ok) return; // 纯静态：保持隐藏，靠 CLI 删
    dels.forEach(btn => {
      btn.hidden = false;
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const viewId = btn.dataset.viewDel;
        if (!confirm(`删除截图「${viewId}」？`)) return;
        try {
          const res = await fetch('/api/view', { method: 'DELETE', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ module: found.module.id, screenId: id, viewId }) });
          if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`);
          currentViewId = null;
          openScreen(id, { record: false });
        } catch (err) { alert('删除失败：' + err.message); }
      });
    });
  })();
}

function showPopup(hotspot) {
  const wrap = document.createElement('div');
  wrap.innerHTML = renderBranchPopup(hotspot);
  document.body.appendChild(wrap);
  wrap.querySelector('.popup-close').addEventListener('click', () => wrap.remove());
  wrap.querySelector('.popup-mask').addEventListener('click', (e) => {
    if (e.target.classList.contains('popup-mask')) wrap.remove();
  });
  wrap.querySelectorAll('.branch').forEach(b => {
    b.addEventListener('click', () => {
      wrap.remove();
      const goto = b.dataset.goto;
      if (goto) openScreen(goto);
    });
  });
}

async function main() {
  setupResizer();
  const sidebar = document.getElementById('sidebar');
  const host = document.getElementById('nav-tree-host');
  try {
    registry = await loadJSON('../data/registry.json');
    if (window.mermaid) window.mermaid.initialize({ startOnLoad: false });
    host.innerHTML = renderNavTree(registry);
    snapshotNavText(host);
    setupNavControls(host);
    setupGlobalSearch();
    sidebar.addEventListener('click', (e) => {
      const li = e.target.closest('.nav-screen');
      if (!li) return;
      openScreen(li.dataset.screen);
    });
    document.getElementById('logic').addEventListener('click', (e) => {
      const b = e.target.closest('.crumb');
      if (b && b.dataset.goto) openScreen(b.dataset.goto);
    });
    const initialScreen = readHash().screenId || (registry.roots && registry.roots[0] && registry.roots[0].screen) || null;
    if (initialScreen) openScreen(initialScreen);
    setupHelpButton();
    checkSourceConfig();
  } catch (err) {
    showHint(host, err.message);
  }
}

function setupHelpButton() {
  const btn = document.getElementById('help-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const mask = document.createElement('div');
    mask.className = 'help-mask';
    mask.innerHTML = `<div class="help-dialog">
      <h2>App Atlas 使用说明</h2>
      <div class="help-content">
        <h3>这是什么？</h3>
        <p>App Atlas 是 App 的「业务地图」——可视化每一屏的 UI 结构、交互热区、业务逻辑链条与状态切换。</p>

        <h3>页面布局</h3>
        <svg class="help-svg" viewBox="0 0 560 180" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="558" height="178" rx="8" fill="#f8f9fa" stroke="#ddd"/>
          <!-- 顶栏 -->
          <rect x="1" y="1" width="558" height="30" rx="8" fill="#2f6fed" opacity="0.1" stroke="#2f6fed" stroke-opacity="0.3"/>
          <text x="12" y="20" font-size="11" fill="#2f6fed" font-weight="600">App Atlas · 业务地图</text>
          <text x="280" y="20" font-size="10" fill="#666">🔍 全局搜索</text>
          <text x="530" y="20" font-size="12" fill="#2f6fed">?</text>
          <!-- 左侧导航 -->
          <rect x="6" y="36" width="120" height="136" rx="6" fill="#fff" stroke="#e0e0e0"/>
          <text x="16" y="52" font-size="9" fill="#999">导航树</text>
          <rect x="14" y="58" width="100" height="12" rx="2" fill="#eef4ff"/>
          <text x="18" y="67" font-size="8" fill="#333">▸ trade (24屏)</text>
          <rect x="14" y="74" width="100" height="12" rx="2" fill="#eef4ff"/>
          <text x="18" y="83" font-size="8" fill="#333">▸ market (19屏)</text>
          <rect x="14" y="90" width="100" height="12" rx="2" fill="#e3f0ff" stroke="#2f6fed" stroke-width="0.5"/>
          <text x="18" y="99" font-size="8" fill="#2f6fed" font-weight="600">  下单页 ●</text>
          <rect x="14" y="106" width="100" height="12" rx="2" fill="#eef4ff"/>
          <text x="18" y="115" font-size="8" fill="#333">▸ fund (4屏)</text>
          <text x="16" y="140" font-size="8" fill="#aaa">点击切换屏幕</text>
          <!-- 中间展示区 -->
          <rect x="132" y="36" width="220" height="136" rx="6" fill="#fff" stroke="#e0e0e0"/>
          <text x="142" y="52" font-size="9" fill="#999">线框图 / 截图</text>
          <!-- 工具栏 -->
          <rect x="138" y="57" width="40" height="14" rx="3" fill="#f0f0f0" stroke="#ddd"/>
          <text x="143" y="67" font-size="7" fill="#555">← 返回</text>
          <rect x="182" y="57" width="40" height="14" rx="3" fill="#f0f0f0" stroke="#ddd"/>
          <text x="187" y="67" font-size="7" fill="#555">⊕ 定位</text>
          <rect x="252" y="57" width="40" height="14" rx="3" fill="#2f6fed" stroke="#2f6fed"/>
          <text x="255" y="67" font-size="7" fill="#fff">线框图</text>
          <rect x="296" y="57" width="30" height="14" rx="3" fill="#f0f0f0" stroke="#ddd"/>
          <text x="301" y="67" font-size="7" fill="#555">图片</text>
          <!-- 线框图示意 -->
          <rect x="140" y="78" width="200" height="18" rx="3" fill="#f7f8fa" stroke="#ccc" stroke-dasharray="2"/>
          <text x="150" y="90" font-size="8" fill="#666">navbar: ← 标题 🔍</text>
          <rect x="140" y="100" width="200" height="16" rx="3" fill="#eef4ff" stroke="#2f6fed" stroke-width="0.8" stroke-dasharray="3"/>
          <text x="150" y="111" font-size="8" fill="#2f6fed">🔵 热区: Buy Button</text>
          <rect x="140" y="120" width="200" height="16" rx="3" fill="#fef5ed" stroke="#e67e22" stroke-width="0.8"/>
          <text x="150" y="131" font-size="8" fill="#e67e22">🟠 多分支热区: Order Type</text>
          <rect x="140" y="140" width="200" height="20" rx="3" fill="#f7f8fa" stroke="#ccc" stroke-dasharray="2"/>
          <text x="150" y="153" font-size="8" fill="#666">list: 持仓列表</text>
          <!-- 右侧逻辑面板 -->
          <rect x="358" y="36" width="195" height="136" rx="6" fill="#fff" stroke="#e0e0e0"/>
          <text x="368" y="52" font-size="9" fill="#999">业务逻辑 (logic.md)</text>
          <text x="368" y="68" font-size="8" fill="#333" font-weight="600">## 概述</text>
          <text x="368" y="80" font-size="7" fill="#666">VC 类名 + 入口 + 核心交互</text>
          <text x="368" y="94" font-size="8" fill="#333" font-weight="600">## 主流程</text>
          <rect x="368" y="98" width="80" height="30" rx="3" fill="#f0f8ff" stroke="#b8d4f0"/>
          <text x="378" y="110" font-size="7" fill="#336">flowchart TD</text>
          <text x="378" y="120" font-size="7" fill="#336">  A→B→C</text>
          <text x="368" y="142" font-size="8" fill="#333" font-weight="600">## 分支逻辑</text>
          <text x="368" y="154" font-size="7" fill="#666">每个热区的触发链...</text>
          <text x="368" y="166" font-size="7" fill="#aaa">双击流程图可放大</text>
        </svg>

        <h3>热区类型</h3>
        <svg class="help-svg" viewBox="0 0 560 70" xmlns="http://www.w3.org/2000/svg">
          <!-- 蓝色虚线 -->
          <rect x="10" y="8" width="150" height="24" rx="5" fill="rgba(47,111,237,0.06)" stroke="#2f6fed" stroke-width="1.5" stroke-dasharray="4"/>
          <text x="22" y="24" font-size="9" fill="#2f6fed">普通热区（点击跳转）</text>
          <!-- 橙色实线 -->
          <rect x="180" y="8" width="160" height="24" rx="5" fill="rgba(230,126,34,0.08)" stroke="#e67e22" stroke-width="1.5"/>
          <text x="192" y="24" font-size="9" fill="#e67e22">多分支热区（选择路径）</text>
          <!-- 侧边清单 -->
          <rect x="360" y="8" width="180" height="24" rx="5" fill="#f8f9fa" stroke="#ddd"/>
          <text x="372" y="24" font-size="9" fill="#666">其他入口（手势/无固定位置）</text>
          <!-- 说明 -->
          <text x="10" y="52" font-size="9" fill="#444">点击蓝色热区 → 查看跳转目标</text>
          <text x="180" y="52" font-size="9" fill="#444">点击橙色热区 → 弹出分支选择</text>
          <text x="360" y="52" font-size="9" fill="#444">列在截图右侧的补充入口列表</text>
        </svg>

        <h3>操作指引</h3>
        <svg class="help-svg" viewBox="0 0 560 90" xmlns="http://www.w3.org/2000/svg">
          <!-- 搜索流程 -->
          <rect x="10" y="5" width="80" height="28" rx="6" fill="#f0f0f0" stroke="#ccc"/>
          <text x="20" y="23" font-size="9" fill="#333">🔍 输入关键词</text>
          <path d="M 95 19 L 115 19" stroke="#999" stroke-width="1" marker-end="url(#arrow)"/>
          <rect x="120" y="5" width="80" height="28" rx="6" fill="#eef4ff" stroke="#2f6fed" stroke-width="0.8"/>
          <text x="130" y="23" font-size="9" fill="#2f6fed">匹配结果列表</text>
          <path d="M 205 19 L 225 19" stroke="#999" stroke-width="1" marker-end="url(#arrow)"/>
          <rect x="230" y="5" width="80" height="28" rx="6" fill="#e8f5e9" stroke="#4caf50" stroke-width="0.8"/>
          <text x="243" y="23" font-size="9" fill="#388e3c">点击跳转该屏</text>
          <!-- 无结果流程 -->
          <rect x="120" y="45" width="80" height="28" rx="6" fill="#fff3e0" stroke="#ff9800" stroke-width="0.8"/>
          <text x="133" y="63" font-size="9" fill="#e65100">无结果</text>
          <path d="M 205 59 L 225 59" stroke="#999" stroke-width="1" marker-end="url(#arrow)"/>
          <rect x="230" y="45" width="120" height="28" rx="6" fill="#fce4ec" stroke="#e91e63" stroke-width="0.8"/>
          <text x="240" y="63" font-size="9" fill="#c62828">让 Claude 收集 → 自动跳转</text>
          <path d="M 160 33 L 160 45" stroke="#999" stroke-width="1" marker-end="url(#arrow)"/>
          <!-- 箭头定义 -->
          <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#999" stroke-width="1"/></marker></defs>
          <!-- 底部说明 -->
          <text x="10" y="85" font-size="8" fill="#888">💡 提示：右侧逻辑面板中的流程图可双击放大查看；按 ESC 关闭弹窗</text>
        </svg>

      </div>
      <button class="help-close">知道了</button>
    </div>`;
    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove(); });
    mask.querySelector('.help-close').addEventListener('click', () => mask.remove());
    document.body.appendChild(mask);
    const esc = (e) => { if (e.key === 'Escape') { mask.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
  });
}

async function checkSourceConfig() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) return; // 纯静态模式，无 serve.mjs
    const cfg = await r.json();
    if (cfg.valid) return; // 路径已配置且有效
    showConfigModal(cfg.sourceProject || '');
  } catch {
    // fetch 失败说明是纯静态文件服务，不显示配置提示
  }
}

function showConfigModal(currentPath) {
  const mask = document.createElement('div');
  mask.className = 'help-mask';
  mask.innerHTML = `<div class="help-dialog config-dialog">
    <h2>⚙️ 配置源码项目路径</h2>
    <div class="config-content">
      <p>App Atlas 需要知道 iOS 源码项目的本地路径，用于收集和同步业务逻辑。</p>
      <p class="config-hint">${currentPath ? `当前路径 <code>${escHtml(currentPath)}</code> 无效或不存在` : '尚未配置源码路径'}</p>
      <label class="config-label">
        源码项目绝对路径
        <input type="text" class="config-input" placeholder="/Users/xxx/project/ios-app" value="${escHtml(currentPath)}" />
      </label>
      <p class="config-example">示例: /Users/xxx/project/ios-app</p>
      <div class="config-actions">
        <button class="config-save">保存</button>
        <button class="config-skip">跳过</button>
      </div>
      <p class="config-error" hidden></p>
    </div>
  </div>`;

  const input = mask.querySelector('.config-input');
  const errEl = mask.querySelector('.config-error');
  const saveBtn = mask.querySelector('.config-save');
  const skipBtn = mask.querySelector('.config-skip');

  saveBtn.addEventListener('click', async () => {
    const val = input.value.trim();
    if (!val) { errEl.textContent = '请输入路径'; errEl.hidden = false; return; }
    saveBtn.disabled = true;
    saveBtn.textContent = '验证中…';
    errEl.hidden = true;
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceProject: val })
      });
      const result = await r.json();
      if (result.ok) {
        mask.remove();
      } else {
        errEl.textContent = result.error || '保存失败';
        errEl.hidden = false;
      }
    } catch (e) {
      errEl.textContent = '请求失败: ' + e.message;
      errEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  });

  skipBtn.addEventListener('click', () => mask.remove());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });
  document.body.appendChild(mask);
  input.focus();
}

main();

window.addEventListener('hashchange', () => {
  const { screenId } = readHash();
  if (screenId && screenId !== currentScreenId) {
    openScreen(screenId, { record: false });
  }
});
