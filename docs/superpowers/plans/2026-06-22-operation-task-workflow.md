# Operation Task Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn weekly imported analysis reports into an online/local-network task workflow where store owners fill actions, admins review them, and the final ledger can be exported.

**Architecture:** Keep the existing spreadsheet import and report scripts as the analysis engine. Add a small JSON-backed operation task store first, then expose it through the current Python HTTP workbench and Electron CLI bridge. Later phases can move the same task model to SQLite/login-backed deployment without changing the business flow.

**Tech Stack:** Python standard library HTTP server, `openpyxl`, JSON task ledger, existing Electron bridge and CLI.

---

### Task 1: Task Ledger Core

**Files:**
- Create: `daily_ops_tasks.py`
- Test: `test_operation_tasks.py`

- [x] Add task statuses: `待店长处理`, `待管理员审核`, `已通过`, `已驳回`, `已完成`.
- [x] Store generated tasks in `基础数据库/operation_tasks.json`.
- [x] Deduplicate generated tasks by platform, type, store, product ids, source report, source sheet, and source row.
- [x] Support owner filtering so 店长 only sees tasks assigned to their name.
- [x] Support owner submit and admin review history.
- [x] Export task ledger to Excel.

### Task 2: Workbench API

**Files:**
- Modify: `daily_ops_app.py`
- Modify: `daily_ops_cli.py`
- Modify: `daily_ops_desktop_adapter.py`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`

- [x] Sync generated report rows into the task ledger after report generation.
- [x] Add `/api/tasks`.
- [x] Add `/api/tasks/submit`.
- [x] Add `/api/tasks/review`.
- [x] Add `/api/tasks/export`.
- [x] Add matching CLI and Electron bridge commands.

### Task 3: Local Web Task Center

**Files:**
- Modify: `daily_ops_app.py`
- Test: `test_operation_tasks.py`

- [x] Replace the local web task panel with task summary cards, filters, task table, owner action, admin review, and export.
- [x] Keep weekly data import and report generation pages intact.

### Task 4: Next Phase

**Files:**
- Modify: `electron/renderer.html`
- Modify: `electron/renderer.js`
- Modify: `electron/renderer.css`
- Test: `test_desktop_app.py`

- [x] Add the same task center UI to the Electron desktop renderer.
- [x] Add a simple operator selector for 管理员 / 店长 and current user.
- [ ] Add task badges to the weekly report queue showing how many tasks each report generated. Deferred after the 5-day MVP because the task center already shows the generated ledger and export status.

### Task 5: Deployment Readiness

**Files:**
- Modify: `daily_ops_app.py`
- Modify: `README.md`

- [x] Add a LAN host setting so the workbench can bind to `0.0.0.0` when needed.
- [x] Document how admins start the workbench and how store owners access it on the local network.
- [x] Add lightweight operator sessions for LAN task APIs so owners are scoped to their own task list and only admins can review.
- [x] Add backup guidance and admin-only backup/restore entrypoints for `基础数据库/operation_tasks.json`, rules, basic database, owner table, and uploaded source folders.
