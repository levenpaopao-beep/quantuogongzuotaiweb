const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const electronBin = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");

const result = spawnSync(electronBin, ["."], {
  cwd: ROOT,
  env: {
    ...process.env,
    PETCIRCLE_RENDER_SMOKE: "1",
  },
  encoding: "utf8",
  timeout: 30000,
});

const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
if (result.error) {
  console.error(`\n渲染烟测未通过：${result.error.message}`);
  if (output) console.error(output);
  process.exit(1);
}
if (result.status !== 0) {
  console.error("\n渲染烟测未通过");
  if (output) console.error(output);
  process.exit(result.status || 1);
}
if (output) console.log(output);
