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


def operation_tasks(role="admin", user="", status="", task_type="", store="", platform=""):
    rows = app.list_operation_tasks(role, user, status, task_type, store, platform)
    return {"summary": app.summarize_operation_tasks(rows), "tasks": rows}


def submit_operation_task(task_id, actor, action, remark=""):
    return app.submit_operation_task(task_id, actor, action, remark)


def review_operation_task(task_id, admin, decision, remark=""):
    return app.review_operation_task(task_id, admin, decision, remark)


def mark_operation_task_done(task_id, actor, remark=""):
    return app.mark_operation_task_done(task_id, actor, remark)


def export_operation_tasks(role="admin", user="", status="", task_type="", store="", platform=""):
    return app.export_operation_tasks(role, user, status, task_type, store, platform)


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
