# 基础资料与历史销量导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持从负责人表和跨境运营总表导入基础资料、生成店长账号、查询历史销量，并提醒管理员每月备份。

**Architecture:** 新增 `daily_ops_master_data.py` 承担 Excel 解析、账号密码摘要、历史销量记录转换和查询汇总。现有 `daily_ops_app.py` 只暴露保存、导入、查询和备份提醒入口，Electron 前端调用 CLI 桥接。历史和每日填报共用 `daily_sales.json`。

**Tech Stack:** Python 3、openpyxl、JSON 文件存储、Electron IPC、现有桌面工作台。

---

### Task 1: 基础资料解析与账号生成

**Files:**
- Create: `daily_ops_master_data.py`
- Test: `test_daily_ops_master_data.py`

- [ ] 写失败测试：负责人表解析出平台、店铺、店名、负责人。
- [ ] 写失败测试：同一负责人只生成一个店长账号，密码保存为摘要并返回一次性初始密码。
- [ ] 实现解析、密码摘要和保存账号。
- [ ] 运行 `python3 -m unittest test_daily_ops_master_data.py`。

### Task 2: 历史销量导入与查询

**Files:**
- Modify: `daily_ops_master_data.py`
- Modify: `daily_ops_sales.py`
- Test: `test_daily_ops_master_data.py`
- Test: `test_daily_ops_sales.py`

- [ ] 写失败测试：运营总表月度 sheet 拆成日期、平台、店铺、销量。
- [ ] 写失败测试：导入历史销量不覆盖已有人工填写记录。
- [ ] 写失败测试：按平台、店铺、时间范围汇总返回总销量、日均、平台汇总、店铺汇总。
- [ ] 实现历史销量导入和查询。
- [ ] 运行相关 Python 单元测试。

### Task 3: 桌面后端接口

**Files:**
- Modify: `daily_ops_app.py`
- Modify: `daily_ops_desktop_adapter.py`
- Modify: `daily_ops_cli.py`
- Test: `test_desktop_app.py`
- Test: `test_operation_tasks.py`

- [ ] 写失败测试：CLI 可导入负责人表、历史销量表、查询销量报表、重置账号密码。
- [ ] 实现 app/adapter/cli 入口和权限检查，管理员才能导入和维护账号。
- [ ] 运行桌面接口测试。

### Task 4: Electron 界面

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `electron/renderer.html`
- Modify: `electron/renderer.js`
- Modify: `electron/renderer.css`
- Modify: `scripts/check-ui.js`

- [ ] 在基础资料页增加负责人导入、历史销量导入、账号列表和重置密码。
- [ ] 在销量管理页增加报表查询筛选和结果区。
- [ ] 增加月度备份提醒。
- [ ] 运行 UI 绑定检查。

### Task 5: 生成整理后的导入表

**Files:**
- Output: `/Users/levenwong/Downloads/基础信息导入整理表.xlsx`

- [ ] 从两个源表生成整理版 Excel，包含店铺负责人、店长账号、历史销量样例/统计。
- [ ] 验证文件可打开且关键 sheet 有数据。

### Task 6: 完整验证

- [ ] 运行 Python 单元测试。
- [ ] 运行桌面 UI 检查。
- [ ] 检查 git diff，确认没有批量删除或产物纳入代码范围。
