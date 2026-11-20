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
    if (window.errorLedgerManager) {
      await window.errorLedgerManager.init();
    }
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

      // Find local station id & assignment
      let stId = null;
      if (window.dataManager) {
        const found = window.dataManager.getAll().find(s => String(s.code) === String(item.stCode) || s.name === item.stationName);
        if (found) stId = found.id;
      }

      const assign = window.errorLedgerManager ? window.errorLedgerManager.getStationAssignment(item.stCode, item.stationName) : null;
      const assignFormatted = (assign && assign.assigned_manager && window.errorLedgerManager)
        ? window.errorLedgerManager.formatBasinTeamManager(assign.region || item.basin, assign.assigned_team, assign.assigned_manager)
        : (assign && assign.assigned_manager ? `${assign.assigned_team ? `${assign.assigned_team}팀 ` : ""}${assign.assigned_manager}` : "");
      const assignHtml = assignFormatted
        ? `<span style="color:#0f766e; font-weight:700; margin-left:4px;">· 🏃${this.escapeHtml(assignFormatted)}</span>`
        : "";

      const activeLedger = window.errorLedgerManager ? window.errorLedgerManager.getActiveIssueForStation(item.stCode, item.stationName) : null;
      const activeLedgerHtml = activeLedger
        ? `
          <div style="margin-top:5px; padding:4px 8px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; font-size:0.74rem; display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; cursor:pointer;" onclick="window.errorLedgerManager.openEditModal(${activeLedger.id}, true)" title="클릭하여 진행중인 오류관리대장 상태를 즉시 갱신합니다">
            <span style="font-weight:800; color:#b45309;">📋 [${this.escapeHtml(activeLedger.error_status)}]</span>
            <span style="color:#0f172a; font-weight:700;">${this.escapeHtml(activeLedger.action_actor_category)} (${this.escapeHtml(activeLedger.action_request)})</span>
            ${activeLedger.duration_days !== null ? `<span style="color:#dc2626; font-weight:800;">D+${activeLedger.duration_days}일</span>` : ""}
            <span style="color:#2563eb; text-decoration:underline; font-weight:700;">갱신➔</span>
          </div>
        `
        : "";

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
            <div style="font-size:0.74rem; color:#64748b;">코드: <code>${item.stCode}</code>${assignHtml}</div>
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
            ${activeLedgerHtml}
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
                      title="이 지점의 오류관리대장 및 조치 이력 확인">
                📜 조치이력
              </button>
              <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:${activeLedger ? "#b45309" : "#b91c1c"}; border-color:${activeLedger ? "#fcd34d" : "#fecaca"}; background:${activeLedger ? "#fffbeb" : "#fef2f2"}; font-weight:800;" 
                      onclick="window.monitorManager.openQuickActionRegister(${stId || "null"}, '${(item.stationName||'').replace(/'/g, "\\'")}', '${item.stCode||""}', '${item.ruleId||""}', '${(item.problem||'').replace(/'/g, "\\'")}', '${(item.detail||'').replace(/'/g, "\\'")}', ${item.continuousCount||1})" 
                      title="오류관리대장에 5초 원클릭으로 조치 배정(용역사/출장직) 및 상태를 등록·갱신합니다">
                ${activeLedger ? "🔄 조치갱신" : "✍️ 조치등록"}
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
    const basinText = station ? (station.basin || station.region || "") : "";
    const riverText = station ? (station.river || station.region || "") : "";
    const finalRiver = (basinText && riverText && basinText !== riverText)
      ? `${basinText} / ${riverText}`
      : (basinText || riverText || "-");
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

    // 3. Setup Add Buttons
    const addBtn = document.getElementById("st-hist-modal-add-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        if (window.errorLedgerManager) {
          window.errorLedgerManager.openRegisterModal({
            stationId,
            stationName: finalName,
            stCode: finalCode,
            ruleId: ruleId || ""
          }, true);
        }
      };
    }

    const addMaintBtn = document.getElementById("st-hist-modal-add-maint-btn");
    if (addMaintBtn) {
      addMaintBtn.onclick = () => {
        if (window.maintenanceHistoryManager) {
          window.maintenanceHistoryManager.openCreateModal(stationId, {
            stationName: finalName,
            stCode: finalCode
          });
        }
      };
    }

    // Reset Filter to ALL
    this.stationModalFilter = "ALL";
    this.updateStationModalFilterUI();

    // 4. Open Modal & Refresh Data
    const modal = document.getElementById("station-action-history-modal");
    if (modal) modal.classList.add("active");

    await this.refreshStationActionHistory(stationId, finalCode, finalName);
  }

  closeStationActionHistoryModal() {
    const modal = document.getElementById("station-action-history-modal");
    if (modal) modal.classList.remove("active");
    this.currentStationActionId = null;
  }

  updateStationModalFilterUI() {
    const filter = this.stationModalFilter || "ALL";
    const tabAll = document.getElementById("st-hist-tab-all");
    const tabMon = document.getElementById("st-hist-tab-mon");
    const tabMaint = document.getElementById("st-hist-tab-maint");

    const activeStyle = "background:#1e3a8a; color:#ffffff; font-weight:800; font-size:0.78rem; padding:5px 11px; border:none; border-radius:6px;";
    const inactiveStyle = "background:#ffffff; color:#334155; font-weight:700; font-size:0.78rem; padding:5px 11px; border:1px solid #cbd5e1; border-radius:6px;";

    if (tabAll) tabAll.style.cssText = filter === "ALL" ? activeStyle : inactiveStyle;
    if (tabMon) tabMon.style.cssText = filter === "MONITORING" ? activeStyle : inactiveStyle;
    if (tabMaint) tabMaint.style.cssText = filter === "MAINTENANCE" ? activeStyle : inactiveStyle;
  }

  setStationModalSourceFilter(sourceKey) {
    this.stationModalFilter = sourceKey || "ALL";
    this.updateStationModalFilterUI();
    this.renderStationActionHistoryList();
  }

  async refreshStationActionHistory(stationId, stCode = "", stName = "") {
    const listEl = document.getElementById("st-hist-modal-list");
    const countEl = document.getElementById("st-hist-modal-count");
    const monCountEl = document.getElementById("st-hist-modal-mon-count");
    const maintCountEl = document.getElementById("st-hist-modal-maint-count");

    if (listEl) {
      listEl.innerHTML = `<div style="text-align:center; padding:2rem; color:#64748b;">⏳ 이 지점의 모니터링 조치 및 현장 유지관리 통합 이력을 불러오는 중...</div>`;
    }

    try {
      const station = (window.dataManager && stationId)
        ? window.dataManager.getAll().find(s => Number(s.id) === Number(stationId))
        : null;
      const code = stCode || (station ? station.code : "");
      const name = stName || (station ? station.name : "");

      const res = await window.apiClient.getUnifiedActionHistory({
        stationId: stationId || "",
        stationCode: code || "",
        stationName: name || ""
      });

      this.stationUnifiedData = res || {};
      this.stationUnifiedRows = (res && res.rows) || [];
      this.currentStationMeta = {
        id: stationId,
        code,
        name,
        region: station ? station.region : ""
      };

      const totalCount = (res && res.counts && res.counts.total !== undefined)
        ? res.counts.total
        : (this.stationUnifiedRows.length);
      const monCount = (res && res.counts && res.counts.monitoring !== undefined)
        ? res.counts.monitoring
        : (this.stationUnifiedRows.filter(r => r.source === "MONITORING").length);
      const maintCount = (res && res.counts && res.counts.maintenance !== undefined)
        ? res.counts.maintenance
        : (this.stationUnifiedRows.filter(r => r.source === "MAINTENANCE").length);

      if (countEl) countEl.textContent = `${totalCount}건`;
      if (monCountEl) monCountEl.textContent = `${monCount}건`;
      if (maintCountEl) maintCountEl.textContent = `${maintCount}건`;

      this.renderStationActionHistoryList();
    } catch (e) {
      console.error("refreshStationActionHistory error:", e);
      if (listEl) {
        listEl.innerHTML = `<div style="padding:1.5rem; color:#dc2626; font-size:0.85rem; text-align:center;">이력을 불러오는 중 오류가 발생했습니다: ${e.message}</div>`;
      }
    }
  }

  renderStationActionHistoryList() {
    const listEl = document.getElementById("st-hist-modal-list");
    if (!listEl) return;

    const allRows = this.stationUnifiedRows || [];
    const filter = this.stationModalFilter || "ALL";

    let rows = allRows;
    if (filter === "MONITORING") {
      rows = allRows.filter(r => r.source === "MONITORING");
    } else if (filter === "MAINTENANCE") {
      rows = allRows.filter(r => r.source === "MAINTENANCE");
    }

    if (rows.length === 0) {
      listEl.innerHTML = `
        <div style="padding:2.5rem 1.5rem; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; text-align:center;">
          <div style="font-size:1.8rem; margin-bottom:6px;">📋</div>
          <div style="font-size:0.92rem; font-weight:700; color:#334155;">
            ${filter === "MONITORING" ? "등록된 모니터링 오류 조치대장 이력이 없습니다." : (filter === "MAINTENANCE" ? "등록된 현장 유지관리·장비교체 이력이 없습니다." : "이 지점에 등록된 조치 및 유지관리 이력이 없습니다.")}
          </div>
          <div style="font-size:0.8rem; color:#64748b; margin-top:5px; line-height:1.5;">
            상단의 <b>[✍️ 모니터링 조치 등록]</b> 또는 <b>[🛠️ 현장 유지관리·교체 등록]</b> 버튼으로<br>
            원격 품질 이상 조치 또는 현장 출동·부품 교체 내역을 기록해보세요.
          </div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = rows.map((item, idx) => {
      const isMon = item.source === "MONITORING";
      const isUnres = item.is_unresolved;
      
      // Source & Status Badges
      let sourceBadge = "";
      let statusBadge = "";
      let borderStyle = "";

      if (isMon) {
        sourceBadge = `<span class="badge" style="background:#fee2e2; color:#991b1b; font-weight:800; font-size:0.75rem;">🛰️ 모니터링 조치</span>`;
        statusBadge = window.errorLedgerManager ? window.errorLedgerManager.getStatusBadgeHtml(item.status) : `<span class="badge badge-gray">${item.status}</span>`;
        borderStyle = isUnres ? "border:1.5px solid #fca5a5; background:#fffafa;" : "border:1px solid #e2e8f0; background:#ffffff;";
      } else {
        sourceBadge = `<span class="badge" style="background:#dcfce7; color:#15803d; font-weight:800; font-size:0.75rem;">🛠️ 현장 유지관리</span>`;
        statusBadge = `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700; font-size:0.75rem;">${this.escapeHtml(item.status || "조치완료")}</span>`;
        borderStyle = "border:1px solid #bbf7d0; background:#ffffff;";
      }

      // Actor Badge
      let actorBadge = "";
      if (item.actor_category?.includes("용역사") || item.actor_category?.includes("RNS")) {
        actorBadge = `<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:700; font-size:0.72rem;">용역사(RNS)</span>`;
      } else if (item.actor_category?.includes("내부") || item.actor_category?.includes("담당팀")) {
        actorBadge = `<span class="badge" style="background:#eff6ff; color:#1e40af; font-weight:700; font-size:0.72rem;">내부출장직</span>`;
      } else if (item.actor_category) {
        actorBadge = `<span class="badge badge-gray" style="font-size:0.72rem;">${this.escapeHtml(item.actor_category)}</span>`;
      }

      // Date Display
      let dateText = `📅 ${item.date || "-"}`;
      if (item.subDate && item.subDate !== item.date) {
        dateText = `🚨 발생: <b>${item.date}</b> <span style="color:#64748b;">➔</span> 🏁 종료: <b>${item.subDate}</b>`;
      }

      return `
        <div style="${borderStyle} border-radius:8px; padding:0.85rem 1rem; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.45rem; flex-wrap:wrap; gap:6px;">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              ${sourceBadge}
              <span style="font-size:0.83rem; font-weight:800; color:#0f172a;">${dateText}</span>
              ${item.code ? `<span class="badge" style="font-family:monospace; font-weight:800; background:#f1f5f9; color:#334155; font-size:0.74rem;">${this.escapeHtml(item.code)}</span>` : ""}
              <span style="font-weight:700; color:#1e293b; font-size:0.88rem;">${this.escapeHtml(item.title || "")}</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              ${actorBadge}
              ${statusBadge}
              ${isMon ? `
                ${isUnres ? `<button class="btn btn-sm" onclick="window.errorLedgerManager.quickResolve(${item.id})" style="padding:2px 8px; font-size:0.72rem; background:#16a34a; color:#fff; border:none; font-weight:800;">🏁 즉시완료</button>` : ""}
                <button class="btn btn-outline btn-sm" onclick="window.errorLedgerManager.openEditModal(${item.id})" style="padding:2px 7px; font-size:0.72rem; font-weight:700;">✏️ ${isUnres ? "갱신" : "수정"}</button>
                <button class="btn btn-outline btn-sm" onclick="window.errorLedgerManager.deleteLog(${item.id})" style="padding:2px 7px; font-size:0.72rem; color:#dc2626; border-color:#fca5a5;">🗑️</button>
              ` : `
                <button class="btn btn-outline btn-sm" onclick="window.maintenanceHistoryManager ? window.maintenanceHistoryManager.openEditModal(${item.id}) : null" style="padding:2px 7px; font-size:0.72rem; font-weight:700;">✏️ 수정</button>
              `}
            </div>
          </div>

          <div style="display:flex; gap:12px; flex-wrap:wrap; font-size:0.8rem; color:#334155; background:#f8fafc; padding:0.5rem 0.75rem; border-radius:6px; border:1px solid #f1f5f9;">
            <span><b>• ${isMon ? "추정원인" : "교체장비/부품"}:</b> ${this.escapeHtml(item.cause_or_part || "-")}</span>
            <span><b>• 조치내용:</b> <b style="color:#1e40af;">${this.escapeHtml(item.action_summary || "-")}</b></span>
            ${item.worker ? `<span><b>• 실제 조치자:</b> <b style="color:#0f766e;">${this.escapeHtml(item.worker)}</b></span>` : ""}
          </div>

          ${item.detail && item.detail !== item.action_summary && item.detail !== item.cause_or_part ? `
            <div style="margin-top:0.4rem; font-size:0.8rem; color:#475569; line-height:1.4;">
              📝 <b>상세경과:</b> ${this.escapeHtml(item.detail)}
            </div>
          ` : ""}

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.4rem; font-size:0.74rem; color:#64748b; border-top:1px dashed #e2e8f0; padding-top:0.3rem;">
            <span>구분: <b>${item.sourceLabel || (isMon ? "모니터링 오류 조치대장" : "현장 유지관리·장비교체")}</b></span>
            ${item.duration_days !== null && item.duration_days !== undefined ? `<span>이상 지속일수: <b>${item.duration_days}일</b></span>` : `<span>이력 ID: <code>${item.uid || item.id}</code></span>`}
          </div>
        </div>
      `;
    }).join("");
  }

  exportStationUnifiedHistoryExcel() {
    if (!window.XLSX) {
      alert("엑셀 생성 라이브러리(SheetJS)가 로드되지 않았습니다.");
      return;
    }

    const rows = this.stationUnifiedRows || [];
    const meta = this.currentStationMeta || {};
    const stationName = meta.name || "관측시설";

    if (rows.length === 0) {
      alert("다운로드할 조치 및 유지관리 이력이 없습니다.");
      return;
    }

    const wb = window.XLSX.utils.book_new();

    // 1. Unified Sheet
    const unifiedData = [
      ["No", "구분", "발생/작업일자", "완료/확인일자", "관측소명", "관측소코드", "규칙코드/작업유형", "명칭/과업명", "추정원인/교체장비", "조치내용 요약", "조치주체", "실제 조치자", "상태", "지속일수", "상세내용"],
      ...rows.map((r, i) => [
        i + 1,
        r.sourceLabel || (r.source === "MONITORING" ? "모니터링 조치" : "현장 유지관리"),
        r.date || "",
        r.subDate || "",
        r.station_name || meta.name || "",
        r.station_code || meta.code || "",
        r.code || "",
        r.title || "",
        r.cause_or_part || "",
        r.action_summary || "",
        r.actor_category || "",
        r.worker || "",
        r.status || "",
        r.duration_days !== null && r.duration_days !== undefined ? r.duration_days : "",
        r.detail || ""
      ])
    ];
    const wsUnified = window.XLSX.utils.aoa_to_sheet(unifiedData);
    window.XLSX.utils.book_append_sheet(wb, wsUnified, "1.지점_통합타임라인");

    // 2. Monitoring Sheet
    const monRows = rows.filter(r => r.source === "MONITORING");
    if (monRows.length > 0) {
      const monData = [
        ["No", "발생일자", "확인일자", "종료일자", "오류코드", "오류명칭", "현상", "추정원인", "조치요청내용", "조치구분", "실제 조치자", "상태", "지속일수", "비고"],
        ...monRows.map((r, i) => [
          i + 1,
          r.date || "",
          r.subDate || "",
          r.is_unresolved ? "미종료" : (r.subDate || ""),
          r.code || "",
          r.title || "",
          r.phenomenon || "",
          r.cause_or_part || "",
          r.action_summary || "",
          r.actor_category || "",
          r.worker || "",
          r.status || "",
          r.duration_days !== null && r.duration_days !== undefined ? r.duration_days : "",
          r.detail || ""
        ])
      ];
      const wsMon = window.XLSX.utils.aoa_to_sheet(monData);
      window.XLSX.utils.book_append_sheet(wb, wsMon, "2.모니터링_오류대장");
    }

    // 3. Maintenance Sheet
    const maintRows = rows.filter(r => r.source === "MAINTENANCE");
    if (maintRows.length > 0) {
      const maintData = [
        ["No", "작업일자", "작업유형", "작업제목", "교체장비/부품", "작업내용 요약", "작업자/업체", "결과상태", "상세내역"],
        ...maintRows.map((r, i) => [
          i + 1,
          r.date || "",
          r.code || "",
          r.title || "",
          r.cause_or_part || "",
          r.action_summary || "",
          r.worker || r.actor_category || "",
          r.status || "",
          r.detail || ""
        ])
      ];
      const wsMaint = window.XLSX.utils.aoa_to_sheet(maintData);
      window.XLSX.utils.book_append_sheet(wb, wsMaint, "3.현장유지관리_장비교체");
    }

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = `${stationName}_모니터링_유지관리_통합이력_${todayStr}.xlsx`;
    window.XLSX.writeFile(wb, fileName);
  }

  openQuickActionRegister(stationId, stationName, stCode, ruleId, problem, detail, count) {
    if (window.errorLedgerManager) {
      window.errorLedgerManager.openRegisterModal({
        stationId,
        stationName,
        stCode,
        ruleId,
        problem,
        detail,
        count
      });
    }
  }
}

window.monitorManager = new MonitorManager();
