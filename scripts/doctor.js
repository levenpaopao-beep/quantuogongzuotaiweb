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
  console.error(`\n启动检查未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

function checkElectron() {
  try {
    require.resolve("electron");
  } catch (_error) {
    fail("没有找到 Electron 运行依赖", [
      "请在 dailywork 目录执行：npm install",
      "如果下载 Electron 很慢，可以稍后重试；不要手动删除项目文件。",
    ]);
  }
}

function checkPython() {
  const python = bundledPython();
  const result = spawnSync(python, ["-c", "import openpyxl; import sys; print(sys.version.split()[0])"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail("Python 表格依赖不可用", [
      `当前 Python：${python}`,
      "需要 openpyxl 才能读取和生成 Excel。",
      "如果使用系统 Python，请执行：python3 -m pip install -r requirements.txt",
    ]);
  }
}

function checkFiles() {
  [
    "daily_ops_cli.py",
    "electron/main.js",
    "electron/preload.js",
    "electron/renderer.html",
    "electron/renderer.js",
    "electron/renderer.css",
  ].forEach((file) => {
    if (!fs.existsSync(path.join(ROOT, file))) {
      fail("关键文件缺失", [`缺少：${file}`]);
    }
  });
}

function checkUiWiring() {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-ui.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    process.exit(result.status || 1);
  }
}

function checkProductDesign() {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-design.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    process.exit(result.status || 1);
  }
}

function checkCliSmoke() {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-cli.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    process.exit(result.status || 1);
  }
}

function checkRoleJourneys() {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-journeys.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    process.exit(result.status || 1);
  }
}

function checkModules() {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-modules.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    process.exit(result.status || 1);
  }
}

function checkBusinessTests() {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-python-tests.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    process.exit(result.status || 1);
  }
}

checkFiles();
checkElectron();
checkPython();
checkUiWiring();
checkProductDesign();
checkCliSmoke();
checkRoleJourneys();
checkModules();
checkBusinessTests();
console.log("启动检查通过：Electron、Python、关键文件、产品设计、界面绑定、模块体检、角色旅程、权限边界和核心业务测试均可用。");
