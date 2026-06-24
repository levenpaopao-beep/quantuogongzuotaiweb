const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function bundledPython() {
  const candidate = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3");
  if (fs.existsSync(candidate)) return candidate;
  return "python3";
}

function fail(message, details = []) {
  console.error(`\n角色旅程检查未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

function runCliRaw(command, payload = {}, args = [], options = {}) {
  const result = spawnSync(bundledPython(), ["daily_ops_cli.py", command, ...args.map(String)], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    fail(`${command} 命令执行失败`, [(result.stdout || result.stderr || "没有返回内容").slice(0, 1200)]);
  }
  try {
    return JSON.parse(result.stdout || "{}");
  } catch (error) {
    fail(`${command} 返回内容不是 JSON`, [error.message, result.stdout.slice(0, 500)]);
  }
}

function runCli(command, payload = {}, args = []) {
  const parsed = runCliRaw(command, payload, args);
  if (!parsed.ok) fail(`${command} 返回失败`, [parsed.error || "未知错误"]);
  return parsed.data;
}

function expectObject(label, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail(`${label} 返回结构异常`, [`期望对象，实际：${typeof data}`]);
  }
}

function expectArray(label, value) {
  if (!Array.isArray(value)) fail(`${label} 需要是列表`);
}

const admin = { role: "admin", user: "管理员" };

const sales = runCli("sales", admin);
expectObject("管理员销量", sales);
expectArray("管理员销量 entries", sales.entries);

const importMatrix = runCli("import-matrix", admin);
expectObject("管理员导入矩阵", importMatrix);
expectArray("管理员导入矩阵 rows", importMatrix.rows);

const taskOverview = runCli("tasks", { ...admin, filters: { role: "admin", open_only: "1" } });
expectObject("管理员任务总览", taskOverview);
expectArray("管理员任务 packages", taskOverview.packages);
expectArray("管理员任务 tasks", taskOverview.tasks);

[
  { status: "待推送", label: "管理员推送任务入口" },
  { status: "待管理员审核", label: "管理员确认任务入口" },
  { status: "待店长处理", label: "店长处理进度入口" },
].forEach((route) => {
  const payload = runCli("tasks", {
    ...admin,
    filters: { role: "admin", status: route.status, open_only: "1" },
  });
  expectObject(route.label, payload);
  expectArray(`${route.label} tasks`, payload.tasks);
  if (payload.tasks.some((task) => task.status !== route.status)) {
    fail(`${route.label} 筛选口径异常`, [`出现了非 ${route.status} 状态的任务`]);
  }
});

const ownersFromTasks = Object.keys(taskOverview.summary?.owner_status || {}).filter((name) => name && name !== "未分配");
const ownersFromSales = [...new Set((sales.entries || []).map((entry) => entry.owner).filter(Boolean))];
const ownersFromImport = [...new Set((importMatrix.rows || []).map((row) => row.owner).filter(Boolean))];
const ownerName = ownersFromTasks[0] || ownersFromSales[0] || ownersFromImport[0];

if (ownerName) {
  const owner = { role: "owner", user: ownerName };
  const ownerSales = runCli("sales", owner);
  expectObject("店长销量", ownerSales);
  expectArray("店长销量 entries", ownerSales.entries);
  if (ownerSales.entries.some((entry) => entry.owner !== ownerName)) {
    fail("店长销量越权", [`${ownerName} 的销量清单里出现其他负责人店铺`]);
  }
  if ((ownerSales.records || []).some((record) => record.owner !== ownerName)) {
    fail("店长销量记录越权", [`${ownerName} 的最近销量记录里出现其他负责人店铺`]);
  }
  const ownerSalesCompare = runCli("sales-compare", owner);
  expectObject("店长销量差异提醒", ownerSalesCompare);
  expectArray("店长销量差异提醒 rows", ownerSalesCompare.rows);
  if (ownerSalesCompare.rows.some((row) => row.owner !== ownerName)) {
    fail("店长销量差异越权", [`${ownerName} 的销量差异提醒里出现其他负责人店铺`]);
  }

  const ownerTasks = runCli("tasks", { ...owner, filters: { role: "owner", user: ownerName, open_only: "1" } });
  expectObject("店长任务", ownerTasks);
  expectArray("店长任务 tasks", ownerTasks.tasks);
  if (ownerTasks.tasks.some((task) => task.owner !== ownerName)) {
    fail("店长任务越权", [`${ownerName} 的任务清单里出现其他负责人任务`]);
  }
  if (ownerTasks.tasks.some((task) => task.status === "待推送")) {
    fail("店长提前看到未推送任务", ["待推送任务必须由管理员确认推送后才进入店长视角。"]);
  }

  const ownerPending = runCli("tasks", {
    ...owner,
    filters: { role: "owner", user: ownerName, status: "待店长处理", open_only: "1" },
  });
  expectArray("店长待处理任务 tasks", ownerPending.tasks);
  if (ownerPending.tasks.some((task) => task.status !== "待店长处理" || task.owner !== ownerName)) {
    fail("店长待处理任务入口筛选异常", ["首页“处理我的任务包”必须只进入本人待处理任务。"]);
  }

  const ownerImport = runCli("import-matrix", owner);
  expectObject("店长导入矩阵", ownerImport);
  expectArray("店长导入矩阵 rows", ownerImport.rows);
  if (ownerImport.rows.some((row) => row.owner !== ownerName)) {
    fail("店长导入矩阵越权", [`${ownerName} 的导入矩阵里出现其他负责人店铺`]);
  }

  [
    ["store-owners", "负责人配置"],
    ["task-suppressions", "屏蔽清单"],
    ["erp-sync", "ERP同步"],
    ["push-tasks", "推送任务"],
    ["confirm-tasks", "确认任务"],
  ].forEach(([command, label]) => {
    const result = runCliRaw(command, { ...owner, ids: [] }, [], { allowFailure: true });
    if (result.ok) fail(`店长不应能操作${label}`, [`${command} 在店长口径下返回成功`]);
  });
}

const erpSync = runCli("erp-sync", admin);
expectObject("管理员 ERP 同步", erpSync);
if (!["blocked", "synced"].includes(erpSync.status)) {
  fail("ERP 同步状态异常", ["status 需要是 blocked 或 synced，便于界面展示可处理结果。"]);
}

const salesCompare = runCli("sales-compare", admin);
expectObject("销量差异提醒", salesCompare);
expectArray("销量差异 rows", salesCompare.rows);

console.log(`角色旅程检查通过：管理员日常入口、${ownerName ? `店长 ${ownerName}` : "店长空数据"} 视角、权限边界和 ERP 安全返回均已验证。`);
