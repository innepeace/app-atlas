// 从 .imageset/Contents.json 选一张最高分辨率的 png 文件名
export function resolveImageset(contentsJson) {
  const imgs = (contentsJson && contentsJson.images) || [];
  const byScale = { '3x': null, '2x': null, '1x': null };
  for (const img of imgs) {
    if (img.filename && byScale[img.scale] === null) byScale[img.scale] = img.filename;
  }
  return byScale['3x'] || byScale['2x'] || byScale['1x'] || null;
}
