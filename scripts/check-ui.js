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
if (
  !todayGuideBody.includes('data-empty-page="${step.page}"') ||
  !todayGuideBody.includes('data-sales-focus="missing"') ||
  !todayGuideBody.includes('data-import-focus="blocked"') ||
  !todayGuideBody.includes('data-task-status="待店长处理"')
) {
  fail("开始使用清单缺少带上下文的跳转", [
    "清单按钮不能只跳页面；填写销量要直达未填，检查导入要直达需处理缺口，店长处理任务要直达本人待处理。",
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
if (!html.includes('id="importHealthBar"') || !renderer.includes("function setImportFocus(") || !renderer.includes("importFocusRows")) {
  fail("数据导入页缺少缺口健康条", [
    "管理员和店长需要先看到缺失、待提交、完整店铺等汇总，再进入矩阵明细。",
  ]);
}
const renderImportBody = functionBody(renderer, "renderImportMatrix");
if (!applyRouteIntentBody.includes("route.importFocus") || !renderImportBody.includes("visibleRows")) {
  fail("导入缺口筛选未接入矩阵和首页入口", [
    "首页进入导入页时应定位到需处理缺口，矩阵也要能在需处理、待提交和全部之间切换。",
  ]);
}
if (!html.includes('id="reportReadinessBar"') || !renderer.includes("function renderReportReadiness(") || !renderer.includes("generateWeeklyReports")) {
  fail("经营报表缺少生成前体检", [
    "月结输出前需要把未填销量、导入缺口和任务待办集中提示，避免报表生成后才发现口径不完整。",
  ]);
}
if (!html.includes('id="generateWeeklyBtn" data-admin-only="report-generate"')) {
  fail("导入页生成报表入口未按管理员角色隐藏", [
    "店长可以补导入数据，但生成就绪报表/任务仍是管理员动作，店长视角不能露出这个按钮。",
  ]);
}
const renderReportReadinessBody = functionBody(renderer, "renderReportReadiness");
if (
  !renderReportReadinessBody.includes('data-empty-page="sales"') ||
  !renderReportReadinessBody.includes('data-empty-page="imports"') ||
  !renderReportReadinessBody.includes('data-empty-page="tasks"')
) {
  fail("报表体检未接入销量/导入/任务定位", [
    "报表页的风险项按钮必须能直接回到销量、导入和任务模块处理问题。",
  ]);
}
if (!renderReportReadinessBody.includes('currentOperator().role === "owner"') || !renderReportReadinessBody.includes('data-report-action="generate-weekly"')) {
  fail("报表体检生成入口缺少店长隐藏逻辑", [
    "店长看报表体检时可以查销量、导入和任务，但不能直接生成管理员报表。",
  ]);
}
const renderReportCardsBody = functionBody(renderer, "renderReportCards");
if (!renderReportCardsBody.includes('currentOperator().role === "owner"') || !renderReportCardsBody.includes('data-action="generate"')) {
  fail("报表卡片生成按钮缺少店长隐藏逻辑", [
    "店长可以查看已有经营输出，但单张报表生成按钮必须只给管理员。",
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
const renderTaskWorkbarBody = functionBody(renderer, "renderTaskWorkbar");
if (!html.includes('id="taskWorkbar"') || !renderer.includes("function renderTaskWorkbar(") || !renderer.includes("function selectActionableTasks(")) {
  fail("任务页缺少当前队列工作条", [
    "商品任务数量很大，管理员和店长需要在任务页顶部看到当前筛选、可处理、已勾选和下一步动作。",
  ]);
}
if (!renderTaskWorkbarBody.includes("管理员下一步") || !renderTaskWorkbarBody.includes("店长待整包处理") || !renderTaskWorkbarBody.includes("data-task-work-action")) {
  fail("任务工作条缺少角色化下一步操作", [
    "管理员需要看到推送/确认/归档入口，店长需要看到我的待处理和整包处理入口。",
  ]);
}
if (!renderer.includes("setTaskQuickFilters") || !renderer.includes("renderTaskWorkbar();")) {
  fail("任务工作条未接入快速筛选或勾选刷新", [
    "点击顶部按钮应能切换任务筛选，勾选任务后已选数量应立即刷新。",
  ]);
}
if (!html.includes('list="operatorOwnerOptions"') || !html.includes('id="operatorOwnerOptions"')) {
  fail("角色入口缺少负责人下拉建议", [
    "店长视角不能只靠手输姓名，否则输错后会看不到自己的销量、导入和任务。",
  ]);
}
if (!renderer.includes("function collectOwnerOptions(") || !renderer.includes("function validateOperatorDraft(")) {
  fail("角色入口缺少负责人候选和姓名校验", [
    "负责人候选应从可见销量、导入、任务和管理员基础资料里提取，切换店长前要校验姓名。",
  ]);
}
const saveOperatorBody = functionBody(renderer, "saveOperator");
if (!saveOperatorBody.includes("validateOperatorDraft(true)")) {
  fail("切换店长视角未校验负责人姓名", [
    "保存角色前必须检查店长姓名是否为空或不在候选负责人里。",
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
if (!html.includes('data-erp-field="page_size"') || !html.includes('data-erp-field="stock_limit"')) {
  fail("ERP 同步缺少分页和库存上限配置", [
    "宠物圈仓库商品和库存数据量可能超过单页，管理员需要能控制每页条数和库存最多拉取量。",
  ]);
}
const renderErpSettingsBody = functionBody(renderer, "renderErpSettings");
const manualErpSyncBody = functionBody(renderer, "manualErpSync");
if (!renderErpSettingsBody.includes("last_product_pages") || !manualErpSyncBody.includes("result.product_pages")) {
  fail("ERP 同步结果缺少页数反馈", [
    "同步完成后需要显示商品/库存拉了多少页，管理员才能判断是否只取了一页。",
  ]);
}
if (!preload.includes("erpSync:") || !main.includes('ipcMain.handle("api:erp-sync"')) {
  fail("ERP 同步接口未完整暴露", [
    "manualErpSync 需要通过 preload 和主进程调用后端 erp-sync 命令。",
  ]);
}

console.log(`界面检查通过：${preloadChannels.length} 个前端接口、按钮绑定和角色权限均已检查。`);
