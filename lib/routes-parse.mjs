// 解析 Swift 路由定义文件：/// 中文注释 + static let <id> = Route("<path>")
export function parseRoutesFile(content) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let title = null;
  const docRe = /^\s*\/\/\/\s*(.+?)\s*$/;
  const declRe = /^\s*static\s+let\s+(\w+)\s*=\s*Route\("([^"]+)"\)/;
  for (const line of lines) {
    const d = line.match(docRe);
    if (d) { title = d[1]; continue; }
    const m = line.match(declRe);
    if (m) {
      out.push({ id: m[1], path: m[2], title: title || m[1] });
      title = null;
      continue;
    }
    if (line.trim() !== '') title = null; // 无关的非空代码行 → 断开 title 关联
  }
  return out;
}
