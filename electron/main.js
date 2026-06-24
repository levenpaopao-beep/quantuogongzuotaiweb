const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const APP_NAME = "PETCIRCLE跨境工作台";
const PNG_ICON = path.join(__dirname, "assets", "petcircle-app-icon.png");
const ICNS_ICON = path.join(__dirname, "assets", "petcircle-app-icon.icns");

function appIcon() {
  if (process.platform === "darwin" && fs.existsSync(ICNS_ICON)) return ICNS_ICON;
  if (fs.existsSync(PNG_ICON)) return PNG_ICON;
  return undefined;
}

function bundledPython() {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"),
    "python3",
  ];
  return candidates.find((candidate) => candidate === "python3" || fs.existsSync(candidate));
}

function pythonEnv() {
  const sitePackages = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages");
  const env = { ...process.env };
  if (fs.existsSync(sitePackages)) {
    env.PYTHONPATH = env.PYTHONPATH ? `${sitePackages}${path.delimiter}${env.PYTHONPATH}` : sitePackages;
  }
  return env;
}

function nodeRuntime() {
  const candidates = [
    process.env.npm_node_execpath,
    path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"),
    "node",
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === "node" || fs.existsSync(candidate)) || "node";
}

function runPython(command, args = [], input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(bundledPython(), [path.join(ROOT, "daily_ops_cli.py"), command, ...args.map(String)], {
      cwd: ROOT,
      env: pythonEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", () => {
      try {
        const payload = JSON.parse(stdout || "{}");
        if (!payload.ok) {
          reject(new Error(payload.error || stderr || "Python 命令执行失败"));
          return;
        }
        resolve(payload.data);
      } catch (error) {
        reject(new Error(stderr || error.message));
      }
    });
    child.stdin.end(input);
  });
}

function runNodeScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeRuntime(), [path.join(ROOT, "scripts", scriptName)], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const output = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
      if (code !== 0) {
        reject(new Error(output || "自检执行失败"));
        return;
      }
      resolve({ output });
    });
  });
}

function taskPayload(payload = {}) {
  return {
    ...payload,
    filters: payload.filters || {
      role: payload.role || "admin",
      user: payload.user || "",
      status: payload.status || "",
      task_type: payload.task_type || "",
      store: payload.store || "",
      platform: payload.platform || "",
      overdue: payload.overdue || "",
      unassigned: payload.unassigned || "",
      next_handler: payload.next_handler || "",
      priority: payload.priority || "",
      reworked: payload.reworked || "",
      open_only: payload.open_only || "",
      search: payload.search || "",
    },
  };
}

