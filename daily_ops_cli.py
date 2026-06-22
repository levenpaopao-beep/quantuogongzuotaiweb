import json
import sys
import traceback

import daily_ops_desktop_adapter as adapter


def ok(data=None):
    return {"ok": True, "data": data}


def fail(exc):
    return {"ok": False, "error": str(exc), "traceback": traceback.format_exc()}


def command(argv):
    if not argv:
        raise ValueError("缺少命令")
    name = argv[0]
    args = argv[1:]
    if name == "status":
        return ok(adapter.status())
    if name == "reports":
        return ok(adapter.reports())
    if name == "source-groups":
        return ok(adapter.source_groups())
    if name == "outputs":
        limit = int(args[0]) if args else 80
        return ok(adapter.outputs(limit))
    if name == "import-source":
        if len(args) < 2:
            raise ValueError("import-source 需要分类和文件路径")
        return ok(adapter.import_source_files(args[0], args[1:]))
    if name == "finish-upload":
        return ok(adapter.finish_upload(args[0]))
    if name == "clear-upload":
        return ok(adapter.clear_upload(args[0]))
    if name == "generate-report":
        report_id = args[0]
        version = args[1] if len(args) > 1 else "V1"
        return ok(adapter.generate_report(report_id, version))
    if name == "generate-weekly":
        return ok(adapter.generate_weekly_reports())
    if name == "open-output":
        path = adapter.output_file_path(args[0])
        adapter.open_path(path)
        return ok({"path": str(path)})
    if name == "reveal-output":
        path = adapter.output_file_path(args[0])
        adapter.reveal_path(path)
        return ok({"path": str(path)})
    if name == "load-rules":
        return ok(adapter.load_rules())
    if name == "save-rules":
        payload = json.loads(sys.stdin.read() or "{}")
        return ok(adapter.save_rules(payload))
    if name == "search":
        limit = int(args[1]) if len(args) > 1 else 200
        return ok(adapter.search(args[0], limit))
    if name == "export-search":
        limit = int(args[1]) if len(args) > 1 else 500
        return ok(adapter.export_search(args[0], limit))
    if name == "tasks":
        role = args[0] if len(args) > 0 else "admin"
        user = args[1] if len(args) > 1 else ""
        status = args[2] if len(args) > 2 else ""
        task_type = args[3] if len(args) > 3 else ""
        store = args[4] if len(args) > 4 else ""
        platform = args[5] if len(args) > 5 else ""
        overdue = args[6] if len(args) > 6 else ""
        unassigned = args[7] if len(args) > 7 else ""
        next_handler = args[8] if len(args) > 8 else ""
        reworked = args[9] if len(args) > 9 else ""
        open_only = args[10] if len(args) > 10 else ""
        return ok(adapter.operation_tasks(role, user, status, task_type, store, platform, overdue, unassigned, next_handler, reworked, open_only))
    if name == "submit-task":
        payload = json.loads(sys.stdin.read() or "{}")
        return ok(adapter.submit_operation_task(payload.get("id", ""), payload.get("actor", ""), payload.get("action", ""), payload.get("remark", "")))
    if name == "assign-task":
        payload = json.loads(sys.stdin.read() or "{}")
        return ok(adapter.assign_operation_task(payload.get("id", ""), payload.get("actor", ""), payload.get("owner", ""), payload.get("remark", "")))
    if name == "review-task":
        payload = json.loads(sys.stdin.read() or "{}")
        return ok(adapter.review_operation_task(payload.get("id", ""), payload.get("admin", ""), payload.get("decision", ""), payload.get("remark", "")))
    if name == "batch-review-tasks":
        payload = json.loads(sys.stdin.read() or "{}")
        return ok(adapter.review_operation_tasks(payload.get("ids", []), payload.get("admin", ""), payload.get("decision", ""), payload.get("remark", "")))
    if name == "done-task":
        payload = json.loads(sys.stdin.read() or "{}")
        return ok(adapter.mark_operation_task_done(payload.get("id", ""), payload.get("actor", ""), payload.get("remark", "")))
    if name == "export-tasks":
        payload = json.loads(sys.stdin.read() or "{}")
        return ok(adapter.export_operation_tasks(
            payload.get("role", "admin"),
            payload.get("user", ""),
            payload.get("status", ""),
            payload.get("task_type", ""),
            payload.get("store", ""),
            payload.get("platform", ""),
            payload.get("overdue", ""),
            payload.get("unassigned", ""),
            payload.get("next_handler", ""),
            payload.get("reworked", ""),
            payload.get("open_only", ""),
        ))
    if name == "store-owners":
        return ok(adapter.store_owners())
    if name == "save-store-owners":
        payload = json.loads(sys.stdin.read() or "{}")
        return ok(adapter.save_store_owners(payload.get("assignments", [])))
    if name == "create-backup":
        return ok(adapter.create_backup())
    if name == "restore-backup":
        payload = json.loads(sys.stdin.read() or "{}")
        backup_path = payload.get("path", args[0] if args else "")
        return ok(adapter.restore_backup(backup_path))
    raise ValueError(f"未知命令：{name}")


def main():
    try:
        payload = command(sys.argv[1:])
    except Exception as exc:
        payload = fail(exc)
    print(json.dumps(payload, ensure_ascii=False, default=str))
    return 0 if payload.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
