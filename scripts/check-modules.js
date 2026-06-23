const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "electron", "renderer.html"), "utf8");
const renderer = fs.readFileSync(path.join(ROOT, "electron", "renderer.js"), "utf8");
const preload = fs.readFileSync(path.join(ROOT, "electron", "preload.js"), "utf8");
const main = fs.readFileSync(path.join(ROOT, "electron", "main.js"), "utf8");

function bundledPython() {
  const candidate = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3");
  if (fs.existsSync(candidate)) return candidate;
  return "python3";
}

function fail(message, details = []) {
  console.error(`\n模块体检未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

function run(label, command, args, input = "", allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 && !allowFailure) {
    fail(`${label} 执行失败`, [(result.stdout || result.stderr || "没有返回内容").slice(0, 1200)]);
  }
  return result;
}

function runCli(command, payload = {}, args = []) {
  const result = run(command, bundledPython(), ["daily_ops_cli.py", command, ...args.map(String)], JSON.stringify(payload));
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch (error) {
    fail(`${command} 返回内容不是 JSON`, [error.message, result.stdout.slice(0, 500)]);
  }
  if (!parsed.ok) fail(`${command} 返回失败`, [parsed.error || "未知错误"]);
  return parsed.data;
}

function expect(condition, message, details = []) {
  if (!condition) fail(message, details);
}

function hasPage(pageId, navPage) {
  return html.includes(`id="${pageId}"`) && html.includes(`data-page="${navPage}"`);
}

function hasButton(id) {
  return html.includes(`id="${id}"`) && renderer.includes(`#${id}`);
}

function hasApi(name, channel) {
  return preload.includes(`${name}:`) && preload.includes(`"${channel}"`) && main.includes(`ipcMain.handle("${channel}"`);
}

const admin = { role: "admin", user: "管理员" };
const owner = { role: "owner", user: "__module_check_owner__" };

const status = runCli("status", admin);
const reports = runCli("reports", admin);
const sales = runCli("sales", admin);
const tasks = runCli("tasks", { ...admin, filters: { role: "admin", open_only: "1" } });
const importMatrix = runCli("import-matrix", admin);
const rules = runCli("load-rules", admin);
const salesCompare = runCli("sales-compare", admin);
const erpSync = runCli("erp-sync", admin);

const modules = [
  {
    name: "今日工作台",
    checks: [
      ["有首页入口和页面", hasPage("todayPage", "today")],
      ["有角色化工作流导航", html.includes("todayWorkflowSteps") && renderer.includes("renderTodayWorkflow")],
      ["有开始使用清单", html.includes("todayGuideSteps") && renderer.includes("renderTodayGuide")],
    ],
  },
  {
    name: "销量管理",
    checks: [
      ["有销量页面入口", hasPage("salesPage", "sales")],
      ["有今日清单和提交按钮", html.includes("salesEntryList") && renderer.includes("submitSalesEntry")],
      ["有未填/异常/全部快速筛选", html.includes("salesFocusBar") && renderer.includes("setSalesFocus") && renderer.includes("salesFocusEntries")],
      ["有导出销量接口", hasButton("exportSalesBtn") && hasApi("exportSales", "api:export-sales")],
      ["CLI 返回销量结构", Array.isArray(sales.entries) && sales.summary && Array.isArray(sales.platforms)],
      ["差异提醒结构可用", Array.isArray(salesCompare.rows) && salesCompare.summary],
    ],
  },
  {
    name: "商品任务",
    checks: [
      ["有任务页面入口", hasPage("tasksPage", "tasks")],
      ["有整包处理和批量按钮", hasButton("batchPushTasksBtn") && hasButton("batchSubmitTasksBtn") && hasButton("batchApproveTasksBtn")],
      ["有任务导出接口", hasButton("exportTasksBtn") && hasApi("exportTasks", "api:export-tasks")],
      ["CLI 返回任务、任务包和汇总", Array.isArray(tasks.tasks) && Array.isArray(tasks.packages) && tasks.summary],
      ["店长提交、管理员确认接口存在", hasApi("submitTask", "api:submit-task") && hasApi("confirmTasks", "api:confirm-tasks")],
    ],
  },
  {
    name: "数据导入",
    checks: [
      ["有导入页面入口", hasPage("importPage", "imports")],
      ["有数据源表和缺失矩阵", html.includes("sourceRows") && html.includes("importMatrixRows")],
      ["有选择、上传、结束上传接口", hasApi("selectFiles", "api:select-files") && hasApi("uploadSource", "api:upload-source") && hasApi("finishUpload", "api:finish-upload")],
      ["CLI 返回缺失矩阵结构", Array.isArray(importMatrix.rows) && importMatrix.summary],
      ["状态返回数据源分组", Array.isArray(status.source_groups)],
    ],
  },
  {
    name: "经营报表",
    checks: [
      ["有报表页面入口", hasPage("reportsPage", "reports")],
      ["有报表卡片和输出记录", html.includes("reportCards") && html.includes("outputRows")],
      ["有生成报表接口", hasApi("generateReport", "api:generate-report") && hasApi("generateWeekly", "api:generate-weekly")],
      ["CLI 返回报表配置", reports && typeof reports === "object" && Object.keys(reports).length > 0],
    ],
  },
  {
    name: "基础资料",
    checks: [
      ["有基础资料页面入口", hasPage("masterDataPage", "masterdata")],
      ["有平台和店铺负责人维护", hasButton("addPlatformBtn") && hasButton("saveStoreOwnersBtn")],
      ["有负责人接口", hasApi("storeOwners", "api:store-owners") && hasApi("saveStoreOwners", "api:save-store-owners")],
      ["店铺跨平台重复会被后端拦截", (() => {
        const result = run("save-store-owners duplicate", bundledPython(), ["daily_ops_cli.py", "save-store-owners"], JSON.stringify({
          ...admin,
          assignments: [
            { platform: "Temu", store: "__module_check_store__", owner: "小琴" },
            { platform: "Shein", store: "__module_check_store__", owner: "洁琳" },
          ],
        }), true);
        try {
          const parsed = JSON.parse(result.stdout || "{}");
          return !parsed.ok && String(parsed.error || "").includes("不能同时归属");
        } catch (_error) {
          return false;
        }
      })()],
    ],
  },
  {
    name: "系统设置和 ERP",
    checks: [
      ["有系统设置页面入口", hasPage("rulesPage", "rules")],
      ["有 ERP 配置和手动同步按钮", hasButton("manualErpSyncBtn") && hasButton("saveErpSettingsBtn")],
      ["有规则保存接口", hasApi("loadRules", "api:load-rules") && hasApi("saveRules", "api:save-rules")],
      ["ERP 同步安全返回", ["blocked", "synced"].includes(erpSync.status)],
      ["规则结构可读取", rules && typeof rules === "object"],
    ],
  },
  {
    name: "备份和安全",
    checks: [
      ["有备份和恢复入口", hasButton("createBackupBtn") && hasButton("restoreBackupBtn")],
      ["有备份接口", hasApi("createBackup", "api:create-backup") && hasApi("restoreBackup", "api:restore-backup")],
      ["店长不能调用管理员接口", (() => {
        const result = run("owner backup denied", bundledPython(), ["daily_ops_cli.py", "create-backup"], JSON.stringify(owner), true);
        try {
          const parsed = JSON.parse(result.stdout || "{}");
          return !parsed.ok && String(parsed.error || "").includes("只有管理员");
        } catch (_error) {
          return false;
        }
      })()],
      ["发布范围排除业务数据和产物", run("check-release", process.execPath, [path.join(ROOT, "scripts", "check-release.js")]).status === 0],
    ],
  },
];

const failed = [];
modules.forEach((module) => {
  module.checks.forEach(([label, passed]) => {
    if (!passed) failed.push(`${module.name}：${label}`);
  });
});

if (failed.length) {
  fail("存在未通过模块", failed);
}

console.log(`模块体检通过：${modules.length} 个模块、${modules.reduce((sum, item) => sum + item.checks.length, 0)} 个检查点均已通过。`);
