import shutil
import subprocess
import sys
from pathlib import Path

import daily_ops_app as app
from daily_ops_import_matrix import build_import_matrix
from daily_ops_sales import DailySalesStore
from daily_ops_sales_compare import aggregate_source_sales, compare_sales


SALES_DB_PATH = app.DAILY_SALES_FILE


def status(payload=None):
    payload = payload or {}
    return app.desktop_status_for_operator(app.data_status(), operator_role(payload))


def reports():
    return app.REPORTS


def source_groups(payload=None):
    payload = payload or {}
    groups = app.source_group_status()
    if operator_role(payload) == "admin":
        return groups
    return app.desktop_status_for_operator({"source_groups": groups}, operator_role(payload)).get("source_groups", [])


def outputs(limit=80, payload=None):
    if operator_role(payload or {}) != "admin":
        return []
    return app.recent_outputs(limit)


def owner_can_upload_category(category):
    return app.owner_can_upload_category(category)


def import_source_files(category, source_paths):
    if category not in app.UPLOAD_TARGETS:
        raise ValueError("未知上传分类")
    label, folder = app.UPLOAD_TARGETS[category]
    folder.mkdir(parents=True, exist_ok=True)
    imported = []
    for source_path in source_paths:
        source = Path(source_path)
        if not source.exists() or not source.is_file():
            raise FileNotFoundError(f"文件不存在：{source}")
        target = app.unique_upload_path(folder, source.name)
        shutil.copy2(source, target)
        target = app.normalize_uploaded_workbook(target)
        imported.append(app.record_uploaded_source(category, target))
    return {"category": category, "label": label, "count": len(imported), "files": imported}


def finish_upload(category):
    return app.finish_upload_batch(category)


def clear_upload(category):
    return app.clear_upload_batch(category)


def generate_report(report_id, version="V1"):
    return app.run_report(report_id, version)


def generate_weekly_reports():
    return app.run_weekly_reports()


def load_rules():
    return app.load_rules()


def save_rules(rules):
    return app.save_rules(rules)


def search(query, limit=200):
    return app.search_database(query, limit)


def export_search(query, limit=500):
    return app.export_search(query, limit)


def operator_role(payload):
    return app.norm((payload or {}).get("role", "")) or "admin"


def operator_user(payload, fallback="管理员"):
    return app.norm((payload or {}).get("user", "")) or fallback


def require_admin_payload(payload, action):
    if operator_role(payload) != "admin":
        raise PermissionError(f"只有管理员可以{action}")


def operation_tasks(role="admin", user="", status="", task_type="", store="", platform="", overdue="", unassigned="", next_handler="", priority="", reworked="", open_only="", search=""):
    rows = app.list_operation_tasks(role, user, status, task_type, store, platform, overdue, unassigned, next_handler, priority, reworked, open_only, search)
    return {"summary": app.summarize_operation_tasks(rows), "packages": app.package_operation_tasks(rows), "tasks": rows}


def desktop_task_filters(payload):
    payload = payload or {}
    filters = dict(payload.get("filters") or {})
    role = operator_role(payload)
    user = operator_user(payload, "")
    filters["role"] = "admin" if role == "admin" else "owner"
    filters["user"] = "" if role == "admin" else user
    return filters


def operation_tasks_payload(payload):
    filters = desktop_task_filters(payload)
    return operation_tasks(
        filters.get("role", "admin"),
        filters.get("user", ""),
        filters.get("status", ""),
        filters.get("task_type", ""),
        filters.get("store", ""),
        filters.get("platform", ""),
        filters.get("overdue", ""),
        filters.get("unassigned", ""),
        filters.get("next_handler", ""),
        filters.get("priority", ""),
        filters.get("reworked", ""),
        filters.get("open_only", ""),
        filters.get("search", ""),
    )


def submit_operation_task(task_id, actor, action, remark="", proof=""):
    return app.submit_operation_task(task_id, actor, action, remark, proof)


def submit_operation_tasks(task_ids, actor, action, remark="", proof=""):
    return app.submit_operation_tasks(task_ids, actor, action, remark, proof)


def push_operation_tasks(task_ids, actor, remark=""):
    return app.push_operation_tasks(task_ids, actor, remark)


