import json
import sys
import traceback

import daily_ops_desktop_adapter as adapter


def ok(data=None):
    return {"ok": True, "data": data}


def fail(exc):
    return {"ok": False, "error": str(exc), "traceback": traceback.format_exc()}


def read_payload():
    return json.loads(sys.stdin.read() or "{}")


def require_admin(payload, action):
    adapter.require_admin_payload(payload or {}, action)


def require_upload_operator(payload, action):
    payload = payload or {}
    role = adapter.operator_role(payload)
    user = adapter.operator_user(payload, "")
    if role not in {"admin", "owner"}:
        raise PermissionError(f"{action}需要管理员或店长")
    if role == "owner" and not user:
        raise PermissionError(f"{action}需要先填写当前店长")


def task_payload(payload):
    payload = dict(payload or {})
    if "filters" not in payload:
        payload["filters"] = {
            "role": payload.get("role", "admin"),
            "user": payload.get("user", ""),
            "status": payload.get("status", ""),
            "task_type": payload.get("task_type", ""),
            "store": payload.get("store", ""),
            "platform": payload.get("platform", ""),
            "overdue": payload.get("overdue", ""),
            "unassigned": payload.get("unassigned", ""),
            "next_handler": payload.get("next_handler", ""),
            "priority": payload.get("priority", ""),
            "reworked": payload.get("reworked", ""),
            "open_only": payload.get("open_only", ""),
        }
    return payload


def command(argv):
    if not argv:
        raise ValueError("缺少命令")
    name = argv[0]
    args = argv[1:]
    if name == "status":
        return ok(adapter.status(read_payload()))
    if name == "reports":
        return ok(adapter.reports())
    if name == "source-groups":
        return ok(adapter.source_groups(read_payload()))
    if name == "outputs":
        limit = int(args[0]) if args else 80
        return ok(adapter.outputs(limit, read_payload()))
    if name == "import-source":
        if len(args) < 2:
            raise ValueError("import-source 需要分类和文件路径")
        require_upload_operator(read_payload(), "上传数据源")
        return ok(adapter.import_source_files(args[0], args[1:]))
    if name == "finish-upload":
        require_upload_operator(read_payload(), "结束上传")
        return ok(adapter.finish_upload(args[0]))
    if name == "clear-upload":
        require_upload_operator(read_payload(), "清空待提交文件")
        return ok(adapter.clear_upload(args[0]))
    if name == "generate-report":
        report_id = args[0]
        version = args[1] if len(args) > 1 else "V1"
        require_admin(read_payload(), "生成报表")
        return ok(adapter.generate_report(report_id, version))
    if name == "generate-weekly":
        require_admin(read_payload(), "生成本周报表")
        return ok(adapter.generate_weekly_reports())
    if name == "open-output":
        require_admin(read_payload(), "打开全局输出文件")
        path = adapter.output_file_path(args[0])
        adapter.open_path(path)
        return ok({"path": str(path)})
    if name == "reveal-output":
        require_admin(read_payload(), "查看全局输出文件夹")
        path = adapter.output_file_path(args[0])
        adapter.reveal_path(path)
        return ok({"path": str(path)})
    if name == "load-rules":
        require_admin(read_payload(), "读取规则")
        return ok(adapter.load_rules())
    if name == "save-rules":
        payload = read_payload()
        require_admin(payload, "维护规则")
        return ok(adapter.save_rules(payload.get("rules", payload)))
    if name == "search":
        limit = int(args[1]) if len(args) > 1 else 200
        require_admin(read_payload(), "查询基础数据")
        return ok(adapter.search(args[0], limit))
    if name == "export-search":
        limit = int(args[1]) if len(args) > 1 else 500
        require_admin(read_payload(), "导出基础数据查询")
        return ok(adapter.export_search(args[0], limit))
    if name == "tasks":
        return ok(adapter.operation_tasks_payload(task_payload(read_payload())))
    if name == "submit-task":
        payload = read_payload()
        return ok(adapter.submit_operation_task_payload(payload))
    if name == "batch-submit-tasks":
        payload = read_payload()
        return ok(adapter.submit_operation_tasks_payload(payload))
    if name == "push-tasks":
        payload = read_payload()
        return ok(adapter.push_operation_tasks_payload(payload))
    if name == "assign-task":
        payload = read_payload()
        return ok(adapter.assign_operation_task_payload(payload))
    if name == "review-task":
        payload = read_payload()
        return ok(adapter.review_operation_task_payload(payload))
    if name == "batch-review-tasks":
        payload = read_payload()
        return ok(adapter.review_operation_tasks_payload(payload))
    if name == "confirm-tasks":
        payload = read_payload()
        return ok(adapter.confirm_operation_tasks_payload(payload))
    if name == "task-suppressions":
        payload = read_payload()
        return ok(adapter.task_suppressions_payload(payload))
    if name == "suppress-tasks":
        payload = read_payload()
        return ok(adapter.suppress_operation_tasks_payload(payload))
    if name == "done-task":
        payload = read_payload()
        return ok(adapter.mark_operation_task_done_payload(payload))
    if name == "done-tasks":
        payload = read_payload()
        return ok(adapter.mark_operation_tasks_done_payload(payload))
    if name == "export-tasks":
        payload = task_payload(read_payload())
        return ok(adapter.export_operation_tasks_payload(payload))
    if name == "store-owners":
        require_admin(read_payload(), "读取负责人配置")
        return ok(adapter.store_owners())
    if name == "save-store-owners":
        payload = read_payload()
        return ok(adapter.save_store_owners_payload(payload))
    if name == "sales":
        return ok(adapter.sales_payload(read_payload()))
    if name == "submit-sales":
        return ok(adapter.submit_sales_payload(read_payload()))
    if name == "export-sales":
        return ok(adapter.export_sales_payload(read_payload()))
    if name == "sales-compare":
        return ok(adapter.sales_compare_payload(read_payload()))
    if name == "operator-accounts":
        return ok(adapter.operator_accounts_payload(read_payload()))
    if name == "reset-operator-password":
        return ok(adapter.reset_operator_account_payload(read_payload()))
    if name == "import-owner-master":
        return ok(adapter.import_owner_master_payload(read_payload()))
    if name == "import-sales-history":
        return ok(adapter.import_sales_history_payload(read_payload()))
    if name == "sales-report":
        return ok(adapter.sales_report_payload(read_payload()))
    if name == "export-sales-report":
        return ok(adapter.export_sales_report_payload(read_payload()))
    if name == "backup-reminder":
        return ok(adapter.backup_reminder_payload(read_payload()))
    if name == "import-matrix":
        return ok(adapter.import_matrix_payload(read_payload()))
    if name == "erp-sync":
        return ok(adapter.erp_sync_payload(read_payload()))
    if name == "create-backup":
        require_admin(read_payload(), "生成备份")
        return ok(adapter.create_backup())
    if name == "restore-backup":
        payload = read_payload()
        require_admin(payload, "恢复备份")
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
