# Workbench Port Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the daily workbench web address to port 8876 so it no longer drifts between local services.

**Architecture:** The Python server owns the canonical port through `daily_ops_app.py`. The macOS and Windows launcher/stopper scripts must use the same port for health checks, browser opening, shutdown, and process cleanup. A regression test checks both the Python constant and the script text.

**Tech Stack:** Python `unittest`, local shell scripts, Windows batch scripts.

---

### Task 1: Lock the Workbench Port

**Files:**
- Create: `test_workbench_network_address.py`
- Modify: `daily_ops_app.py`
- Modify: `启动日常运营工作台.command`
- Modify: `停止日常运营工作台.command`
- Modify: `启动日常运营工作台.bat`
- Modify: `停止日常运营工作台.bat`

- [x] **Step 1: Write the failing test**

Create `test_workbench_network_address.py` with assertions that `daily_ops_app.PORT` is `8876`, the launcher/stopper scripts contain `127.0.0.1:8876`, and none of the startup/shutdown scripts contain old workbench ports.

- [x] **Step 2: Run the test to verify it fails**

Run: `/Users/levenwong/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest test_workbench_network_address`

Expected: FAIL because `daily_ops_app.PORT` and scripts still reference an old port.

- [x] **Step 3: Update server and scripts**

Change the server port constant to `8876`, then replace all launcher/stopper references with `8876`.

- [x] **Step 4: Run focused and full tests**

Run: `/Users/levenwong/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest test_workbench_network_address`

Run: `/Users/levenwong/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m unittest discover`

Expected: both commands pass.