def assign_operation_task(task_id, actor, owner, remark=""):
    return app.assign_operation_task(task_id, actor, owner, remark)


def review_operation_task(task_id, admin, decision, remark=""):
    return app.review_operation_task(task_id, admin, decision, remark)


def review_operation_tasks(task_ids, admin, decision, remark=""):
    return app.review_operation_tasks(task_ids, admin, decision, remark)


def confirm_operation_tasks(task_ids, admin, remark=""):
    return app.confirm_operation_tasks(task_ids, admin, remark)


def task_suppressions():
    return app.list_task_suppressions()


def suppress_operation_tasks(task_ids, actor="管理员", reason="", duration="永久"):
    return app.suppress_operation_tasks(task_ids, actor, reason, duration)


def mark_operation_task_done(task_id, actor, remark=""):
    return app.mark_operation_task_done(task_id, actor, remark)


def mark_operation_tasks_done(task_ids, actor, remark=""):
    return app.mark_operation_tasks_done(task_ids, actor, remark)


def export_operation_tasks(role="admin", user="", status="", task_type="", store="", platform="", overdue="", unassigned="", next_handler="", priority="", reworked="", open_only="", search=""):
    return app.export_operation_tasks(role, user, status, task_type, store, platform, overdue, unassigned, next_handler, priority, reworked, open_only, search)


def export_operation_tasks_payload(payload):
    filters = desktop_task_filters(payload)
    return export_operation_tasks(
        filters.get("role", "admin"),
        filters.get("user", ""),
        filters.get("status", ""),
        filters.get("task_type", ""),
        filters.get("store", ""),
        filters.get("platform", ""),
        filters.get("overdue", ""),
        filters.get("unassigned", ""),
        filters.get("next_handler", ""),
        filters.get("priority", ""),
        filters.get("reworked", ""),
        filters.get("open_only", ""),
        filters.get("search", ""),
    )


def submit_operation_task_payload(payload):
    payload = payload or {}
    if operator_role(payload) != "owner":
        raise PermissionError("只有店长可以填写处理结果")
    return submit_operation_task(payload.get("id", ""), operator_user(payload, payload.get("actor", "")), payload.get("action", ""), payload.get("remark", ""), payload.get("proof", ""))


def submit_operation_tasks_payload(payload):
    payload = payload or {}
    if operator_role(payload) != "owner":
        raise PermissionError("只有店长可以批量填写处理结果")
    return submit_operation_tasks(payload.get("ids", []), operator_user(payload, payload.get("actor", "")), payload.get("action", ""), payload.get("remark", ""), payload.get("proof", ""))


def push_operation_tasks_payload(payload):
    require_admin_payload(payload, "推送任务")
    return push_operation_tasks(payload.get("ids", []), operator_user(payload), payload.get("remark", ""))


def assign_operation_task_payload(payload):
    require_admin_payload(payload, "指派任务")
    return assign_operation_task(payload.get("id", ""), operator_user(payload), payload.get("owner", ""), payload.get("remark", ""))


def review_operation_task_payload(payload):
    require_admin_payload(payload, "审核任务")
    return review_operation_task(payload.get("id", ""), operator_user(payload), payload.get("decision", ""), payload.get("remark", ""))


def review_operation_tasks_payload(payload):
    require_admin_payload(payload, "批量审核任务")
    return review_operation_tasks(payload.get("ids", []), operator_user(payload), payload.get("decision", ""), payload.get("remark", ""))


def confirm_operation_tasks_payload(payload):
    require_admin_payload(payload, "确认完成任务")
    return confirm_operation_tasks(payload.get("ids", []), operator_user(payload), payload.get("remark", ""))


def task_suppressions_payload(payload):
    require_admin_payload(payload or {}, "查看屏蔽清单")
    return task_suppressions()


def suppress_operation_tasks_payload(payload):
    require_admin_payload(payload, "屏蔽任务")
    return suppress_operation_tasks(payload.get("ids", []), operator_user(payload), payload.get("reason", ""), payload.get("duration", "永久"))


def mark_operation_task_done_payload(payload):
    require_admin_payload(payload, "标记完成")
    return mark_operation_task_done(payload.get("id", ""), operator_user(payload), payload.get("remark", ""))