function renderSmokeScript() {
  return `
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (predicate, timeout = 12000) => {
        const started = Date.now();
        while (Date.now() - started < timeout) {
          if (predicate()) return true;
          await sleep(160);
        }
        return false;
      };
      const errors = [];
      const visible = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const requireVisible = (selector, label) => {
        if (!visible(selector)) errors.push(label + "不可见");
      };
      const requireText = (selector, text, label) => {
        const value = document.querySelector(selector)?.textContent || "";
        if (!value.includes(text)) errors.push(label + "缺少“" + text + "”");
      };
      localStorage.setItem("dailyOpsOperator", JSON.stringify({ role: "admin", user: "管理员" }));
      const role = document.querySelector("#operatorRole");
      const user = document.querySelector("#operatorUser");
      const switchButton = document.querySelector("#saveOperatorBtn");
      if (role && user && switchButton) {
        role.value = "admin";
        user.value = "管理员";
        switchButton.click();
      }
      await waitFor(() =>
        document.querySelectorAll("#todayWorkflowSteps .workflow-step").length >= 4 &&
        document.querySelectorAll("#todayGuideSteps .guide-step").length >= 6 &&
        document.querySelectorAll("#todayActionList .action-route").length >= 4
      );
      requireText("title", "PETCIRCLE跨境工作台", "窗口标题");
      requireVisible(".sidebar", "侧边导航");
      requireVisible("#todayPage.page-active", "今日工作台首屏");
      requireVisible("#todayWorkflowSteps .workflow-step", "今日流程卡片");
      requireVisible("#todayGuideSteps .guide-step", "开始使用清单");
      requireVisible("#todaySalesMetrics .metric-card", "销量指标");
      requireVisible("#todayActionList .action-route", "今日待办入口");
      if (document.body.scrollWidth > window.innerWidth + 8) {
        errors.push("首屏存在横向溢出：" + document.body.scrollWidth + " > " + window.innerWidth);
      }
      const brokenImages = Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0);
      if (brokenImages.length) errors.push("存在破图：" + brokenImages.length);
      document.querySelector('[data-page="sales"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      requireVisible("#salesPage.page-active", "销量管理页面");
      requireVisible("#salesFocusBar", "销量筛选条");
      document.querySelector('[data-page="tasks"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      requireVisible("#tasksPage.page-active", "商品任务页面");
      requireVisible("#taskWorkbar", "任务工作条");
      requireVisible('[data-admin-only="task-push"]', "管理员批量推送按钮");
      requireVisible('[data-admin-only="task-review"]', "管理员批量确认按钮");
      document.querySelector('[data-page="imports"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      requireVisible("#importPage.page-active", "数据导入页面");
      requireVisible("#importHealthBar", "导入健康条");
      requireVisible('[data-admin-only="report-generate"]', "管理员生成就绪报表按钮");
      if (role && user && switchButton) {
        role.value = "owner";
        user.value = "";
        switchButton.click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (!user.classList.contains("field-error")) errors.push("店长空姓名未提示错误");
        const ownerName = document.querySelector("#operatorOwnerOptions option")?.value || "";
        if (!ownerName) {
          errors.push("缺少可用店长候选");
        } else {
          role.value = "owner";
          user.value = ownerName;
          switchButton.click();
          await waitFor(() => {
            try {
              const operator = JSON.parse(localStorage.getItem("dailyOpsOperator") || "{}");
              return operator.role === "owner" &&
                operator.user === ownerName &&
                document.querySelector("#operatorHint")?.textContent.includes("只看自己") &&
                document.querySelector("#todayWorkflowTitle")?.textContent.includes("店长每日流程");
            } catch (_error) {
              return false;
            }
          });
          requireText("#todayWorkflowTitle", "店长每日流程", "店长工作流");
          document.querySelector('[data-page="tasks"]')?.click();
          await new Promise((resolve) => setTimeout(resolve, 80));
          requireVisible('[data-owner-only="task-submit"]', "店长整包处理按钮");
          if (visible('[data-admin-only="task-push"]')) errors.push("店长视角仍显示管理员推送按钮");
          if (visible('[data-admin-only="task-review"]')) errors.push("店长视角仍显示管理员确认按钮");
          document.querySelector('[data-page="imports"]')?.click();
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (visible('[data-admin-only="report-generate"]')) errors.push("店长视角仍显示管理员报表生成按钮");
        }
        role.value = "admin";
        user.value = "管理员";
        switchButton.click();
        await new Promise((resolve) => setTimeout(resolve, 80));
      } else {
        errors.push("角色切换控件缺失");
      }
      return {
        ok: errors.length === 0,
        errors,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scroll: { width: document.body.scrollWidth, height: document.body.scrollHeight },
        activeTitle: document.querySelector("#pageTitle")?.textContent || "",
      };
    })();
  `;
}

async function runRenderSmoke(win) {
  try {
    const result = await win.webContents.executeJavaScript(renderSmokeScript(), true);
    if (!result.ok) {
      console.error(`渲染烟测未通过：${result.errors.join("；")}`);
      console.error(`渲染烟测诊断：${JSON.stringify(result)}`);
      app.exit(1);
      return;
    }
    console.log(`渲染烟测通过：${result.viewport.width}x${result.viewport.height} 首屏、导航、管理员/店长跨页面权限按钮、破图和横向溢出均已检查。`);
    app.exit(0);
  } catch (error) {
    console.error(`渲染烟测执行失败：${error.message || error}`);
    app.exit(1);
  }
}

