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
  console.error(`\n后端检查未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

function runCli(command, payload = {}, args = []) {
  const parsed = runCliRaw(command, payload, args);
  if (!parsed.ok) {
    fail(`${command} 返回失败`, [parsed.error || "未知错误"]);
  }
  return parsed.data;
}

function runCliRaw(command, payload = {}, args = [], options = {}) {
  const result = spawnSync(bundledPython(), ["daily_ops_cli.py", command, ...args.map(String)], {
    cwd: ROOT,
    env: { ...process.env, DAILY_OPS_IGNORE_LOCAL_ERP_CREDENTIALS: "1" },
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const output = result.stdout || result.stderr || "没有返回内容";
    fail(`${command} 命令执行失败`, [output.slice(0, 1200)]);
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch (error) {
    fail(`${command} 返回内容不是 JSON`, [error.message, result.stdout.slice(0, 500)]);
  }
  return parsed;
}

function expectObject(name, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail(`${name} 返回结构异常`, [`期望对象，实际：${typeof data}`]);
  }
}

const admin = { role: "admin", user: "管理员" };
const owner = { role: "owner", user: "__cli_smoke_owner__" };

expectObject("status", runCli("status"));
expectObject("load-rules", runCli("load-rules"));

const tasks = runCli("tasks", { ...admin, filters: { role: "admin", search: "__cli_smoke_no_match__" } });
expectObject("tasks", tasks);
if (!tasks.summary || !Array.isArray(tasks.tasks) || !Array.isArray(tasks.packages)) {
  fail("tasks 返回结构异常", ["需要包含 summary、tasks、packages"]);
}

const taskOverview = runCli("tasks", { ...admin, filters: { role: "admin" } });
expectObject("task overview", taskOverview);
const narrowTaskList = runCli("tasks", { ...admin, filters: { role: "admin", status: "__cli_smoke_no_status__" } });
expectObject("narrow task list", narrowTaskList);
if (!taskOverview.summary || typeof taskOverview.summary.total !== "number") {
  fail("任务总览结构异常", ["summary.total 需要是数字"]);
}
if (!narrowTaskList.summary || typeof narrowTaskList.summary.total !== "number") {
  fail("任务筛选结构异常", ["summary.total 需要是数字"]);
}
if (taskOverview.summary.total < narrowTaskList.summary.total) {
  fail("任务总览口径异常", ["全局总览数量不应小于窄筛选结果"]);
}

const ownerTasks = runCli("tasks", { ...owner, filters: { role: "owner", user: owner.user, search: "__cli_smoke_no_match__" } });
expectObject("owner tasks", ownerTasks);
if (!ownerTasks.summary || !Array.isArray(ownerTasks.tasks) || !Array.isArray(ownerTasks.packages)) {
  fail("owner tasks 返回结构异常", ["店长口径需要包含 summary、tasks、packages"]);
}

const realOwners = Object.keys(taskOverview.summary.owner_status || {});
if (realOwners.length) {
  const realOwner = realOwners[0];
  const realOwnerTasks = runCli("tasks", { role: "owner", user: realOwner, filters: { role: "owner", user: realOwner } });
  expectObject("real owner tasks", realOwnerTasks);
  if (!realOwnerTasks.summary || !Array.isArray(realOwnerTasks.tasks)) {
    fail("真实店长任务结构异常", ["需要包含 summary 和 tasks"]);
  }
  const expectedTotal = Number(taskOverview.summary.owner_status[realOwner]?.total || 0);
  const actualTotal = Number(realOwnerTasks.summary.total || 0);
  if (actualTotal !== expectedTotal) {
    fail("店长任务总览口径异常", [
      `${realOwner} 预期 ${expectedTotal} 条，实际 ${actualTotal} 条。店长视角必须只看自己负责的数据。`,
    ]);
  }
  if (realOwnerTasks.tasks.some((task) => task.owner !== realOwner)) {
    fail("店长任务列表越权", [`${realOwner} 的任务列表中出现了其他负责人任务`]);
  }
  if (realOwnerTasks.tasks.some((task) => task.status === "待推送")) {
    fail("店长任务列表包含未推送任务", ["待推送任务必须先由管理员确认推送，店长不可提前看到。"]);
  }
}

const sales = runCli("sales", admin);
expectObject("sales", sales);
if (!Array.isArray(sales.entries) || !sales.summary) {
  fail("sales 返回结构异常", ["需要包含 entries 和 summary"]);
}

const ownerSales = runCli("sales", owner);
expectObject("owner sales", ownerSales);
if (!Array.isArray(ownerSales.entries) || !ownerSales.summary) {
  fail("owner sales 返回结构异常", ["店长口径需要包含 entries 和 summary"]);
}

const importMatrix = runCli("import-matrix", admin);
expectObject("import-matrix", importMatrix);
if (!Array.isArray(importMatrix.rows) || !importMatrix.summary) {
  fail("import-matrix 返回结构异常", ["需要包含 rows 和 summary"]);
}

const ownerImportMatrix = runCli("import-matrix", owner);
expectObject("owner import-matrix", ownerImportMatrix);
if (!Array.isArray(ownerImportMatrix.rows) || !ownerImportMatrix.summary) {
  fail("owner import-matrix 返回结构异常", ["店长口径需要包含 rows 和 summary"]);
}

const salesCompare = runCli("sales-compare", admin);
expectObject("sales-compare", salesCompare);
if (!Array.isArray(salesCompare.rows) || !salesCompare.summary) {
  fail("sales-compare 返回结构异常", ["需要包含 rows 和 summary"]);
}

const erpSync = runCli("erp-sync", admin);
expectObject("erp-sync", erpSync);
if (!["blocked", "synced"].includes(erpSync.status)) {
  fail("ERP 同步返回结构异常", ["status 需要是 blocked 或 synced"]);
}

const storeOwners = runCli("store-owners", admin);
expectObject("store-owners", storeOwners);
if (!Array.isArray(storeOwners.assignments)) {
  fail("store-owners 返回结构异常", ["需要包含 assignments"]);
}

[
  ["store-owners", "负责人配置"],
  ["task-suppressions", "屏蔽清单"],
  ["erp-sync", "ERP同步"],
].forEach(([command, label]) => {
  const result = runCliRaw(command, owner, [], { allowFailure: true });
  if (result.ok) {
    fail(`店长不应能读取${label}`, [`${command} 在店长口径下返回了成功`]);
  }
});

const duplicateStoreSave = runCliRaw("save-store-owners", {
  ...admin,
  assignments: [
    { platform: "Temu", store: "__cli_smoke_store__", owner: "小琴" },
    { platform: "Shein", store: "__cli_smoke_store__", owner: "洁琳" },
  ],
}, [], { allowFailure: true });
if (duplicateStoreSave.ok || !String(duplicateStoreSave.error || "").includes("不能同时归属")) {
  fail("跨平台重复店铺未被拦截", [
    "一个店铺只能归属一个平台，save-store-owners 应返回失败并说明不能同时归属。",
  ]);
}

console.log("后端检查通过：管理员和店长核心只读命令、权限边界均可正常返回。");
