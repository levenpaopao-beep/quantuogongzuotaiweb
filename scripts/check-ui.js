const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "electron", "renderer.html"), "utf8");
const renderer = fs.readFileSync(path.join(ROOT, "electron", "renderer.js"), "utf8");
const preload = fs.readFileSync(path.join(ROOT, "electron", "preload.js"), "utf8");
const main = fs.readFileSync(path.join(ROOT, "electron", "main.js"), "utf8");

function fail(title, rows) {
  console.error(`\n界面检查未通过：${title}`);
  rows.forEach((row) => console.error(`- ${row}`));
  process.exit(1);
}

function buttonText(markup) {
  return markup.replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
}

function attr(markup, name) {
  const match = markup.match(new RegExp(`${name}="([^"]+)"`));
  return match ? match[1] : "";
}

function functionBody(source, name) {
  const signature = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = signature.exec(source);
  if (!match) return "";
  let depth = 1;
  let index = match.index + match[0].length;
  for (; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(match.index + match[0].length, index);
  }
  return "";
}

const riskyButtons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
  .map((match) => {
    const attrs = match[1];
    const id = attr(attrs, "id");
    const type = attr(attrs, "type");
    return {
      id,
      type,
      text: buttonText(match[2]),
      bound: id ? renderer.includes(`#${id}`) || renderer.includes(`getElementById("${id}"`) || renderer.includes(`getElementById('${id}'`) : false,
      dataPage: attrs.includes("data-page="),
      dataAction: attrs.includes("data-action=") || attrs.includes("data-package-action=") || attrs.includes("data-dialog-close"),
    };
  })
  .filter((button) => !button.dataPage && !button.dataAction && button.type !== "submit" && button.type !== "button" && (!button.id || !button.bound));

if (riskyButtons.length) {
  fail("存在看起来可点击但没有绑定动作的按钮", riskyButtons.map((button) => `${button.text || button.id || "未命名按钮"}`));
}

