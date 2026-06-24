const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const main = fs.readFileSync(path.join(ROOT, "electron", "main.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "electron", "renderer.html"), "utf8");
const windowsPackage = fs.readFileSync(path.join(ROOT, "build_windows_install_package_v2.py"), "utf8");
const portablePackage = fs.readFileSync(path.join(ROOT, "build_portable_package.py"), "utf8");
const migrationPackage = fs.readFileSync(path.join(ROOT, "build_project_migration_package.py"), "utf8");
const readyCheck = fs.readFileSync(path.join(ROOT, "scripts", "check-ready.js"), "utf8");

function fail(message, details = []) {
  console.error(`\n文档检查未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

[
  "check:design",
  "check:render",
  "check:security",
  "check:modules",
  "check:journeys",
  "check:ready",
].forEach((script) => {
  if (!pkg.scripts[script]) fail("package.json 缺少文档提到的检查命令", [script]);
  if (!readme.includes(`npm run ${script}`)) fail("README 缺少检查命令说明", [`npm run ${script}`]);
});

[
  "PETCIRCLE跨境工作台",
  "产品设计检查",
  "真实渲染",
  "标准/最小窗口",
  "全核心模块页面",
  "首页入口真实点击路径",
  "管理员/店长跨页面权限按钮",
  "安全体检",
  "模块体检",
  "角色旅程检查",
  "店长进入“销量管理”",
  "管理员和店长进入“经营报表”",
  "平台排行",
  "业务员排行",
  "趋势明细",
  "店长可以补自己负责店铺的数据源",
  "店长可以上传自己负责店铺的数据源",
  "店长不能生成报表",
  "店长不能查询其他负责人或其他店铺的经营报表",
  "不会删除文件",
  "不要批量删除",
].forEach((text) => {
  if (!readme.includes(text)) fail("README 缺少关键交付说明", [text]);
});

if (readme.includes("店长不能上传数据源")) {
  fail("README 店长导入口径已过期", [
    "最新业务逻辑是店长可以上传自己负责店铺的数据源，管理员负责全局缺失矩阵和报表生成。",
  ]);
}

if (!readyCheck.includes("check-docs.js") || !readyCheck.includes("文档口径")) {
  fail("交付检查未显式覆盖文档口径", [
    "check:ready 必须直接运行 check-docs.js，避免 README、系统名和角色口径回退时总交付检查漏报。",
  ]);
}

if (!readyCheck.includes("真实渲染")) {
  fail("交付检查说明缺少真实渲染口径", [
    "check:ready 需要明确覆盖 Electron 首屏真实渲染烟测，避免只做静态文件扫描。",
  ]);
}

if (pkg.productName !== "PETCIRCLE跨境工作台") {
  fail("package.json 产品名不一致", [`当前 productName：${pkg.productName}`]);
}

if (pkg.name !== "petcircle-cross-border-workbench") {
  fail("package.json 内部包名不一致", [`当前 name：${pkg.name}`]);
}

[
  ["README 标题", readme, "# PETCIRCLE跨境工作台"],
  ["Electron 窗口名", main, 'APP_NAME = "PETCIRCLE跨境工作台"'],
  ["桌面 HTML 标题", html, "<title>PETCIRCLE跨境工作台</title>"],
  ["桌面品牌标题", html, 'class="brand-title">PETCIRCLE跨境工作台'],
  ["Windows 安装包名", windowsPackage, 'APP_NAME = "PETCIRCLE跨境工作台"'],
  ["Windows 安装包 ID", windowsPackage, 'APP_ID = "PETCIRCLECrossBorderWorkbench"'],
  ["绿色版包名", portablePackage, 'APP_NAME = "PETCIRCLE跨境工作台"'],
  ["绿色版英文包名", portablePackage, "PETCIRCLECrossBorderWorkbench_Portable"],
  ["迁移包绿色版排除名", migrationPackage, "PETCIRCLECrossBorderWorkbench_Portable_260603"],
].forEach(([label, source, expected]) => {
  if (!source.includes(expected)) fail("系统名称交付一致性检查失败", [`${label} 缺少：${expected}`]);
});

[
  "正在安装日常运营工作台",
  "日常运营工作台 v2.0",
  "DailyOpsWorkbench_v2.0_Setup",
  "DailyOpsWorkbench_Portable_260603",
].forEach((legacy) => {
  if (`${windowsPackage}\n${portablePackage}\n${migrationPackage}`.includes(legacy)) {
    fail("安装交付脚本仍包含旧系统名", [legacy]);
  }
});

console.log("文档检查通过：README 已覆盖交付检查命令、设计/安全/模块/角色说明、系统名称一致性和不删除文件原则。");
