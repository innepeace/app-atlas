#!/usr/bin/env python3
"""
fix-hotspot-rects.py — 像素分析 + 热区 rect.y 偏移修正

根因：AI 采集截图热区坐标时系统性将 y 值标注偏上。

修正策略：
- 状态栏占截图顶部 ~5.5%（row 0 到 ~145px on 2622px height）
- 导航栏图标（back/close）实际在 y≈7.5%-10%
- 找导航栏图标实际位置 vs manifest 标注位置，计算 delta
- 跳过 y<6% 的像素（状态栏区域），避免误检

加 --write 参数写回文件，否则干跑。
"""

import json
import sys
import glob
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow: pip3 install Pillow")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DRY_RUN = "--write" not in sys.argv

# 状态栏结束位置（百分比）—— 跳过此区域避免检测到时钟/信号图标
STATUS_BAR_END_PCT = 6.0


def find_nav_icon_center(img_path, x_range_pct):
    """
    在指定 x 范围、y=6%-14% 区域找到导航栏图标的 y 中心(%)。
    跳过状态栏（y<6%）。
    返回 y 中心百分比，找不到返回 None。
    """
    img = Image.open(img_path)
    w, h = img.size
    
    x_start = int(w * x_range_pct[0])
    x_end = int(w * x_range_pct[1])
    y_start = int(h * STATUS_BAR_END_PCT / 100)  # 跳过状态栏
    y_end = int(h * 0.14)
    
    row_data = []
    for row in range(y_start, y_end):
        count = 0
        for x in range(x_start, x_end, 2):
            p = img.getpixel((x, row))
            if p[0] < 100 and p[1] < 100 and p[2] < 100:
                count += 1
        if count >= 2:
            row_data.append(row)
    
    if not row_data:
        return None
    
    # 找连续聚集区（间隔<=6行）
    clusters = []
    cluster = [row_data[0]]
    for r in row_data[1:]:
        if r - cluster[-1] <= 6:
            cluster.append(r)
        else:
            clusters.append(cluster)
            cluster = [r]
    clusters.append(cluster)
    
    # 取跨度最大的聚集区（导航栏图标通常比零散噪点跨度大）
    valid = [c for c in clusters if (c[-1] - c[0]) >= 6]
    if not valid:
        valid = clusters
    
    best = max(valid, key=lambda c: c[-1] - c[0])
    center_row = (best[0] + best[-1]) / 2
    return center_row / h * 100


def compute_delta(img_path, view_hotspots):
    """对一个 view 计算 y 偏移 delta。"""
    # 找顶部热区作为锚点
    top_rects = [h for h in view_hotspots if h.get("rect") and h["rect"]["y"] < 15]
    if not top_rects:
        return None
    
    # 优先用 nav-back / close-button
    anchors = [h for h in top_rects if any(k in h["id"].lower() for k in ["nav-back", "close-button", "close", "nav-close"])]
    if not anchors:
        anchors = [h for h in top_rects if h["id"].lower().startswith("nav") and h["rect"]["y"] < 12]
    if not anchors:
        return None  # 没有可靠锚点则跳过
    
    anchor = anchors[0]
    r = anchor["rect"]
    labeled_center = r["y"] + r["h"] / 2
    
    # 确定搜索 x 范围
    x_center = (r["x"] + r["w"] / 2) / 100
    x_half = max(0.06, r["w"] / 200)
    x_range = (max(0, x_center - x_half), min(1.0, x_center + x_half))
    
    actual_center = find_nav_icon_center(img_path, x_range)
    if actual_center is None:
        return None
    
    delta = actual_center - labeled_center
    
    # 只修正 > 1.5% 的偏差
    if delta > 1.5:
        return round(delta, 1)
    
    return None


def analyze_and_fix():
    manifests = sorted(glob.glob(str(ROOT / "data/modules/*/screens/*/manifest.json")))
    
    results = []
    fixes = {}
    
    for mf_path in manifests:
        data = json.load(open(mf_path))
        views = data.get("views", [])
        if not views:
            continue
        
        modified = False
        for view in views:
            hotspots = view.get("hotspots", [])
            rects_hs = [h for h in hotspots if h.get("rect")]
            if not rects_hs:
                continue
            
            img_file = view.get("file", "")
            if not img_file:
                continue
            
            img_path = ROOT / img_file
            if not img_path.exists():
                continue
            
            delta = compute_delta(str(img_path), hotspots)
            
            if delta:
                screen_id = Path(mf_path).parent.name
                results.append((screen_id, view["id"], delta, len(rects_hs)))
                
                for h in rects_hs:
                    h["rect"]["y"] = round(h["rect"]["y"] + delta, 1)
                modified = True
        
        if modified:
            fixes[mf_path] = data
    
    # 报告
    print(f"\n{'='*60}")
    print(f"热区 rect.y 偏移分析报告")
    print(f"{'='*60}")
    print(f"扫描 manifest: {len(manifests)} 个")
    print(f"需要修正的 view: {len(results)} 个")
    total_hs = sum(r[3] for r in results)
    print(f"影响热区总数: {total_hs}")
    print()
    
    for screen_id, view_id, delta, cnt in results:
        print(f"  {screen_id}/{view_id}: delta=+{delta}% ({cnt} hotspots)")
    
    if not fixes:
        print("\n✅ 无需修正")
        return
    
    if DRY_RUN:
        print(f"\n⚡ 干跑模式（共 {len(fixes)} 个文件、{total_hs} 个热区需修正）。")
        print(f"   加 --write 写回文件。")
    else:
        for mf_path, data in fixes.items():
            with open(mf_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write("\n")
        print(f"\n✅ 已写回 {len(fixes)} 个 manifest 文件。")


if __name__ == "__main__":
    analyze_and_fix()
