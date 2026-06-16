const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dailyOps", {
  status: () => ipcRenderer.invoke("api:status"),
  outputs: (limit) => ipcRenderer.invoke("api:outputs", limit),
  reports: () => ipcRenderer.invoke("api:reports"),
  sourceGroups: () => ipcRenderer.invoke("api:source-groups"),
  selectFiles: (group) => ipcRenderer.invoke("api:select-files", group),
  uploadSource: (group, filePaths) => ipcRenderer.invoke("api:upload-source", group, filePaths),
  finishUpload: (category) => ipcRenderer.invoke("api:finish-upload", category),
  clearUpload: (category) => ipcRenderer.invoke("api:clear-upload", category),
  generateWeekly: () => ipcRenderer.invoke("api:generate-weekly"),
  generateReport: (reportId, version) => ipcRenderer.invoke("api:generate-report", reportId, version),
  openOutput: (name) => ipcRenderer.invoke("api:open-output", name),
  revealOutput: (name) => ipcRenderer.invoke("api:reveal-output", name),
  loadRules: () => ipcRenderer.invoke("api:load-rules"),
  saveRules: (rules) => ipcRenderer.invoke("api:save-rules", rules),
  search: (query, limit) => ipcRenderer.invoke("api:search", query, limit),
});
