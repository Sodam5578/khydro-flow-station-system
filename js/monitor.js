/**
 * MonitorManager
 * Real-time Flow Observation Data Quality & Diagnostic Rule Monitor (HydroMonitor Integration)
 */
class MonitorManager {
  constructor() {
    this.data = null;
    this.issues = [];
    this.filteredIssues = [];
    this.selectedCategory = "all"; // 'all', 'DATA_MISSING', 'BATTERY_VOLTAGE', 'OTHER'
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

  isDataMissing(item) {
    if (!item) return false;
    const r = (item.ruleId || "").toUpperCase();
    const p = (item.problem || "").toLowerCase();
    const d = (item.detail || "").toLowerCase();
    return r === "ADVM-R01" || r === "EWSV-R01" || p.includes("미수신") || d.includes("미수신");
  }

  isBatteryVoltage(item) {
    if (!item) return false;
    const r = (item.ruleId || "").toUpperCase();
    const p = (item.problem || "").toLowerCase();
    const d = (item.detail || "").toLowerCase();
    return r === "ADVM-R10" || r === "EWSV-R10" || p.includes("배터리") || p.includes("battery") || d.includes("배터리");
  }

  setCategory(category) {
    this.selectedCategory = category || "all";
    const select = document.getElementById("monitor-filter-category");
    if (select) select.value = this.selectedCategory;
    this.updateCategoryPills();
    this.applyFilters();
  }

  onCategoryChange(val) {
    this.selectedCategory = val || "all";
    this.updateCategoryPills();
    this.applyFilters();
  }

  updateCategoryPills() {
    const pills = document.querySelectorAll(".btn-filter-pill");
    pills.forEach(pill => {
      if (pill.dataset.category === this.selectedCategory) {
        pill.classList.add("active");
      } else {
        pill.classList.remove("active");
      }
    });

    const totalCount = this.issues.length;
    const missingCount = this.issues.filter(i => this.isDataMissing(i)).length;
    const batteryCount = this.issues.filter(i => this.isBatteryVoltage(i)).length;
    const otherCount = this.issues.filter(i => !this.isDataMissing(i) && !this.isBatteryVoltage(i)).length;

    const elAll = document.getElementById("pill-count-all");
    const elMissing = document.getElementById("pill-count-missing");
    const elBattery = document.getElementById("pill-count-battery");
    const elOther = document.getElementById("pill-count-other");

    if (elAll) elAll.textContent = totalCount;
    if (elMissing) elMissing.textContent = missingCount;
    if (elBattery) elBattery.textContent = batteryCount;
    if (elOther) elOther.textContent = otherCount;
  }

  resetFilters() {
    this.selectedMethod = "all";
    this.selectedBasin = "all";
    this.selectedStatus = "all";
    this.selectedCategory = "all";
    this.searchTerm = "";

    const methodSelect = document.getElementById("monitor-filter-method");
    if (methodSelect) methodSelect.value = "all";

    const basinSelect = document.getElementById("monitor-filter-basin");
    if (basinSelect) basinSelect.value = "all";

    const statusSelect = document.getElementById("monitor-filter-status");
    if (statusSelect) statusSelect.value = "all";

    const catSelect = document.getElementById("monitor-filter-category");
    if (catSelect) catSelect.value = "all";

    const searchInput = document.getElementById("monitor-search-input");
    if (searchInput) searchInput.value = "";

    this.updateCategoryPills();
    this.applyFilters();
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
        this.updateCategoryPills();
        this.applyFilters();

        // Refresh GIS markers if map is initialized (force count label rebuild with new issue stats)
        if (window.gisManager && window.gisManager.map) {
          window.gisManager.renderMarkers(true);
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
    const catSelect = document.getElementById("monitor-filter-category");
    if (catSelect) {
      this.selectedCategory = catSelect.value;
      this.updateCategoryPills();
    }

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

    // 1. Category Filter
    if (this.selectedCategory === "DATA_MISSING") {
      result = result.filter(i => this.isDataMissing(i));
    } else if (this.selectedCategory === "BATTERY_VOLTAGE") {
      result = result.filter(i => this.isBatteryVoltage(i));
    } else if (this.selectedCategory === "OTHER") {
      result = result.filter(i => !this.isDataMissing(i) && !this.isBatteryVoltage(i));
    }

    // 2. Method Filter
    if (this.selectedMethod !== "all") {
      result = result.filter(i => i.method === this.selectedMethod);
    }

    // 3. Basin Filter
    if (this.selectedBasin !== "all") {
      result = result.filter(i => i.basin && i.basin.includes(this.selectedBasin));
    }

    // 4. Status Filter
    if (this.selectedStatus !== "all") {
      result = result.filter(i => i.statusType === this.selectedStatus || i.statusLabel === this.selectedStatus);
    }

    // 5. Search Text Filter
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

      // Specific Category Pill Badge
      let categoryBadge = "";
      if (this.isDataMissing(item)) {
        categoryBadge = `<span class="badge" style="background:#ffedd5; color:#c2410c; font-size:0.72rem; margin-right:4px; font-weight:700;">📡 미수신</span>`;
      } else if (this.isBatteryVoltage(item)) {
        categoryBadge = `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-size:0.72rem; margin-right:4px; font-weight:700;">🔋 배터리</span>`;
      }

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
            <div style="font-weight:700; color:#b91c1c; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
              ${categoryBadge}
              <span>${item.problem}</span>
            </div>
            <div style="font-size:0.75rem; color:#475569; margin-top:2px;">${item.detail}</div>
          </td>
          <td style="text-align:center;">
            <b style="color:#b91c1c;">${item.continuousCount}회</b>
          </td>
          <td style="text-align:center;">
            <div style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:#2563eb; border-color:#bfdbfe;" 
                      onclick="window.waterLevelManager.openModal('${item.stCode || item.stationName}')" 
                      title="실시간 수위 비교 및 편차 차트 분석">
                📊 수위비교
              </button>
              <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:#0f766e; border-color:#99f6e4; background:#f0fdfa; font-weight:700;" 
                      onclick="window.monitorManager.openStationActionHistoryModal(${stId || "null"}, '${(item.stationName||'').replace(/'/g, "\\'")}', '${item.stCode||""}', '${item.ruleId||""}', '${(item.problem||'').replace(/'/g, "\\'")}', '${(item.detail||'').replace(/'/g, "\\'")}', ${item.continuousCount||1})" 
                      title="이 지점의 과거 조치 이력 확인 및 관리">
                📜 조치이력
              </button>
              <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:#b91c1c; border-color:#fecaca; background:#fef2f2; font-weight:700;" 
                      onclick="window.monitorManager.openQuickActionRegister(${stId || "null"}, '${(item.stationName||'').replace(/'/g, "\\'")}', '${item.stCode||""}', '${item.ruleId||""}', '${(item.problem||'').replace(/'/g, "\\'")}', '${(item.detail||'').replace(/'/g, "\\'")}', ${item.continuousCount||1})" 
                      title="이 이상 항목에 대한 현장/원격 조치 내역 즉시 등록">
                ✍️ 조치등록
              </button>
              ${stId ? `
                <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:#1e40af; border-color:#93c5fd; background:#eff6ff; font-weight:700;" onclick="window.equipmentManager.navigateToStation(${stId}, '${(item.stationName||'').replace(/'/g, "\\'")}', 'devices')" title="해당 지점의 장비 목록 및 교체이력 조회">
                  🛠️ 장비
                </button>
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

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  getActionTypeBadge(type) {
    if (window.maintenanceHistoryManager) {
      return window.maintenanceHistoryManager.getActionTypeBadge(type);
    }
    const colorMap = {
      "정기점검": { bg: "#eff6ff", text: "#1d4ed8" },
      "긴급보수": { bg: "#fef2f2", text: "#dc2626" },
      "부품교체": { bg: "#f0fdf4", text: "#15803d" },
      "수위계정비": { bg: "#fdf4ff", text: "#a21caf" },
      "통신/전원조치": { bg: "#fff7ed", text: "#c2410c" },
      "정도검정": { bg: "#ecfeff", text: "#0e7490" },
      "기타": { bg: "#f8fafc", text: "#475569" }
    };
    const c = colorMap[type] || colorMap["기타"];
    return `<span class="badge" style="background:${c.bg}; color:${c.text}; font-weight:700; font-size:0.75rem;">${this.escapeHtml(type || "점검")}</span>`;
  }

  getResultStatusBadge(status) {
    if (window.maintenanceHistoryManager) {
      return window.maintenanceHistoryManager.getResultStatusBadge(status);
    }
    const colorMap = {
      "완료": { bg: "#dcfce7", text: "#166534", label: "✅ 완료" },
      "진행중": { bg: "#fef9c3", text: "#854d0e", label: "🔄 진행중" },
      "추가조치필요": { bg: "#fee2e2", text: "#991b1b", label: "⚠️ 추가조치" },
      "자재발주대기": { bg: "#e0e7ff", text: "#3730a3", label: "📦 발주대기" }
    };
    const c = colorMap[status] || { bg: "#f1f5f9", text: "#475569", label: status || "-" };
    return `<span class="badge" style="background:${c.bg}; color:${c.text}; font-weight:700; font-size:0.75rem;">${c.label}</span>`;
  }

  // ==========================================
  // STATION ACTION HISTORY & MODAL INTEGRATION
  // ==========================================
  async openStationActionHistoryModal(stationId, stationName, stCode, ruleId, problem, detail, count) {
    const allStations = window.dataManager ? window.dataManager.getAll() : [];
    let station = null;

    if (stationId) {
      station = allStations.find(s => s.id === parseInt(stationId, 10));
    }
    if (!station && (stCode || stationName)) {
      station = allStations.find(s => 
        (stCode && String(s.code) === String(stCode)) || 
        (stationName && (s.name === stationName || s.name.includes(stationName)))
      );
      if (station) stationId = station.id;
    }

    this.currentStationActionId = stationId || (station ? station.id : null);
    const finalName = station ? station.name : (stationName || "관측시설");
    const finalCode = station ? (station.code || "-") : (stCode || "-");
    const finalRiver = station ? `${station.basin || ""} / ${station.river || station.region || ""}` : "-";
    const finalGauge = station ? (station.gaugeType || "-") : "-";

    // 1. Header Information
    const titleStationNameEl = document.getElementById("st-hist-modal-station-name");
    if (titleStationNameEl) titleStationNameEl.textContent = `📍 ${finalName}`;

    const metaEl = document.getElementById("st-hist-modal-station-meta");
    if (metaEl) {
      metaEl.innerHTML = `수계/하천: <b>${finalRiver}</b> | 관측소 코드: <code>${finalCode}</code> | 유속계 형식: <b>${finalGauge}</b>`;
    }

    // 2. Active Anomaly Banner
    const bannerEl = document.getElementById("st-hist-modal-anomaly-banner");
    if (bannerEl) {
      let activeIssue = null;
      if (ruleId && problem) {
        activeIssue = { ruleId, problem, detail: detail || "", count: count || 1 };
      } else if (this.issues) {
        activeIssue = this.issues.find(i => 
          (finalCode && String(i.stCode) === String(finalCode)) || 
          (finalName && (i.stationName === finalName || i.stationName?.includes(finalName)))
        );
      }

      if (activeIssue) {
        bannerEl.className = "";
        bannerEl.style.cssText = "background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 0.85rem 1rem;";
        bannerEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-weight:700; color:#b91c1c; font-size:0.95rem; display:flex; align-items:center; gap:6px;">
                <span class="badge badge-red" style="font-size:0.75rem; animation:pulseWarning 1.5s infinite;">실시간 이상 감지</span>
                <span style="font-family:monospace; background:#fee2e2; padding:2px 6px; border-radius:4px;">[${this.escapeHtml(activeIssue.ruleId)}]</span>
                <span>${this.escapeHtml(activeIssue.problem)}</span>
                <span class="badge badge-amber" style="font-size:0.72rem;">연속 ${activeIssue.count || activeIssue.continuousCount || 1}회</span>
              </div>
              <div style="font-size:0.82rem; color:#475569; margin-top:4px; line-height:1.4;">
                ${this.escapeHtml(activeIssue.detail || "관측 데이터 품질 진단 룰 위반이 지속 감지되고 있습니다.")}
              </div>
            </div>
            <button class="btn btn-primary btn-sm" style="background:#dc2626; border-color:#dc2626; font-size:0.78rem; padding:5px 12px; display:inline-flex; align-items:center; gap:4px;" 
                    onclick="window.monitorManager.openQuickActionRegister(${stationId || "null"}, '${finalName.replace(/'/g, "\\'")}', '${finalCode}', '${activeIssue.ruleId || ""}', '${(activeIssue.problem||"").replace(/'/g, "\\'")}', '${(activeIssue.detail||"").replace(/'/g, "\\'")}', ${activeIssue.count || activeIssue.continuousCount || 1})">
              ✍️ 이 이상 현상에 대한 조치 등록
            </button>
          </div>
        `;
      } else {
        bannerEl.className = "";
        bannerEl.style.cssText = "background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.75rem 1rem;";
        bannerEl.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="color:#166534; font-size:0.88rem; font-weight:700; display:flex; align-items:center; gap:8px;">
              <span style="font-size:1.1rem;">🟢</span> 
              <span>현재 실시간 관측 데이터 정상 (품질 진단 룰 위반 없음)</span>
            </div>
            <span class="badge badge-green" style="font-size:0.75rem;">정상 수신중</span>
          </div>
        `;
      }
    }

    // 3. Setup Add Button
    const addBtn = document.getElementById("st-hist-modal-add-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        window.maintenanceHistoryManager.openCreateModal(stationId, {
          stationName: finalName,
          stCode: finalCode
        });
      };
    }

    // 4. Open Modal & Refresh Data
    const modal = document.getElementById("station-action-history-modal");
    if (modal) modal.classList.add("active");

    if (stationId) {
      await this.refreshStationActionHistory(stationId);
    } else {
      const listEl = document.getElementById("st-hist-modal-list");
      if (listEl) {
        listEl.innerHTML = `<div style="text-align:center; padding:2rem; color:#94a3b8;">관측소 정보가 연계되지 않아 이력을 조회할 수 없습니다.</div>`;
      }
    }
  }

  closeStationActionHistoryModal() {
    const modal = document.getElementById("station-action-history-modal");
    if (modal) modal.classList.remove("active");
    this.currentStationActionId = null;
  }

  async refreshStationActionHistory(stationId) {
    if (!stationId) return;
    const targetId = parseInt(stationId, 10);
    const listEl = document.getElementById("st-hist-modal-list");
    const countEl = document.getElementById("st-hist-modal-count");

    if (listEl) {
      listEl.innerHTML = `<div style="text-align:center; padding:2rem; color:#64748b;">⏳ 이 지점의 조치 이력을 불러오는 중...</div>`;
    }

    try {
      const res = await window.apiClient.getStationMaintenanceHistory(targetId);
      if (!res.success) throw new Error(res.message);

      const items = res.data || [];
      if (countEl) countEl.textContent = `${items.length}건`;

      if (!listEl) return;

      if (items.length === 0) {
        listEl.innerHTML = `
          <div style="padding:2.5rem 1.5rem; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; text-align:center;">
            <div style="font-size:1.8rem; margin-bottom:6px;">📜</div>
            <div style="font-size:0.92rem; font-weight:700; color:#334155;">등록된 과거 조치 및 점검 이력이 없습니다.</div>
            <div style="font-size:0.8rem; color:#64748b; margin-top:4px;">
              상단의 <b>[➕ 새 조치 내역 등록]</b> 버튼을 눌러 점검, 통신/전원 복구, 부품 교체 등의 조치 이력을 기록해보세요.
            </div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = items.map(item => {
        const typeBadge = this.getActionTypeBadge(item.action_type);
        const statusBadge = this.getResultStatusBadge(item.result_status);

        let actorBadge = "";
        if (item.actor_type?.includes("리버앤씨") || item.actor_type?.includes("RNS")) {
          actorBadge = `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:0.72rem; font-weight:700;">용역사(리버앤씨)</span>`;
        } else if (item.actor_type?.includes("기술원")) {
          actorBadge = `<span class="badge" style="background:#eff6ff; color:#1e40af; font-size:0.72rem; font-weight:700;">기술원(자체)</span>`;
        } else {
          actorBadge = `<span class="badge" style="background:#f3e8ff; color:#6b21a8; font-size:0.72rem; font-weight:700;">${this.escapeHtml(item.actor_type || "기타")}</span>`;
        }

        let dateDisplay = "";
        if (item.issue_date && item.issue_date !== item.action_date) {
          dateDisplay = `
            <span style="font-size:0.75rem; color:#dc2626; font-weight:700;" title="문제 인지일">🚨 발생 ${item.issue_date}</span>
            <span style="font-size:0.75rem; color:#64748b;">➔</span>
            <span style="font-size:0.85rem; font-weight:800; color:#0f172a;" title="조치 완료일">🛠️ 조치 ${item.action_date}</span>
          `;
        } else {
          dateDisplay = `<span style="font-size:0.85rem; font-weight:800; color:#0f172a;">📅 ${item.action_date}</span>`;
        }

        return `
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:0.85rem 1rem; box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:all 0.15s ease;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.45rem; flex-wrap:wrap; gap:6px;">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                ${dateDisplay}
                ${typeBadge}
                ${item.category ? `<span class="badge badge-gray" style="font-size:0.72rem;">🏷️ ${this.escapeHtml(item.category)}</span>` : ""}
                ${item.cause_category ? `<span class="badge" style="font-size:0.72rem; background:#fee2e2; color:#991b1b; font-weight:700;">원인: ${this.escapeHtml(item.cause_category)}</span>` : ""}
                ${item.target_equipment ? `<span class="badge badge-gray" style="font-size:0.72rem; font-weight:700; color:#1e3a8a; background:#dbeafe;">⚙️ ${this.escapeHtml(item.target_equipment)}</span>` : ""}
                ${item.action_method ? `<span class="badge" style="font-size:0.72rem; background:#e0f2fe; color:#0369a1; font-weight:700;">조치: ${this.escapeHtml(item.action_method)}</span>` : ""}
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${actorBadge}
                ${statusBadge}
                <button class="btn btn-outline btn-sm" onclick="window.maintenanceHistoryManager.openEditModal(${item.id})" style="padding:2px 7px; font-size:0.72rem;">✏️ 수정</button>
                <button class="btn btn-outline btn-sm" onclick="window.maintenanceHistoryManager.deleteRecord(${item.id}, ${targetId})" style="padding:2px 7px; font-size:0.72rem; color:#dc2626; border-color:#fca5a5;">🗑️ 삭제</button>
              </div>
            </div>

            <div style="font-size:0.88rem; color:#1e293b; line-height:1.5; white-space:pre-wrap; background:#f8fafc; padding:0.6rem 0.8rem; border-radius:6px; border:1px solid #f1f5f9;">${this.escapeHtml(item.description)}</div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem; font-size:0.78rem; color:#64748b; border-top:1px dashed #f1f5f9; padding-top:0.35rem; flex-wrap:wrap; gap:6px;">
              <div>
                ${item.worker_name ? `<span>작업자: <b>${this.escapeHtml(item.worker_name)}</b></span>` : ""}
                ${item.memo ? `<span style="margin-left:10px;">비고: <i>${this.escapeHtml(item.memo)}</i></span>` : ""}
              </div>
              <div>
                ${item.cost ? `<span style="color:#059669; font-weight:700;">비용: ₩${Number(item.cost).toLocaleString()}</span>` : ""}
              </div>
            </div>
          </div>
        `;
      }).join("");
    } catch (e) {
      console.error("refreshStationActionHistory error:", e);
      if (listEl) {
        listEl.innerHTML = `<div style="padding:1.5rem; color:#dc2626; font-size:0.85rem; text-align:center;">이력을 불러오는 중 오류가 발생했습니다: ${e.message}</div>`;
      }
    }
  }

  openQuickActionRegister(stationId, stationName, stCode, ruleId, problem, detail, count) {
    const allStations = window.dataManager ? window.dataManager.getAll() : [];
    let station = null;
    if (stationId) {
      station = allStations.find(s => s.id === parseInt(stationId, 10));
    }
    if (!station && (stCode || stationName)) {
      station = allStations.find(s => 
        (stCode && String(s.code) === String(stCode)) || 
        (stationName && (s.name === stationName || s.name.includes(stationName)))
      );
      if (station) stationId = station.id;
    }

    const isMissing = this.isDataMissing({ ruleId, problem, detail });
    const isBattery = this.isBatteryVoltage({ ruleId, problem, detail });

    let actionType = "긴급보수";
    let category = "센서·계측";
    let causeCategory = "센서 수광부 오염 / 유송잡물 걸림";
    let targetEquipment = "유속계 센서 (ADVM/EWSV)";
    let actionMethod = "센서 수광부 세척 및 유송잡물 제거";

    if (isMissing) {
      actionType = "통신/전원조치";
      category = "통신·데이터";
      causeCategory = "통신망 불안정 / 일시적 지연";
      targetEquipment = "통신 모뎀 (LTE/CDMA Router)";
      actionMethod = "단말기/RTU 원격 명령 재부팅";
    } else if (isBattery) {
      actionType = "부품교체";
      category = "전원·안전";
      causeCategory = "배터리 저전압 / 방전";
      targetEquipment = "주 전원 배터리 (DC 12V/24V)";
      actionMethod = "신품 배터리 교체";
    }

    const finalName = station ? station.name : (stationName || "관측시설");
    const today = new Date().toISOString().slice(0, 10);
    const issueSummary = ruleId ? `[실시간 이상 조치] [${ruleId}] ${problem || "관측 이상"}` : `[실시간 이상 조치] ${problem || "관측 이상"}`;
    const prefillDesc = `[원인] ${causeCategory} (${issueSummary}, 연속 ${count || 1}회) ➔ [조치] ${actionMethod} (${targetEquipment}) 완료 후 관측 데이터 정상 송수신 상태를 최종 복구·확인하였습니다.`;

    const prefill = {
      stationName: finalName,
      stCode: station ? station.code : stCode,
      ruleId,
      issueDate: today,
      actionDate: today,
      actionType,
      category,
      causeCategory,
      targetEquipment,
      actionMethod,
      actorType: "기술원(자체)",
      workerName: window.apiClient?.user?.name || "",
      resultStatus: "완료",
      description: prefillDesc,
      memo: `실시간 모니터링 룰 위반 즉시 조치 (${today})`
    };

    if (window.maintenanceHistoryManager) {
      window.maintenanceHistoryManager.openCreateModal(stationId, prefill);
    }
  }
}

window.monitorManager = new MonitorManager();
