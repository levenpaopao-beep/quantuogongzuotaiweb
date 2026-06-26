const api = window.dailyOps;

const state = {
  status: null,
  reports: {},
  outputs: [],
  rules: {},
  selectedFiles: {},
  sourceProgress: {},
  tasks: [],
  taskPackages: [],
  taskSummary: {},
  taskOverview: {},
  taskTotal: 0,
  taskLimit: 200,
  taskOffset: 0,
  taskHasMore: false,
  pendingTaskPackageSelection: null,
  reportTaskSync: {},
  reportTasks: {},
  storeOwners: [],
  sales: null,
  salesFocus: "missing",
  salesEditingIndex: null,
  salesCompare: null,
  salesReport: null,
  businessReport: null,
  homeBusinessReports: {},
  assetOverview: null,
  businessTab: "overview",
  businessRange: "30d",
  businessSource: "manual",
  importMatrix: null,
  importFocus: "blocked",
  taskSuppressions: [],
  taskDialog: null,
  customPlatforms: [],
  ownerOptions: [],
  operatorAccounts: [],
  productInfo: [],
  bargainDraft: [],
  bargainHistory: [],
  bargainClearance: null,
  bargainLowPriceRisks: [],
  bargainTab: "history",
};

const BUILT_IN_PLATFORMS = ["Temu", "Shein", "速卖通", "TK", "Ozon"];
const MASTER_MODULES = {
  "master-import": {
    pill: "导入",
    title: "基础资料导入",
    desc: "导入负责人表和历史销量表，生成账号与整理结果。",
  },
  "operator-accounts": {
    pill: "员工",
    title: "员工管理",
    desc: "查看店长账号，手动新增账号，重置登录密码。",
  },
  "store-info": {
    pill: "店铺",
    title: "店铺信息管理",
    desc: "维护平台、店铺、负责人和每日销量填报开关。",
  },
  "product-info": {
    pill: "ERP",
    title: "商品信息查询",
    desc: "只读查询 ERP 已同步的商品基础信息。",
  },
  "task-suppressions": {
    pill: "任务",
    title: "任务屏蔽清单",
    desc: "查看已屏蔽的重复商品任务和屏蔽原因。",
  },
};
const SETTINGS_MODULES = {
  "field-rules": { pill: "规则", title: "字段与判断规则", desc: "维护爆旺、滞销、尺码排序和表格排序。" },
  "sales-thresholds": { pill: "阈值", title: "销量与经营阈值", desc: "维护销量差异、完整度、ERP 过期和平台批次提醒。" },
  "erp-settings": { pill: "ERP", title: "ERP 接口设置", desc: "维护旺店通接口、同步范围和商品库存拉取配置。" },
  "system-maintenance": { pill: "维护", title: "系统维护", desc: "备份当前系统数据，检查系统是否可正常运行。" },
};

function $(selector) {
  return document.querySelector(selector);
}

function currentOperator() {
  try {
    return JSON.parse(localStorage.getItem("dailyOpsOperator") || "{}");
  } catch (_error) {
    return {};
  }
}

function collectOwnerOptions() {
  const names = new Set();
  (state.storeOwners || []).forEach((item) => {
    if (item.owner) names.add(item.owner);
  });
  (state.sales?.entries || []).forEach((item) => {
    if (item.owner) names.add(item.owner);
  });
  (state.importMatrix?.rows || []).forEach((item) => {
    if (item.owner) names.add(item.owner);
  });
  [state.taskOverview?.owner_status, state.taskSummary?.owner_status].forEach((ownerStatus) => {
    Object.keys(ownerStatus || {}).forEach((owner) => {
      if (owner && owner !== "未分配") names.add(owner);
    });
  });
  return [...names].sort((a, b) => String(a).localeCompare(String(b), "zh-Hans-CN"));
}

function renderOperatorOwnerOptions() {
  state.ownerOptions = collectOwnerOptions();
  const list = $("#operatorOwnerOptions");
  if (list) {
    list.innerHTML = state.ownerOptions.map((owner) => `<option value="${esc(owner)}"></option>`).join("");
  }
  validateOperatorDraft(false);
}

function validateOperatorDraft(showMessage = false) {
  const draft = selectedOperatorDraft();
  const input = $("#operatorUser");
  if (draft.role !== "owner") {
    input?.classList.remove("field-error");
    if ($("#operatorHint")) $("#operatorHint").textContent = draft.user ? `管理员 · ${draft.user}` : "管理员 · 全部数据";
    return true;
  }
  if (!draft.user) {
    input?.classList.add("field-error");
    if ($("#operatorHint")) $("#operatorHint").textContent = "店长视角需填写姓名";
    if (showMessage) showToast("输入店长姓名后再切换视角");
    return false;
  }
  const hasOptions = state.ownerOptions.length > 0;
  const matched = !hasOptions || state.ownerOptions.includes(draft.user);
  input?.classList.toggle("field-error", !matched);
  if ($("#operatorHint")) {
    $("#operatorHint").textContent = matched
      ? `店长 · ${draft.user} · 只看自己负责的数据`
      : `未找到负责人：${draft.user}`;
  }
  if (!matched && showMessage) {
    showToast("这个姓名不在负责人配置里，请从下拉建议选择或让管理员维护基础资料");
  }
  return matched;
}

function applyOperatorToTasks() {
  const operator = currentOperator();
  const role = operator.role || "admin";
  const user = operator.user || "";
  if ($("#operatorRole")) $("#operatorRole").value = role;
  if ($("#operatorUser")) $("#operatorUser").value = user;
  if ($("#taskRole")) {
    $("#taskRole").value = role;
    $("#taskRole").disabled = role === "owner";
  }
  if ($("#taskUser")) $("#taskUser").value = user;
  defaultOpenTasksForOwner(role);
  const label = role === "admin" ? "管理员" : "店长";
  if ($("#operatorHint")) $("#operatorHint").textContent = user ? `${label} · ${user}` : "管理员 · 全部数据";
  const name = document.querySelector(".operator-name");
  const roleText = document.querySelector(".operator-role");
  const avatar = document.querySelector(".avatar");
  if (name) name.textContent = user || (role === "admin" ? "管理员" : "未设置店长");
  if (roleText) roleText.textContent = role === "admin" ? "查看全部平台和店铺" : "只看自己负责的数据";
  if (avatar) avatar.textContent = role === "admin" ? "AD" : "店";
  applyRoleVisibility(role);
  renderOperatorOwnerOptions();
  renderRoleCopy();
}

function defaultOpenTasksForOwner(role = currentOperator().role || "admin") {
  const openOnly = $("#taskOpenOnly");
  if (role === "owner" && openOnly) openOnly.checked = true;
}

function applyRoleVisibility(role = currentOperator().role || "admin") {
  const ownerMode = role === "owner";
  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.classList.toggle("hidden", ownerMode);
  });
  document.querySelectorAll("[data-owner-only]").forEach((element) => {
    element.classList.toggle("hidden", !ownerMode);
  });
}

function saveOperator() {
  const operator = {
    role: $("#operatorRole")?.value || "admin",
    user: $("#operatorUser")?.value.trim() || "",
  };
  if (operator.role === "owner" && !validateOperatorDraft(true)) {
    const input = $("#operatorUser");
    input?.focus();
    return;
  }
  $("#operatorUser")?.classList.remove("field-error");
  localStorage.setItem("dailyOpsOperator", JSON.stringify(operator));
  applyOperatorToTasks();
  loadSales(false);
  loadImportMatrix(false);
  loadBusinessReport(false);
  loadTaskSuppressions();
  loadTasks();
}

function operatorPayload(extra = {}) {
  const operator = currentOperator();
  return {
    role: operator.role || "admin",
    user: operator.user || "",
    ...extra,
  };
}

function todayDateText() {
  return localDateValue(new Date());
}

function salesDefaultDateText() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateValue(date);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function userFacingError(error) {
  return String(error?.message || error || "请查看错误信息")
    .replace(/^Error invoking remote method '[^']+': Error:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

function selectedOperatorDraft() {
  return {
    role: $("#operatorRole")?.value || currentOperator().role || "admin",
    user: $("#operatorUser")?.value.trim() || currentOperator().user || "",
  };
}

function renderRoleCopy() {
  renderTodayWorkflow();
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function taskDialogContext(ids) {
  const selected = (ids || []).map((id) => state.tasks.find((item) => item.id === id)).filter(Boolean);
  if (!selected.length) {
    return `<strong>已选择 ${ids.length} 条任务</strong><p>将按当前勾选任务整包处理。</p>`;
  }
  const first = selected[0];
  const title = [first.platform, first.store, first.owner, first.task_type].filter(Boolean).join(" · ");
  const detail = [first.product_name, first.merchant_code, first.skc ? `SKC ${first.skc}` : "", first.system_action].filter(Boolean).join("　");
  const more = selected.length > 1 ? `，另 ${selected.length - 1} 条` : "";
  return `<strong>${esc(title || "任务包")}${more}</strong><p>${esc(detail || "整包任务处理")}</p>`;
}

function openTaskDialog(config) {
  state.taskDialog = config;
  const dialog = $("#taskDialog");
  const fieldsWrap = $("#taskDialogFields");
  if (!dialog || !fieldsWrap) return;
  $("#taskDialogPill").textContent = config.pill || "任务操作";
  $("#taskDialogTitle").textContent = config.title || "处理任务";
  $("#taskDialogDesc").textContent = config.description || "填写本次处理信息。";
  $("#taskDialogSubmit").textContent = config.submitLabel || "提交";
  $("#taskDialogContext").innerHTML = config.contextHtml || taskDialogContext(config.ids || []);
  $("#taskDialogForm").classList.toggle("hidden", Boolean(config.readOnly));
  fieldsWrap.innerHTML = (config.fields || []).map((field) => {
    const value = esc(field.value || "");
    const required = field.required ? "required" : "";
    if (field.type === "textarea") {
      return `<label>${esc(field.label)}<textarea name="${esc(field.name)}" placeholder="${esc(field.placeholder || "")}" ${required}>${value}</textarea></label>`;
    }
    if (field.type === "select") {
      return `<label>${esc(field.label)}<select name="${esc(field.name)}" ${required}>${(field.options || []).map((option) => `<option value="${esc(option)}" ${option === field.value ? "selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`;
    }
    return `<label>${esc(field.label)}<input name="${esc(field.name)}" value="${value}" placeholder="${esc(field.placeholder || "")}" ${required} /></label>`;
  }).join("");
  dialog.classList.remove("hidden");
  dialog.setAttribute("aria-hidden", "false");
  fieldsWrap.querySelector("input, select, textarea")?.focus();
}

function closeTaskDialog() {
  state.taskDialog = null;
  const dialog = $("#taskDialog");
  if (!dialog) return;
  dialog.classList.add("hidden");
  dialog.setAttribute("aria-hidden", "true");
  $("#taskDialogForm")?.classList.remove("hidden");
}

function openMasterModule(moduleId) {
  const config = MASTER_MODULES[moduleId];
  const dialog = $("#masterModuleDialog");
  if (!config || !dialog) return;
  $("#masterModulePill").textContent = config.pill;
  $("#masterModuleTitle").textContent = config.title;
  $("#masterModuleDesc").textContent = config.desc;
  document.querySelectorAll("[data-master-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.masterPanel !== moduleId);
  });
  dialog.classList.remove("hidden");
  dialog.setAttribute("aria-hidden", "false");
  dialog.querySelector(`[data-master-panel="${moduleId}"] input, [data-master-panel="${moduleId}"] button, [data-master-panel="${moduleId}"] select`)?.focus();
}

function closeMasterModule() {
  const dialog = $("#masterModuleDialog");
  if (!dialog) return;
  dialog.classList.add("hidden");
  dialog.setAttribute("aria-hidden", "true");
}

function openSettingsModule(moduleId) {
  if (moduleId === "erp-settings") {
    showPage("erpSettings");
    renderErpSettings();
    $("#erpSettingsForm input, #erpSettingsForm button, #erpSettingsForm select")?.focus();
    return;
  }
  const config = SETTINGS_MODULES[moduleId];
  const dialog = $("#settingsModuleDialog");
  if (!config || !dialog) return;
  $("#settingsModulePill").textContent = config.pill;
  $("#settingsModuleTitle").textContent = config.title;
  $("#settingsModuleDesc").textContent = config.desc;
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.settingsPanel !== moduleId);
  });
  dialog.classList.remove("hidden");
  dialog.setAttribute("aria-hidden", "false");
  dialog.querySelector(`[data-settings-panel="${moduleId}"] input, [data-settings-panel="${moduleId}"] button, [data-settings-panel="${moduleId}"] select`)?.focus();
}

function closeSettingsModule() {
  const dialog = $("#settingsModuleDialog");
  if (!dialog) return;
  dialog.classList.add("hidden");
  dialog.setAttribute("aria-hidden", "true");
}

async function submitTaskDialog(event) {
  event.preventDefault();
  const config = state.taskDialog;
  if (!config) return;
  const formData = new FormData(event.currentTarget);
  const values = Object.fromEntries(formData.entries());
  try {
    await config.onSubmit(values);
    closeTaskDialog();
  } catch (error) {
    showTaskError(error);
  }
}

function statusClass(status) {
  if (!status) return "";
  if (status.includes("异常") || status.includes("缺少")) return "status-danger";
  if (status.includes("待") || status.includes("更新") || status.includes("已有") || status.includes("重算")) return "status-warn";
  return "";
}

function sourceBadge(name) {
  const lower = (name || "").toLowerCase();
  if (lower.includes("erp")) return ["ERP", "badge-erp"];
  if (lower.includes("temu")) return ["TEMU", "badge-temu"];
  if (lower.includes("shein")) return ["S", "badge-shein"];
  return ["DATA", "badge-other"];
}

function latestName(group) {
  const batch = group.batch_files || [];
  if (batch.length) return batch.join("、");
  return (group.latest && group.latest.name) || "暂无";
}

function fileBaseName(filePath) {
  return String(filePath || "").split(/[\\/]/).pop();
}

function renderSourceProgress(group) {
  const progress = state.sourceProgress[group.key];
  if (progress) {
    return `<div class="source-progress source-progress-${progress.kind}">
      <strong>${progress.title}</strong>
      <span>${progress.message}</span>
      ${progress.detail ? `<small>${esc(progress.detail)}</small>` : ""}
    </div>`;
  }
  if (group.pending_count) {
    const pendingFiles = (group.pending_files || []).map(fileBaseName).join("、");
    return `<div class="source-progress source-progress-pending">
      <strong>待结束上传</strong>
      <span>已上传 ${group.pending_count} 个文件${pendingFiles ? `：${pendingFiles}` : ""}，点击“结束上传”后才会正式生效。</span>
    </div>`;
  }
  return `<div class="source-progress">
    <strong>当前批次${group.batch_id ? `：${group.batch_id}` : ""}</strong>
    <span>${group.uploaded_at ? `上传时间 ${group.uploaded_at}` : "未选择新文件。"}</span>
  </div>`;
}

function renderSourceRecompute(group) {
  const recompute = group.recompute || {};
  if (!recompute.report_names?.length) return "";
  const tone = recompute.needed ? "source-recompute-warn" : "source-recompute-ok";
  const staleNames = recompute.stale_report_names?.length ? recompute.stale_report_names : recompute.report_names;
  const latest = recompute.latest_generated_at ? `最近生成 ${recompute.latest_generated_at}` : "还没有生成记录";
  return `<div class="source-recompute ${tone}">
    <strong>${recompute.needed ? "最新数据源待重算报表" : "关联报表已同步"}</strong>
    <span>影响：${esc(staleNames.join("、"))}</span>
    <small>${esc(latest)}。${esc(recompute.message || "")}</small>
  </div>`;
}

