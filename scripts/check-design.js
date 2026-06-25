const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "electron", "renderer.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "electron", "renderer.css"), "utf8");
const renderer = fs.readFileSync(path.join(ROOT, "electron", "renderer.js"), "utf8");

function fail(message, details = []) {
  console.error(`\n产品设计检查未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

function expect(condition, message, details = []) {
  if (!condition) fail(message, details);
}

const requiredTokens = ["--pink", "--cyan", "--mint", "--yellow", "--blue", "--green", "--orange", "--red"];
const missingTokens = requiredTokens.filter((token) => !css.includes(token));
expect(!missingTokens.length, "青春色彩令牌不完整", missingTokens);

expect(!/radial-gradient\(/.test(css), "界面仍使用离散装饰光斑", [
  "高频运营界面应保持清爽，背景使用线性色带即可。",
]);
expect(!/font-size\s*:[^;]*vw/.test(css), "存在按视口宽度缩放的字体", [
  "运营工作台需要稳定字号，避免宽屏和小屏文字忽大忽小。",
]);
expect(!/letter-spacing\s*:\s*-/.test(css), "存在负字距", [
  "中文运营界面不使用负字距，避免可读性下降。",
]);

[
  [/\.workflow-steps\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/, "桌面端工作流四列"],
  [/\.guide-steps\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, "桌面端清单三列"],
  [/\.metric-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/, "桌面端指标四列"],
  [/@media\s*\(max-width:\s*1260px\)/, "中等屏断点"],
  [/@media\s*\(max-width:\s*820px\)/, "小屏断点"],
  [/@media\s*\(max-width:\s*820px\)\s*\{[\s\S]*\.workflow-steps\s*\{\s*grid-template-columns:\s*1fr/, "小屏工作流单列"],
].forEach(([pattern, label]) => {
  expect(pattern.test(css), "响应式布局缺少关键约束", [label]);
});

expect(html.includes('id="todayWorkflowSteps"') && renderer.includes("renderTodayWorkflow"), "首页缺少明确工作流", [
  "用户进入后需要先看到今天怎么跑，而不是只看到状态卡。",
]);
expect(html.includes('id="homeBusinessOverview"') && renderer.includes("renderHomeBusinessOverview"), "首页缺少经营总览", [
  "首页第一屏需要先看 7/30/90 天销量趋势，而不是先堆操作说明。",
]);
expect(/\.home-business-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/.test(css), "经营总览缺少桌面四卡布局", [
  "7 天、30 天、90 天和 Temu 爆旺款需要并排展示，便于横向比较。",
]);
expect(/@media\s*\(max-width:\s*1260px\)\s*\{[\s\S]*\.home-business-grid/.test(css), "经营总览缺少中小屏响应式约束", [
  "中小屏不能让经营总览撑宽页面。",
]);
expect(renderer.includes("店长每日操作流程") && renderer.includes("管理员每日操作流程"), "首页工作流缺少角色化表达", [
  "同一入口下，管理员和店长必须看到不同动作路径。",
]);
expect(html.includes('id="todayActionList"') && html.includes("今日待我处理"), "首页缺少合并待办入口", [
  "销量、议价、导入和任务待办需要合并到一个明确入口，避免重复卡片。",
]);
expect(renderer.includes("sales-day-table") && renderer.includes("salesEditingIndex"), "销量页缺少单表编辑体验", [
  "店长销量录入应是一张表内编辑确认，不应再拆成清单和台账两套视图。",
]);
expect(html.includes('id="businessKpis"') && html.includes('id="businessAlertStrip"') && html.includes('id="businessTrendTable"'), "经营报表缺少经营视图分区", [
  "经营报表应先看 KPI、异常提醒和趋势，不应只保留生成 Excel 的旧入口。",
]);
expect(renderer.includes("renderBusinessKpis") && renderer.includes("renderBusinessRankingTable") && renderer.includes("renderBusinessTrendTable"), "经营报表缺少可视化渲染逻辑", [
  "平台、业务员、店铺排行和趋势明细需要在界面内直接可读。",
]);
expect(/\.business-kpi-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/.test(css), "经营报表 KPI 缺少桌面四列布局", [
  "今日、本月、本年、当前范围四个指标应稳定并排，方便快速扫描。",
]);
expect(/@media\s*\(max-width:\s*1260px\)\s*\{[\s\S]*\.business-kpi-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(css), "经营报表 KPI 缺少中屏双列布局", [
  "中屏下 KPI 需要换成双列，避免数字和说明挤压。",
]);

const imageTags = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
const unsafeImages = imageTags.filter((tag) => !tag.includes("data-fallback-label"));
expect(!unsafeImages.length, "图片缺少加载失败兜底", unsafeImages);
expect(renderer.includes("function installImageFallbacks(") && renderer.includes("asset-fallback"), "图片兜底逻辑缺失", [
  "图片产物不进入仓库时，界面必须避免显示破图。",
]);
expect(css.includes(".asset-fallback"), "图片兜底样式缺失", [
  "兜底状态需要保持品牌感和稳定尺寸。",
]);

function nestedCardClasses(markup) {
  const stack = [];
  const nested = [];
  const cardClasses = new Set(["simple-panel", "today-card", "panel"]);
  const tagPattern = /<\/?(section|div|aside)\b[^>]*>/g;
  let match;
  while ((match = tagPattern.exec(markup))) {
    const tag = match[0];
    const name = match[1];
    if (tag.startsWith("</")) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const item = stack.pop();
        if (item.name === name) break;
      }
      continue;
    }
    const classMatch = tag.match(/class="([^"]+)"/);
    const classes = classMatch ? classMatch[1].split(/\s+/) : [];
    const isCard = classes.some((className) => cardClasses.has(className));
    if (isCard && stack.some((item) => item.isCard)) nested.push(classMatch[1]);
    stack.push({ name, isCard });
  }
  return nested;
}

const nestedCards = nestedCardClasses(html);
expect(!nestedCards.length, "存在卡片嵌套", nestedCards);

[
  "今日工作台",
  "销量管理",
  "商品任务",
  "数据导入",
  "经营报表",
  "基础资料",
  "系统设置",
].forEach((label) => {
  expect(html.includes(label), "侧边导航缺少核心模块", [label]);
});

console.log("产品设计检查通过：配色、响应式、角色化工作流、图片兜底和高频运营布局均已检查。");
