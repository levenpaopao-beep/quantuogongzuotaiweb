import queue
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import daily_ops_desktop_adapter as adapter


SYSTEM_BLUE = "#007AFF"
SYSTEM_BG = "#F5F5F7"
SYSTEM_PANEL = "#FFFFFF"
SYSTEM_LINE = "#D1D1D6"
SYSTEM_TEXT = "#1D1D1F"
SYSTEM_MUTED = "#6E6E73"


class ScrollFrame(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.canvas = tk.Canvas(self, highlightthickness=0, background=SYSTEM_BG)
        self.scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.inner = ttk.Frame(self.canvas)
        self.inner.bind("<Configure>", lambda _event: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.window = self.canvas.create_window((0, 0), window=self.inner, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        self.canvas.bind("<Configure>", self._resize_inner)
        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

    def _resize_inner(self, event):
        self.canvas.itemconfigure(self.window, width=event.width)


class DailyOpsDesktop(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("日常运营工作台")
        self.geometry("1240x780")
        self.minsize(1060, 680)
        self.events = queue.Queue()
        self.report_versions = {}
        self.source_file_labels = {}
        self.selected_source_files = {}
        self.source_groups_by_key = {}
        self.rule_vars = {}
        self.pages = {}
        self.nav_buttons = {}
        self.workflow_mode = tk.StringVar(value="数据源")
        self._configure_style()
        self._build_layout()
        self.refresh_all()
        self.after(150, self._drain_events)

    def _configure_style(self):
        style = ttk.Style(self)
        preferred = ["aqua"] if sys.platform == "darwin" else ["vista", "xpnative", "clam"]
        for theme in preferred:
            if theme in style.theme_names():
                style.theme_use(theme)
                break
        style.configure(".", font=("Arial", 12), background=SYSTEM_BG, foreground=SYSTEM_TEXT)
        style.configure("TFrame", background=SYSTEM_BG)
        style.configure("Title.TLabel", font=("Arial", 20, "bold"), background=SYSTEM_BG, foreground=SYSTEM_TEXT)
        style.configure("Section.TLabel", font=("Arial", 15, "bold"), background=SYSTEM_BG, foreground=SYSTEM_TEXT)
        style.configure("Card.TFrame", background=SYSTEM_PANEL, relief="flat", borderwidth=1)
        style.configure("Sidebar.TFrame", background="#F2F3F6")
        style.configure("Sidebar.TLabel", background="#F2F3F6", foreground=SYSTEM_TEXT)
        style.configure("SidebarMuted.TLabel", background="#F2F3F6", foreground=SYSTEM_MUTED)
        style.configure("Muted.TLabel", foreground=SYSTEM_MUTED, background=SYSTEM_BG)
        style.configure("CardMuted.TLabel", foreground=SYSTEM_MUTED, background=SYSTEM_PANEL)
        style.configure("CardTitle.TLabel", font=("Arial", 13, "bold"), background=SYSTEM_PANEL, foreground=SYSTEM_TEXT)
        style.configure("Field.TLabel", font=("Arial", 11), background=SYSTEM_PANEL, foreground=SYSTEM_MUTED)
        style.configure("Primary.TButton", padding=(12, 7), foreground=SYSTEM_BLUE)
        style.configure("Danger.TButton", padding=(12, 7))
        style.configure("Workbench.TFrame", background=SYSTEM_PANEL, relief="flat", borderwidth=1)
        style.configure("Treeview", rowheight=38, font=("Arial", 11), background=SYSTEM_PANEL, fieldbackground=SYSTEM_PANEL)
        style.configure("Treeview.Heading", font=("Arial", 11, "bold"))
        self.configure(bg=SYSTEM_BG)

    def _build_layout(self):
        self.shell = ttk.Frame(self)
        self.shell.pack(fill="both", expand=True)

        self.sidebar = ttk.Frame(self.shell, style="Sidebar.TFrame", width=188)
        self.sidebar.pack(side="left", fill="y")
        self.sidebar.pack_propagate(False)
        self._build_sidebar()

        self.content_area = ttk.Frame(self.shell, padding=(0, 0, 0, 0))
        self.content_area.pack(side="left", fill="both", expand=True)

        top = ttk.Frame(self.content_area, padding=(18, 12))
        top.pack(fill="x")
        ttk.Label(top, text="日常运营工作台", style="Title.TLabel").pack(side="left", expand=True)
        ttk.Button(top, text="刷新", command=self.refresh_all).pack(side="right", padx=(8, 0))
        ttk.Button(top, text="设置", command=lambda: self._show_page("rules")).pack(side="right", padx=(8, 0))

        self.status_text = tk.StringVar(value="正在读取状态...")
        ttk.Label(self.content_area, textvariable=self.status_text, style="Muted.TLabel", padding=(18, 0, 18, 8)).pack(fill="x")

        self.page_stack = ttk.Frame(self.content_area, padding=(14, 0, 14, 14))
        self.page_stack.pack(fill="both", expand=True)
        self.task_tab = ScrollFrame(self.page_stack)
        self.weekly_tab = ttk.Frame(self.page_stack, padding=0)
        self.output_tab = ttk.Frame(self.page_stack, padding=0)
        self.search_tab = ttk.Frame(self.page_stack, padding=0)
        self.rules_tab = ttk.Frame(self.page_stack, padding=0)
        self.log_tab = ttk.Frame(self.page_stack, padding=0)
        self.pages = {
            "task": self.task_tab,
            "weekly": self.weekly_tab,
            "output": self.output_tab,
            "search": self.search_tab,
            "rules": self.rules_tab,
            "log": self.log_tab,
        }
        for page in self.pages.values():
            page.place(x=0, y=0, relwidth=1, relheight=1)

        self._build_task_tab()
        self._build_weekly_tab()
        self._build_output_tab()
        self._build_search_tab()
        self._build_rules_tab()
        self._build_log_tab()
        self._show_page("weekly")

    def _build_sidebar(self):
        brand = ttk.Frame(self.sidebar, style="Sidebar.TFrame", padding=(14, 18, 14, 12))
        brand.pack(fill="x")
        tk.Label(brand, text="日常运营工作台", bg="#F2F3F6", fg=SYSTEM_TEXT, font=("Arial", 14, "bold")).pack(anchor="w")
        self._sidebar_item("概览", "task")
        self._sidebar_group("工作流")
        self._sidebar_item("每日工作流", "task")
        self._sidebar_item("每周工作流", "weekly")
        self._sidebar_item("每月工作流", "output")
        self._sidebar_group("数据管理")
        self._sidebar_item("数据源管理", "weekly")
        self._sidebar_item("基础数据查询", "search")
        self._sidebar_group("报表管理")
        self._sidebar_item("报表模板", "task")
        self._sidebar_item("报表历史", "output")
        self._sidebar_group("系统管理")
        self._sidebar_item("规则设置", "rules")
        self._sidebar_item("操作日志", "log")
        spacer = ttk.Frame(self.sidebar, style="Sidebar.TFrame")
        spacer.pack(fill="both", expand=True)
        user = ttk.Frame(self.sidebar, style="Sidebar.TFrame", padding=(14, 12))
        user.pack(fill="x")
        tk.Label(user, text="运营同学", bg="#F2F3F6", fg=SYSTEM_TEXT, font=("Arial", 11, "bold")).pack(anchor="w")
        tk.Label(user, text="运营组", bg="#F2F3F6", fg=SYSTEM_MUTED, font=("Arial", 10)).pack(anchor="w", pady=(2, 0))

    def _sidebar_group(self, title):
        ttk.Label(self.sidebar, text=title, style="SidebarMuted.TLabel", padding=(14, 16, 14, 6)).pack(fill="x")

    def _sidebar_item(self, title, page_key):
        button = tk.Button(
            self.sidebar,
            text=title,
            anchor="w",
            bd=0,
            relief="flat",
            padx=16,
            pady=8,
            bg="#F2F3F6",
            fg=SYSTEM_TEXT,
            activebackground="#E8F0FF",
            activeforeground=SYSTEM_BLUE,
            command=lambda key=page_key: self._show_page(key),
        )
        button.pack(fill="x", padx=10, pady=1)
        self.nav_buttons.setdefault(page_key, []).append(button)

    def _show_page(self, page_key):
        page = self.pages.get(page_key)
        if not page:
            return
        page.tkraise()
        for buttons in self.nav_buttons.values():
            for button in buttons:
                button.configure(bg="#F2F3F6", fg=SYSTEM_TEXT)
        for button in self.nav_buttons.get(page_key, []):
            button.configure(bg=SYSTEM_BLUE, fg="#FFFFFF")

    def _build_task_tab(self):
        toolbar = ttk.Frame(self.task_tab.inner, padding=10)
        toolbar.pack(fill="x")
        ttk.Button(toolbar, text="生成本周报表", command=self.run_weekly_reports).pack(side="left")
        ttk.Button(toolbar, text="刷新输出", command=self.refresh_all).pack(side="left", padx=(8, 0))
        self.report_grid = ttk.Frame(self.task_tab.inner, padding=10)
        self.report_grid.pack(fill="both", expand=True)

    def _build_weekly_tab(self):
        header = ttk.Frame(self.weekly_tab)
        header.pack(fill="x", pady=(0, 10))
        ttk.Label(header, text="每周工作流", style="Section.TLabel").pack(side="left")
        ttk.Button(header, text="刷新", command=self.refresh_all).pack(side="right")
        ttk.Button(header, text="生成本周报表", style="Primary.TButton", command=self.run_weekly_reports).pack(side="right", padx=(0, 8))

        mode = ttk.Frame(self.weekly_tab, style="Workbench.TFrame", padding=2)
        mode.pack(anchor="center", pady=(0, 12))
        self.workflow_buttons = {}
        for text, page_key in [("数据源", "weekly"), ("生成报表", "task"), ("输出记录", "output")]:
            button = tk.Button(
                mode,
                text=text,
                bd=0,
                padx=34,
                pady=8,
                bg=SYSTEM_BLUE if text == "数据源" else SYSTEM_PANEL,
                fg="#FFFFFF" if text == "数据源" else SYSTEM_TEXT,
                activebackground="#E8F0FF",
                command=lambda name=text, key=page_key: self._set_workflow_mode(name, key),
            )
            button.pack(side="left")
            self.workflow_buttons[text] = button

        body = ttk.Panedwindow(self.weekly_tab, orient="horizontal")
        body.pack(fill="both", expand=True)

        left = ttk.Frame(body, style="Workbench.TFrame", padding=12)
        right = ttk.Frame(body, style="Workbench.TFrame", padding=12)
        body.add(left, weight=4)
        body.add(right, weight=2)

        left_head = ttk.Frame(left, style="Workbench.TFrame")
        left_head.pack(fill="x", pady=(0, 8))
        ttk.Label(left_head, text="数据源状态", style="CardTitle.TLabel").pack(side="left")
        self.source_count_text = tk.StringVar(value="共 0 个数据源")
        ttk.Label(left_head, textvariable=self.source_count_text, style="CardMuted.TLabel").pack(side="right")

        table = ttk.Frame(left, style="Workbench.TFrame")
        table.pack(fill="both", expand=True)
        self.source_tree = ttk.Treeview(table, columns=("source", "latest", "pending", "rows", "status"), show="headings", height=13)
        for key, title, width in [
            ("source", "数据源", 180),
            ("latest", "最新文件", 280),
            ("pending", "待提交", 76),
            ("rows", "记录数", 96),
            ("status", "状态", 110),
        ]:
            self.source_tree.heading(key, text=title)
            self.source_tree.column(key, width=width, anchor="w")
        source_scroll = ttk.Scrollbar(table, orient="vertical", command=self.source_tree.yview)
        self.source_tree.configure(yscrollcommand=source_scroll.set)
        self.source_tree.pack(side="left", fill="both", expand=True)
        source_scroll.pack(side="right", fill="y")
        self.source_tree.bind("<<TreeviewSelect>>", self.on_source_selected)

        source_tip = ttk.Frame(left, style="Workbench.TFrame", padding=(0, 10, 0, 0))
        source_tip.pack(fill="x")
        ttk.Label(source_tip, text="数据源同步提醒", style="Field.TLabel").pack(side="left")
        ttk.Label(source_tip, text="选择文件后上传到本次批次，再结束上传；所有动作都在这个页面完成。", style="CardMuted.TLabel").pack(side="left", padx=(18, 0))

        ttk.Label(right, text="选中数据源", style="CardTitle.TLabel").pack(anchor="w")
        self.source_detail_title = tk.StringVar(value="请选择左侧数据源")
        self.source_detail_meta = tk.StringVar(value="暂无选中数据源")
        self.source_selected_text = tk.StringVar(value="未选择文件")
        ttk.Label(right, textvariable=self.source_detail_title, style="CardTitle.TLabel", wraplength=300).pack(anchor="w", pady=(14, 0))
        ttk.Label(right, textvariable=self.source_detail_meta, style="CardMuted.TLabel", wraplength=300).pack(anchor="w", pady=(4, 0))
        ttk.Label(right, textvariable=self.source_selected_text, style="CardMuted.TLabel", wraplength=300).pack(anchor="w", pady=(12, 0))
        action_grid = ttk.Frame(right, style="Workbench.TFrame")
        action_grid.pack(fill="x", pady=(12, 18))
        for col in range(2):
            action_grid.columnconfigure(col, weight=1)
        ttk.Button(action_grid, text="选择文件", command=self.pick_selected_source_files).grid(row=0, column=0, sticky="ew", padx=(0, 6), pady=4)
        ttk.Button(action_grid, text="上传", command=self.upload_selected_source_files).grid(row=0, column=1, sticky="ew", padx=(6, 0), pady=4)
        ttk.Button(action_grid, text="结束上传", command=self.finish_selected_source).grid(row=1, column=0, sticky="ew", padx=(0, 6), pady=4)
        ttk.Button(action_grid, text="清空待提交", command=self.clear_selected_source).grid(row=1, column=1, sticky="ew", padx=(6, 0), pady=4)

        queue_head = ttk.Frame(right, style="Workbench.TFrame")
        queue_head.pack(fill="x", pady=(4, 8))
        ttk.Label(queue_head, text="本周生成队列", style="CardTitle.TLabel").pack(side="left")
        self.report_count_text = tk.StringVar(value="共 0 个报表")
        ttk.Label(queue_head, textvariable=self.report_count_text, style="CardMuted.TLabel").pack(side="right")
        self.weekly_report_tree = ttk.Treeview(right, columns=("report", "status"), show="headings", height=9)
        self.weekly_report_tree.heading("report", text="报表")
        self.weekly_report_tree.heading("status", text="状态")
        self.weekly_report_tree.column("report", width=210, anchor="w")
        self.weekly_report_tree.column("status", width=86, anchor="w")
        self.weekly_report_tree.pack(fill="both", expand=True)

    def _set_workflow_mode(self, name, page_key):
        self.workflow_mode.set(name)
        for label, button in self.workflow_buttons.items():
            button.configure(bg=SYSTEM_BLUE if label == name else SYSTEM_PANEL, fg="#FFFFFF" if label == name else SYSTEM_TEXT)
        self._show_page(page_key)

    def _build_output_tab(self):
        top = ttk.Frame(self.output_tab)
        top.pack(fill="x")
        ttk.Button(top, text="刷新", command=self.refresh_outputs).pack(side="left")
        self.output_tree = ttk.Treeview(self.output_tab, columns=("report", "name", "modified", "size"), show="headings", height=22)
        for key, title, width in [("report", "模块", 160), ("name", "文件名", 420), ("modified", "生成时间", 150), ("size", "大小", 90)]:
            self.output_tree.heading(key, text=title)
            self.output_tree.column(key, width=width, anchor="w")
        self.output_tree.pack(fill="both", expand=True, pady=10)
        actions = ttk.Frame(self.output_tab)
        actions.pack(fill="x")
        ttk.Button(actions, text="打开文件", command=self.open_selected_output).pack(side="left")
        ttk.Button(actions, text="打开所在文件夹", command=self.reveal_selected_output).pack(side="left", padx=(8, 0))

    def _build_search_tab(self):
        bar = ttk.Frame(self.search_tab)
        bar.pack(fill="x")
        self.search_query = tk.StringVar()
        ttk.Entry(bar, textvariable=self.search_query, width=48).pack(side="left")
        ttk.Button(bar, text="查询", command=self.run_search).pack(side="left", padx=(8, 0))
        ttk.Button(bar, text="导出结果", command=self.export_search).pack(side="left", padx=(8, 0))
        self.search_tree = ttk.Treeview(self.search_tab, show="headings", height=24)
        self.search_tree.pack(fill="both", expand=True, pady=10)

    def _build_rules_tab(self):
        container = ScrollFrame(self.rules_tab)
        container.pack(fill="both", expand=True)
        ttk.Label(container.inner, text="规则设置", style="Section.TLabel").pack(anchor="w", padx=10, pady=(8, 2))
        ttk.Label(container.inner, text="按业务字段填写，保存后后续生成表格会使用这些规则。", style="Muted.TLabel").pack(anchor="w", padx=10, pady=(0, 12))

        hot = self._rules_section(container.inner, "爆旺款规则")
        self.rule_vars["rule_temu_basis"] = self._add_field(hot, "Temu爆旺款口径", "rule_temu_basis")
        self.rule_vars["rule_hot_keywords"] = self._add_field(hot, "爆旺关键词", "rule_hot_keywords")
        self.rule_vars["rule_shein_new_days_lt"] = self._add_field(hot, "SHEIN新品爆旺：上架天数小于", "rule_shein_new_days_lt")
        self.rule_vars["rule_shein_new_7d_daily_gte"] = self._add_field(hot, "SHEIN新品爆旺：7天日均不低于", "rule_shein_new_7d_daily_gte")
        self.rule_vars["rule_shein_old_days_gte"] = self._add_field(hot, "SHEIN老品爆旺：上架天数不低于", "rule_shein_old_days_gte")
        self.rule_vars["rule_shein_old_30d_daily_gt"] = self._add_field(hot, "SHEIN老品爆旺：30天日均大于", "rule_shein_old_30d_daily_gt")

        sort = self._rules_section(container.inner, "排序规则")
        self.rule_vars["rule_group_order"] = self._add_field(sort, "表格排序层级", "rule_group_order")
        self.rule_vars["rule_size_order"] = self._add_field(sort, "尺码排序", "rule_size_order")

        slow = self._rules_section(container.inner, "滞销品规则")
        self.rule_vars["rule_new_product_days_lt"] = self._add_field(slow, "新品定义：上架天数小于", "rule_new_product_days_lt")
        self.rule_vars["rule_new_slow_min_days"] = self._add_field(slow, "新品滞销：上架天数超过", "rule_new_slow_min_days")
        self.rule_vars["rule_new_slow_max_days"] = self._add_field(slow, "新品滞销：上架天数小于", "rule_new_slow_max_days")
        self.rule_vars["rule_old_slow_min_days"] = self._add_field(slow, "老品滞销：上架天数超过", "rule_old_slow_min_days")
        self.rule_vars["rule_group_by"] = self._add_field(slow, "滞销判断分组", "rule_group_by")

        actions = ttk.Frame(container.inner, padding=(10, 12))
        actions.pack(fill="x")
        ttk.Button(actions, text="保存规则", style="Primary.TButton", command=self.save_rules).pack(side="left")
        ttk.Button(actions, text="恢复当前已保存内容", command=self.load_rules).pack(side="left", padx=(8, 0))

    def _rules_section(self, parent, title):
        section = ttk.Frame(parent, style="Card.TFrame", padding=14)
        section.pack(fill="x", padx=10, pady=8)
        ttk.Label(section, text=title, style="CardTitle.TLabel").grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 10))
        section.columnconfigure(0, weight=1)
        section.columnconfigure(1, weight=1)
        section._next_row = 1
        return section

    def _add_field(self, parent, label, key):
        var = tk.StringVar()
        index = parent._next_row
        col = (index - 1) % 2
        row = 1 + (index - 1) // 2
        frame = ttk.Frame(parent, style="Card.TFrame")
        frame.grid(row=row, column=col, sticky="ew", padx=(0 if col == 0 else 8, 8 if col == 0 else 0), pady=6)
        frame.columnconfigure(0, weight=1)
        ttk.Label(frame, text=label, style="Field.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Entry(frame, textvariable=var).grid(row=1, column=0, sticky="ew", pady=(4, 0))
        parent._next_row += 1
        return var

    def _build_log_tab(self):
        self.log_text = tk.Text(self.log_tab, wrap="word", state="disabled")
        self.log_text.pack(fill="both", expand=True)

    def refresh_all(self):
        try:
            self.app_status = adapter.status()
            db = self.app_status["database"]
            self.status_text.set(
                f"版本 {self.app_status['version']} | Temu {self.app_status['temu_files']} 个 | "
                f"Shein {self.app_status['shein_files']} 个 | ERP {self.app_status['erp_files']} 个 | "
                f"基础库 {db['tables']} 表 / {db['rows']} 行"
            )
            self.render_reports()
            self.render_sources()
            self.refresh_outputs()
            self.load_rules()
        except Exception as exc:
            self.status_text.set(str(exc))
            self.log(f"刷新状态失败：{exc}")

    def render_reports(self):
        self._clear(self.report_grid)
        reports = self.app_status.get("reports", {})
        for index, (report_id, report) in enumerate(reports.items()):
            card = ttk.Frame(self.report_grid, style="Card.TFrame", padding=12)
            row, col = divmod(index, 3)
            card.grid(row=row, column=col, sticky="nsew", padx=8, pady=8)
            self.report_grid.columnconfigure(col, weight=1)
            ttk.Label(card, text=report["name"], font=("Arial", 13, "bold")).pack(anchor="w")
            ttk.Label(card, text=report["description"], style="Muted.TLabel", wraplength=310).pack(anchor="w", pady=(4, 0))
            ttk.Label(card, text=f"数据源：{report['sources']}", style="Muted.TLabel", wraplength=310).pack(anchor="w", pady=(4, 8))
            controls = ttk.Frame(card)
            controls.pack(fill="x")
            version = self.report_versions.setdefault(report_id, tk.StringVar(value="V1"))
            ttk.Entry(controls, textvariable=version, width=8).pack(side="left")
            ttk.Button(controls, text="生成表格", command=lambda rid=report_id: self.run_report(rid)).pack(side="left", padx=(8, 0))
            ttk.Button(controls, text="打开最近", command=lambda rid=report_id: self.open_latest_for_report(rid)).pack(side="left", padx=(8, 0))
            recent = [item for item in self.app_status.get("outputs", []) if item.get("report") == report_id][:3]
            text = "\n".join(item["name"] for item in recent) if recent else "暂无已生成表格"
            ttk.Label(card, text=text, style="Muted.TLabel", wraplength=310).pack(anchor="w", pady=(10, 0))

    def render_sources(self):
        groups = self.app_status.get("source_groups", [])
        self.source_groups_by_key = {group["key"]: group for group in groups}
        current_selection = self._selected_source_key()
        for item in self.source_tree.get_children():
            self.source_tree.delete(item)
        for group in groups:
            latest = group.get("latest") or {}
            batch_files = group.get("batch_files") or []
            latest_name = "、".join(batch_files) if batch_files else latest.get("name", "暂无")
            self.source_file_labels.setdefault(group["key"], tk.StringVar(value="未选择文件"))
            self.source_tree.insert(
                "",
                "end",
                iid=group["key"],
                values=(
                    group["name"],
                    latest_name,
                    group.get("pending_count", 0),
                    group.get("total_rows") or latest.get("rows") or "-",
                    group["status"],
                ),
            )
        self.source_count_text.set(f"共 {len(groups)} 个数据源")
        if current_selection in self.source_groups_by_key:
            self.source_tree.selection_set(current_selection)
        elif groups:
            self.source_tree.selection_set(groups[0]["key"])
        self.update_source_detail()
        self.render_weekly_report_queue()

    def render_weekly_report_queue(self):
        for item in self.weekly_report_tree.get_children():
            self.weekly_report_tree.delete(item)
        reports = self.app_status.get("reports", {})
        outputs = self.app_status.get("outputs", [])
        for report_id, report in reports.items():
            has_recent = any(item.get("report") == report_id for item in outputs)
            self.weekly_report_tree.insert("", "end", values=(report["name"], "已有输出" if has_recent else "可生成"))
        self.report_count_text.set(f"共 {len(reports)} 个报表")

    def on_source_selected(self, _event=None):
        self.update_source_detail()

    def update_source_detail(self):
        key = self._selected_source_key()
        group = self.source_groups_by_key.get(key) if key else None
        if not group:
            self.source_detail_title.set("请选择左侧数据源")
            self.source_detail_meta.set("暂无选中数据源")
            self.source_selected_text.set("未选择文件")
            return
        latest = group.get("latest") or {}
        batch_files = group.get("batch_files") or []
        latest_name = "、".join(batch_files) if batch_files else latest.get("name", "暂无")
        rows = group.get("total_rows") or latest.get("rows") or "-"
        self.source_detail_title.set(group["name"])
        self.source_detail_meta.set(f"{group['status']} | 记录数 {rows} | 待提交 {group.get('pending_count', 0)}\n最新文件：{latest_name}")
        self.source_selected_text.set(self.source_file_labels.setdefault(group["key"], tk.StringVar(value="未选择文件")).get())

    def refresh_outputs(self):
        for item in self.output_tree.get_children():
            self.output_tree.delete(item)
        self.outputs_by_item = {}
        report_names = {key: value["name"] for key, value in adapter.reports().items()}
        for item in adapter.outputs(100):
            iid = self.output_tree.insert("", "end", values=(report_names.get(item.get("report"), item.get("report", "")), item["name"], item["modified"], self._fmt_size(item["size"])))
            self.outputs_by_item[iid] = item

    def load_rules(self):
        rules = adapter.load_rules()
        hot = rules.get("hot_item", {})
        sort = rules.get("sort", {})
        slow = rules.get("slow_moving", {})
        self._set_rule("rule_temu_basis", hot.get("temu_basis", ""))
        self._set_rule("rule_hot_keywords", self._join_list(hot.get("keywords")))
        self._set_rule("rule_shein_new_days_lt", hot.get("shein_new_days_lt", 30))
        self._set_rule("rule_shein_new_7d_daily_gte", hot.get("shein_new_7d_daily_gte", 10))
        self._set_rule("rule_shein_old_days_gte", hot.get("shein_old_days_gte", 30))
        self._set_rule("rule_shein_old_30d_daily_gt", hot.get("shein_old_30d_daily_gt", 20))
        self._set_rule("rule_group_order", self._join_list(sort.get("group_order")))
        self._set_rule("rule_size_order", self._join_list(sort.get("size_order")))
        self._set_rule("rule_new_product_days_lt", slow.get("new_product_days_lt", 28))
        self._set_rule("rule_new_slow_min_days", slow.get("new_slow_min_days", 30))
        self._set_rule("rule_new_slow_max_days", slow.get("new_slow_max_days", 60))
        self._set_rule("rule_old_slow_min_days", slow.get("old_slow_min_days", 180))
        self._set_rule("rule_group_by", slow.get("group_by", "店铺+SPU"))

    def save_rules(self):
        try:
            current = adapter.load_rules()
            rules = {
                "hot_item": {
                    **(current.get("hot_item") or {}),
                    "temu_basis": self._rule_text("rule_temu_basis"),
                    "keywords": self._split_list("rule_hot_keywords"),
                    "shein_new_days_lt": self._rule_number("rule_shein_new_days_lt", 30),
                    "shein_new_7d_daily_gte": self._rule_number("rule_shein_new_7d_daily_gte", 10),
                    "shein_old_days_gte": self._rule_number("rule_shein_old_days_gte", 30),
                    "shein_old_30d_daily_gt": self._rule_number("rule_shein_old_30d_daily_gt", 20),
                },
                "sort": {
                    "group_order": self._split_list("rule_group_order"),
                    "size_order": self._split_list("rule_size_order"),
                },
                "slow_moving": {
                    **(current.get("slow_moving") or {}),
                    "new_product_days_lt": self._rule_number("rule_new_product_days_lt", 28),
                    "new_slow_min_days": self._rule_number("rule_new_slow_min_days", 30),
                    "new_slow_max_days": self._rule_number("rule_new_slow_max_days", 60),
                    "old_slow_min_days": self._rule_number("rule_old_slow_min_days", 180),
                    "group_by": self._rule_text("rule_group_by") or "店铺+SPU",
                    "sales30_total_equals": 0,
                },
            }
            adapter.save_rules(rules)
            self.log("规则已保存")
            messagebox.showinfo("保存成功", "规则已保存")
        except Exception as exc:
            messagebox.showerror("保存失败", str(exc))

    def _set_rule(self, key, value):
        if key in self.rule_vars:
            self.rule_vars[key].set("" if value is None else str(value))

    def _rule_text(self, key):
        return self.rule_vars[key].get().strip()

    def _rule_number(self, key, fallback):
        raw = self._rule_text(key)
        if raw == "":
            return fallback
        try:
            value = float(raw)
        except ValueError as exc:
            raise ValueError(f"{key} 需要填写数字") from exc
        return int(value) if value.is_integer() else value

    def _split_list(self, key):
        text = self._rule_text(key)
        return [item.strip() for item in text.replace("，", ",").split(",") if item.strip()]

    def _join_list(self, value):
        return ", ".join(str(item) for item in (value or []))

    def run_report(self, report_id):
        version = self.report_versions[report_id].get().strip() or "V1"
        self._run_background(f"生成 {adapter.reports()[report_id]['name']}", lambda: adapter.generate_report(report_id, version), self._after_report)

    def run_weekly_reports(self):
        self._run_background("生成本周报表", adapter.generate_weekly_reports, lambda _result: self.refresh_all())

    def pick_source_files(self, group):
        paths = filedialog.askopenfilenames(title=f"选择{group['name']}", filetypes=[("表格文件", "*.xlsx *.xls *.csv"), ("所有文件", "*.*")])
        if not paths:
            return
        self.selected_source_files[group["key"]] = list(paths)
        self.source_file_labels[group["key"]].set(f"已选择 {len(paths)} 个文件")
        self.update_source_detail()

    def upload_source_files(self, group):
        paths = self.selected_source_files.get(group["key"], [])
        if not paths:
            messagebox.showwarning("未选择文件", "请先选择要上传的文件")
            return
        self._run_background(f"上传 {group['name']}", lambda: adapter.import_source_files(group["upload_target"], paths), lambda _result: self.refresh_all())

    def finish_source(self, group):
        self._run_background(f"结束上传 {group['name']}", lambda: adapter.finish_upload(group["upload_target"]), lambda _result: self.refresh_all())

    def clear_source(self, group):
        self._run_background(f"清空待提交 {group['name']}", lambda: adapter.clear_upload(group["upload_target"]), lambda _result: self.refresh_all())

    def pick_selected_source_files(self):
        group = self._selected_source_group()
        if group:
            self.pick_source_files(group)

    def upload_selected_source_files(self):
        group = self._selected_source_group()
        if group:
            self.upload_source_files(group)

    def finish_selected_source(self):
        group = self._selected_source_group()
        if group:
            self.finish_source(group)

    def clear_selected_source(self):
        group = self._selected_source_group()
        if group:
            self.clear_source(group)

    def _selected_source_key(self):
        if not hasattr(self, "source_tree"):
            return None
        selected = self.source_tree.selection()
        return selected[0] if selected else None

    def _selected_source_group(self):
        key = self._selected_source_key()
        if not key:
            messagebox.showinfo("未选择数据源", "请先在左侧选择一个数据源")
            return None
        group = self.source_groups_by_key.get(key)
        if not group:
            messagebox.showinfo("未选择数据源", "请先在左侧选择一个数据源")
        return group

    def run_search(self):
        query = self.search_query.get().strip()
        if not query:
            return
        try:
            rows = adapter.search(query, 200)
            self.render_search_rows(rows)
            self.log(f"查询完成：{len(rows)} 行")
        except Exception as exc:
            messagebox.showerror("查询失败", str(exc))

    def render_search_rows(self, rows):
        for item in self.search_tree.get_children():
            self.search_tree.delete(item)
        if not rows:
            self.search_tree["columns"] = ("empty",)
            self.search_tree.heading("empty", text="无结果")
            return
        columns = list(rows[0].keys())[:10]
        self.search_tree["columns"] = columns
        for col in columns:
            self.search_tree.heading(col, text=col)
            self.search_tree.column(col, width=140, anchor="w")
        for row in rows:
            self.search_tree.insert("", "end", values=[row.get(col, "") for col in columns])

    def export_search(self):
        query = self.search_query.get().strip()
        if not query:
            return
        self._run_background("导出查询结果", lambda: adapter.export_search(query, 500), self._after_export_search)

    def open_selected_output(self):
        item = self._selected_output()
        if item:
            adapter.open_path(adapter.output_file_path(item["name"]))

    def reveal_selected_output(self):
        item = self._selected_output()
        if item:
            adapter.reveal_path(adapter.output_file_path(item["name"]))

    def open_latest_for_report(self, report_id):
        for item in adapter.outputs(100):
            if item.get("report") == report_id:
                adapter.open_path(adapter.output_file_path(item["name"]))
                return
        messagebox.showinfo("暂无文件", "这个模块还没有生成过表格")

    def _after_report(self, result):
        self.refresh_all()
        file_name = result.get("file", "")
        if messagebox.askyesno("生成完成", f"已生成：{file_name}\n是否打开文件？"):
            adapter.open_path(adapter.output_file_path(file_name))

    def _after_export_search(self, result):
        self.refresh_outputs()
        output = result.get("output")
        if output and messagebox.askyesno("导出完成", f"已导出：{Path(output).name}\n是否打开文件？"):
            adapter.open_path(output)

    def _selected_output(self):
        selected = self.output_tree.selection()
        if not selected:
            messagebox.showinfo("未选择文件", "请先选择一个输出文件")
            return None
        return self.outputs_by_item.get(selected[0])

    def _run_background(self, title, func, on_success):
        self.log(f"开始：{title}")
        def worker():
            try:
                result = func()
                self.events.put(("success", title, result, on_success))
            except Exception as exc:
                self.events.put(("error", title, exc, None))
        threading.Thread(target=worker, daemon=True).start()

    def _drain_events(self):
        while True:
            try:
                kind, title, payload, callback = self.events.get_nowait()
            except queue.Empty:
                break
            if kind == "success":
                self.log(f"完成：{title}")
                if callback:
                    callback(payload)
            else:
                self.log(f"失败：{title}：{payload}")
                messagebox.showerror("任务失败", f"{title}\n{payload}")
        self.after(150, self._drain_events)

    def log(self, message):
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _clear(self, frame):
        for child in frame.winfo_children():
            child.destroy()

    def _fmt_size(self, value):
        value = int(value or 0)
        if value >= 1024 * 1024:
            return f"{value / 1024 / 1024:.1f} MB"
        if value >= 1024:
            return f"{value / 1024:.1f} KB"
        return f"{value} B"


def main():
    app = DailyOpsDesktop()
    app.mainloop()


if __name__ == "__main__":
    main()
