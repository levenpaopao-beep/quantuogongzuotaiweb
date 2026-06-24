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
  reportTaskSync: {},
  reportTasks: {},
  storeOwners: [],
  sales: null,
  salesFocus: "missing",
  salesCompare: null,
  salesReport: null,
  importMatrix: null,
  importFocus: "blocked",
  taskSuppressions: [],
  taskDialog: null,
  customPlatforms: [],
  ownerOptions: [],
  operatorAccounts: [],
};

const BUILT_IN_PLATFORMS = ["Temu", "Shein", "速卖通", "TK", "Ozon"];

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
  return new Date().toISOString().slice(0, 10);
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
  const operator = currentOperator();
  const role = operator.role || "admin";
  const title = $(".hero-copy h2");
  const body = $(".hero-copy p");
  const primary = $(".hero-actions .primary-button");
  const secondary = $(".hero-actions .ghost-button");
  if (role === "owner") {
    if (title) title.textContent = "先填今日销量，再整包处理任务。";
    if (body) body.textContent = "店长只看到自己负责的店铺数据。每天先补齐销量，随后处理已推送的商品任务包。";
    if (primary) primary.textContent = "填写我的销量";
    if (secondary) secondary.textContent = "处理我的任务包";
    return;
  }
  if (title) title.textContent = "先确认销量，再处理任务包。";
  if (body) body.textContent = "管理员看全部平台和店铺；店长只看自己负责的数据。每个卡片都指向下一步动作。";
  if (primary) primary.textContent = "填写今日销量";
  if (secondary) secondary.textContent = "处理商品任务";
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
  if (status.includes("待") || status.includes("更新") || status.includes("已有")) return "status-warn";
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

