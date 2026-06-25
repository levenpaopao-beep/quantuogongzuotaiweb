import html
from pathlib import Path

import update_shein_summary_30d_skc as raw_xlsx


def norm(value):
    if value is None:
        return ""
    return html.unescape(str(value)).strip()


def number(value):
    text = norm(value).replace(",", "")
    if not text:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def store_from_filename(path):
    name = Path(path).stem
    for store in ["琪琪", "童话", "加加", "宝宝", "牛牛"]:
        if store in name:
            return store
    return ""


def find_header_row(rows, required_any):
    for row_index, row in enumerate(rows[:40]):
        values = [norm(value) for value in row[:120]]
        if any(field in values for field in required_any):
            return row_index, values
    return None, []


def first_header_index(header_map, *names):
    for name in names:
        if name in header_map:
            return header_map[name]
    return None


def read_source_daily_average(path, platform):
    path = Path(path)
    try:
        rows = raw_xlsx.read_xlsx_rows(path)
    except Exception:
        return {}
    result = {}
    header_row, headers = find_header_row(rows, ["7天销量", "近7天销量", "30天销量", "近30天销量"])
    if header_row is None:
        return {}
    header_map = {name: index for index, name in enumerate(headers) if name}
    store_col = first_header_index(header_map, "店铺", "店铺名称", "店铺名")
    sales7_col = first_header_index(header_map, "7天销量", "近7天销量")
    sales30_col = first_header_index(header_map, "30天销量", "近30天销量")
    if sales7_col is None and sales30_col is None:
        return {}
    fallback_store = store_from_filename(path) if platform == "Shein" else ""
    for row in rows[header_row + 1:]:
        store = norm(row[store_col]) if store_col is not None and store_col < len(row) else fallback_store
        if not store:
            continue
        if sales7_col is not None and sales7_col < len(row):
            daily = number(row[sales7_col]) / 7
        elif sales30_col is not None and sales30_col < len(row):
            daily = number(row[sales30_col]) / 30
        else:
            daily = 0
        if daily:
            result[store] = result.get(store, 0.0) + daily
    return result


def aggregate_source_sales(files_by_platform):
    result = {}
    for platform, files in (files_by_platform or {}).items():
        platform_bucket = result.setdefault(platform, {})
        for path in files or []:
            for store, value in read_source_daily_average(path, platform).items():
                platform_bucket[store] = platform_bucket.get(store, 0.0) + value
    return result


def compare_sales(manual_entries, source_sales, percent_threshold=0.05, unit_threshold=20):
    rows = []
    for entry in manual_entries or []:
        if not entry.get("submitted"):
            continue
        platform = norm(entry.get("platform"))
        store = norm(entry.get("store"))
        manual = number(entry.get("sales"))
        imported = float((source_sales.get(platform) or {}).get(store) or 0)
        if not imported:
            continue
        diff = manual - imported
        diff_abs = abs(diff)
        percent = diff_abs / max(imported, 1)
        if diff_abs >= unit_threshold and percent >= percent_threshold:
            rows.append({
                "platform": platform,
                "store": store,
                "owner": norm(entry.get("owner")),
                "manual_sales": round(manual, 2),
                "imported_daily_avg": round(imported, 2),
                "diff": round(diff, 2),
                "diff_percent": round(percent * 100, 2),
                "level": "提醒",
            })
    rows.sort(key=lambda row: (-abs(row["diff"]), row["platform"], row["store"]))
    return rows
