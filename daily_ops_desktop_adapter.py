import shutil
import subprocess
import sys
from pathlib import Path

import daily_ops_app as app


def status():
    return app.data_status()


def reports():
    return app.REPORTS


def source_groups():
    return app.source_group_status()


def outputs(limit=80):
    return app.recent_outputs(limit)


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


def operation_tasks(role="admin", user="", status="", task_type="", store="", platform="", overdue="", unassigned="", next_handler="", priority="", reworked="", open_only=""):
    rows = app.list_operation_tasks(role, user, status, task_type, store, platform, overdue, unassigned, next_handler, priority, reworked, open_only)
    return {"summary": app.summarize_operation_tasks(rows), "tasks": rows}


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
    )


def submit_operation_task(task_id, actor, action, remark="", proof=""):
    return app.submit_operation_task(task_id, actor, action, remark, proof)


def assign_operation_task(task_id, actor, owner, remark=""):
    return app.assign_operation_task(task_id, actor, owner, remark)


def review_operation_task(task_id, admin, decision, remark=""):
    return app.review_operation_task(task_id, admin, decision, remark)


def review_operation_tasks(task_ids, admin, decision, remark=""):
    return app.review_operation_tasks(task_ids, admin, decision, remark)


def mark_operation_task_done(task_id, actor, remark=""):
    return app.mark_operation_task_done(task_id, actor, remark)


def export_operation_tasks(role="admin", user="", status="", task_type="", store="", platform="", overdue="", unassigned="", next_handler="", priority="", reworked="", open_only=""):
    return app.export_operation_tasks(role, user, status, task_type, store, platform, overdue, unassigned, next_handler, priority, reworked, open_only)


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
    )


def submit_operation_task_payload(payload):
    payload = payload or {}
    if operator_role(payload) != "owner":
        raise PermissionError("只有店长可以填写处理结果")
    return submit_operation_task(payload.get("id", ""), operator_user(payload, payload.get("actor", "")), payload.get("action", ""), payload.get("remark", ""), payload.get("proof", ""))


def assign_operation_task_payload(payload):
    require_admin_payload(payload, "指派任务")
    return assign_operation_task(payload.get("id", ""), operator_user(payload), payload.get("owner", ""), payload.get("remark", ""))


def review_operation_task_payload(payload):
    require_admin_payload(payload, "审核任务")
    return review_operation_task(payload.get("id", ""), operator_user(payload), payload.get("decision", ""), payload.get("remark", ""))


def review_operation_tasks_payload(payload):
    require_admin_payload(payload, "批量审核任务")
    return review_operation_tasks(payload.get("ids", []), operator_user(payload), payload.get("decision", ""), payload.get("remark", ""))


def mark_operation_task_done_payload(payload):
    require_admin_payload(payload, "标记完成")
    return mark_operation_task_done(payload.get("id", ""), operator_user(payload), payload.get("remark", ""))


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
