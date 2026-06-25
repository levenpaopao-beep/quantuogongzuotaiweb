import hashlib
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook


PRODUCT_ENDPOINT = "goods_query.php"
STOCK_ENDPOINT = "stock_query.php"
STOCK_CHANGE_ENDPOINT = "api_goods_stock_change_query.php"
QYB_TEST_BASE_URL = "https://sandbox.wangdian.cn/openapi2"
QYB_PROD_BASE_URL = "https://api.wangdian.cn/openapi2"
Y_TEST_BASE_URL = "https://openapi.ali.huice.cc/openapi"
Y_PROD_BASE_URL = "https://openapi.huice.com/openapi"
PRODUCT_PAGE_SIZE_MIN = 1
PRODUCT_PAGE_SIZE_MAX = 1000
STOCK_LIMIT_MIN = 100
STOCK_LIMIT_MAX = 20000
SYNC_MAX_PAGES_DEFAULT = 1000
REQUEST_INTERVAL_SECONDS_DEFAULT = 1.1
RATE_LIMIT_RETRY_SECONDS_DEFAULT = 300
RATE_LIMIT_RETRIES_DEFAULT = 2


def _text(value):
    return "" if value is None else str(value).strip()


def _int(value, default, minimum=1, maximum=None):
    try:
        result = int(value)
    except (TypeError, ValueError):
        result = default
    result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _float(value, default, minimum=0.0, maximum=None):
    try:
        result = float(value)
    except (TypeError, ValueError):
        result = default
    result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _byte_len(value):
    return len(_text(value).encode("utf-8"))


def _part(value, width):
    size = str(_byte_len(value)).zfill(width)
    return f"{size}-{_text(value)}"


def wangdian_sign(params, app_secret):
    payload = []
    for key in sorted(k for k in params if k != "sign"):
        payload.append(f"{_part(key, 2)}:{_part(params[key], 4)}")
    raw = ";".join(payload) + _text(app_secret)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def required_missing(settings):
    missing = []
    labels = {
        "base_url": "接口地址",
        "app_key": "AppKey",
        "app_secret": "AppSecret",
        "sid": "SID",
    }
    for key, label in labels.items():
        if not _text(settings.get(key)):
            missing.append(label)
    return missing


def api_base_url(settings):
    environment = _text(settings.get("environment"))
    if environment in {"test", "sandbox", "测试环境"}:
        return Y_TEST_BASE_URL
    if environment in {"prod", "production", "正式环境"}:
        return Y_PROD_BASE_URL
    base = _text(settings.get("base_url")) or Y_TEST_BASE_URL
    if "open.wangdian.cn" in base:
        return Y_TEST_BASE_URL
    return base.rstrip("/")


def signed_params(settings, params):
    payload = {
        "sid": _text(settings.get("sid")),
        "appkey": _text(settings.get("app_key")),
        "timestamp": str(int(time.time())),
    }
    payload.update({key: _text(value) for key, value in (params or {}).items() if _text(value) != ""})
    payload["sign"] = wangdian_sign(payload, settings.get("app_secret", ""))
    return payload


def post_api(settings, endpoint, params, timeout=30):
    url = f"{api_base_url(settings)}/{endpoint.lstrip('/')}"
    body = urllib.parse.urlencode(signed_params(settings, params)).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content = response.read().decode("utf-8", "ignore")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"code": -1, "message": "ERP接口返回内容不是JSON", "raw": content[:1000]}


def _rows_from_response(data, keys):
    if not isinstance(data, dict):
        return []
    for key in keys:
        value = data.get(key)
        if isinstance(value, list):
            return value
    nested = data.get("data")
    if isinstance(nested, dict):
        for key in keys:
            value = nested.get(key)
            if isinstance(value, list):
                return value
    return []


def _iter_product_items(items):
    for item in items:
        if not isinstance(item, dict):
            continue
        specs = item.get("spec_list") or item.get("specs") or item.get("goods_spec_list")
        if isinstance(specs, list) and specs:
            for spec in specs:
                if isinstance(spec, dict):
                    merged = dict(item)
                    merged.update(spec)
                    yield merged
            continue
        yield item


