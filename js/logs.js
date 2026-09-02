/**
 * LogsManager
 * Manages system audit trails, user activity logs, and real-time history tracking.
 */
class LogsManager {
  constructor() {
    this.logs = [];
    this.filterUser = "all";
    this.filterAction = "all";
  }

  async init() {
    this.bindEvents();
    await this.fetchLogs();
  }

  bindEvents() {
    const userSelect = document.getElementById("log-filter-user");
    if (userSelect) {
      userSelect.addEventListener("change", (e) => {
        this.filterUser = e.target.value;
        this.renderTable();
      });
    }

    const actionSelect = document.getElementById("log-filter-action");
    if (actionSelect) {
      actionSelect.addEventListener("change", (e) => {
        this.filterAction = e.target.value;
        this.renderTable();
      });
    }
  }

  async fetchLogs() {
    if (!window.apiClient) return;
    try {
      const res = await window.apiClient.getLogs(this.filterUser, this.filterAction, 200);
      if (res && res.success) {
        this.logs = res.data;
        this.renderKPIs();
        this.renderTable();
      }
    } catch(e) {
      console.error("Failed to fetch logs:", e);
    }
  }

  renderKPIs() {
    const totalLogsEl = document.getElementById("kpi-log-total");
    if (totalLogsEl) totalLogsEl.textContent = `${this.logs.length}건`;

    const maintLogsCount = this.logs.filter(l => l.action_type === "유지관리").length;
    const maintLogsEl = document.getElementById("kpi-log-maint");
    if (maintLogsEl) maintLogsEl.textContent = `${maintLogsCount}건`;

    const calibLogsCount = this.logs.filter(l => l.action_type === "유속계 검정").length;
    const calibLogsEl = document.getElementById("kpi-log-calib");
    if (calibLogsEl) calibLogsEl.textContent = `${calibLogsCount}건`;
  }

  renderTable() {
    const tbody = document.getElementById("log-table-body");
    const countEl = document.getElementById("log-table-count");
    if (!tbody) return;

    let filtered = [...this.logs];

    if (this.filterUser !== "all") {
      filtered = filtered.filter(l => l.username === this.filterUser);
    }

    if (this.filterAction !== "all") {
      filtered = filtered.filter(l => l.action_type === this.filterAction);
    }

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2.5rem; color:#94a3b8;">기록된 작업 이력이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((log, idx) => {
      let actionBadge = `<span class="badge badge-blue">${log.action_type}</span>`;
      if (log.action_type === "유지관리") actionBadge = `<span class="badge badge-amber">🛠️ 유지관리</span>`;
      if (log.action_type === "유속계 검정") actionBadge = `<span class="badge badge-purple">🎯 유속계 검정</span>`;
      if (log.action_type === "관측소등록") actionBadge = `<span class="badge badge-green">➕ 신규등록</span>`;
      if (log.action_type === "제원수정") actionBadge = `<span class="badge badge-cyan">✏️ 제원수정</span>`;
      if (log.action_type === "로그인") actionBadge = `<span class="badge badge-blue">🔑 로그인</span>`;

      const formattedDate = log.created_at ? log.created_at.replace("T", " ").slice(0, 19) : "-";

      return `
        <tr>
          <td><span style="font-size:0.8rem; color:#64748b;">#${log.id}</span></td>
          <td style="white-space:nowrap; font-size:0.82rem; color:#475569;"><b>${formattedDate}</b></td>
          <td>
            <div style="font-weight:700; color:#1e293b;">
              ${log.name} <span style="font-size:0.75rem; color:#64748b; font-weight:500;">(${log.position || "팀원"})</span>
            </div>
            <div style="font-size:0.72rem; color:#94a3b8;">ID: ${log.username}</div>
          </td>
          <td>${actionBadge}</td>
          <td><b>${log.target_name || "-"}</b></td>
          <td style="font-size:0.85rem; color:#334155;">${log.details || "-"}</td>
        </tr>
      `;
    }).join("");
  }
}

window.logsManager = new LogsManager();
