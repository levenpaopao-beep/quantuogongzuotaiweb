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
  console.error(`\n业务测试未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

const tests = [
  "test_daily_ops_sales.py",
  "test_daily_ops_master_data.py",
  "test_daily_ops_import_matrix.py",
  "test_daily_ops_tasks.py",
  "test_daily_ops_task_suppression.py",
  "test_daily_ops_sales_compare.py",
  "test_daily_ops_erp.py",
  "test_store_owner_assignments.py",
  "test_operation_tasks.py",
  "test_desktop_app.py",
  "test_workbench_network_address.py",
];

const result = spawnSync(bundledPython(), ["-m", "unittest", ...tests], {
  cwd: ROOT,
  encoding: "utf8",
});

if (result.status !== 0) {
  fail("每日销量、基础资料、历史销量、导入矩阵、任务包、屏蔽清单、销量差异、ERP同步、店铺归属、桌面壳、局域网入口或角色旅程测试失败", [
    result.stdout || "",
    result.stderr || "",
  ].filter(Boolean));
}

console.log("业务测试通过：每日销量、基础资料、历史销量、导入矩阵、任务包、屏蔽清单、销量差异、ERP同步、店铺归属、桌面壳、局域网入口和角色旅程均已覆盖。");