def _total_from_response(data):
    if not isinstance(data, dict):
        return None
    for key in ["total_count", "total", "count", "record_count"]:
        value = data.get(key)
        if value not in (None, ""):
            return _int(value, 0, minimum=0)
    nested = data.get("data")
    if isinstance(nested, dict):
        for key in ["total_count", "total", "count", "record_count"]:
            value = nested.get(key)
            if value not in (None, ""):
                return _int(value, 0, minimum=0)
    return None


def _has_next_page(data, rows, page_no, page_size, total):
    if not isinstance(data, dict):
        return False
    for key in ["has_more", "has_next", "more"]:
        if key in data:
            return bool(data.get(key))
    nested = data.get("data")
    if isinstance(nested, dict):
        for key in ["has_more", "has_next", "more"]:
            if key in nested:
                return bool(nested.get(key))
    if total is not None:
        return (page_no + 1) * page_size < total
    return len(rows) >= page_size


def _response_error(data):
    if not isinstance(data, dict):
        return ""
    code = data.get("code")
    if code in (None, "", 0, "0"):
        return ""
    return _text(data.get("message") or data.get("msg") or f"接口返回 code={code}")


def _is_rate_limit_error(message):
    return "频率超限" in _text(message) or "rate limit" in _text(message).lower()


def fetch_paged_rows(settings, endpoint, base_params, row_keys, page_size, max_pages=50, row_limit=None):
    all_rows = []
    messages = []
    total = None
    pages = 0
    request_interval = _float(settings.get("request_interval_seconds"), 0)
    rate_limit_retry_seconds = _float(settings.get("rate_limit_retry_seconds"), RATE_LIMIT_RETRY_SECONDS_DEFAULT)
    rate_limit_retries = _int(settings.get("rate_limit_retries") or RATE_LIMIT_RETRIES_DEFAULT, RATE_LIMIT_RETRIES_DEFAULT, minimum=0, maximum=10)
    for page_no in range(max_pages):
        if page_no > 0 and request_interval:
            time.sleep(request_interval)
        params = dict(base_params or {})
        params.update({"page_size": page_size, "page_no": page_no})
        attempts = 0
        while True:
            data = post_api(settings, endpoint, params)
            error = _response_error(data)
            if not error or not _is_rate_limit_error(error) or attempts >= rate_limit_retries:
                break
            attempts += 1
            time.sleep(rate_limit_retry_seconds)
        pages += 1
        if error:
            messages.append(f"第 {page_no + 1} 页：{error}")
            break
        rows = _rows_from_response(data, row_keys)
        if total is None:
            total = _total_from_response(data)
        all_rows.extend(rows)
        if row_limit is not None and len(all_rows) >= row_limit:
            all_rows = all_rows[:row_limit]
            messages.append(f"已达到拉取上限 {row_limit} 条")
            break
        if not _has_next_page(data, rows, page_no, page_size, total):
            break
    return {"rows": all_rows, "pages": pages, "total": total, "messages": messages}


def fetch_stock_change_rows(settings, endpoint, shop_id, shop_no, stock_limit):
    params = {
        "limit": stock_limit,
    }
    if _text(shop_id):
        params["shop_id"] = _text(shop_id)
    elif _text(shop_no):
        params["shop_id"] = _text(shop_no)
    data = post_api(settings, endpoint, params)
    error = _response_error(data)
    if error:
        return {"rows": [], "pages": 1, "total": None, "messages": [f"库存同步：{error}"]}
    rows = _rows_from_response(data, ["stock_change_list", "stock_list", "goods_list", "data"])
    total = _total_from_response(data)
    if total is None and isinstance(data, dict):
        total = _int(data.get("current_count"), len(rows), minimum=0) if data.get("current_count") not in (None, "") else len(rows)
    return {"rows": rows[:stock_limit], "pages": 1, "total": total, "messages": []}


def fetch_available_stock_rows(settings, endpoint, start_time, end_time, page_size, stock_limit, max_pages=SYNC_MAX_PAGES_DEFAULT):
    return fetch_paged_rows(settings, endpoint, {
        "start_time": start_time,
        "end_time": end_time,
    }, ["stock_list", "stocks", "data", "goods_list"], page_size, max_pages=max_pages, row_limit=stock_limit)


def _write_rows(path, headers, rows):
    wb = Workbook()
    ws = wb.active
    ws.title = "ERP同步"
    ws.append(headers)
    for row in rows:
        ws.append([row.get(header, "") for header in headers])
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    return path