function renderSources(groups) {
  const rows = $("#sourceRows");
  rows.innerHTML = "";
  const pendingGroups = groups.filter((item) => item.pending_count);
  $("#statusSummary").textContent = `共 ${groups.length} 个数据源，${pendingGroups.length} 个有待提交文件`;
  $("#syncHint").textContent = pendingGroups.length ? "有数据源等待结束上传，结束上传后才进入缺失矩阵。" : "所有已启用的数据源均已检查完成";
  renderImportHealth(groups);
  groups.forEach((group) => {
    const [badgeText, badgeClass] = sourceBadge(group.name);
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div class="table-cell source-name"><span class="source-badge ${badgeClass}">${badgeText}</span><span>${group.name}</span></div>
      <div class="table-cell"><div class="file-name" title="${latestName(group)}">${latestName(group)}</div><div class="file-meta">${group.latest?.modified || "等待上传"}${group.batch_id ? ` · 批次 ${group.batch_id}` : ""}</div>${renderSourceProgress(group)}</div>
      <div class="table-cell pending">${group.pending_count || 0}</div>
      <div class="table-cell rows-count">${group.total_rows || group.latest?.rows || "-"}</div>
      <div class="table-cell"><span class="status-pill ${statusClass(group.status)}">${group.status}</span><div class="file-meta">${group.latest?.modified ? `更新于 ${group.latest.modified.slice(5, 16)}` : ""}</div></div>
      <div class="table-cell row-actions">
        <button class="tool-button" data-action="select">选择文件</button>
        <button class="tool-button" data-action="upload">上传</button>
        <button class="tool-button" data-action="finish">结束上传</button>
      </div>
    `;
    row.querySelector('[data-action="select"]').addEventListener("click", () => selectFiles(group));
    row.querySelector('[data-action="upload"]').addEventListener("click", () => uploadSource(group));
    row.querySelector('[data-action="finish"]').addEventListener("click", () => finishUpload(group));
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
    if (openButton && latest) openButton.addEventListener("click", () => api.openOutput(latest.name));
    if (folderButton && latest) folderButton.addEventListener("click", () => api.revealOutput(latest.name));
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
    row.children[1].addEventListener("click", () => api.openOutput(item.name));
    row.children[2].addEventListener("click", () => api.revealOutput(item.name));
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
  loadTasks();
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
  loadTasks();
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
  loadTasks();
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
      ["当前筛选", state.tasks.length, `任务包 ${packages.length}`],
      ["可直接处理", actionable, ownerMode ? "可整包提交" : "可推送/确认/归档"],
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
      ${quickActions.map(([label, quickStatus, next, openOnly, unassigned, reworked]) => `
        <button class="tool-button" data-task-work-action="filter" data-status="${quickStatus}" data-next="${next}" data-open-only="${openOnly ? "1" : ""}" data-unassigned="${unassigned ? "1" : ""}" data-reworked="${reworked ? "1" : ""}" type="button">${label}</button>
      `).join("")}
    `;
    actions.querySelector('[data-task-work-action="select-actionable"]')?.addEventListener("click", selectActionableTasks);
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
  loadTasks(false);
  showToast("已按任务包定位明细");
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
          <span class="status-pill ${pkg.priority === "高" ? "status-danger" : pkg.priority === "中" ? "status-warn" : "status-ok"}">${esc(pkg.priority || "普通")}</span>
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
  const historyButton = `<button class="tool-button" data-action="history" data-id="${task.id}" title="查看操作记录">记录</button>`;
  const submitButton = !task.owner ? '<span class="file-meta">待指派</span>' : canSubmitOwnerTask(task) ? `<button class="tool-button" data-action="submit" data-id="${task.id}" title="店长填写处理结果">填写</button>` : '<span class="file-meta">-</span>';
  if (operator.role === "owner") {
    return `${historyButton}${submitButton}`;
  }
  const reviewButtons = canReviewTask(task) ? `<button class="tool-button primary-mini" data-action="confirm" data-id="${task.id}" title="确认店长已处理并完成">确认</button>` : "";
  const suppressButton = task.status !== "已完成" ? `<button class="tool-button" data-action="suppress" data-id="${task.id}" title="加入屏蔽清单，不再重复提示">屏蔽</button>` : "";
  const doneButton = canMarkDoneTask(task) ? `<button class="tool-button" data-action="done" data-id="${task.id}" title="标记完成">完成</button>` : "";
  const assignButton = canAssignTask(task) ? `<button class="tool-button" data-action="assign" data-id="${task.id}" title="指派负责人">指派</button>` : "";
  return `${historyButton}${assignButton}${reviewButtons}${doneButton}${suppressButton}`;
}

function selectedTaskIds() {
  return Array.from(document.querySelectorAll(".task-check:checked")).map((input) => input.value).filter(Boolean);
}

function toggleAllTaskSelection(checked) {
  document.querySelectorAll(".task-check").forEach((input) => { input.checked = checked; });
  renderTaskWorkbar();
}

function renderTaskCenter() {
  renderTaskSummary();
  renderTaskPackages();
  renderTaskWorkbar();
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
      <div><input class="task-check" type="checkbox" value="${task.id || ""}" /></div>
      <div><span class="status-pill ${taskBadge(task.status)}">${taskStatusLabel(task.status)}</span></div>
      <div><span class="status-pill ${task.priority === "高" ? "status-danger" : task.priority === "中" ? "status-warn" : task.priority === "低" ? "status-ok" : ""}">${task.priority || "普通"}</span></div>
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
  rows.querySelectorAll('[data-action="submit"]').forEach((button) => button.addEventListener("click", () => submitTask(button.dataset.id)));
  rows.querySelectorAll('[data-action="confirm"]').forEach((button) => button.addEventListener("click", () => confirmTasks([button.dataset.id])));
  rows.querySelectorAll('[data-action="done"]').forEach((button) => button.addEventListener("click", () => doneTask(button.dataset.id)));
  rows.querySelectorAll('[data-action="suppress"]').forEach((button) => button.addEventListener("click", () => suppressTasks([button.dataset.id])));
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
  const message = error.message || "任务操作失败";
  if (line) line.textContent = message;
  showToast(message);
}

async function loadTasks(showToastOnDone = true) {
  try {
    const line = $("#taskStatusLine");
    if (line) line.textContent = "正在读取任务...";
    const overview = await api.tasks(operatorPayload({ filters: taskOverviewFilters() }));
    state.taskOverview = overview.summary || {};
    const result = await api.tasks(operatorPayload({ filters: taskFilters() }));
    state.taskSummary = result.summary || {};
    state.taskPackages = result.packages || [];
    state.tasks = result.tasks || [];
    renderTaskCenter();
    renderTodayDashboard();
    if (line) line.textContent = `当前筛选 ${state.tasks.length} 条任务`;
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
  if (route.salesFocus) setSalesFocus(route.salesFocus, { scroll: route.emptyPage === "sales" });
  if (route.importFocus) setImportFocus(route.importFocus, { scroll: route.emptyPage === "imports" || route.focus === "import-matrix" });
  if (route.emptyPage === "tasks" && (route.taskUser || route.taskStatus || route.taskNextHandler || route.taskOpenOnly)) {
    loadTasks();
  }
  if (route.focus === "import-matrix") {
    setTimeout(() => document.querySelector("#importMatrixRows")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
}

function salesDateValue() {
  const input = $("#salesDate");
  if (input && !input.value) input.value = todayDateText();
  return input?.value || todayDateText();
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
  const visible = salesFocusEntries(entries);
  if (title) {
    const label = state.salesFocus === "abnormal" ? "只看异常波动" : state.salesFocus === "all" ? "查看全部店铺" : "今天先补未填";
    title.textContent = `${label} · ${visible.length} 条`;
  }
  if (hint) {
    hint.textContent = `应填 ${summary.required || 0}，已填 ${summary.submitted || 0}，未填 ${summary.missing || 0}，异常 ${summary.abnormal || 0}。输入销量后按回车可提交当前行。`;
  }
  document.querySelectorAll(".sales-focus-tabs [data-sales-focus]").forEach((button) => {
    button.classList.toggle("active", button.dataset.salesFocus === state.salesFocus);
  });
}

function renderSalesManagement() {
  const payload = state.sales || {};
  const entries = payload.entries || [];
  const list = $("#salesEntryList");
  const ledger = $("#salesLedgerRows");
  const summary = payload.summary || {};
  const visibleEntries = salesFocusEntries(entries);
  renderSalesFocus(summary, entries);
  if ($("#salesStatusLine")) {
    $("#salesStatusLine").textContent = `应填 ${summary.required || 0} 个店铺，已填 ${summary.submitted || 0}，未填 ${summary.missing || 0}，异常 ${summary.abnormal || 0}`;
  }
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
      list.innerHTML = visibleEntries.map((item) => {
        const index = entries.indexOf(item);
        return `
        <div class="sales-entry ${item.submitted ? "sales-entry-done" : ""}">
          <span>${item.platform} · ${item.store}<small>${item.owner || "未分配"}</small></span>
          <input data-sales-index="${index}" inputmode="numeric" value="${item.sales || ""}" placeholder="销售件数" />
          <input data-remark-index="${index}" value="${item.remark || ""}" placeholder="备注，可选" />
          <button class="primary-button" data-action="submit-sales" data-index="${index}">${item.submitted ? "更新" : "提交"}</button>
        </div>
      `;
      }).join("") || actionEmpty({
        title: state.salesFocus === "abnormal" ? "当前没有异常波动" : "当前没有未填店铺",
        body: state.salesFocus === "abnormal" ? "异常波动只提醒不拦截；需要复核时切到“全部”查看店铺。" : "今天的销量清单已经填完，可以回到今日工作台处理任务包。",
        primary: state.salesFocus === "missing" ? "处理任务包" : "查看全部",
        page: state.salesFocus === "missing" ? "tasks" : "sales",
        attrs: state.salesFocus === "missing" ? 'data-task-status="待店长处理" data-task-open-only="true"' : 'data-sales-focus="all"',
      });
      bindEmptyActions(list);
      list.querySelectorAll('[data-action="submit-sales"]').forEach((button) => {
        button.addEventListener("click", () => submitSalesEntry(Number(button.dataset.index)));
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
  if (ledger) {
    ledger.innerHTML = entries.map((item, index) => `
      <div>${item.platform}</div>
      <div>${item.store}<small>${item.owner || ""}</small></div>
      <div>${item.submitted ? item.sales : "待填写"}</div>
      <div><span class="status-pill ${item.submitted ? "status-ok" : "status-warn"}">${item.status || (item.submitted ? "已填写" : "未填")}</span></div>
      <div>${item.abnormal ? `<span class="status-pill status-danger">${item.abnormal}</span>` : "正常"}</div>
      <div><button class="tool-button" data-action="ledger-submit" data-index="${index}">${item.submitted ? "更正" : "填写"}</button></div>
    `).join("");
    ledger.querySelectorAll('[data-action="ledger-submit"]').forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.querySelector(`[data-sales-index="${button.dataset.index}"]`);
        input?.focus();
      });
    });
  }
  renderReportSalesMetrics();
}

function renderReportSalesMetrics() {
  const summary = state.sales?.summary || {};
  const metrics = $("#reportSalesMetrics");
  if (metrics) {
    metrics.innerHTML = [
      ["今日总销量", summary.total_sales ?? 0, `已填 ${summary.submitted || 0} / 应填 ${summary.required || 0}`, "ok"],
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
        body: "平台汇总会在每日销量填报后自动生成。先填写今日销量，再回来查看平台总览。",
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
    renderSalesManagement();
    renderOperatorOwnerOptions();
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
    await loadSales(false);
    await loadSalesReport(false);
    await loadSalesCompare(false);
    showToast("销量已保存");
  } catch (error) {
    showToast(error.message || "保存销量失败");
  }
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

  const metrics = $("#todaySalesMetrics");
  if (metrics) {
    metrics.innerHTML = [
      ["应填店铺", salesSummary.required ?? 0, "平台 + 店铺口径", ""],
      ["已填写", salesSummary.submitted ?? 0, `今日总销量 ${salesSummary.total_sales || 0}`, "ok"],
      ["未填写", salesSummary.missing ?? 0, ownerMode ? "今天先补齐" : "管理员可提醒店长", "warn"],
      ["异常波动", salesSummary.abnormal ?? 0, "50% 阈值提醒", "danger"],
    ].map(([label, value, hint, tone]) => `<div class="metric-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></div>`).join("");
  }

  const salesActions = $("#todaySalesActions");
  if (salesActions) {
    const actions = ownerMode ? [
      ["第 1 步：填销量", "打开“销量管理”，把自己负责店铺的今日销量填完。", "sales", "去填写", 'data-sales-focus="missing"'],
      ["第 2 步：看异常", "如果波动很大，补一句原因，系统只提醒不拦截。", "reports", "看提醒", ""],
      ["第 3 步：处理任务包", "销量完成后进入“商品任务”，按整包提交处理结果。", "tasks", "去处理", 'data-task-status="待店长处理" data-task-open-only="true"'],
    ] : [
      ["管理员今日动作", "查看未填、异常波动、补填申请，并在月结前锁定口径。", "sales", "看销量", 'data-sales-focus="missing"'],
      ["提醒店长", "未填或异常店铺会集中显示，方便按负责人跟进。", "sales", "去跟进", 'data-sales-focus="missing"'],
    ];
    salesActions.innerHTML = actions.map(([title, text, page, label, attrs]) => `
      <div class="action-route">
        <div><strong>${title}</strong><span>${text}</span></div>
        <button class="ghost-button" data-empty-page="${page}" ${attrs}>${label}</button>
      </div>
    `).join("");
    bindEmptyActions(salesActions);
  }

  const actionList = $("#todayActionList");
  if (actionList) {
    const rows = ownerMode ? [
      ["我的待填销量", salesSummary.missing ?? 0, "当天销量是每天第一优先级。", "sales", "去填写", 'data-sales-focus="missing"'],
      ["我的待处理任务包", status["待店长处理"] || 0, "按任务包整包处理，备注或凭证至少填一个。", "tasks", "去处理", 'data-task-status="待店长处理" data-task-open-only="true"'],
      ["我的导入待提交", pendingSources + missingSources, "每周导入自己店铺需要补的数据。", "imports", "去导入", 'data-focus="import-matrix" data-import-focus="blocked"'],
      ["等待管理员确认", status["待管理员审核"] || 0, "提交后由管理员打勾，完成后从待办消失。", "tasks", "查看", 'data-task-status="待管理员审核" data-task-open-only="true"'],
    ] : [
      [adminQueueLabel, adminQueueCount, "管理员按当前队列处理，完成后任务从待办消失。", "tasks", "去处理", adminQueueAttrs],
      ["待店长处理", status["待店长处理"] || 0, "店长按任务包整包处理。", "tasks", "看进度", 'data-task-status="待店长处理" data-task-open-only="true"'],
      ["待管理员确认", status["待管理员审核"] || 0, "店长处理后管理员打勾完成。", "tasks", "去确认", 'data-task-status="待管理员审核" data-task-open-only="true"'],
      ["导入缺失/待提交", pendingSources + missingSources, "查看本周两批次导入矩阵。", "imports", "去检查", 'data-focus="import-matrix" data-import-focus="blocked"'],
    ];
    actionList.innerHTML = rows.map(([label, value, hint, page, action, attrs]) => `
      <div class="action-route">
        <div><strong>${label} · ${value}</strong><span>${hint}</span></div>
        <button class="ghost-button" data-empty-page="${page}" ${attrs}>${action}</button>
      </div>
    `).join("");
    bindEmptyActions(actionList);
  }

  const snapshot = $("#todaySnapshot");
  if (snapshot) {
    snapshot.innerHTML = `
      <div><span>当前任务总数</span><strong>${summary.total || 0}</strong></div>
      <div><span>超时/重复风险</span><strong>${overdue.total || 0}</strong></div>
      <div><span>数据源待提交</span><strong>${pendingSources}</strong></div>
      <div><span>经营平台</span><strong>Temu / Shein / 速卖通 / TK / Ozon</strong></div>
    `;
  }
  renderDailyFollowups();
  renderTodayGuide();
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

function renderTodayWorkflow() {
  const wrap = $("#todayWorkflowSteps");
  if (!wrap) return;
  const operator = currentOperator();
  const ownerMode = operator.role === "owner";
  const title = $("#todayWorkflowTitle");
  const hint = $("#todayWorkflowHint");
  if (title) title.textContent = ownerMode ? "店长每日流程" : "管理员日常流程";
  if (hint) {
    hint.textContent = ownerMode
      ? "每天以销量填报为主；每周补齐导入和任务包，提交后等管理员确认。"
      : "每天盯销量和异常；每周看导入缺口、推送任务包，最后确认归档。";
  }
  const steps = ownerMode ? [
    ["01", "填写今日销量", "进入销量管理，只填写自己负责店铺；波动大时补原因。", "sales", "去填销量", 'data-sales-focus="missing"'],
    ["02", "处理我的任务包", "商品任务按整包提交，备注或凭证至少填一个。", "tasks", "去处理", 'data-task-status="待店长处理" data-task-open-only="true"'],
    ["03", "补齐每周导入", "数据导入页只看自己店铺缺什么，补完后管理员能看到。", "imports", "看缺口", 'data-focus="import-matrix" data-import-focus="blocked"'],
    ["04", "看经营结果", "回到经营报表查看自己店铺趋势和销量差异提醒。", "reports", "看报表", ""],
  ] : [
    ["01", "检查销量进度", "先看未填店铺和异常波动，提醒负责人补齐原因。", "sales", "看销量", 'data-sales-focus="missing"'],
    ["02", "检查导入缺口", "按平台、店铺、数据类型看缺失矩阵，缺哪个店铺一眼定位。", "imports", "看矩阵", 'data-focus="import-matrix" data-import-focus="blocked"'],
    ["03", "推送商品任务", "按任务包推送给店长；任务多时可下载表格给店长处理。", "tasks", "推送任务", 'data-task-status="待推送" data-task-open-only="true"'],
    ["04", "确认并归档", "店长整包处理后，管理员只需确认打勾，任务从待办消失。", "tasks", "去确认", 'data-task-status="待管理员审核" data-task-open-only="true"'],
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

async function pushTasks(ids) {
  const selected = (ids || selectedTaskIds()).filter(Boolean);
  if (!selected.length) {
    showToast("请先选择要推送给店长的任务");
    return;
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
  const wrap = $("#taskSuppressionRows");
  if (!wrap) return;
  const operator = currentOperator();
  if (operator.role === "owner") {
    wrap.innerHTML = actionEmpty({
      title: "屏蔽清单由管理员维护",
      body: "店长只处理已推送到自己名下的任务包；反复出现但不再提示的 SKC/SPU 由管理员统一设置。",
      primary: "去商品任务",
      page: "tasks",
    });
    bindEmptyActions(wrap);
    return;
  }
  const rows = state.taskSuppressions || [];
  if (!rows.length) {
    wrap.innerHTML = actionEmpty({
      title: "暂无屏蔽项",
      body: "如果某个 SKC/SPU 每周重复出现但确认暂不处理，可在商品任务里勾选后加入屏蔽清单。",
      primary: "去商品任务",
      page: "tasks",
    });
    bindEmptyActions(wrap);
    return;
  }
  wrap.innerHTML = rows.slice(0, 80).map((item) => `
    <div class="output-row">
      <div>
        <strong>${item.platform || "-"} · ${item.store || "-"} · ${item.task_type || "-"}</strong>
        <p>${[item.product_name, item.merchant_code, item.skc ? `SKC ${item.skc}` : "", item.spu ? `SPU ${item.spu}` : "", item.system_action].filter(Boolean).join("　")}</p>
        <p>原因：${item.reason || "未填写"}　时长：${item.duration || "永久"}　更新：${item.updated_at || "-"}</p>
      </div>
    </div>
  `).join("");
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
  renderErpSettings();
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
  const status = $("#erpSettingsStatus");
  if (status) {
    const enabled = settings.enabled ? "已启用" : "未启用";
    const auto = settings.auto_sync ? "自动同步开启" : "手动同步为主";
    const counts = settings.last_manual_sync_at
      ? ` · 商品 ${settings.last_product_count || 0} 条/${settings.last_product_pages || 0} 页，库存 ${settings.last_stock_count || 0} 条/${settings.last_stock_pages || 0} 页`
      : "";
    const last = settings.last_manual_sync_at
      ? ` · 上次同步：${settings.last_manual_sync_at} ${settings.last_manual_sync_message || ""}`
      : "";
    status.textContent = `${settings.provider || "旺店通"} · ${enabled} · ${auto}${last}${counts}`;
  }
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
        <label><input type="checkbox" data-field="enabled" ${item.enabled === false ? "" : "checked"} /></label>
        <label><input type="checkbox" data-field="daily_required" ${item.daily_required === false ? "" : "checked"} /></label>
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
    state.storeOwners = [];
    renderOperatorOwnerOptions();
    const input = $("#storeOwnerMapText");
    const rows = $("#storeOwnerRows");
    const line = $("#storeOwnerStatus");
    if (input) input.value = "店长视角只查看自己负责的数据，平台、店铺、负责人由管理员维护。";
    if (rows) {
      rows.innerHTML = `
        <div class="action-empty">
          <div>
            <strong>负责人配置由管理员维护</strong>
            <span>如果你看不到负责店铺，请联系管理员在基础资料里分配平台、店铺和负责人。</span>
          </div>
        </div>
      `;
    }
    if (line) line.textContent = "店长视角不读取全量负责人配置";
    return;
  }
  const result = await api.storeOwners(operatorPayload());
  state.storeOwners = result.assignments || [];
  state.customPlatforms = storeOwnerPlatformOptions(state.storeOwners).filter((platform) => !BUILT_IN_PLATFORMS.includes(platform));
  renderStoreOwners();
  renderOperatorOwnerOptions();
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
    const [section, key] = input.dataset.rule.split(".");
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
  document.querySelectorAll("[data-erp-field]").forEach((input) => {
    const key = input.dataset.erpField;
    if (input.type === "checkbox") {
      next[key] = input.checked;
    } else if (key === "sync_scope") {
      next[key] = input.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    } else if (input.type === "number") {
      next[key] = input.value.trim() ? Number(input.value) : "";
    } else {
      next[key] = input.value.trim();
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
  }
  return missing;
}

async function saveErpSettings() {
  const next = structuredClone(state.rules || {});
  next.erp_api = collectErpSettings(next.erp_api || {});
  const missing = validateErpSettings(next.erp_api);
  if (missing.length) {
    showToast(`ERP 设置缺少：${missing.join("、")}`);
    return;
  }
  state.rules = await api.saveRules(operatorPayload({ rules: next }));
  renderRules();
  showToast("ERP 设置已保存");
}

function testErpSettings() {
  const settings = collectErpSettings(state.rules?.erp_api || {});
  const missing = validateErpSettings(settings);
  const status = $("#erpSettingsStatus");
  if (missing.length) {
    const message = `本地校验未通过：缺少 ${missing.join("、")}`;
    if (status) status.textContent = message;
    showToast(message);
    return;
  }
  const scope = (settings.sync_scope || []).join("、") || "未设置同步范围";
  const message = `本地校验通过：${settings.provider || "旺店通"}，${settings.auto_sync ? "自动同步开启" : "手动同步为主"}，范围：${scope}`;
  if (status) status.textContent = message;
  showToast("ERP 本地校验通过");
}

async function manualErpSync() {
  const status = $("#erpSettingsStatus");
  const next = structuredClone(state.rules || {});
  next.erp_api = collectErpSettings(next.erp_api || {});
  const missing = validateErpSettings({ ...next.erp_api, enabled: true });
  if (missing.length) {
    const message = `ERP 同步缺少：${missing.join("、")}`;
    if (status) status.textContent = message;
    showToast(message);
    return;
  }
  try {
    if (status) status.textContent = "正在同步 ERP 商品和库存...";
    state.rules = await api.saveRules(operatorPayload({ rules: next }));
    const result = await api.erpSync(operatorPayload());
    await loadRules();
    const pages = `商品 ${result.product_pages || 0} 页、库存 ${result.stock_pages || 0} 页`;
    const warnings = (result.warnings || []).length ? `；提醒：${result.warnings.join("；")}` : "";
    const message = `${result.message || "ERP 同步完成"}；${pages}${warnings}`;
    if (status) status.textContent = message;
    showToast(message);
  } catch (error) {
    const message = error.message || "ERP 同步失败";
    if (status) status.textContent = message;
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
      resultBox.innerHTML = "<strong>正在自检...</strong><span>会检查运行环境、界面绑定、角色权限、核心接口和业务测试。</span>";
    }
    const result = await api.runDoctor();
    const output = result?.output || "自检通过";
    if (resultBox) {
      resultBox.className = "check-result ok";
      resultBox.innerHTML = `<strong>自检通过</strong><span>${esc(output).replace(/\n/g, "<br />")}</span>`;
    }
    showToast("系统自检通过");
  } catch (error) {
    const message = userFacingError(error);
    if (resultBox) {
      resultBox.className = "check-result danger";
      resultBox.innerHTML = `<strong>自检未通过</strong><span>${esc(message).replace(/\n/g, "<br />")}</span>`;
    }
    showToast("系统自检未通过");
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
    const result = await api.runReadyCheck();
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
  return `新增任务 ${summary.created || 0} 条，更新任务 ${summary.updated || 0} 条，导入明细 ${summary.imported_rows || 0} 行`;
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

async function refreshAll() {
  try {
    applyOperatorToTasks();
    state.status = await api.status(operatorPayload());
    state.reports = state.status.reports || await api.reports();
    state.outputs = state.status.outputs || await api.outputs(80);
    state.rules = state.status.rules || await api.loadRules();
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
    await loadSalesCompare(false);
    await loadImportMatrix(false);
    await loadTaskSuppressions();
    await loadTasks(false);
    renderTodayDashboard();
    renderBackupReminder();
    showToast("状态已刷新");
  } catch (error) {
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

function showPage(name) {
  const pageMap = {
    today: "todayPage",
    sales: "salesPage",
    tasks: "tasksPage",
    imports: "importPage",
    reports: "reportsPage",
    masterdata: "masterDataPage",
    rules: "rulesPage",
  };
  const next = pageMap[name] ? name : "today";
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("page-active"));
  const page = $(`#${pageMap[next]}`);
  if (page) page.classList.add("page-active");
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === next));
  const active = document.querySelector(`.nav-item[data-page="${next}"] span`);
  setText("#pageTitle", active?.textContent || "今日工作台");
}

function bindEvents() {
  installImageFallbacks();
  if ($("#salesDate") && !$("#salesDate").value) $("#salesDate").value = todayDateText();
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
  $("#loadSalesBtn")?.addEventListener("click", async () => {
    await loadSales(false);
    await loadSalesCompare(false);
    showToast("销量已刷新");
  });
  $("#loadSalesHeaderBtn")?.addEventListener("click", async () => {
    state.salesFocus = "missing";
    await loadSales(false);
    await loadSalesCompare(false);
    document.querySelector("#salesEntryList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("今日销量清单已刷新");
  });
  document.querySelectorAll(".sales-focus-tabs [data-sales-focus]").forEach((button) => {
    button.addEventListener("click", () => setSalesFocus(button.dataset.salesFocus));
  });
  initializeSalesReportRange();
  document.querySelectorAll("[data-sales-range]").forEach((button) => {
    button.addEventListener("click", () => applySalesReportRange(button.dataset.salesRange));
  });
  ["#salesReportDateFrom", "#salesReportDateTo"].forEach((selector) => {
    $(selector)?.addEventListener("change", clearSalesReportRangeShortcut);
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
  $("#loadTasksBtn")?.addEventListener("click", () => loadTasks());
  $("#exportTasksBtn")?.addEventListener("click", exportTasks);
  $("#batchPushTasksBtn")?.addEventListener("click", () => pushTasks());
  $("#batchSubmitTasksBtn")?.addEventListener("click", batchSubmitTasks);
  $("#batchApproveTasksBtn")?.addEventListener("click", () => confirmTasks());
  $("#suppressTasksBtn")?.addEventListener("click", () => suppressTasks());
  $("#saveOperatorBtn")?.addEventListener("click", saveOperator);
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
  $("#saveErpSettingsBtn")?.addEventListener("click", saveErpSettings);
  $("#manualErpSyncBtn")?.addEventListener("click", manualErpSync);
  $("#testErpSettingsBtn")?.addEventListener("click", testErpSettings);
  $("#createBackupBtn")?.addEventListener("click", createBackup);
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
  $("#taskDialogForm")?.addEventListener("submit", submitTaskDialog);
  document.querySelectorAll("[data-dialog-close]").forEach((button) => button.addEventListener("click", closeTaskDialog));
  $("#taskDialog")?.addEventListener("click", (event) => {
    if (event.target?.id === "taskDialog") closeTaskDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#taskDialog")?.classList.contains("hidden")) closeTaskDialog();
  });
  $("#searchBtn")?.addEventListener("click", async () => {
    const query = $("#searchInput").value.trim();
    if (!query) return;
    const rows = await api.search(query, 80, operatorPayload());
    $("#searchRows").innerHTML = rows.map((row) => `<div class="output-row"><div><strong>${Object.values(row).slice(0, 3).join(" · ")}</strong><p>${Object.entries(row).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join("　")}</p></div></div>`).join("");
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
