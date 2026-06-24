const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function run(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.status !== 0) {
    console.error(`\n交付检查未通过：${label}`);
    if (output) console.error(output);
    process.exit(result.status || 1);
  }
  if (output) console.log(output);
}

run("启动和业务自检", process.execPath, [path.join(ROOT, "scripts", "doctor.js")]);
run("文档口径检查", process.execPath, [path.join(ROOT, "scripts", "check-docs.js")]);
run("依赖安全检查", "npm", ["audit"]);

const release = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check-release.js")], {
  cwd: ROOT,
  encoding: "utf8",
});

if (release.status !== 0) {
  const output = [release.stdout, release.stderr].filter(Boolean).join("\n").trim();
  console.error("\n交付检查未通过：提交范围检查");
  if (output) console.error(output);
  console.error("\n说明：软件功能自检已通过，但发布前仍有图片产物、打包产物或业务数据被 git 跟踪。");
  console.error("不要批量删除文件；需要人工确认后，只从 git 提交范围移除这些产物。");
  process.exit(release.status || 1);
}

const releaseOutput = [release.stdout, release.stderr].filter(Boolean).join("\n").trim();
if (releaseOutput) console.log(releaseOutput);
console.log("交付检查通过：启动、真实渲染、业务测试、文档口径、依赖安全和提交范围均已通过。");
