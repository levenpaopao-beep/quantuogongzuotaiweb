# ERP Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ERP settings dialog with an admin-only second-level page that keeps sync errors visible on the same page.

**Architecture:** Reuse the existing Electron renderer page system. Move ERP form markup out of the settings dialog into a standalone page, keep existing field bindings, and route the settings card to the new page.

**Tech Stack:** Electron renderer HTML/CSS/JavaScript plus existing Node check scripts.

---

### Task 1: Move ERP UI To A Page

**Files:**
- Modify: `electron/renderer.html`
- Modify: `electron/renderer.css`

- [x] Remove ERP form from `settingsModuleDialog`.
- [x] Add `#erpSettingsPage` with interface config, sync options, advanced settings, and sync result area.
- [x] Add compact page styles so fields are visible without the modal scroll problem.

### Task 2: Route ERP Settings Card

**Files:**
- Modify: `electron/renderer.js`

- [x] Make `openSettingsModule("erp-settings")` call `showPage("erpSettings")`.
- [x] Add `erpSettings` to `showPage` page map.
- [x] Keep the page title as `ERP 接口设置`.

### Task 3: Keep Errors In The ERP Page

**Files:**
- Modify: `electron/renderer.js`

- [x] Add `setErpStatus` for success, running, failed, and idle states.
- [x] Add `erpHumanMessage` to translate common interface failures into readable guidance.
- [x] Send save, local validation, sync success, and sync failure results to `#erpSyncResult`.
- [x] Keep raw technical detail in a collapsed area.

### Task 4: Fix Store ID Validation

**Files:**
- Modify: `electron/renderer.js`

- [x] Require shop ID only for sales outbound or shop query sync.
- [x] Allow product archive and warehouse stock sync with no shop ID.

### Task 5: Verification

**Files:**
- Modify: `electron/main.js`
- Modify: `scripts/check-modules.js`

- [x] Update UI journey check to expect ERP second-level page.
- [x] Update module check to assert ERP page and in-page sync result area exist.
- [x] Run focused ERP page checks.
- [x] Run `npm run check:render`.
- [ ] Run `npm run check:modules` cleanly. Current run is blocked by existing non-ERP failures in 今日工作台 and 销量管理 checks.
- [ ] Run `npm run check:ui` cleanly. Current run is blocked by an existing 店长视角接口检查 failure.
