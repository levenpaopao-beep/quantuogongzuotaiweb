const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const electronBin = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");

const viewports = [
  { label: "标准窗口", width: 1488, height: 980 },
  { label: "最小窗口", width: 1180, height: 760 },
];

viewports.forEach((viewport) => {
  const result = spawnSync(electronBin, ["."], {
    cwd: ROOT,
    env: {
      ...process.env,
      PETCIRCLE_RENDER_SMOKE: "1",
      PETCIRCLE_RENDER_SMOKE_WIDTH: String(viewport.width),
      PETCIRCLE_RENDER_SMOKE_HEIGHT: String(viewport.height),
    },
    encoding: "utf8",
    timeout: 30000,
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.error) {
    console.error(`\n渲染烟测未通过：${viewport.label} ${result.error.message}`);
    if (output) console.error(output);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n渲染烟测未通过：${viewport.label}`);
    if (output) console.error(output);
    process.exit(result.status || 1);
  }
  if (output) console.log(output);
});
