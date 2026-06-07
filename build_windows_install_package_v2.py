import shutil
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

import et_xmlfile
import openpyxl


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "outputs"
VERSION = "v2.0"
DATE_CODE = datetime.now().strftime("%y%m%d")
PACKAGE_NAME = f"DailyOpsWorkbench_{VERSION}_Win11_InstallPackage_{DATE_CODE}"
BUILD_ROOT = OUTPUT_DIR / PACKAGE_NAME
ZIP_PATH = OUTPUT_DIR / f"{PACKAGE_NAME}.zip"
CACHE_DIR = OUTPUT_DIR / "_build_cache"

PYTHON_VERSION = "3.12.10"
PYTHON_EMBED_ZIP = f"python-{PYTHON_VERSION}-embed-amd64.zip"
PYTHON_EMBED_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/{PYTHON_EMBED_ZIP}"

APP_FILES = [
    "daily_ops_app.py",
    "generate_low_score_warning.py",
    "generate_temu_bargain_reply.py",
    "generate_temu_inventory_abnormal.py",
    "generate_temu_slow_moving_weekly.py",
    "generate_shein_price_abnormal.py",
    "generate_shein_inventory_abnormal.py",
    "shein_hot_warning_v11_analysis.py",
    "temu_hot_warning_v13.py",
    "update_shein_summary_30d_skc.py",
    "启动日常运营工作台.bat",
    "停止日常运营工作台.bat",
    "店铺负责人对应表.xlsx",
    "README_迁移说明.md",
]

APP_DIRS = [
    "基础数据库",
    "erp数据源",
    "temu数据源表",
    "shein数据源表",
    "核价输入表",
    "低分预警输入表",
    "低分预警历史归档",
    "原始需求",
    "docs",
]

VENDOR_PACKAGES = {
    "openpyxl": Path(openpyxl.__file__).resolve().parent,
    "et_xmlfile": Path(et_xmlfile.__file__).resolve().parent,
}


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\r\n")


def copytree(src, dst):
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo"))


def download_runtime():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / PYTHON_EMBED_ZIP
    if target.exists() and target.stat().st_size > 1_000_000:
        return target
    print(f"Downloading {PYTHON_EMBED_URL}")
    urllib.request.urlretrieve(PYTHON_EMBED_URL, target)
    return target


def make_install_scripts(package_root):
    install_bat = """@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\install_workbench_v2.ps1"
if errorlevel 1 pause
"""
    uninstall_bat = """@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\uninstall_workbench_v2.ps1"
pause
"""
    install_ps1 = f"""$ErrorActionPreference = 'Stop'
$PackageRoot = Split-Path -Parent $PSScriptRoot
$SourceApp = Join-Path $PackageRoot 'app'
$RuntimeZip = Join-Path $PackageRoot 'runtime_bundle\\{PYTHON_EMBED_ZIP}'
$InstallDir = Join-Path $env:LOCALAPPDATA 'DailyOpsWorkbenchV2'
$RuntimeDir = Join-Path $InstallDir 'runtime\\python'

Write-Host '正在安装日常运营工作台 {VERSION}...'
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
robocopy $SourceApp $InstallDir /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if(Test-Path $RuntimeDir) {{
  Remove-Item $RuntimeDir -Recurse -Force
}}
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
Expand-Archive -Path $RuntimeZip -DestinationPath $RuntimeDir -Force
Get-ChildItem $RuntimeDir -Filter 'python*._pth' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop '日常运营工作台 v2.0.lnk'
$targetPath = Join-Path $InstallDir '启动日常运营工作台.bat'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $InstallDir
$shortcut.Save()

Write-Host '安装完成。'
Write-Host ('安装目录：' + $InstallDir)
Start-Process $targetPath
"""
    uninstall_ps1 = """$ErrorActionPreference = 'Stop'
$InstallDir = Join-Path $env:LOCALAPPDATA 'DailyOpsWorkbenchV2'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop '日常运营工作台 v2.0.lnk'

try {
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:8765/api/shutdown' -ContentType 'application/json' -Body '{"reason":"uninstall"}' | Out-Null
} catch {}

if(Test-Path $InstallDir) {
  Remove-Item $InstallDir -Recurse -Force
}
if(Test-Path $shortcutPath) {
  Remove-Item $shortcutPath -Force
}
Write-Host '日常运营工作台 v2.0 已卸载。'
"""
    inno_script = '''[Setup]
AppName=DailyOpsWorkbench
AppVersion=2.0
DefaultDirName={localappdata}\\DailyOpsWorkbenchV2
DefaultGroupName=DailyOpsWorkbench
Compression=lzma
SolidCompression=yes
OutputBaseFilename=DailyOpsWorkbench_v2.0_Setup

[Files]
Source: "..\\app\\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
Source: "..\\runtime_bundle\\*"; DestDir: "{tmp}\\runtime_bundle"; Flags: ignoreversion

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\\scripts\\install_workbench_v2.ps1"""; Flags: runhidden
Filename: "{app}\\启动日常运营工作台.bat"; Description: "启动日常运营工作台 v2.0"; Flags: postinstall skipifsilent
'''
    write_text(package_root / "安装日常运营工作台_v2.0.bat", install_bat)
    write_text(package_root / "卸载日常运营工作台_v2.0.bat", uninstall_bat)
    write_text(package_root / "scripts" / "install_workbench_v2.ps1", install_ps1)
    write_text(package_root / "scripts" / "uninstall_workbench_v2.ps1", uninstall_ps1)
    write_text(package_root / "scripts" / "DailyOpsWorkbench_v2.0_InnoSetup.iss", inno_script)


