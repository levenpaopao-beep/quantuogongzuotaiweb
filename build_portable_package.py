import shutil
import zipfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PY_RUNTIME = Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies" / "python"
PACKAGE_NAME = f"DailyOpsWorkbench_Portable_{datetime.now():%y%m%d}"
BUILD_ROOT = ROOT / "outputs" / PACKAGE_NAME
ZIP_PATH = ROOT / "outputs" / f"{PACKAGE_NAME}.zip"

APP_FILES = [
    "daily_ops_app.py",
    "daily_ops_desktop.py",
    "daily_ops_desktop_adapter.py",
    "generate_temu_bargain_reply.py",
    "generate_temu_inventory_abnormal.py",
    "generate_temu_slow_moving_weekly.py",
    "temu_hot_warning_v13.py",
    "update_shein_summary_30d_skc.py",
    "update_base_database_index.py",
    "全局输出设置和命名设置.md",
    "预警表生成需求_最新版.md",
    "Temu申报价异常V1.md",
    "爆旺款预警表格式.md",
]


def copytree(src, dst):
    if dst.exists():
        shutil.rmtree(dst)
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc", "pip", "pip.exe")
    shutil.copytree(src, dst, ignore=ignore)


def write_text(path, text):
    path.write_text(text, encoding="utf-8", newline="\r\n")


def make_launcher(package_root):
    write_text(
        package_root / "启动日常运营工作台.bat",
        """@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PY=%~dp0runtime\\python\\python.exe"

if not exist "%PY%" (
  echo Python runtime not found:
  echo %PY%
  echo.
  pause
  exit /b 1
)

echo Starting Daily Ops Workbench...
"%PY%" -W ignore::DeprecationWarning "%~dp0daily_ops_desktop.py"
echo.
echo 日常运营工作台桌面版已退出。
pause
""",
    )


def make_readme(package_root):
    write_text(
        package_root / "README_使用说明.txt",
        """日常运营工作台 - 绿色离线版

使用方式：
1. 解压整个文件夹到任意位置。
2. 双击“启动日常运营工作台.bat”。
3. 工作台会以桌面窗口打开，不需要浏览器和网址。

数据源放置：
- Temu平台表、Temu爆旺款：放入 temu数据源表，或在桌面软件“每周工作流”中上传。
- ERP基础信息、ERP组合装：放入 erp数据源，或在桌面软件“每周工作流”中上传。
- 店铺负责人表：放在本文件夹根目录，文件名建议为 店铺负责人对应表.xlsx。

输出规则：
- 所有生成结果保存在 outputs 文件夹。
- 文件命名规则为 yymmdd-项目名-版本号.xlsx。

基础数据库：
- 本绿色包默认不包含原电脑的业务数据库和历史数据。
- 如需使用基础数据查询，请把 project_base_data.sqlite 放入 基础数据库 文件夹。
- 或在后续版本使用“一键更新基础数据库”功能。

注意：
- 本包面向 Windows 电脑。
- 桌面版不需要本地端口；关闭窗口即可退出。
""",
    )


def zip_dir(src, zip_path):
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in src.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(src.parent))


def main():
    if not PY_RUNTIME.exists():
        raise FileNotFoundError(f"Python runtime not found: {PY_RUNTIME}")
    if BUILD_ROOT.exists():
        shutil.rmtree(BUILD_ROOT)
    BUILD_ROOT.mkdir(parents=True)

    runtime_dir = BUILD_ROOT / "runtime" / "python"
    copytree(PY_RUNTIME, runtime_dir)

    for name in APP_FILES:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, BUILD_ROOT / src.name)

    for folder in ["temu数据源表", "erp数据源", "基础数据库", "outputs"]:
        (BUILD_ROOT / folder).mkdir(exist_ok=True)

    make_launcher(BUILD_ROOT)
    make_readme(BUILD_ROOT)
    zip_dir(BUILD_ROOT, ZIP_PATH)

    print(BUILD_ROOT)
    print(ZIP_PATH)


if __name__ == "__main__":
    main()