function createWindow() {
  const smokeMode = process.env.PETCIRCLE_RENDER_SMOKE === "1";
  const win = new BrowserWindow({
    width: 1488,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    show: !smokeMode,
    title: APP_NAME,
    icon: appIcon(),
    backgroundColor: "#f5f6f8",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (smokeMode) {
    win.webContents.once("did-finish-load", () => runRenderSmoke(win));
  }
  win.loadFile(path.join(__dirname, "renderer.html"));
}

app.whenReady().then(() => {
  app.name = APP_NAME;
  if (process.platform === "darwin" && app.dock && fs.existsSync(PNG_ICON)) {
    app.dock.setIcon(PNG_ICON);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("api:status", () => runPython("status"));
ipcMain.handle("api:outputs", (_event, limit) => runPython("outputs", [limit || 80]));
ipcMain.handle("api:reports", () => runPython("reports"));
ipcMain.handle("api:source-groups", () => runPython("source-groups"));
ipcMain.handle("api:finish-upload", (_event, category, payload) => runPython("finish-upload", [category], JSON.stringify(payload || {})));
ipcMain.handle("api:clear-upload", (_event, category, payload) => runPython("clear-upload", [category], JSON.stringify(payload || {})));
ipcMain.handle("api:generate-weekly", (_event, payload) => runPython("generate-weekly", [], JSON.stringify(payload || {})));
ipcMain.handle("api:generate-report", (_event, reportId, version, payload) => runPython("generate-report", [reportId, version || "V1"], JSON.stringify(payload || {})));
ipcMain.handle("api:open-output", (_event, name) => runPython("open-output", [name]));
ipcMain.handle("api:reveal-output", (_event, name) => runPython("reveal-output", [name]));
ipcMain.handle("api:load-rules", () => runPython("load-rules"));
ipcMain.handle("api:save-rules", (_event, payload) => runPython("save-rules", [], JSON.stringify(payload || {})));
ipcMain.handle("api:search", (_event, query, limit, payload) => runPython("search", [query, limit || 200], JSON.stringify(payload || {})));
ipcMain.handle("api:tasks", (_event, payload) => runPython("tasks", [], JSON.stringify(taskPayload(payload || {}))));
ipcMain.handle("api:submit-task", (_event, payload) => runPython("submit-task", [], JSON.stringify(payload || {})));
ipcMain.handle("api:batch-submit-tasks", (_event, payload) => runPython("batch-submit-tasks", [], JSON.stringify(payload || {})));
ipcMain.handle("api:push-tasks", (_event, payload) => runPython("push-tasks", [], JSON.stringify(payload || {})));
ipcMain.handle("api:assign-task", (_event, payload) => runPython("assign-task", [], JSON.stringify(payload || {})));
ipcMain.handle("api:review-task", (_event, payload) => runPython("review-task", [], JSON.stringify(payload || {})));
ipcMain.handle("api:batch-review-tasks", (_event, payload) => runPython("batch-review-tasks", [], JSON.stringify(payload || {})));
ipcMain.handle("api:confirm-tasks", (_event, payload) => runPython("confirm-tasks", [], JSON.stringify(payload || {})));
ipcMain.handle("api:task-suppressions", (_event, payload) => runPython("task-suppressions", [], JSON.stringify(payload || {})));
ipcMain.handle("api:suppress-tasks", (_event, payload) => runPython("suppress-tasks", [], JSON.stringify(payload || {})));
ipcMain.handle("api:done-task", (_event, payload) => runPython("done-task", [], JSON.stringify(payload || {})));
ipcMain.handle("api:done-tasks", (_event, payload) => runPython("done-tasks", [], JSON.stringify(payload || {})));
ipcMain.handle("api:export-tasks", (_event, payload) => runPython("export-tasks", [], JSON.stringify(taskPayload(payload || {}))));
ipcMain.handle("api:store-owners", (_event, payload) => runPython("store-owners", [], JSON.stringify(payload || {})));
ipcMain.handle("api:save-store-owners", (_event, payload) => runPython("save-store-owners", [], JSON.stringify(payload || {})));
ipcMain.handle("api:sales", (_event, payload) => runPython("sales", [], JSON.stringify(payload || {})));
ipcMain.handle("api:submit-sales", (_event, payload) => runPython("submit-sales", [], JSON.stringify(payload || {})));
ipcMain.handle("api:export-sales", (_event, payload) => runPython("export-sales", [], JSON.stringify(payload || {})));
ipcMain.handle("api:sales-compare", (_event, payload) => runPython("sales-compare", [], JSON.stringify(payload || {})));
ipcMain.handle("api:import-matrix", (_event, payload) => runPython("import-matrix", [], JSON.stringify(payload || {})));
ipcMain.handle("api:erp-sync", (_event, payload) => runPython("erp-sync", [], JSON.stringify(payload || {})));
ipcMain.handle("api:create-backup", (_event, payload) => runPython("create-backup", [], JSON.stringify(payload || {})));
ipcMain.handle("api:restore-backup", (_event, payload) => runPython("restore-backup", [], JSON.stringify(payload || {})));
ipcMain.handle("api:run-doctor", () => runNodeScript("doctor.js"));
ipcMain.handle("api:run-ready-check", () => runNodeScript("check-ready.js"));

ipcMain.handle("api:select-files", async (_event, group) => {
  const result = await dialog.showOpenDialog({
    title: `选择${group.name}`,
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "表格文件", extensions: ["xlsx", "xls", "csv"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
});

ipcMain.handle("api:select-backup", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择运营状态备份",
    properties: ["openFile"],
    filters: [
      { name: "备份文件", extensions: ["zip"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return "";
  return result.filePaths[0];
});

ipcMain.handle("api:upload-source", (_event, group, filePaths, payload) => {
  if (!filePaths || !filePaths.length) throw new Error("请先选择要上传的文件");
  return runPython("import-source", [group.upload_target, ...filePaths], JSON.stringify(payload || {}));
});

ipcMain.handle("app:show-file", (_event, filePath) => shell.showItemInFolder(filePath));
