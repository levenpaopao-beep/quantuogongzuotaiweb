def norm(value):
    if value is None:
        return ""
    return str(value).strip()


SOURCE_REQUIREMENTS = {
    "Temu": ["erp_base", "erp_stock", "temu_platform", "temu_hot"],
    "Shein": ["erp_base", "erp_stock", "shein_platform"],
    "速卖通": ["erp_base", "erp_stock"],
    "TK": ["erp_base", "erp_stock"],
    "Ozon": ["erp_base", "erp_stock"],
}


def owner_visible_assignments(assignments, role="admin", user=""):
    role = norm(role) or "admin"
    user = norm(user)
    rows = []
    seen = set()
    for item in assignments or []:
        if item.get("enabled") is False:
            continue
        platform = norm(item.get("platform"))
        store = norm(item.get("store"))
        owner = norm(item.get("owner"))
        if not platform or not store or not owner:
            continue
        if role != "admin" and owner != user:
            continue
        key = (platform, store)
        if key in seen:
            continue
        seen.add(key)
        rows.append({"platform": platform, "store": store, "owner": owner})
    return rows


def source_state(group):
    status = norm(group.get("status"))
    if group.get("pending_count"):
        return "pending"
    if "缺少" in status:
        return "missing"
    if status:
        return "ready"
    return "missing"


def source_label(group, key):
    return norm(group.get("name")) or key


def build_import_matrix(assignments, source_groups, role="admin", user=""):
    group_map = {norm(group.get("key")): group for group in source_groups or []}
    visible = owner_visible_assignments(assignments, role, user)
    rows = []
    total_cells = 0
    missing_cells = 0
    pending_cells = 0
    for item in visible:
        requirements = SOURCE_REQUIREMENTS.get(item["platform"], ["erp_base"])
        cells = []
        for key in requirements:
            group = group_map.get(key)
            total_cells += 1
            if not group:
                state = "missing"
                missing_cells += 1
                cells.append({"key": key, "name": key, "state": state, "status": "未配置", "batch_id": "", "updated_at": ""})
                continue
            state = source_state(group)
            if state == "missing":
                missing_cells += 1
            if state == "pending":
                pending_cells += 1
            cells.append({
                "key": key,
                "name": source_label(group, key),
                "state": state,
                "status": norm(group.get("status")),
                "batch_id": norm(group.get("batch_id")) or norm(group.get("pending_batch_id")),
                "updated_at": norm(group.get("uploaded_at")) or norm((group.get("latest") or {}).get("modified")),
            })
        missing_types = [cell["name"] for cell in cells if cell["state"] in {"missing", "pending"}]
        rows.append({
            "platform": item["platform"],
            "store": item["store"],
            "owner": item["owner"],
            "cells": cells,
            "ready": not missing_types,
            "missing_types": missing_types,
        })
    return {
        "summary": {
            "stores": len(rows),
            "total_cells": total_cells,
            "missing_cells": missing_cells,
            "pending_cells": pending_cells,
            "ready_stores": sum(1 for row in rows if row["ready"]),
            "blocked_stores": sum(1 for row in rows if not row["ready"]),
        },
        "rows": rows,
    }