def normalize_product_rows(items):
    rows = []
    for item in _iter_product_items(items):
        rows.append({
            "店铺编号": _text(item.get("shop_no") or item.get("Shop_no")),
            "店铺": _text(item.get("shop_name") or item.get("Shop_name")),
            "平台ID": _text(item.get("platform_id")),
            "平台货品编码": _text(item.get("api_goods_no") or item.get("goods_no")),
            "平台规格编码": _text(item.get("api_spec_no") or item.get("spec_outer_id") or item.get("spec_code")),
            "商家编码（新）": _text(item.get("spec_no") or item.get("Spec_no") or item.get("match_code") or item.get("spec_outer_id")),
            "货品编码": _text(item.get("goods_no") or item.get("api_goods_no")),
            "货品名称": _text(item.get("goods_name") or item.get("api_goods_name")),
            "规格名称": _text(item.get("spec_name") or item.get("api_spec_name")),
            "条码": _text(item.get("barcode")),
            "平台库存": _text(item.get("stock_num")),
            "成本价": _text(item.get("cost_price") or item.get("purchase_price") or item.get("成本价")),
            "批发报价": _text(item.get("wholesale_price") or item.get("wholesale") or item.get("批发报价") or item.get("批发价")),
            "批发价": _text(item.get("wholesale_price") or item.get("wholesale") or item.get("批发价") or item.get("批发报价")),
            "零售价": _text(item.get("retail_price") or item.get("price")),
            "修改时间": _text(item.get("modified")),
            "来源接口": PRODUCT_ENDPOINT,
        })
    return rows


def normalize_stock_rows(items, warehouse_no="", warehouse_name=""):
    rows = []
    warehouse_no = _text(warehouse_no)
    warehouse_name = _text(warehouse_name)
    for item in items:
        if not isinstance(item, dict):
            continue
        row_warehouse_no = _text(item.get("warehouse_no") or item.get("warehouse_id"))
        row_warehouse_name = _text(item.get("warehouse_name") or item.get("warehouse"))
        if warehouse_no and row_warehouse_no and row_warehouse_no != warehouse_no:
            continue
        if warehouse_name and row_warehouse_name and warehouse_name not in row_warehouse_name:
            continue
        merchant_code = _text(item.get("spec_no") or item.get("match_code") or item.get("outer_id"))
        rows.append({
            "店铺编号": _text(item.get("shop_no")),
            "店铺": _text(item.get("shop_name")),
            "仓库编号": row_warehouse_no,
            "仓库": row_warehouse_name,
            "平台货品编码": _text(item.get("api_goods_no") or item.get("goods_no")),
            "平台规格编码": _text(item.get("api_spec_no") or item.get("spec_no")),
            "商家编码（新）": merchant_code,
            "商家编码": merchant_code,
            "货品名称": _text(item.get("goods_name") or item.get("api_goods_name")),
            "规格名称": _text(item.get("spec_name") or item.get("api_spec_name")),
            "可销库存": _text(item.get("sync_stock") or item.get("stock_num") or item.get("available_stock") or item.get("available_num") or item.get("stock")),
            "实际库存": _text(item.get("real_stock") or item.get("actual_stock") or item.get("stock_num") or item.get("sync_stock")),
            "占用库存": _text(item.get("occupy_stock") or item.get("lock_stock") or item.get("occupied_num")),
            "修改时间": _text(item.get("modified")),
            "来源接口": STOCK_ENDPOINT,
        })
    return rows


