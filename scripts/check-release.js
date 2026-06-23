const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const blockedPatterns = [
  /^outputs\//,
  /^build\//,
  /^dist\//,
  /^release\//,
  /^node_modules\//,
  /^__pycache__\//,
  /^.*\.app\//,
  /^.*\.(xlsx|xls|xlsm|csv|png|jpg|jpeg|gif|webp|icns|dmg|zip|7z|rar|exe|msi)$/i,
  /^erp数据源\//,
  /^temu数据源表\//,
  /^shein数据源表\//,
  /^核价输入表\//,
  /^低分预警输入表\//,
  /^运营备份\//,
];

function runGit(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  if (args.includes("-z")) return result.stdout.split("\0").filter(Boolean);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function isBlocked(file) {
  return blockedPatterns.some((pattern) => pattern.test(file));
}

const trackedFiles = runGit(["ls-files", "-z"]);
const trackedArtifacts = trackedFiles.filter(isBlocked);

if (trackedArtifacts.length) {
  console.error("\n发布检查未通过：以下产物或业务数据仍被 git 跟踪。");
  console.error("不要直接批量删除文件；需要你确认后，再用 git rm --cached 这类方式从提交范围移除。");
  trackedArtifacts.slice(0, 80).forEach((file) => console.error(`- ${file}`));
  if (trackedArtifacts.length > 80) {
    console.error(`... 还有 ${trackedArtifacts.length - 80} 个文件未显示`);
  }
  process.exit(1);
}

console.log("发布检查通过：未发现被 git 跟踪的图片产物、打包产物、虚拟环境产物或业务数据。");
