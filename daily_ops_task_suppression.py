import hashlib
import json
import os
import threading
from datetime import datetime
from pathlib import Path


SUPPRESSION_LOCKS = {}
SUPPRESSION_LOCKS_GUARD = threading.Lock()


def now_text():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def norm(value):
    if value is None:
        return ""
    return str(value).strip()


def suppression_lock(path):
    key = str(Path(path).resolve())
    with SUPPRESSION_LOCKS_GUARD:
        if key not in SUPPRESSION_LOCKS:
            SUPPRESSION_LOCKS[key] = threading.RLock()
        return SUPPRESSION_LOCKS[key]


def suppression_key(row):
    parts = [
        norm(row.get("platform")),
        norm(row.get("store")),
        norm(row.get("task_type")),
        norm(row.get("merchant_code")),
        norm(row.get("skc")),
        norm(row.get("spu")),
        norm(row.get("system_action")),
    ]
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]


class TaskSuppressionStore:
    def __init__(self, path):
        self.path = Path(path)
        self._lock = suppression_lock(self.path)

    def load(self):
        with self._lock:
            if not self.path.exists():
                return {"items": []}
            try:
                payload = json.loads(self.path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return {"items": []}
            if not isinstance(payload, dict):
                return {"items": []}
            items = payload.get("items")
            return {"items": items if isinstance(items, list) else []}

    def save(self, payload):
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_name(f".{self.path.name}.{threading.get_ident()}.tmp")
            tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(tmp, self.path)

    def active_keys(self):
        return {norm(item.get("key")) for item in self.load()["items"] if norm(item.get("status")) != "已取消"}

    def filter_rows(self, rows):
        active = self.active_keys()
        kept = []
        skipped = []
        for row in rows or []:
            key = suppression_key(row)
            if key in active:
                skipped.append(row)
            else:
                kept.append(row)
        return kept, skipped

    def add_from_rows(self, rows, actor="管理员", reason="", duration="永久"):
        payload = self.load()
        by_key = {norm(item.get("key")): item for item in payload["items"]}
        created = 0
        updated = 0
        timestamp = now_text()
        for row in rows or []:
            key = suppression_key(row)
            item = by_key.get(key)
            source = {
                "platform": norm(row.get("platform")),
                "store": norm(row.get("store")),
                "task_type": norm(row.get("task_type")),
                "merchant_code": norm(row.get("merchant_code")),
                "skc": norm(row.get("skc")),
                "spu": norm(row.get("spu")),
                "system_action": norm(row.get("system_action")),
                "product_name": norm(row.get("product_name")),
            }
            if item:
                item.update(source)
                item["status"] = "生效中"
                item["reason"] = norm(reason) or item.get("reason", "")
                item["duration"] = norm(duration) or item.get("duration", "永久")
                item["updated_at"] = timestamp
                item["updated_by"] = norm(actor)
                updated += 1
            else:
                payload["items"].append({
                    "key": key,
                    **source,
                    "status": "生效中",
                    "reason": norm(reason),
                    "duration": norm(duration) or "永久",
                    "created_by": norm(actor),
                    "created_at": timestamp,
                    "updated_by": norm(actor),
                    "updated_at": timestamp,
                })
                created += 1
        payload["updated_at"] = timestamp
        self.save(payload)
        return {"created": created, "updated": updated, "total": len(payload["items"])}

    def list_items(self):
        return sorted(self.load()["items"], key=lambda item: norm(item.get("updated_at")), reverse=True)