const preloadChannels = [...preload.matchAll(/ipcRenderer\.invoke\("([^"]+)"/g)].map((match) => match[1]);
const missingMainHandlers = preloadChannels.filter((channel) => !main.includes(`ipcMain.handle("${channel}"`));

if (missingMainHandlers.length) {
  fail("preload 暴露了主进程未处理的接口", missingMainHandlers);
}

const mainChannels = [...main.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((match) => match[1]);
const unusedMainHandlers = mainChannels
  .filter((channel) => channel.startsWith("api:"))
  .filter((channel) => !preload.includes(`"${channel}"`) && !["api:select-files", "api:select-backup", "api:upload-source"].includes(channel));

if (unusedMainHandlers.length) {
  fail("主进程存在未暴露给前端的接口", unusedMainHandlers);
}

const adminOnlyFrontendCalls = [
  {
    fn: "loadStoreOwners",
    apiCall: "api.storeOwners(",
    reason: "负责人配置只允许管理员读取，店长视角必须跳过。",
  },
  {
    fn: "loadTaskSuppressions",
    apiCall: "api.taskSuppressions(",
    reason: "屏蔽清单只允许管理员读取，店长视角必须跳过。",
  },
];

const unsafeRoleCalls = adminOnlyFrontendCalls
  .map((rule) => ({ ...rule, body: functionBody(renderer, rule.fn) }))
  .filter((rule) => {
    if (!rule.body) return true;
    const guardIndex = rule.body.indexOf('operator.role === "owner"');
    const callIndex = rule.body.indexOf(rule.apiCall);
    return callIndex < 0 || guardIndex < 0 || guardIndex > callIndex;
  });

if (unsafeRoleCalls.length) {
  fail("店长视角可能调用管理员专属接口", unsafeRoleCalls.map((rule) => `${rule.fn}: ${rule.reason}`));
}

const todayGuideBody = functionBody(renderer, "renderTodayGuide");
if (!todayGuideBody.includes("configuredStoreCount") || !todayGuideBody.includes("Number(salesSummary.required || 0)")) {
  fail("今日清单店铺口径缺少销量兜底", [
    "管理员首页需要在负责人配置为空时仍使用每日销量应填店铺数，避免显示“待维护”和 22 个应填店铺互相冲突。",
  ]);
}

if (!html.includes('id="todayWorkflowSteps"') || !html.includes('id="todayWorkflowTitle"')) {
  fail("今日工作台缺少日常流程导航", [
    "首屏需要直接告诉管理员和店长今天怎么操作，不能只显示状态卡片。",
  ]);
}
const todayWorkflowBody = functionBody(renderer, "renderTodayWorkflow");
if (!todayWorkflowBody.includes("店长每日流程") || !todayWorkflowBody.includes("管理员日常流程")) {
  fail("今日工作流缺少角色化文案", [
    "管理员和店长在同一个入口下必须看到不同的下一步操作说明。",
  ]);
}
if (!todayWorkflowBody.includes("data-empty-page") || !todayWorkflowBody.includes("bindEmptyActions(wrap)")) {
  fail("今日工作流按钮没有接入页面跳转", [
    "流程卡片里的操作按钮必须能跳到对应模块，并带任务筛选状态。",
  ]);
}
if (!html.includes('id="salesFocusBar"') || !renderer.includes("function setSalesFocus(") || !renderer.includes("salesFocusEntries")) {
  fail("销量页缺少每日高频填报筛选", [
    "店长每天进入销量页时需要优先看到未填店铺，并能切换异常和全部，避免在长列表里找。",
  ]);
}
const applyRouteIntentBody = functionBody(renderer, "applyRouteIntent");
if (!applyRouteIntentBody.includes("route.salesFocus") || !todayWorkflowBody.includes('data-sales-focus="missing"')) {
  fail("今日工作台未直达未填销量", [
    "首页“去填写/看销量”应把销量页切到未填口径，符合每天先补未填的主流程。",
  ]);
}
const renderSalesBody = functionBody(renderer, "renderSalesManagement");
if (!renderSalesBody.includes('event.key === "Enter"') || !renderSalesBody.includes("submitSalesEntry(Number(")) {
  fail("销量填报缺少回车提交", [
    "每日填报是高频动作，输入销量后回车应直接提交当前店铺。",
  ]);
}
if (/radial-gradient\(/.test(fs.readFileSync(path.join(ROOT, "electron", "renderer.css"), "utf8"))) {
  fail("界面背景仍有装饰光斑", [
    "工作台是高频运营工具，背景应保持清爽，不使用离散渐变光斑作为装饰。",
  ]);
}

const loadTasksBody = functionBody(renderer, "loadTasks");
const renderTaskSummaryBody = functionBody(renderer, "renderTaskSummary");
const renderTodayDashboardBody = functionBody(renderer, "renderTodayDashboard");
const applyAdminQueueFilterBody = functionBody(renderer, "applyAdminQueueFilter");
const taskOverviewIndex = loadTasksBody.indexOf("taskOverviewFilters()");
const taskFiltersIndex = loadTasksBody.indexOf("taskFilters()");
if (!renderer.includes("taskOverview: {}")) {
  fail("任务总览状态缺失", [
    "首页任务 KPI 需要独立的 taskOverview，不能复用当前筛选任务的 summary。",
  ]);
}
if (taskOverviewIndex < 0 || taskFiltersIndex < 0 || taskOverviewIndex > taskFiltersIndex) {
  fail("任务总览读取顺序异常", [
    "loadTasks 应先读取无筛选的任务总览，再读取当前筛选列表，避免筛选后首页统计变成 0。",
  ]);
}
[
  ["renderTaskSummary", renderTaskSummaryBody],
  ["renderTodayDashboard", renderTodayDashboardBody],
].forEach(([name, body]) => {
  if (!body.includes("state.taskOverview || state.taskSummary")) {
    fail("首页任务总览可能被筛选污染", [
      `${name} 应优先读取 state.taskOverview，而不是只读取当前筛选 summary。`,
    ]);
  }
});
if (!applyAdminQueueFilterBody.includes("state.taskOverview?.admin_queue")) {
  fail("管理员待办队列来源异常", [
    "管理员待办入口应读取全局 taskOverview.admin_queue，不能读取当前筛选结果。",
  ]);
}

const renderStoreOwnersBody = functionBody(renderer, "renderStoreOwners");
const validateStoreOwnerRowsBody = functionBody(renderer, "validateStoreOwnerRows");
if (!html.includes('id="newPlatformInput"') || !html.includes('id="addPlatformBtn"')) {
  fail("基础资料缺少新增平台入口", [
    "管理员需要能在界面里新增平台，再给平台添加店铺。",
  ]);
}
if (!renderer.includes("function addPlatform(") || !renderer.includes("#addPlatformBtn")) {
  fail("新增平台按钮未绑定", [
    "addPlatformBtn 需要绑定 addPlatform，新增后进入店铺平台下拉。",
  ]);
}
if (!renderStoreOwnersBody.includes("storeOwnerPlatformOptions")) {
  fail("店铺平台下拉缺少自定义平台", [
    "店铺负责人表格需要同时显示内置平台和管理员新增的平台。",
  ]);
}
if (!validateStoreOwnerRowsBody.includes("需要先选择平台")) {
  fail("店铺配置缺少平台必填校验", [
    "平台汇总依赖平台字段，保存店铺配置前必须拦截空平台。",
  ]);
}

if (!html.includes('id="manualErpSyncBtn"') || !renderer.includes("function manualErpSync(") || !renderer.includes("#manualErpSyncBtn")) {
  fail("ERP 手动同步入口缺失", [
    "第一版应以手动同步为主，系统设置页必须提供立即同步商品和库存的操作。",
  ]);
}
if (!preload.includes("erpSync:") || !main.includes('ipcMain.handle("api:erp-sync"')) {
  fail("ERP 同步接口未完整暴露", [
    "manualErpSync 需要通过 preload 和主进程调用后端 erp-sync 命令。",
  ]);
}

console.log(`界面检查通过：${preloadChannels.length} 个前端接口、按钮绑定和角色权限均已检查。`);
