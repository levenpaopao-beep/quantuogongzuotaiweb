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
expect(renderer.includes("店长每日流程") && renderer.includes("管理员日常流程"), "首页工作流缺少角色化表达", [
  "同一入口下，管理员和店长必须看到不同动作路径。",
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