def make_readme(package_root):
    text = f"""日常运营工作台 {VERSION} - Windows 11 安装包

本版本已合并：
1. 原日常运营工作台
2. Temu核价回复
3. 店铺低分产品预警

推荐安装方式：
1. 解压整个压缩包。
2. 双击“安装日常运营工作台_v2.0.bat”。
3. 安装完成后，桌面会生成“日常运营工作台 v2.0”快捷方式。

安装后软件位置：
- %LOCALAPPDATA%\\DailyOpsWorkbenchV2

本安装包特性：
- 面向 Windows 11 家庭版
- 内置离线 Python 运行时，不要求用户自己安装 Python
- 当前规则、数据目录结构、基础数据库一并打包

说明：
- 报表输出目录为安装目录下的 outputs
- 首次安装完成会自动启动工作台
- 如需停止工作台，可运行安装目录中的“停止日常运营工作台.bat”
- 如需重新封装为 exe 安装向导，可在 Windows 上使用 scripts\\DailyOpsWorkbench_v2.0_InnoSetup.iss
"""
    write_text(package_root / "README_安装说明.txt", text)


def zip_dir(src, zip_path):
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in src.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(src.parent))


def main():
    runtime_zip = download_runtime()
    if BUILD_ROOT.exists():
        shutil.rmtree(BUILD_ROOT)
    BUILD_ROOT.mkdir(parents=True)

    app_root = BUILD_ROOT / "app"
    app_root.mkdir()
    (app_root / "outputs").mkdir(exist_ok=True)

    for name in APP_FILES:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, app_root / src.name)

    for folder in APP_DIRS:
        src = ROOT / folder
        if src.exists():
            copytree(src, app_root / folder)

    vendor_root = app_root / "vendor"
    vendor_root.mkdir(exist_ok=True)
    for name, src in VENDOR_PACKAGES.items():
        copytree(src, vendor_root / name)

    runtime_bundle = BUILD_ROOT / "runtime_bundle"
    runtime_bundle.mkdir(exist_ok=True)
    shutil.copy2(runtime_zip, runtime_bundle / runtime_zip.name)

    make_install_scripts(BUILD_ROOT)
    make_readme(BUILD_ROOT)
    zip_dir(BUILD_ROOT, ZIP_PATH)

    print(BUILD_ROOT)
    print(ZIP_PATH)


if __name__ == "__main__":
    main()
