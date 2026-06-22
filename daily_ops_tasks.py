import hashlib
import json
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


STATUS_PENDING_OWNER = "待店长处理"
STATUS_OWNER_SUBMITTED = "店长已填写"
STATUS_PENDING_REVIEW = "待管理员审核"
STATUS_APPROVED = "已通过"
STATUS_REJECTED = "已驳回"
STATUS_DONE = "已完成"

TASK_COLUMNS = [
    ("id", "任务ID"),
    ("platform", "平台"),
    ("task_type", "任务类型"),
    ("status", "任务状态"),
    ("store", "店铺"),
    ("owner", "负责人"),
    ("merchant_code", "商家编码"),
    ("skc", "SKC"),
    ("spu", "SPU"),
    ("product_name", "货品名称"),
    ("system_action", "系统建议动作"),
    ("owner_action", "店长处理动作"),
    ("owner_remark", "店长备注"),
    ("owner_submitted_by", "店长提交人"),
    ("owner_submitted_at", "店长提交时间"),
    ("admin_decision", "管理员审核结果"),
    ("admin_remark", "管理员备注"),
    ("admin_reviewed_by", "管理员审核人"),
    ("admin_reviewed_at", "管理员审核时间"),
    ("source_report", "来源报表"),
    ("source_file", "来源文件"),
    ("source_sheet", "来源页签"),
    ("source_row", "来源行"),
    ("created_at", "创建时间"),
    ("updated_at", "更新时间"),
]

TASK_HISTORY_COLUMNS = [
    ("task_id", "任务ID"),
    ("platform", "平台"),
    ("task_type", "任务类型"),
    ("store", "店铺"),
    ("owner", "负责人"),
    ("product_name", "货品名称"),
    ("time", "操作时间"),
    ("event", "事件"),
    ("actor", "操作人"),
    ("action", "动作"),
    ("remark", "备注"),
]


def now_text():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def norm(value):
    if value is None:
        return ""
    return str(value).strip()


