const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

function fail(message, details = []) {
  console.error(`\n文档检查未通过：${message}`);
  details.forEach((line) => console.error(`- ${line}`));
  process.exit(1);
}

[
  "check:design",
  "check:security",
  "check:modules",
  "check:journeys",
  "check:ready",
].forEach((script) => {
  if (!pkg.scripts[script]) fail("package.json 缺少文档提到的检查命令", [script]);
  if (!readme.includes(`npm run ${script}`)) fail("README 缺少检查命令说明", [`npm run ${script}`]);
});

[
  "产品设计检查",
  "安全体检",
  "模块体检",
  "角色旅程检查",
  "不会删除文件",
  "不要批量删除",
].forEach((text) => {
  if (!readme.includes(text)) fail("README 缺少关键交付说明", [text]);
});

console.log("文档检查通过：README 已覆盖交付检查命令、设计/安全/模块/角色说明和不删除文件原则。");
