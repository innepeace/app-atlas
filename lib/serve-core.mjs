import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export function mimeFor(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

export function safeResolve(root, urlPath) {
  let rel = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/web/index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.resolve(root, '.' + rel);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
  return abs;
}

export function buildCollectPrompt({ query, module, screenId }) {
  const target = screenId ? `目标屏幕 screenId=${screenId}（module=${module}）。` : '';
  return [
    `你在 App Atlas（业务地图）里执行一次"自动收集"。用户查询：「${query}」。${target}`,
    `请按以下顺序工作：`,
    `1. 先在 Atlas 已有内容里查相似/相关（其他屏 data/modules/*/screens/*/logic.md、data/components.json）。`,
    `2. 若 Atlas 无覆盖，检索 App 源码仓库的 spec.md 等，或据查询提到的信息推测所属模块。`,
    `3. 按内容检索代码，提取 UI / 业务逻辑 / 数据流，涉及后端接口用 YAPI MCP 核对字段，不臆造。`,
    `4. 按 Atlas 现有收集规范写入对应屏 logic.md，并按需更新 manifest.json；未覆盖位置留「未收集 / 未整理」占位。`,
    `5. 完成后简述改动了哪些屏。禁止自动 git commit。`,
  ].join('\n');
}