def mark_operation_tasks_done_payload(payload):
    require_admin_payload(payload, "批量标记完成")
    return mark_operation_tasks_done(payload.get("ids", []), operator_user(payload), payload.get("remark", ""))


def store_owners():
    return {"assignments": app.load_store_owner_assignments(), "owners": app.operation_owner_directory()}


def save_store_owners(assignments, actor="管理员"):
    saved = app.save_store_owner_assignments(assignments)
    assigned_existing = app.assign_existing_unassigned_tasks(saved, actor)
    return {"assignments": saved, "assigned_existing": assigned_existing, "owners": app.operation_owner_directory()}


def save_store_owners_payload(payload):
    payload = payload or {}
    require_admin_payload(payload, "维护负责人配置")
    return save_store_owners(payload.get("assignments", []), operator_user(payload))


def sales_payload(payload):
    payload = payload or {}
    role = operator_role(payload)
    user = operator_user(payload, "")
    return DailySalesStore(SALES_DB_PATH).daily_payload(app.load_store_owner_assignments(), role, user, payload.get("date", ""))


def submit_sales_payload(payload):
    payload = payload or {}
    role = operator_role(payload)
    user = operator_user(payload)
    return DailySalesStore(SALES_DB_PATH).submit(
        app.load_store_owner_assignments(),
        role=role,
        user=user,
        day=payload.get("date", ""),
        platform=payload.get("platform", ""),
        store=payload.get("store", ""),
        sales=payload.get("sales", ""),
        remark=payload.get("remark", ""),
    )


def import_matrix_payload(payload):
    payload = payload or {}
    role = operator_role(payload)
    user = operator_user(payload, "")
    return build_import_matrix(app.load_store_owner_assignments(), app.source_group_status(), role, user)


def export_sales_payload(payload):
    payload = payload or {}
    role = operator_role(payload)
    user = operator_user(payload, "")
    return DailySalesStore(SALES_DB_PATH).export_daily_workbook(app.load_store_owner_assignments(), app.OUTPUT_DIR, role, user, payload.get("date", ""))


def sales_compare_payload(payload):
    payload = payload or {}
    role = operator_role(payload)
    user = operator_user(payload, "")
    sales_payload_data = DailySalesStore(SALES_DB_PATH).daily_payload(app.load_store_owner_assignments(), role, user, payload.get("date", ""))
    source_sales = aggregate_source_sales({
        "Temu": app.temu_sales_files(),
        "Shein": app.shein_platform_files(),
    })
    rows = compare_sales(sales_payload_data.get("entries", []), source_sales)
    source_platforms = [platform for platform, stores in source_sales.items() if stores]
    return {
        "date": sales_payload_data.get("date"),
        "summary": {
            "checked": sum(1 for item in sales_payload_data.get("entries", []) if item.get("submitted")),
            "alerts": len(rows),
            "source_platforms": sorted(source_platforms),
        },
        "rows": rows,
    }


def operator_accounts_payload(payload):
    require_admin_payload(payload or {}, "维护店长账号")
    return app.operator_accounts()


def create_operator_account_payload(payload):
    payload = payload or {}
    require_admin_payload(payload, "新增店长账号")
    return app.create_operator_account(
        payload.get("owner", ""),
        payload.get("username", ""),
        payload.get("password", ""),
        payload.get("enabled", True),
    )


def reset_operator_account_payload(payload):
    require_admin_payload(payload or {}, "重置店长密码")
    return app.reset_operator_account_password(payload.get("username", ""), payload.get("password", ""))


def erp_product_info_payload(payload):
    payload = payload or {}
    require_admin_payload(payload, "查询ERP商品信息")
    return app.query_erp_product_info(payload.get("query", ""), payload.get("limit", 100))


def import_owner_master_payload(payload):
    require_admin_payload(payload or {}, "导入店铺负责人")
    return app.import_owner_master_data(payload.get("path", ""))


def import_sales_history_payload(payload):
    require_admin_payload(payload or {}, "导入历史销量")
    return app.import_crossborder_sales(payload.get("path", ""))