def manual_sync(settings, erp_dir, now=None):
    missing = required_missing(settings)
    if missing:
        return {"status": "blocked", "message": f"缺少接口凭证：{'、'.join(missing)}", "missing": missing}

    now = now or datetime.now()
    days = int(settings.get("sync_days") or settings.get("time_window_days") or 7)
    days = max(1, min(days, 30))
    end_time = now.strftime("%Y-%m-%d %H:%M:%S")
    start_time = (now - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    shop_id = _text(settings.get("shop_id") or settings.get("shop_no"))
    shop_no = _text(settings.get("shop_no"))
    warehouse_no = _text(settings.get("warehouse_no"))
    warehouse_name = _text(settings.get("warehouse_name") or "宠物圈仓库")
    page_size = _int(settings.get("page_size") or 100, 100, minimum=PRODUCT_PAGE_SIZE_MIN, maximum=PRODUCT_PAGE_SIZE_MAX)
    stock_limit = _int(settings.get("stock_limit") or 1000, 1000, minimum=STOCK_LIMIT_MIN, maximum=STOCK_LIMIT_MAX)
    max_pages = _int(settings.get("max_pages") or SYNC_MAX_PAGES_DEFAULT, SYNC_MAX_PAGES_DEFAULT, minimum=1, maximum=SYNC_MAX_PAGES_DEFAULT)

    product_endpoint = _text(settings.get("product_endpoint")) or PRODUCT_ENDPOINT
    stock_endpoint = _text(settings.get("stock_endpoint")) or STOCK_ENDPOINT
    sync_product_archive = settings.get("sync_product_archive", True) is not False
    sync_stock_snapshot = settings.get("sync_stock_snapshot", True) is not False
    if not sync_product_archive and not sync_stock_snapshot:
        return {"status": "blocked", "message": "请至少选择一个 ERP 拉取内容：货品档案或库存快照", "missing": ["同步内容"]}

    product_sync = {"rows": [], "pages": 0, "total": None, "messages": []}
    stock_sync = {"rows": [], "pages": 0, "total": None, "messages": []}
    if sync_product_archive:
        product_params = {}
        if product_endpoint != PRODUCT_ENDPOINT:
            product_params.update({
                "start_time": start_time,
                "end_time": end_time,
            })
        if shop_id:
            product_params["shop_id"] = shop_id
        product_sync = fetch_paged_rows(settings, product_endpoint, product_params, ["goods_list", "data"], page_size, max_pages=max_pages)
    if sync_stock_snapshot:
        if stock_endpoint == STOCK_CHANGE_ENDPOINT:
            stock_sync = fetch_stock_change_rows(settings, stock_endpoint, shop_id, shop_no, stock_limit)
        else:
            stock_sync = fetch_available_stock_rows(settings, stock_endpoint, start_time, end_time, page_size, stock_limit, max_pages=max_pages)

    product_rows = normalize_product_rows(product_sync["rows"])
    stock_rows = normalize_stock_rows(stock_sync["rows"], warehouse_no, warehouse_name)
    erp_dir = Path(erp_dir)
    if settings.get("latest_file_only"):
        product_name = "erp产品基础信息表_接口同步_最新.xlsx"
        stock_name = "erp库存同步_最新.xlsx"
    else:
        stamp = now.strftime("%Y%m%d_%H%M%S")
        product_name = f"erp产品基础信息表_接口同步_{stamp}.xlsx"
        stock_name = f"erp库存同步_{stamp}.xlsx"
    product_file = ""
    stock_file = ""
    if sync_product_archive:
        product_file = _write_rows(
            erp_dir / product_name,
            ["店铺编号", "店铺", "平台ID", "平台货品编码", "平台规格编码", "商家编码（新）", "货品编码", "货品名称", "规格名称", "条码", "平台库存", "成本价", "批发报价", "批发价", "零售价", "修改时间", "来源接口"],
            product_rows,
        )
    if sync_stock_snapshot:
        stock_file = _write_rows(
            erp_dir / stock_name,
            ["店铺编号", "店铺", "仓库编号", "仓库", "平台货品编码", "平台规格编码", "商家编码（新）", "商家编码", "货品名称", "规格名称", "可销库存", "实际库存", "占用库存", "修改时间", "来源接口"],
            stock_rows,
        )
    message_parts = []
    if sync_product_archive:
        message_parts.append(f"货品档案 {len(product_rows)} 条")
    if sync_stock_snapshot:
        message_parts.append(f"库存快照 {len(stock_rows)} 条")
    return {
        "status": "synced",
        "message": f"已同步{'、'.join(message_parts)}",
        "product_count": len(product_rows),
        "stock_count": len(stock_rows),
        "product_pages": product_sync["pages"],
        "stock_pages": stock_sync["pages"],
        "product_total": product_sync["total"],
        "stock_total": stock_sync["total"],
        "warnings": product_sync["messages"] + stock_sync["messages"],
        "product_file": str(product_file) if product_file else "",
        "stock_file": str(stock_file) if stock_file else "",
        "api": {"product": product_endpoint, "stock": stock_endpoint},
    }
