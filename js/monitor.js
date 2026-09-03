/**
 * MonitorManager
 * Real-time Flow Observation Data Quality & Diagnostic Rule Monitor (HydroMonitor Integration)
 */
class MonitorManager {
  constructor() {
    this.data = null;
    this.issues = [];
    this.filteredIssues = [];
    this.selectedMethod = "all";
    this.selectedBasin = "all";
    this.selectedStatus = "all";
    this.searchTerm = "";
    this.pollingInterval = 60 * 1000; // 60s
    this.timer = null;
  }

  async init() {
    this.bindEvents();
    await this.loadData();
    if (!this.timer) {
      this.timer = setInterval(() => this.loadData(true), this.pollingInterval);
    }
  }

  bindEvents() {
    const searchInput = document.getElementById("monitor-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        this.applyFilters();
      });
    }
  }

  async loadData(isSilent = false) {
    if (!window.apiClient) return;

    try {
      const res = await window.apiClient.getMonitorSummary();
      if (res.success) {
        this.data = res;
        this.issues = res.issues || [];
        window.liveMonitorData = res;
        window.liveIssuesMap = res.stationIssuesMap || {};

        this.renderKPIs();
        this.applyFilters();

        // Refresh GIS markers if map is initialized
        if (window.gisManager && window.gisManager.map) {
          window.gisManager.renderMarkers();
        }

        const timeEl = document.getElementById("monitor-target-time");
        if (timeEl && res.targetTime) {
          timeEl.textContent = res.targetTime;
        }

        const syncTimeEl = document.getElementById("monitor-last-sync-time");
        if (syncTimeEl && res.lastSyncTime) {
          const dt = new Date(res.lastSyncTime);
          syncTimeEl.textContent = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}:${dt.getSeconds().toString().padStart(2, "0")}`;
        }
      }
    } catch (e) {
      console.error("Failed to fetch live monitor data:", e);
      if (!isSilent && window.app) {
        window.app.showToast("실시간 모니터링 데이터를 불러오는데 실패했습니다.", "error");
      }
    }
  }

  async syncNow() {
    if (!window.apiClient) return;
    if (window.app) window.app.showToast("실시간 관측 서버와 동기화 중...", "info");
    
    const syncBtn = document.getElementById("monitor-btn-sync");
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.textContent = "🔄 갱신 중...";
    }

    try {
      const res = await window.apiClient.syncLiveMonitor();
      if (res.success) {
        if (window.app) window.app.showToast(res.message || "동기화 완료!", "success");
        await this.loadData();
      } else {
        if (window.app) window.app.showToast("동기화 오류: " + res.message, "error");
      }
    } catch (e) {
      if (window.app) window.app.showToast("동기화 실패: " + e.message, "error");
    } finally {
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.textContent = "🔄 실시간 데이터 갱신";
      }
    }
  }

  onFilterChange() {
    const methodSelect = document.getElementById("monitor-filter-method");
    if (methodSelect) this.selectedMethod = methodSelect.value;

    const basinSelect = document.getElementById("monitor-filter-basin");
    if (basinSelect) this.selectedBasin = basinSelect.value;

    const statusSelect = document.getElementById("monitor-filter-status");
    if (statusSelect) this.selectedStatus = statusSelect.value;

    this.applyFilters();
  }

  applyFilters() {
    let result = [...this.issues];

    if (this.selectedMethod !== "all") {
      result = result.filter(i => i.method === this.selectedMethod);
    }

    if (this.selectedBasin !== "all") {
      result = result.filter(i => i.basin && i.basin.includes(this.selectedBasin));
    }

    if (this.selectedStatus !== "all") {
      result = result.filter(i => i.statusType === this.selectedStatus || i.statusLabel === this.selectedStatus);
    }

    if (this.searchTerm) {
      result = result.filter(i => {
        const name = (i.stationName || "").toLowerCase();
        const code = (i.stCode || "").toLowerCase();
        const rule = (i.ruleId || "").toLowerCase();
        const prob = (i.problem || "").toLowerCase();
        const detail = (i.detail || "").toLowerCase();
        return name.includes(this.searchTerm) || code.includes(this.searchTerm) || rule.includes(this.searchTerm) || prob.includes(this.searchTerm) || detail.includes(this.searchTerm);
      });
    }

    this.filteredIssues = result;
    this.renderTable();
  }

  renderKPIs() {
    if (!this.data || !this.data.summary) return;
    const s = this.data.summary;

    const targetEl = document.getElementById("kpi-mon-target");
    const normalEl = document.getElementById("kpi-mon-normal");
    const issuesEl = document.getElementById("kpi-mon-issues");
    const issuesSubEl = document.getElementById("kpi-mon-issues-sub");
    const newEl = document.getElementById("kpi-mon-new");
    const rateEl = document.getElementById("kpi-mon-rx-rate");

    const uniqueStationCount = s.actionRequiredStations || (s.issues ? new Set(s.issues.map(i => i.stCode || i.stationName)).size : 40);
    const totalIssues = s.totalIssuesCount || (s.issues ? s.issues.length : 54);
    const normalCount = s.normalStations !== undefined ? s.normalStations : Math.max(0, (s.totalTarget || 187) - uniqueStationCount);

    if (targetEl) targetEl.textContent = `${s.totalTarget || 187}개소`;
    if (normalEl) normalEl.textContent = `${normalCount}개소`;
    if (issuesEl) issuesEl.textContent = `${uniqueStationCount}개소`;
    if (issuesSubEl) issuesSubEl.textContent = `확인·조치 필요 지점 (총 ${totalIssues}건)`;
    if (newEl) newEl.textContent = `${s.newCount || 0}건`;
    if (rateEl) rateEl.textContent = `${s.rxRate || 99.5}%`;
  }

  renderTable() {
    const tbody = document.getElementById("monitor-table-tbody");
    const countEl = document.getElementById("monitor-table-count");
    if (!tbody) return;

    const filteredUniqueStations = new Set(this.filteredIssues.map(i => i.stCode || i.stationName)).size;
    if (countEl) {
      countEl.textContent = `${filteredUniqueStations}개소 (총 ${this.filteredIssues.length}건)`;
    }

    if (this.filteredIssues.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:#94a3b8;">조건에 일치하는 실시간 룰 위반 및 이상 항목이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.filteredIssues.map((item, idx) => {
      let tagBadge = `<span class="badge badge-amber">지속</span>`;
      if (item.statusType === "new" || item.statusLabel === "신규") {
        tagBadge = `<span class="badge badge-red" style="animation:pulseWarning 1.5s infinite;">🚨 신규</span>`;
      } else if (item.statusType === "reopened" || item.statusLabel === "재발") {
        tagBadge = `<span class="badge badge-purple">⚠️ 재발</span>`;
      } else if (item.statusType === "resolved" || item.statusLabel === "해소") {
        tagBadge = `<span class="badge badge-green">✓ 해소</span>`;
      }

      let methodBadge = item.method === "ADVM" ? `<span class="badge badge-blue">ADVM</span>` : `<span class="badge badge-cyan">EWSV</span>`;

      // Find local station id
      let stId = null;
      if (window.dataManager) {
        const found = window.dataManager.getAll().find(s => String(s.code) === String(item.stCode) || s.name === item.stationName);
        if (found) stId = found.id;
      }

      return `
        <tr>
          <td style="text-align:center;"><b>${idx + 1}</b></td>
          <td style="text-align:center;">${tagBadge}</td>
          <td style="text-align:center;">${methodBadge}</td>
          <td style="text-align:center;"><b>${item.basin || "-"}</b></td>
          <td>
            <div style="font-weight:700; color:#0f172a; cursor:pointer;" onclick="${stId ? `window.modalManager.openDetail(${stId})` : ""}">
              📍 ${item.stationName}
            </div>
            <div style="font-size:0.75rem; color:#64748b;">코드: <code>${item.stCode}</code></div>
          </td>
          <td style="text-align:center;"><b>${item.sensorNo ? `No.${item.sensorNo}` : "-"}</b></td>
          <td style="text-align:center;">
            <span class="badge badge-gray" style="font-family:monospace; font-weight:700; color:#b91c1c; background:#fee2e2;">
              ${item.ruleId}
            </span>
          </td>
          <td>
            <div style="font-weight:700; color:#b91c1c;">${item.problem}</div>
            <div style="font-size:0.75rem; color:#475569; margin-top:2px;">${item.detail}</div>
          </td>
          <td style="text-align:center;">
            <b style="color:#b91c1c;">${item.continuousCount}회</b>
          </td>
          <td style="text-align:center;">
            <div style="display:flex; gap:4px; justify-content:center;">
              ${stId ? `
                <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem;" onclick="window.modalManager.openDetail(${stId})" title="제원 및 이력 조회">
                  🔍 제원
                </button>
              ` : ""}
              <button class="btn btn-primary btn-sm" style="padding:2px 6px; font-size:0.72rem; background:#dc2626; border-color:#dc2626;" 
                      onclick="window.scheduleManager.openAddModalWithStation(${stId || "null"}, '${item.stationName}', '[${item.ruleId}] ${item.problem}', '${item.detail} (연속 ${item.continuousCount}회)')" 
                      title="이 지점으로 현장점검 일정 즉시 등록">
                🚗 점검일정
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }
}

window.monitorManager = new MonitorManager();
