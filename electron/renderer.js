const api = window.dailyOps;

const state = {
  status: null,
  reports: {},
  outputs: [],
  rules: {},
  selectedFiles: {},
  sourceProgress: {},
};

function $(selector) {
  return document.querySelector(selector);
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
    return `<div class="source-progress source-progress-pending">
      <strong>待结束上传</strong>
      <span>已上传 ${group.pending_count} 个文件，点击“结束上传”后才会正式生效。</span>
    </div>`;
  }
  return `<div class="source-progress">
    <strong>当前批次</strong>
    <span>未选择新文件。</span>
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
      <div class="table-cell"><div class="file-name" title="${latestName(group)}">${latestName(group)}</div><div class="file-meta">${group.latest?.modified || "等待上传"}</div>${renderSourceProgress(group)}</div>
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
    const item = document.createElement("div");
    item.className = `queue-item ${hasOutput ? "queue-item-done" : "queue-item-todo"}`;
    item.innerHTML = `
      <div>${index + 1}</div>
      <div class="queue-icon">${hasOutput ? "✓" : "!"}</div>
      <div><div class="queue-title">${report.name}</div><div class="queue-subtitle">${hasOutput ? latest.modified : "等待生成"}</div></div>
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
      <div class="report-latest">${latest ? `最近生成：${latest.name}<br>${latest.modified} · ${formatSize(latest.size)}` : "暂无已生成表格"}</div>
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

async function refreshAll() {
  try {
    state.status = await api.status();
    state.reports = state.status.reports || await api.reports();
    state.outputs = state.status.outputs || await api.outputs(80);
    state.rules = state.status.rules || await api.loadRules();
    renderSources(state.status.source_groups || []);
    renderReportQueue();
    renderReportCards();
    renderOutputs();
    renderRules();
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
  await refreshAll();
  showToast(`表格已生成：${result.file || ""}`);
}

function showPage(name) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("page-active"));
  if (name === "weekly" || name === "daily" || name === "monthly" || name === "overview") $("#weeklyPage").classList.add("page-active");
  if (name === "reports") $("#reportsPage").classList.add("page-active");
  if (name === "outputs") $("#outputsPage").classList.add("page-active");
  if (name === "rules") $("#rulesPage").classList.add("page-active");
  if (name === "search") $("#searchPage").classList.add("page-active");
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
  $("#generateWeeklyBtn").addEventListener("click", async () => {
    showToast("开始生成所有就绪报表");
    await api.generateWeekly();
    await refreshAll();
    showToast("本周报表已生成");
  });
  $("#saveRulesBtn").addEventListener("click", async () => {
    state.rules = collectRules();
    await api.saveRules(state.rules);
    showToast("规则已保存");
  });
  $("#searchBtn").addEventListener("click", async () => {
    const query = $("#searchInput").value.trim();
    if (!query) return;
    const rows = await api.search(query, 80);
    $("#searchRows").innerHTML = rows.map((row) => `<div class="output-row"><div><strong>${Object.values(row).slice(0, 3).join(" · ")}</strong><p>${Object.entries(row).slice(0, 8).map(([k, v]) => `${k}: ${v}`).join("　")}</p></div></div>`).join("");
  });
}

bindEvents();
refreshAll();
