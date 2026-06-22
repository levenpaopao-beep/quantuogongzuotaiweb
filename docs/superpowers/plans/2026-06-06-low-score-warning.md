# 店铺低分产品预警 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有日常运营工作台中新增店铺低分产品预警模块，支持批次上传、历史自动归档、Temu/ERP 联查和固定格式输出。

**Architecture:** 低分预警逻辑放入独立脚本 `generate_low_score_warning.py`，工作台 `daily_ops_app.py` 只负责数据源接入、运行入口和页面展示。历史对比通过归档目录和状态文件管理，避免与当前批次自比对。

**Tech Stack:** Python 3、openpyxl、现有 raw_xlsx 读取工具、内置 HTTP 工作台

---

### Task 1: 建立低分预警核心测试

**Files:**
- Modify: `test_low_score_warning.py`
- Test: `test_low_score_warning.py`

- [ ] **Step 1: 覆盖新增/历史/下架/去重行为**
- [ ] **Step 2: 增加稀疏输入表不串列测试**
- [ ] **Step 3: 运行 `python3 -m unittest test_low_score_warning.py` 并确认通过**

### Task 2: 实现独立低分预警脚本

**Files:**
- Create: `generate_low_score_warning.py`

- [ ] **Step 1: 实现低分输入表读取与 `SPU` 去重**
- [ ] **Step 2: 实现历史归档读取与新增判定**
- [ ] **Step 3: 实现 Temu 销售表、ERP、爆旺款、负责人联查**
- [ ] **Step 4: 实现固定字段输出、统计页和说明页**
- [ ] **Step 5: 实现归档目录与状态文件更新**

### Task 3: 工作台接入

**Files:**
- Modify: `daily_ops_app.py`

- [ ] **Step 1: 新增上传分类 `low_score_input`**
- [ ] **Step 2: 新增报表卡片 `low_score_warning`**
- [ ] **Step 3: 新增每周数据源展示项**
- [ ] **Step 4: 新增 `run_low_score_warning` 调用入口**
- [ ] **Step 5: 将该模块接入 `run_report` 与每周自动任务**

### Task 4: 真实样表验证

**Files:**
- Verify: `低分预警输入表/`
- Verify: `低分预警历史归档/`
- Verify: `outputs/`

- [ ] **Step 1: 将用户提供的 `低分预警表.xlsx` 登记为当前数据源**
- [ ] **Step 2: 运行低分预警报表生成**
- [ ] **Step 3: 抽查输出字段顺序、统计结果和归档状态**
- [ ] **Step 4: 运行 `python3 -m py_compile daily_ops_app.py generate_low_score_warning.py`**

### Task 5: 交付与重启

**Files:**
- Modify: `daily_ops_app.py`

- [ ] **Step 1: 重启工作台服务**
- [ ] **Step 2: 确认新模块在页面中可见**
- [ ] **Step 3: 向用户说明输出文件、归档逻辑与当前验证结果**
