const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const main = fs.readFileSync(path.join(ROOT, "electron", "main.js"), "utf8");
const preload = fs.readFileSync(path.join(ROOT, "electron", "preload.js"), "utf8");
const renderer = fs.readFileSync(path.join(ROOT, "electron", "renderer.js"), "utf8");
const appPy = fs.readFileSync(path.join(ROOT, "daily_ops_app.py"), "utf8");
const cli = fs.readFileSync(path.join(ROOT, "daily_ops_cli.py"), "utf8");
const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
const releaseCheck = fs.readFileSync(path.join(ROOT, "scripts", "check-release.js"), "utf8");

function bundledPython() {
  const candidate = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3");
  if (fs.existsSync(candidate)) return candidate;
  return "python3";
}

function fail(message, details = []) {
  console.error(`\n安全体检未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

function expect(condition, message, details = []) {
  if (!condition) fail(message, details);
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

function cliJson(command, payload = {}, args = [], allowFailure = false) {
  const result = run(command, bundledPython(), ["daily_ops_cli.py", command, ...args], JSON.stringify(payload), allowFailure);
  try {
    return JSON.parse(result.stdout || "{}");
  } catch (error) {
    fail(`${command} 返回内容不是 JSON`, [error.message, result.stdout.slice(0, 500)]);
  }
}

expect(/contextIsolation:\s*true/.test(main), "Electron contextIsolation 未开启");
expect(/nodeIntegration:\s*false/.test(main), "Electron nodeIntegration 未关闭");
expect(!/enableRemoteModule:\s*true/.test(main), "Electron remote module 不应开启");
expect(!/webSecurity:\s*false/.test(main), "Electron webSecurity 不应关闭");
expect(!/allowRunningInsecureContent:\s*true/.test(main), "Electron 不应允许不安全内容");
expect(main.includes("win.loadFile(") && !/loadURL\(\s*["']http/i.test(main), "桌面端不应加载远程 HTTP 页面");

const exposedChannels = [...preload.matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)].map((match) => match[1]);
const directIpcExposure = /exposeInMainWorld\([^,]+,\s*ipcRenderer\s*\)/.test(preload)
  || /exposeInMainWorld\([^,]+,\s*\{[\s\S]*(?:ipcRenderer\s*:|ipcMain\s*:)/.test(preload)
  || /exposeInMainWorld\([^,]+,\s*ipcMain\s*\)/.test(preload);
expect(!directIpcExposure, "preload 不应直接暴露 ipcRenderer/ipcMain 对象");
const unsafeExposed = exposedChannels.filter((channel) => !channel.startsWith("api:"));
expect(!unsafeExposed.length, "preload 暴露了非 api 命名空间通道", unsafeExposed);
expect(!preload.includes("app:show-file"), "preload 不应暴露 app:show-file 这类底层文件通道");

const adminCommands = [
  ["generate-weekly", "生成本周报表"],
  ["load-rules", "读取规则"],
  ["save-rules", "维护规则"],
  ["open-output", "打开全局输出文件", ["missing.xlsx"]],
  ["reveal-output", "查看全局输出文件夹", ["missing.xlsx"]],
  ["store-owners", "读取负责人配置"],
  ["save-store-owners", "维护负责人配置"],
  ["task-suppressions", "查看屏蔽清单"],
  ["erp-sync", "同步ERP基础数据"],
  ["create-backup", "生成备份"],
  ["restore-backup", "恢复备份"],
];
adminCommands.forEach(([command, label, args = []]) => {
  const result = cliJson(command, { role: "owner", user: "__security_owner__", path: "/tmp/missing.zip" }, args, true);
  expect(!result.ok && String(result.error || "").includes("只有管理员"), `店长不应能${label}`, [command]);
});

const ownerStatus = cliJson("status", { role: "owner", user: "__security_owner__" });
expect(ownerStatus.ok, "店长状态接口应返回脱敏状态");
expect(Array.isArray(ownerStatus.data.outputs) && ownerStatus.data.outputs.length === 0, "店长状态不应返回全局输出文件");
expect(!ownerStatus.data.database?.path, "店长状态不应返回数据库路径");
expect(Object.keys(ownerStatus.data.tasks || {}).length === 0, "店长状态不应返回全局任务汇总");
expect(Object.keys(ownerStatus.data.report_tasks || {}).length === 0, "店长状态不应返回全局报表任务汇总");
expect((ownerStatus.data.source_groups || []).every((group) => !group.latest && !(group.pending_files || []).length), "店长状态不应返回全局数据源文件名");

const ownerOutputs = cliJson("outputs", { role: "owner", user: "__security_owner__" });
expect(ownerOutputs.ok && Array.isArray(ownerOutputs.data) && ownerOutputs.data.length === 0, "店长直查输出列表不应返回全局文件");
const ownerSourceGroups = cliJson("source-groups", { role: "owner", user: "__security_owner__" });
expect(ownerSourceGroups.ok, "店长源数据状态应返回脱敏列表");
expect((ownerSourceGroups.data || []).every((group) => !group.latest && !(group.pending_files || []).length), "店长直查源数据状态不应返回文件名");

expect(cli.includes("require_admin") && cli.includes("erp-sync") && cli.includes("restore-backup"), "CLI 管理员命令缺少统一权限入口");
expect(cli.includes('require_admin(read_payload(), "读取规则")'), "读取规则缺少管理员校验");
expect(cli.includes('require_admin(read_payload(), "打开全局输出文件")'), "打开全局输出文件缺少管理员校验");
expect(cli.includes('require_admin(read_payload(), "查看全局输出文件夹")'), "查看全局输出文件夹缺少管理员校验");
expect(main.includes('runPython("outputs", [limit || 80], JSON.stringify(payload || {}))'), "输出列表 IPC 未传当前身份");
expect(main.includes('runPython("load-rules", [], JSON.stringify(payload || {}))'), "读取规则 IPC 未传当前身份");
expect(renderer.includes("api.loadRules(operatorPayload())"), "前端读取规则未传当前身份");
expect(renderer.includes("api.openOutput(latest.name, operatorPayload())") && renderer.includes("api.revealOutput(item.name, operatorPayload())"), "前端打开输出未传当前身份");
expect(appPy.includes("allowed_roots") && appPy.includes("allowed_files"), "备份恢复缺少白名单");
expect(appPy.includes("target = (ROOT / name).resolve()"), "备份恢复缺少目标路径 resolve");
expect(appPy.includes("ROOT.resolve() not in target.parents"), "备份恢复缺少路径穿越拦截");
expect(appPy.includes("outputs") && appPy.includes("图片产物"), "备份清单缺少产物排除说明");
expect(gitignore.includes(".env") && gitignore.includes("*.pem") && gitignore.includes("*token*"), "本地密钥和授权文件缺少 git 忽略规则");
expect(releaseCheck.includes("\\.env") && releaseCheck.includes("token|secret") && releaseCheck.includes("pem|key"), "发布范围检查缺少密钥和 token 文件拦截");

const release = run("发布范围检查", process.execPath, [path.join(ROOT, "scripts", "check-release.js")]);
expect(release.status === 0, "发布范围检查失败");

console.log(`安全体检通过：Electron 隔离配置、IPC 暴露、管理员权限、备份恢复白名单和发布范围均已检查。`);
