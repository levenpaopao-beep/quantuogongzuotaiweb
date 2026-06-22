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
OWNER_OVERDUE_DAYS = 3
REVIEW_OVERDUE_DAYS = 1

TASK_COLUMNS = [
    ("id", "任务ID"),
    ("platform", "平台"),
    ("task_type", "任务类型"),
    ("status", "任务状态"),
    ("next_handler", "下一步处理人"),
    ("next_action", "下一步动作"),
    ("store", "店铺"),
    ("owner", "负责人"),
    ("merchant_code", "商家编码"),
    ("skc", "SKC"),
    ("spu", "SPU"),
    ("product_name", "货品名称"),
    ("system_action", "系统建议动作"),
    ("task_detail", "任务详情"),
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
    ("is_overdue", "是否超时"),
    ("overdue_days", "超时天数"),
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

TASK_UPDATE_LABELS = dict(TASK_COLUMNS)


def now_text():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def norm(value):
    if value is None:
        return ""
    return str(value).strip()


def parse_time(value):
    text = norm(value)
    if not text:
        return None
    try:
        return datetime.strptime(text, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def task_overdue(row, now=None):
    now = now or datetime.now()
    status = norm(row.get("status"))
    if status == STATUS_PENDING_OWNER:
        start = parse_time(row.get("created_at")) or parse_time(row.get("updated_at"))
        return bool(start and (now - start).total_seconds() >= OWNER_OVERDUE_DAYS * 86400)
    if status == STATUS_PENDING_REVIEW:
        start = parse_time(row.get("owner_submitted_at")) or parse_time(row.get("updated_at"))
        return bool(start and (now - start).total_seconds() >= REVIEW_OVERDUE_DAYS * 86400)
    return False


def task_age_days(row, now=None):
    now = now or datetime.now()
    status = norm(row.get("status"))
    if status == STATUS_PENDING_REVIEW:
        start = parse_time(row.get("owner_submitted_at")) or parse_time(row.get("updated_at"))
    else:
        start = parse_time(row.get("created_at")) or parse_time(row.get("updated_at"))
    if not start:
        return ""
    return max(0, int((now - start).total_seconds() // 86400))


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


def task_next_step(row, now=None):
    status = norm(row.get("status"))
    if status == STATUS_PENDING_OWNER:
        if not norm(row.get("owner")):
            return "管理员", "指派负责人"
        if task_overdue(row, now):
            return "管理员", "跟进超时店长处理"
        return "店长", "填写处理结果"
    if status == STATUS_PENDING_REVIEW:
        if task_overdue(row, now):
            return "管理员", "处理超时审核"
        return "管理员", "审核通过或驳回"
    if status == STATUS_REJECTED:
        return "店长", "按驳回原因重新处理"
    if status == STATUS_APPROVED:
        return "管理员", "标记完成或归档"
    if status == STATUS_DONE:
        return "无需处理", "已完成"
    return "管理员", "确认任务状态"


def public_task(row, now=None):
    item = dict(row)
    item.setdefault("history", [])
    next_handler, next_action = task_next_step(item, now=now)
    item["next_handler"] = next_handler
    item["next_action"] = next_action
    return item


def can_update_generated_owner(task):
    if task.get("status") != STATUS_PENDING_OWNER:
        return False
    for item in task.get("history") or []:
        if norm(item.get("event")) in {"任务指派", "自动指派"}:
            return False
    return True


def generated_task_remark(row):
    parts = []
    for key, label in [
        ("source_report", "来源报表"),
        ("source_file", "来源文件"),
        ("source_sheet", "来源页签"),
        ("source_row", "来源行"),
    ]:
        value = norm(row.get(key))
        if value:
            parts.append(f"{label}：{value}")
    return "；".join(parts)


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

    def list_tasks(self, role="admin", user="", status="", task_type="", store="", platform="", overdue="", unassigned="", next_handler="", now=None):
        role = norm(role) or "admin"
        user = norm(user)
        rows = [public_task(row, now=now) for row in self.load()["tasks"]]
        if role != "admin":
            if not user:
                return []
            rows = [row for row in rows if norm(row.get("owner")) == user]
        if status:
            rows = [row for row in rows if norm(row.get("status")) == norm(status)]
        if task_type:
            rows = [row for row in rows if norm(row.get("task_type")) == norm(task_type)]
        if store:
            rows = [row for row in rows if norm(row.get("store")) == norm(store)]
        if platform:
            rows = [row for row in rows if norm(row.get("platform")) == norm(platform)]
        if norm(overdue) in {"1", "true", "是", "超时"}:
            rows = [row for row in rows if task_overdue(row, now)]
        if norm(unassigned) in {"1", "true", "是", "未分配"}:
            rows = [row for row in rows if not norm(row.get("owner"))]
        if next_handler:
            rows = [row for row in rows if norm(row.get("next_handler")) == norm(next_handler)]
        return sorted(rows, key=lambda row: (row.get("status") != STATUS_PENDING_REVIEW, row.get("updated_at", "")), reverse=True)

    def summary(self, rows=None, now=None):
        rows = list(rows) if rows is not None else self.load()["tasks"]
        by_status = {}
        by_type = {}
        by_owner = {}
        by_next_handler = {}
        by_next_action = {}
        owner_status = {}
        overdue = {"total": 0, "by_status": {}}
        unassigned = 0
        for row in rows:
            status = norm(row.get("status"))
            by_status[status] = by_status.get(status, 0) + 1
            by_type[norm(row.get("task_type"))] = by_type.get(norm(row.get("task_type")), 0) + 1
            next_handler, next_action = task_next_step(row, now=now)
            by_next_handler[next_handler] = by_next_handler.get(next_handler, 0) + 1
            by_next_action[next_action] = by_next_action.get(next_action, 0) + 1
            owner = norm(row.get("owner"))
            if owner:
                by_owner[owner] = by_owner.get(owner, 0) + 1
            else:
                owner = "未分配"
                unassigned += 1
            item = owner_status.setdefault(owner, {"owner": owner, "total": 0, "by_status": {}})
            item["total"] += 1
            item["by_status"][status] = item["by_status"].get(status, 0) + 1
            item.setdefault("overdue", 0)
            if task_overdue(row, now):
                overdue["total"] += 1
                overdue["by_status"][status] = overdue["by_status"].get(status, 0) + 1
                item["overdue"] += 1
        return {
            "total": len(rows),
            "by_status": by_status,
            "by_type": by_type,
            "by_owner": by_owner,
            "by_next_handler": by_next_handler,
            "by_next_action": by_next_action,
            "owner_status": owner_status,
            "overdue": overdue,
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
                changed_labels = []
                for key in [
                    "platform",
                    "task_type",
                    "store",
                    "merchant_code",
                    "skc",
                    "spu",
                    "product_name",
                    "system_action",
                    "task_detail",
                    "source_report",
                    "source_file",
                    "source_sheet",
                    "source_row",
                ]:
                    next_value = row.get(key, task.get(key, ""))
                    if norm(task.get(key)) != norm(next_value):
                        changed_labels.append(TASK_UPDATE_LABELS.get(key, key))
                    task[key] = next_value
                if row.get("owner") and can_update_generated_owner(task):
                    if norm(task.get("owner")) != row.get("owner", ""):
                        changed_labels.append(TASK_UPDATE_LABELS.get("owner", "负责人"))
                    task["owner"] = row.get("owner", "")
                if changed_labels:
                    task.setdefault("history", []).append({
                        "time": timestamp,
                        "actor": "系统",
                        "event": "系统更新",
                        "action": "更新任务明细",
                        "remark": "更新字段：" + "、".join(changed_labels),
                    })
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
                    "task_detail": row.get("task_detail", ""),
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
                    "history": [{
                        "time": timestamp,
                        "actor": "系统",
                        "event": "系统生成",
                        "action": "生成待处理任务",
                        "remark": generated_task_remark(row),
                    }],
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
        owner = norm(task.get("owner"))
        actor = norm(actor)
        if not owner:
            raise ValueError("未分配负责人任务不能填写处理结果，请先指派负责人")
        if actor != owner:
            raise ValueError("只能由任务负责人填写处理结果")
        if task.get("status") not in {STATUS_PENDING_OWNER, STATUS_REJECTED}:
            raise ValueError("只有待店长处理或已驳回的任务可以由店长填写")
        timestamp = now_text()
        task["owner_action"] = action
        task["owner_remark"] = norm(remark)
        task["owner_submitted_by"] = actor
        task["owner_submitted_at"] = timestamp
        task["status"] = STATUS_PENDING_REVIEW
        task["admin_decision"] = ""
        task["admin_remark"] = ""
        task["admin_reviewed_by"] = ""
        task["admin_reviewed_at"] = ""
        task["updated_at"] = timestamp
        task.setdefault("history", []).append({
            "time": timestamp,
            "actor": actor,
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
        if decision == "驳回" and not norm(remark):
            raise ValueError("驳回任务必须填写原因")
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
        if decision == "驳回" and not norm(remark):
            raise ValueError("批量驳回任务必须填写原因")
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
        if not norm(remark):
            raise ValueError("标记完成必须填写确认说明")
        timestamp = now_text()
        task["status"] = STATUS_DONE
        task["updated_at"] = timestamp
        task.setdefault("history", []).append({
            "time": timestamp,
            "actor": norm(actor),
            "event": "标记完成",
            "action": STATUS_DONE,
            "remark": norm(remark),
        })
        self.save(payload)
        return public_task(task)

    def export_tasks(self, output_path, tasks=None, filters=None, now=None):
        rows = list(tasks) if tasks is not None else self.list_tasks()
        filters = dict(filters or {})
        history_rows = sum(len(row.get("history") or []) for row in rows)
        summary = self.summary(rows, now=now)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        workbook = Workbook()
        ws = workbook.active
        ws.title = "任务台账"
        ws.append([label for _key, label in TASK_COLUMNS])
        for row in rows:
            export_row = dict(row)
            export_row["is_overdue"] = "是" if task_overdue(row, now) else "否"
            export_row["overdue_days"] = task_age_days(row, now)
            export_row["next_handler"], export_row["next_action"] = task_next_step(row, now=now)
            ws.append([export_row.get(key, "") for key, _label in TASK_COLUMNS])
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
        owner_ws = workbook.create_sheet("负责人汇总")
        owner_ws.append(["负责人", "任务总数", STATUS_PENDING_OWNER, STATUS_PENDING_REVIEW, "超时未处理", STATUS_APPROVED, STATUS_REJECTED, STATUS_DONE])
        owner_rows = sorted(summary.get("owner_status", {}).values(), key=lambda item: (-item.get("total", 0), item.get("owner", "")))
        for item in owner_rows:
            status = item.get("by_status", {})
            owner_ws.append([
                item.get("owner", ""),
                item.get("total", 0),
                status.get(STATUS_PENDING_OWNER, 0),
                status.get(STATUS_PENDING_REVIEW, 0),
                item.get("overdue", 0),
                status.get(STATUS_APPROVED, 0),
                status.get(STATUS_REJECTED, 0),
                status.get(STATUS_DONE, 0),
            ])
        style_task_sheet(owner_ws)
        summary_ws = workbook.create_sheet("状态汇总")
        summary_ws.append(["指标", "数量"])
        summary_ws.append(["任务总数", summary.get("total", 0)])
        summary_ws.append(["超时未处理", summary.get("overdue", {}).get("total", 0)])
        summary_ws.append(["未分配", summary.get("unassigned", 0)])
        for status in [STATUS_PENDING_OWNER, STATUS_PENDING_REVIEW, STATUS_APPROVED, STATUS_REJECTED, STATUS_DONE]:
            summary_ws.append([status, summary.get("by_status", {}).get(status, 0)])
        summary_ws.append(["", ""])
        summary_ws.append(["任务类型", "数量"])
        for task_type, count in sorted(summary.get("by_type", {}).items()):
            summary_ws.append([task_type or "未填写", count])
        summary_ws.append(["", ""])
        summary_ws.append(["下一步处理人", "数量"])
        for handler, count in sorted(summary.get("by_next_handler", {}).items()):
            summary_ws.append([f"下一步处理人：{handler or '未填写'}", count])
        summary_ws.append(["", ""])
        summary_ws.append(["下一步动作", "数量"])
        for action, count in sorted(summary.get("by_next_action", {}).items()):
            summary_ws.append([f"下一步动作：{action or '未填写'}", count])
        style_task_sheet(summary_ws)
        criteria_ws = workbook.create_sheet("导出口径")
        criteria_ws.append(["字段", "值"])
        for key in ["role", "user", "status", "task_type", "store", "platform", "overdue", "unassigned", "next_handler"]:
            criteria_ws.append([key, norm(filters.get(key, ""))])
        criteria_ws.append(["rows", len(rows)])
        criteria_ws.append(["history_rows", history_rows])
        criteria_ws.append(["exported_at", now_text()])
        style_task_sheet(criteria_ws)
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


def report_task_detail(report_id, row, headers):
    parts = []
    seen = set()
    for name in REPORT_DETAIL_FIELDS.get(report_id, []):
        if name in seen:
            continue
        seen.add(name)
        value = norm(row_value(row, headers, name))
        if value:
            parts.append(f"{name}：{value}")
    return "；".join(parts)


REPORT_TASK_TYPE = {
    "temu_price": "价格异常",
    "temu_inventory": "库存异常",
    "temu_hot": "爆旺冲突",
    "shein_hot": "爆旺冲突",
    "shein_price": "价格异常",
    "shein_inventory": "库存异常",
    "low_score_warning": "低分预警",
    "temu_slow": "滞销处理",
    "temu_bargain": "议价审核",
}

REPORT_PLATFORM = {
    "temu_price": "Temu",
    "temu_inventory": "Temu",
    "temu_hot": "Temu",
    "low_score_warning": "Temu",
    "temu_slow": "Temu",
    "temu_bargain": "Temu",
    "shein_price": "Shein",
    "shein_inventory": "Shein",
    "shein_hot": "Shein",
}

REPORT_DETAIL_FIELDS = {
    "temu_price": ["申报价", "成本价", "批发价", "批发价80%", "7天销量", "30天销量"],
    "shein_price": ["申报价", "成本价", "批发价", "批发价80%", "7天销量", "30天销量"],
    "temu_inventory": ["仓备可用", "30天销量", "7天销量", "触发规则"],
    "shein_inventory": ["仓备可用", "30天销量", "7天销量", "触发规则"],
    "temu_hot": ["冲突类型", "爆旺款skc", "爆旺skc", "申报价", "7天销量", "30天销量", "库存", "平台仓备货"],
    "shein_hot": ["冲突类型", "爆旺款skc", "爆旺skc", "申报价", "7天销量", "30天销量", "库存", "平台仓备货"],
    "low_score_warning": ["品质分", "是否已下架", "是否下架", "是否本周新增低分", "低分原因"],
    "temu_slow": ["预警类型", "上架天数", "7天销量", "30天销量", "库存", "建议动作"],
    "temu_bargain": ["建议价格", "是否通过", "申报价", "成本价", "批发价"],
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
    if report_id in {"temu_price", "shein_price"}:
        return any(name in headers for name in ["申报价", "成本价", "批发价", "批发价80%"])
    if report_id in {"temu_inventory", "shein_inventory"}:
        return any(name in headers for name in ["仓备可用", "触发规则"])
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
    if not norm(system_action) and report_id in {"temu_price", "shein_price", "temu_inventory", "shein_inventory"}:
        system_action = sheet_name
    task_detail = report_task_detail(report_id, row, headers)
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
        "task_detail": task_detail,
        "source_report": report_name,
        "source_file": file_name,
        "source_sheet": sheet_name,
        "source_row": row_number,
    }
