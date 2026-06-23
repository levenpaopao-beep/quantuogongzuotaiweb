import tempfile
import unittest
from pathlib import Path

import daily_ops_tasks as tasks


class OperationTaskConfirmTest(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.store = tasks.OperationTaskStore(Path(self.tmpdir.name) / "operation_tasks.json")
        self.store.save({
            "tasks": [{
                "id": "task-1",
                "platform": "Temu",
                "task_type": "爆旺冲突",
                "status": tasks.STATUS_PENDING_REVIEW,
                "store": "七弟",
                "owner": "小琴",
                "product_name": "测试商品",
                "owner_action": "已处理",
                "owner_remark": "后台完成",
                "history": [],
                "created_at": tasks.now_text(),
                "updated_at": tasks.now_text(),
            }]
        })

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_confirm_review_tasks_marks_done_directly(self):
        result = self.store.confirm_review_tasks(["task-1"], "管理员", "确认完成")

        self.assertEqual(result["count"], 1)
        row = self.store.load()["tasks"][0]
        self.assertEqual(row["status"], tasks.STATUS_DONE)
        self.assertEqual(row["admin_decision"], "确认完成")
        self.assertEqual(row["completed_by"], "管理员")
        self.assertEqual(row["completed_remark"], "确认完成")

    def test_push_tasks_moves_pending_push_to_owner_queue(self):
        self.store.save({
            "tasks": [{
                "id": "task-2",
                "platform": "Temu",
                "task_type": "价格异常",
                "status": tasks.STATUS_PENDING_PUSH,
                "store": "七弟",
                "owner": "小琴",
                "product_name": "测试商品",
                "history": [],
                "created_at": tasks.now_text(),
                "updated_at": tasks.now_text(),
            }]
        })

        result = self.store.push_tasks(["task-2"], "管理员", "确认推送")

        self.assertEqual(result["count"], 1)
        row = self.store.load()["tasks"][0]
        self.assertEqual(row["status"], tasks.STATUS_PENDING_OWNER)
        self.assertEqual(row["next_handler"], "店长")
        self.assertEqual(row["next_action"], "填写处理结果")
        self.assertEqual(row["history"][-1]["event"], "管理员推送")

    def test_mark_done_tasks_archives_approved_rows(self):
        self.store.save({
            "tasks": [
                {
                    "id": "task-3",
                    "platform": "Temu",
                    "task_type": "价格异常",
                    "status": tasks.STATUS_APPROVED,
                    "store": "七弟",
                    "owner": "小琴",
                    "product_name": "测试商品 A",
                    "history": [],
                    "created_at": tasks.now_text(),
                    "updated_at": tasks.now_text(),
                },
                {
                    "id": "task-4",
                    "platform": "Temu",
                    "task_type": "价格异常",
                    "status": tasks.STATUS_APPROVED,
                    "store": "七弟",
                    "owner": "小琴",
                    "product_name": "测试商品 B",
                    "history": [],
                    "created_at": tasks.now_text(),
                    "updated_at": tasks.now_text(),
                },
            ]
        })

        result = self.store.mark_done_tasks(["task-3", "task-4"], "管理员", "整包归档")

        self.assertEqual(result["count"], 2)
        rows = self.store.load()["tasks"]
        self.assertTrue(all(row["status"] == tasks.STATUS_DONE for row in rows))
        self.assertTrue(all(row["completed_remark"] == "整包归档" for row in rows))
        self.assertEqual(rows[0]["history"][-1]["event"], "批量标记完成")


if __name__ == "__main__":
    unittest.main()
