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
