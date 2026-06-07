# 日常运营工作台

这个仓库保存日常运营工作台和报表生成脚本的代码、规则文档、启动脚本和测试文件。

## 本仓库默认包含

- 工作台入口：`daily_ops_app.py`
- Temu / Shein / ERP 报表生成脚本
- 业务规则和需求文档
- 单元测试
- 启动和停止脚本

## 本仓库默认不包含

以下内容体积较大或包含业务数据，已通过 `.gitignore` 排除：

- `outputs/`
- `基础数据库/*.sqlite`
- 各平台数据源表文件夹
- 输入表、历史归档表
- 生成的 Excel / CSV / 安装包 / 运行缓存

如需迁移完整业务数据，请使用现有的迁移包脚本或单独传输数据目录。

## Python 依赖

```bash
pip install -r requirements.txt
```

## 测试

```bash
python3 -m unittest discover
```