function renderSources(groups) {
  const rows = $("#sourceRows");
  rows.innerHTML = "";
  const pendingGroups = groups.filter((item) => item.pending_count);
  const recomputeGroups = groups.filter((item) => item.recompute?.needed);
  $("#statusSummary").textContent = `共 ${groups.length} 个数据源，${pendingGroups.length} 个有待提交文件，${recomputeGroups.length} 个需要重算报表`;
  $("#syncHint").textContent = pendingGroups.length
    ? "有数据源等待结束上传，结束上传后才会正式生效。"
    : recomputeGroups.length
      ? "发现最新数据源已生效但关联报表尚未重算，请按数据源重算；报表生成后会同步商品任务。经营报表仍默认使用店长填报销量。"
      : "所有已启用的数据源和关联任务均已检查完成";
  renderImportHealth(groups);
  groups.forEach((group) => {
    const [badgeText, badgeClass] = sourceBadge(group.name);
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div class="table-cell source-name"><span class="source-badge ${badgeClass}">${badgeText}</span><span>${group.name}<small class="source-retention">${esc(group.retention_label || "日日留存")}</small></span></div>
      <div class="table-cell"><div class="file-name" title="${latestName(group)}">${latestName(group)}</div><div class="file-meta">${group.latest?.modified || "等待上传"}${group.batch_id ? ` · 批次 ${group.batch_id}` : ""}</div>${renderSourceProgress(group)}${renderSourceRecompute(group)}</div>
      <div class="table-cell pending">${group.pending_count || 0}</div>
      <div class="table-cell rows-count">${group.total_rows || group.latest?.rows || "-"}</div>
      <div class="table-cell"><span class="status-pill ${statusClass(group.status)}">${group.status}</span><div class="file-meta">${group.latest?.modified ? `更新于 ${group.latest.modified.slice(5, 16)}` : ""}</div></div>
      <div class="table-cell row-actions">
        <button class="tool-button" data-action="select">选择文件</button>
        <button class="tool-button" data-action="upload">上传</button>
        <button class="tool-button" data-action="finish">结束上传</button>
        ${group.recompute?.needed ? '<button class="tool-button primary-mini" data-action="recompute">重算关联报表</button>' : ""}
      </div>
    `;
    row.querySelector('[data-action="select"]').addEventListener("click", () => selectFiles(group));
    row.querySelector('[data-action="upload"]').addEventListener("click", () => uploadSource(group));
    row.querySelector('[data-action="finish"]').addEventListener("click", () => finishUpload(group));
    row.querySelector('[data-action="recompute"]')?.addEventListener("click", () => recomputeSource(group));
    rows.appendChild(row);
  });
}

function importCellClass(state) {
  if (state === "ready") return "ok";
  if (state === "pending") return "warn";
  return "danger";
}

function setImportFocus(focus = "blocked", options = {}) {
  const allowed = ["blocked", "pending", "all"];
  state.importFocus = allowed.includes(focus) ? focus : "blocked";
  renderImportMatrix();
  renderImportHealth(state.status?.source_groups || []);
  if (options.scroll) {
    setTimeout(() => document.querySelector("#importMatrixRows")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
}

function importFocusRows(rows) {
  if (state.importFocus === "pending") {
    return rows.filter((row) => (row.cells || []).some((cell) => cell.state === "pending"));
  }
  if (state.importFocus === "all") return rows;
  return rows.filter((row) => !row.ready);
}

function renderImportHealth(groups = []) {
  const summary = state.importMatrix?.summary || {};
  const pendingSources = groups.reduce((sum, group) => sum + Number(group.pending_count || 0), 0);
  const blockedStores = Number(summary.blocked_stores || 0);
  const pendingCells = Number(summary.pending_cells || 0);
  const missingCells = Number(summary.missing_cells || 0);
  const title = $("#importHealthTitle");
  const hint = $("#importHealthHint");
  const metrics = $("#importHealthMetrics");
  if (title) {
    title.textContent = blockedStores || pendingSources ? "本周导入还需处理" : "本周导入已就绪";
  }
  if (hint) {
    const operator = currentOperator();
    hint.textContent = operator.role === "owner"
      ? "这里只显示你负责店铺的缺口；待提交文件需要点“结束上传”才会正式生效。"
      : "管理员可按缺口、待提交和全部店铺切换，缺哪个店铺和数据类型会集中显示。";
  }
  if (metrics) {
    metrics.innerHTML = [
      ["需处理店铺", blockedStores, `${summary.ready_stores || 0}/${summary.stores || 0} 已完整`, blockedStores ? "warn" : "ok"],
      ["缺失项", missingCells, "缺文件或缺数据类型", missingCells ? "danger" : "ok"],
      ["矩阵待提交", pendingCells, "上传后未结束批次", pendingCells ? "warn" : "ok"],
      ["文件待提交", pendingSources, "数据源上传缓存", pendingSources ? "warn" : "ok"],
    ].map(([label, value, note, tone]) => `
      <div class="import-health-metric ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </div>
    `).join("");
  }
  document.querySelectorAll(".import-health-tabs [data-import-focus]").forEach((button) => {
    button.classList.toggle("active", button.dataset.importFocus === state.importFocus);
  });
}

function renderImportMatrix() {
  const matrix = state.importMatrix || {};
  const summary = matrix.summary || {};
  const rows = matrix.rows || [];
  const visibleRows = importFocusRows(rows);
  renderImportHealth(state.status?.source_groups || []);
  const summaryLine = $("#importMatrixSummary");
  if (summaryLine) {
    const focusLabel = state.importFocus === "pending" ? "待提交" : state.importFocus === "all" ? "全部" : "需处理";
    summaryLine.textContent = `覆盖 ${summary.stores || 0} 个店铺，完整 ${summary.ready_stores || 0} 个，受缺失/待提交影响 ${summary.blocked_stores || 0} 个；当前显示 ${focusLabel} ${visibleRows.length} 个`;
  }
  const container = $("#importMatrixRows");
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<div class="import-empty">${actionEmpty({
      title: "还没有可检查的店铺",
      body: "缺失矩阵依赖平台、店铺、负责人配置。先把店铺资料补齐，再回来看每周导入是否缺项。",
      primary: "去维护店铺",
      page: "masterdata",
    })}</div>`;
    bindEmptyActions(container);
    return;
  }
  if (!visibleRows.length) {
    container.innerHTML = `<div class="import-empty">${actionEmpty({
      title: state.importFocus === "pending" ? "当前没有待提交数据源" : "当前没有导入缺口",
      body: state.importFocus === "pending" ? "已上传的文件都完成了结束上传。切到“全部”可以复核每个店铺的数据状态。" : "本周导入矩阵已完整。切到“全部”可以复核所有平台店铺。",
      primary: "查看全部",
      page: "imports",
      attrs: 'data-import-focus="all"',
    })}</div>`;
    bindEmptyActions(container);
    return;
  }
  container.innerHTML = visibleRows.map((row) => {
    const chips = (row.cells || []).map((cell) => {
      const label = cell.state === "ready" ? "已就绪" : cell.state === "pending" ? "待提交" : "缺失";
      const meta = cell.batch_id ? ` · ${cell.batch_id}` : "";
      return `<span class="import-chip ${importCellClass(cell.state)}" title="${cell.status || ""}${meta}">${cell.name}：${label}</span>`;
    }).join("");
    const missing = (row.missing_types || []).length ? row.missing_types.join("、") : "无";
    return `
      <div>${row.platform}</div>
      <div>${row.store}</div>
      <div>${row.owner || "-"}</div>
      <div>${missing}<div class="import-chip-line">${chips}</div></div>
      <div><span class="status-pill ${row.ready ? "status-ok" : "status-warn"}">${row.ready ? "可生成" : "需补齐"}</span></div>
    `;
  }).join("");
}

function renderReportQueue() {
  const queue = $("#reportQueue");
  if (!queue) return;
  const reports = Object.entries(state.reports);
  queue.innerHTML = "";
  const completed = reports.filter(([reportId]) => latestOutputForReport(reportId)).length;
  const pending = reports.length - completed;
  if ($("#reportCount")) $("#reportCount").textContent = `共 ${reports.length} 个报表`;
  const completionSummary = $("#completionSummary");
  if (completionSummary) {
    completionSummary.innerHTML = `<span class="done">已完成 ${completed}</span><span class="todo">未完成 ${pending}</span>`;
  }
  reports.forEach(([reportId, report], index) => {
    const latest = latestOutputForReport(reportId);
    const hasOutput = Boolean(latest);
    const taskSync = state.reportTaskSync[reportId];
    const taskLine = taskSync ? taskSyncSummary(taskSync) : reportTaskSummary(reportId);
    const taskBadges = reportTaskBadges(reportId);
    const item = document.createElement("div");
    item.className = `queue-item ${hasOutput ? "queue-item-done" : "queue-item-todo"}`;
    item.innerHTML = `
      <div>${index + 1}</div>
      <div class="queue-icon">${hasOutput ? "✓" : "!"}</div>
      <div><div class="queue-title">${report.name}</div><div class="queue-subtitle">${hasOutput ? latest.modified : "等待生成"}</div>${taskBadges}<div class="queue-task-sync">${taskLine}</div></div>
      <div class="queue-status">${hasOutput ? "已完成" : "未完成"}</div>
      <div>›</div>
    `;
    item.addEventListener("click", () => generateReport(reportId));
    queue.appendChild(item);
  });
}

function latestOutputForReport(reportId) {
  return state.outputs.find((item) => item.report === reportId) || null;
}

function renderReportReadiness() {
  const bar = $("#reportReadinessBar");
  if (!bar) return;
  const ownerMode = currentOperator().role === "owner";
  const salesSummary = state.sales?.summary || {};
  const importSummary = state.importMatrix?.summary || {};
  const taskSummary = state.taskOverview || state.taskSummary || {};
  const status = taskSummary.by_status || {};
  const reports = Object.keys(state.reports || {});
  const completed = reports.filter((reportId) => latestOutputForReport(reportId)).length;
  const salesMissing = Number(salesSummary.missing || 0);
  const importBlocked = Number(importSummary.blocked_stores || 0);
  const ownerPending = Number(status["待店长处理"] || 0);
  const adminPending = Number(status["待管理员审核"] || 0) + Number(status["已通过"] || 0);
  const pendingReports = Math.max(0, reports.length - completed);
  const issueCount = [salesMissing, importBlocked, ownerPending, adminPending].filter((value) => value > 0).length;
  const title = $("#reportReadinessTitle");
  const hint = $("#reportReadinessHint");
  const metrics = $("#reportReadinessMetrics");
  const actions = $("#reportReadinessActions");
  if (title) title.textContent = issueCount ? "报表生成前还有风险项" : "报表生成口径已就绪";
  if (hint) {
    hint.textContent = issueCount
      ? "建议先处理未填销量、导入缺口和任务待办，再生成月结输出。"
      : "销量、导入和任务队列已检查，可以生成或复核报表输出。";
  }
  if (metrics) {
    metrics.innerHTML = [
      ["未填销量", salesMissing, `${salesSummary.submitted || 0}/${salesSummary.required || 0} 已填`, salesMissing ? "warn" : "ok"],
      ["导入缺口", importBlocked, `${importSummary.ready_stores || 0}/${importSummary.stores || 0} 店铺完整`, importBlocked ? "warn" : "ok"],
      ["店长待办", ownerPending, "任务包待处理", ownerPending ? "warn" : "ok"],
      ["管理员待办", adminPending, "待确认/待归档", adminPending ? "warn" : "ok"],
      ["待生成报表", pendingReports, `${completed}/${reports.length} 已生成`, pendingReports ? "warn" : "ok"],
    ].map(([label, value, note, tone]) => `
      <div class="report-ready-metric ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </div>
    `).join("");
  }
  if (actions) {
    actions.innerHTML = `
      <button class="tool-button" data-empty-page="sales" data-sales-focus="missing" type="button">查销量</button>
      <button class="tool-button" data-empty-page="imports" data-focus="import-matrix" data-import-focus="blocked" type="button">查导入</button>
      <button class="tool-button" data-empty-page="tasks" data-task-open-only="true" type="button">查任务</button>
      ${ownerMode ? "" : '<button class="tool-button primary-mini" data-admin-only="report-generate" data-report-action="generate-weekly" type="button">生成就绪报表</button>'}
    `;
    bindEmptyActions(actions);
    actions.querySelector('[data-report-action="generate-weekly"]')?.addEventListener("click", generateWeeklyReports);
  }
}

function renderReportCards() {
  const wrap = $("#reportCards");
  wrap.innerHTML = "";
  renderReportReadiness();
  const ownerMode = currentOperator().role === "owner";
  Object.entries(state.reports).forEach(([reportId, report]) => {
    const latest = latestOutputForReport(reportId);
    const card = document.createElement("div");
    card.className = "report-card";
    card.innerHTML = `
      <h3>${report.name}</h3>
      <p>${report.description || ""}</p>
      <div class="report-latest">${latest ? `最近生成：${latest.name}<br>${latest.modified} · ${formatSize(latest.size)}` : "暂无已生成表格"}<br>${reportTaskSummary(reportId)}</div>
      <div class="download-actions">
        ${ownerMode ? "" : '<button class="primary-button" data-action="generate">生成表格</button>'}
        ${latest ? `<button class="ghost-button download-report" data-action="open">打开表格</button><button class="ghost-button" data-action="folder">打开所在文件夹</button>` : ""}
      </div>
    `;
    card.querySelector('[data-action="generate"]')?.addEventListener("click", () => generateReport(reportId));
    const openButton = card.querySelector('[data-action="open"]');
    const folderButton = card.querySelector('[data-action="folder"]');
    if (openButton && latest) openButton.addEventListener("click", () => api.openOutput(latest.name, operatorPayload()));
    if (folderButton && latest) folderButton.addEventListener("click", () => api.revealOutput(latest.name, operatorPayload()));
    wrap.appendChild(card);
  });
}

function renderOutputs() {
  const wrap = $("#outputRows");
  wrap.innerHTML = "";
  renderReportReadiness();
  state.outputs.forEach((item) => {
    const row = document.createElement("div");
    row.className = "output-row";
    row.innerHTML = `<div><strong>${item.name}</strong><p>${item.modified} · ${formatSize(item.size)}</p></div><button class="ghost-button">打开</button><button class="ghost-button">所在文件夹</button>`;
    row.children[1].addEventListener("click", () => api.openOutput(item.name, operatorPayload()));
    row.children[2].addEventListener("click", () => api.revealOutput(item.name, operatorPayload()));
    wrap.appendChild(row);
  });
}

function taskFilters() {
  return {
    role: $("#taskRole")?.value || "admin",
    user: $("#taskUser")?.value.trim() || "",
    status: $("#taskStatus")?.value || "",
    task_type: $("#taskType")?.value || "",
    store: $("#taskStore")?.value.trim() || "",
    platform: $("#taskPlatform")?.value || "",
    next_handler: $("#taskNextHandler")?.value || "",
    priority: $("#taskPriority")?.value || "",
    open_only: $("#taskOpenOnly")?.checked ? "1" : "",
    overdue: $("#taskOverdue")?.checked ? "1" : "",
    unassigned: $("#taskUnassigned")?.checked ? "1" : "",
    reworked: $("#taskReworked")?.checked ? "1" : "",
    search: $("#taskSearch")?.value.trim() || "",
  };
}

function taskOverviewFilters() {
  const operator = currentOperator();
  return {
    role: operator.role || "admin",
    user: operator.user || "",
  };
}

function renderTaskSummary() {
  const wrap = $("#taskSummary");
  if (!wrap) return;
  const summary = state.taskOverview || state.taskSummary || {};
  const status = summary.by_status || {};
  const overdue = summary.overdue || {};
  const nextHandler = summary.by_next_handler || {};
  const cards = [
    ["全部任务", summary.total || 0],
    ["管理员待办", nextHandler["管理员"] || 0],
    ["店长待办", nextHandler["店长"] || 0],
    ["待店长处理", status["待店长处理"] || 0],
    ["待管理员确认", status["待管理员审核"] || 0],
    ["超时未处理", overdue.total || 0],
    ["已确认", status["已通过"] || 0],
    ["未分配", summary.unassigned || 0],
    ["无需处理", nextHandler["无需处理"] || 0],
  ];
  wrap.innerHTML = cards.map(([label, value]) => `<div class="task-kpi"><span>${label}</span><strong>${value}</strong></div>`).join("");
  renderAdminTaskQueue();
  renderOwnerTaskSummary();
  renderOperatorOwnerOptions();
}

function renderAdminTaskQueue() {
  const wrap = $("#adminTaskQueue");
  if (!wrap) return;
  const rows = state.taskOverview?.admin_queue || state.taskSummary?.admin_queue || [];
  if (!rows.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = rows.map((item, index) => `<button class="task-kpi" type="button" data-queue-index="${index}"><span>管理员待办队列</span><strong>${item.count || 0}</strong><p>${adminActionLabel(item.action)}<br>优先级：${item.priority || ""}</p></button>`).join("");
  wrap.querySelectorAll("[data-queue-index]").forEach((button) => {
    button.addEventListener("click", () => applyAdminQueueFilter(Number(button.dataset.queueIndex)));
  });
}

function setTaskField(id, value) {
  const field = $(`#${id}`);
  if (field) field.value = value || "";
}

function setTaskCheck(id, value) {
  const field = $(`#${id}`);
  if (field) field.checked = Boolean(value);
}

function resetTaskPage() {
  state.taskOffset = 0;
}

function loadTasksFromFirstPage(showToastOnDone = true) {
  resetTaskPage();
  return loadTasks(showToastOnDone);
}

function applyAdminQueueFilter(index) {
  const item = (state.taskOverview?.admin_queue || state.taskSummary?.admin_queue || [])[index];
  if (!item) return;
  const filters = item.filters || {};
  setTaskField("taskRole", "admin");
  setTaskField("taskUser", "");
  setTaskField("taskStatus", filters.status || "");
  setTaskField("taskNextHandler", "");
  setTaskField("taskPriority", "");
  setTaskField("taskPlatform", "");
  setTaskField("taskType", "");
  setTaskField("taskStore", "");
  setTaskCheck("taskOpenOnly", filters.open_only === "1");
  setTaskCheck("taskOverdue", filters.overdue === "1");
  setTaskCheck("taskUnassigned", filters.unassigned === "1");
  setTaskCheck("taskReworked", filters.reworked === "1");
  loadTasksFromFirstPage();
}

function renderOwnerTaskSummary() {
  const wrap = $("#ownerTaskSummary");
  if (!wrap) return;
  const ownerStatus = state.taskOverview?.owner_status || state.taskSummary?.owner_status || {};
  const rows = Object.values(ownerStatus).sort((a, b) => (b.total || 0) - (a.total || 0));
  if (!rows.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = rows.map((item, index) => {
    const status = item.by_status || {};
    return `<button class="task-kpi" type="button" data-owner-index="${index}"><span>负责人待办：${item.owner || ""}</span><strong>${item.total || 0}</strong><p>待店长 ${status["待店长处理"] || 0} / 待确认 ${status["待管理员审核"] || 0} / 超时 ${item.overdue || 0} / 返工 ${item.reworked || 0} / 已完成 ${status["已完成"] || 0}</p></button>`;
  }).join("");
  wrap.querySelectorAll("[data-owner-index]").forEach((button) => {
    button.addEventListener("click", () => applyOwnerSummaryFilter(Number(button.dataset.ownerIndex)));
  });
}

function applyOwnerSummaryFilter(index) {
  const ownerStatus = state.taskOverview?.owner_status || state.taskSummary?.owner_status || {};
  const rows = Object.values(ownerStatus).sort((a, b) => (b.total || 0) - (a.total || 0));
  const item = rows[index];
  if (!item) return;
  setTaskField("taskRole", "admin");
  setTaskField("taskUser", item.owner === "未分配" ? "" : item.owner || "");
  setTaskField("taskStatus", "");
  setTaskField("taskNextHandler", "");
  setTaskField("taskPriority", "");
  setTaskField("taskPlatform", "");
  setTaskField("taskType", "");
  setTaskField("taskStore", "");
  setTaskCheck("taskOpenOnly", true);
  setTaskCheck("taskOverdue", false);
  setTaskCheck("taskUnassigned", item.owner === "未分配");
  setTaskCheck("taskReworked", false);
  loadTasksFromFirstPage();
}

function setTaskQuickFilters({ status = "", nextHandler = "", openOnly = true, unassigned = false, reworked = false } = {}) {
  const operator = currentOperator();
  setTaskField("taskRole", operator.role || "admin");
  setTaskField("taskUser", operator.role === "owner" ? operator.user || "" : "");
  setTaskField("taskStatus", status);
  setTaskField("taskNextHandler", nextHandler);
  setTaskField("taskPriority", "");
  setTaskField("taskPlatform", "");
  setTaskField("taskType", "");
  setTaskField("taskStore", "");
  setTaskField("taskSearch", "");
  setTaskCheck("taskOpenOnly", openOnly);
  setTaskCheck("taskOverdue", false);
  setTaskCheck("taskUnassigned", unassigned);
  setTaskCheck("taskReworked", reworked);
  loadTasksFromFirstPage();
}

function canCurrentRoleHandleTask(task) {
  const operator = currentOperator();
  if (operator.role === "owner") return canSubmitOwnerTask(task);
  return Boolean(
    packageActionIds({ pushable_task_ids: task.status === "待推送" && task.owner ? [task.id] : [] }, "push").length
    || canReviewTask(task)
    || canMarkDoneTask(task)
    || (!task.owner && canAssignTask(task))
  );
}

function selectActionableTasks() {
  const ids = state.tasks.filter(canCurrentRoleHandleTask).map((task) => task.id).filter(Boolean);
  document.querySelectorAll(".task-check").forEach((input) => {
    input.checked = ids.includes(input.value);
  });
  renderTaskWorkbar();
  showToast(ids.length ? `已选择 ${ids.length} 条当前可处理任务` : "当前筛选没有可直接处理的任务");
}

function renderTaskWorkbar() {
  const bar = $("#taskWorkbar");
  if (!bar) return;
  const operator = currentOperator();
  const ownerMode = operator.role === "owner";
  const overview = state.taskOverview || state.taskSummary || {};
  const filtered = state.taskSummary || {};
  const status = overview.by_status || {};
  const nextHandler = overview.by_next_handler || {};
  const filteredStatus = filtered.by_status || {};
  const packages = state.taskPackages || [];
  const selected = selectedTaskIds().length;
  const actionable = state.tasks.filter(canCurrentRoleHandleTask).length;
  const adminQueue = (overview.admin_queue || [])[0] || null;
  const title = $("#taskWorkTitle");
  const hint = $("#taskWorkHint");
  const metrics = $("#taskWorkMetrics");
  const actions = $("#taskWorkActions");
  if (title) {
    title.textContent = ownerMode
      ? (status["待店长处理"] || 0 ? "店长待整包处理" : "店长暂无待处理任务")
      : (adminQueue ? `管理员下一步：${adminActionLabel(adminQueue.action)}` : "管理员暂无待办队列");
  }
  if (hint) {
    hint.textContent = ownerMode
      ? "优先处理“待店长处理”的任务包；提交后等待管理员确认，完成后从待办消失。"
      : "管理员按队列先推送、再确认、最后归档；任务多时可下载任务表给店长。";
  }
  if (metrics) {
    metrics.innerHTML = [
      ["当前筛选", state.taskTotal || state.tasks.length, `本页 ${state.tasks.length} / 任务包 ${packages.length}`],
      ["本页可处理", actionable, ownerMode ? "可整包提交" : "可推送/确认/归档/屏蔽"],
      ["已勾选", selected, "用于批量动作"],
      ["全局待办", ownerMode ? status["待店长处理"] || 0 : nextHandler["管理员"] || 0, ownerMode ? "我的口径" : "管理员口径"],
    ].map(([label, value, note]) => `
      <div class="task-work-metric">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </div>
    `).join("");
  }
  if (actions) {
    const quickActions = ownerMode ? [
      ["我的待处理", "待店长处理", "", true, false, false],
      ["返工任务", "已驳回", "", true, false, true],
      ["全部未完成", "", "", true, false, false],
    ] : [
      ["待推送", "待推送", "", true, false, false],
      ["待确认", "待管理员审核", "", true, false, false],
      ["待归档", "已通过", "", true, false, false],
      ["未分配", "", "", true, true, false],
    ];
    actions.innerHTML = `
      <button class="tool-button primary-mini" data-task-work-action="select-actionable" type="button">选择可处理</button>
      ${ownerMode ? "" : '<button class="tool-button primary-mini" data-task-work-action="push-selected" type="button">推送所选</button><button class="tool-button" data-task-work-action="confirm-selected" type="button">确认所选</button><button class="tool-button" data-task-work-action="suppress-selected" type="button">屏蔽所选</button>'}
      ${quickActions.map(([label, quickStatus, next, openOnly, unassigned, reworked]) => `
        <button class="tool-button" data-task-work-action="filter" data-status="${quickStatus}" data-next="${next}" data-open-only="${openOnly ? "1" : ""}" data-unassigned="${unassigned ? "1" : ""}" data-reworked="${reworked ? "1" : ""}" type="button">${label}</button>
      `).join("")}
    `;
    actions.querySelector('[data-task-work-action="select-actionable"]')?.addEventListener("click", selectActionableTasks);
    actions.querySelector('[data-task-work-action="push-selected"]')?.addEventListener("click", () => pushTasks());
    actions.querySelector('[data-task-work-action="confirm-selected"]')?.addEventListener("click", () => confirmTasks());
    actions.querySelector('[data-task-work-action="suppress-selected"]')?.addEventListener("click", () => suppressTasks());
    actions.querySelectorAll('[data-task-work-action="filter"]').forEach((button) => {
      button.addEventListener("click", () => setTaskQuickFilters({
        status: button.dataset.status || "",
        nextHandler: button.dataset.next || "",
        openOnly: button.dataset.openOnly === "1",
        unassigned: button.dataset.unassigned === "1",
        reworked: button.dataset.reworked === "1",
      }));
    });
  }
}

function taskBadge(status) {
  if (status === "待管理员审核") return "status-warn";
  if (status === "已通过" || status === "已完成") return "status-ok";
  if (status === "已驳回") return "status-danger";
  return "";
}

function taskStatusLabel(status) {
  const labels = {
    "待管理员审核": "待管理员确认",
    "已通过": "已确认",
    "已驳回": "已返工",
  };
  return labels[status] || status || "";
}

function adminActionLabel(action) {
  return String(action || "")
    .replaceAll("审核通过或驳回", "确认店长处理")
    .replaceAll("待管理员审核", "待管理员确认")
    .replaceAll("处理超时审核", "处理超时确认")
    .replaceAll("驳回", "返工");
}

function taskSourceText(task) {
  const source = [task.source_report, task.source_file].filter(Boolean).join(" / ");
  const row = task.source_row ? ` #${task.source_row}` : "";
  return `来源：${source || "-"}${row}`;
}

function packageStatusBadges(pkg) {
  const status = pkg.by_status || {};
  const pairs = [
    ["待推送", status["待推送"] || 0, "status-warn"],
    ["待店长", status["待店长处理"] || 0, ""],
    ["待确认", status["待管理员审核"] || 0, "status-warn"],
    ["已返工", status["已驳回"] || 0, "status-danger"],
    ["已确认", status["已通过"] || 0, "status-ok"],
    ["已完成", status["已完成"] || 0, "status-ok"],
  ].filter(([, count]) => Number(count || 0));
  return pairs.map(([label, count, tone]) => `<span class="status-pill ${tone}">${label} ${count}</span>`).join("");
}

function packageProgressText(pkg) {
  return [
    `待推送 ${pkg.pending_push_count || 0}`,
    `待店长 ${pkg.pending_owner_count || 0}`,
    `待确认 ${pkg.pending_review_count || 0}`,
    `已确认 ${pkg.approved_count || 0}`,
    `已完成 ${pkg.done_count || 0}`,
  ].join(" / ");
}

function packageActionIds(pkg, action) {
  if (action === "submit") return pkg.submittable_task_ids || [];
  if (action === "push") return pkg.pushable_task_ids || [];
  if (action === "confirm") return pkg.reviewable_task_ids || [];
  if (action === "done") return pkg.done_task_ids || [];
  if (action === "suppress") return pkg.task_ids || [];
  return [];
}

function packageActionButtons(pkg) {
  const operator = currentOperator();
  const buttons = [];
  buttons.push(`<button class="tool-button" data-package-action="select" data-id="${pkg.id}">选中本包</button>`);
  if (operator.role === "owner" && packageActionIds(pkg, "submit").length) {
    buttons.push(`<button class="tool-button primary-mini" data-package-action="submit" data-id="${pkg.id}">整包已处理</button>`);
  }
  if (operator.role !== "owner") {
    if (packageActionIds(pkg, "push").length) buttons.push(`<button class="tool-button primary-mini" data-package-action="push" data-id="${pkg.id}">推送店长</button>`);
    if (packageActionIds(pkg, "confirm").length) buttons.push(`<button class="tool-button primary-mini" data-package-action="confirm" data-id="${pkg.id}">确认完成</button>`);
    if (packageActionIds(pkg, "done").length) buttons.push(`<button class="tool-button" data-package-action="done" data-id="${pkg.id}">归档完成</button>`);
    if ((pkg.task_ids || []).length) buttons.push(`<button class="tool-button" data-package-action="suppress" data-id="${pkg.id}">屏蔽整包</button>`);
  }
  buttons.push(`<button class="tool-button" data-package-action="filter" data-id="${pkg.id}">看明细</button>`);
  return buttons.join("");
}

function taskPackageById(id) {
  return (state.taskPackages || []).find((item) => item.id === id);
}

function applyPackageFilter(pkg) {
  if (!pkg) return;
  setTaskField("taskPlatform", pkg.platform || "");
  setTaskField("taskStore", pkg.store || "");
  setTaskField("taskType", pkg.task_type || "");
  setTaskField("taskStatus", "");
  setTaskField("taskSearch", pkg.system_action || "");
  document.querySelector(".task-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
  loadTasksFromFirstPage(false);
  showToast("已按任务包定位明细");
}

function selectPackageTasks(pkg, action = "all") {
  if (!pkg) return;
  const ids = action === "all" ? (pkg.task_ids || []) : packageActionIds(pkg, action);
  const visible = new Set(ids);
  let checked = 0;
  document.querySelectorAll(".task-check").forEach((input) => {
    input.checked = visible.has(input.value);
    if (input.checked) checked += 1;
  });
  renderTaskWorkbar();
  showToast(checked ? `已选中本页 ${checked} 条本包任务` : "本包明细不在当前页，正在按本包筛选");
  if (!checked) {
    state.pendingTaskPackageSelection = { packageId: pkg.id, action };
    applyPackageFilter(pkg);
  }
}

function applyPendingPackageSelection() {
  const pending = state.pendingTaskPackageSelection;
  if (!pending) return;
  state.pendingTaskPackageSelection = null;
  const pkg = taskPackageById(pending.packageId);
  if (pkg) selectPackageTasks(pkg, pending.action || "all");
}

function renderTaskPackages() {
  const wrap = $("#taskPackageRows");
  if (!wrap) return;
  const packages = state.taskPackages || [];
  if (!packages.length) {
    wrap.innerHTML = actionEmpty({
      title: "暂无任务包",
      body: "当前筛选没有形成可整包处理的任务。可调整筛选条件或先生成本周报表。",
      primary: "去数据导入",
      page: "imports",
    });
    bindEmptyActions(wrap);
    return;
  }
  const shown = packages.slice(0, 60);
  wrap.innerHTML = `
    <div class="task-package-head">
      <strong>任务包优先处理区</strong>
      <span>当前 ${packages.length} 个任务包，先显示前 ${shown.length} 个；下面明细表用于下钻核对。</span>
    </div>
    ${shown.map((pkg) => `
      <div class="task-package-card">
        <div class="task-package-title">
          <strong>${esc(pkg.platform || "-")} · ${esc(pkg.store || "-")} · ${esc(pkg.task_type || "-")}</strong>
          <span class="status-pill ${pkg.priority === "高" ? "status-danger" : pkg.priority === "中" ? "status-warn" : "status-ok"}">${esc(pkg.priority || "低")}</span>
        </div>
        <p>${esc(pkg.system_action || "-")}</p>
        <div class="task-package-meta">
          <span>负责人：${esc(pkg.owner || "-")}</span>
          <span>明细：${pkg.total || 0}</span>
          <span>${esc(packageProgressText(pkg))}</span>
        </div>
        <div class="task-package-badges">${packageStatusBadges(pkg)}</div>
        <div class="task-actions">${packageActionButtons(pkg)}</div>
      </div>
    `).join("")}
  `;
  wrap.querySelectorAll("[data-package-action]").forEach((button) => {
    button.addEventListener("click", () => handlePackageAction(button.dataset.id, button.dataset.packageAction));
  });
}

function canSubmitOwnerTask(task) {
  return task.owner && (task.status === "待店长处理" || task.status === "已驳回");
}

function canReviewTask(task) {
  return task.status === "待管理员审核";
}

function canMarkDoneTask(task) {
  return task.status === "已通过";
}

function canAssignTask(task) {
  return task.status !== "已完成";
}

function taskActionButtons(task) {
  const operator = currentOperator();
  const actionIds = (task.task_ids || [task.id]).filter(Boolean);
  const dataIds = esc(actionIds.join(","));
  const historyButton = `<button class="tool-button" data-action="history" data-id="${task.id}" data-ids="${dataIds}" title="查看操作记录">记录</button>`;
  const submitButton = !task.owner ? '<span class="file-meta">待指派</span>' : canSubmitOwnerTask(task) ? `<button class="tool-button" data-action="submit" data-id="${task.id}" data-ids="${dataIds}" title="店长填写处理结果">填写</button>` : '<span class="file-meta">-</span>';
  if (operator.role === "owner") {
    return `${historyButton}${submitButton}`;
  }
  const reviewButtons = canReviewTask(task) ? `<button class="tool-button primary-mini" data-action="confirm" data-id="${task.id}" data-ids="${dataIds}" title="确认店长已处理并完成">确认</button>` : "";
  const suppressButton = task.status !== "已完成" ? `<button class="tool-button" data-action="suppress" data-id="${task.id}" data-ids="${dataIds}" title="加入屏蔽清单，不再重复提示">屏蔽</button>` : "";
  const doneButton = canMarkDoneTask(task) ? `<button class="tool-button" data-action="done" data-id="${task.id}" data-ids="${dataIds}" title="标记完成">完成</button>` : "";
  const assignButton = canAssignTask(task) ? `<button class="tool-button" data-action="assign" data-id="${task.id}" data-ids="${dataIds}" title="指派负责人">指派</button>` : "";
  return `${historyButton}${assignButton}${reviewButtons}${doneButton}${suppressButton}`;
}

function selectedTaskIds() {
  const ids = [];
  const seen = new Set();
  Array.from(document.querySelectorAll(".task-check:checked")).forEach((input) => {
    String(input.dataset.ids || input.value || "").split(",").map((item) => item.trim()).filter(Boolean).forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    });
  });
  return ids;
}

function actionButtonIds(button) {
  return String(button?.dataset?.ids || button?.dataset?.id || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleAllTaskSelection(checked) {
  document.querySelectorAll(".task-check").forEach((input) => { input.checked = checked; });
  renderTaskWorkbar();
}

function renderTaskCenter() {
  renderTaskSummary();
  renderTaskPackages();
  renderTaskWorkbar();
  renderTaskPagebar();
  const rows = $("#taskRows");
  if (!rows) return;
  const selectAll = $("#taskSelectAll");
  if (selectAll) selectAll.checked = false;
  if (!state.tasks.length) {
    rows.innerHTML = actionEmpty({
      title: "当前没有商品任务",
      body: "任务来自每周报表和数据体检。先确认数据源已经上传，再生成报表，系统会自动写入任务包。",
      primary: "去数据导入",
      page: "imports",
      secondary: "如果你是店长，也可能是当前姓名没有负责的待办。",
    });
    bindEmptyActions(rows);
    return;
  }
  rows.innerHTML = state.tasks.map((task) => `
    <div class="task-row">
      <div><input class="task-check" type="checkbox" value="${task.id || ""}" data-ids="${esc(((task.task_ids || [task.id]).filter(Boolean)).join(","))}" /></div>
      <div><span class="status-pill ${taskBadge(task.status)}">${taskStatusLabel(task.status)}</span></div>
      <div><span class="status-pill ${task.priority === "高" ? "status-danger" : task.priority === "中" ? "status-warn" : task.priority === "低" ? "status-ok" : ""}">${task.priority || "低"}</span></div>
      <div class="task-copy">${task.platform || ""}</div>
      <div class="task-copy">${task.store || ""}</div>
      <div class="task-copy">${task.owner || ""}</div>
      <div class="task-copy">${task.task_type || ""}</div>
      <div class="task-text" title="${task.product_name || ""}">${task.product_name || ""}</div>
      <div class="task-copy">${task.merchant_code || ""}</div>
      <div class="task-copy">${task.skc || ""}</div>
      <div class="task-copy">${task.spu || ""}</div>
      <div class="task-text" title="${task.system_action || ""}">${task.system_action || ""}</div>
      <div class="task-text" title="${task.task_detail || ""}">${task.task_detail || ""}</div>
      <div class="task-text" title="${taskSourceText(task)}">${taskSourceText(task)}</div>
      <div title="${[task.owner_action || "-", task.owner_remark || "", task.owner_proof ? `凭证：${task.owner_proof}` : ""].filter(Boolean).join(" / ")}">${task.owner_action || "-"}</div>
      <div title="${[task.admin_decision || "-", task.admin_remark || ""].filter(Boolean).join(" / ")}">${task.admin_decision || "-"}</div>
      <div class="task-actions">${taskActionButtons(task)}</div>
    </div>`).join("");
  if (selectAll) selectAll.onchange = () => toggleAllTaskSelection(selectAll.checked);
  rows.querySelectorAll(".task-check").forEach((input) => {
    input.addEventListener("change", renderTaskWorkbar);
  });
  rows.querySelectorAll('[data-action="history"]').forEach((button) => button.addEventListener("click", () => showTaskHistory(button.dataset.id)));
  rows.querySelectorAll('[data-action="assign"]').forEach((button) => button.addEventListener("click", () => assignTask(button.dataset.id)));
  rows.querySelectorAll('[data-action="submit"]').forEach((button) => button.addEventListener("click", () => {
    const ids = actionButtonIds(button);
    if (ids.length > 1) batchSubmitSpecificTasks(ids);
    else submitTask(button.dataset.id);
  }));
  rows.querySelectorAll('[data-action="confirm"]').forEach((button) => button.addEventListener("click", () => confirmTasks(actionButtonIds(button))));
  rows.querySelectorAll('[data-action="done"]').forEach((button) => button.addEventListener("click", () => doneTasks(actionButtonIds(button))));
  rows.querySelectorAll('[data-action="suppress"]').forEach((button) => button.addEventListener("click", () => suppressTasks(actionButtonIds(button))));
  renderTodayDashboard();
}

function showTaskHistory(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const title = `操作记录：${task.product_name || task.merchant_code || task.skc || task.spu || task.id}`;
  const history = task.history || [];
  const contextHtml = history.length ? history.map((item) => {
    const nextAfter = [item.next_handler_after, item.next_action_after].filter(Boolean).join(" / ") || "-";
    return `<div class="dialog-history-item">
      <strong>${esc(item.time || "")} ${esc(item.event || "")}</strong>
      <p>操作人：${esc(item.actor || "-")}　动作：${esc(item.action || "-")}</p>
      <p>备注：${esc(item.remark || "-")}　凭证：${esc(item.proof || "-")}</p>
      <p>动作后：${esc(item.status_after || "-")} / ${esc(nextAfter)}</p>
    </div>`;
  }).join("") : '<p>暂无操作记录</p>';
  openTaskDialog({
    pill: "操作记录",
    title,
    description: "按时间查看这条任务的流转和处理依据。",
    ids: [id],
    contextHtml,
    readOnly: true,
  });
}

function showTaskError(error) {
  const line = $("#taskStatusLine");
  const message = userFacingError(error) || "任务操作失败";
  if (line) line.textContent = message;
  showToast(message);
}

function taskPageStatusText() {
  const total = Number(state.taskTotal || 0);
  if (!total) return "当前筛选 0 条任务";
  const start = Math.min(total, Number(state.taskOffset || 0) + 1);
  const end = Math.min(total, Number(state.taskOffset || 0) + Number(state.tasks.length || 0));
  return `当前筛选 ${total} 条任务，正在显示 ${start}-${end} 条`;
}

function renderTaskPagebar() {
  const wrap = $("#taskPagebar");
  if (!wrap) return;
  const total = Number(state.taskTotal || 0);
  const limit = Math.max(1, Number(state.taskLimit || 200));
  const offset = Math.max(0, Number(state.taskOffset || 0));
  if (!total || total <= limit) {
    wrap.innerHTML = "";
    return;
  }
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  wrap.innerHTML = `
    <span>${taskPageStatusText()}，第 ${page}/${pages} 页</span>
    <div>
      <button class="tool-button" data-task-page="prev" type="button" ${offset <= 0 ? "disabled" : ""}>上一页</button>
      <button class="tool-button" data-task-page="next" type="button" ${state.taskHasMore ? "" : "disabled"}>下一页</button>
    </div>
  `;
  wrap.querySelector('[data-task-page="prev"]')?.addEventListener("click", () => {
    state.taskOffset = Math.max(0, offset - limit);
    loadTasks(false);
  });
  wrap.querySelector('[data-task-page="next"]')?.addEventListener("click", () => {
    state.taskOffset = offset + limit;
    loadTasks(false);
  });
}

async function loadTasks(showToastOnDone = true) {
  try {
    const line = $("#taskStatusLine");
    if (line) line.textContent = "正在读取任务...";
    const overview = await api.tasks(operatorPayload({ filters: taskOverviewFilters(), summary_only: true }));
    state.taskOverview = overview.summary || {};
    const result = await api.tasks(operatorPayload({ filters: taskFilters(), limit: state.taskLimit, offset: state.taskOffset }));
    state.taskSummary = result.summary || {};
    state.taskPackages = result.packages || [];
    state.tasks = result.tasks || [];
    state.taskTotal = Number(result.task_total || state.tasks.length || 0);
    state.taskLimit = Number(result.task_limit || state.taskLimit || 200);
    state.taskOffset = Number(result.task_offset || 0);
    state.taskHasMore = Boolean(result.has_more_tasks);
    renderTaskCenter();
    applyPendingPackageSelection();
    renderTodayDashboard();
    if (line) line.textContent = taskPageStatusText();
    if (showToastOnDone) showToast("任务已刷新");
  } catch (error) {
    showTaskError(error);
  }
}

function setText(selector, text) {
  const element = $(selector);
  if (element) element.textContent = text;
}

function actionEmpty({ title, body, primary, page, secondary, attrs = "" }) {
  const primaryButton = primary && page ? `<button class="primary-button" data-empty-page="${page}" ${attrs}>${primary}</button>` : "";
  const secondaryText = secondary ? `<small>${secondary}</small>` : "";
  return `
    <div class="action-empty">
      <div>
        <strong>${title}</strong>
        <span>${body}</span>
        ${secondaryText}
      </div>
      ${primaryButton}
    </div>
  `;
}

function bindEmptyActions(root = document) {
  root.querySelectorAll("[data-empty-page]").forEach((button) => {
    button.setAttribute("type", "button");
  });
}

function followRouteButton(button) {
  if (!button) return;
  showPage(button.dataset.emptyPage);
  applyRouteIntent(button.dataset);
}

function applyRouteIntent(route = {}) {
  if (route.taskUser && $("#taskUser")) $("#taskUser").value = route.taskUser;
  if (route.taskStatus && $("#taskStatus")) $("#taskStatus").value = route.taskStatus;
  if (route.taskNextHandler && $("#taskNextHandler")) $("#taskNextHandler").value = route.taskNextHandler;
  if (route.taskOpenOnly && $("#taskOpenOnly")) $("#taskOpenOnly").checked = route.taskOpenOnly === "true";
  if (route.salesStore && $("#salesReportStore")) $("#salesReportStore").value = route.salesStore;
  if (route.salesPlatform && $("#salesReportPlatform")) $("#salesReportPlatform").value = route.salesPlatform;
  if (route.businessStore && $("#businessStore")) $("#businessStore").value = route.businessStore;
  if (route.businessPlatform && $("#businessPlatform")) $("#businessPlatform").value = route.businessPlatform;
  if (route.salesFocus) setSalesFocus(route.salesFocus, { scroll: route.emptyPage === "sales" });
  if (route.importFocus) setImportFocus(route.importFocus, { scroll: route.emptyPage === "imports" || route.focus === "import-matrix" });
  if (route.bargainTab) openBargainHistoryDialog(route.bargainTab);
  if (route.businessAction === "trend") {
    state.businessTab = "store";
    setBusinessTab("store");
    loadBusinessReport(true);
    setTimeout(() => document.querySelector("#businessTrendPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }
  if (route.masterModule && typeof openMasterModule === "function") {
    setTimeout(() => openMasterModule(route.masterModule), 80);
  }
  if (route.emptyPage === "sales" && (route.salesStore || route.salesPlatform)) {
    loadSalesReport(false);
    setTimeout(() => document.querySelector("#salesReportTable")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }
  if (route.emptyPage === "tasks" && (route.taskUser || route.taskStatus || route.taskNextHandler || route.taskOpenOnly)) {
    loadTasksFromFirstPage();
  }
  if (route.focus === "import-matrix") {
    setTimeout(() => document.querySelector("#importMatrixRows")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
}

function salesDateValue() {
  const input = $("#salesDate");
  if (input && !input.value) input.value = salesDefaultDateText();
  return input?.value || salesDefaultDateText();
}

function setSalesFocus(focus = "missing", options = {}) {
  const allowed = ["missing", "abnormal", "all"];
  state.salesFocus = allowed.includes(focus) ? focus : "missing";
  renderSalesManagement();
  if (options.scroll) {
    setTimeout(() => document.querySelector("#salesEntryList")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }
}

function salesFocusEntries(entries) {
  if (state.salesFocus === "abnormal") return entries.filter((item) => item.abnormal);
  if (state.salesFocus === "all") return entries;
  return entries.filter((item) => !item.submitted);
}

function renderSalesFocus(summary = {}, entries = []) {
  const title = $("#salesFocusTitle");
  const hint = $("#salesFocusHint");
  const notice = $("#salesPendingNotice");
  const visible = salesFocusEntries(entries);
  const missingEntries = entries.filter((item) => !item.submitted);
  const missingStores = new Set(missingEntries.map((item) => `${item.platform || ""}::${item.store || ""}`));
  const ownerMode = (currentOperator().role || "admin") === "owner";
  if (title) {
    const label = state.salesFocus === "abnormal" ? "只看异常波动" : state.salesFocus === "all" ? "查看全部店铺" : "先补未填销售日";
    title.textContent = `${label} · ${visible.length} 条`;
  }
  if (hint) {
    hint.textContent = `应填 ${summary.required || 0}，已填 ${summary.submitted || 0}，未填 ${summary.missing || 0}，异常 ${summary.abnormal || 0}。输入销量后按回车可保存当前行。`;
  }
  if (notice) {
    const prefix = ownerMode ? "你" : "当前";
    notice.textContent = missingEntries.length
      ? `${prefix}还有 ${missingStores.size} 个店铺、1 天的数据没有填写，请尽快填写。`
      : `${prefix}选择的销售日已填写完成。`;
  }
  document.querySelectorAll(".sales-focus-tabs [data-sales-focus]").forEach((button) => {
    button.classList.toggle("active", button.dataset.salesFocus === state.salesFocus);
  });
}

function renderSalesManagement() {
  const payload = state.sales || {};
  const entries = payload.entries || [];
  const list = $("#salesEntryList");
  const summary = payload.summary || {};
  renderSalesFocus(summary, entries);
  if (list) {
    if (!entries.length) {
      list.innerHTML = actionEmpty({
        title: "没有需要填写销量的店铺",
        body: "管理员请先维护平台、店铺、负责人，并打开每日填报；店长请确认顶部姓名和负责人配置一致。",
        primary: "去基础资料",
        page: "masterdata",
      });
      bindEmptyActions(list);
    } else {
      const visibleEntries = salesFocusEntries(entries).map((item) => ({ item, index: entries.indexOf(item) }));
      list.innerHTML = `
        <div class="sales-day-summary">
          <span>销售日期：<strong>${esc($("#salesDate")?.value || salesDefaultDateText())}</strong></span>
          <span>应填 <strong>${summary.required || 0}</strong></span>
          <span>已填 <strong>${summary.submitted || 0}</strong></span>
          <span>未填 <strong>${summary.missing || 0}</strong></span>
          <span>异常 <strong>${summary.abnormal || 0}</strong></span>
        </div>
        <div class="report-table-wrap sales-day-wrap">
          <table class="report-data-table sales-day-table">
            <thead><tr><th>平台</th><th>店铺</th><th>负责人</th><th>销量</th><th>状态</th><th>异常</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>
              ${visibleEntries.length ? visibleEntries.map(({ item, index }) => {
                const canEdit = item.editable !== false;
                const editing = canEdit && (state.salesEditingIndex === index || !item.submitted || item.needs_confirmation);
                const statusLabel = item.needs_confirmation ? "待确认" : (item.submitted ? "已填写" : "未填写");
                const sourceHint = item.needs_confirmation ? "历史导入待确认" : statusLabel;
                return `
                  <tr class="${item.submitted ? "sales-entry-done" : ""} ${item.needs_confirmation ? "sales-entry-pending" : ""}">
                    <td>${esc(item.platform || "")}</td>
                    <td><strong>${esc(item.store || "")}</strong></td>
                    <td>${esc(item.owner || "未分配")}</td>
                    <td><input data-sales-index="${index}" inputmode="numeric" value="${esc(item.sales || "")}" placeholder="" ${editing ? "" : "disabled"} /></td>
                    <td><span class="status-pill ${item.submitted ? "status-ok" : "status-warn"}">${esc(sourceHint)}</span></td>
                    <td>${item.abnormal ? `<span class="status-pill status-danger">${esc(item.abnormal)}</span>` : "正常"}</td>
                    <td><input data-remark-index="${index}" value="${esc(item.remark || "")}" placeholder="可空" ${editing ? "" : "disabled"} /></td>
                    <td>
                      ${editing
                        ? `<button class="primary-button compact-button" data-action="submit-sales" data-index="${index}">确认</button>`
                        : canEdit
                          ? `<button class="tool-button" data-action="edit-sales" data-index="${index}">编辑</button>`
                          : `<span class="locked-note">${esc(item.locked_reason || "已锁定")}</span>`}
                    </td>
                  </tr>
                `;
              }).join("") : `<tr><td class="empty-table-cell" colspan="8">当前筛选下没有数据。</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
      list.querySelectorAll('[data-action="submit-sales"]').forEach((button) => {
        button.addEventListener("click", () => submitSalesEntry(Number(button.dataset.index)));
      });
      list.querySelectorAll('[data-action="edit-sales"]').forEach((button) => {
        button.addEventListener("click", () => {
          state.salesEditingIndex = Number(button.dataset.index);
          renderSalesManagement();
          window.setTimeout(() => document.querySelector(`[data-sales-index="${button.dataset.index}"]`)?.focus(), 30);
        });
      });
      list.querySelectorAll("[data-sales-index], [data-remark-index]").forEach((input) => {
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitSalesEntry(Number(input.dataset.salesIndex || input.dataset.remarkIndex));
          }
        });
      });
    }
  }
  renderReportSalesMetrics();
}

function renderReportSalesMetrics() {
  const summary = state.sales?.summary || {};
  const metrics = $("#reportSalesMetrics");
  if (metrics) {
    metrics.innerHTML = [
      ["销售日销量", summary.total_sales ?? 0, `已填 ${summary.submitted || 0} / 应填 ${summary.required || 0}`, "ok"],
      ["未填店铺", summary.missing ?? 0, "每日销量口径", summary.missing ? "warn" : "ok"],
      ["异常波动", summary.abnormal ?? 0, "50% 阈值提醒", summary.abnormal ? "danger" : "ok"],
    ].map(([label, value, hint, tone]) => `<div class="metric-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></div>`).join("");
  }
  const list = $("#platformSalesList");
  if (list) {
    const platforms = state.sales?.platforms || [];
    if (!platforms.length) {
      list.innerHTML = actionEmpty({
        title: "暂无平台销量汇总",
        body: "平台汇总会在每日销量填报后自动生成。先填写销售日销量，再回来查看平台总览。",
        primary: "填写销量",
        page: "sales",
      });
      bindEmptyActions(list);
    } else {
      list.innerHTML = platforms.map((item) => `
        <div class="platform-sales-row">
          <strong>${item.platform}</strong>
          <span>总销量 ${item.sales || 0}</span>
          <span>已填 ${item.submitted || 0}/${item.required || 0}</span>
          <span class="${item.missing ? "warn" : "ok"}">未填 ${item.missing || 0}</span>
          <span class="${item.abnormal ? "danger" : "ok"}">异常 ${item.abnormal || 0}</span>
        </div>
      `).join("");
    }
  }
  renderSalesCompare();
}

function renderSalesCompare() {
  const summary = state.salesCompare?.summary || {};
  const rows = state.salesCompare?.rows || [];
  const summaryLine = $("#salesCompareSummary");
  if (summaryLine) {
    summaryLine.textContent = `已比对 ${summary.checked || 0} 个已填店铺，发现 ${summary.alerts || 0} 个提醒。导入来源：${(summary.source_platforms || []).join("、") || "暂无可用销量源"}`;
  }
  const wrap = $("#salesCompareRows");
  if (!wrap) return;
  if (!rows.length) {
    wrap.innerHTML = actionEmpty({
      title: "暂无销量差异提醒",
      body: "没有超过 5% 且 20 件的差异，或当前导入表暂时缺少可识别的 7 天/30 天销量字段。",
      primary: "去数据导入",
      page: "imports",
    });
    bindEmptyActions(wrap);
    return;
  }
  wrap.innerHTML = rows.map((row) => `
    <div class="output-row">
      <div>
        <strong>${row.platform} · ${row.store} · ${row.owner || "-"}</strong>
        <p>手填 ${row.manual_sales} 件　导入日均 ${row.imported_daily_avg} 件　差异 ${row.diff} 件（${row.diff_percent}%）</p>
      </div>
    </div>
  `).join("");
}

async function loadSales(showToastOnDone = false) {
  if (!api.sales) return;
  try {
    const smokeSales = window.__PETCIRCLE_RENDER_SMOKE_SALES__;
    state.sales = smokeSales?.sales
      ? await smokeSales.sales(operatorPayload({ date: salesDateValue() }))
      : await api.sales(operatorPayload({ date: salesDateValue() }));
    if (currentOperator().role === "owner") await loadStoreOwners();
    renderSalesManagement();
    renderOperatorOwnerOptions();
    renderBargainStoreOptions();
    renderTodayDashboard();
    if (showToastOnDone) showToast("销量已刷新");
  } catch (error) {
    showToast(error.message || "读取销量失败");
  }
}

async function loadSalesCompare(showToastOnDone = false) {
  if (!api.salesCompare) return;
  try {
    const smokeSales = window.__PETCIRCLE_RENDER_SMOKE_SALES__;
    state.salesCompare = smokeSales?.salesCompare
      ? await smokeSales.salesCompare(operatorPayload({ date: salesDateValue() }))
      : await api.salesCompare(operatorPayload({ date: salesDateValue() }));
    renderSalesCompare();
    if (showToastOnDone) showToast("销量差异已重新比对");
  } catch (error) {
    showToast(error.message || "销量差异比对失败");
  }
}

async function refreshSalesForSelectedDate(showToastOnDone = true) {
  state.salesFocus = "missing";
  state.salesEditingIndex = null;
  await loadSales(false);
  await loadSalesCompare(false);
  await loadSalesReport(false);
  if (showToastOnDone) showToast("销量日期已刷新");
}

function salesReportPayload() {
  return operatorPayload({
    date_from: $("#salesReportDateFrom")?.value || "",
    date_to: $("#salesReportDateTo")?.value || "",
    platform: $("#salesReportPlatform")?.value || "",
    store: $("#salesReportStore")?.value.trim() || "",
  });
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setSalesReportDates(start, end, activeRange = "") {
  if ($("#salesReportDateFrom")) $("#salesReportDateFrom").value = localDateValue(start);
  if ($("#salesReportDateTo")) $("#salesReportDateTo").value = localDateValue(end);
  document.querySelectorAll("[data-sales-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.salesRange === activeRange);
  });
}

function applySalesReportRange(range) {
  const end = new Date();
  const start = new Date(end);
  if (range === "7d") start.setDate(end.getDate() - 6);
  if (range === "30d") start.setDate(end.getDate() - 29);
  if (range === "90d") start.setDate(end.getDate() - 89);
  if (range === "half-year") start.setMonth(end.getMonth() - 6);
  if (range === "1y") start.setFullYear(end.getFullYear() - 1);
  if (range === "month") start.setDate(1);
  if (range === "year") {
    start.setMonth(0);
    start.setDate(1);
  }
  setSalesReportDates(start, end, range);
  loadSalesReport(true);
}

function clearSalesReportRangeShortcut() {
  document.querySelectorAll("[data-sales-range]").forEach((button) => button.classList.remove("active"));
}

function initializeSalesReportRange() {
  if ($("#salesReportDateFrom")?.value || $("#salesReportDateTo")?.value) return;
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  setSalesReportDates(start, end, "30d");
}

function renderSalesReport() {
  const report = state.salesReport || {};
  const summary = report.summary || {};
  const summaryBox = $("#salesReportSummary");
  if (summaryBox) {
    summaryBox.innerHTML = [
      ["总销量", summary.total_sales || 0],
      ["覆盖天数", summary.day_count || 0],
      ["日均销量", summary.daily_average || 0],
      ["记录数", summary.record_count || 0],
      ["店铺数", salesReportTableRows(report).length],
    ].map(([label, value]) => `<span><strong>${esc(value)}</strong>${esc(label)}</span>`).join("");
  }
  renderSalesReportTable(report);
}

function salesReportBucketKey(date) {
  const rows = state.salesReport?.rows || [];
  const dayCount = new Set(rows.map((row) => row.date).filter(Boolean)).size;
  return dayCount > 45 ? String(date || "").slice(0, 7) : String(date || "");
}

function salesReportBucketLabel(bucket) {
  if (!bucket) return "-";
  if (/^\d{4}-\d{2}$/.test(bucket)) return bucket.replace("-", "/");
  return bucket.slice(5).replace("-", "/");
}

function salesReportBuckets(report) {
  const buckets = new Set();
  (report.rows || []).forEach((row) => {
    const bucket = salesReportBucketKey(row.date);
    if (bucket) buckets.add(bucket);
  });
  return [...buckets].sort();
}

function salesReportTableRows(report) {
  const buckets = salesReportBuckets(report);
  const groups = new Map();
  (report.rows || []).forEach((row) => {
    const platform = row.platform || "未设置";
    const store = row.store || "未设置";
    const owner = row.owner || "";
    const key = `${platform}::${store}`;
    if (!groups.has(key)) {
      groups.set(key, { platform, store, owner, total: 0, recordCount: 0, values: {} });
    }
    const item = groups.get(key);
    const sales = Number(row.sales || 0);
    const bucket = salesReportBucketKey(row.date);
    item.total += sales;
    item.recordCount += 1;
    item.values[bucket] = (item.values[bucket] || 0) + sales;
  });
  return [...groups.values()].map((item) => ({
    ...item,
    average: buckets.length ? Number((item.total / buckets.length).toFixed(2)) : 0,
  })).sort((a, b) => b.total - a.total || a.platform.localeCompare(b.platform, "zh-Hans-CN") || a.store.localeCompare(b.store, "zh-Hans-CN"));
}

function renderSalesReportTable(report) {
  const table = $("#salesReportTable");
  const hint = $("#salesReportHint");
  if (!table) return;
  const buckets = salesReportBuckets(report);
  const rows = salesReportTableRows(report);
  if (!rows.length) {
    table.innerHTML = `
      <tbody>
        <tr><td class="empty-table-cell">暂无结果。请先导入历史销量，或调整日期、平台、店铺筛选条件。</td></tr>
      </tbody>
    `;
    if (hint) hint.textContent = "暂无结果。请先导入历史销量，或调整日期、平台、店铺筛选条件。";
    return;
  }
  const bucketMode = buckets.some((bucket) => /^\d{4}-\d{2}$/.test(bucket)) ? "月" : "日";
  if (hint) {
    hint.textContent = `当前显示 ${rows.length} 个店铺，${buckets.length} 个${bucketMode}列；时间范围过长时会自动按月汇总，表格可横向滚动。`;
  }
  table.innerHTML = `
    <thead>
      <tr>
        <th class="sticky-col">平台</th>
        <th class="sticky-col sticky-col-2">店铺</th>
        <th>负责人</th>
        <th class="num">总销量</th>
        <th class="num">${bucketMode}均</th>
        <th class="num">记录数</th>
        ${buckets.map((bucket) => `<th class="num">${esc(salesReportBucketLabel(bucket))}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          <td class="sticky-col">${esc(row.platform)}</td>
          <td class="sticky-col sticky-col-2"><strong>${esc(row.store)}</strong></td>
          <td>${esc(row.owner || "-")}</td>
          <td class="num strong">${esc(row.total)}</td>
          <td class="num">${esc(row.average)}</td>
          <td class="num">${esc(row.recordCount)}</td>
          ${buckets.map((bucket) => `<td class="num">${row.values[bucket] ? esc(row.values[bucket]) : ""}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
}

async function loadSalesReport(showToastOnDone = false) {
  if (!api.salesReport) return;
  try {
    state.salesReport = await api.salesReport(salesReportPayload());
    renderSalesReport();
    if (showToastOnDone) showToast("销量报表已查询");
  } catch (error) {
    showToast(userFacingError(error));
  }
}

async function exportSalesReport() {
  try {
    const result = await api.exportSalesReport(salesReportPayload());
    await refreshAll();
    showToast(`销量报表已导出：${result.file || ""}`);
  } catch (error) {
    showToast(userFacingError(error));
  }
}

function businessReportPayload() {
  const explicitDates = ["7d", "14d", "30d", "90d"].includes(state.businessRange || "");
  return operatorPayload({
    date_from: explicitDates ? ($("#businessDateFrom")?.value || "") : "",
    date_to: explicitDates ? ($("#businessDateTo")?.value || "") : "",
    platform: $("#businessPlatform")?.value || "",
    store: $("#businessStore")?.value.trim() || "",
    grain: $("#businessGrain")?.value || "month",
    range_key: state.businessRange || "30d",
    source: state.businessSource || "manual",
  });
}

function setBusinessDates(start, end, activeRange = "") {
  if ($("#businessDateFrom")) $("#businessDateFrom").value = localDateValue(start);
  if ($("#businessDateTo")) $("#businessDateTo").value = localDateValue(end);
  document.querySelectorAll("[data-business-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.businessRange === activeRange);
  });
}

function applyBusinessRange(range) {
  state.businessRange = range || "30d";
  if ($("#businessDateFrom")) $("#businessDateFrom").value = "";
  if ($("#businessDateTo")) $("#businessDateTo").value = "";
  document.querySelectorAll("[data-business-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.businessRange === state.businessRange);
  });
  loadBusinessReport(true);
}

function applyBusinessSource(source) {
  state.businessSource = source || "manual";
  document.querySelectorAll("[data-business-source]").forEach((button) => {
    button.classList.toggle("active", button.dataset.businessSource === state.businessSource);
  });
  loadBusinessReport(true);
}

function clearBusinessRangeShortcut() {
  document.querySelectorAll("[data-business-range]").forEach((button) => button.classList.remove("active"));
}

function initializeBusinessRange() {
  state.businessRange = "30d";
  document.querySelectorAll("[data-business-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.businessRange === "30d");
  });
  document.querySelectorAll("[data-business-source]").forEach((button) => {
    button.classList.toggle("active", button.dataset.businessSource === (state.businessSource || "manual"));
  });
}

function signedNumber(value) {
  const number = Number(value || 0);
  if (number > 0) return `+${number}`;
  return String(number);
}

function signedRate(value) {
  if (value === null || value === undefined) return "-";
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${number}%`;
}

function businessRangeLabel(rangeKey) {
  if (rangeKey === "month") return "本月累计";
  if (rangeKey === "year") return "本年累计";
  return `最近${String(rangeKey || "30d").replace("d", "")}日销量`;
}

function businessKpiSummary() {
  if (!state.businessReport?.summary) {
    return { loading: true };
  }
  const summary = state.businessReport?.summary || {};
  const range = summary.range || {};
  const previous = summary.previous_range || {};
  return {
    sales: range.sales || previous.sales || 0,
    previous_delta: previous.delta || 0,
    previous_rate: previous.rate,
    year_delta: range.delta || 0,
    year_rate: range.rate,
    latest_date: summary.latest_date || "",
  };
}

function homeRangeCard(rangeKey, label) {
  const report = state.homeBusinessReports?.[rangeKey];
  if (!report?.summary) {
    return `
      <div class="home-business-card">
        <span>${label}</span>
        <strong>加载中</strong>
        <small>店长手填销量，不含今日</small>
      </div>
    `;
  }
  const range = report.summary.range || {};
  const previous = report.summary.previous_range || {};
  return `
    <div class="home-business-card">
      <span>${label} <b class="info-dot" title="${esc(report.definitions?.range || "店长手填销量，不含今日。")}">?</b></span>
      <strong>${esc(range.sales || 0)} 件</strong>
      <small>较上一周期 ${esc(signedNumber(previous.delta || 0))}${previous.rate === null || previous.rate === undefined ? "" : `（${esc(signedRate(previous.rate))}）`}</small>
      <small>较去年同期 ${esc(signedNumber(range.delta || 0))}${range.rate === null || range.rate === undefined ? "" : `（${esc(signedRate(range.rate))}）`}</small>
    </div>
  `;
}

function renderHomeBusinessOverview() {
  const wrap = $("#homeBusinessOverview");
  if (!wrap) return;
  wrap.innerHTML = `
    ${homeRangeCard("7d", "最近7天销量")}
    ${homeRangeCard("30d", "最近30天销量")}
    ${homeRangeCard("90d", "最近90天销量")}
    ${assetMetricCard("temu_hot_skc", "Temu 爆旺款 SKC")}
    ${assetMetricCard("shein_hot_skc", "Shein 爆款 SKC")}
  `;
}

function assetCompareText(label, compare) {
  if (!compare || compare.value === null || compare.value === undefined) return `${label}：暂无数据`;
  return `${label}：${esc(compare.value)} 条（${esc(signedNumber(compare.delta || 0))}）`;
}

function assetMetricCard(metricKey, label) {
  const item = state.assetOverview?.metrics?.[metricKey] || {};
  const definition = state.assetOverview?.definitions?.[metricKey] || "";
  const value = item.value === null || item.value === undefined ? "暂无" : `${item.value} 条`;
  const sourceLabel = item.source === "asset_db" ? "重要资产库" : (item.source_file ? "最新数据源兜底" : "暂无数据源");
  return `
    <div class="home-business-card hot-card">
      <span>${label} <b class="info-dot" title="${esc(definition)}">?</b></span>
      <strong>${esc(value)}</strong>
      <small>${esc(sourceLabel)}${item.date ? ` · ${esc(item.date)}` : ""}</small>
      <small>${assetCompareText("较上月同期", item.previous_month)}</small>
      <small>${assetCompareText("较去年同期", item.previous_year)}</small>
    </div>
  `;
}

function sourceGroupByKey(key) {
  return (state.status?.source_groups || []).find((item) => item.key === key) || {};
}

function temuHotSnapshot() {
  const group = sourceGroupByKey("temu_hot");
  const rows = Number(group.total_rows || group.latest?.rows || 0);
  const recomputeNeeded = group.recompute?.needed;
  return {
    rows,
    label: group.latest?.modified ? `${group.latest.modified.slice(5, 16)}${recomputeNeeded ? " · 待重算" : ""}` : "暂无数据",
  };
}

function deltaClass(value) {
  const number = Number(value || 0);
  if (number > 0) return "up";
  if (number < 0) return "down";
  return "";
}

function businessDefinition(report, key) {
  return report?.definitions?.[key] || "";
}

function kpiHtml(label, item, compareLabel, definition = "", extraClass = "") {
  const delta = Number(item?.delta || 0);
  const rate = item?.rate;
  return `
    <div class="business-kpi ${extraClass} ${deltaClass(delta)}">
      <span>${esc(label)}${definition ? ` <b class="info-dot" title="${esc(definition)}">?</b>` : ""}</span>
      <strong>${esc(item?.sales || 0)}</strong>
      <small>${esc(compareLabel)} ${esc(signedNumber(delta))} ${rate === null || rate === undefined ? "" : `(${esc(signedRate(rate))})`}</small>
    </div>
  `;
}

function deltaKpiHtml(label, item, compareLabel, definition = "", extraClass = "") {
  const delta = Number(item?.delta || 0);
  const rate = item?.rate;
  return `
    <div class="business-kpi ${extraClass} ${deltaClass(delta)}">
      <span>${esc(label)}${definition ? ` <b class="info-dot" title="${esc(definition)}">?</b>` : ""}</span>
      <strong>${esc(signedNumber(delta))}</strong>
      <small>${esc(compareLabel)} ${esc(item?.compare_sales || 0)}${rate === null || rate === undefined ? "" : ` · ${esc(signedRate(rate))}`}</small>
    </div>
  `;
}

function renderBusinessKpis(report) {
  const summary = report.summary || {};
  const box = $("#businessKpis");
  if (!box) return;
  const rangeLabel = businessRangeLabel(report.filters?.range_key || state.businessRange || "30d");
  const completion = summary.completion || {};
  const sourceSummary = report.source_summary || {};
  const sourceMode = sourceSummary.mode || report.filters?.source || state.businessSource || "manual";
  const sourceKpi = sourceMode === "platform"
    ? `<div class="business-kpi warn">
      <span>导入覆盖店铺数 <b class="info-dot" title="${esc(sourceSummary.note || "平台导入参考用于核对趋势，不作为月结主口径。")}">?</b></span>
      <strong>${esc(sourceSummary.covered_stores || 0)}</strong>
      <small>未匹配负责人 ${esc(sourceSummary.unassigned_stores || 0)} 个</small>
    </div>`
    : `<div class="business-kpi ${completion.level || "ok"}">
      <span>店长填报完整度 <b class="info-dot" title="${esc(businessDefinition(report, "completion"))}">?</b></span>
      <strong>${esc(completion.rate ?? 100)}%</strong>
      <small>缺失 ${esc(completion.missing || 0)} 个店铺销售日</small>
    </div>`;
  box.innerHTML = [
    kpiHtml(rangeLabel, summary.previous_range || summary.range || {}, "较上期", businessDefinition(report, "range"), "business-kpi-main"),
    deltaKpiHtml("上期对比", summary.previous_range || {}, "上期销量", businessDefinition(report, "previous_range")),
    deltaKpiHtml("去年同期", summary.range || {}, "去年同期销量", businessDefinition(report, "year_over_year")),
    kpiHtml("本月累计", summary.month || {}, "较上月同期", businessDefinition(report, "month")),
    kpiHtml("本年累计", summary.year || {}, "较去年同期", businessDefinition(report, "year")),
    sourceKpi,
  ].join("");
}

function renderBusinessAlerts(report) {
  const anomalies = report.action_items || report.anomalies || [];
  const text = $("#businessAlertText");
  const list = $("#businessAlertList");
  const strip = $("#businessAlertStrip");
  if (!text || !list || !strip) return;
  strip.classList.toggle("danger", anomalies.length > 0);
  text.textContent = anomalies.length
    ? `${anomalies.length} 条需要处理，含缺填、未更新、店铺下滑或负责人未匹配。`
    : "暂无超过阈值的数据异常。";
  list.innerHTML = anomalies.length
    ? anomalies.map((item) => `
      <div class="business-alert-row">
        <strong>${esc(item.title || item.type)}</strong>
        <span>${esc([item.platform, item.store, item.owner].filter(Boolean).join(" · "))} · ${esc(item.message)}</span>
        <em>${esc(item.latest_date || "-")}</em>
      </div>
    `).join("")
    : `<div class="business-alert-row muted-row"><strong>正常</strong><span>当前筛选范围内没有需要处理的异常。</span><em>-</em></div>`;
}

function businessActionAttrs(item) {
  const platform = esc(item.platform || "");
  const store = esc(item.store || "");
  if (item.action === "sales_missing") {
    return `data-empty-page="sales" data-sales-focus="missing" data-sales-platform="${platform}" data-sales-store="${store}"`;
  }
  if (item.action === "sales_store") {
    return `data-empty-page="sales" data-sales-focus="all" data-sales-platform="${platform}" data-sales-store="${store}"`;
  }
  if (item.action === "assign_owner") {
    return `data-empty-page="masterdata" data-master-module="store-info"`;
  }
  return `data-empty-page="reports" data-business-action="trend" data-business-platform="${platform}" data-business-store="${store}"`;
}

function businessActionLabel(item) {
  if (item.action === "sales_missing") return "去补销量";
  if (item.action === "sales_store") return "查店铺";
  if (item.action === "assign_owner") return "去分配";
  return "看趋势";
}

function renderBusinessActionList(report) {
  const list = $("#businessActionList");
  if (!list) return;
  const items = report.action_items || [];
  if (!items.length) {
    list.innerHTML = actionEmpty({
      title: "暂无需要处理的问题",
      body: "当前范围内没有缺填、长期未更新、明显下滑或负责人未匹配。",
      secondary: report.source_summary?.note || "",
    });
    bindEmptyActions(list);
    return;
  }
  list.innerHTML = items.slice(0, 8).map((item) => `
    <div class="business-action-row ${esc(item.severity || "ok")}">
      <div>
        <strong>${esc(item.title || "需要处理")}</strong>
        <span>${esc(item.message || "")}</span>
        <small>${esc([item.platform, item.store, item.owner].filter(Boolean).join(" · "))}</small>
      </div>
      <button class="ghost-button" type="button" ${businessActionAttrs(item)}>${businessActionLabel(item)}</button>
    </div>
  `).join("");
  bindEmptyActions(list);
}

function moverRow(row, tone) {
  const delta = Number(row?.mom_delta || 0);
  return `
    <div class="business-mover-row ${tone}">
      <div>
        <strong>${esc(row?.store || row?.name || "-")}</strong>
        <span>${esc([row?.platform, row?.owner].filter(Boolean).join(" · "))}</span>
      </div>
      <em>${esc(signedNumber(delta))}</em>
    </div>
  `;
}

function renderBusinessMovers(report) {
  const box = $("#businessMoverGrid");
  if (!box) return;
  const movers = report.movers || {};
  const declines = movers.declines || [];
  const growth = movers.growth || [];
  box.innerHTML = `
    <div class="business-mover-column">
      <h3>下滑最多</h3>
      ${declines.length ? declines.slice(0, 5).map((row) => moverRow(row, "down")).join("") : `<div class="muted-row">暂无明显下滑。</div>`}
    </div>
    <div class="business-mover-column">
      <h3>增长最多</h3>
      ${growth.length ? growth.slice(0, 5).map((row) => moverRow(row, "up")).join("") : `<div class="muted-row">暂无明显增长。</div>`}
    </div>
  `;
}

function businessDimensionRows(dimension) {
  return state.businessReport?.dimensions?.[dimension] || [];
}

function renderBusinessRankingTable(selector, rows, emptyText) {
  const table = $(selector);
  if (!table) return;
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty-table-cell">${esc(emptyText)}</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead>
      <tr>
        <th>名称</th>
        <th>平台</th>
        <th>负责人</th>
        <th class="num">当前销量</th>
        <th class="num">去年同期</th>
        <th class="num">同比件数</th>
        <th class="num">同比率</th>
        <th class="num">占比</th>
        <th>状态</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          <td><strong>${esc(row.name || "-")}</strong></td>
          <td>${esc(row.platform || "-")}</td>
          <td>${esc(row.owner || "-")}</td>
          <td class="num strong">${esc(row.sales || 0)}</td>
          <td class="num">${esc(row.compare_sales || 0)}</td>
          <td class="num ${deltaClass(row.yoy_delta)}">${esc(signedNumber(row.yoy_delta || 0))}</td>
          <td class="num ${deltaClass(row.yoy_delta)}">${esc(row.base_too_small ? "基数小" : signedRate(row.yoy_rate))}</td>
          <td class="num">${esc(row.share || 0)}%</td>
          <td><span class="status-pill ${row.stale ? "danger" : "ok"}">${esc(row.status || "正常")}</span></td>
        </tr>
      `).join("")}
    </tbody>
  `;
}

function renderBusinessTrendTable(dimension) {
  const table = $("#businessTrendTable");
  const trend = state.businessReport?.trends?.[dimension] || {};
  const buckets = trend.buckets || [];
  const rows = trend.rows || [];
  if (!table) return;
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty-table-cell">暂无趋势数据。</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead>
      <tr>
        <th class="sticky-col">名称</th>
        <th>平台</th>
        <th>负责人</th>
        <th class="num">合计</th>
        ${buckets.map((bucket) => `<th class="num">${esc(bucket)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          <td class="sticky-col"><strong>${esc(row.name || "-")}</strong></td>
          <td>${esc(row.platform || "-")}</td>
          <td>${esc(row.owner || "-")}</td>
          <td class="num strong">${esc(row.total || 0)}</td>
          ${buckets.map((bucket) => `<td class="num">${row.values?.[bucket] ? esc(row.values[bucket]) : ""}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
}

function setBusinessTab(tab) {
  state.businessTab = tab || "overview";
  document.querySelectorAll("[data-business-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.businessTab === state.businessTab);
  });
  const overview = $("#businessOverviewTables");
  if (overview) overview.classList.toggle("hidden", state.businessTab !== "overview");
  const trendPanel = $("#businessTrendPanel");
  if (trendPanel) trendPanel.classList.toggle("hidden", state.businessTab === "overview");
  const dimension = state.businessTab === "overview" ? "platform" : state.businessTab;
  const titleMap = { platform: "平台趋势明细", owner: "业务员趋势明细", store: "店铺趋势明细" };
  if ($("#businessTrendTitle")) $("#businessTrendTitle").textContent = titleMap[dimension] || "趋势明细";
  renderBusinessTrendTable(dimension);
}

function renderBusinessReport() {
  const report = state.businessReport || {};
  const ownerMode = (currentOperator().role || "admin") === "owner";
  renderBusinessKpis(report);
  renderBusinessAlerts(report);
  renderBusinessActionList(report);
  renderBusinessMovers(report);
  renderBusinessRankingTable("#businessPlatformTable", businessDimensionRows("platform"), "暂无平台数据。");
  renderBusinessRankingTable("#businessOwnerTable", businessDimensionRows("owner"), "暂无业务员数据。");
  renderBusinessRankingTable("#businessStoreTable", businessDimensionRows("store"), "暂无店铺数据。");
  if ($("#businessStoreTableTitle")) $("#businessStoreTableTitle").textContent = ownerMode ? "我的店铺排行" : "店铺排行";
  if ($("#businessStoreTableHint")) $("#businessStoreTableHint").textContent = ownerMode ? "只展示当前店长负责的店铺。" : "管理员可查看全部店铺。";
  if (ownerMode && ["platform", "owner"].includes(state.businessTab)) {
    state.businessTab = "store";
  }
  setBusinessTab(state.businessTab);
}

async function loadBusinessReport(showToastOnDone = false) {
  if (!api.businessReport) return;
  try {
    state.businessReport = await api.businessReport(businessReportPayload());
    renderBusinessReport();
    if (showToastOnDone) showToast("经营报表已刷新");
  } catch (error) {
    showToast(userFacingError(error));
  }
}

async function loadHomeBusinessReports() {
  if (!api.businessReport) return;
  const ranges = ["7d", "30d", "90d"];
  const reports = {};
  try {
    await Promise.all(ranges.map(async (rangeKey) => {
      reports[rangeKey] = await api.businessReport(operatorPayload({
        date_from: "",
        date_to: "",
        platform: "",
        store: "",
        grain: "month",
        range_key: rangeKey,
        source: "manual",
      }));
    }));
    state.homeBusinessReports = reports;
    renderHomeBusinessOverview();
  } catch (error) {
    showToast(userFacingError(error) || "首页经营总览读取失败");
  }
}

async function loadAssetOverview(showToastOnDone = false) {
  if (!api.assetOverview) return;
  try {
    state.assetOverview = await api.assetOverview(operatorPayload());
    renderHomeBusinessOverview();
    if (showToastOnDone) showToast("重要资产概览已刷新");
  } catch (error) {
    showToast(userFacingError(error) || "重要资产概览读取失败");
  }
}

async function loadImportMatrix(showToastOnDone = false) {
  if (!api.importMatrix) return;
  try {
    state.importMatrix = await api.importMatrix(operatorPayload());
    renderImportMatrix();
    renderOperatorOwnerOptions();
    if (showToastOnDone) showToast("缺失矩阵已刷新");
  } catch (error) {
    showToast(error.message || "读取缺失矩阵失败");
  }
}

async function submitSalesEntry(index) {
  const entry = (state.sales?.entries || [])[index];
  if (!entry) return;
  if (entry.editable === false) {
    showToast(entry.locked_reason || "这条销量已过当天修改时间，请联系管理员修改");
    return;
  }
  const salesInput = document.querySelector(`[data-sales-index="${index}"]`);
  const remarkInput = document.querySelector(`[data-remark-index="${index}"]`);
  const sales = salesInput?.value.trim() || "";
  if (!sales) {
    showToast("请填写销售件数");
    salesInput?.focus();
    return;
  }
  try {
    const payload = operatorPayload({
      date: salesDateValue(),
      platform: entry.platform,
      store: entry.store,
      sales,
      remark: remarkInput?.value.trim() || "",
    });
    const smokeSales = window.__PETCIRCLE_RENDER_SMOKE_SALES__;
    if (smokeSales?.submitSales) {
      await smokeSales.submitSales(payload);
    } else {
      await api.submitSales(payload);
    }
    state.salesEditingIndex = null;
    await loadSales(false);
    await loadSalesReport(false);
    await loadBusinessReport(false);
    await loadHomeBusinessReports();
    await loadAssetOverview(false);
    await loadSalesCompare(false);
    focusNextSalesEntry(index);
    showToast("销量已保存");
  } catch (error) {
    showToast(error.message || "保存销量失败");
  }
}

async function submitSalesBatch() {
  const entries = state.sales?.entries || [];
  const inputs = [...document.querySelectorAll("[data-sales-index]")];
  const filled = inputs
    .map((input) => {
      const index = Number(input.dataset.salesIndex);
      const sales = input.value.trim();
      const entry = entries[index];
      const remark = document.querySelector(`[data-remark-index="${index}"]`)?.value.trim() || "";
      return { index, entry, sales, remark };
    })
    .filter((item) => item.entry && item.entry.editable !== false && item.sales !== "");
  if (!filled.length) {
    showToast("当前列表没有已填写的销量");
    return;
  }
  let saved = 0;
  try {
    for (const item of filled) {
      const payload = operatorPayload({
        date: salesDateValue(),
        platform: item.entry.platform,
        store: item.entry.store,
        sales: item.sales,
        remark: item.remark,
      });
      const smokeSales = window.__PETCIRCLE_RENDER_SMOKE_SALES__;
      if (smokeSales?.submitSales) {
        await smokeSales.submitSales(payload);
      } else {
        await api.submitSales(payload);
      }
      saved += 1;
    }
    state.salesEditingIndex = null;
    await loadSales(false);
    await loadSalesReport(false);
    await loadBusinessReport(false);
    await loadHomeBusinessReports();
    await loadAssetOverview(false);
    await loadSalesCompare(false);
    const missing = Number(state.sales?.summary?.missing || 0);
    showToast(missing ? `已保存 ${saved} 条，还有 ${missing} 个店铺未填写` : `已保存 ${saved} 条，当前日期已填完`);
  } catch (error) {
    showToast(`已保存 ${saved} 条，后续保存失败：${userFacingError(error)}`);
  }
}

function focusNextSalesEntry(index) {
  setTimeout(() => {
    const inputs = [...document.querySelectorAll("[data-sales-index]")];
    const next = inputs.find((input) => Number(input.dataset.salesIndex) > index) || inputs[0];
    next?.focus();
    next?.select?.();
  }, 80);
}

async function exportSales() {
  try {
    if (!api.exportSales) return;
    const result = await api.exportSales(operatorPayload({ date: salesDateValue() }));
    await refreshAll();
    showToast(`销量明细已导出：${result.file || ""}`);
  } catch (error) {
    showToast(error.message || "导出销量明细失败");
  }
}

function renderTodayDashboard() {
  renderRoleCopy();
  renderHomeBusinessOverview();
  renderTodayWorkflow();
  const operator = currentOperator();
  const ownerMode = operator.role === "owner";
  const summary = state.taskOverview || state.taskSummary || {};
  const salesSummary = state.sales?.summary || {};
  const status = summary.by_status || {};
  const nextHandler = summary.by_next_handler || {};
  const overdue = summary.overdue || {};
  const adminQueue = (summary.admin_queue || [])[0] || null;
  const adminQueueFilters = adminQueue?.filters || {};
  const adminQueueCount = Number(adminQueue?.count || nextHandler["管理员"] || 0);
  const adminQueueLabel = adminQueue?.action ? adminActionLabel(adminQueue.action) : "管理员待办";
  const adminQueueAttrs = [
    adminQueueFilters.status ? `data-task-status="${esc(adminQueueFilters.status)}"` : "",
    adminQueueFilters.next_handler ? `data-task-next-handler="${esc(adminQueueFilters.next_handler)}"` : "",
    adminQueueFilters.open_only === "1" ? 'data-task-open-only="true"' : "",
  ].filter(Boolean).join(" ");
  const sourceGroups = state.status?.source_groups || [];
  const pendingSources = sourceGroups.reduce((sum, item) => sum + Number(item.pending_count || 0), 0);
  const missingSources = sourceGroups.filter((item) => String(item.status || "").includes("缺") || String(item.status || "").includes("待")).length;
  const importSummary = state.importMatrix?.summary || {};
  const importBlocked = Number(importSummary.blocked_stores || 0) || missingSources;

  const actionList = $("#todayActionList");
  if (actionList) {
    const rows = ownerMode ? [
      ["我的待填销售日", salesSummary.missing ?? 0, "按销售日期补齐，不再按今日口径误导。", "sales", "去补录", 'data-sales-focus="missing"'],
      ["我要提议价", state.bargainDraft.length, "输入商家编码后先进入暂存区。", "bargain", "去填写", ""],
      ["我的待处理任务包", status["待店长处理"] || 0, "按任务包整包处理，备注或凭证至少填一个。", "tasks", "去处理", 'data-task-status="待店长处理" data-task-open-only="true"'],
      ["我的导入待提交", pendingSources + missingSources, "每周导入自己店铺需要补的数据。", "imports", "去导入", 'data-focus="import-matrix" data-import-focus="blocked"'],
    ] : [
      ["议价待审批", state.bargainHistory.filter((row) => row.status === "待管理员审核").length, "逐行通过或不通过，管理员不改价。", "bargain", "去审批", 'data-bargain-tab="pending"'],
      ["导入缺口", importBlocked, "按平台、店铺、数据类型看缺失矩阵。", "imports", "看矩阵", 'data-focus="import-matrix" data-import-focus="blocked"'],
      [adminQueueLabel, adminQueueCount, "管理员按当前队列处理，完成后任务从待办消失。", "tasks", "去处理", adminQueueAttrs],
      ["待店长处理", status["待店长处理"] || 0, "店长按任务包整包处理。", "tasks", "看进度", 'data-task-status="待店长处理" data-task-open-only="true"'],
      ["待管理员确认", status["待管理员审核"] || 0, "店长处理后管理员打勾完成。", "tasks", "去确认", 'data-task-status="待管理员审核" data-task-open-only="true"'],
    ];
    actionList.innerHTML = rows.map(([label, value, hint, page, action, attrs]) => `
      <div class="action-route">
        <div><strong>${label} · ${value}</strong><span>${hint}</span></div>
        <button class="ghost-button" data-empty-page="${page}" ${attrs}>${action}</button>
      </div>
    `).join("");
    bindEmptyActions(actionList);
  }
}

function ownerFollowupRows() {
  const rows = new Map();
  const ensure = (owner) => {
    const key = owner || "未分配";
    if (!rows.has(key)) {
      rows.set(key, {
        owner: key,
        stores: new Set(),
        missingSales: 0,
        abnormalSales: 0,
        importBlocked: 0,
        importPending: 0,
        ownerPending: 0,
        adminPending: 0,
        overdue: 0,
      });
    }
    return rows.get(key);
  };
  (state.sales?.entries || []).forEach((entry) => {
    const item = ensure(entry.owner || "未分配");
    if (entry.store) item.stores.add(entry.store);
    if (!entry.submitted) item.missingSales += 1;
    if (entry.abnormal) item.abnormalSales += 1;
  });
  (state.importMatrix?.rows || []).forEach((row) => {
    const item = ensure(row.owner || "未分配");
    if (row.store) item.stores.add(row.store);
    if (!row.ready) item.importBlocked += 1;
    if ((row.cells || []).some((cell) => cell.state === "pending")) item.importPending += 1;
  });
  Object.values(state.taskOverview?.owner_status || state.taskSummary?.owner_status || {}).forEach((row) => {
    const item = ensure(row.owner || "未分配");
    const status = row.by_status || {};
    item.ownerPending += Number(status["待店长处理"] || 0) + Number(status["已驳回"] || 0);
    item.adminPending += Number(status["待管理员审核"] || 0) + Number(status["已通过"] || 0);
    item.overdue += Number(row.overdue || 0);
  });
  return [...rows.values()]
    .map((item) => ({ ...item, storeCount: item.stores.size }))
    .filter((item) => item.owner !== "未分配" || item.missingSales || item.importBlocked || item.ownerPending || item.adminPending)
    .sort((a, b) => {
      const score = (row) => (row.missingSales * 5) + (row.ownerPending * 4) + (row.adminPending * 3) + (row.importBlocked * 2) + row.abnormalSales + row.overdue;
      return score(b) - score(a) || String(a.owner).localeCompare(String(b.owner), "zh-Hans-CN");
    });
}

function followupPrimaryAction(item, ownerMode) {
  if (item.missingSales) return ["补销量", "sales", 'data-sales-focus="missing"'];
  if (item.ownerPending) return ["处理任务", "tasks", 'data-task-status="待店长处理" data-task-open-only="true"'];
  if (item.importBlocked || item.importPending) return ["补导入", "imports", 'data-focus="import-matrix" data-import-focus="blocked"'];
  if (!ownerMode && item.adminPending) return ["确认任务", "tasks", 'data-task-status="待管理员审核" data-task-open-only="true"'];
  return ["看明细", "tasks", 'data-task-open-only="true"'];
}

function renderDailyFollowups() {
  const wrap = $("#dailyFollowupList");
  if (!wrap) return;
  const operator = currentOperator();
  const ownerMode = operator.role === "owner";
  const hint = $("#dailyFollowupHint");
  if (hint) {
    hint.textContent = ownerMode
      ? "这里合并你负责店铺的销量、导入和任务状态，按今天要做的顺序处理。"
      : "管理员按负责人看谁还缺销量、导入或任务处理，方便每天集中跟进。";
  }
  let rows = ownerFollowupRows();
  if (ownerMode) rows = rows.filter((item) => item.owner === operator.user);
  if (!rows.length) {
    wrap.innerHTML = `<div class="daily-followup-empty">${actionEmpty({
      title: ownerMode ? "今天没有需要你处理的督办项" : "当前没有负责人督办项",
      body: ownerMode ? "如果你负责的店铺未显示，请让管理员在基础资料里维护负责人。" : "销量、导入和任务都没有集中风险时，这里会保持为空。",
      primary: ownerMode ? "查看我的销量" : "查看基础资料",
      page: ownerMode ? "sales" : "masterdata",
      attrs: ownerMode ? 'data-sales-focus="missing"' : "",
    })}</div>`;
    bindEmptyActions(wrap);
    return;
  }
  wrap.innerHTML = rows.slice(0, 8).map((item) => {
    const [actionLabel, page, attrs] = followupPrimaryAction(item, ownerMode);
    const ownerAttr = !ownerMode && item.owner !== "未分配" ? `data-task-user="${esc(item.owner)}"` : "";
    return `
      <div class="daily-followup-row">
        <div class="daily-followup-owner">
          <strong>${esc(item.owner)}</strong>
          <span>${item.storeCount || 0} 个店铺</span>
        </div>
        <div class="daily-followup-metrics">
          <span class="${item.missingSales ? "warn" : "ok"}">未填 ${item.missingSales}</span>
          <span class="${item.abnormalSales ? "danger" : "ok"}">异常 ${item.abnormalSales}</span>
          <span class="${item.importBlocked ? "warn" : "ok"}">导入 ${item.importBlocked}</span>
          <span class="${item.ownerPending ? "warn" : "ok"}">待店长 ${item.ownerPending}</span>
          <span class="${item.adminPending ? "warn" : "ok"}">待确认 ${item.adminPending}</span>
          <span class="${item.overdue ? "danger" : "ok"}">超时 ${item.overdue}</span>
        </div>
        <button class="ghost-button" data-empty-page="${page}" ${attrs} ${ownerAttr}>${actionLabel}</button>
      </div>
    `;
  }).join("");
  bindEmptyActions(wrap);
}

function renderOperationRhythm() {
  const wrap = $("#operationRhythmList");
  if (!wrap) return;
  const operator = currentOperator();
  const ownerMode = operator.role === "owner";
  const hint = $("#operationRhythmHint");
  if (hint) {
    hint.textContent = ownerMode
      ? "店长每天先填销量和处理已推送任务；每周只补自己店铺缺的数据。"
      : "管理员每天盯进度和异常；每周补齐数据源、推送任务包并确认归档。";
  }
  const lanes = ownerMode ? [
    {
      label: "每日必做",
      tone: "daily",
      items: [
        ["填销售日销量", "只看自己负责店铺，未填优先。", "sales", "去填写", 'data-sales-focus="missing"'],
        ["处理任务包", "已推送到你名下的任务整包提交。", "tasks", "去处理", 'data-task-status="待店长处理" data-task-open-only="true"'],
        ["看异常提醒", "销量波动大时补原因，不影响提交。", "reports", "看提醒", ""],
      ],
    },
    {
      label: "每周辅助",
      tone: "weekly",
      items: [
        ["补导入缺口", "按店铺看缺哪个数据源，能补就补。", "imports", "看缺口", 'data-focus="import-matrix" data-import-focus="blocked"'],
        ["查看确认状态", "提交后的任务等待管理员确认。", "tasks", "查看", 'data-task-status="待管理员审核" data-task-open-only="true"'],
      ],
    },
  ] : [
    {
      label: "每日必做",
      tone: "daily",
      items: [
        ["查未填销量", "先看哪个负责人/店铺没填。", "sales", "看未填", 'data-sales-focus="missing"'],
        ["查异常波动", "只提示风险，不硬拦提交。", "sales", "看异常", 'data-sales-focus="abnormal"'],
        ["确认店长提交", "店长整包处理后管理员打勾归档。", "tasks", "去确认", 'data-task-status="待管理员审核" data-task-open-only="true"'],
      ],
    },
    {
      label: "每周辅助",
      tone: "weekly",
      items: [
        ["检查导入矩阵", "看哪个平台、店铺、数据类型缺失。", "imports", "看矩阵", 'data-focus="import-matrix" data-import-focus="blocked"'],
        ["推送商品任务", "按任务包推送，必要时下载表格给店长。", "tasks", "去推送", 'data-task-status="待推送" data-task-open-only="true"'],
        ["生成经营报表", "月结前先看销量、导入、任务体检。", "reports", "看体检", ""],
      ],
    },
  ];
  wrap.innerHTML = lanes.map((lane) => `
    <div class="rhythm-lane ${lane.tone}">
      <div class="rhythm-lane-title">
        <strong>${lane.label}</strong>
        <span>${lane.tone === "daily" ? "每天打开先看" : "一周集中处理"}</span>
      </div>
      <div class="rhythm-actions">
        ${lane.items.map(([title, body, page, action, attrs]) => `
          <div class="rhythm-action">
            <div><strong>${title}</strong><span>${body}</span></div>
            <button class="ghost-button" data-empty-page="${page}" ${attrs}>${action}</button>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
  bindEmptyActions(wrap);
}

function renderTodayWorkflow() {
  const wrap = $("#todayWorkflowSteps");
  if (!wrap) return;
  const operator = currentOperator();
  const ownerMode = operator.role === "owner";
  const title = $("#todayWorkflowTitle");
  const hint = $("#todayWorkflowHint");
  if (title) title.textContent = ownerMode ? "店长每日操作流程" : "管理员每日操作流程";
  if (hint) {
    hint.textContent = ownerMode
      ? "按顺序处理自己负责店铺：销量、议价、任务、导入、经营结果。"
      : "按顺序看全局进度：销量缺口、议价审批、导入缺口、任务推送和归档。";
  }
  const steps = ownerMode ? [
    ["01", "填我的销量", "进入销量管理，只补自己负责店铺缺的销售日。", "sales", "去填写", 'data-sales-focus="missing"'],
    ["02", "填议价申请", "输入商家编码，确认同货品编码下全部尺码的议价。", "bargain", "去填写", ""],
    ["03", "处理我的任务包", "商品任务按整包提交，备注或凭证至少填一个。", "tasks", "去处理", 'data-task-status="待店长处理" data-task-open-only="true"'],
    ["04", "补导入缺口", "每周只补自己店铺缺的数据源。", "imports", "看缺口", 'data-focus="import-matrix" data-import-focus="blocked"'],
    ["05", "看经营结果", "回到经营报表查看自己店铺趋势和销量差异提醒。", "reports", "看报表", ""],
  ] : [
    ["01", "查销量缺口", "先看未填店铺和异常波动，提醒负责人补齐原因。", "sales", "看销量", 'data-sales-focus="missing"'],
    ["02", "审批议价", "店长提交后逐行通过或不通过，管理员不改价。", "bargain", "去审批", 'data-bargain-tab="pending"'],
    ["03", "查导入缺口", "按平台、店铺、数据类型看缺失矩阵，缺哪个店铺一眼定位。", "imports", "看矩阵", 'data-focus="import-matrix" data-import-focus="blocked"'],
    ["04", "推送任务包", "把待推送任务包确认后推送给店长处理。", "tasks", "去推送", 'data-task-status="待推送" data-task-open-only="true"'],
    ["05", "确认任务归档", "店长整包处理后，管理员确认完成。", "tasks", "去确认", 'data-task-status="待管理员审核" data-task-open-only="true"'],
  ];
  wrap.innerHTML = steps.map(([number, titleText, body, page, action, attrs]) => `
    <div class="workflow-step">
      <div class="workflow-step-number">${number}</div>
      <div><strong>${titleText}</strong><span>${body}</span></div>
      <button class="ghost-button" data-empty-page="${page}" ${attrs}>${action}</button>
    </div>
  `).join("");
  bindEmptyActions(wrap);
}

function guideTone(done, warn = false) {
  if (done) return "done";
  return warn ? "warn" : "danger";
}

function renderTodayGuide() {
  const wrap = $("#todayGuideSteps");
  if (!wrap) return;
  const operator = currentOperator();
  const ownerMode = operator.role === "owner";
  const salesSummary = state.sales?.summary || {};
  const taskSummary = state.taskOverview || state.taskSummary || {};
  const sourceGroups = state.status?.source_groups || [];
  const importSummary = state.importMatrix?.summary || {};
  const configuredStoreCount = state.storeOwners?.filter((item) => item.enabled !== false).length || 0;
  const storeCount = configuredStoreCount || Number(salesSummary.required || 0);
  const ownerStoreCount = Number(salesSummary.required || 0);
  const missingSources = sourceGroups.filter((item) => String(item.status || "").includes("缺") || Number(item.pending_count || 0) > 0).length;
  const openTasks = Object.entries(taskSummary.by_status || {}).reduce((sum, [status, count]) => status === "已完成" ? sum : sum + Number(count || 0), 0);
  const steps = [
    {
      title: "确认当前视角",
      body: operator.role === "owner" ? "店长只看自己负责的数据。" : "管理员可查看全部平台和店铺。",
      done: operator.role !== "owner" || Boolean(operator.user),
      status: operator.role === "owner" && !operator.user ? "需填写姓名" : "已设置",
      page: "today",
      action: "顶部切换",
      attrs: "",
    },
    {
      title: ownerMode ? "确认负责店铺" : "维护店铺资料",
      body: ownerMode ? "如果这里是 0，说明管理员还没把店铺分配到你名下。" : "平台、店铺、负责人决定销量、导入和任务权限。",
      done: ownerMode ? ownerStoreCount > 0 : storeCount > 0,
      status: ownerMode ? `${ownerStoreCount} 个负责店铺` : (storeCount ? `${storeCount} 个店铺` : "待维护"),
      page: "masterdata",
      action: ownerMode ? "查看资料" : "去维护",
      attrs: "",
    },
    {
      title: "填写每日销量",
      body: ownerMode ? "每天先填自己负责店铺的销量，异常波动写清原因。" : "每天先填销量，管理员再看未填和异常波动。",
      done: Number(salesSummary.required || 0) > 0 && Number(salesSummary.missing || 0) === 0,
      warn: Number(salesSummary.required || 0) > 0,
      status: `${salesSummary.submitted || 0}/${salesSummary.required || 0}`,
      page: "sales",
      action: "去填写",
      attrs: 'data-sales-focus="missing"',
    },
    {
      title: ownerMode ? "补齐导入数据" : "检查数据导入",
      body: ownerMode ? "每周只补自己店铺缺的导入项，管理员能看到缺口。" : "每周导入源缺失会影响后续报表和商品任务。",
      done: Number(importSummary.blocked_stores || 0) === 0 && missingSources === 0,
      warn: Number(importSummary.stores || 0) > 0,
      status: missingSources ? `${missingSources} 类待处理` : "已就绪",
      page: "imports",
      action: "去检查",
      attrs: 'data-focus="import-matrix" data-import-focus="blocked"',
    },
    {
      title: "处理商品任务",
      body: ownerMode ? "按任务包整包处理，提交后等待管理员确认。" : "店长整包处理，管理员确认后任务消失。",
      done: openTasks === 0,
      warn: openTasks > 0,
      status: openTasks ? `${openTasks} 条待办` : "无待办",
      page: "tasks",
      action: "去处理",
      attrs: ownerMode
        ? 'data-task-status="待店长处理" data-task-open-only="true"'
        : 'data-task-open-only="true"',
    },
    {
      title: ownerMode ? "查看经营结果" : "导出经营结果",
      body: ownerMode ? "销量和任务完成后，可查看自己店铺的经营口径。" : "销量明细和经营报表作为月结结果，不再手工改公式。",
      done: Number(salesSummary.submitted || 0) > 0,
      warn: Number(salesSummary.required || 0) > 0,
      status: Number(salesSummary.submitted || 0) > 0 ? "可导出" : "待填报",
      page: "reports",
      action: ownerMode ? "去查看" : "去报表",
      attrs: "",
    },
  ];
  wrap.innerHTML = steps.map((step) => `
    <div class="guide-step ${guideTone(step.done, step.warn)}">
      <div class="guide-status">${step.status}</div>
      <div><strong>${step.title}</strong><span>${step.body}</span></div>
      <button class="ghost-button" data-empty-page="${step.page}" ${step.attrs || ""}>${step.action}</button>
    </div>
  `).join("");
  bindEmptyActions(wrap);
}

async function submitTask(id) {
  const actor = $("#taskUser")?.value.trim() || currentOperator().user || "";
  openTaskDialog({
    pill: "店长处理",
    title: "填写处理结果",
    description: "处理依据用于管理员最后确认；备注和凭证至少填写一个。",
    ids: [id],
    submitLabel: "提交给管理员确认",
    fields: [
      { name: "actor", label: "填写人", value: actor, required: true },
      { name: "action", label: "处理动作", type: "select", value: "已处理", required: true, options: ["已处理", "已下架", "申请退货", "继续观察", "同意议价", "已改价", "已补库存"] },
      { name: "remark", label: "处理备注", type: "textarea", placeholder: "说明实际处理情况、原因或后台结果" },
      { name: "proof", label: "处理凭证", placeholder: "截图链接、后台单号、表格行号等" },
    ],
    onSubmit: async (values) => {
      if (!String(values.remark || "").trim() && !String(values.proof || "").trim()) {
        throw new Error("店长提交必须填写处理依据：备注或处理凭证至少填一个");
      }
      await api.submitTask(operatorPayload({ id, ...values }));
      await loadTasks(false);
      showToast("店长填写已提交");
    },
  });
}

async function batchSubmitTasks() {
  const operator = currentOperator();
  if (operator.role !== "owner") {
    showToast("只有店长可以批量填写处理结果");
    return;
  }
  const ids = selectedTaskIds();
  if (!ids.length) {
    showToast("请先勾选要批量处理的任务");
    return;
  }
  openTaskDialog({
    pill: "整包处理",
    title: "批量填写处理结果",
    description: "同一批勾选任务会使用同一套处理动作和依据。",
    ids,
    submitLabel: "整包提交",
    fields: [
      { name: "action", label: "处理动作", type: "select", value: "已处理", required: true, options: ["已处理", "已下架", "申请退货", "继续观察", "同意议价", "已改价", "已补库存"] },
      { name: "remark", label: "处理备注", type: "textarea", placeholder: "说明这一包任务的处理结果" },
      { name: "proof", label: "处理凭证", placeholder: "截图链接、后台单号、表格行号等" },
    ],
    onSubmit: async (values) => {
      if (!String(values.remark || "").trim() && !String(values.proof || "").trim()) {
        throw new Error("店长提交必须填写处理依据：备注或处理凭证至少填一个");
      }
      const result = await api.batchSubmitTasks(operatorPayload({ ids, ...values }));
      await loadTasks(false);
      showToast(`已批量提交 ${result.count || 0} 条任务，等待管理员确认`);
    },
  });
}

async function batchSubmitSpecificTasks(ids) {
  const selected = (ids || []).filter(Boolean);
  if (!selected.length) {
    showToast("请先选择要处理的任务");
    return;
  }
  const operator = currentOperator();
  if (operator.role !== "owner") {
    showToast("只有店长可以批量填写处理结果");
    return;
  }
  openTaskDialog({
    pill: "合并处理",
    title: "填写合并任务处理结果",
    description: "同一 SKC/同一产品的重复明细会使用同一套处理动作和依据。",
    ids: selected,
    submitLabel: "提交处理",
    fields: [
      { name: "action", label: "处理动作", type: "select", value: "已处理", required: true, options: ["已处理", "已下架", "申请退货", "继续观察", "同意议价", "已改价", "已补库存"] },
      { name: "remark", label: "处理备注", type: "textarea", placeholder: "说明这一组合并任务的处理结果" },
      { name: "proof", label: "处理凭证", placeholder: "截图链接、后台单号、表格行号等" },
    ],
    onSubmit: async (values) => {
      if (!String(values.remark || "").trim() && !String(values.proof || "").trim()) {
        throw new Error("店长提交必须填写处理依据：备注或处理凭证至少填一个");
      }
      const result = await api.batchSubmitTasks(operatorPayload({ ids: selected, ...values }));
      await loadTasks(false);
      showToast(`已提交 ${result.count || 0} 条合并任务，等待管理员确认`);
    },
  });
}

async function pushTasks(ids) {
  const rawSelected = (ids || selectedTaskIds()).filter(Boolean);
  const byId = new Map((state.tasks || []).map((task) => [task.id, task]));
  const selected = rawSelected.filter((id) => {
    const task = byId.get(id);
    return !task || (task.status === "待推送" && task.owner);
  });
  if (!selected.length) {
    showTaskError(new Error(rawSelected.length ? "所选任务里没有可推送项；只有已指派负责人且状态为待推送的任务可以推送" : "请先选择要推送给店长的任务"));
    return;
  }
  if (selected.length < rawSelected.length) {
    showToast(`已自动跳过 ${rawSelected.length - selected.length} 条不可推送任务`);
  }
  openTaskDialog({
    pill: "管理员推送",
    title: "推送任务给店长",
    description: "推送后任务进入店长待处理列表。",
    ids: selected,
    submitLabel: "确认推送",
    fields: [
      { name: "remark", label: "推送说明", type: "textarea", value: "管理员确认推送", placeholder: "可说明本次推送范围" },
    ],
    onSubmit: async (values) => {
      const result = await api.pushTasks(operatorPayload({ ids: selected, ...values }));
      await loadTasks(false);
      showToast(`已推送 ${result.count || 0} 条任务给店长`);
    },
  });
}

async function doneTasks(ids) {
  const selected = (ids || []).filter(Boolean);
  if (!selected.length) {
    showToast("这个任务包当前没有可归档完成的任务");
    return;
  }
  openTaskDialog({
    pill: "管理员",
    title: "整包归档完成",
    description: "用于把已确认任务批量标记为完成。",
    ids: selected,
    submitLabel: "归档完成",
    fields: [
      { name: "remark", label: "完成确认说明", type: "textarea", value: "管理员归档完成", required: true },
    ],
    onSubmit: async (values) => {
      const result = await api.doneTasks(operatorPayload({ ids: selected, remark: values.remark }));
      await loadTasks(false);
      showToast(`已归档完成 ${result.count || 0} 条任务`);
    },
  });
}

function handlePackageAction(packageId, action) {
  const pkg = taskPackageById(packageId);
  if (!pkg) return;
  if (action === "select") {
    selectPackageTasks(pkg, "all");
    return;
  }
  if (action === "filter") {
    applyPackageFilter(pkg);
    return;
  }
  if (action === "submit") {
    const ids = packageActionIds(pkg, "submit");
    ids.forEach((id) => {
      const checkbox = document.querySelector(`.task-check[value="${id}"]`);
      if (checkbox) checkbox.checked = true;
    });
    openTaskDialog({
      pill: "整包处理",
      title: "整包填写处理结果",
      description: "同一个任务包会使用同一套处理动作和依据。",
      ids,
      submitLabel: "整包提交",
      fields: [
        { name: "action", label: "处理动作", type: "select", value: "已处理", required: true, options: ["已处理", "已下架", "申请退货", "继续观察", "同意议价", "已改价", "已补库存"] },
        { name: "remark", label: "处理备注", type: "textarea", placeholder: "说明这一包任务的处理结果" },
        { name: "proof", label: "处理凭证", placeholder: "截图链接、后台单号、表格行号等" },
      ],
      onSubmit: async (values) => {
        if (!String(values.remark || "").trim() && !String(values.proof || "").trim()) {
          throw new Error("店长提交必须填写处理依据：备注或处理凭证至少填一个");
        }
        const result = await api.batchSubmitTasks(operatorPayload({ ids, ...values }));
        await loadTasks(false);
        showToast(`任务包已提交 ${result.count || 0} 条，等待管理员确认`);
      },
    });
    return;
  }
  if (action === "push") {
    pushTasks(packageActionIds(pkg, "push"));
    return;
  }
  if (action === "confirm") {
    confirmTasks(packageActionIds(pkg, "confirm"));
    return;
  }
  if (action === "done") {
    doneTasks(packageActionIds(pkg, "done"));
    return;
  }
  if (action === "suppress") {
    suppressTasks(packageActionIds(pkg, "suppress"));
  }
}

async function assignTask(id) {
  const actor = $("#taskUser")?.value.trim() || currentOperator().user || "管理员";
  openTaskDialog({
    pill: "管理员",
    title: "指派任务负责人",
    description: "指派后任务会进入对应店长的待处理列表。",
    ids: [id],
    submitLabel: "确认指派",
    fields: [
      { name: "actor", label: "操作人", value: actor, required: true },
      { name: "owner", label: "指派给", required: true, placeholder: "负责人姓名" },
      { name: "remark", label: "指派备注", type: "textarea", placeholder: "可说明为什么指派给该负责人" },
    ],
    onSubmit: async (values) => {
      await api.assignTask(operatorPayload({ id, ...values }));
      await loadTasks(false);
      showToast("任务负责人已指派");
    },
  });
}

async function reviewTask(id, decision) {
  openTaskDialog({
    pill: "管理员确认",
    title: `管理员${decision}`,
    description: "此入口保留给历史任务状态使用；主流程建议直接确认完成。",
    ids: [id],
    submitLabel: `提交${decision}`,
    fields: [
      { name: "admin", label: "管理员", value: $("#taskUser")?.value.trim() || currentOperator().user || "管理员", required: true },
      { name: "remark", label: "说明", type: "textarea", value: decision === "通过" ? "管理员确认店长已处理" : "", required: true },
    ],
    onSubmit: async (values) => {
      await api.reviewTask(operatorPayload({ id, decision, ...values }));
      await loadTasks(false);
      showToast(`管理员已${decision}`);
    },
  });
}

async function batchReviewTasks(decision) {
  const ids = selectedTaskIds();
  if (!ids.length) {
    showToast("请先勾选要批量确认的任务");
    return;
  }
  openTaskDialog({
    pill: "管理员确认",
    title: `批量${decision}`,
    description: "此入口保留给历史任务状态使用；主流程建议直接批量确认完成。",
    ids,
    submitLabel: `批量${decision}`,
    fields: [
      { name: "admin", label: "管理员", value: $("#taskUser")?.value.trim() || currentOperator().user || "管理员", required: true },
      { name: "remark", label: "说明", type: "textarea", value: decision === "通过" ? "管理员确认店长已处理" : "", required: true },
    ],
    onSubmit: async (values) => {
      const result = await api.batchReviewTasks(operatorPayload({ ids, decision, ...values }));
      await loadTasks(false);
      showToast(`已批量${decision} ${result.count || 0} 条任务`);
    },
  });
}

async function confirmTasks(ids = selectedTaskIds()) {
  const selected = (ids || []).filter(Boolean);
  if (!selected.length) {
    showToast("请先勾选要确认完成的任务");
    return;
  }
  openTaskDialog({
    pill: "管理员确认",
    title: "确认店长已处理",
    description: "确认后任务直接进入已完成，不再出现在待办里。",
    ids: selected,
    submitLabel: "确认完成",
    fields: [
      { name: "admin", label: "管理员", value: $("#taskUser")?.value.trim() || currentOperator().user || "管理员", required: true },
      { name: "remark", label: "确认说明", type: "textarea", value: "管理员确认店长已处理", placeholder: "可补充检查结果" },
    ],
    onSubmit: async (values) => {
      const result = await api.confirmTasks(operatorPayload({ ids: selected, ...values }));
      await loadTasks(false);
      showToast(`已确认完成 ${result.count || 0} 条任务`);
    },
  });
}

async function loadTaskSuppressions() {
  if (!api.taskSuppressions) return;
  const operator = currentOperator();
  if (operator.role === "owner") {
    state.taskSuppressions = [];
    renderTaskSuppressions();
    return;
  }
  try {
    const result = await api.taskSuppressions(operatorPayload());
    state.taskSuppressions = result.items || [];
    renderTaskSuppressions();
  } catch (_error) {
    state.taskSuppressions = [];
    renderTaskSuppressions();
  }
}

function renderTaskSuppressions() {
  const table = $("#taskSuppressionTable");
  const status = $("#taskSuppressionStatus");
  if (!table) return;
  const operator = currentOperator();
  if (operator.role === "owner") {
    if (status) status.textContent = "屏蔽清单由管理员维护。";
    table.innerHTML = `<tbody><tr><td class="empty-table-cell">店长只处理已推送到自己名下的任务包；屏蔽清单由管理员统一维护。</td></tr></tbody>`;
    return;
  }
  const filters = {
    store: $("#suppressionStoreFilter")?.value.trim().toLowerCase() || "",
    owner: $("#suppressionOwnerFilter")?.value.trim().toLowerCase() || "",
    skc: $("#suppressionSkcFilter")?.value.trim().toLowerCase() || "",
    merchant: $("#suppressionMerchantFilter")?.value.trim().toLowerCase() || "",
  };
  const allRows = state.taskSuppressions || [];
  const rows = allRows.filter((item) => {
    if (filters.store && !String(item.store || "").toLowerCase().includes(filters.store)) return false;
    if (filters.owner && !String(item.owner || "").toLowerCase().includes(filters.owner)) return false;
    if (filters.skc && !String(item.skc || "").toLowerCase().includes(filters.skc)) return false;
    if (filters.merchant && !String(item.merchant_code || "").toLowerCase().includes(filters.merchant)) return false;
    return true;
  });
  if (status) status.textContent = `当前显示 ${rows.length} 条，共 ${allRows.length} 条屏蔽记录。`;
  if (!rows.length) {
    table.innerHTML = `<tbody><tr><td class="empty-table-cell">暂无匹配屏蔽项。可调整店铺、店长、SKC 或商家编码筛选条件。</td></tr></tbody>`;
    return;
  }
  const columns = ["店铺", "店长", "SKC", "商家编码", "商品名称", "任务类型", "系统建议", "原因", "状态", "时长", "更新时间", "更新人"];
  table.innerHTML = `
    <thead><tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.map((item) => {
        const record = {
          "店铺": item.store || "",
          "店长": item.owner || "",
          "SKC": item.skc || "",
          "商家编码": item.merchant_code || "",
          "商品名称": item.product_name || "",
          "任务类型": item.task_type || "",
          "系统建议": item.system_action || "",
          "原因": item.reason || "",
          "状态": item.status || "",
          "时长": item.duration || "",
          "更新时间": item.updated_at || "",
          "更新人": item.updated_by || "",
        };
        return `<tr>${columns.map((column) => `<td title="${esc(record[column])}">${esc(record[column] || "-")}</td>`).join("")}</tr>`;
      }).join("")}
    </tbody>
  `;
}

async function suppressTasks(ids = selectedTaskIds()) {
  const selected = (ids || []).filter(Boolean);
  if (!selected.length) {
    showToast("请先勾选要屏蔽的任务");
    return;
  }
  openTaskDialog({
    pill: "屏蔽提醒",
    title: "屏蔽重复任务",
    description: "适合每周反复出现但确认暂不处理的 SKC/SPU。屏蔽后后续报表生成不再重复提示。",
    ids: selected,
    submitLabel: "加入屏蔽清单",
    fields: [
      { name: "reason", label: "屏蔽原因", type: "textarea", value: "暂不处理，避免重复提醒", required: true },
      { name: "duration", label: "屏蔽时长", type: "select", value: "永久", options: ["2周", "1个月", "3个月", "永久"] },
    ],
    onSubmit: async (values) => {
      const result = await api.suppressTasks(operatorPayload({ ids: selected, ...values }));
      await loadTasks(false);
      await loadTaskSuppressions();
      showToast(`已屏蔽 ${result.count || 0} 条任务`);
    },
  });
}

async function doneTask(id) {
  openTaskDialog({
    pill: "管理员",
    title: "标记任务完成",
    description: "用于兼容历史已确认状态；新流程优先使用“确认完成”。",
    ids: [id],
    submitLabel: "标记完成",
    fields: [
      { name: "actor", label: "管理员", value: $("#taskUser")?.value.trim() || currentOperator().user || "管理员", required: true },
      { name: "remark", label: "完成确认说明", type: "textarea", required: true },
    ],
    onSubmit: async (values) => {
      await api.doneTask(operatorPayload({ id, ...values }));
      await loadTasks(false);
      showToast("任务已标记完成");
    },
  });
}

async function exportTasks() {
  try {
    const result = await api.exportTasks(operatorPayload({ filters: taskFilters() }));
    showToast(`任务台账已导出：${result.file || ""}`);
    await refreshAll();
  } catch (error) {
    showTaskError(error);
  }
}

function flattenRules(rules) {
  return [
    ["Temu爆旺款口径", "hot_item.temu_basis", rules.hot_item?.temu_basis || ""],
    ["爆旺关键词", "hot_item.keywords", (rules.hot_item?.keywords || []).join(", ")],
    ["表格排序层级", "sort.group_order", (rules.sort?.group_order || []).join(", ")],
    ["尺码排序", "sort.size_order", (rules.sort?.size_order || []).join(", ")],
    ["SHEIN新品爆旺：上架天数小于", "hot_item.shein_new_days_lt", rules.hot_item?.shein_new_days_lt ?? ""],
    ["SHEIN新品爆旺：7天日均不低于", "hot_item.shein_new_7d_daily_gte", rules.hot_item?.shein_new_7d_daily_gte ?? ""],
    ["SHEIN老品爆旺：上架天数不低于", "hot_item.shein_old_days_gte", rules.hot_item?.shein_old_days_gte ?? ""],
    ["SHEIN老品爆旺：30天日均大于", "hot_item.shein_old_30d_daily_gt", rules.hot_item?.shein_old_30d_daily_gt ?? ""],
    ["新品滞销：上架天数超过", "slow_moving.new_slow_min_days", rules.slow_moving?.new_slow_min_days || ""],
    ["老品滞销：上架天数超过", "slow_moving.old_slow_min_days", rules.slow_moving?.old_slow_min_days || ""],
  ];
}

function renderRules() {
  const form = $("#rulesForm");
  form.innerHTML = "";
  flattenRules(state.rules).forEach(([label, key, value]) => {
    const card = document.createElement("div");
    card.className = "rule-card";
    card.innerHTML = `<label>${label}</label><input data-rule="${key}" value="${String(value).replaceAll('"', "&quot;")}" />`;
    form.appendChild(card);
  });
  renderSalesThresholdRules();
  renderErpSettings();
}

function renderSalesThresholdRules() {
  const settings = state.rules?.sales_thresholds || {};
  document.querySelectorAll('[data-settings-panel="sales-thresholds"] [data-rule]').forEach((input) => {
    const value = settings[input.dataset.rule];
    input.value = value === undefined || value === null ? "" : String(value);
  });
}

function renderErpSettings() {
  const settings = state.rules?.erp_api || {};
  document.querySelectorAll("[data-erp-field]").forEach((input) => {
    const key = input.dataset.erpField;
    const value = settings[key];
    if (input.type === "checkbox") {
      input.checked = Boolean(value);
    } else if (input.type === "number") {
      input.value = value || "";
    } else if (Array.isArray(value)) {
      input.value = value.join("，");
    } else {
      input.value = value || "";
    }
  });
  renderErpLatestOverview(settings);
  const enabled = settings.enabled ? "已启用" : "未启用";
  const auto = settings.auto_sync ? "自动同步开启" : "手动同步为主";
  const failed = settings.last_manual_sync_status === "failed";
  const counts = settings.last_manual_sync_at
    ? `商品 ${settings.last_product_count || 0} 条/${settings.last_product_pages || 0} 页，库存 ${settings.last_stock_count || 0} 条/${settings.last_stock_pages || 0} 页`
    : "";
  const last = settings.last_manual_sync_at
    ? `上次同步：${settings.last_manual_sync_at} ${settings.last_manual_sync_message || ""}`
    : "还没有同步记录";
  const success = failed && settings.last_success_sync_at ? `当前使用上次成功数据：${settings.last_success_sync_at}` : "";
  const warehouse = settings.warehouse_name || settings.warehouse_no || "未指定仓库";
  const environment = settings.environment === "prod" ? "正式环境" : "测试环境";
  const message = `${settings.provider || "旺店通"} · ${environment} · ${enabled} · ${auto} · 仓库 ${warehouse} · ${last}${success ? ` · ${success}` : ""}${counts ? ` · ${counts}` : ""}`;
  setErpStatus(failed ? "failed" : "idle", failed ? "ERP 今日同步失败" : "ERP 设置状态", message, failed ? settings.last_manual_sync_message : "");
}

function erpNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function erpFileName(path = "") {
  return String(path || "").split(/[\\/]/).filter(Boolean).pop() || "未生成";
}

function erpAvailableStockCount(settings = {}) {
  if (settings.last_available_stock_count !== undefined && settings.last_available_stock_count !== null) {
    return erpNumber(settings.last_available_stock_count);
  }
  const match = String(settings.last_manual_sync_message || "").match(/可用库存\s*(\d+)\s*条/);
  return match ? erpNumber(match[1]) : 0;
}

function renderErpLatestOverview(settings = {}) {
  const box = $("#erpLatestDataOverview");
  if (!box) return;
  const lastSuccess = settings.last_success_sync_at || (settings.last_manual_sync_status === "synced" ? settings.last_manual_sync_at : "");
  const productCount = erpNumber(settings.last_product_count);
  const stockCount = erpNumber(settings.last_stock_count);
  const availableCount = erpAvailableStockCount(settings);
  const productPages = erpNumber(settings.last_product_pages);
  const stockPages = erpNumber(settings.last_stock_pages);
  const productFile = settings.last_product_file || "";
  const stockFile = settings.last_stock_file || "";
  const availableFile = settings.last_available_stock_file || "";
  if (!lastSuccess && !productFile && !stockFile && !availableFile) {
    box.innerHTML = `<div class="erp-latest-empty">最新 ERP 数据：还没有成功同步记录。</div>`;
    return;
  }
  const stockNote = settings.last_manual_sync_status === "synced" && stockCount === 0
    ? `<div class="erp-overview-note">库存快照接口返回 0 条，不代表商品资料失败；商品资料仍按最新成功数据使用。</div>`
    : "";
  box.innerHTML = `
    <div class="erp-latest-head">
      <strong>最新 ERP 数据</strong>
      <span>最新成功：${esc(lastSuccess || "未记录")}</span>
    </div>
    <div class="erp-latest-grid">
      <div><span>商品资料</span><strong>${productCount} 条</strong><em>${productPages} 页</em></div>
      <div><span>库存快照</span><strong>${stockCount} 条</strong><em>${stockPages} 页</em></div>
      <div><span>可用库存</span><strong>${availableCount} 条</strong><em>${availableFile ? "已生成文件" : "未生成文件"}</em></div>
    </div>
    <div class="erp-latest-files">
      <strong>文件位置</strong>
      <span>商品：${esc(erpFileName(productFile))}</span>
      <span>库存：${esc(erpFileName(stockFile))}</span>
      <span>可用库存：${esc(erpFileName(availableFile))}</span>
    </div>
    ${stockNote}
  `;
}

function renderStoreOwners(assignments = state.storeOwners) {
  const input = $("#storeOwnerMapText");
  const rows = $("#storeOwnerRows");
  const items = assignments || [];
  const platformOptions = storeOwnerPlatformOptions(items);
  renderPlatformChips(platformOptions);
  if (input) {
    input.value = items.map((item) => [
      item.platform || "",
      item.store || "",
      item.owner || "",
      item.enabled === false ? "停用" : "启用",
      item.daily_required === false ? "不填" : "每日填报",
    ].join("，")).join("\n");
  }
  if (rows) {
    rows.innerHTML = items.map((item, index) => `
      <div class="store-owner-row" data-store-row="${index}">
        <label class="store-toggle" title="启用店铺">
          <input type="checkbox" data-field="enabled" ${item.enabled === false ? "" : "checked"} />
          <span>${item.enabled === false ? "停用" : "启用"}</span>
        </label>
        <label class="store-toggle" title="每日销量填报">
          <input type="checkbox" data-field="daily_required" ${item.daily_required === false ? "" : "checked"} />
          <span>${item.daily_required === false ? "不填" : "填报"}</span>
        </label>
        <select data-field="platform">
          ${platformOptions.map((platform) => `<option value="${esc(platform)}" ${platform === item.platform ? "selected" : ""}>${esc(platform)}</option>`).join("")}
        </select>
        <input data-field="store" value="${esc(item.store || "")}" placeholder="店铺名称" />
        <input data-field="owner" value="${esc(item.owner || "")}" placeholder="负责人" />
        <button class="tool-button" data-action="remove-store-row" data-index="${index}">移除</button>
      </div>
    `).join("");
    rows.querySelectorAll('[data-action="remove-store-row"]').forEach((button) => {
      button.addEventListener("click", () => {
        state.storeOwners.splice(Number(button.dataset.index), 1);
        renderStoreOwners();
      });
    });
    rows.querySelectorAll(".store-toggle input").forEach((input) => {
      input.addEventListener("change", () => {
        const label = input.closest(".store-toggle");
        const text = label?.querySelector("span");
        if (!text) return;
        text.textContent = input.dataset.field === "daily_required"
          ? (input.checked ? "填报" : "不填")
          : (input.checked ? "启用" : "停用");
      });
    });
  }
  const line = $("#storeOwnerStatus");
  if (line) {
    const dailyCount = items.filter((item) => item.enabled !== false && item.daily_required !== false).length;
    line.textContent = `已读取 ${items.length} 条店铺配置，其中 ${dailyCount} 条进入每日销量填报`;
  }
  renderOperatorOwnerOptions();
}

function storeOwnerPlatformOptions(assignments = state.storeOwners) {
  const platforms = [...BUILT_IN_PLATFORMS, ...(state.customPlatforms || [])];
  (assignments || []).forEach((item) => {
    const platform = String(item.platform || "").trim();
    if (platform) platforms.push(platform);
  });
  return Array.from(new Set(platforms));
}

function renderPlatformChips(platforms = storeOwnerPlatformOptions()) {
  const wrap = $("#platformChipList");
  if (!wrap) return;
  wrap.innerHTML = platforms.map((platform) => `<strong>${esc(platform)}</strong>`).join("");
}

function parseStoreOwnerText() {
  const text = $("#storeOwnerMapText")?.value || "";
  return text.split(/\n+/).map((line) => {
    const parts = line.split(/[,，\t]/).map((item) => item.trim());
    return {
      platform: parts[0] || "",
      store: parts[1] || "",
      owner: parts[2] || "",
      enabled: !["停用", "否", "0", "false"].includes(String(parts[3] || "").toLowerCase()),
      daily_required: !["不填", "否", "0", "false"].includes(String(parts[4] || "").toLowerCase()),
    };
  }).filter((item) => item.store && item.owner);
}

function collectStoreOwnerRows() {
  const rows = [...document.querySelectorAll("[data-store-row]")];
  if (!rows.length) return parseStoreOwnerText();
  return rows.map((row) => ({
    enabled: row.querySelector('[data-field="enabled"]')?.checked !== false,
    daily_required: row.querySelector('[data-field="daily_required"]')?.checked !== false,
    platform: row.querySelector('[data-field="platform"]')?.value.trim() || "",
    store: row.querySelector('[data-field="store"]')?.value.trim() || "",
    owner: row.querySelector('[data-field="owner"]')?.value.trim() || "",
  })).filter((item) => item.store && item.owner);
}

function validateStoreOwnerRows(assignments) {
  const storePlatforms = new Map();
  for (const item of assignments || []) {
    const store = String(item.store || "").trim();
    const platform = String(item.platform || "").trim();
    if (!platform) {
      throw new Error(`店铺“${store || "未填写"}”需要先选择平台`);
    }
    if (!store) continue;
    const existing = storePlatforms.get(store);
    if (existing && existing !== platform) {
      throw new Error(`店铺“${store}”已经归属平台“${existing}”，不能同时归属“${platform}”`);
    }
    storePlatforms.set(store, platform);
  }
}

function addPlatform() {
  const input = $("#newPlatformInput");
  const platform = input?.value.trim() || "";
  if (!platform) {
    showToast("请先输入平台名称");
    input?.focus();
    return;
  }
  const exists = storeOwnerPlatformOptions().some((item) => item.toLowerCase() === platform.toLowerCase());
  if (exists) {
    showToast(`平台已存在：${platform}`);
    input.value = "";
    return;
  }
  state.customPlatforms.push(platform);
  if (input) input.value = "";
  renderStoreOwners();
  showToast(`已新增平台：${platform}`);
}

function addStoreOwnerRow() {
  state.storeOwners.push({ platform: "Temu", store: "", owner: "", enabled: true, daily_required: true });
  renderStoreOwners();
  const rows = document.querySelectorAll("[data-store-row]");
  const last = rows[rows.length - 1];
  last?.querySelector('[data-field="store"]')?.focus();
}

async function loadStoreOwners() {
  const operator = currentOperator();
  if (operator.role === "owner") {
    const owned = (state.sales?.entries || [])
      .filter((item) => !operator.user || item.owner === operator.user)
      .map((item) => ({
        platform: item.platform,
        store: item.store,
        owner: item.owner || operator.user,
        enabled: true,
        daily_required: true,
      }))
      .filter((item) => item.platform && item.store);
    const seen = new Set();
    state.storeOwners = owned.filter((item) => {
      const key = `${item.platform}::${item.store}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    state.customPlatforms = storeOwnerPlatformOptions(state.storeOwners).filter((platform) => !BUILT_IN_PLATFORMS.includes(platform));
    renderOperatorOwnerOptions();
    renderBargainStoreOptions();
    const input = $("#storeOwnerMapText");
    const rows = $("#storeOwnerRows");
    const line = $("#storeOwnerStatus");
    if (input) input.value = (state.storeOwners || []).map((item) => `${item.platform}，${item.store}，${item.owner}`).join("\n") || "未读取到你负责的店铺。";
    if (rows) {
      rows.innerHTML = `
        <div class="action-empty">
          <div>
            <strong>只显示你负责的店铺</strong>
            <span>这里不能修改负责人配置；如果缺店铺，请让管理员在基础资料里分配。</span>
          </div>
        </div>
      `;
    }
    if (line) line.textContent = `已读取 ${state.storeOwners.length} 个负责店铺`;
    return;
  }
  const result = await api.storeOwners(operatorPayload());
  state.storeOwners = result.assignments || [];
  state.customPlatforms = storeOwnerPlatformOptions(state.storeOwners).filter((platform) => !BUILT_IN_PLATFORMS.includes(platform));
  renderOperatorOwnerOptions();
  renderBargainStoreOptions();
  renderStoreOwners();
}

async function saveStoreOwners() {
  const operator = currentOperator();
  if (operator.role === "owner") {
    showToast("负责人配置需要管理员维护");
    return;
  }
  const assignments = collectStoreOwnerRows();
  try {
    validateStoreOwnerRows(assignments);
    const result = await api.saveStoreOwners(operatorPayload({ assignments }));
    state.storeOwners = result.assignments || [];
    renderStoreOwners();
    await loadSales(false);
    await loadImportMatrix(false);
    showToast(`负责人配置已保存：${state.storeOwners.length} 条；已补齐 ${result.assigned_existing || 0} 条未分配任务`);
  } catch (error) {
    const message = userFacingError(error);
    const line = $("#storeOwnerStatus");
    if (line) line.textContent = message;
    showToast(message);
  }
}

async function loadOperatorAccounts(showMessage = false) {
  const operator = currentOperator();
  if (operator.role === "owner") {
    state.operatorAccounts = [];
    renderOperatorAccounts();
    return;
  }
  try {
    const result = await api.operatorAccounts(operatorPayload());
    state.operatorAccounts = result.accounts || [];
    renderOperatorAccounts();
    if (showMessage) showToast("店长账号已刷新");
  } catch (error) {
    state.operatorAccounts = [];
    renderOperatorAccounts(userFacingError(error));
  }
}

function renderOperatorAccounts(error = "") {
  const box = $("#operatorAccountRows");
  if (!box) return;
  if (error) {
    box.innerHTML = `<div class="action-empty"><strong>账号读取失败</strong><span>${esc(error)}</span></div>`;
    return;
  }
  if (!state.operatorAccounts.length) {
    box.innerHTML = `<div class="action-empty"><strong>暂无店长账号</strong><span>导入负责人表后会自动生成账号。</span></div>`;
    return;
  }
  box.innerHTML = state.operatorAccounts.map((account) => `
    <div class="output-row">
      <div>
        <strong>${esc(account.owner || account.username)}</strong>
        <p>账号：${esc(account.username)} · ${account.enabled === false ? "停用" : "启用"}</p>
      </div>
      <button class="ghost-button" data-reset-account="${esc(account.username)}">重置密码</button>
    </div>
  `).join("");
  box.querySelectorAll("[data-reset-account]").forEach((button) => {
    button.addEventListener("click", () => resetOperatorPassword(button.dataset.resetAccount));
  });
}

async function createOperatorAccount() {
  const owner = $("#newOperatorOwner")?.value.trim() || "";
  const username = $("#newOperatorUsername")?.value.trim() || owner;
  const password = $("#newOperatorPassword")?.value.trim() || "";
  if (!owner) {
    showToast("请先填写店长姓名");
    $("#newOperatorOwner")?.focus();
    return;
  }
  try {
    const result = await api.createOperatorAccount(operatorPayload({ owner, username, password }));
    state.operatorAccounts = result.accounts || [];
    renderOperatorAccounts();
    $("#newOperatorOwner").value = "";
    $("#newOperatorUsername").value = "";
    $("#newOperatorPassword").value = "";
    showToast(`账号已新增：${result.username}，初始密码：${result.initial_password}`);
  } catch (error) {
    showToast(userFacingError(error));
  }
}

async function resetOperatorPassword(username) {
  try {
    const result = await api.resetOperatorPassword(operatorPayload({ username }));
    showToast(`新密码：${result.initial_password}`);
    const status = $("#masterImportStatus");
    if (status) status.textContent = `${username} 的新密码：${result.initial_password}`;
    await loadOperatorAccounts(false);
  } catch (error) {
    showToast(userFacingError(error));
  }
}

function renderProductInfoRows(result = {}) {
  const table = $("#productSearchTable");
  const status = $("#productSearchStatus");
  if (!table) return;
  const items = result.items || [];
  const columns = result.columns || ["货品编码", "货品名称", "规格名称", "商家编码（新）", "可销库存", "批发价", "成本价", "零售价", "商品资料修改时间", "库存修改时间", "来源接口"];
  const sourceFiles = result.source_files || [];
  if (status) {
    const sourceText = sourceFiles.length ? `来源：${sourceFiles.slice(0, 3).join("、")}` : "未读取到 ERP 商品基础信息文件";
    status.textContent = `查询到 ${items.length} 条商品信息。${sourceText}`;
  }
  if (!items.length) {
    table.innerHTML = `<tbody><tr><td class="empty-table-cell">没有匹配商品。请换货品编码、商家编码或商品名再查；如果没有来源文件，请先在系统设置里同步 ERP。</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead><tr>${columns.map((column) => `<th>${esc(column)}</th>`).join("")}</tr></thead>
    <tbody>
      ${items.map((item) => {
        const record = item.record || item.summary || {};
        return `<tr>${columns.map((column) => {
          const value = record[column] || "";
          const numeric = ["可销库存", "批发价", "成本价", "零售价"].includes(column);
          return `<td class="${numeric ? "num" : ""}" title="${esc(value)}">${esc(value || "-")}</td>`;
        }).join("")}</tr>`;
      }).join("")}
    </tbody>
  `;
}

async function loadProductInfo() {
  const productCode = $("#productCodeFilter")?.value.trim() || "";
  const merchantCode = $("#merchantCodeFilter")?.value.trim() || "";
  const productName = $("#productNameFilter")?.value.trim() || "";
  const status = $("#productSearchStatus");
  try {
    const hasFilter = productCode || merchantCode || productName;
    if (status) status.textContent = hasFilter ? "正在查询 ERP 商品信息..." : "正在读取最新 ERP 商品信息...";
    const result = await api.erpProductInfo(operatorPayload({
      product_code: productCode,
      merchant_code: merchantCode,
      product_name: productName,
      limit: 200,
    }));
    state.productInfo = result.items || [];
    renderProductInfoRows(result);
  } catch (error) {
    if (status) status.textContent = userFacingError(error);
    showToast(userFacingError(error));
  }
}

const queryProductInfo = loadProductInfo;

async function chooseWorkbookPath(inputSelector, title) {
  const paths = await api.selectFiles({ name: title || "表格文件" });
  if (!paths || !paths.length) return "";
  const input = $(inputSelector);
  if (input) input.value = paths[0];
  return paths[0];
}

async function importOwnerMaster() {
  const path = $("#ownerMasterPath")?.value.trim() || "";
  if (!path) {
    showToast("请先选择店铺负责人表");
    return;
  }
  const status = $("#masterImportStatus");
  try {
    if (status) status.textContent = "正在导入负责人和生成账号...";
    const result = await api.importOwnerMaster(operatorPayload({ path }));
    const passwords = Object.entries(result.initial_passwords || {}).map(([user, password]) => `${user}:${password}`).join("；");
    const passwordText = passwords ? `；初始密码 ${passwords}` : "";
    if (status) status.textContent = `负责人 ${result.assignment_count || 0} 条，账号 ${result.account_count || 0} 个；整理表：${result.review_file}${passwordText}`;
    await loadStoreOwners();
    await loadOperatorAccounts(false);
    showToast("负责人和账号已导入");
  } catch (error) {
    const message = userFacingError(error);
    if (status) status.textContent = message;
    showToast(message);
  }
}

async function importSalesHistory() {
  const path = $("#salesHistoryPath")?.value.trim() || "";
  if (!path) {
    showToast("请先选择跨境运营总表");
    return;
  }
  const status = $("#masterImportStatus");
  try {
    if (status) status.textContent = "正在导入历史销量...";
    const result = await api.importSalesHistory(operatorPayload({ path }));
    if (status) status.textContent = `历史销量新增 ${result.created || 0} 条，跳过已有 ${result.skipped_existing || 0} 条；整理表：${result.review_file}`;
    await loadSales(false);
    await loadSalesReport(false);
    showToast("历史销量已导入");
  } catch (error) {
    const message = userFacingError(error);
    if (status) status.textContent = message;
    showToast(message);
  }
}

function collectRules() {
  const next = structuredClone(state.rules || {});
  document.querySelectorAll("[data-rule]").forEach((input) => {
    const parts = input.dataset.rule.split(".");
    const section = parts.length > 1 ? parts[0] : "sales_thresholds";
    const key = parts.length > 1 ? parts[1] : parts[0];
    next[section] = next[section] || {};
    const text = input.value.trim();
    if (key === "keywords" || key.endsWith("_order")) {
      next[section][key] = text.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    } else if (/^\d+(\.\d+)?$/.test(text)) {
      next[section][key] = Number(text);
    } else {
      next[section][key] = text;
    }
  });
  next.erp_api = collectErpSettings(next.erp_api || {});
  return next;
}

function collectErpSettings(current = {}) {
  const next = { ...current };
  const erpDefaults = {
    provider: "旺店通",
    environment: "prod",
    base_url: "https://openapi.huice.com/openapi",
    warehouse_no: "3",
    warehouse_name: "宠物圈仓",
    sync_days: 30,
    page_size: 500,
    stock_limit: 10000,
    max_pages: 1000,
    product_endpoint: "goods_query.php",
    stock_endpoint: "stock_query.php",
    available_stock_endpoint: "api_goods_stock_change_query.php",
    shop_endpoint: "shop_query.php",
    platform_goods_endpoint: "vip_api_goods_query.php",
    sales_outbound_endpoint: "sales_trade_query.php",
  };
  document.querySelectorAll("[data-erp-field]").forEach((input) => {
    const key = input.dataset.erpField;
    if (input.type === "checkbox") {
      next[key] = input.checked;
    } else if (key === "sync_scope") {
      next[key] = input.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    } else if (input.type === "number") {
      next[key] = input.value.trim() ? Number(input.value) : (erpDefaults[key] ?? "");
    } else {
      next[key] = input.value.trim() || erpDefaults[key] || "";
    }
  });
  return next;
}

function validateErpSettings(settings = collectErpSettings(state.rules?.erp_api || {})) {
  const missing = [];
  if (!settings.provider) missing.push("接口服务商");
  if (!settings.base_url) missing.push("接口地址");
  if (settings.enabled || settings.auto_sync) {
    [
      ["app_key", "AppKey"],
      ["app_secret", "AppSecret"],
      ["sid", "SID"],
    ].forEach(([key, label]) => {
      if (!settings[key]) missing.push(label);
    });
    if ((settings.sync_sales_outbound || settings.sync_shop_query) && !settings.shop_id && !settings.shop_no) {
      missing.push("店铺ID");
    }
    if (!settings.warehouse_no && !settings.warehouse_name) missing.push("仓库编码或仓库名称");
  }
  return missing;
}

function erpHumanMessage(rawMessage = "") {
  const text = String(rawMessage || "").trim();
  const lower = text.toLowerCase();
  if (!text) return "ERP 同步失败：接口没有返回明确原因，请检查 AppSecret、SID、AppKey 和接口地址。";
  if (lower.includes("appsecret") || lower.includes("secret") || lower.includes("sign") || lower.includes("签名")) {
    return "ERP 同步失败：AppSecret 或签名不正确，请复制旺店通开放平台“正式授权管理”里已上线应用的密钥。";
  }
  if (lower.includes("sid") || lower.includes("卖家账号")) {
    return "ERP 同步失败：SID 不正确，请填写开放平台已上线应用这一行的卖家账号。";
  }
  if (lower.includes("appkey") || lower.includes("app_key")) {
    return "ERP 同步失败：AppKey 不正确，请填写开放平台已上线应用这一行的接口账号。";
  }
  if (lower.includes("warehouse") || lower.includes("仓库")) {
    return "ERP 同步失败：仓库编码不正确，请检查旺店通仓库信息维护里的仓库编号。";
  }
  if (lower.includes("base_url") || lower.includes("url") || lower.includes("404") || lower.includes("network") || lower.includes("timeout") || lower.includes("连接")) {
    return "ERP 同步失败：接口地址或网络连接异常，请确认正式环境地址填写正确。";
  }
  if (lower.includes("permission") || lower.includes("权限") || lower.includes("未授权")) {
    return "ERP 同步失败：当前应用缺少接口权限，请在开放平台给已上线应用新增对应接口权限。";
  }
  return `ERP 同步失败：${text}`;
}

function setErpStatus(stateName, title, message, detail = "") {
  const box = $("#erpSyncResult");
  const titleEl = $("#erpSyncResultTitle");
  const status = $("#erpSettingsStatus");
  const details = $("#erpSyncTechnicalDetails");
  const detailText = $("#erpSyncTechnicalText");
  if (box) box.dataset.state = stateName || "idle";
  if (titleEl) titleEl.textContent = title || "ERP 设置状态";
  if (status) {
    status.textContent = message || "";
    status.className = stateName === "failed" ? "status danger" : "status";
  }
  if (details && detailText) {
    const hasDetail = Boolean(detail && String(detail).trim());
    details.classList.toggle("hidden", !hasDetail);
    detailText.textContent = hasDetail ? String(detail) : "";
    if (!hasDetail) details.removeAttribute("open");
  }
}

async function saveErpSettings() {
  const next = structuredClone(state.rules || {});
  next.erp_api = collectErpSettings(next.erp_api || {});
  const missing = validateErpSettings(next.erp_api);
  if (missing.length) {
    const message = `ERP 设置缺少：${missing.join("、")}`;
    setErpStatus("failed", "保存失败", message);
    showToast(message);
    return;
  }
  state.rules = await api.saveRules(operatorPayload({ rules: next }));
  renderRules();
  setErpStatus("success", "ERP 设置已保存", "配置已保存。可以继续点击“按选择同步 ERP”检查接口是否可用。");
  showToast("ERP 设置已保存");
}

function testErpSettings() {
  const settings = collectErpSettings(state.rules?.erp_api || {});
  const missing = validateErpSettings(settings);
  if (missing.length) {
    const message = `本地校验未通过：缺少 ${missing.join("、")}`;
    setErpStatus("failed", "本地校验未通过", message);
    showToast(message);
    return;
  }
  const scope = [
    settings.sync_product_archive !== false ? "货品档案" : "",
    settings.sync_stock_snapshot !== false ? "库存快照" : "",
    settings.sync_available_stock ? "可用库存" : "",
    settings.sync_shop_query ? "店铺" : "",
    settings.sync_platform_goods ? "平台货品" : "",
    settings.sync_sales_outbound ? "销售出库单" : "",
  ].filter(Boolean).join("、") || "未选择同步内容";
  const warehouse = settings.warehouse_name || settings.warehouse_no || "未指定仓库";
  const environment = settings.environment === "prod" ? "正式环境" : "测试环境";
  const message = `本地校验通过：${settings.provider || "旺店通"}，${environment}，${settings.auto_sync ? "自动同步开启" : "手动同步为主"}，仓库：${warehouse}，范围：${scope}`;
  setErpStatus("success", "本地校验通过", message);
  showToast("ERP 本地校验通过");
}

async function manualErpSync() {
  const next = structuredClone(state.rules || {});
  next.erp_api = collectErpSettings(next.erp_api || {});
  const missing = validateErpSettings({ ...next.erp_api, enabled: true });
  if (missing.length) {
    const message = `ERP 同步缺少：${missing.join("、")}`;
    setErpStatus("failed", "同步前检查未通过", message);
    showToast(message);
    return;
  }
  try {
    const scopes = [
      next.erp_api.sync_product_archive !== false ? "货品档案" : "",
      next.erp_api.sync_stock_snapshot !== false ? "库存快照" : "",
      next.erp_api.sync_available_stock ? "可用库存" : "",
      next.erp_api.sync_shop_query ? "店铺" : "",
      next.erp_api.sync_platform_goods ? "平台货品" : "",
      next.erp_api.sync_sales_outbound ? "销售出库单" : "",
    ].filter(Boolean).join("、");
    if (!scopes) {
      const message = "请至少选择一个 ERP 拉取内容";
      setErpStatus("failed", "同步前检查未通过", message);
      showToast(message);
      return;
    }
    setErpStatus("running", "正在同步 ERP", `正在同步：${scopes}。结果会直接显示在这里。`);
    state.rules = await api.saveRules(operatorPayload({ rules: next }));
    const result = await api.erpSync(operatorPayload());
    state.rules = await api.loadRules(operatorPayload());
    renderRules();
    if (result.status === "blocked") {
      const message = result.message || "ERP 正在同步中，请稍后再试";
      setErpStatus("running", "ERP 同步未开始", message);
      showToast(message);
      return;
    }
    if (result.status && result.status !== "synced") {
      const detail = result.message || `ERP 返回状态：${result.status}`;
      const message = erpHumanMessage(detail);
      setErpStatus("failed", "ERP 同步未完成", message, detail);
      showToast(message);
      return;
    }
    const pages = `商品 ${result.product_pages || 0} 页、库存 ${result.stock_pages || 0} 页`;
    const warnings = (result.warnings || []).length ? `；提醒：${result.warnings.join("；")}` : "";
    const message = `${result.message || "ERP 同步完成"}；${pages}${warnings}`;
    setErpStatus("success", "ERP 同步完成", message);
    showToast(message);
  } catch (error) {
    const detail = error?.stack || error?.message || "ERP 同步失败";
    const message = erpHumanMessage(error?.message || detail);
    setErpStatus("failed", "ERP 同步失败", message, detail);
    showToast(message);
  }
}

async function createBackup() {
  const status = $("#backupStatus");
  try {
    if (status) status.textContent = "正在生成备份...";
    const result = await api.createBackup(operatorPayload());
    if (status) status.textContent = `备份已生成：${result.path || result.file}，共 ${result.count || 0} 个文件。`;
    showToast("备份已生成");
  } catch (error) {
    if (status) status.textContent = error.message || "生成备份失败";
    showToast(error.message || "生成备份失败");
  }
}

async function exportAssetArchive() {
  const status = $("#assetArchiveStatus");
  try {
    const result = await api.exportAssetArchive(operatorPayload());
    if (status) status.textContent = `重要资产存档已导出：${result.file || result.path}，共 ${result.rows || 0} 条。`;
    showToast("重要资产存档已导出");
  } catch (error) {
    if (status) status.textContent = userFacingError(error) || "导出重要资产失败";
    showToast(userFacingError(error) || "导出重要资产失败");
  }
}

async function importAssetArchive() {
  const status = $("#assetArchiveStatus");
  const path = $("#assetArchivePath")?.value.trim() || "";
  if (!path) {
    showToast("请先填写重要资产存档路径");
    $("#assetArchivePath")?.focus();
    return;
  }
  try {
    const result = await api.importAssetArchive(operatorPayload({ path }));
    await loadAssetOverview(false);
    if (status) status.textContent = `重要资产初始化导入完成：${result.file || path}，共 ${result.rows || 0} 条。`;
    showToast("重要资产初始化导入完成");
  } catch (error) {
    if (status) status.textContent = userFacingError(error) || "导入重要资产失败";
    showToast(userFacingError(error) || "导入重要资产失败");
  }
}

function renderBackupReminder() {
  const status = $("#backupStatus");
  const reminder = state.status?.backup_reminder || {};
  if (!status || !reminder.message) return;
  status.textContent = reminder.message;
}

async function selectBackupFile() {
  try {
    if (!api.selectBackup) return;
    const path = await api.selectBackup();
    if (!path) return;
    const input = $("#restoreBackupPath");
    if (input) input.value = path;
    const status = $("#backupStatus");
    if (status) status.textContent = `已选择备份文件：${path}`;
  } catch (error) {
    showToast(error.message || "选择备份文件失败");
  }
}

async function restoreBackup() {
  const status = $("#backupStatus");
  const path = $("#restoreBackupPath")?.value.trim() || "";
  if (!path) {
    showToast("请先填写备份文件路径");
    $("#restoreBackupPath")?.focus();
    return;
  }
  openTaskDialog({
    pill: "恢复备份",
    title: "确认恢复这份备份？",
    description: "恢复会覆盖当前运营状态和数据源。确认后系统会立即执行。",
    contextHtml: `<strong>${esc(fileBaseName(path))}</strong><p>${esc(path)}</p>`,
    submitLabel: "确认恢复",
    fields: [],
    onSubmit: async () => {
      try {
        if (status) status.textContent = "正在恢复备份...";
        const result = await api.restoreBackup(operatorPayload({ path }));
        if (status) status.textContent = `恢复完成：${result.count || 0} 个文件。`;
        await refreshAll();
        showToast("备份已恢复");
      } catch (error) {
        if (status) status.textContent = error.message || "恢复备份失败";
        throw error;
      }
    },
  });
}

async function runDoctorCheck() {
  const resultBox = $("#doctorResult");
  const button = $("#runDoctorBtn");
  try {
    if (button) button.disabled = true;
    if (resultBox) {
      resultBox.className = "check-result running";
      resultBox.innerHTML = "<strong>正在检查...</strong><span>会检查运行环境、界面绑定、角色权限、核心接口和业务测试。</span>";
    }
    const result = await api.runDoctor(operatorPayload());
    const output = result?.output || "检查通过";
    if (resultBox) {
      resultBox.className = "check-result ok";
      resultBox.innerHTML = `<strong>检查通过</strong><span>${esc(output).replace(/\n/g, "<br />")}</span>`;
    }
    showToast("系统运行检查通过");
  } catch (error) {
    const message = userFacingError(error);
    if (resultBox) {
      resultBox.className = "check-result danger";
      resultBox.innerHTML = `<strong>检查未通过</strong><span>${esc(message).replace(/\n/g, "<br />")}</span>`;
    }
    showToast("系统运行检查未通过");
  } finally {
    if (button) button.disabled = false;
  }
}

async function runReadyCheck() {
  const resultBox = $("#readyCheckResult");
  const button = $("#runReadyCheckBtn");
  try {
    if (button) button.disabled = true;
    if (resultBox) {
      resultBox.className = "check-result running";
      resultBox.innerHTML = "<strong>正在交付检查...</strong><span>会检查功能自检、依赖安全和 git 提交范围。</span>";
    }
    const result = await api.runReadyCheck(operatorPayload());
    const output = result?.output || "交付检查通过";
    if (resultBox) {
      resultBox.className = "check-result ok";
      resultBox.innerHTML = `<strong>交付检查通过</strong><span>${esc(output).replace(/\n/g, "<br />")}</span>`;
    }
    showToast("交付检查通过");
  } catch (error) {
    const message = userFacingError(error);
    if (resultBox) {
      resultBox.className = "check-result danger";
      resultBox.innerHTML = `<strong>交付检查未通过</strong><span>${esc(message).replace(/\n/g, "<br />")}</span>`;
    }
    showToast("交付检查未通过");
  } finally {
    if (button) button.disabled = false;
  }
}

function formatSize(value) {
  const size = Number(value || 0);
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function taskSyncSummary(sync) {
  const summary = sync || {};
  return `新增任务 ${summary.created || 0} 条，更新任务 ${summary.updated || 0} 条，自动归档 ${summary.archived || 0} 条，导入明细 ${summary.imported_rows || 0} 行`;
}

function reportTaskSummary(reportId) {
  const item = state.reportTasks?.[reportId] || {};
  const status = item.by_status || {};
  return `已生成任务 ${item.total || 0} 条，待店长 ${status["待店长处理"] || 0} 条，待确认 ${status["待管理员审核"] || 0} 条`;
}

function reportTaskBadges(reportId) {
  const item = state.reportTasks?.[reportId] || {};
  const status = item.by_status || {};
  const badges = [
    ["任务", item.total || 0],
    ["待店长", status["待店长处理"] || 0],
    ["待确认", status["待管理员审核"] || 0],
  ];
  return `<div class="queue-task-badges">${badges.map(([label, value]) => `<span class="queue-task-badge">${label} ${value}</span>`).join("")}</div>`;
}

function bargainComputedRisk(row) {
  const price = Number(row["本次议价"] || 0);
  const cost = Number(row["成本价"] || 0);
  const wholesale = Number(row["批发价"] || 0);
  const tags = [];
  if (!cost) tags.push("ERP成本缺失");
  if (!wholesale) tags.push("ERP批发价缺失");
  if (price && cost && price < cost) tags.push("低于成本");
  if (price && wholesale && price < wholesale * 0.8) tags.push("低于批发价80%");
  (row["风险标签"] || "").split("、").filter(Boolean).forEach((tag) => {
    if (!tags.includes(tag)) tags.push(tag);
  });
  let level = row["风险等级"] || "green";
  if (tags.includes("低于成本") || tags.includes("低于批发价80%")) level = row["清仓款"] ? "orange" : "red";
  else if (tags.length || level === "review") level = "review";
  const text = tags.length ? tags.join("、") : (row["清仓款"] ? "清仓款" : "正常");
  return { level, text };
}

function bargainRiskClass(level) {
  if (level === "red") return "status-danger";
  if (level === "orange" || level === "review") return "status-warn";
  return "status-ok";
}

function renderBargainStoreOptions() {
  const select = $("#bargainStore");
  if (!select) return;
  const platform = $("#bargainPlatform")?.value || "Temu";
  const operator = currentOperator();
  const stores = (state.storeOwners || [])
    .filter((item) => item.enabled !== false)
    .filter((item) => !platform || item.platform === platform)
    .filter((item) => operator.role !== "owner" || item.owner === operator.user)
    .map((item) => item.store)
    .filter(Boolean);
  const unique = Array.from(new Set(stores));
  const current = select.value;
  select.innerHTML = `<option value="">选择店铺</option>${unique.map((store) => `<option value="${esc(store)}">${esc(store)}</option>`).join("")}`;
  if (unique.includes(current)) select.value = current;
}

function bargainPriceRatio(row) {
  const price = Number(row["本次议价"] || 0);
  const wholesale = Number(row["批发价"] || 0);
  if (!price || !wholesale) return "";
  return `${(price / wholesale * 100).toFixed(2)}%`;
}

function updateBargainRiskCells(index) {
  const row = state.bargainDraft[index];
  if (!row) return;
  const ratioCell = document.querySelector(`[data-bargain-ratio="${index}"]`);
  if (ratioCell) ratioCell.textContent = bargainPriceRatio(row);
  const riskCell = document.querySelector(`[data-bargain-risk="${index}"]`);
  if (riskCell) {
    const risk = bargainComputedRisk(row);
    riskCell.innerHTML = `<span class="status-pill ${bargainRiskClass(risk.level)}">${esc(risk.text)}</span>`;
  }
}

function syncBargainPriceToGoods(index) {
  const source = state.bargainDraft[index];
  if (!source || !source["本次议价"]) {
    showToast("请先填写当前尺码的本次议价");
    return;
  }
  const goodsCode = source["货品编码"];
  state.bargainDraft.forEach((row) => {
    if (row["货品编码"] === goodsCode) row["本次议价"] = source["本次议价"];
  });
  renderBargainDraft();
  showToast("已同步到本款全部尺码，可继续单独修改");
}

function renderBargainDraft() {
  const body = $("#bargainDraftRows");
  if (!body) return;
  const rows = state.bargainDraft || [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="16" class="empty-table-cell">输入商家编码后，系统会把同一货品编码下所有尺码放到这里。</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row, index) => {
    const risk = bargainComputedRisk(row);
    return `
    <tr>
      <td>${esc(row["货品名称"] || "")}</td>
      <td>${esc(row["议价申请店铺"] || "")}</td>
      <td>${esc(row["卖得最好的店铺"] || "")}</td>
      <td>${esc(row["卖得最好店铺30天销量"] || 0)}</td>
      <td>${esc(row["尺码"] || "")}</td>
      <td>${esc(row["商家编码"] || "")}</td>
      <td><input class="inline-price" data-bargain-price="${index}" value="${esc(row["本次议价"] || "")}" /></td>
      <td>${esc(row["成本价"] || "")}</td>
      <td data-bargain-ratio="${index}">${esc(bargainPriceRatio(row))}</td>
      <td>${esc(row["同款在售链接数"] || row["在线销售链接数"] || 0)}</td>
      <td>${esc(row["在线销售链接数"] || 0)}</td>
      <td>${esc(row["在售最低申报价"] || "")}</td>
      <td>${esc(row["Temu 30天最高销量"] || 0)}</td>
      <td>${esc(row["Shein 30天最高销量"] || 0)}</td>
      <td data-bargain-risk="${index}"><span class="status-pill ${bargainRiskClass(risk.level)}">${esc(risk.text)}</span></td>
      <td><button class="tool-button" data-sync-bargain-price="${index}">同步到本款全部尺码</button></td>
    </tr>
  `;
  }).join("");
  body.querySelectorAll("[data-bargain-price]").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.bargainPrice);
      if (state.bargainDraft[index]) {
        state.bargainDraft[index]["本次议价"] = input.value.trim();
        updateBargainRiskCells(index);
      }
    });
  });
  body.querySelectorAll("[data-sync-bargain-price]").forEach((button) => {
    button.addEventListener("click", () => syncBargainPriceToGoods(Number(button.dataset.syncBargainPrice)));
  });
}

function openBargainHistoryDialog(tab = "history") {
  const dialog = $("#bargainHistoryDialog");
  if (!dialog) return;
  state.bargainTab = tab;
  $("#bargainPage")?.classList.add("subpage-open");
  dialog.classList.remove("hidden");
  dialog.setAttribute("aria-hidden", "false");
  renderBargainTabs();
  renderBargainHistory();
  if (tab === "history") loadBargainHistory(false);
  if (tab === "pending") loadBargainHistory(false);
  if (tab === "clearance") loadBargainClearance(false);
  dialog.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeBargainHistoryDialog() {
  const dialog = $("#bargainHistoryDialog");
  if (!dialog) return;
  $("#bargainPage")?.classList.remove("subpage-open");
  dialog.classList.add("hidden");
  dialog.setAttribute("aria-hidden", "true");
}

function renderBargainHistory() {
  const wrap = $("#bargainHistoryRows");
  if (!wrap) return;
  const title = $("#bargainHistoryTitle");
  const hint = $("#bargainHistoryHint");
  const titles = {
    pending: "待审核议价",
    history: "议价历史",
    clearance: "清仓款式",
    lowprice: "低价回追",
  };
  const hints = {
    pending: "宽屏表格处理待管理员审核的议价，支持平台、店铺、申请人和风险筛选，也支持批量通过或拒绝。",
    history: "管理员看全部；店长只看自己提交的数据。",
    clearance: "集中查看清仓款式，不占用议价录入区。",
    lowprice: "集中检查低于成本、低于批发价 80% 或继续下探的低价风险，屏蔽项也按紧凑表格展示。",
  };
  if (title) title.textContent = titles[state.bargainTab] || "议价历史";
  if (hint) hint.textContent = hints[state.bargainTab] || hints.history;
  if (state.bargainTab === "lowprice") {
    renderBargainLowPriceTrace();
    return;
  }
  if (state.bargainTab === "clearance") {
    const rows = state.bargainClearance?.rows || [];
    if (!rows.length) {
      wrap.innerHTML = actionEmpty({ title: "暂无清仓款式", body: "点击重建清仓款式，从 ERP 商品基础表中识别货品分类包含清仓的款式。", primary: "重建清仓款式", page: "bargain" });
      return;
    }
    wrap.innerHTML = rows.slice(0, 120).map((row) => `
      <div class="output-row"><div><strong>${esc(row["货品编码"] || "")} · ${esc(row["货品名称"] || "")}</strong><p>${esc(row["商家编码"] || "")}　${esc(row["尺码"] || "")}　${esc(row["清仓分类"] || "")}</p></div></div>
    `).join("");
    return;
  }
  if (state.bargainTab === "pending") {
    renderBargainPendingTable(wrap);
    return;
  }
  const rows = state.bargainHistory || [];
  if (!rows.length) {
    wrap.innerHTML = actionEmpty({ title: "暂无议价记录", body: "店长提交议价后，审批记录会显示在这里。", primary: "新增议价", page: "bargain" });
    bindEmptyActions(wrap);
    return;
  }
  wrap.innerHTML = rows.slice(0, 120).map((row) => {
    const canReview = currentOperator().role !== "owner" && row.status === "待管理员审核";
    return `
      <div class="output-row bargain-history-row">
        <div>
          <strong>${canReview ? `<input type="checkbox" class="bargain-review-check" data-bargain-line="${esc(row.id)}" data-bargain-batch="${esc(row.batch_id)}" /> ` : ""}${esc(row["货品名称"] || row["货品编码"] || "")} · ${esc(row["商家编码"] || "")}</strong>
          <p>${esc(row.platform || row["平台"] || "")} / ${esc(row.store || row["店铺"] || "")}　提交价：${esc(row.submitted_price || row["本次议价"] || "")}　版本：${esc(row.version || 1)}</p>
          <p>状态：${esc(row.status || "")}　备注：${esc(row.review_remark || "-")}</p>
        </div>
        ${canReview ? `<div class="task-actions"><input class="inline-remark" data-bargain-remark="${esc(row.id)}" placeholder="拒绝原因 / 备注可选" /><button class="tool-button primary-mini" data-bargain-review="通过" data-line="${esc(row.id)}" data-batch="${esc(row.batch_id)}">通过</button><button class="tool-button danger-mini" data-bargain-review="不通过" data-line="${esc(row.id)}" data-batch="${esc(row.batch_id)}">不通过</button></div>` : ""}
      </div>
    `;
  }).join("");
  wrap.querySelectorAll("[data-bargain-review]").forEach((button) => {
    button.addEventListener("click", () => reviewBargainLine(button.dataset.batch, button.dataset.line, button.dataset.bargainReview));
  });
}

function bargainRiskLabel(row) {
  return row["风险标签"] || (row["风险等级"] === "red" ? "高风险" : "正常");
}

function renderBargainPendingTable(wrap) {
  const rows = (state.bargainHistory || []).filter((row) => row.status === "待管理员审核");
  if (!rows.length) {
    wrap.innerHTML = `<div class="action-empty"><div><strong>暂无待审核议价</strong><span>当前筛选下没有需要管理员处理的议价。</span></div></div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="report-table-wrap bargain-review-wrap">
      <table class="report-data-table bargain-review-table">
        <thead><tr>
          <th><input type="checkbox" id="bargainSelectAllTable" /></th><th>申请人</th><th>平台</th><th>申请店铺</th><th>货品名称</th><th>尺码</th><th>商家编码</th><th>本次议价</th><th>成本价</th><th>批发价占比</th><th>风险</th><th>卖得最好店铺</th><th>最好店30天销量</th><th>同款链接</th><th>最低申报价</th><th>Temu 30天</th><th>Shein 30天</th><th>提交时间</th><th>拒绝理由/备注</th><th>操作</th>
        </tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td><input type="checkbox" class="bargain-review-check" data-bargain-line="${esc(row.id)}" data-bargain-batch="${esc(row.batch_id)}" /></td>
              <td>${esc(row.owner || "")}</td>
              <td>${esc(row.platform || row["平台"] || "")}</td>
              <td>${esc(row.store || row["议价申请店铺"] || "")}</td>
              <td>${esc(row["货品名称"] || "")}</td>
              <td>${esc(row["尺码"] || "")}</td>
              <td>${esc(row["商家编码"] || "")}</td>
              <td>${esc(row.submitted_price || row["本次议价"] || "")}</td>
              <td>${esc(row["成本价"] || "")}</td>
              <td>${esc(row["建议申报价/批发价占比"] || "")}${row["建议申报价/批发价占比"] ? "%" : ""}</td>
              <td><span class="status-pill ${bargainRiskClass(row["风险等级"] || "green")}">${esc(bargainRiskLabel(row))}</span></td>
              <td>${esc(row["卖得最好的店铺"] || "")}</td>
              <td>${esc(row["卖得最好店铺30天销量"] || 0)}</td>
              <td>${esc(row["同款在售链接数"] || row["在线销售链接数"] || 0)}</td>
              <td>${esc(row["在售最低申报价"] || row["同款最低申报价"] || "")}</td>
              <td>${esc(row["Temu 30天最高销量"] || 0)}</td>
              <td>${esc(row["Shein 30天最高销量"] || 0)}</td>
              <td>${esc(row.submitted_at || "")}</td>
              <td><input class="inline-remark" data-bargain-remark="${esc(row.id)}" placeholder="可空" /></td>
              <td><button class="tool-button primary-mini" data-bargain-review="通过" data-line="${esc(row.id)}" data-batch="${esc(row.batch_id)}">通过</button><button class="tool-button danger-mini" data-bargain-review="不通过" data-line="${esc(row.id)}" data-batch="${esc(row.batch_id)}">拒绝</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  $("#bargainSelectAllTable")?.addEventListener("change", (event) => {
    wrap.querySelectorAll(".bargain-review-check").forEach((item) => { item.checked = event.target.checked; });
  });
  wrap.querySelectorAll("[data-bargain-review]").forEach((button) => {
    button.addEventListener("click", () => reviewBargainLine(button.dataset.batch, button.dataset.line, button.dataset.bargainReview));
  });
}

function selectedBargainLines() {
  const checks = [...document.querySelectorAll(".bargain-review-check:checked")];
  const byBatch = new Map();
  checks.forEach((item) => {
    const batch = item.dataset.bargainBatch;
    if (!batch) return;
    const rows = byBatch.get(batch) || [];
    rows.push(item.dataset.bargainLine);
    byBatch.set(batch, rows);
  });
  return byBatch;
}

function parseBargainLowPriceRows() {
  const text = $("#bargainLowPriceInput")?.value || "";
  return text.split(/\n+/).map((line) => {
    const parts = line.split(/[,，\t]/).map((item) => item.trim());
    return {
      平台: parts[0] || "",
      店铺: parts[1] || "",
      商家编码: parts[2] || "",
      申报价: parts[3] || "",
    };
  }).filter((row) => row["平台"] && row["店铺"] && row["商家编码"] && row["申报价"]);
}

function renderBargainLowPriceTrace() {
  const wrap = $("#bargainHistoryRows");
  if (!wrap) return;
  const rows = state.bargainLowPriceRisks || [];
  const list = rows.length ? `
    <div class="report-table-wrap low-price-wrap">
      <table class="report-data-table low-price-table">
        <thead><tr><th>平台</th><th>店铺</th><th>商家编码</th><th>当前申报价</th><th>历史审批价</th><th>风险原因</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${esc(row["平台"] || "")}</td>
              <td>${esc(row["店铺"] || "")}</td>
              <td>${esc(row["商家编码"] || "")}</td>
              <td>${esc(row["当前申报价"] || "")}</td>
              <td>${esc(row["历史审批价"] || "未匹配")}</td>
              <td><span class="status-pill status-danger">${esc(row["风险原因"] || "")}</span></td>
              <td>${esc(row.status || "待处理")}</td>
              <td><button class="tool-button danger-mini" data-low-price-ignore="${esc(row.id || "")}">屏蔽</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : `<div class="action-empty">
    <div><strong>暂无低价风险</strong><span>粘贴平台当前在线价格后点击重新检查。系统会判断是否存在已通过审批记录或价格继续下探。</span></div>
  </div>`;
  wrap.innerHTML = `
    <div class="output-row bargain-history-row low-price-trace-tools">
      <div>
        <strong>低价回追</strong>
        <p>每行粘贴：平台，店铺，商家编码，当前申报价。示例：Temu，二弟，330318682-XS，19.9</p>
        <textarea id="bargainLowPriceInput" class="low-price-input" placeholder="平台，店铺，商家编码，当前申报价"></textarea>
      </div>
      <div class="task-actions">
        <button class="tool-button primary-mini" id="runLowPriceTraceBtn">重新检查</button>
      </div>
    </div>
    ${list}
  `;
  $("#runLowPriceTraceBtn")?.addEventListener("click", runBargainLowPriceTrace);
  wrap.querySelectorAll("[data-low-price-ignore]").forEach((button) => {
    button.addEventListener("click", () => ignoreBargainLowPrice(button.dataset.lowPriceIgnore));
  });
}

async function runBargainLowPriceTrace() {
  const platformRows = parseBargainLowPriceRows();
  if (!platformRows.length) {
    showToast("请按格式粘贴平台低价数据");
    return;
  }
  try {
    const result = await api.bargainLowPriceTrace(operatorPayload({ platform_rows: platformRows }));
    state.bargainLowPriceRisks = result.rows || [];
    renderBargainLowPriceTrace();
    showToast(`低价回追完成：${state.bargainLowPriceRisks.length} 条风险`);
  } catch (error) {
    showToast(error.message || "低价回追失败");
  }
}

async function ignoreBargainLowPrice(riskId) {
  if (!riskId) return;
  const remark = prompt("忽略说明", "上线前历史低价") || "";
  try {
    await api.bargainIgnoreLowPrice(operatorPayload({ risk_ids: [riskId], remark }));
    state.bargainLowPriceRisks = state.bargainLowPriceRisks.filter((row) => row.id !== riskId);
    renderBargainLowPriceTrace();
    showToast("低价风险已忽略");
  } catch (error) {
    showToast(error.message || "忽略低价风险失败");
  }
}

async function loadBargainHistory(showToastOnDone = false) {
  if (!api.bargainHistory) return;
  const query = $("#bargainHistorySearch")?.value.trim() || "";
  const merchantQuery = query.includes("-") ? query : "";
  const goodsQuery = query && !query.includes("-") ? query : "";
  const payload = operatorPayload({
    merchant_code: merchantQuery,
    goods_code: goodsQuery,
    status: state.bargainTab === "pending" ? "待管理员审核" : "",
    exclude_status: state.bargainTab === "history" ? "待管理员审核" : "",
    platform: $("#bargainFilterPlatform")?.value || "",
    store: $("#bargainFilterStore")?.value.trim() || "",
    owner: $("#bargainFilterOwner")?.value.trim() || "",
    risk: $("#bargainFilterRisk")?.value || "",
    date_from: $("#bargainFilterDateFrom")?.value || "",
    date_to: $("#bargainFilterDateTo")?.value || "",
  });
  try {
    const result = await api.bargainHistory(payload);
    state.bargainHistory = result.rows || [];
    renderBargainHistory();
    if (showToastOnDone) showToast("议价历史已刷新");
  } catch (error) {
    showToast(error.message || "读取议价历史失败");
  }
}

async function loadBargainClearance(showToastOnDone = false) {
  if (!api.bargainClearance || currentOperator().role === "owner") return;
  try {
    state.bargainClearance = await api.bargainClearance(operatorPayload());
    if (state.bargainTab === "clearance") renderBargainHistory();
    if (showToastOnDone) showToast("清仓款式已刷新");
  } catch (_error) {
    state.bargainClearance = { rows: [], summary: {} };
  }
}

async function rebuildBargainClearance() {
  if (!api.rebuildBargainClearance) return;
  try {
    state.bargainClearance = await api.rebuildBargainClearance(operatorPayload());
    state.bargainTab = "clearance";
    $("#bargainPage")?.classList.add("subpage-open");
    $("#bargainHistoryDialog")?.classList.remove("hidden");
    $("#bargainHistoryDialog")?.setAttribute("aria-hidden", "false");
    renderBargainTabs();
    renderBargainHistory();
    showToast(`已重建清仓款式：${state.bargainClearance?.summary?.goods_count || 0} 个款式`);
  } catch (error) {
    showToast(error.message || "重建清仓款式失败");
  }
}

function renderBargainTabs() {
  document.querySelectorAll("[data-bargain-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.bargainTab === state.bargainTab);
  });
}

async function lookupBargain() {
  const merchantCode = $("#bargainMerchantCode")?.value.trim() || "";
  const store = $("#bargainStore")?.value || "";
  const platform = $("#bargainPlatform")?.value || "Temu";
  if (!merchantCode) {
    showToast("请先输入商家编码");
    return;
  }
  if (!store) {
    showToast("请填写议价申请店铺");
    return;
  }
  try {
    const result = await api.bargainLookup(operatorPayload({ merchant_code: merchantCode, store, platform }));
    const existing = new Set(state.bargainDraft.map((row) => row["商家编码"]));
    (result.rows || []).forEach((row) => {
      if (!existing.has(row["商家编码"])) state.bargainDraft.push({ ...row, "本次议价": "" });
    });
    renderBargainDraft();
    if ($("#bargainStatusLine")) $("#bargainStatusLine").textContent = `暂存区 ${state.bargainDraft.length} 条尺码议价`;
    showToast("已拉取同货品全尺码");
  } catch (error) {
    showToast(error.message || "拉取议价数据失败");
  }
}

async function submitBargain() {
  if (!state.bargainDraft.length) {
    showToast("暂存区为空");
    return;
  }
  const store = $("#bargainStore")?.value.trim() || state.bargainDraft[0]["议价申请店铺"] || "";
  const platform = $("#bargainPlatform")?.value || state.bargainDraft[0]["平台"] || "Temu";
  try {
    await api.bargainSubmit(operatorPayload({ store, platform, lines: state.bargainDraft }));
    state.bargainDraft = [];
    renderBargainDraft();
    await loadBargainHistory(false);
    showToast("议价申请已提交给管理员");
  } catch (error) {
    showToast(error.message || "提交议价失败");
  }
}

async function reviewBargainLine(batchId, lineId, decision) {
  if (!batchId || !lineId || !decision) {
    showToast("审批数据缺少批次或行号，请刷新后再试");
    return;
  }
  const remarkInput = [...document.querySelectorAll("[data-bargain-remark]")]
    .find((input) => input.dataset.bargainRemark === lineId);
  const remark = remarkInput?.value.trim() || "";
  const buttons = [...document.querySelectorAll("[data-bargain-review]")]
    .filter((button) => button.dataset.batch === batchId && button.dataset.line === lineId);
  buttons.forEach((button) => {
    button.disabled = true;
    button.textContent = "处理中";
  });
  try {
    await api.bargainReview(operatorPayload({ batch_id: batchId, line_ids: [lineId], decision, remark }));
    await loadBargainHistory(false);
    showToast(`议价已${decision}`);
  } catch (error) {
    showToast(error.message || "审批议价失败");
    buttons.forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.bargainReview === "通过" ? "通过" : "拒绝";
    });
  }
}

async function reviewSelectedBargains(decision) {
  const byBatch = selectedBargainLines();
  const total = [...byBatch.values()].reduce((sum, rows) => sum + rows.length, 0);
  if (!total) {
    showToast("请先勾选要审批的议价行");
    return;
  }
  const remark = decision === "通过" ? "" : (prompt("拒绝原因") || "").trim();
  try {
    for (const [batchId, lineIds] of byBatch.entries()) {
      await api.bargainReview(operatorPayload({ batch_id: batchId, line_ids: lineIds, decision, remark }));
    }
    await loadBargainHistory(false);
    showToast(`已${decision} ${total} 条议价`);
  } catch (error) {
    showToast(error.message || "批量审批失败");
  }
}

async function refreshAll() {
  try {
    applyOperatorToTasks();
    state.status = await api.status(operatorPayload());
    state.reports = state.status.reports || await api.reports();
    state.outputs = state.status.outputs || await api.outputs(80, operatorPayload());
    state.rules = state.status.rules || await api.loadRules(operatorPayload());
    state.reportTasks = state.status.report_tasks || {};
    renderSources(state.status.source_groups || []);
    renderReportQueue();
    renderReportCards();
    renderOutputs();
    renderRules();
    await loadStoreOwners();
    await loadOperatorAccounts(false);
    await loadSales(false);
    await loadSalesReport(false);
    await loadBusinessReport(false);
    await loadHomeBusinessReports();
    await loadAssetOverview(false);
    await loadSalesCompare(false);
    await loadImportMatrix(false);
    await loadTaskSuppressions();
    await loadBargainHistory(false);
    await loadBargainClearance(false);
    await loadTasks(false);
    renderTodayDashboard();
    renderBackupReminder();
    showToast("状态已刷新");
  } catch (error) {
    renderTodayDashboard();
    renderBackupReminder();
    showToast(error.message);
  }
}

async function selectFiles(group) {
  const filePaths = await api.selectFiles(group);
  if (filePaths && filePaths.length) {
    state.selectedFiles[group.key] = filePaths;
    state.sourceProgress[group.key] = {
      kind: "selected",
      title: `已选择 ${filePaths.length} 个文件`,
      message: filePaths.map(fileBaseName).join("、"),
    };
    renderSources(state.status.source_groups || []);
    showToast(`已选择 ${filePaths.length} 个文件，请点击上传`);
  }
}

async function uploadSource(group) {
  const files = state.selectedFiles[group.key] || [];
  try {
    state.sourceProgress[group.key] = {
      kind: "uploading",
      title: "正在上传",
      message: files.length ? `正在提交 ${files.length} 个文件...` : "请先选择要上传的文件。",
    };
    renderSources(state.status.source_groups || []);
    const result = await api.uploadSource(group, files, operatorPayload());
    state.sourceProgress[group.key] = {
      kind: "success",
      title: `上传成功：${result.count} 个文件`,
      message: `${(result.files || []).reduce((sum, item) => sum + Number(item.rows || 0), 0)} 行数据已进入待提交批次，请点击“结束上传”。`,
    };
    showToast(`已上传 ${result.count} 个文件，记得结束上传`);
    await refreshAll();
  } catch (error) {
    state.sourceProgress[group.key] = {
      kind: "error",
      title: "上传失败",
      message: error.message,
    };
    renderSources(state.status.source_groups || []);
    showToast(`上传失败：${error.message}`);
  }
}

async function finishUpload(group) {
  try {
    const result = await api.finishUpload(group.upload_target, operatorPayload());
    state.sourceProgress[group.key] = {
      kind: "success",
      title: "已更新",
      message: `正式提交 ${result.rows || 0} 行，文件：${result.file || result.files || "已记录"}`,
    };
    showToast(`${group.name} 已结束上传`);
    await refreshAll();
  } catch (error) {
    state.sourceProgress[group.key] = {
      kind: "error",
      title: "结束上传失败",
      message: error.message,
    };
    renderSources(state.status.source_groups || []);
    showToast(`结束上传失败：${error.message}`);
  }
}

async function clearUpload(group) {
  await api.clearUpload(group.upload_target, operatorPayload());
  showToast(`${group.name} 已清空待提交`);
  await refreshAll();
}

async function generateReport(reportId) {
  showToast("开始生成表格");
  const result = await api.generateReport(reportId, "V1", operatorPayload());
  state.reportTaskSync[reportId] = result.task_sync || {};
  await refreshAll();
  showToast(`表格已生成：${result.file || ""}；${taskSyncSummary(result.task_sync)}`);
}

async function generateWeeklyReports() {
  showToast("开始生成所有就绪报表");
  const result = await api.generateWeekly(operatorPayload());
  (result.results || []).forEach((item) => {
    if (item.status === "ok") state.reportTaskSync[item.report] = item.task_sync || {};
  });
  await refreshAll();
  showToast(`本周报表已生成；${taskSyncSummary(result.task_sync)}`);
}

async function recomputeSource(group) {
  if (!api.recomputeSource || !group?.upload_target) return;
  const names = group.recompute?.stale_report_names?.length ? group.recompute.stale_report_names : group.recompute?.report_names || [];
  const ok = confirm(`确认根据「${group.name}」最新数据源重算关联报表？\n\n将重算：${names.join("、") || "关联报表"}\n\n报表生成后会同步商品任务。`);
  if (!ok) return;
  try {
    showToast(`开始重算 ${group.name} 关联报表`);
    const result = await api.recomputeSource(group.upload_target, operatorPayload());
    (result.results || []).forEach((item) => {
      if (item.status === "ok") state.reportTaskSync[item.report] = item.task_sync || {};
    });
    const failed = (result.results || []).filter((item) => item.status !== "ok");
    state.sourceProgress[group.key] = {
      kind: failed.length ? "error" : "done",
      title: failed.length ? "重算完成但有失败" : "关联报表重算成功",
      message: `成功 ${result.summary?.ok || 0} 个，失败 ${result.summary?.failed || 0} 个；${taskSyncSummary(result.task_sync)}`,
      detail: failed.map((item) => `${item.name || item.report}：${item.error || "未知原因"}`).join("；"),
    };
    await refreshAll();
    showToast(`重算完成：成功 ${result.summary?.ok || 0} 个，失败 ${result.summary?.failed || 0} 个；${taskSyncSummary(result.task_sync)}`);
  } catch (error) {
    showToast(`重算失败：${userFacingError(error)}`);
  }
}

function showPage(name) {
  const pageMap = {
    today: "todayPage",
    sales: "salesPage",
    bargain: "bargainPage",
    tasks: "tasksPage",
    imports: "importPage",
    reports: "reportsPage",
    masterdata: "masterDataPage",
    productInfo: "productInfoPage",
    rules: "rulesPage",
    erpSettings: "erpSettingsPage",
  };
  const next = pageMap[name] ? name : "today";
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("page-active"));
  const page = $(`#${pageMap[next]}`);
  if (page) page.classList.add("page-active");
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === next));
  const active = document.querySelector(`.nav-item[data-page="${next}"] span`);
  setText("#pageTitle", next === "erpSettings" ? "ERP 接口设置" : next === "productInfo" ? "商品信息查询" : (active?.textContent || "今日工作台"));
  if (next === "productInfo") loadProductInfo();
  if (next === "erpSettings") renderErpSettings();
  if (next === "bargain" && currentOperator().role !== "owner") {
    openBargainHistoryDialog("pending");
  }
}

function bindEvents() {
  installImageFallbacks();
  if ($("#salesDate") && !$("#salesDate").value) $("#salesDate").value = salesDefaultDateText();
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });
  document.addEventListener("click", (event) => {
    const routeButton = event.target?.closest?.("[data-empty-page]");
    if (!routeButton) return;
    followRouteButton(routeButton);
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      if (button.dataset.mode === "reports") showPage("reports");
      if (button.dataset.mode === "outputs") showPage("outputs");
      if (button.dataset.mode === "sources") showPage("weekly");
    });
  });
  $("#refreshBtn")?.addEventListener("click", refreshAll);
  $("#todayGuideRefreshBtn")?.addEventListener("click", refreshAll);
  $("#dailyFollowupRefreshBtn")?.addEventListener("click", refreshAll);
  $("#salesDate")?.addEventListener("change", () => refreshSalesForSelectedDate(true));
  $("#loadSalesBtn")?.addEventListener("click", () => refreshSalesForSelectedDate(true));
  $("#saveSalesBatchBtn")?.addEventListener("click", submitSalesBatch);
  $("#loadSalesHeaderBtn")?.addEventListener("click", async () => {
    state.salesFocus = "missing";
    await loadSales(false);
    await loadSalesCompare(false);
    document.querySelector("#salesEntryList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("销售日销量清单已刷新");
  });
  document.querySelectorAll(".sales-focus-tabs [data-sales-focus]").forEach((button) => {
    button.addEventListener("click", () => setSalesFocus(button.dataset.salesFocus));
  });
  initializeSalesReportRange();
  initializeBusinessRange();
  document.querySelectorAll("[data-sales-range]").forEach((button) => {
    button.addEventListener("click", () => applySalesReportRange(button.dataset.salesRange));
  });
  document.querySelectorAll("[data-business-range]").forEach((button) => {
    button.addEventListener("click", () => applyBusinessRange(button.dataset.businessRange));
  });
  document.querySelectorAll("[data-business-source]").forEach((button) => {
    button.addEventListener("click", () => applyBusinessSource(button.dataset.businessSource));
  });
  ["#salesReportDateFrom", "#salesReportDateTo"].forEach((selector) => {
    $(selector)?.addEventListener("change", clearSalesReportRangeShortcut);
  });
  ["#businessDateFrom", "#businessDateTo"].forEach((selector) => {
    $(selector)?.addEventListener("change", clearBusinessRangeShortcut);
  });
  ["#businessGrain", "#businessPlatform", "#businessStore"].forEach((selector) => {
    $(selector)?.addEventListener("change", () => loadBusinessReport(true));
  });
  document.querySelectorAll("[data-business-tab]").forEach((button) => {
    button.addEventListener("click", () => setBusinessTab(button.dataset.businessTab));
  });
  $("#loadBusinessReportBtn")?.addEventListener("click", () => loadBusinessReport(true));
  $("#refreshBusinessReportBtn")?.addEventListener("click", () => loadBusinessReport(true));
  $("#toggleBusinessAlertsBtn")?.addEventListener("click", () => {
    $("#businessAlertList")?.classList.toggle("hidden");
  });
  $("#loadSalesCompareBtn")?.addEventListener("click", () => loadSalesCompare(true));
  $("#loadSalesReportBtn")?.addEventListener("click", () => loadSalesReport(true));
  $("#exportSalesReportBtn")?.addEventListener("click", exportSalesReport);
  $("#focusImportMatrixBtn")?.addEventListener("click", () => {
    document.querySelector("#importMatrixRows")?.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast("已定位到缺失矩阵");
  });
  $("#loadImportMatrixBtn")?.addEventListener("click", () => loadImportMatrix(true));
  document.querySelectorAll(".import-health-tabs [data-import-focus]").forEach((button) => {
    button.addEventListener("click", () => setImportFocus(button.dataset.importFocus));
  });
  $("#exportSalesBtn")?.addEventListener("click", exportSales);
  $("#loadTasksBtn")?.addEventListener("click", () => loadTasksFromFirstPage());
  $("#exportTasksBtn")?.addEventListener("click", exportTasks);
  $("#batchPushTasksBtn")?.addEventListener("click", () => pushTasks());
  $("#batchSubmitTasksBtn")?.addEventListener("click", batchSubmitTasks);
  $("#batchApproveTasksBtn")?.addEventListener("click", () => confirmTasks());
  $("#suppressTasksBtn")?.addEventListener("click", () => suppressTasks());
  $("#saveOperatorBtn")?.addEventListener("click", saveOperator);
  $("#lookupBargainBtn")?.addEventListener("click", lookupBargain);
  $("#bargainPlatform")?.addEventListener("change", renderBargainStoreOptions);
  $("#bargainLookupControls")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      lookupBargain();
    }
  });
  $("#submitBargainBtn")?.addEventListener("click", submitBargain);
  $("#approveSelectedBargainsBtn")?.addEventListener("click", () => reviewSelectedBargains("通过"));
  $("#rejectSelectedBargainsBtn")?.addEventListener("click", () => reviewSelectedBargains("不通过"));
  $("#bargainSelectAll")?.addEventListener("change", (event) => {
    document.querySelectorAll(".bargain-review-check").forEach((item) => {
      item.checked = event.target.checked;
    });
  });
  $("#clearBargainDraftBtn")?.addEventListener("click", () => {
    state.bargainDraft = [];
    renderBargainDraft();
    showToast("议价暂存区已清空");
  });
  $("#openBargainHistoryBtn")?.addEventListener("click", () => openBargainHistoryDialog("history"));
  $("#openBargainPendingBtn")?.addEventListener("click", () => openBargainHistoryDialog("pending"));
  $("#openBargainLowPriceBtn")?.addEventListener("click", () => openBargainHistoryDialog("lowprice"));
  document.querySelectorAll("[data-bargain-history-close]").forEach((button) => {
    button.addEventListener("click", closeBargainHistoryDialog);
  });
  $("#loadBargainHistoryBtn")?.addEventListener("click", () => loadBargainHistory(true));
  $("#searchBargainHistoryBtn")?.addEventListener("click", () => loadBargainHistory(true));
  $("#rebuildClearanceBtn")?.addEventListener("click", rebuildBargainClearance);
  document.querySelectorAll("[data-bargain-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.bargainTab = button.dataset.bargainTab || "history";
      renderBargainTabs();
      renderBargainHistory();
      if (state.bargainTab === "history" || state.bargainTab === "pending") loadBargainHistory(false);
      if (state.bargainTab === "clearance") loadBargainClearance(false);
    });
  });
  ["#bargainFilterPlatform", "#bargainFilterStore", "#bargainFilterOwner", "#bargainFilterRisk", "#bargainFilterDateFrom", "#bargainFilterDateTo"].forEach((selector) => {
    $(selector)?.addEventListener("change", () => loadBargainHistory(false));
    $(selector)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loadBargainHistory(true);
    });
  });
  $("#operatorRole")?.addEventListener("change", () => {
    if (!validateOperatorDraft(true)) $("#operatorUser")?.focus();
  });
  $("#operatorUser")?.addEventListener("input", () => {
    validateOperatorDraft(false);
  });
  $("#generateWeeklyBtn")?.addEventListener("click", generateWeeklyReports);
  $("#saveRulesBtn")?.addEventListener("click", async () => {
    state.rules = collectRules();
    await api.saveRules(operatorPayload({ rules: state.rules }));
    renderRules();
    showToast("规则已保存");
  });
  $("#saveThresholdRulesBtn")?.addEventListener("click", async () => {
    state.rules = collectRules();
    await api.saveRules(operatorPayload({ rules: state.rules }));
    renderRules();
    showToast("阈值已保存");
  });
  $("#saveErpSettingsBtn")?.addEventListener("click", saveErpSettings);
  $("#manualErpSyncBtn")?.addEventListener("click", manualErpSync);
  $("#testErpSettingsBtn")?.addEventListener("click", testErpSettings);
  $("#createBackupBtn")?.addEventListener("click", createBackup);
  $("#exportAssetArchiveBtn")?.addEventListener("click", exportAssetArchive);
  $("#importAssetArchiveBtn")?.addEventListener("click", importAssetArchive);
  $("#selectBackupBtn")?.addEventListener("click", selectBackupFile);
  $("#restoreBackupBtn")?.addEventListener("click", restoreBackup);
  $("#runDoctorBtn")?.addEventListener("click", runDoctorCheck);
  $("#runReadyCheckBtn")?.addEventListener("click", runReadyCheck);
  $("#addPlatformBtn")?.addEventListener("click", addPlatform);
  $("#newPlatformInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addPlatform();
  });
  $("#addStoreOwnerBtn")?.addEventListener("click", addStoreOwnerRow);
  $("#loadStoreOwnersBtn")?.addEventListener("click", loadStoreOwners);
  $("#saveStoreOwnersBtn")?.addEventListener("click", saveStoreOwners);
  $("#selectOwnerMasterBtn")?.addEventListener("click", () => chooseWorkbookPath("#ownerMasterPath", "店铺负责人对应表"));
  $("#selectSalesHistoryBtn")?.addEventListener("click", () => chooseWorkbookPath("#salesHistoryPath", "跨境运营总表"));
  $("#importOwnerMasterBtn")?.addEventListener("click", importOwnerMaster);
  $("#importSalesHistoryBtn")?.addEventListener("click", importSalesHistory);
  $("#createOperatorAccountBtn")?.addEventListener("click", createOperatorAccount);
  $("#productSearchBtn")?.addEventListener("click", queryProductInfo);
  $("#reloadProductInfoBtn")?.addEventListener("click", loadProductInfo);
  ["#productCodeFilter", "#merchantCodeFilter", "#productNameFilter"].forEach((selector) => {
    $(selector)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") queryProductInfo();
    });
  });
  ["#suppressionStoreFilter", "#suppressionOwnerFilter", "#suppressionSkcFilter", "#suppressionMerchantFilter"].forEach((selector) => {
    $(selector)?.addEventListener("input", renderTaskSuppressions);
  });
  document.querySelectorAll("[data-master-module]").forEach((button) => {
    button.addEventListener("click", () => openMasterModule(button.dataset.masterModule));
  });
  document.querySelectorAll("[data-master-dialog-close]").forEach((button) => button.addEventListener("click", closeMasterModule));
  $("#masterModuleDialog")?.addEventListener("click", (event) => {
    if (event.target?.id === "masterModuleDialog") closeMasterModule();
  });
  document.querySelectorAll("[data-settings-module]").forEach((button) => {
    button.addEventListener("click", () => openSettingsModule(button.dataset.settingsModule));
  });
  document.querySelectorAll("[data-settings-dialog-close]").forEach((button) => button.addEventListener("click", closeSettingsModule));
  $("#settingsModuleDialog")?.addEventListener("click", (event) => {
    if (event.target?.id === "settingsModuleDialog") closeSettingsModule();
  });
  $("#taskDialogForm")?.addEventListener("submit", submitTaskDialog);
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", closeTaskDialog));
  $("#taskDialog")?.addEventListener("click", (event) => {
    if (event.target?.id === "taskDialog") closeTaskDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#taskDialog")?.classList.contains("hidden")) closeTaskDialog();
    if (event.key === "Escape" && !$("#masterModuleDialog")?.classList.contains("hidden")) closeMasterModule();
    if (event.key === "Escape" && !$("#settingsModuleDialog")?.classList.contains("hidden")) closeSettingsModule();
  });
}

function installImageFallbacks() {
  document.querySelectorAll("img[data-fallback-label]").forEach((image) => {
    const replaceImage = () => {
      if (image.dataset.fallbackApplied === "1") return;
      image.dataset.fallbackApplied = "1";
      const fallback = document.createElement("div");
      fallback.className = image.className;
      fallback.classList.add("asset-fallback");
      fallback.textContent = image.dataset.fallbackLabel || "PETCIRCLE";
      fallback.setAttribute("role", "img");
      fallback.setAttribute("aria-label", image.alt || image.dataset.fallbackLabel || "PETCIRCLE");
      image.replaceWith(fallback);
    };
    image.addEventListener("error", replaceImage, { once: true });
    if (image.complete && image.naturalWidth === 0) replaceImage();
  });
}

bindEvents();
refreshAll();
