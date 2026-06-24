import json
import zipfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "outputs"
PACKAGE_NAME = "260604-日常运营工作项目迁移包-V1.zip"
PACKAGE_PATH = OUTPUT_DIR / PACKAGE_NAME

EXCLUDED_DIR_NAMES = {
    "node_modules",
    "__pycache__",
    ".git",
    ".agents",
    ".codex",
}

EXCLUDED_OUTPUT_DIRS = {
    "PETCIRCLECrossBorderWorkbench_Portable_260603",
}

EXCLUDED_FILE_NAMES = {
    "PETCIRCLECrossBorderWorkbench_Portable_260603.zip",
}

EXCLUDED_SUFFIXES = {
    ".pyc",
    ".pyo",
}


README = """# 日常运营工作项目迁移包

生成日期：2026-06-04

## 用途

本压缩包用于把当前“日常运营工作”项目迁移到另一台电脑的 Codex 工作区，便于继续设计、开发和调试系统。

## 包含内容

- 工作台代码：`daily_ops_app.py`
- 报表生成脚本
- 规则 Markdown 文档
- Temu / Shein / ERP 数据源文件夹
- 基础数据库：`基础数据库/project_base_data.sqlite`
- 当前项目输出文件，排除了绿色安装包自身
- 启动脚本：`启动日常运营工作台.bat`

## 未包含内容

- `node_modules`
- Python / JS 缓存文件
- Git / Codex 内部状态目录
- 已生成的绿色安装包 `PETCIRCLECrossBorderWorkbench_Portable_260603.zip`

这些内容不是继续设计项目所必需，且会显著增大体积。

## 迁移到另一台电脑

1. 在另一台电脑创建或选择 Codex 工作区。
2. 解压本包，保持文件夹结构不变。
3. 在 Codex 中打开解压后的 `日常运营工作` 文件夹。
4. 如果要运行工作台，优先使用项目内的 `启动日常运营工作台.bat`。
5. 如果另一台电脑没有对应 Python 运行环境，可先使用绿色安装包，或让 Codex 在新电脑上重建运行方式。

## 注意

- 本包包含业务数据和基础数据库，请只发送给可信电脑。
- 如只需要代码和规则，不需要数据，可后续再生成“轻量设计包”。
"""


def should_skip(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    parts = rel.parts
    if any(part in EXCLUDED_DIR_NAMES for part in parts):
        return True
    if len(parts) >= 2 and parts[0] == "outputs" and parts[1] in EXCLUDED_OUTPUT_DIRS:
        return True
    if path.name in EXCLUDED_FILE_NAMES:
        return True
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return True
    if path.resolve() == PACKAGE_PATH.resolve():
        return True
    return False


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    if PACKAGE_PATH.exists():
        PACKAGE_PATH.unlink()

    included = []
    with zipfile.ZipFile(PACKAGE_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr("日常运营工作/README_迁移说明.md", README)
        for path in ROOT.rglob("*"):
            if path.is_dir() or should_skip(path):
                continue
            arcname = Path("日常运营工作") / path.relative_to(ROOT)
            zf.write(path, arcname)
            included.append({"path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size})
        zf.writestr(
            "日常运营工作/outputs/迁移包文件清单.json",
            json.dumps(
                {
                    "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "file_count": len(included),
                    "files": included,
                },
                ensure_ascii=False,
                indent=2,
            ),
        )

    print(PACKAGE_PATH)
    print(f"files={len(included)}")
    print(f"bytes={PACKAGE_PATH.stat().st_size}")


if __name__ == "__main__":
    main()
