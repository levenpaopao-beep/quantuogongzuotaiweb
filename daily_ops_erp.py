import hashlib
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook


PRODUCT_ENDPOINT = "vip_api_goods_query.php"
STOCK_ENDPOINT = "api_goods_stock_change_query.php"


def _text(value):
    return "" if value is None else str(value).strip()


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
    base = _text(settings.get("base_url")) or "https://api.wangdian.cn/openapi2"
    if "open.wangdian.cn" in base:
        return "https://api.wangdian.cn/openapi2"
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
    for item in items:
        if not isinstance(item, dict):
            continue
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
            "零售价": _text(item.get("retail_price") or item.get("price")),
            "修改时间": _text(item.get("modified")),
            "来源接口": PRODUCT_ENDPOINT,
        })
    return rows


def normalize_stock_rows(items):
    rows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        rows.append({
            "店铺编号": _text(item.get("shop_no")),
            "店铺": _text(item.get("shop_name")),
            "平台货品编码": _text(item.get("api_goods_no") or item.get("goods_no")),
            "平台规格编码": _text(item.get("api_spec_no") or item.get("spec_no")),
            "商家编码": _text(item.get("spec_no") or item.get("match_code") or item.get("outer_id")),
            "货品名称": _text(item.get("goods_name") or item.get("api_goods_name")),
            "规格名称": _text(item.get("spec_name") or item.get("api_spec_name")),
            "可销库存": _text(item.get("stock_num") or item.get("available_stock") or item.get("stock")),
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
    shop_no = _text(settings.get("shop_no") or settings.get("warehouse_no"))
    page_size = int(settings.get("page_size") or 100)
    stock_limit = int(settings.get("stock_limit") or 100)

    product_endpoint = _text(settings.get("product_endpoint")) or PRODUCT_ENDPOINT
    stock_endpoint = _text(settings.get("stock_endpoint")) or STOCK_ENDPOINT
    product_resp = post_api(settings, product_endpoint, {
        "start_time": start_time,
        "end_time": end_time,
        "page_size": page_size,
        "page_no": 0,
        "shop_no": shop_no,
    })
    stock_resp = post_api(settings, stock_endpoint, {"shop_no": shop_no, "limit": stock_limit})

    product_rows = normalize_product_rows(_rows_from_response(product_resp, ["goods_list", "data"]))
    stock_rows = normalize_stock_rows(_rows_from_response(stock_resp, ["stock_change_list", "data"]))
    stamp = now.strftime("%Y%m%d_%H%M%S")
    erp_dir = Path(erp_dir)
    product_file = _write_rows(
        erp_dir / f"erp产品基础信息表_接口同步_{stamp}.xlsx",
        ["店铺编号", "店铺", "平台ID", "平台货品编码", "平台规格编码", "商家编码（新）", "货品编码", "货品名称", "规格名称", "条码", "平台库存", "零售价", "修改时间", "来源接口"],
        product_rows,
    )
    stock_file = _write_rows(
        erp_dir / f"erp库存同步_{stamp}.xlsx",
        ["店铺编号", "店铺", "平台货品编码", "平台规格编码", "商家编码", "货品名称", "规格名称", "可销库存", "修改时间", "来源接口"],
        stock_rows,
    )
    return {
        "status": "synced",
        "message": f"已同步商品 {len(product_rows)} 条、库存 {len(stock_rows)} 条",
        "product_count": len(product_rows),
        "stock_count": len(stock_rows),
        "product_file": str(product_file),
        "stock_file": str(stock_file),
        "api": {"product": product_endpoint, "stock": stock_endpoint},
    }
