# Weekly Data Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weekly data workflow to the existing daily operations workbench, excluding Temu bargain replies.

**Architecture:** Extend `daily_ops_app.py` instead of building a separate app. Track uploaded source status in a small JSON manifest, generate all weekly reports through one endpoint, and expose the flow in a new workbench tab.

**Tech Stack:** Python standard library HTTP server, `openpyxl`, existing report generator scripts, local `outputs` folder.

---

### Task 1: Data Source Status

**Files:**
- Modify: `daily_ops_app.py`

- [ ] Add `SHEIN_DIR`, `DATA_SOURCE_MANIFEST`, weekly source category metadata, and SHA-256 helpers.
- [ ] Update `/api/status` so it returns source groups with latest file, modified time, row count when readable, and update status.
- [ ] Update upload handling so each successful upload records category, file path, file size, hash, and time.

### Task 2: Shein Report Entrypoints

**Files:**
- Modify: `daily_ops_app.py`

- [ ] Add `run_shein_price(output)` using the existing `generate_shein_price_abnormal.py` logic.
- [ ] Add `run_shein_inventory(output)` by loading `generate_shein_inventory_abnormal_v2.py` with project-local paths.
- [ ] Add `run_shein_hot(output)` by loading `shein_hot_warning_v11_analysis.py`, building the three required sheets with `openpyxl`, and saving directly to `outputs`.
- [ ] Add Shein reports to `REPORTS` and `run_report`.

### Task 3: Weekly Package

**Files:**
- Modify: `daily_ops_app.py`

- [ ] Add `run_weekly_reports()` that runs all non-bargain reports: Temu price, Temu inventory, Temu hot warning, Temu slow-moving weekly if source exists, Shein price, Shein inventory, Shein hot warning.
- [ ] Return a structured result with successful files and skipped/failed reports.
- [ ] Add `/api/weekly/run`.

### Task 4: Interactive Weekly UI

**Files:**
- Modify: `daily_ops_app.py`

- [ ] Add a `每周工作流` navigation tab.
- [ ] Show required source groups: ERP 产品数据源, Temu 销售表, Shein 销售表, Temu 爆旺款表.
- [ ] Provide upload controls for each source group, show latest file and updated/unchanged state.
- [ ] Add `生成本周报表` button and render all generated download links.

### Task 5: Verification

**Files:**
- Modify: `daily_ops_app.py`

- [ ] Run Python syntax check for modified scripts.
- [ ] Call status and weekly generation functions from Python to confirm they return structured results.
- [ ] Start the local workbench server and verify the page loads if the port is free.
