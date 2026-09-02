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
      <div style="display:flex; align-items:center; gap:0.6rem;">
        <div style="text-align:right;">
          <div style="font-size:0.85rem; font-weight:700; color:#1e293b;">${this.user.name}</div>
          <div style="font-size:0.72rem; color:#64748b;">${this.user.team}</div>
        </div>
        ${roleBadge}
        <button class="btn btn-outline btn-sm" onclick="window.apiClient.logout()" style="padding:3px 8px; font-size:0.75rem; color:#ef4444; border-color:#fecaca;" title="로그아웃">
          로그아웃
        </button>
      </div>
    `;

    // Only Admin can see Audit Logs Navigation Menu
    const navLogsBtn = document.getElementById("nav-logs-btn");
    if (navLogsBtn) {
      navLogsBtn.style.display = (this.user.role === "admin") ? "flex" : "none";
    }

    // Only Admin can access Data Import, Restore, and Reset controls
    const isAdmin = this.user && this.user.role === "admin";
    const excelImportEl = document.getElementById("setting-admin-excel-import");
    const jsonRestoreEl = document.getElementById("setting-admin-json-restore");
    const factoryResetEl = document.getElementById("setting-admin-factory-reset");
    const memberNoticeEl = document.getElementById("setting-member-notice");

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

  // REST API: Admin Only Batch Update & Reset
  async batchUpdateStations(stations) {
    const res = await fetch(`${this.baseUrl}/stations/batch`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ stations })
    });
    return await res.json();
  }

  async resetStations() {
    const res = await fetch(`${this.baseUrl}/stations/reset`, {
      method: "POST",
      headers: this.getHeaders()
    });
    return await res.json();
  }
}

window.apiClient = new ApiClient();
