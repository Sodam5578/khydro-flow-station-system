/**
 * ApiClient
 * Handles JWT authentication tokens, HTTP REST API calls to backend server, and automatic auth checking.
 */
class ApiClient {
  constructor() {
    this.baseUrl = "/api";
    this.token = localStorage.getItem("khydro_auth_token") || null;
    this.user = null;
    try {
      this.user = JSON.parse(localStorage.getItem("khydro_user_profile") || "null");
    } catch(e) {}
  }

  getHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async checkAuth() {
    if (!this.token) {
      this.redirectToLogin();
      return false;
    }

    try {
      const res = await fetch(`${this.baseUrl}/auth/me`, {
        headers: this.getHeaders()
      });

      if (res.status === 401) {
        this.logout();
        return false;
      }

      const data = await res.json();
      if (data.success) {
        this.user = data.user;
        localStorage.setItem("khydro_user_profile", JSON.stringify(data.user));
        this.renderUserBadge();
        return true;
      } else {
        this.logout();
        return false;
      }
    } catch(e) {
      console.warn("Server connection offline or running in static mode.", e);
      return true; // Fallback to offline mode
    }
  }

  renderUserBadge() {
    const badgeContainer = document.getElementById("header-user-badge");
    if (!badgeContainer || !this.user) return;

    const posText = this.user.position || (this.user.role === "admin" ? "관리자" : "팀원");
    const roleBadge = this.user.role === "admin" 
      ? `<span class="badge badge-purple" style="font-weight:700;">${posText}</span>` 
      : `<span class="badge badge-blue">${posText}</span>`;

    badgeContainer.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <div style="text-align:right;">
          <div style="font-size:0.85rem; font-weight:700; color:#1e293b;">${this.user.name}</div>
          <div style="font-size:0.72rem; color:#64748b;">${this.user.team}</div>
        </div>
        ${roleBadge}
        <button class="btn btn-outline btn-sm" onclick="window.app.openMyPageModal()" style="padding:4px 9px; font-size:0.76rem; font-weight:600; color:#2563eb; border-color:#bfdbfe; background:#eff6ff;" title="내 정보 및 비밀번호 변경">
          👤 마이페이지
        </button>
        <button class="btn btn-outline btn-sm" onclick="window.apiClient.logout()" style="padding:4px 8px; font-size:0.75rem; color:#ef4444; border-color:#fecaca;" title="로그아웃">
          로그아웃
        </button>
      </div>
    `;

    // Only Admin can see Audit Logs Navigation Menu
    const navLogsBtn = document.getElementById("nav-logs-btn");
    if (navLogsBtn) {
      navLogsBtn.style.display = (this.user.role === "admin") ? "flex" : "none";
    }

    // Only Admin can access Master Pack Download, Data Import, Restore, and Reset controls
    const isAdmin = this.user && this.user.role === "admin";
    const masterPackEl = document.getElementById("setting-admin-masterpack");
    const userNoticeEl = document.getElementById("setting-user-excel-notice");
    const excelImportEl = document.getElementById("setting-admin-excel-import");
    const jsonRestoreEl = document.getElementById("setting-admin-json-restore");
    const factoryResetEl = document.getElementById("setting-admin-factory-reset");
    const memberNoticeEl = document.getElementById("setting-member-notice");

    if (masterPackEl) masterPackEl.style.display = isAdmin ? "flex" : "none";
    if (userNoticeEl) userNoticeEl.style.display = isAdmin ? "none" : "block";
    if (excelImportEl) excelImportEl.style.display = isAdmin ? "block" : "none";
    if (jsonRestoreEl) jsonRestoreEl.style.display = isAdmin ? "block" : "none";
    if (factoryResetEl) factoryResetEl.style.display = isAdmin ? "block" : "none";
    if (memberNoticeEl) memberNoticeEl.style.display = isAdmin ? "none" : "block";
  }

  logout() {
    localStorage.removeItem("khydro_auth_token");
    localStorage.removeItem("khydro_user_profile");
    this.token = null;
    this.user = null;
    this.redirectToLogin();
  }

  redirectToLogin() {
    if (!window.location.pathname.endsWith("login.html")) {
      window.location.href = "login.html";
    }
  }

  // REST API: Stations
  async getStations() {
    const res = await fetch(`${this.baseUrl}/stations`, { headers: this.getHeaders() });
    return await res.json();
  }

  async addStation(stData) {
    const res = await fetch(`${this.baseUrl}/stations`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(stData)
    });
    return await res.json();
  }

  async updateStation(id, stData) {
    const res = await fetch(`${this.baseUrl}/stations/${id}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(stData)
    });
    return await res.json();
  }

  async deleteStation(id) {
    const res = await fetch(`${this.baseUrl}/stations/${id}`, {
      method: "DELETE",
      headers: this.getHeaders()
    });
    return await res.json();
  }

  // REST API: Maintenance Task Toggle
  async toggleMaintenanceTask(stationId, taskKey, isDone, note = "") {
    const res = await fetch(`${this.baseUrl}/stations/${stationId}/maintenance/toggle`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ taskKey, isDone, note })
    });
    return await res.json();
  }

  // REST API: Full Maintenance Save / Edit
  async saveMaintenance(stationId, maintenanceData) {
    const res = await fetch(`${this.baseUrl}/stations/${stationId}/maintenance/save`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ maintenance: maintenanceData })
    });
    return await res.json();
  }

  // REST API: Audit Activity Logs
  async getLogs(username = "all", actionType = "all", limit = 200) {
    const res = await fetch(`${this.baseUrl}/logs?username=${username}&actionType=${actionType}&limit=${limit}`, {
      headers: this.getHeaders()
    });
    return await res.json();
  }

  // REST API: Calibration Status Update
  async updateCalibration(stationId, status, date = "", certNo = "") {
    const res = await fetch(`${this.baseUrl}/stations/${stationId}/calibration/update`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ status, date, certNo })
    });
    return await res.json();
  }

  // REST API: Schedules Management
  async getSchedules(assignee = "all", scheduleType = "all", status = "all") {
    const res = await fetch(`${this.baseUrl}/schedules?assignee=${assignee}&scheduleType=${scheduleType}&status=${status}`, {
      headers: this.getHeaders()
    });
    return await res.json();
  }

  async createSchedule(scheduleData) {
    const res = await fetch(`${this.baseUrl}/schedules`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(scheduleData)
    });
    return await res.json();
  }

  async updateSchedule(id, scheduleData) {
    const res = await fetch(`${this.baseUrl}/schedules/${id}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(scheduleData)
    });
    return await res.json();
  }

  async deleteSchedule(id) {
    const res = await fetch(`${this.baseUrl}/schedules/${id}`, {
      method: "DELETE",
      headers: this.getHeaders()
    });
    return await res.json();
  }

  // REST API: Maintenance History (조치 이력) Management
  async getMaintenanceHistory(filters = {}) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach(k => {
      if (filters[k] !== undefined && filters[k] !== null && filters[k] !== "") {
        params.append(k, filters[k]);
      }
    });
    const res = await fetch(`${this.baseUrl}/maintenance-history?${params.toString()}`, {
      headers: this.getHeaders()
    });
    return await res.json();
  }

  async getStationMaintenanceHistory(stationId) {
    const res = await fetch(`${this.baseUrl}/stations/${stationId}/maintenance-history`, {
      headers: this.getHeaders()
    });
    return await res.json();
  }

  async createMaintenanceHistory(data) {
    const res = await fetch(`${this.baseUrl}/maintenance-history`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  async updateMaintenanceHistory(id, data) {
    const res = await fetch(`${this.baseUrl}/maintenance-history/${id}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  async deleteMaintenanceHistory(id) {
    const res = await fetch(`${this.baseUrl}/maintenance-history/${id}`, {
      method: "DELETE",
      headers: this.getHeaders()
    });
    return await res.json();
  }

  async batchImportMaintenanceHistory(records) {
    const res = await fetch(`${this.baseUrl}/maintenance-history/batch`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ records })
    });
    return await res.json();
  }

  // REST API: Admin Only Batch Update & Reset
  async batchUpdateStations(stations) {
    const res = await fetch(`${this.baseUrl}/stations/batch`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ stations })
    });
    return await res.json();
  }

  async resetStations(password) {
    const res = await fetch(`${this.baseUrl}/stations/reset`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ password })
    });
    return await res.json();
  }

  // REST API: Live Monitoring (HydroMonitor)
  async getMonitorSummary() {
    const res = await fetch(`${this.baseUrl}/monitor/summary`, { headers: this.getHeaders() });
    return await res.json();
  }

  async getMonitorIssues(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const res = await fetch(`${this.baseUrl}/monitor/issues?${query}`, { headers: this.getHeaders() });
    return await res.json();
  }

  async syncLiveMonitor() {
    const res = await fetch(`${this.baseUrl}/monitor/sync`, { method: "POST", headers: this.getHeaders() });
    return await res.json();
  }

  async getStationLiveStatus(stCode) {
    const res = await fetch(`${this.baseUrl}/monitor/station/${stCode}`, { headers: this.getHeaders() });
    return await res.json();
  }

  // REST API: Smart Email Notifications
  async getNotificationConfig() {
    const res = await fetch(`${this.baseUrl}/notifications/config`, { headers: this.getHeaders() });
    return await res.json();
  }

  async updateNotificationConfig(config) {
    const res = await fetch(`${this.baseUrl}/notifications/config`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(config)
    });
    return await res.json();
  }

  async getNotificationLogs() {
    const res = await fetch(`${this.baseUrl}/notifications/logs`, { headers: this.getHeaders() });
    return await res.json();
  }

  async sendTestNotification(targetEmail) {
    const res = await fetch(`${this.baseUrl}/notifications/test`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ targetEmail })
    });
    return await res.json();
  }

  // REST API: Real-time Water Level Comparison
  async getWaterLevelComparison(stCodeOrId, period = "24h") {
    const res = await fetch(`${this.baseUrl}/waterlevel/compare/${encodeURIComponent(stCodeOrId)}?period=${period}`, { headers: this.getHeaders() });
    return await res.json();
  }

  // REST API: User Profile & Password
  async getProfile() {
    const res = await fetch(`${this.baseUrl}/auth/profile`, { headers: this.getHeaders() });
    return await res.json();
  }

  async updateProfile(data) {
    const res = await fetch(`${this.baseUrl}/auth/profile`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  async changePassword(currentPassword, newPassword) {
    const res = await fetch(`${this.baseUrl}/auth/password`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    return await res.json();
  }

  async forgotPassword(username, email) {
    const res = await fetch(`${this.baseUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email })
    });
    return await res.json();
  }
}

window.apiClient = new ApiClient();