def sales_report_payload(payload):
    payload = payload or {}
    role = operator_role(payload)
    user = operator_user(payload, "")
    platform = payload.get("platform", "")
    store = payload.get("store", "")
    allowed_pairs = None
    if role != "admin":
        assignments = app.load_store_owner_assignments()
        owned = [item for item in assignments if app.norm(item.get("owner")) == user]
        allowed_pairs = {(app.norm(item.get("platform")), app.norm(item.get("store"))) for item in owned}
        if store and (app.norm(platform), app.norm(store)) not in allowed_pairs:
            raise PermissionError("店长只能查询自己负责店铺的销量")
    return app.sales_report(platform, store, payload.get("date_from", ""), payload.get("date_to", ""), allowed_pairs=allowed_pairs)


def export_sales_report_payload(payload):
    payload = payload or {}
    require_admin_payload(payload, "导出销量报表")
    return app.export_sales_report(payload.get("platform", ""), payload.get("store", ""), payload.get("date_from", ""), payload.get("date_to", ""))


def business_report_payload(payload):
    payload = payload or {}
    role = operator_role(payload)
    user = operator_user(payload, "")
    platform = payload.get("platform", "")
    store = payload.get("store", "")
    if role != "admin":
        assignments = app.load_store_owner_assignments()
        owned = [item for item in assignments if app.norm(item.get("owner")) == user]
        allowed_pairs = {(app.norm(item.get("platform")), app.norm(item.get("store"))) for item in owned}
        if store and (app.norm(platform), app.norm(store)) not in allowed_pairs:
            raise PermissionError("店长只能查询自己负责店铺的经营报表")
    return app.business_report({
        "role": "admin" if role == "admin" else "owner",
        "user": "" if role == "admin" else user,
        "date_from": payload.get("date_from", ""),
        "date_to": payload.get("date_to", ""),
        "platform": platform,
        "store": store,
        "grain": payload.get("grain", "month"),
    })


def backup_reminder_payload(payload):
    if operator_role(payload or {}) != "admin":
        return {"backup_exists": True, "message": ""}
    return app.monthly_backup_reminder()


def erp_sync_payload(payload):
    require_admin_payload(payload or {}, "同步ERP基础数据")
    return app.sync_erp_base_data()


def bargain_clearance_payload(payload):
    require_admin_payload(payload or {}, "查看清仓款式")
    return app.load_clearance_catalog()


def rebuild_bargain_clearance_payload(payload):
    require_admin_payload(payload or {}, "重建清仓款式")
    return app.rebuild_clearance_catalog()


def bargain_lookup_payload(payload):
    payload = dict(payload or {})
    if operator_role(payload) == "owner":
        payload["owner"] = operator_user(payload, "")
    return app.lookup_bargain_staging(payload)


def bargain_submit_payload(payload):
    payload = dict(payload or {})
    if operator_role(payload) == "owner":
        payload["owner"] = operator_user(payload, "")
    return app.submit_bargain_batch(payload)


def bargain_review_payload(payload):
    require_admin_payload(payload or {}, "审批议价")
    payload = dict(payload or {})
    payload["admin"] = operator_user(payload)
    return app.review_bargain_lines(payload)


def bargain_resubmit_payload(payload):
    payload = dict(payload or {})
    if operator_role(payload) == "owner":
        payload["owner"] = operator_user(payload, "")
    return app.resubmit_bargain_line(payload)


def bargain_history_payload(payload):
    payload = dict(payload or {})
    if operator_role(payload) == "owner":
        payload["owner"] = operator_user(payload, "")
    return app.bargain_history(payload)


def bargain_low_price_trace_payload(payload):
    require_admin_payload(payload or {}, "低价回追")
    return app.low_price_trace(payload or {})


def bargain_ignore_low_price_payload(payload):
    require_admin_payload(payload or {}, "忽略低价风险")
    payload = dict(payload or {})
    payload["actor"] = operator_user(payload)
    return app.ignore_low_price(payload)


def create_backup():
    return app.create_operational_backup()


def restore_backup(path):
    return app.restore_operational_backup(path)


def output_file_path(name):
    return (app.OUTPUT_DIR / Path(name).name).resolve()


def open_path(path):
    target = Path(path)
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(target)])
    elif sys.platform.startswith("win"):
        subprocess.Popen(["cmd", "/c", "start", "", str(target)], shell=False)
    else:
        subprocess.Popen(["xdg-open", str(target)])


def reveal_path(path):
    target = Path(path)
    folder = target if target.is_dir() else target.parent
    open_path(folder)
