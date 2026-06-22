import unittest
import os
import json
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from openpyxl import load_workbook

import daily_ops_tasks
import daily_ops_app


class OperationTaskStoreTest(unittest.TestCase):
    def test_upsert_filter_submit_review_and_export_tasks(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = daily_ops_tasks.OperationTaskStore(root / "tasks.json")

            rows = [
                {
                    "platform": "Temu",
                    "task_type": "爆旺冲突",
                    "store": "7",
                    "owner": "小琴",
                    "merchant_code": "3303197351-L",
                    "skc": "4173751716",
                    "spu": "9685510192",
                    "product_name": "篮球队服-红",
                    "system_action": "停止补货、售完下架",
                    "source_report": "Temu爆旺款重复预警",
                    "source_file": "hot.xlsx",
                    "source_row": 2,
                },
                {
                    "platform": "Temu",
                    "task_type": "低分预警",
                    "store": "5",
                    "owner": "洁琳",
                    "merchant_code": "",
                    "skc": "69443952334",
                    "spu": "6232074702",
                    "product_name": "天蓝带帽雨衣",
                    "system_action": "低分仍在售，需处理",
                    "source_report": "店铺低分产品预警",
                    "source_file": "low.xlsx",
                    "source_row": 27,
                },
            ]

            result = store.upsert_generated_tasks(rows)
            self.assertEqual(result["created"], 2)
            self.assertEqual(result["updated"], 0)

            repeat = store.upsert_generated_tasks(rows)
            self.assertEqual(repeat["created"], 0)
            self.assertEqual(repeat["updated"], 2)

            xiaoqin_tasks = store.list_tasks(role="owner", user="小琴")
            self.assertEqual(len(xiaoqin_tasks), 1)
            self.assertEqual(xiaoqin_tasks[0]["store"], "7")
            self.assertEqual(xiaoqin_tasks[0]["status"], daily_ops_tasks.STATUS_PENDING_OWNER)

            submitted = store.submit_owner_action(
                xiaoqin_tasks[0]["id"],
                actor="小琴",
                action="已下架",
                remark="已在后台处理",
            )
            self.assertEqual(submitted["status"], daily_ops_tasks.STATUS_PENDING_REVIEW)
            self.assertEqual(submitted["owner_action"], "已下架")

            reviewed = store.review_task(
                submitted["id"],
                admin="管理员",
                decision="通过",
                remark="同意处理",
            )
            self.assertEqual(reviewed["status"], daily_ops_tasks.STATUS_APPROVED)
            self.assertEqual(reviewed["admin_decision"], "通过")
            self.assertEqual(len(reviewed["history"]), 2)

            export_path = store.export_tasks(root / "导出.xlsx")
            workbook = load_workbook(export_path, read_only=True, data_only=True)
            try:
                self.assertEqual(workbook.sheetnames, ["任务台账", "操作记录"])
                ws = workbook["任务台账"]
                self.assertEqual(ws.max_row, 3)
                headers = [cell.value for cell in ws[1]]
                self.assertIn("任务状态", headers)
                self.assertIn("店长处理动作", headers)
                self.assertIn("管理员审核结果", headers)
                log_ws = workbook["操作记录"]
                log_headers = [cell.value for cell in log_ws[1]]
                self.assertIn("事件", log_headers)
                self.assertIn("操作人", log_headers)
                events = [log_ws.cell(row=row, column=log_headers.index("事件") + 1).value for row in range(2, log_ws.max_row + 1)]
                self.assertIn("店长提交", events)
                self.assertIn("管理员审核", events)
            finally:
                workbook.close()

    def test_task_status_flow_rejects_invalid_operations(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = daily_ops_tasks.OperationTaskStore(root / "tasks.json")
            store.upsert_generated_tasks([
                {
                    "platform": "Temu",
                    "task_type": "爆旺冲突",
                    "store": "7",
                    "owner": "小琴",
                    "merchant_code": "A-001",
                    "product_name": "红色球衣",
                    "system_action": "立即下架",
                    "source_report": "Temu爆旺款重复预警",
                    "source_row": 2,
                }
            ])
            task = store.list_tasks()[0]

            with self.assertRaises(ValueError):
                store.submit_owner_action(task["id"], actor="小琴", action="", remark="只写备注")

            with self.assertRaises(ValueError):
                store.review_task(task["id"], admin="管理员", decision="通过", remark="未提交就审核")

            submitted = store.submit_owner_action(task["id"], actor="小琴", action="已下架", remark="后台已处理")
            reviewed = store.review_task(submitted["id"], admin="管理员", decision="通过", remark="同意")
            self.assertEqual(reviewed["status"], daily_ops_tasks.STATUS_APPROVED)

            with self.assertRaises(ValueError):
                store.submit_owner_action(task["id"], actor="小琴", action="改为继续观察", remark="")

            with self.assertRaises(ValueError):
                store.review_task(task["id"], admin="管理员", decision="同意", remark="非法审核结果")

    def test_admin_can_mark_approved_task_done_once(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = daily_ops_tasks.OperationTaskStore(root / "tasks.json")
            store.upsert_generated_tasks([
                {
                    "platform": "Temu",
                    "task_type": "议价审核",
                    "store": "7",
                    "owner": "小琴",
                    "merchant_code": "A-001",
                    "product_name": "红色球衣",
                    "system_action": "同意议价",
                    "source_report": "Temu议价回复",
                    "source_row": 2,
                }
            ])
            task = store.list_tasks()[0]

            with self.assertRaises(ValueError):
                store.mark_done(task["id"], actor="管理员", remark="未审核不能完成")

            submitted = store.submit_owner_action(task["id"], actor="小琴", action="已处理", remark="")
            reviewed = store.review_task(submitted["id"], admin="管理员", decision="通过", remark="同意")
            done = store.mark_done(reviewed["id"], actor="管理员", remark="后台已确认")

            self.assertEqual(done["status"], daily_ops_tasks.STATUS_DONE)
            self.assertEqual(done["history"][-1]["event"], "标记完成")
            self.assertEqual(done["history"][-1]["remark"], "后台已确认")

            with self.assertRaises(ValueError):
                store.mark_done(task["id"], actor="管理员", remark="重复完成")

    def test_owner_directory_summarizes_task_owners_and_stores(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = daily_ops_tasks.OperationTaskStore(root / "tasks.json")
            store.upsert_generated_tasks([
                {"platform": "Temu", "task_type": "爆旺冲突", "store": "7", "owner": "小琴", "merchant_code": "A", "source_report": "r", "source_row": 1},
                {"platform": "Temu", "task_type": "低分预警", "store": "9", "owner": "小琴", "merchant_code": "B", "source_report": "r", "source_row": 2},
                {"platform": "Shein", "task_type": "爆旺冲突", "store": "琪琪", "owner": "洁琳", "merchant_code": "C", "source_report": "r", "source_row": 3},
                {"platform": "Temu", "task_type": "滞销处理", "store": "", "owner": "", "merchant_code": "D", "source_report": "r", "source_row": 4},
            ])

            owners = store.owner_directory()
            self.assertEqual([row["owner"] for row in owners], ["小琴", "洁琳"])
            self.assertEqual(owners[0]["stores"], ["7", "9"])
            self.assertEqual(owners[0]["task_count"], 2)
            self.assertEqual(owners[1]["stores"], ["琪琪"])
            self.assertEqual(owners[1]["platforms"], ["Shein"])

    def test_daily_ops_app_syncs_report_output_into_tasks(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "hot.xlsx"
            workbook = daily_ops_tasks.Workbook()
            ws = workbook.active
            ws.title = "具体店铺操作表"
            ws.append(["商家编码", "货品名称", "skc", "所属店铺", "负责人", "冲突类型", "处理意见"])
            ws.append(["3303197351-L", "篮球队服-红", "4173751716", "7", "小琴", "平销款冲突爆款", "立即下架！"])
            workbook.save(report)

            output_dir = root / "outputs"
            task_db = root / "operation_tasks.json"
            with patch.object(daily_ops_app, "OUTPUT_DIR", output_dir), \
                 patch.object(daily_ops_app, "TASK_DB_PATH", task_db):
                result = daily_ops_app.sync_report_tasks("temu_hot", report)
                self.assertEqual(result["created"], 1)

                tasks = daily_ops_app.list_operation_tasks(role="owner", user="小琴")
                self.assertEqual(len(tasks), 1)
                self.assertEqual(tasks[0]["task_type"], "爆旺冲突")

                submitted = daily_ops_app.submit_operation_task(tasks[0]["id"], "小琴", "已下架", "已处理")
                self.assertEqual(submitted["status"], daily_ops_tasks.STATUS_PENDING_REVIEW)

                reviewed = daily_ops_app.review_operation_task(tasks[0]["id"], "管理员", "通过", "同意")
                self.assertEqual(reviewed["status"], daily_ops_tasks.STATUS_APPROVED)

                exported = daily_ops_app.export_operation_tasks()
                self.assertTrue((output_dir / exported["file"]).exists())
                self.assertEqual(exported["rows"], 1)

    def test_local_web_page_exposes_operation_task_workflow(self):
        html = daily_ops_app.HTML_PAGE
        self.assertIn("/api/tasks", html)
        self.assertIn("/api/tasks/submit", html)
        self.assertIn("/api/tasks/review", html)
        self.assertIn("/api/tasks/done", html)
        self.assertIn("/api/tasks/export", html)
        self.assertIn("任务台账", html)
        self.assertIn("管理员审核", html)
        self.assertIn("标记完成", html)

    def test_electron_bridge_exposes_operation_task_workflow(self):
        root = Path(__file__).resolve().parent
        preload = (root / "electron" / "preload.js").read_text(encoding="utf-8")
        main = (root / "electron" / "main.js").read_text(encoding="utf-8")
        for text in ["tasks", "submitTask", "reviewTask", "doneTask", "exportTasks"]:
            self.assertIn(text, preload)
        for text in ["api:tasks", "api:submit-task", "api:review-task", "api:done-task", "api:export-tasks"]:
            self.assertIn(text, main)

    def test_electron_renderer_exposes_operation_task_center(self):
        root = Path(__file__).resolve().parent
        html = (root / "electron" / "renderer.html").read_text(encoding="utf-8")
        js = (root / "electron" / "renderer.js").read_text(encoding="utf-8")
        css = (root / "electron" / "renderer.css").read_text(encoding="utf-8")
        for text in ["任务中心", "任务台账", "店长填写", "管理员审核", "标记完成", "导出任务"]:
            self.assertIn(text, html + js)
        for text in ["renderTaskCenter", "loadTasks", "submitTask", "reviewTask", "doneTask", "exportTasks"]:
            self.assertIn(text, js)
        for text in ["task-summary", "task-table", "task-actions"]:
            self.assertIn(text, css)

    def test_task_center_exposes_online_history_view(self):
        root = Path(__file__).resolve().parent
        html = daily_ops_app.HTML_PAGE
        renderer = (root / "electron" / "renderer.js").read_text(encoding="utf-8")
        for text in ["showTaskHistory", "查看记录", "操作记录"]:
            self.assertIn(text, html)
            self.assertIn(text, renderer)

    def test_electron_renderer_persists_operator_identity_for_tasks(self):
        root = Path(__file__).resolve().parent
        html = (root / "electron" / "renderer.html").read_text(encoding="utf-8")
        js = (root / "electron" / "renderer.js").read_text(encoding="utf-8")
        self.assertIn("operatorRole", html)
        self.assertIn("operatorUser", html)
        self.assertIn("saveOperator", js)
        self.assertIn("localStorage", js)
        self.assertIn("currentOperator", js)

    def test_lan_host_configuration_keeps_local_default_and_allows_lan_binding(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(daily_ops_app.configured_host(), "127.0.0.1")
        with patch.dict(os.environ, {"DAILY_OPS_HOST": "0.0.0.0"}):
            self.assertEqual(daily_ops_app.configured_host(), "0.0.0.0")
        self.assertIn("局域网", daily_ops_app.access_hint("0.0.0.0", 8876))

    def test_operator_session_enforces_owner_scope_and_admin_review(self):
        daily_ops_app.OPERATOR_SESSIONS.clear()
        owner_session = daily_ops_app.login_operator("owner", "小琴", "")
        admin_session = daily_ops_app.login_operator("admin", "管理员", "")

        owner = daily_ops_app.operator_from_token(owner_session["token"])
        admin = daily_ops_app.operator_from_token(admin_session["token"])

        self.assertEqual(owner["role"], "owner")
        self.assertEqual(owner["user"], "小琴")
        self.assertEqual(daily_ops_app.scoped_task_filters(owner, {"role": "admin", "user": "洁琳"}), {"role": "owner", "user": "小琴"})
        self.assertEqual(daily_ops_app.scoped_task_filters(admin, {"role": "owner", "user": "洁琳"}), {"role": "owner", "user": "洁琳"})
        self.assertTrue(daily_ops_app.can_review_tasks(admin))
        self.assertFalse(daily_ops_app.can_review_tasks(owner))

    def test_http_task_handlers_require_session_and_scope_owner(self):
        daily_ops_app.OPERATOR_SESSIONS.clear()
        owner = daily_ops_app.login_operator("owner", "小琴", "")
        admin = daily_ops_app.login_operator("admin", "管理员", "")
        owner_headers = {"X-Operator-Token": owner["token"]}
        admin_headers = {"X-Operator-Token": admin["token"]}

        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            task_db = root / "tasks.json"
            store = daily_ops_tasks.OperationTaskStore(task_db)
            store.upsert_generated_tasks([
                {"platform": "Temu", "task_type": "爆旺冲突", "store": "1", "owner": "小琴", "merchant_code": "A", "source_report": "r", "source_row": 1},
                {"platform": "Temu", "task_type": "低分预警", "store": "2", "owner": "洁琳", "merchant_code": "B", "source_report": "r", "source_row": 2},
            ])
            with patch.object(daily_ops_app, "TASK_DB_PATH", task_db):
                status, _content_type, body = daily_ops_app.handle_tasks_api("GET", {}, {})
                self.assertEqual(status, 401)

                status, _content_type, body = daily_ops_app.handle_tasks_api("GET", owner_headers, {"role": "admin", "user": "洁琳"})
                payload = json.loads(body)
                self.assertEqual(status, 200)
                self.assertEqual(len(payload["tasks"]), 1)
                self.assertEqual(payload["tasks"][0]["owner"], "小琴")

                owner_task = payload["tasks"][0]
                status, _content_type, body = daily_ops_app.handle_tasks_api(
                    "POST_SUBMIT",
                    owner_headers,
                    {"id": owner_task["id"], "action": "已下架", "remark": "已处理"},
                )
                self.assertEqual(status, 200)

                status, _content_type, body = daily_ops_app.handle_tasks_api(
                    "POST_REVIEW",
                    owner_headers,
                    {"id": owner_task["id"], "decision": "通过", "remark": ""},
                )
                self.assertEqual(status, 403)

                status, _content_type, body = daily_ops_app.handle_tasks_api(
                    "POST_REVIEW",
                    admin_headers,
                    {"id": owner_task["id"], "decision": "通过", "remark": ""},
                )
                self.assertEqual(status, 200)

                status, _content_type, body = daily_ops_app.handle_tasks_api(
                    "POST_DONE",
                    owner_headers,
                    {"id": owner_task["id"], "remark": "店长不能完成"},
                )
                self.assertEqual(status, 403)

                status, _content_type, body = daily_ops_app.handle_tasks_api(
                    "POST_DONE",
                    admin_headers,
                    {"id": owner_task["id"], "remark": "管理员确认完成"},
                )
                self.assertEqual(status, 200)
                done_payload = json.loads(body)
                self.assertEqual(done_payload["task"]["status"], daily_ops_tasks.STATUS_DONE)

    def test_admin_workflow_apis_require_admin_session(self):
        daily_ops_app.OPERATOR_SESSIONS.clear()
        owner = daily_ops_app.login_operator("owner", "小琴", "")
        admin = daily_ops_app.login_operator("admin", "管理员", "")

        status, _content_type, body = daily_ops_app.handle_admin_api("上传数据源", {})
        self.assertEqual(status, 401)
        self.assertIn("请先登录", json.loads(body)["error"])

        status, _content_type, body = daily_ops_app.handle_admin_api("生成报表", {"X-Operator-Token": owner["token"]})
        self.assertEqual(status, 403)
        self.assertIn("只有管理员", json.loads(body)["error"])

        status, _content_type, body = daily_ops_app.handle_admin_api("生成报表", {"X-Operator-Token": admin["token"]})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["operator"]["role"], "admin")

    def test_end_to_end_task_workflow_exports_traceable_ledger(self):
        daily_ops_app.OPERATOR_SESSIONS.clear()
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            report = root / "hot.xlsx"
            workbook = daily_ops_tasks.Workbook()
            ws = workbook.active
            ws.title = "具体店铺操作表"
            ws.append(["商家编码", "货品名称", "skc", "所属店铺", "负责人", "冲突类型", "处理意见"])
            ws.append(["A-001", "红色球衣", "SKC1", "7", "小琴", "平销款冲突爆款", "立即下架"])
            ws.append(["B-001", "蓝色球衣", "SKC2", "8", "洁琳", "平销款冲突爆款", "继续观察"])
            workbook.save(report)

            task_db = root / "operation_tasks.json"
            output_dir = root / "outputs"
            with patch.object(daily_ops_app, "TASK_DB_PATH", task_db), \
                 patch.object(daily_ops_app, "OUTPUT_DIR", output_dir):
                sync = daily_ops_app.sync_report_tasks("temu_hot", report)
                self.assertEqual(sync["created"], 2)

                owner = daily_ops_app.login_operator("owner", "小琴", "")
                admin = daily_ops_app.login_operator("admin", "管理员", "")
                owner_headers = {"X-Operator-Token": owner["token"]}
                admin_headers = {"X-Operator-Token": admin["token"]}

                status, _content_type, body = daily_ops_app.handle_tasks_api("GET", owner_headers, {"role": "admin", "user": "洁琳"})
                self.assertEqual(status, 200)
                owner_payload = json.loads(body)
                self.assertEqual(len(owner_payload["tasks"]), 1)
                self.assertEqual(owner_payload["tasks"][0]["owner"], "小琴")

                task_id = owner_payload["tasks"][0]["id"]
                status, _content_type, _body = daily_ops_app.handle_tasks_api(
                    "POST_SUBMIT",
                    owner_headers,
                    {"id": task_id, "action": "已下架", "remark": "后台已处理"},
                )
                self.assertEqual(status, 200)

                status, _content_type, _body = daily_ops_app.handle_tasks_api(
                    "POST_REVIEW",
                    admin_headers,
                    {"id": task_id, "decision": "通过", "remark": "同意"},
                )
                self.assertEqual(status, 200)

                status, _content_type, body = daily_ops_app.handle_tasks_api(
                    "POST_EXPORT",
                    admin_headers,
                    {"role": "owner", "user": "小琴"},
                )
                self.assertEqual(status, 200)
                exported = json.loads(body)
                self.assertEqual(exported["rows"], 1)
                self.assertEqual(exported["history_rows"], 2)

                exported_path = output_dir / exported["file"]
                exported_book = load_workbook(exported_path, read_only=True, data_only=True)
                try:
                    self.assertEqual(exported_book.sheetnames, ["任务台账", "操作记录"])
                    self.assertEqual(exported_book["任务台账"].max_row, 2)
                    self.assertEqual(exported_book["操作记录"].max_row, 3)
                finally:
                    exported_book.close()

    def test_local_web_page_exposes_operator_login(self):
        html = daily_ops_app.HTML_PAGE
        self.assertIn("/api/session/login", html)
        self.assertIn("/api/owners", html)
        self.assertIn("operatorToken", html)
        self.assertIn("登录身份", html)
        self.assertIn("ownerOptions", html)

    def test_owner_directory_api_is_available_before_login(self):
        daily_ops_app.OPERATOR_SESSIONS.clear()
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            task_db = root / "tasks.json"
            store = daily_ops_tasks.OperationTaskStore(task_db)
            store.upsert_generated_tasks([
                {"platform": "Temu", "task_type": "爆旺冲突", "store": "7", "owner": "小琴", "merchant_code": "A", "source_report": "r", "source_row": 1},
                {"platform": "Shein", "task_type": "爆旺冲突", "store": "琪琪", "owner": "洁琳", "merchant_code": "B", "source_report": "r", "source_row": 2},
            ])
            with patch.object(daily_ops_app, "TASK_DB_PATH", task_db):
                status, _content_type, body = daily_ops_app.handle_owners_api()
                payload = json.loads(body)
                self.assertEqual(status, 200)
                self.assertEqual(payload["owners"][0]["owner"], "小琴")
                self.assertEqual(payload["owners"][0]["stores"], ["7"])
                self.assertEqual(payload["owners"][1]["owner"], "洁琳")

    def test_backup_exports_only_operational_state_and_can_restore(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = root / "基础数据库"
            outputs = root / "outputs"
            temu = root / "temu数据源表"
            base.mkdir()
            outputs.mkdir()
            temu.mkdir()
            (base / "operation_tasks.json").write_text('{"tasks":[{"id":"t1"}]}', encoding="utf-8")
            (base / "report_rules.json").write_text('{"slow_moving":{}}', encoding="utf-8")
            (base / "data_source_manifest.json").write_text('{"categories":{}}', encoding="utf-8")
            (outputs / "should-not-backup.xlsx").write_bytes(b"xlsx")
            (temu / "source.xlsx").write_bytes(b"xlsx")

            with patch.object(daily_ops_app, "ROOT", root), \
                 patch.object(daily_ops_app, "TASK_DB_PATH", base / "operation_tasks.json"), \
                 patch.object(daily_ops_app, "RULES_FILE", base / "report_rules.json"), \
                 patch.object(daily_ops_app, "DATA_SOURCE_MANIFEST", base / "data_source_manifest.json"), \
                 patch.object(daily_ops_app, "OUTPUT_DIR", outputs), \
                 patch.object(daily_ops_app, "TEMU_DIR", temu):
                result = daily_ops_app.create_operational_backup()
                backup_path = Path(result["path"])
                self.assertTrue(backup_path.exists())
                with zipfile.ZipFile(backup_path) as zf:
                    names = set(zf.namelist())
                    self.assertIn("基础数据库/operation_tasks.json", names)
                    self.assertIn("基础数据库/report_rules.json", names)
                    self.assertIn("基础数据库/data_source_manifest.json", names)
                    self.assertIn("temu数据源表/source.xlsx", names)
                    self.assertNotIn("outputs/should-not-backup.xlsx", names)

                (base / "operation_tasks.json").write_text('{"tasks":[]}', encoding="utf-8")
                restored = daily_ops_app.restore_operational_backup(backup_path)
                self.assertIn("基础数据库/operation_tasks.json", restored["restored"])
                self.assertEqual(json.loads((base / "operation_tasks.json").read_text(encoding="utf-8"))["tasks"][0]["id"], "t1")

    def test_backup_entrypoints_are_exposed(self):
        html = daily_ops_app.HTML_PAGE
        cli = (Path(__file__).resolve().parent / "daily_ops_cli.py").read_text(encoding="utf-8")
        adapter = (Path(__file__).resolve().parent / "daily_ops_desktop_adapter.py").read_text(encoding="utf-8")
        self.assertIn("/api/backup/create", html)
        self.assertIn("/api/backup/restore", html)
        self.assertIn("生成备份", html)
        self.assertIn("restore-backup", cli)
        self.assertIn("create_backup", adapter)

    def test_report_generation_surfaces_task_sync_summary(self):
        root = Path(__file__).resolve().parent
        html = daily_ops_app.HTML_PAGE
        renderer = (root / "electron" / "renderer.js").read_text(encoding="utf-8")
        for text in ["taskSyncSummary", "新增任务", "更新任务", "导入明细"]:
            self.assertIn(text, html)
            self.assertIn(text, renderer)
        self.assertIn("result.task_sync", html)
        self.assertIn("result.task_sync", renderer)


if __name__ == "__main__":
    unittest.main()
