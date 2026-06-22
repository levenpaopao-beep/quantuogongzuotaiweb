const api = window.dailyOps;

const state = {
  status: null,
  reports: {},
  outputs: [],
  rules: {},
  selectedFiles: {},
  sourceProgress: {},
  tasks: [],
  taskSummary: {},
  reportTaskSync: {},
  reportTasks: {},
  storeOwners: [],
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
  if ($("#operatorHint")) $("#operatorHint").textContent = user ? `当前身份：${role === "admin" ? "管理员" : "店长"} · ${user}` : "未设置身份时按管理员查看";
}

function saveOperator() {
  const operator = {
    role: $("#operatorRole")?.value || "admin",
    user: $("#operatorUser")?.value.trim() || "",
  };
  localStorage.setItem("dailyOpsOperator", JSON.stringify(operator));
  applyOperatorToTasks();
  loadTasks();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
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
  $("#statusSummary").textContent = `共 ${groups.length} 个数据源`;
  $("#syncHint").textContent = groups.some((item) => item.pending_count) ? "有数据源等待结束上传" : "所有已启用的数据源均已检查完成";
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

function renderReportQueue() {
  const queue = $("#reportQueue");
  const reports = Object.entries(state.reports);
  queue.innerHTML = "";
  const completed = reports.filter(([reportId]) => latestOutputForReport(reportId)).length;
  const pending = reports.length - completed;
  $("#reportCount").textContent = `共 ${reports.length} 个报表`;
  const completionSummary = $("#completionSummary");
  if (completionSummary) {
    completionSummary.innerHTML = `<span class="done">已完成 ${completed}</span><span class="todo">未完成 ${pending}</span>`;
  }
  reports.forEach(([reportId, report], index) => {
    const latest = latestOutputForReport(reportId);
    const hasOutput = Boolean(latest);
    const taskSync = state.reportTaskSync[reportId];
    const taskLine = taskSync ? taskSyncSummary(taskSync) : reportTaskSummary(reportId);
    const item = document.createElement("div");
    item.className = `queue-item ${hasOutput ? "queue-item-done" : "queue-item-todo"}`;
    item.innerHTML = `
      <div>${index + 1}</div>
      <div class="queue-icon">${hasOutput ? "✓" : "!"}</div>
      <div><div class="queue-title">${report.name}</div><div class="queue-subtitle">${hasOutput ? latest.modified : "等待生成"}</div><div class="queue-task-sync">${taskLine}</div></div>
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

function renderReportCards() {
  const wrap = $("#reportCards");
  wrap.innerHTML = "";
  Object.entries(state.reports).forEach(([reportId, report]) => {
    const latest = latestOutputForReport(reportId);
    const card = document.createElement("div");
    card.className = "report-card";
    card.innerHTML = `
      <h3>${report.name}</h3>
      <p>${report.description || ""}</p>
      <div class="report-latest">${latest ? `最近生成：${latest.name}<br>${latest.modified} · ${formatSize(latest.size)}` : "暂无已生成表格"}<br>${reportTaskSummary(reportId)}</div>
      <div class="download-actions">
        <button class="primary-button" data-action="generate">生成表格</button>
        ${latest ? `<button class="ghost-button download-report" data-action="open">打开表格</button><button class="ghost-button" data-action="folder">打开所在文件夹</button>` : ""}
      </div>
    `;
    card.querySelector('[data-action="generate"]').addEventListener("click", () => generateReport(reportId));
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
  const operator = currentOperator();
  return {
    role: operator.role || $("#taskRole")?.value || "admin",
    user: operator.user || $("#taskUser")?.value.trim() || "",
    status: $("#taskStatus")?.value || "",
    task_type: $("#taskType")?.value || "",
    store: $("#taskStore")?.value.trim() || "",
    platform: "",
    overdue: $("#taskOverdue")?.checked ? "1" : "",
  };
}

function renderTaskSummary() {
  const wrap = $("#taskSummary");
  if (!wrap) return;
  const summary = state.taskSummary || {};
  const status = summary.by_status || {};
  const overdue = summary.overdue || {};
  const cards = [
    ["全部任务", summary.total || 0],
    ["待店长处理", status["待店长处理"] || 0],
    ["待管理员审核", status["待管理员审核"] || 0],
    ["超时未处理", overdue.total || 0],
    ["已通过", status["已通过"] || 0],
    ["未分配", summary.unassigned || 0],
  ];
  wrap.innerHTML = cards.map(([label, value]) => `<div class="task-kpi"><span>${label}</span><strong>${value}</strong></div>`).join("");
  renderOwnerTaskSummary();
}

function renderOwnerTaskSummary() {
  const wrap = $("#ownerTaskSummary");
  if (!wrap) return;
  const ownerStatus = state.taskSummary?.owner_status || {};
  const rows = Object.values(ownerStatus).sort((a, b) => (b.total || 0) - (a.total || 0));
  if (!rows.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = rows.map((item) => {
    const status = item.by_status || {};
    return `<div class="task-kpi"><span>负责人待办：${item.owner || ""}</span><strong>${item.total || 0}</strong><p>待店长 ${status["待店长处理"] || 0} / 待审核 ${status["待管理员审核"] || 0} / 超时 ${item.overdue || 0} / 已完成 ${status["已完成"] || 0}</p></div>`;
  }).join("");
}

function taskBadge(status) {
  if (status === "待管理员审核") return "status-warn";
  if (status === "已通过" || status === "已完成") return "status-ok";
  if (status === "已驳回") return "status-danger";
  return "";
}

function taskSourceText(task) {
  const source = [task.source_report, task.source_file].filter(Boolean).join(" / ");
  const row = task.source_row ? ` #${task.source_row}` : "";
  return `来源：${source || "-"}${row}`;
}

function taskActionButtons(task) {
  const operator = currentOperator();
  const historyButton = `<button class="tool-button" data-action="history" data-id="${task.id}">查看记录</button>`;
  const submitButton = `<button class="tool-button" data-action="submit" data-id="${task.id}">店长填写</button>`;
  if (operator.role === "owner") {
    return `${historyButton}${submitButton}<span class="file-meta">店长只能填写自己负责的任务</span>`;
  }
  return `${historyButton}<button class="tool-button" data-action="assign" data-id="${task.id}">指派负责人</button>${submitButton}<button class="tool-button primary-mini" data-action="approve" data-id="${task.id}">管理员审核</button><button class="tool-button" data-action="done" data-id="${task.id}">标记完成</button><button class="tool-button danger-mini" data-action="reject" data-id="${task.id}">驳回</button>`;
}

function renderTaskCenter() {
  renderTaskSummary();
  const rows = $("#taskRows");
  if (!rows) return;
  if (!state.tasks.length) {
    rows.innerHTML = `<div class="task-empty">暂无任务。生成爆旺、低分、滞销或议价报表后，系统会自动写入任务台账。</div>`;
    return;
  }
  rows.innerHTML = state.tasks.map((task) => `
    <div class="task-row">
      <div><span class="status-pill ${taskBadge(task.status)}">${task.status || ""}</span></div>
      <div>${task.platform || ""}<br><span class="file-meta">${task.task_type || ""}</span><br><span class="file-meta">${taskSourceText(task)}</span></div>
      <div>${task.store || ""}<br><span class="file-meta">${task.owner || ""}</span></div>
      <div class="task-product"><strong>${task.product_name || task.merchant_code || task.skc || task.spu || ""}</strong><span>${[task.merchant_code, task.skc, task.spu].filter(Boolean).join(" ")}</span></div>
      <div>${task.system_action || ""}<br><span class="file-meta">${task.task_detail || ""}</span></div>
      <div>${task.owner_action || "-"}<br><span class="file-meta">${task.owner_remark || ""}</span></div>
      <div>${task.admin_decision || "-"}<br><span class="file-meta">${task.admin_remark || ""}</span></div>
      <div class="task-actions">${taskActionButtons(task)}</div>
    </div>`).join("");
  rows.querySelectorAll('[data-action="history"]').forEach((button) => button.addEventListener("click", () => showTaskHistory(button.dataset.id)));
  rows.querySelectorAll('[data-action="assign"]').forEach((button) => button.addEventListener("click", () => assignTask(button.dataset.id)));
  rows.querySelectorAll('[data-action="submit"]').forEach((button) => button.addEventListener("click", () => submitTask(button.dataset.id)));
  rows.querySelectorAll('[data-action="approve"]').forEach((button) => button.addEventListener("click", () => reviewTask(button.dataset.id, "通过")));
  rows.querySelectorAll('[data-action="done"]').forEach((button) => button.addEventListener("click", () => doneTask(button.dataset.id)));
  rows.querySelectorAll('[data-action="reject"]').forEach((button) => button.addEventListener("click", () => reviewTask(button.dataset.id, "驳回")));
}

function showTaskHistory(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const title = `操作记录：${task.product_name || task.merchant_code || task.skc || task.spu || task.id}`;
  const history = task.history || [];
  if (!history.length) {
    window.alert(`${title}\n暂无操作记录`);
    return;
  }
  const lines = history.map((item) => `${item.time || ""} ${item.event || ""}\n操作人：${item.actor || "-"}\n动作：${item.action || "-"}\n备注：${item.remark || "-"}`);
  window.alert(`${title}\n\n${lines.join("\n\n")}`);
}

async function loadTasks(showToastOnDone = true) {
  const line = $("#taskStatusLine");
  if (line) line.textContent = "正在读取任务...";
  const result = await api.tasks(taskFilters());
  state.taskSummary = result.summary || {};
  state.tasks = result.tasks || [];
  renderTaskCenter();
  if (line) line.textContent = `当前筛选 ${state.tasks.length} 条任务`;
  if (showToastOnDone) showToast("任务已刷新");
}

async function submitTask(id) {
  const actor = $("#taskUser")?.value.trim() || window.prompt("填写人") || "";
  if (!actor) return;
  const action = window.prompt("店长填写处理动作，例如：已下架、申请退货、继续观察、同意议价");
  if (!action) return;
  const remark = window.prompt("备注") || "";
  await api.submitTask({ id, actor, action, remark });
  await loadTasks(false);
  showToast("店长填写已提交");
}

async function assignTask(id) {
  const actor = $("#taskUser")?.value.trim() || window.prompt("管理员") || "管理员";
  const owner = window.prompt("指派给负责人");
  if (!owner) return;
  const remark = window.prompt("指派备注") || "";
  await api.assignTask({ id, actor, owner, remark });
  await loadTasks(false);
  showToast("任务负责人已指派");
}

async function reviewTask(id, decision) {
  const admin = $("#taskUser")?.value.trim() || window.prompt("管理员") || "管理员";
  const remark = window.prompt(decision === "驳回" ? "管理员审核：驳回原因（必填）" : `管理员审核：${decision}`) || "";
  if (decision === "驳回" && !remark.trim()) {
    showToast("驳回任务必须填写原因");
    return;
  }
  await api.reviewTask({ id, admin, decision, remark });
  await loadTasks(false);
  showToast(`管理员审核${decision}`);
}

async function batchReviewTasks(decision) {
  const admin = $("#taskUser")?.value.trim() || window.prompt("管理员") || "管理员";
  const ids = state.tasks.filter((task) => task.status === "待管理员审核").map((task) => task.id);
  if (!ids.length) {
    showToast("当前筛选没有待管理员审核任务");
    return;
  }
  const remark = window.prompt(decision === "驳回" ? "批量驳回原因（必填）" : `批量${decision}备注`) || "";
  if (decision === "驳回" && !remark.trim()) {
    showToast("批量驳回任务必须填写原因");
    return;
  }
  const result = await api.batchReviewTasks({ ids, admin, decision, remark });
  await loadTasks(false);
  showToast(`已批量${decision} ${result.count || 0} 条任务`);
}

async function doneTask(id) {
  const actor = $("#taskUser")?.value.trim() || window.prompt("管理员") || "管理员";
  const remark = window.prompt("完成确认说明（必填）") || "";
  if (!remark.trim()) {
    showToast("标记完成必须填写确认说明");
    return;
  }
  await api.doneTask({ id, actor, remark });
  await loadTasks(false);
  showToast("任务已标记完成");
}

async function exportTasks() {
  const result = await api.exportTasks(taskFilters());
  showToast(`任务台账已导出：${result.file || ""}`);
  await refreshAll();
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
}

function renderStoreOwners(assignments = state.storeOwners) {
  const input = $("#storeOwnerMapText");
  if (!input) return;
  input.value = (assignments || []).map((item) => [item.platform || "", item.store || "", item.owner || ""].join("，")).join("\n");
  const line = $("#storeOwnerStatus");
  if (line) line.textContent = `已读取 ${(assignments || []).length} 条负责人配置`;
}

function parseStoreOwnerText() {
  const text = $("#storeOwnerMapText")?.value || "";
  return text.split(/\n+/).map((line) => {
    const parts = line.split(/[,，\t]/).map((item) => item.trim());
    return { platform: parts[0] || "", store: parts[1] || "", owner: parts[2] || "" };
  }).filter((item) => item.store && item.owner);
}

async function loadStoreOwners() {
  const result = await api.storeOwners();
  state.storeOwners = result.assignments || [];
  renderStoreOwners();
}

async function saveStoreOwners() {
  const assignments = parseStoreOwnerText();
  const result = await api.saveStoreOwners({ assignments });
  state.storeOwners = result.assignments || [];
  renderStoreOwners();
  showToast(`负责人配置已保存：${state.storeOwners.length} 条`);
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
  return next;
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
  return `已生成任务 ${item.total || 0} 条，待店长 ${status["待店长处理"] || 0} 条，待审核 ${status["待管理员审核"] || 0} 条`;
}

async function refreshAll() {
  try {
    state.status = await api.status();
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
    applyOperatorToTasks();
    await loadTasks(false);
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
    const result = await api.uploadSource(group, files);
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
    const result = await api.finishUpload(group.upload_target);
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
  await api.clearUpload(group.upload_target);
  showToast(`${group.name} 已清空待提交`);
  await refreshAll();
}

async function generateReport(reportId) {
  showToast("开始生成表格");
  const result = await api.generateReport(reportId, "V1");
  state.reportTaskSync[reportId] = result.task_sync || {};
  await refreshAll();
  showToast(`表格已生成：${result.file || ""}；${taskSyncSummary(result.task_sync)}`);
}

function showPage(name) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("page-active"));
  if (name === "weekly" || name === "daily" || name === "monthly" || name === "overview") $("#weeklyPage").classList.add("page-active");
  if (name === "reports") $("#reportsPage").classList.add("page-active");
  if (name === "outputs") $("#outputsPage").classList.add("page-active");
  if (name === "rules") $("#rulesPage").classList.add("page-active");
  if (name === "search") $("#searchPage").classList.add("page-active");
  if (name === "tasks") $("#tasksPage").classList.add("page-active");
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === name || (name === "weekly" && item.textContent === "每周工作流")));
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
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
  $("#refreshBtn").addEventListener("click", refreshAll);
  $("#loadTasksBtn").addEventListener("click", () => loadTasks());
  $("#exportTasksBtn").addEventListener("click", exportTasks);
  $("#batchApproveTasksBtn").addEventListener("click", () => batchReviewTasks("通过"));
  $("#batchRejectTasksBtn").addEventListener("click", () => batchReviewTasks("驳回"));
  $("#saveOperatorBtn").addEventListener("click", saveOperator);
  $("#generateWeeklyBtn").addEventListener("click", async () => {
    showToast("开始生成所有就绪报表");
    const result = await api.generateWeekly();
    (result.results || []).forEach((item) => {
      if (item.status === "ok") state.reportTaskSync[item.report] = item.task_sync || {};
    });
    await refreshAll();
    showToast(`本周报表已生成；${taskSyncSummary(result.task_sync)}`);
  });
  $("#saveRulesBtn").addEventListener("click", async () => {
    state.rules = collectRules();
    await api.saveRules(state.rules);
    showToast("规则已保存");
  });
  $("#loadStoreOwnersBtn").addEventListener("click", loadStoreOwners);
  $("#saveStoreOwnersBtn").addEventListener("click", saveStoreOwners);
  $("#searchBtn").addEventListener("click", async () => {
    const query = $("#searchInput").value.trim();
    if (!query) return;
    const rows = await api.search(query, 80);
    $("#searchRows").innerHTML = rows.map((row) => `<div class="output-row"><div><strong>${Object.values(row).slice(0, 3).join(" · ")}</strong><p>${Object.entries(row).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join("　")}</p></div></div>`).join("");
  });
}

bindEvents();
refreshAll();