def task_identity(row):
    parts = [
        norm(row.get("platform")),
        norm(row.get("task_type")),
        norm(row.get("store")),
        norm(row.get("merchant_code")),
        norm(row.get("skc")),
        norm(row.get("spu")),
        norm(row.get("source_report")),
        norm(row.get("source_file")),
        norm(row.get("source_sheet")),
        norm(row.get("source_row")),
    ]
    raw = "|".join(parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def public_task(row):
    item = dict(row)
    item.setdefault("history", [])
    return item


class OperationTaskStore:
    def __init__(self, path):
        self.path = Path(path)

    def load(self):
        if not self.path.exists():
            return {"tasks": []}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {"tasks": []}
        if not isinstance(payload, dict):
            return {"tasks": []}
        tasks = payload.get("tasks")
        return {"tasks": tasks if isinstance(tasks, list) else []}

    def save(self, payload):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_tasks(self, role="admin", user="", status="", task_type="", store="", platform=""):
        role = norm(role) or "admin"
        user = norm(user)
        rows = [public_task(row) for row in self.load()["tasks"]]
        if role != "admin":
            rows = [row for row in rows if norm(row.get("owner")) == user]
        if status:
            rows = [row for row in rows if norm(row.get("status")) == norm(status)]
        if task_type:
            rows = [row for row in rows if norm(row.get("task_type")) == norm(task_type)]
        if store:
            rows = [row for row in rows if norm(row.get("store")) == norm(store)]
        if platform:
            rows = [row for row in rows if norm(row.get("platform")) == norm(platform)]
        return sorted(rows, key=lambda row: (row.get("status") != STATUS_PENDING_REVIEW, row.get("updated_at", "")), reverse=True)

    def summary(self, rows=None):
        rows = list(rows) if rows is not None else self.load()["tasks"]
        by_status = {}
        by_type = {}
        by_owner = {}
        unassigned = 0
        for row in rows:
            by_status[norm(row.get("status"))] = by_status.get(norm(row.get("status")), 0) + 1
            by_type[norm(row.get("task_type"))] = by_type.get(norm(row.get("task_type")), 0) + 1
            owner = norm(row.get("owner"))
            if owner:
                by_owner[owner] = by_owner.get(owner, 0) + 1
            else:
                unassigned += 1
        return {
            "total": len(rows),
            "by_status": by_status,
            "by_type": by_type,
            "by_owner": by_owner,
            "unassigned": unassigned,
        }

    def owner_directory(self):
        owners = {}
        for row in self.load()["tasks"]:
            owner = norm(row.get("owner"))
            if not owner:
                continue
            item = owners.setdefault(owner, {"owner": owner, "stores": set(), "platforms": set(), "task_count": 0})
            store = norm(row.get("store"))
            platform = norm(row.get("platform"))
            if store:
                item["stores"].add(store)
            if platform:
                item["platforms"].add(platform)
            item["task_count"] += 1
        result = []
        for item in owners.values():
            result.append({
                "owner": item["owner"],
                "stores": sorted(item["stores"]),
                "platforms": sorted(item["platforms"]),
                "task_count": item["task_count"],
            })
        return sorted(result, key=lambda row: (-row["task_count"], row["owner"]))

    def upsert_generated_tasks(self, rows):
        payload = self.load()
        tasks = payload["tasks"]
        existing = {row.get("id"): row for row in tasks}
        created = 0
        updated = 0
        timestamp = now_text()
        for source in rows:
            row = {key: norm(value) for key, value in dict(source).items()}
            row_id = task_identity(row)
            if row_id in existing:
                task = existing[row_id]
                for key in [
                    "platform",
                    "task_type",
                    "store",
                    "owner",
                    "merchant_code",
                    "skc",
                    "spu",
                    "product_name",
                    "system_action",
                    "source_report",
                    "source_file",
                    "source_sheet",
                    "source_row",
                ]:
                    task[key] = row.get(key, task.get(key, ""))
                task["updated_at"] = timestamp
                updated += 1
            else:
                task = {
                    "id": row_id,
                    "platform": row.get("platform", ""),
                    "task_type": row.get("task_type", ""),
                    "status": STATUS_PENDING_OWNER,
                    "store": row.get("store", ""),
                    "owner": row.get("owner", ""),
                    "merchant_code": row.get("merchant_code", ""),
                    "skc": row.get("skc", ""),
                    "spu": row.get("spu", ""),
                    "product_name": row.get("product_name", ""),
                    "system_action": row.get("system_action", ""),
                    "owner_action": "",
                    "owner_remark": "",
                    "owner_submitted_by": "",
                    "owner_submitted_at": "",
                    "admin_decision": "",
                    "admin_remark": "",
                    "admin_reviewed_by": "",
                    "admin_reviewed_at": "",
                    "source_report": row.get("source_report", ""),
                    "source_file": row.get("source_file", ""),
                    "source_sheet": row.get("source_sheet", ""),
                    "source_row": row.get("source_row", ""),
                    "history": [],
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
                tasks.append(task)
                existing[row_id] = task
                created += 1
        self.save(payload)
        return {"created": created, "updated": updated, "total": len(tasks)}

    def require_task(self, task_id):
        payload = self.load()
        for row in payload["tasks"]:
            if row.get("id") == task_id:
                return payload, row
        raise KeyError("任务不存在")

    def assign_task(self, task_id, actor, owner, remark=""):
        payload, task = self.require_task(task_id)
        owner = norm(owner)
        if not owner:
            raise ValueError("负责人不能为空")
        timestamp = now_text()
        previous_owner = norm(task.get("owner"))
        task["owner"] = owner
        task["updated_at"] = timestamp
        task.setdefault("history", []).append({
            "time": timestamp,
            "actor": norm(actor),
            "event": "任务指派",
            "action": f"指派给 {owner}",
            "remark": norm(remark) or (f"原负责人：{previous_owner}" if previous_owner else ""),
        })
        self.save(payload)
        return public_task(task)

    def submit_owner_action(self, task_id, actor, action, remark=""):
        payload, task = self.require_task(task_id)
        action = norm(action)
        if not action:
            raise ValueError("店长处理动作不能为空")
        if task.get("status") not in {STATUS_PENDING_OWNER, STATUS_REJECTED}:
            raise ValueError("只有待店长处理或已驳回的任务可以由店长填写")
        timestamp = now_text()
        task["owner_action"] = action
        task["owner_remark"] = norm(remark)
        task["owner_submitted_by"] = norm(actor)
        task["owner_submitted_at"] = timestamp
        task["status"] = STATUS_PENDING_REVIEW
        task["admin_decision"] = ""
        task["admin_remark"] = ""
        task["admin_reviewed_by"] = ""
        task["admin_reviewed_at"] = ""
        task["updated_at"] = timestamp
        task.setdefault("history", []).append({
            "time": timestamp,
            "actor": norm(actor),
            "event": "店长提交",
            "action": action,
            "remark": norm(remark),
        })
        self.save(payload)
        return public_task(task)

    def review_task(self, task_id, admin, decision, remark=""):
        payload, task = self.require_task(task_id)
        decision = norm(decision)
        if task.get("status") != STATUS_PENDING_REVIEW:
            raise ValueError("只有待管理员审核的任务可以审核")
        if decision not in {"通过", "驳回"}:
            raise ValueError("管理员审核结果只能是通过或驳回")
        timestamp = now_text()
        task["admin_decision"] = decision
        task["admin_remark"] = norm(remark)
        task["admin_reviewed_by"] = norm(admin)
        task["admin_reviewed_at"] = timestamp
        task["status"] = STATUS_APPROVED if decision == "通过" else STATUS_REJECTED
        task["updated_at"] = timestamp
        task.setdefault("history", []).append({
            "time": timestamp,
            "actor": norm(admin),
            "event": "管理员审核",
            "action": decision,
            "remark": norm(remark),
        })
        self.save(payload)
        return public_task(task)

    def review_tasks(self, task_ids, admin, decision, remark=""):
        ids = []
        seen = set()
        for task_id in task_ids or []:
            task_id = norm(task_id)
            if task_id and task_id not in seen:
                ids.append(task_id)
                seen.add(task_id)
        if not ids:
            raise ValueError("请选择要批量审核的任务")
        decision = norm(decision)
        if decision not in {"通过", "驳回"}:
            raise ValueError("管理员审核结果只能是通过或驳回")
        payload = self.load()
        by_id = {row.get("id"): row for row in payload["tasks"]}
        tasks = []
        for task_id in ids:
            task = by_id.get(task_id)
            if not task:
                raise KeyError("任务不存在")
            if task.get("status") != STATUS_PENDING_REVIEW:
                raise ValueError("只有待管理员审核的任务可以审核")
            tasks.append(task)
        timestamp = now_text()
        for task in tasks:
            task["admin_decision"] = decision
            task["admin_remark"] = norm(remark)
            task["admin_reviewed_by"] = norm(admin)
            task["admin_reviewed_at"] = timestamp
            task["status"] = STATUS_APPROVED if decision == "通过" else STATUS_REJECTED
            task["updated_at"] = timestamp
            task.setdefault("history", []).append({
                "time": timestamp,
                "actor": norm(admin),
                "event": "管理员批量审核",
                "action": decision,
                "remark": norm(remark),
            })
        self.save(payload)
        return {"count": len(tasks), "tasks": [public_task(task) for task in tasks]}

    def mark_done(self, task_id, actor, remark=""):
        payload, task = self.require_task(task_id)
        if task.get("status") != STATUS_APPROVED:
            raise ValueError("只有已通过的任务可以标记完成")
        timestamp = now_text()
        task["status"] = STATUS_DONE
        task["updated_at"] = timestamp
        task.setdefault("history", []).append({
            "time": timestamp,
            "actor": norm(actor),
            "event": "标记完成",
            "remark": norm(remark),
        })
        self.save(payload)
        return public_task(task)

    def export_tasks(self, output_path, tasks=None):
        rows = list(tasks) if tasks is not None else self.list_tasks()
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        workbook = Workbook()
        ws = workbook.active
        ws.title = "任务台账"
        ws.append([label for _key, label in TASK_COLUMNS])
        for row in rows:
            ws.append([row.get(key, "") for key, _label in TASK_COLUMNS])
        style_task_sheet(ws)
        log_ws = workbook.create_sheet("操作记录")
        log_ws.append([label for _key, label in TASK_HISTORY_COLUMNS])
        for row in rows:
            for item in row.get("history") or []:
                log_ws.append([
                    row.get("id", ""),
                    row.get("platform", ""),
                    row.get("task_type", ""),
                    row.get("store", ""),
                    row.get("owner", ""),
                    row.get("product_name", ""),
                    item.get("time", ""),
                    item.get("event", ""),
                    item.get("actor", ""),
                    item.get("action", ""),
                    item.get("remark", ""),
                ])
        style_task_sheet(log_ws)
        workbook.save(output_path)
        return output_path


def style_task_sheet(ws):
    header_fill = PatternFill("solid", fgColor="1F4E78")
    header_font = Font(color="FFFFFF", bold=True)
    thin = Side(style="thin", color="D9E2F3")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for row in ws.iter_rows():
        for cell in row:
            cell.border = border
            cell.alignment = Alignment(vertical="center", wrap_text=True)
    for col in range(1, ws.max_column + 1):
        width = 10
        for row in range(1, min(ws.max_row, 200) + 1):
            value = ws.cell(row, col).value
            if value is not None:
                width = max(width, len(str(value)) + 2)
        ws.column_dimensions[get_column_letter(col)].width = min(width, 34)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    ws.sheet_view.showGridLines = False


def header_map(values):
    return {norm(value): index for index, value in enumerate(values) if norm(value)}


def row_value(row, headers, *names):
    for name in names:
        index = headers.get(name)
        if index is not None and index < len(row):
            return row[index]
    return ""


REPORT_TASK_TYPE = {
    "temu_hot": "爆旺冲突",
    "shein_hot": "爆旺冲突",
    "low_score_warning": "低分预警",
    "temu_slow": "滞销处理",
    "temu_bargain": "议价审核",
}

REPORT_PLATFORM = {
    "temu_hot": "Temu",
    "low_score_warning": "Temu",
    "temu_slow": "Temu",
    "temu_bargain": "Temu",
    "shein_hot": "Shein",
}


def rows_from_report_workbook(report_id, report_name, workbook_path):
    report_id = norm(report_id)
    task_type = REPORT_TASK_TYPE.get(report_id)
    if not task_type:
        return []
    workbook_path = Path(workbook_path)
    workbook = load_workbook(workbook_path, read_only=True, data_only=True)
    tasks = []
    try:
        for sheet in workbook.worksheets:
            values = list(sheet.iter_rows(values_only=True))
            if not values:
                continue
            headers = header_map(values[0])
            if not should_import_sheet(report_id, headers):
                continue
            for row_number, row in enumerate(values[1:], start=2):
                if not any(norm(value) for value in row):
                    continue
                task = map_report_row(report_id, report_name, workbook_path.name, sheet.title, row_number, row, headers)
                if task:
                    tasks.append(task)
    finally:
        workbook.close()
    return tasks


def should_import_sheet(report_id, headers):
    if report_id in {"temu_hot", "shein_hot"}:
        return any(name in headers for name in ["处理意见", "冲突类型"])
    if report_id == "low_score_warning":
        return any(name in headers for name in ["是否下架", "是否已下架", "品质分", "是否本周新增低分"])
    if report_id == "temu_slow":
        return any(name in headers for name in ["建议动作", "操作", "预警类型"])
    if report_id == "temu_bargain":
        return any(name in headers for name in ["是否通过", "建议价格"])
    return False


def map_report_row(report_id, report_name, file_name, sheet_name, row_number, row, headers):
    platform = REPORT_PLATFORM.get(report_id, "")
    task_type = REPORT_TASK_TYPE.get(report_id, "")
    store = row_value(row, headers, "所属店铺", "店铺", "店铺编号")
    owner = row_value(row, headers, "负责人", "产品负责人", "填表人", "业务")
    merchant_code = row_value(row, headers, "商家编码", "SKU货号", "源SKU")
    skc = row_value(row, headers, "SKC", "skc", "爆旺款skc")
    spu = row_value(row, headers, "SPU", "spu", "爆旺skc")
    product_name = row_value(row, headers, "货品名称", "ERP货品名称", "品名", "名称")
    system_action = row_value(row, headers, "处理意见", "建议动作", "操作", "是否通过")
    if not any(norm(value) for value in [store, owner, merchant_code, skc, spu, product_name, system_action]):
        return None
    return {
        "platform": platform,
        "task_type": task_type,
        "store": store,
        "owner": owner,
        "merchant_code": merchant_code,
        "skc": skc,
        "spu": spu,
        "product_name": product_name,
        "system_action": system_action,
        "source_report": report_name,
        "source_file": file_name,
        "source_sheet": sheet_name,
        "source_row": row_number,
    }
