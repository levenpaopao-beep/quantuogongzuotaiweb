const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const APP_NAME = "PETCIRCLE 运营工作台";
const PNG_ICON = path.join(__dirname, "assets", "petcircle-app-icon.png");
const ICNS_ICON = path.join(__dirname, "assets", "petcircle-app-icon.icns");

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
      reworked: payload.reworked || "",
      open_only: payload.open_only || "",
    },
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1488,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    title: APP_NAME,
    icon: process.platform === "darwin" ? ICNS_ICON : PNG_ICON,
    backgroundColor: "#f5f6f8",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
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
ipcMain.handle("api:assign-task", (_event, payload) => runPython("assign-task", [], JSON.stringify(payload || {})));
ipcMain.handle("api:review-task", (_event, payload) => runPython("review-task", [], JSON.stringify(payload || {})));
ipcMain.handle("api:batch-review-tasks", (_event, payload) => runPython("batch-review-tasks", [], JSON.stringify(payload || {})));
ipcMain.handle("api:done-task", (_event, payload) => runPython("done-task", [], JSON.stringify(payload || {})));
ipcMain.handle("api:export-tasks", (_event, payload) => runPython("export-tasks", [], JSON.stringify(taskPayload(payload || {}))));
ipcMain.handle("api:store-owners", (_event, payload) => runPython("store-owners", [], JSON.stringify(payload || {})));
ipcMain.handle("api:save-store-owners", (_event, payload) => runPython("save-store-owners", [], JSON.stringify(payload || {})));
ipcMain.handle("api:create-backup", (_event, payload) => runPython("create-backup", [], JSON.stringify(payload || {})));
ipcMain.handle("api:restore-backup", (_event, payload) => runPython("restore-backup", [], JSON.stringify(payload || {})));

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

ipcMain.handle("api:upload-source", (_event, group, filePaths, payload) => {
  if (!filePaths || !filePaths.length) throw new Error("请先选择要上传的文件");
  return runPython("import-source", [group.upload_target, ...filePaths], JSON.stringify(payload || {}));
});

ipcMain.handle("app:show-file", (_event, filePath) => shell.showItemInFolder(filePath));
