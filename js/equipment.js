/**
 * EquipmentManager
 * Comprehensive Asset & Equipment Management Controller (Hydro Asset Management)
 * Replaces legacy CalibrationManager with a 6-tab unified workbench.
 */
class EquipmentManager {
  constructor() {
    this.activeTab = "dashboard"; // dashboard, stations, devices, repairs, actions, export, bulkupload
    this.selectedStationId = null;
    this.stations = [];
    this.currentStationData = null;
    this.cachedDashboard = null;

    // Filters
    this.stationSearch = "";
    this.stationRegion = "all";
    this.stationFilterType = "all"; // all, calib2026, hasHistory, inRepair

    this.deviceCategory = "all";
    this.deviceStatus = "all";
    this.deviceCalibFilter = "ALL";
    this.deviceLifespanFilter = "ALL";
    this.deviceSearch = "";
    this.devicePage = 1;
    this.deviceLimit = 50;
    this.deviceTotal = 0;
    this.deviceTotalPages = 1;

    this.repairStage = "all";
    this.repairSearch = "";

    this.actionCode = "ALL";
    this.actionStationId = "all";
    this.actionRegion = "all";
    this.actionSearch = "";
    this.actionViewMode = "table";
    this.cachedActions = [];

    // Bulk upload cache
    this.validatedBulkItems = [];
    this.isBulkApplying = false;
  }

  async init() {
    this.bindEvents();
    this.loadKPIs();
    this.populateActionStationDropdown();
    if (this.activeTab === "dashboard") {
      this.loadDashboard();
    } else {
      await this.loadStationsSummary();
    }
  }

  onTabActivated() {
    if (this.activeTab === "dashboard") {
      this.loadDashboard();
    } else if (this.activeTab === "stations") {
      this.loadStationsSummary();
    } else if (this.activeTab === "devices") {
      this.loadDevices();
    } else if (this.activeTab === "repairs") {
      this.loadRepairs();
    } else if (this.activeTab === "actions") {
      this.populateActionStationDropdown();
      this.loadActions();
    }
  }

  bindEvents() {
    // Top Tabs
    const tabBtns = document.querySelectorAll(".eq-tab-btn");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const tabKey = btn.dataset.tab;
        this.switchTab(tabKey);
      });
    });

    // Station search & filters
    const stSearch = document.getElementById("eq-st-search");
    if (stSearch) {
      stSearch.addEventListener("input", (e) => {
        this.stationSearch = e.target.value.trim();
        this.loadStationsSummary();
      });
    }

    const stRegion = document.getElementById("eq-st-region");
    if (stRegion) {
      stRegion.addEventListener("change", (e) => {
        this.stationRegion = e.target.value;
        this.loadStationsSummary();
      });
    }

    // Devices search & filters
    const devSearch = document.getElementById("eq-dev-search");
    if (devSearch) {
      devSearch.addEventListener("input", (e) => {
        this.deviceSearch = e.target.value.trim();
        this.devicePage = 1;
        this.loadDevices();
      });
    }

    // Repairs search & filter
    const repSearch = document.getElementById("eq-rep-search");
    if (repSearch) {
      repSearch.addEventListener("input", (e) => {
        this.repairSearch = e.target.value.trim();
        this.loadRepairs();
      });
    }

    // Actions search & filter
    const actSearch = document.getElementById("eq-act-search");
    if (actSearch) {
      actSearch.addEventListener("input", (e) => {
        this.actionSearch = e.target.value.trim();
        this.loadActions();
      });
    }

    // Close modal station search results when clicking outside
    document.addEventListener("click", (e) => {
      ["eq-add", "eq-status", "eq-edit", "eq-work"].forEach(prefix => {
        const searchEl = document.getElementById(`${prefix}-station-search`);
        const resultsEl = document.getElementById(`${prefix}-station-results`);
        if (resultsEl && resultsEl.style.display !== "none") {
          if (searchEl && !searchEl.contains(e.target) && !resultsEl.contains(e.target)) {
            resultsEl.style.display = "none";
          }
        }
      });
    });
  }

  switchSubTab(tabKey) {
    this.switchTab(tabKey);
  }

  async navigateToStation(stationId, stationName = "", targetSection = "", targetWorkId = null) {
    if (window.modalManager && typeof window.modalManager.closeDetail === "function") {
      window.modalManager.closeDetail();
    }
    if (window.gisManager && window.gisManager.map && typeof window.gisManager.map.closePopup === "function") {
      window.gisManager.map.closePopup();
    }
    if (window.app && window.app.activeTab !== "equipment") {
      window.app.switchTab("equipment");
    }

    let targetId = stationId;
    if (!targetId || targetId === "null" || isNaN(Number(targetId))) {
      const list = this.allStations || this.stations || [];
      const match = list.find(s => s.name === stationName || (stationName && s.name && s.name.includes(stationName)));
      if (match) targetId = match.id;
    }

    if (!targetId) {
      if (window.app) window.app.showToast(`[${stationName || "선택 지점"}] 관측소 정보를 찾을 수 없습니다.`, "warning");
      return;
    }

    // Set target section flag to be scrolled to after station details render
    this.targetSectionAfterNav = targetSection;
    this.targetWorkIdAfterNav = targetWorkId;

    this.switchSubTab("stations");

    const currentList = this.stations || [];
    const existsInCurrent = currentList.some(s => s.id === Number(targetId));
    if (!existsInCurrent) {
      this.stationSearch = "";
      this.stationRegion = "all";
      this.stationFilterType = "all";
      const searchEl = document.getElementById("eq-st-search");
      if (searchEl) searchEl.value = "";
      const regionEl = document.getElementById("eq-st-region");
      if (regionEl) regionEl.value = "all";
      document.querySelectorAll(".eq-filter-pill").forEach(p => {
        if (p.dataset.filter === "all") p.classList.add("active");
        else p.classList.remove("active");
      });
      await this.loadStationsSummary();
    }

    await this.selectStation(Number(targetId), true);

    // Instant position without smooth scrolling animation
    const listEl = document.getElementById("eq-station-list");
    const activeCard = document.querySelector(`.eq-st-card[data-station-id="${targetId}"]`);
    if (listEl && activeCard) {
      const cardTop = activeCard.offsetTop;
      const listTop = listEl.offsetTop;
      listEl.scrollTop = Math.max(0, cardTop - listTop - 20);
    }
  }

  switchTab(tabKey) {
    this.activeTab = tabKey;

    // Update tab button classes & auto-scroll active tab into center on mobile
    document.querySelectorAll(".eq-tab-btn").forEach(btn => {
      if (btn.dataset.tab === tabKey) {
        btn.classList.add("active");
        if (typeof btn.scrollIntoView === "function") {
          btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      } else {
        btn.classList.remove("active");
      }
    });

    // Toggle sub-views (stations is a grid workbench!)
    const subViews = ["dashboard", "stations", "devices", "repairs", "actions", "export", "bulkupload"];
    subViews.forEach(v => {
      const el = document.getElementById(`eq-subview-${v}`);
      if (el) {
        if (v === tabKey) {
          el.style.display = (v === "stations") ? "grid" : "block";
        } else {
          el.style.display = "none";
        }
      }
    });

    // Reset window & container scroll so the active subview appears directly under tabs bar
    window.scrollTo({ top: 0, behavior: "instant" });
    const viewEquipment = document.getElementById("view-equipment");
    if (viewEquipment) viewEquipment.scrollTop = 0;
    const mainContent = document.querySelector(".main-content");
    if (mainContent) mainContent.scrollTop = 0;

    this.onTabActivated();
  }

  /**
   * Standard Lifespan (조달청 고시 제2024-30호) & Calibration Cycle Helpers
   */
  getStandardLifespan(category) {
    const map = {
      FLOWMETER: 13,
      WATER_LEVEL: 10,
      MOUNT: 12,
      CONTROL: 8,
      SHELTER: 8,
      UNDERWATER: 7,
      LIGHTNING: 7,
      CCTV: 9,
      ANCILLARY: 10,
      ETC: 10
    };
    return map[category] || 10;
  }

  getCalibCycleYears(category) {
    if (category === "FLOWMETER") return 2;
    if (category === "WATER_LEVEL") return 3;
    return 0;
  }

  calcExpireDate(recentDateStr, cycleYears) {
    if (!recentDateStr || !cycleYears) return "";
    const parts = String(recentDateStr).trim().split("-").map(Number);
    if (parts.length !== 3 || isNaN(parts[0])) return "";
    const dt = new Date(Date.UTC(parts[0] + cycleYears, parts[1] - 1, parts[2]));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().split("T")[0];
  }

  renderLifespanCell(d) {
    const acq = d.acquisition_date || "-";
    const yrs = d.lifespan_years || this.getStandardLifespan(d.category);
    const endYr = d.lifespan_end_year || (acq && /^\d{4}$/.test(String(acq)) ? (parseInt(acq, 10) + yrs) : "-");
    const isOver = Number(d.is_lifespan_over) === 1;
    const badge = isOver
      ? `<span class="badge badge-red" style="font-size:0.68rem; font-weight:700; color:#dc2626; background:#fee2e2; padding:1px 6px;">⚠️ 초과 (${endYr}년 만료)</span>`
      : `<span class="badge badge-green" style="font-size:0.68rem; font-weight:600; padding:1px 6px;">🟢 이내 (${endYr}년 만료)</span>`;
    return `
      <div style="font-size:0.78rem; line-height:1.35; text-align:center;">
        <div><b>${acq}년</b> 취득 · <b>${yrs}년</b> 기준</div>
        <div style="margin-top:2px;">${badge}</div>
      </div>
    `;
  }

  renderCalibCell(d) {
    if (d.category !== "FLOWMETER" && d.category !== "WATER_LEVEL") {
      return `<div style="text-align:center; color:#94a3b8; font-size:0.75rem;">- (비대상)</div>`;
    }
    if (d.status === "RETURNED") {
      return `
        <div style="font-size:0.75rem; color:#7e22ce; text-align:center;">
          <span class="badge" style="background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; font-weight:700; font-size:0.68rem; padding:1px 6px;">📦 반납완료 (검정제외)</span>
          <div style="color:#94a3b8; font-size:0.72rem; margin-top:2px;">자산반납 종결 설비</div>
        </div>
      `;
    }
    const cycleLabel = d.category === "FLOWMETER" ? "2년주기" : "3년주기";
    const recent = (d.recent_calib_date && d.recent_calib_date !== "-") ? d.recent_calib_date : "";
    const expire = (d.calib_expire_date && d.calib_expire_date !== "-") ? d.calib_expire_date : "";

    if (!recent && !expire) {
      return `
        <div style="font-size:0.76rem; line-height:1.35; text-align:center;">
          <div style="display:flex; justify-content:center; align-items:center; gap:4px; flex-wrap:wrap;">
            <span class="badge" style="font-size:0.68rem; font-weight:700; padding:1px 6px; color:#475569; background:#f1f5f9; border:1px solid #cbd5e1;">⚪ 검정기록 없음 (${cycleLabel})</span>
            <button type="button" class="btn btn-outline btn-sm" style="padding:0 5px; font-size:0.68rem; color:#d97706; border-color:#fde68a; background:#fffbeb; font-weight:700;" onclick="event.stopPropagation(); window.equipmentManager.openCalibModal('${d.equipment_id}')" title="이 장비의 검정 이력 누적 대장 조회 및 새 검정 등록">
              ➕ 등록
            </button>
          </div>
          <div style="color:#94a3b8; margin-top:2px; font-size:0.72rem;">
            최근검정: <i>미기재</i> | 만료: <i>미기재</i>
          </div>
        </div>
      `;
    }

    let statusBadge = `<span class="badge badge-green" style="font-size:0.68rem; font-weight:700; padding:1px 6px;">✅ 유효 (${cycleLabel})</span>`;
    if (d.calib_status === "overdue" || (expire && expire < "2026-11-03")) {
      statusBadge = `<span class="badge badge-red" style="font-size:0.68rem; font-weight:800; color:#b91c1c; background:#fee2e2; padding:1px 6px;">🚨 검정만료 (${cycleLabel})</span>`;
    } else if (d.calib_status === "due_soon" || (expire && expire >= "2026-11-03" && expire <= "2026-12-31")) {
      statusBadge = `<span class="badge badge-amber" style="font-size:0.68rem; font-weight:800; color:#b45309; background:#fef3c7; padding:1px 6px;">⏳ 금년만료 (${cycleLabel})</span>`;
    } else if (expire && expire >= "2027-01-01" && expire <= "2027-12-31") {
      statusBadge = `<span class="badge badge-blue" style="font-size:0.68rem; font-weight:700; padding:1px 6px;">📅 2027년 도래 (${cycleLabel})</span>`;
    }

    const certText = d.calib_cert_no ? `<span style="font-size:0.66rem; color:#1e40af; font-weight:700;" title="${d.calib_cert_no}">[${d.calib_cert_no}]</span>` : "";

    return `
      <div style="font-size:0.76rem; line-height:1.35; text-align:center;">
        <div style="display:flex; justify-content:center; align-items:center; gap:4px; flex-wrap:wrap;">
          ${statusBadge} ${certText}
          <button type="button" class="btn btn-outline btn-sm" style="padding:0 5px; font-size:0.68rem; color:#d97706; border-color:#fde68a; background:#fffbeb; font-weight:700;" onclick="event.stopPropagation(); window.equipmentManager.openCalibModal('${d.equipment_id}')" title="이 장비의 검정 이력 누적 대장 조회 및 새 검정 등록">
            📋 이력
          </button>
        </div>
        <div style="color:#334155; margin-top:2px;">
          검정: <code>${recent || "-"}</code> | 만료: <b style="color:${(d.calib_status === 'overdue' || d.calib_status === 'due_soon') ? '#dc2626' : '#0f172a'};">${expire || "-"}</b>
        </div>
      </div>
    `;
  }

  async loadKPIs() {
    try {
      const res = await window.apiClient.getEquipmentDashboard();
      if (res && res.success) {
        const ov = res.overview || {};
        const totalEl = document.getElementById("kpi-eq-total-count");
        if (totalEl) totalEl.textContent = `${(ov.total || 1844).toLocaleString()}점`;

        const opEl = document.getElementById("kpi-eq-operating-count");
        if (opEl) opEl.textContent = `${(ov.operating || 1727).toLocaleString()}`;

        const flowTotal = (res.flowModels || []).reduce((s, m) => s + m.total, 0);
        const waterTotal = (res.waterModels || []).reduce((s, m) => s + m.total, 0);
        const flowEl = document.getElementById("kpi-eq-flow-count");
        if (flowEl) flowEl.textContent = `${flowTotal}대`;
        const waterEl = document.getElementById("kpi-eq-water-count");
        if (waterEl) waterEl.textContent = `${waterTotal}대`;

        const calibSummary = res.calibSummary || [];
        const flowCalib = calibSummary.find(c => c.category === "FLOWMETER") || {};
        const waterCalib = calibSummary.find(c => c.category === "WATER_LEVEL") || {};

        const flowNeedEl = document.getElementById("kpi-eq-flow-need");
        if (flowNeedEl) flowNeedEl.textContent = `${flowCalib.need_calib || 0}`;
        const waterNeedEl = document.getElementById("kpi-eq-water-need");
        if (waterNeedEl) waterNeedEl.textContent = `${waterCalib.need_calib || 0}`;

        const lifeEl = document.getElementById("kpi-eq-lifespan-over-count");
        if (lifeEl) lifeEl.textContent = `${(ov.lifespan_over || 0).toLocaleString()}점`;
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * 0. Sub-View: Comprehensive Equipment Dashboard
   */
  async loadDashboard() {
    try {
      const res = await window.apiClient.getEquipmentDashboard();
      if (!res.success) {
        console.error("Dashboard stats error:", res.error);
        return;
      }
      this.cachedDashboard = res;

      // 1. Fill KPI Summary Cards
      const ov = res.overview || {};
      const elTotal = document.getElementById("dash-kpi-total");
      if (elTotal) elTotal.textContent = `${(ov.total || 0).toLocaleString()}점`;
      const elOp = document.getElementById("dash-kpi-operating");
      if (elOp) elOp.textContent = `${(ov.operating || 0).toLocaleString()}`;

      const flowTotal = (res.flowModels || []).reduce((s, m) => s + m.total, 0);
      const elFlow = document.getElementById("dash-kpi-flowmeter");
      if (elFlow) elFlow.textContent = `${flowTotal.toLocaleString()}대`;

      const waterTotal = (res.waterModels || []).reduce((s, m) => s + m.total, 0);
      const elWater = document.getElementById("dash-kpi-waterlevel");
      if (elWater) elWater.textContent = `${waterTotal.toLocaleString()}대`;

      const calibSummary = res.calibSummary || [];
      const flowCalib = calibSummary.find(c => c.category === "FLOWMETER") || {};
      const waterCalib = calibSummary.find(c => c.category === "WATER_LEVEL") || {};

      const elFlowNeed = document.getElementById("dash-kpi-flow-need");
      if (elFlowNeed) elFlowNeed.textContent = `${flowCalib.need_calib || 0}`;
      const elWaterNeed = document.getElementById("dash-kpi-water-need");
      if (elWaterNeed) elWaterNeed.textContent = `${waterCalib.need_calib || 0}`;

      const elLife = document.getElementById("dash-kpi-lifespan");
      if (elLife) elLife.textContent = `${ov.lifespan_over || 0}점`;

      // 2. Render Flowmeter Models Table
      const flowTbody = document.getElementById("dash-flowmeter-tbody");
      if (flowTbody) {
        if (!res.flowModels || res.flowModels.length === 0) {
          flowTbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem; color:#94a3b8;">유속계 모델 데이터가 없습니다.</td></tr>`;
        } else {
          flowTbody.innerHTML = res.flowModels.map((m, idx) => {
            const isNonContact = m.method.includes("비접촉");
            const methodBadge = isNonContact 
              ? `<span class="badge badge-blue" style="font-size:0.75rem; font-weight:700;">📡 ${m.method}</span>`
              : `<span class="badge badge-purple" style="font-size:0.75rem; font-weight:700;">🌊 ${m.method}</span>`;

            const sharePct = flowTotal > 0 ? ((m.total / flowTotal) * 100).toFixed(1) : "0.0";
            const barColor = isNonContact ? "#3b82f6" : "#9333ea";

            const spareHtml = m.spare > 0 ? `<span class="badge badge-amber" style="font-weight:700;">${m.spare}대</span>` : `<span style="color:#94a3b8;">-</span>`;
            const repairHtml = m.repairing > 0 ? `<span class="badge badge-red" style="font-weight:700;">${m.repairing}대</span>` : `<span style="color:#94a3b8;">-</span>`;
            const disposalHtml = m.disposal > 0 ? `<span class="badge badge-gray" style="font-weight:700;">${m.disposal}대</span>` : `<span style="color:#94a3b8;">-</span>`;
            const returnedHtml = m.returned > 0 ? `<span class="badge" style="background:#f3e8ff; color:#7e22ce; font-weight:700; border:1px solid #d8b4fe; cursor:pointer;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'FLOWMETER', search: '${m.model_name}', status: 'RETURNED' })">📦 ${m.returned}대</span>` : `<span style="color:#94a3b8;">-</span>`;
            let calibParts = [];
            if (m.calib_need > 0) {
              calibParts.push(`<span class="badge badge-amber" style="font-weight:800; color:#b45309; background:#fef3c7;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'FLOWMETER', search: '${m.model_name}', calibFilter: 'NEED_ALL' })">🎯 필요 ${m.calib_need}</span>`);
            }
            if (m.calib_valid > 0) {
              calibParts.push(`<span style="color:#16a34a; font-size:0.75rem; font-weight:700;">✅ 유효 ${m.calib_valid}</span>`);
            }
            if (m.calib_none > 0) {
              calibParts.push(`<span style="color:#64748b; font-size:0.73rem;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'FLOWMETER', search: '${m.model_name}', calibFilter: 'NO_RECORD' })">⚪ 미기재 ${m.calib_none}</span>`);
            }
            const calibHtml = calibParts.length > 0 ? calibParts.join("<br>") : `<span style="color:#94a3b8;">-</span>`;
            const lifeHtml = m.lifespan_over > 0
              ? `<span class="badge badge-red" style="font-weight:700; color:#dc2626; background:#fee2e2;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'FLOWMETER', search: '${m.model_name}', isOver: '1' })">⚠️ ${m.lifespan_over}대</span>`
              : `<span style="color:#94a3b8;">이내</span>`;

            return `
              <tr style="cursor:pointer;" onclick="window.equipmentManager.goToDevicesWithFilter({ category: 'FLOWMETER', search: '${m.model_name}' })" title="클릭 시 [${m.model_name}] 장비 상세 목록으로 이동">
                <td style="text-align:center;"><b>${idx + 1}</b></td>
                <td>
                  <b style="color:#1e3a8a; font-size:0.92rem;">${m.model_name}</b>
                </td>
                <td>${methodBadge}</td>
                <td style="text-align:right;"><b style="color:#1e40af; font-size:0.95rem;">${m.total}대</b></td>
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div style="flex:1; background:#e2e8f0; height:8px; border-radius:4px; overflow:hidden;">
                      <div style="width:${sharePct}%; background:${barColor}; height:100%;"></div>
                    </div>
                    <span style="font-size:0.75rem; color:#475569; font-weight:700; width:40px; text-align:right;">${sharePct}%</span>
                  </div>
                </td>
                <td style="text-align:center;"><b style="color:#166534;">${m.operating}대</b></td>
                <td style="text-align:center;">${spareHtml}</td>
                <td style="text-align:center;">${repairHtml}</td>
                <td style="text-align:center;">${disposalHtml}</td>
                <td style="text-align:center;">${returnedHtml}</td>
                <td style="text-align:center;">${calibHtml}</td>
                <td style="text-align:center;">${lifeHtml}</td>
                <td style="text-align:center;">
                  <button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:0.72rem; font-weight:700;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'FLOWMETER', search: '${m.model_name}' })">
                    조회 ➔
                  </button>
                </td>
              </tr>
            `;
          }).join("");
        }
      }

      // 3. Render Water Level Models Table
      const waterTbody = document.getElementById("dash-waterlevel-tbody");
      if (waterTbody) {
        if (!res.waterModels || res.waterModels.length === 0) {
          waterTbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem; color:#94a3b8;">수위계 모델 데이터가 없습니다.</td></tr>`;
        } else {
          waterTbody.innerHTML = res.waterModels.map((m, idx) => {
            const isRadar = m.method.includes("레이더");
            const methodBadge = isRadar 
              ? `<span class="badge badge-cyan" style="font-size:0.75rem; font-weight:700;">📡 ${m.method}</span>`
              : `<span class="badge badge-blue" style="font-size:0.75rem; font-weight:700;">🌊 ${m.method}</span>`;

            const sharePct = waterTotal > 0 ? ((m.total / waterTotal) * 100).toFixed(1) : "0.0";
            const barColor = isRadar ? "#06b6d4" : "#2563eb";

            const searchKey = m.clean_model === "기타/미지정" ? "" : m.clean_model;
            const spareHtml = m.spare > 0 ? `<span class="badge badge-amber" style="font-weight:700;">${m.spare}대</span>` : `<span style="color:#94a3b8;">-</span>`;
            const repairHtml = m.repairing > 0 ? `<span class="badge badge-red" style="font-weight:700;">${m.repairing}대</span>` : `<span style="color:#94a3b8;">-</span>`;
            const disposalHtml = m.disposal > 0 ? `<span class="badge badge-gray" style="font-weight:700;">${m.disposal}대</span>` : `<span style="color:#94a3b8;">-</span>`;
            const returnedHtml = m.returned > 0 ? `<span class="badge" style="background:#f3e8ff; color:#7e22ce; font-weight:700; border:1px solid #d8b4fe; cursor:pointer;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'WATER_LEVEL', search: '${searchKey}', status: 'RETURNED' })">📦 ${m.returned}대</span>` : `<span style="color:#94a3b8;">-</span>`;
            let calibParts = [];
            if (m.calib_need > 0) {
              calibParts.push(`<span class="badge badge-amber" style="font-weight:800; color:#b45309; background:#fef3c7;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'WATER_LEVEL', search: '${searchKey}', calibFilter: 'NEED_ALL' })">🎯 필요 ${m.calib_need}</span>`);
            }
            if (m.calib_valid > 0) {
              calibParts.push(`<span style="color:#16a34a; font-size:0.75rem; font-weight:700;">✅ 유효 ${m.calib_valid}</span>`);
            }
            if (m.calib_none > 0) {
              calibParts.push(`<span style="color:#64748b; font-size:0.73rem;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'WATER_LEVEL', search: '${searchKey}', calibFilter: 'NO_RECORD' })">⚪ 미기재 ${m.calib_none}</span>`);
            }
            const calibHtml = calibParts.length > 0 ? calibParts.join("<br>") : `<span style="color:#94a3b8;">-</span>`;
            const lifeHtml = m.lifespan_over > 0
              ? `<span class="badge badge-red" style="font-weight:700; color:#dc2626; background:#fee2e2;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'WATER_LEVEL', search: '${searchKey}', isOver: '1' })">⚠️ ${m.lifespan_over}대</span>`
              : `<span style="color:#94a3b8;">이내</span>`;

            return `
              <tr style="cursor:pointer;" onclick="window.equipmentManager.goToDevicesWithFilter({ category: 'WATER_LEVEL', search: '${searchKey}' })" title="클릭 시 [${m.clean_model}] 장비 상세 목록으로 이동">
                <td style="text-align:center;"><b>${idx + 1}</b></td>
                <td>
                  <b style="color:#1e3a8a; font-size:0.92rem;">${m.clean_model}</b>
                </td>
                <td>${methodBadge}</td>
                <td style="text-align:right;"><b style="color:#1e40af; font-size:0.95rem;">${m.total}대</b></td>
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div style="flex:1; background:#e2e8f0; height:8px; border-radius:4px; overflow:hidden;">
                      <div style="width:${sharePct}%; background:${barColor}; height:100%;"></div>
                    </div>
                    <span style="font-size:0.75rem; color:#475569; font-weight:700; width:40px; text-align:right;">${sharePct}%</span>
                  </div>
                </td>
                <td style="text-align:center;"><b style="color:#166534;">${m.operating}대</b></td>
                <td style="text-align:center;">${spareHtml}</td>
                <td style="text-align:center;">${repairHtml}</td>
                <td style="text-align:center;">${disposalHtml}</td>
                <td style="text-align:center;">${returnedHtml}</td>
                <td style="text-align:center;">${calibHtml}</td>
                <td style="text-align:center;">${lifeHtml}</td>
                <td style="text-align:center;">
                  <button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:0.72rem; font-weight:700;" onclick="event.stopPropagation(); window.equipmentManager.goToDevicesWithFilter({ category: 'WATER_LEVEL', search: '${searchKey}' })">
                    조회 ➔
                  </button>
                </td>
              </tr>
            `;
          }).join("");
        }
      }

      // 4. Render 9 Categories Distribution
      const catBox = document.getElementById("dash-categories-body");
      if (catBox) {
        const catIcons = {
          FLOWMETER: "🌊",
          WATER_LEVEL: "📏",
          CCTV: "📹",
          CONTROL: "💻",
          MOUNT: "🏗️",
          SHELTER: "🏠",
          UNDERWATER: "🛡️",
          LIGHTNING: "⚡",
          ANCILLARY: "🔌"
        };

        const totalAll = ov.total || 1844;
        catBox.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${(res.categories || []).map(c => {
              const icon = catIcons[c.category] || "📦";
              const pct = ((c.total / totalAll) * 100).toFixed(1);
              const opPct = ((c.operating / c.total) * 100).toFixed(0);
              const stdLife = c.lifespan_years || this.getStandardLifespan(c.category);

              return `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:9px 12px; cursor:pointer;" onclick="window.equipmentManager.goToDevicesWithFilter({ category: '${c.category}' })" title="클릭 시 [${c.category_name}] 대장으로 이동">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; flex-wrap:wrap; gap:4px;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                      <span style="font-size:1.1rem;">${icon}</span>
                      <b style="font-size:0.88rem; color:#0f172a;">${c.category_name}</b>
                      <span class="badge badge-blue" style="font-size:0.68rem; font-weight:700;">내용연수 ${stdLife}년</span>
                      ${c.calib_need > 0 ? `<span class="badge badge-amber" style="font-size:0.68rem; font-weight:700;">🎯 검정필요 ${c.calib_need}대</span>` : ""}
                      ${c.lifespan_over > 0 ? `<span class="badge badge-red" style="font-size:0.68rem; font-weight:700;">⚠️ 연수초과 ${c.lifespan_over}점</span>` : ""}
                    </div>
                    <div style="text-align:right;">
                      <b style="font-size:0.92rem; color:#1e40af;">${c.total}점</b>
                      <span style="font-size:0.73rem; color:#64748b; margin-left:4px;">(${pct}%)</span>
                    </div>
                  </div>
                  <div style="display:flex; height:7px; border-radius:4px; overflow:hidden; background:#e2e8f0; margin-bottom:4px;">
                    <div style="width:${(c.operating / c.total) * 100}%; background:#10b981;" title="운영중 ${c.operating}대"></div>
                    <div style="width:${(c.spare / c.total) * 100}%; background:#f59e0b;" title="예비품 ${c.spare}대"></div>
                    <div style="width:${(c.repairing / c.total) * 100}%; background:#ef4444;" title="수리중 ${c.repairing}대"></div>
                    <div style="width:${(c.disposal / c.total) * 100}%; background:#94a3b8;" title="폐품 ${c.disposal}대"></div>
                    <div style="width:${(c.returned / c.total) * 100}%; background:#a855f7;" title="자산반납 ${c.returned}대"></div>
                  </div>
                  <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:#64748b;">
                    <span>운영: <b style="color:#166534;">${c.operating}</b>대 (${opPct}%)</span>
                    <span>예비: <b style="color:#b45309;">${c.spare}</b> | 수리: <b style="color:#b91c1c;">${c.repairing}</b> | 불용: <b>${c.disposal}</b>${c.returned > 0 ? ` | 반납: <b style="color:#7e22ce;">${c.returned}</b>` : ""}</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      // 5. Render Regions Distribution
      const regBox = document.getElementById("dash-regions-body");
      if (regBox) {
        regBox.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${(res.regions || []).map(r => {
              const isStorage = r.region.includes("본원") || r.region.includes("미배정");
              const regBadge = isStorage ? "badge-amber" : "badge-blue";

              return `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; cursor:pointer;" onclick="window.equipmentManager.goToStationsWithRegion('${r.region}')" title="클릭 시 [${r.region}] 지점 목록으로 이동">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span class="badge ${regBadge}" style="font-size:0.82rem; font-weight:800; padding:3px 8px;">📍 ${r.region}</span>
                      <span style="font-size:0.78rem; color:#64748b; font-weight:600;">${r.station_count > 0 ? `관측시설 ${r.station_count}개소` : "중앙 자산보관처"}</span>
                    </div>
                    <div>
                      <b style="font-size:1rem; color:#1e40af;">${r.total_devices}점</b>
                    </div>
                  </div>
                  <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; background:#ffffff; padding:6px 8px; border-radius:6px; border:1px solid #f1f5f9; text-align:center; font-size:0.75rem;">
                    <div>
                      <div style="color:#64748b; font-size:0.68rem;">🌊 유속계</div>
                      <b style="color:#1e3a8a;">${r.flow_count}대</b>
                    </div>
                    <div>
                      <div style="color:#64748b; font-size:0.68rem;">📏 수위계</div>
                      <b style="color:#0e7490;">${r.water_count}대</b>
                    </div>
                    <div>
                      <div style="color:#64748b; font-size:0.68rem;">⚡ 운영중</div>
                      <b style="color:#166534;">${r.operating_count}대</b>
                    </div>
                    <div>
                      <div style="color:#64748b; font-size:0.68rem;">📦 예비품</div>
                      <b style="color:#b45309;">${r.spare_count}대</b>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }
    } catch (e) {
      console.error("Dashboard render failed:", e);
    }
  }

  goToDevicesWithFilter(filter = {}) {
    if (window.modalManager && typeof window.modalManager.closeDetail === "function") {
      window.modalManager.closeDetail();
    }
    if (window.gisManager && window.gisManager.map && typeof window.gisManager.map.closePopup === "function") {
      window.gisManager.map.closePopup();
    }
    if (window.app && window.app.activeTab !== "equipment") {
      window.app.switchTab("equipment");
    }
    this.switchSubTab("devices");

    const catVal = filter.category !== undefined ? filter.category : "all";
    this.deviceCategory = catVal;
    document.querySelectorAll(".eq-cat-pill").forEach(p => {
      if (p.dataset.cat && p.dataset.cat.toUpperCase() === String(catVal).toUpperCase()) p.classList.add("active");
      else p.classList.remove("active");
    });

    const stVal = filter.status !== undefined ? filter.status : "all";
    this.deviceStatus = stVal;
    const stEl = document.getElementById("eq-dev-status");
    if (stEl) stEl.value = stVal;

    const calibVal = filter.calibFilter !== undefined ? filter.calibFilter : "ALL";
    this.deviceCalibFilter = calibVal;
    const cEl = document.getElementById("eq-dev-calib-filter");
    if (cEl) cEl.value = calibVal;

    const lifeVal = filter.isOver !== undefined ? String(filter.isOver) : "ALL";
    this.deviceLifespanFilter = lifeVal;
    const lEl = document.getElementById("eq-dev-lifespan-filter");
    if (lEl) lEl.value = lifeVal;

    const searchVal = filter.search !== undefined ? filter.search : "";
    this.deviceSearch = searchVal;
    const sEl = document.getElementById("eq-dev-search");
    if (sEl) sEl.value = searchVal;

    this.devicePage = 1;
    this.loadDevices();
  }

  goToStationsWithRegion(region) {
    if (window.app && window.app.activeTab !== "equipment") {
      window.app.switchTab("equipment");
    }
    if (region.includes("본원") || region.includes("미배정")) {
      this.goToDevicesWithFilter({ category: "all", status: "UNASSIGNED", search: "" });
      return;
    }
    this.switchSubTab("stations");
    this.stationRegion = region;
    const rEl = document.getElementById("eq-st-region");
    if (rEl) rEl.value = region;
    this.loadStationsSummary();
  }

  async exportDashboardSummaryExcel() {
    if (!window.XLSX) {
      alert("엑셀 라이브러리(SheetJS)를 불러올 수 없습니다.");
      return;
    }
    if (!this.cachedDashboard) {
      await this.loadDashboard();
    }
    const d = this.cachedDashboard;
    if (!d || !d.overview) {
      alert("대시보드 통계 데이터가 없습니다.");
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: 유속계 모델별 현황
      const flowHeaders = ["순번", "유속계 모델명", "계측 방식", "총 보유대수", "점유율(%)", "운영중", "예비품", "수리중", "불용/폐기", "자산반납", "검정필요(2년주기)", "내용연수초과(13년)"];
      const flowTotal = (d.flowModels || []).reduce((s, m) => s + m.total, 0);
      const flowRows = (d.flowModels || []).map((m, i) => [
        i + 1,
        m.model_name,
        m.method,
        m.total,
        Number(((m.total / (flowTotal || 1)) * 100).toFixed(1)),
        m.operating,
        m.spare,
        m.repairing,
        m.disposal,
        m.returned || 0,
        m.calib_need || 0,
        m.lifespan_over || 0
      ]);
      const wsFlow = XLSX.utils.aoa_to_sheet([
        ["🌊 한국수자원조사기술원 전국 자동유량관측시설 유속계 기종별·모델별 보유 현황 (내용연수 13년 · 검정주기 2년)"],
        [`총 ${flowTotal}대 | 기준일시: ${new Date().toLocaleString("ko-KR")}`],
        [],
        flowHeaders,
        ...flowRows
      ]);
      XLSX.utils.book_append_sheet(wb, wsFlow, "1. 유속계 모델별 현황");

      // Sheet 2: 수위계 모델별 현황
      const waterHeaders = ["순번", "수위계 모델명", "계측 방식", "총 보유대수", "점유율(%)", "운영중", "예비품", "수리중", "불용/폐기", "자산반납", "검정필요(3년주기)", "내용연수초과(10년)"];
      const waterTotal = (d.waterModels || []).reduce((s, m) => s + m.total, 0);
      const waterRows = (d.waterModels || []).map((m, i) => [
        i + 1,
        m.clean_model,
        m.method,
        m.total,
        Number(((m.total / (waterTotal || 1)) * 100).toFixed(1)),
        m.operating,
        m.spare,
        m.repairing,
        m.disposal,
        m.returned || 0,
        m.calib_need || 0,
        m.lifespan_over || 0
      ]);
      const wsWater = XLSX.utils.aoa_to_sheet([
        ["📏 한국수자원조사기술원 전국 자동유량관측시설 수위계 기종별·모델별 보유 현황 (내용연수 10년 · 검정주기 3년)"],
        [`총 ${waterTotal}대 | 기준일시: ${new Date().toLocaleString("ko-KR")}`],
        [],
        waterHeaders,
        ...waterRows
      ]);
      XLSX.utils.book_append_sheet(wb, wsWater, "2. 수위계 모델별 현황");

      // Sheet 3: 9대 설비 카테고리 종합 현황
      const catHeaders = ["설비 코드", "설비 구분(카테고리)", "조달청 내용연수(년)", "총 보유점수", "운영중", "예비품", "수리중", "불용/폐품", "자산반납", "검정필요", "내용연수초과"];
      const catRows = (d.categories || []).map(c => [
        c.category,
        c.category_name,
        c.lifespan_years || this.getStandardLifespan(c.category),
        c.total,
        c.operating,
        c.spare,
        c.repairing,
        c.disposal,
        c.returned || 0,
        c.calib_need || 0,
        c.lifespan_over || 0
      ]);
      const wsCat = XLSX.utils.aoa_to_sheet([
        ["🏢 전국 자동유량관측시설 9대 설비 카테고리별 자산 종합 현황 (조달청 고시 제2024-30호 내용연수 반영)"],
        [`총 ${(d.overview && d.overview.total) || 1844}점 | 기준일시: ${new Date().toLocaleString("ko-KR")}`],
        [],
        catHeaders,
        ...catRows
      ]);
      XLSX.utils.book_append_sheet(wb, wsCat, "3. 9대설비 종합현황");

      // Sheet 4: 4대 권역별 장비 배치 현황
      const regHeaders = ["관할 권역", "관측소 수(개소)", "전체 설비점수", "유속계(대)", "수위계(대)", "정상 운영(대)", "예비 보관(대)"];
      const regRows = (d.regions || []).map(r => [
        r.region,
        r.station_count,
        r.total_devices,
        r.flow_count,
        r.water_count,
        r.operating_count,
        r.spare_count
      ]);
      const wsReg = XLSX.utils.aoa_to_sheet([
        ["🗺️ 4대 권역별 장비 배치 및 예비율 현황"],
        [`기준일시: ${new Date().toLocaleString("ko-KR")}`],
        [],
        regHeaders,
        ...regRows
      ]);
      XLSX.utils.book_append_sheet(wb, wsReg, "4. 권역별 배치현황");

      const filename = `자동유량관측시설_장비대시보드_통계총괄_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.xlsx`;
      XLSX.writeFile(wb, filename);
      if (window.app) window.app.showToast("대시보드 통계 총괄 엑셀이 다운로드되었습니다.", "success");
    } catch (e) {
      console.error(e);
      alert("엑셀 생성 오류: " + e.message);
    }
  }

  /**
   * 1. Sub-View: Stations Summary List
   */
  async loadStationsSummary() {
    const listEl = document.getElementById("eq-station-list");
    if (!listEl) return;

    try {
      const params = {
        search: this.stationSearch,
        region: this.stationRegion,
        filterType: this.stationFilterType
      };

      const res = await window.apiClient.getEquipmentStations(params);
      if (res.success) {
        this.stations = res.stations || [];
        if (!this.allStations || this.allStations.length === 0) {
          this.allStations = [...this.stations];
          this.populateActionStationDropdown();
        }
        const countEl = document.getElementById("eq-station-count-badge");
        if (countEl) countEl.textContent = `${this.stations.length}개소`;

        if (this.stations.length === 0) {
          listEl.innerHTML = `<div style="padding:2rem; text-align:center; color:#94a3b8; font-size:0.85rem;">조건에 맞는 관측소가 없습니다.</div>`;
          return;
        }

        // Render station cards
        listEl.innerHTML = this.stations.map(st => {
          const isSelected = this.selectedStationId === st.id;
          const calibDueCnt = st.calib_due_count || 0;
          const lifeOverCnt = st.lifespan_over_count || 0;
          const isRepair = (st.repairing_count || 0) > 0;
          const isSpare = (st.spare_count || 0) > 0;
          const isPlanned2026 = (st.total_devices || 0) === 0 || st.install_year === "2026";

          let calibBadge = calibDueCnt > 0
            ? `<span class="badge" style="background:#fef3c7; color:#b45309; font-size:0.7rem; font-weight:700;">🎯 검정필요 (${calibDueCnt})</span>`
            : (st.calib_2026 === 1 ? `<span class="badge" style="background:#fef3c7; color:#b45309; font-size:0.7rem; font-weight:700;">🎯 검정대상</span>` : "");
          let lifeBadge = lifeOverCnt > 0
            ? `<span class="badge" style="background:#fee2e2; color:#dc2626; font-size:0.7rem; font-weight:700;">⚠️ 연수초과 (${lifeOverCnt})</span>`
            : "";
          let spareBadge = isSpare ? `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:0.7rem; font-weight:700;">📦 예비·보관 (${st.spare_count})</span>` : "";
          let repairBadge = isRepair ? `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-size:0.7rem; font-weight:700;">🚨 수리중 (${st.repairing_count})</span>` : "";

          let equipBadges = "";
          if (isPlanned2026) {
            equipBadges = `<span class="badge" style="background:#f1f5f9; color:#64748b; font-size:0.7rem; font-weight:600;">🏗️ 2026년 신설예정 (장비 미등록)</span>`;
          } else {
            equipBadges = `
              <span class="badge badge-blue" style="font-size:0.72rem;">유속계 ${st.flowmeter_count || 0}대</span>
              <span class="badge badge-cyan" style="font-size:0.72rem;">수위계 ${st.waterlevel_count || 0}대</span>
            `;
          }

          return `
            <div class="eq-st-card ${isSelected ? "active" : ""}" data-station-id="${st.id}" onclick="window.equipmentManager.selectStation(${st.id}, true)">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                <b style="font-size:0.9rem; color:#0f172a;">${st.name}</b>
                <span class="badge badge-gray" style="font-size:0.72rem;">${st.region || "-"}</span>
              </div>
              <div style="font-size:0.75rem; color:#64748b; margin-bottom:6px;">
                코드: <code>${st.code || "-"}</code> | ${st.river || "-"}
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                ${equipBadges}
                ${calibBadge}
                ${lifeBadge}
                ${spareBadge}
                ${repairBadge}
              </div>
            </div>
          `;
        }).join("");

        // Auto select first station if none selected
        if (!this.selectedStationId && this.stations.length > 0) {
          this.selectStation(this.stations[0].id, false);
        }
      }
    } catch (e) {
      console.error("Failed to load equipment stations:", e);
    }
  }

  setStationFilter(filterType) {
    this.stationFilterType = filterType;
    document.querySelectorAll(".eq-filter-pill").forEach(pill => {
      if (pill.dataset.filter === filterType) {
        pill.classList.add("active");
        if (typeof pill.scrollIntoView === "function") {
          pill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      } else {
        pill.classList.remove("active");
      }
    });
    this.loadStationsSummary();
  }

  toggleMobileStationList() {
    const wb = document.getElementById("eq-subview-stations");
    if (!wb) return;
    const isCollapsed = wb.classList.contains("mobile-list-collapsed");
    this.setMobileStationListCollapsed(!isCollapsed, true);
  }

  setMobileStationListCollapsed(collapsed, scrollToTarget = false) {
    const wb = document.getElementById("eq-subview-stations");
    const btn = document.getElementById("eq-mobile-list-toggle-btn");
    if (!wb) return;

    if (collapsed) {
      wb.classList.add("mobile-list-collapsed");
      if (btn) btn.innerHTML = `🔍 다른 관측소 선택 (목록 열기 ▼)`;
      if (scrollToTarget && window.innerWidth <= 1024) {
        const barEl = document.getElementById("eq-mobile-station-bar") || document.getElementById("eq-station-detail-panel");
        if (barEl && typeof barEl.scrollIntoView === "function") {
          setTimeout(() => barEl.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        }
      }
    } else {
      wb.classList.remove("mobile-list-collapsed");
      if (btn) btn.innerHTML = `🔍 관측소 목록 접기 ▲`;
      if (scrollToTarget && window.innerWidth <= 1024) {
        const searchEl = document.getElementById("eq-st-search");
        const barEl = document.getElementById("eq-mobile-station-bar");
        if (barEl && typeof barEl.scrollIntoView === "function") {
          barEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (searchEl) {
          setTimeout(() => searchEl.focus({ preventScroll: true }), 150);
        }
      }
    }
  }

  async selectStation(stationId, isUserAction = false) {
    this.selectedStationId = stationId;

    // Update mobile selected station label immediately if found in cached list
    const matchedSt = (this.stations || []).find(s => String(s.id) === String(stationId)) || (this.allStations || []).find(s => String(s.id) === String(stationId));
    const mobileNameEl = document.getElementById("eq-mobile-selected-name");
    if (mobileNameEl && matchedSt) {
      mobileNameEl.textContent = `${matchedSt.name} (${matchedSt.region || "-"})`;
    }

    // On mobile/tablet (<= 1024px), collapse the station list when user explicitly selects a station
    if (isUserAction && window.innerWidth <= 1024) {
      this.setMobileStationListCollapsed(true, true);
    }

    // Update list card active state
    document.querySelectorAll(".eq-st-card").forEach(el => {
      if (String(el.dataset.stationId) === String(stationId)) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });

    const detailPanel = document.getElementById("eq-station-detail-panel");
    if (!detailPanel) return;

    detailPanel.innerHTML = `<div style="padding:4rem; text-align:center; color:#64748b;">지점 장비 및 이력 정보를 불러오는 중...</div>`;

    try {
      const res = await window.apiClient.getEquipmentStationDetails(stationId);
      if (res.success) {
        this.currentStationData = res;
        this.renderStationDetailPanel(res);

        // Check if there is a target section or workId to scroll to inside the right panel
        if (this.targetSectionAfterNav) {
          const sec = this.targetSectionAfterNav;
          const targetWorkId = this.targetWorkIdAfterNav;
          this.targetSectionAfterNav = null;
          this.targetWorkIdAfterNav = null;

          const mainCol = document.querySelector(".eq-main-col");
          if (mainCol) {
            let targetEl = null;
            if (sec === "actions") {
              if (targetWorkId) {
                targetEl = document.querySelector(`.eq-timeline-item[data-work-id="${targetWorkId}"]`);
              }
              if (!targetEl) {
                targetEl = document.getElementById("eq-station-actions-card");
              }
            } else if (sec === "repairs") {
              targetEl = document.getElementById("eq-station-repairs-card");
            } else if (sec === "devices") {
              targetEl = document.getElementById("eq-station-operating-card");
            }

            if (targetEl) {
              mainCol.scrollTop = Math.max(0, targetEl.offsetTop - 15);
            }
          }
        }
      } else {
        detailPanel.innerHTML = `<div style="padding:3rem; text-align:center; color:#dc2626;">데이터를 불러오지 못했습니다: ${res.message}</div>`;
      }
    } catch (e) {
      console.error(e);
      detailPanel.innerHTML = `<div style="padding:3rem; text-align:center; color:#dc2626;">서버 통신 오류가 발생했습니다.</div>`;
    }
  }

  renderStationDetailPanel(data) {
    const detailPanel = document.getElementById("eq-station-detail-panel");
    if (!detailPanel || !data) return;

    const { station, operatingDevices, otherDevices, works, repairs } = data;

    const mobileNameEl = document.getElementById("eq-mobile-selected-name");
    if (mobileNameEl && station) {
      mobileNameEl.textContent = `${station.name} (${station.region || "-"})`;
    }

    const opFlowCount = operatingDevices.filter(d => d.category === "FLOWMETER").length;
    const opWaterCount = operatingDevices.filter(d => d.category === "WATER_LEVEL").length;
    const isCalib = station.calib_2026 === 1;

    let calibBadge = isCalib 
      ? `<span class="badge" style="background:#fef3c7; color:#b45309; padding:4px 8px; font-weight:700;">🎯 2026년 유속계 검정 대상 (${station.calib_status === "completed" ? "검정완료" : "검정대기"})</span>`
      : "";

    // Operating devices table rows
    const opRowsHtml = operatingDevices.length === 0 
      ? `<tr><td colspan="9" style="text-align:center; padding:2rem; color:#94a3b8;">현재 운영 중으로 등록된 장비가 없습니다.</td></tr>`
      : operatingDevices.map((d, idx) => {
          let catBadge = `<span class="badge badge-gray">${d.category_name}</span>`;
          if (d.category === "FLOWMETER") catBadge = `<span class="badge badge-blue">🌊 유속계</span>`;
          else if (d.category === "WATER_LEVEL") catBadge = `<span class="badge badge-cyan">📏 수위계</span>`;
          else if (d.category === "CONTROL") catBadge = `<span class="badge badge-amber">⚡ 제어시스템</span>`;
          else if (d.category === "LIGHTNING") catBadge = `<span class="badge badge-purple">⚡ 낙뢰SPD</span>`;
          else if (d.category === "CCTV") catBadge = `<span class="badge badge-green">📹 영상CCTV</span>`;

          const safeLoc = (d.location || "").replace(/'/g, "\\'");

          return `
            <tr>
              <td style="text-align:center;"><b>${idx + 1}</b></td>
              <td style="text-align:center;">${catBadge}</td>
              <td>
                <b style="color:#0f172a;">${d.model_name || "-"}</b>
                <div style="font-size:0.75rem; color:#64748b;">ID: <code>${d.equipment_id}</code></div>
              </td>
              <td>
                <code style="font-weight:700; color:#1e40af; background:#eff6ff; padding:2px 6px; border-radius:4px;">${d.serial_no || "-"}</code>
              </td>
              <td><span style="font-size:0.8rem; color:#475569;">${d.asset_no || d.asset_no_temp || "-"}</span></td>
              <td>${this.renderLifespanCell(d)}</td>
              <td>${this.renderCalibCell(d)}</td>
              <td style="text-align:center;"><span class="badge badge-green">● 운영중</span></td>
              <td style="text-align:center;">
                <div style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap;">
                  <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:#1e40af; border-color:#bfdbfe;" onclick="window.equipmentManager.openEditDeviceModal('${d.equipment_id}')" title="모델명, S/N, 내용연수, 검정일, 상태 등 상세 수정">
                    ✏️ 수정
                  </button>
                  ${(d.category === 'FLOWMETER' || d.category === 'WATER_LEVEL') ? `
                  <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:#d97706; border-color:#fde68a; background:#fffbeb; font-weight:700;" onclick="window.equipmentManager.openCalibModal('${d.equipment_id}')" title="검정 이력 대장 및 새 검정 등록">
                    🎯 검정
                  </button>
                  ` : ''}
                  <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem;" onclick="window.equipmentManager.openStatusModal('${d.equipment_id}', '${d.status}', '${safeLoc}', ${d.station_id || 'null'})" title="상태/보관위치 변경">
                    🔄 상태
                  </button>
                  <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem;" onclick="window.equipmentManager.openWorkModal(${station.id}, '${d.equipment_id}')" title="이 장비에 대한 조치 등록">
                    🛠️ 조치
                  </button>
                  <button class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem;" onclick="window.equipmentManager.openRepairModal('${d.equipment_id}')" title="수리 접수/단계변경">
                    🚨 수리
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join("");

    // Other devices (spares, stored, repairing, disposal)
    const otherRowsHtml = otherDevices.length === 0
      ? `<tr><td colspan="9" style="text-align:center; padding:1.5rem; color:#94a3b8;">해당 지점에 연계된 예비·보관·수리·철거 장비가 없습니다.</td></tr>`
      : otherDevices.map((d, idx) => {
          let stBadge = `<span class="badge badge-gray">${d.status_label || d.status}</span>`;
          if (d.status === "SPARE") stBadge = `<span class="badge badge-amber">📦 예비품</span>`;
          else if (d.status === "REPAIRING") stBadge = `<span class="badge badge-red">🚨 수리중</span>`;
          else if (d.status === "DISPOSAL") stBadge = `<span class="badge badge-gray">🗑️ 폐품</span>`;
          else if (d.status === "RETURNED") stBadge = `<span class="badge" style="background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; font-weight:700;">📦 ${d.status_label || "자산반납"}</span>`;

          const safeLoc = (d.location || "").replace(/'/g, "\\'");

          return `
            <tr>
              <td style="text-align:center;"><b>${idx + 1}</b></td>
              <td style="text-align:center;"><span class="badge badge-gray">${d.category_name}</span></td>
              <td>
                <b style="color:#0f172a;">${d.model_name || "-"}</b>
                <div style="font-size:0.73rem; color:#64748b;">ID: <code>${d.equipment_id}</code> ${d.asset_no ? `| 자산: ${d.asset_no}` : ""}</div>
              </td>
              <td><code style="font-weight:700; color:#1e40af; background:#f8fafc; padding:2px 6px; border-radius:4px;">${d.serial_no || "-"}</code></td>
              <td>${this.renderLifespanCell(d)}</td>
              <td>${this.renderCalibCell(d)}</td>
              <td style="text-align:center;">${stBadge}</td>
              <td>
                <span style="font-size:0.8rem; color:#475569; font-weight:600;">${d.location || "-"}</span>
                ${d.memo ? `<div style="font-size:0.72rem; color:#64748b;">${d.memo}</div>` : ""}
              </td>
              <td style="text-align:center;">
                <div style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap;">
                  <button class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.72rem; color:#1e40af; border-color:#bfdbfe; font-weight:700;" onclick="window.equipmentManager.openEditDeviceModal('${d.equipment_id}')" title="예비품/보관품/수리품 제원·내용연수·검정일·상태 직접 수정">
                    ✏️ 수정
                  </button>
                  ${(d.category === 'FLOWMETER' || d.category === 'WATER_LEVEL') ? `
                  <button class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.72rem; color:#d97706; border-color:#fde68a; background:#fffbeb; font-weight:700;" onclick="window.equipmentManager.openCalibModal('${d.equipment_id}')" title="검정 이력 대장 및 새 검정 등록">
                    🎯 검정
                  </button>
                  ` : ''}
                  <button class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.72rem;" onclick="window.equipmentManager.openStatusModal('${d.equipment_id}', '${d.status}', '${safeLoc}', ${d.station_id || 'null'})" title="운영중 전환 또는 상태·보관위치 변경">
                    🔄 상태
                  </button>
                  <button class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.72rem;" onclick="window.equipmentManager.openRepairModal('${d.equipment_id}')" title="수리 접수 또는 진행단계 변경">
                    🚨 수리
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join("");

    // Works & Actions Timeline
    const worksHtml = works.length === 0
      ? `<div style="padding:2rem; text-align:center; color:#94a3b8; font-size:0.85rem;">기록된 현장 조치 이력이 없습니다.</div>`
      : works.map(w => {
          const actionsHtml = (w.actions || []).map(a => {
            let badgeClass = "badge-blue";
            if (a.action_code === "REPLACE_FLOW" || a.action_code === "REPLACE_WATER") badgeClass = "badge-red";
            else if (a.action_code === "INSTALL_FLOW" || a.action_code === "INSTALL_WATER") badgeClass = "badge-blue";
            else if (a.action_code === "COMM_PARTS") badgeClass = "badge-purple";
            else if (a.action_code === "POWER_BATTERY") badgeClass = "badge-amber";
            else if (a.action_code === "CABLE_WIRING") badgeClass = "badge-cyan";
            else if (a.action_code === "UNDERWATER_PARTS") badgeClass = "badge-indigo";
            else if (a.action_code === "CONTROL_SYSTEM") badgeClass = "badge-teal";
            else if (a.action_code === "SENSOR_CALIB") badgeClass = "badge-green";
            else if (a.action_code === "STRUCT_MAINT") badgeClass = "badge-orange";
            else if (a.action_code === "CCTV_SURVEIL") badgeClass = "badge-pink";
            else if (a.action_code === "NORMAL_CHECK") badgeClass = "badge-gray";

            let replaceText = "";
            if (a.before_sn && a.after_sn) {
              replaceText = `
                <div style="background:#fff7ed; border:1px solid #fed7aa; padding:4px 8px; border-radius:4px; font-size:0.78rem; color:#c2410c; margin-top:4px;">
                  🔄 교체 내역: <b>${a.before_model || ""} (${a.before_sn})</b> ➔ <b>${a.after_model || ""} (${a.after_sn})</b>
                </div>
              `;
            } else if (a.after_sn) {
              replaceText = `
                <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:4px 8px; border-radius:4px; font-size:0.78rem; color:#1e40af; margin-top:4px;">
                  ➕ 신규 설치: <b>${a.after_model || ""} (${a.after_sn})</b>
                </div>
              `;
            } else if (a.before_sn) {
              replaceText = `
                <div style="background:#fef2f2; border:1px solid #fecaca; padding:4px 8px; border-radius:4px; font-size:0.78rem; color:#991b1b; margin-top:4px;">
                  📦 회수/철거: <b>${a.before_model || ""} (${a.before_sn})</b>
                </div>
              `;
            }

            return `
              <div style="margin-bottom:6px; padding:6px 10px; background:#f8fafc; border-left:3px solid #3b82f6; border-radius:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span class="badge ${badgeClass}" style="font-size:0.75rem; font-weight:700;">${a.action_name}</span>
                    ${a.param_change ? `<span class="badge badge-purple" style="font-size:0.7rem;">⚖️ ${a.param_change}</span>` : ""}
                  </div>
                  <span style="font-size:0.75rem; color:#64748b;">${a.part_name ? `${a.part_name} (${a.part_qty}EA)` : ""}</span>
                </div>
                ${replaceText}
                <div style="font-size:0.8rem; color:#334155; margin-top:3px;">${a.detail_text || ""}</div>
              </div>
            `;
          }).join("");

          return `
            <div class="eq-timeline-item" data-work-id="${w.id}" style="margin-bottom:1rem; padding:0.9rem; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
                <div style="font-weight:700; color:#1e3a8a; font-size:0.88rem; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                  <span>📅 ${w.work_date}</span>
                  <span class="badge badge-gray">${w.work_type}</span>
                  <span style="font-size:0.75rem; color:#64748b; font-weight:500; margin-left:4px;">작업자: <b>${w.workers || "-"}</b></span>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:0.72rem; color:#1e40af; border-color:#bfdbfe; font-weight:700;" onclick="window.equipmentManager.openEditWorkModal(${w.id})" title="점검일자, 작업자, 요약 및 세부 조치 내역 수정">
                    ✏️ 수정
                  </button>
                  <button type="button" class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.72rem; color:#dc2626; border-color:#fecaca;" onclick="window.equipmentManager.deleteWork(${w.id})" title="이 현장 점검 및 조치 이력 삭제">
                    🗑️ 삭제
                  </button>
                </div>
              </div>
              <div style="font-weight:600; color:#0f172a; font-size:0.84rem; margin-bottom:6px;">${w.summary}</div>
              <div>${actionsHtml}</div>
            </div>
          `;
        }).join("");

    detailPanel.innerHTML = `
      <!-- Station Top Banner -->
      <div class="card" style="margin-bottom:1rem; padding:1.2rem; background:linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color:#ffffff; border-radius:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:1.4rem;">📍</span>
              <h2 style="font-size:1.25rem; font-weight:800; margin:0; color:#ffffff;">${station.name}</h2>
              <span class="badge" style="background:rgba(255,255,255,0.2); color:#ffffff; font-weight:700;">코드: ${station.code || "-"}</span>
              ${calibBadge}
            </div>
            <div style="font-size:0.83rem; color:#bfdbfe; margin-top:4px;">
              권역: <b>${station.region || "-"}</b> | 하천: <b>${station.river || "-"}</b> | 주소: ${station.address || "-"}
            </div>
          </div>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            <button class="btn btn-sm eq-mobile-only-btn" onclick="window.equipmentManager.setMobileStationListCollapsed(false, true)" style="background:rgba(255,255,255,0.2); color:#ffffff; font-weight:700; border:1px solid rgba(255,255,255,0.6);">
              📋 다른 지점 선택
            </button>
            <button class="btn btn-sm" onclick="window.equipmentManager.openAddDeviceModal(${station.id})" style="background:#ffffff; color:#1e40af; font-weight:700; border:none;">
              ➕ 신규 장비 등록
            </button>
            <button class="btn btn-sm" onclick="window.equipmentManager.openWorkModal(${station.id})" style="background:#3b82f6; color:#ffffff; font-weight:700; border:none;">
              🛠️ 현장 조치 등록
            </button>
            <button class="btn btn-outline btn-sm" onclick="window.equipmentManager.exportStationPackage(${station.id})" style="color:#ffffff; border-color:rgba(255,255,255,0.6);">
              📥 이 지점 엑셀 출력
            </button>
          </div>
        </div>
      </div>

      <!-- Station Equipment KPI Row -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:0.6rem; margin-bottom:1rem;">
        <div style="background:#eff6ff; border:1px solid #dbeafe; border-radius:8px; padding:0.75rem 1rem;">
          <div style="font-size:0.75rem; color:#1e40af; font-weight:700;">운영 유속계</div>
          <div style="font-size:1.25rem; font-weight:800; color:#1e3a8a;">${opFlowCount}대</div>
        </div>
        <div style="background:#ecfeff; border:1px solid #cffafe; border-radius:8px; padding:0.75rem 1rem;">
          <div style="font-size:0.75rem; color:#0e7490; font-weight:700;">운영 수위계</div>
          <div style="font-size:1.25rem; font-weight:800; color:#155e75;">${opWaterCount}대</div>
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem 1rem;">
          <div style="font-size:0.75rem; color:#475569; font-weight:700;">전체 보유 설비</div>
          <div style="font-size:1.25rem; font-weight:800; color:#0f172a;">${data.totalCount || 0}점</div>
        </div>
        <div style="background:#fff7ed; border:1px solid #ffedd5; border-radius:8px; padding:0.75rem 1rem;">
          <div style="font-size:0.75rem; color:#c2410c; font-weight:700;">누적 조치 건수</div>
          <div style="font-size:1.25rem; font-weight:800; color:#9a3412;">${works.length}건</div>
        </div>
      </div>

      ${operatingDevices.length === 0 && otherDevices.length === 0 ? `
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:1.25rem 1.5rem; margin-bottom:1rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span style="font-size:2rem;">🏗️</span>
            <div>
              <div style="font-weight:800; color:#1e40af; font-size:1rem;">2026년도 신규 구축(신설) 예정 관측소</div>
              <div style="font-size:0.83rem; color:#2563eb; margin-top:2px; line-height:1.5;">
                본 지점은 2026년도 신설 대상(미운영)으로, 기존 물품관리대장(176개소)에는 포함되어 있지 않아 장비 내역이 0으로 표시됩니다.<br>
                향후 현장 계측설비 구축이 완료되면 <b>[➕ 신규 장비 등록]</b> 또는 <b>[엑셀 일괄수정·업로드]</b>를 통해 장비를 등록하실 수 있습니다.
              </div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.equipmentManager.openAddDeviceModal(${station.id})" style="font-weight:700;">
            <span>➕</span> <span>본 지점에 장비 등록</span>
          </button>
        </div>
      ` : ""}

      <!-- 1. Operating Devices Table Card -->
      <div class="card" id="eq-station-operating-card" style="margin-bottom:1rem;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div class="card-title">
            <span>🌊</span> 현재 정상 운영 중인 장비 목록 (총 ${operatingDevices.length}대)
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-responsive">
            <table class="custom-table" style="width:100%;">
              <thead>
                <tr>
                  <th style="width:45px; text-align:center;">No.</th>
                  <th style="width:100px; text-align:center;">구분</th>
                  <th>모델명 (장비 ID)</th>
                  <th>제조번호 (S/N)</th>
                  <th>자산번호</th>
                  <th>취득 / 내용연수 (만료)</th>
                  <th>검정일 / 만료일 (주기)</th>
                  <th style="width:80px; text-align:center;">상태</th>
                  <th style="width:185px; text-align:center;">작업 관리</th>
                </tr>
              </thead>
              <tbody>
                ${opRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 2. Other Equipment (Spares, Repairs) -->
      <div class="card" id="eq-station-repairs-card" style="margin-bottom:1rem;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div class="card-title" style="font-size:0.9rem; color:#475569;">
            <span>📦</span> 해당 지점 연계 예비품 / 보관품 / 수리중 설비 (${otherDevices.length}건)
          </div>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-outline btn-sm" style="padding:3px 9px; font-size:0.76rem;" onclick="window.equipmentManager.openAddDeviceModal(${station.id}, 'SPARE')">
              ➕ 이 지점에 예비·보관품 등록
            </button>
          </div>
        </div>
        <div class="card-body" style="padding:0;">
          <div class="table-responsive" style="max-height:320px;">
            <table class="custom-table" style="width:100%; font-size:0.82rem;">
              <thead>
                <tr>
                  <th style="width:45px; text-align:center;">No.</th>
                  <th style="width:95px; text-align:center;">구분</th>
                  <th>모델명 (장비 ID / 자산번호)</th>
                  <th>제조번호 (S/N)</th>
                  <th>취득 / 내용연수 (만료)</th>
                  <th>검정일 / 만료일 (주기)</th>
                  <th style="width:85px; text-align:center;">상태</th>
                  <th>보관처 / 위치</th>
                  <th style="width:170px; text-align:center;">작업 관리</th>
                </tr>
              </thead>
              <tbody>
                ${otherRowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 3. Work & Actions Timeline -->
      <div class="card" id="eq-station-actions-card" style="margin-bottom:1rem;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div class="card-title">
            <span>📜</span> 최근 현장 점검 및 조치·교체 이력 (${works.length}건)
          </div>
          <button class="btn btn-outline btn-sm" onclick="window.equipmentManager.openWorkModal(${station.id})">
            ➕ 새 조치 등록
          </button>
        </div>
        <div class="card-body" style="max-height:480px; overflow-y:auto;">
          ${worksHtml}
        </div>
      </div>
    `;
  }

  /**
   * 2. Sub-View: All Equipment Cross-Grid (9 Categories)
   */
  async loadDevices() {
    const tbody = document.getElementById("eq-all-devices-tbody");
    const countEl = document.getElementById("eq-all-devices-count");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:3rem; color:#64748b;">장비 목록을 조회하는 중...</td></tr>`;

    try {
      const params = {
        category: this.deviceCategory,
        status: this.deviceStatus,
        calibFilter: this.deviceCalibFilter,
        isOver: this.deviceLifespanFilter,
        search: this.deviceSearch,
        sortBy: "station_code",
        sortOrder: "asc",
        page: this.devicePage,
        limit: this.deviceLimit
      };

      const res = await window.apiClient.getEquipmentDevices(params);
      if (res.success) {
        this.deviceTotal = res.total || 0;
        this.deviceTotalPages = res.totalPages || 1;
        this.devicePage = res.page || 1;

        if (countEl) countEl.textContent = `${(res.total || 0).toLocaleString()}대/식`;

        if (!res.devices || res.devices.length === 0) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:3rem; color:#94a3b8;">조건에 해당하는 장비가 없습니다.</td></tr>`;
          this.renderDevicePagination(res);
          return;
        }

        const isAll = String(this.deviceLimit).toLowerCase() === "all";
        const pageLimit = isAll ? (res.total || 1) : (parseInt(this.deviceLimit, 10) || 50);
        const startOffset = (this.devicePage - 1) * pageLimit;

        const renderRowHtml = (d, idx) => {
          const rowNo = startOffset + idx + 1;
          let stBadge = `<span class="badge badge-green" style="font-size:0.75rem; font-weight:700;">● 운영중</span>`;
          if (d.status === "SPARE") stBadge = `<span class="badge badge-amber" style="font-size:0.75rem; font-weight:700;">📦 예비품</span>`;
          else if (d.status === "REPAIRING") stBadge = `<span class="badge badge-red" style="font-size:0.75rem; font-weight:700;">🚨 수리중</span>`;
          else if (d.status === "DISPOSAL") stBadge = `<span class="badge badge-gray" style="font-size:0.75rem; font-weight:700;">🗑️ 폐품</span>`;
          else if (d.status === "RETURNED") stBadge = `<span class="badge" style="background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; font-size:0.75rem; font-weight:700;">📦 ${d.status_label || "자산반납"}</span>`;

          let catBadge = `<span class="badge badge-gray" style="font-size:0.74rem; font-weight:700;">${d.category_name}</span>`;
          if (d.category === "FLOWMETER") catBadge = `<span class="badge badge-blue" style="font-size:0.74rem; font-weight:700;">🌊 유속계</span>`;
          else if (d.category === "WATER_LEVEL") catBadge = `<span class="badge badge-cyan" style="font-size:0.74rem; font-weight:700;">📏 수위계</span>`;
          else if (d.category === "CONTROL") catBadge = `<span class="badge badge-amber" style="font-size:0.74rem; font-weight:700;">💻 제어기</span>`;
          else if (d.category === "CCTV") catBadge = `<span class="badge badge-green" style="font-size:0.74rem; font-weight:700;">📹 CCTV</span>`;
          else if (d.category === "LIGHTNING") catBadge = `<span class="badge badge-purple" style="font-size:0.74rem; font-weight:700;">⚡ 낙뢰SPD</span>`;
          else if (d.category === "MOUNT") catBadge = `<span class="badge badge-gray" style="font-size:0.74rem; font-weight:700;">🏗️ 지지대</span>`;
          else if (d.category === "SHELTER") catBadge = `<span class="badge badge-gray" style="font-size:0.74rem; font-weight:700;">🏠 국사</span>`;
          else if (d.category === "UNDERWATER") catBadge = `<span class="badge badge-gray" style="font-size:0.74rem; font-weight:700;">🛡️ 수중보호</span>`;
          else if (d.category === "ANCILLARY") catBadge = `<span class="badge badge-gray" style="font-size:0.74rem; font-weight:700;">🔌 부대시설</span>`;

          const safeStName = (d.station_name || "").replace(/'/g, "\\'");
          const safeLoc = (d.location || "").replace(/'/g, "\\'");
          const targetSection = d.status === "OPERATING" ? "devices" : "repairs";

          // Station Column Display
          let stationCellHtml = "";
          if (d.status === "RETURNED") {
            stationCellHtml = `
              <div>
                <span class="badge" style="background:#f3e8ff; color:#7e22ce; font-weight:700; border:1px solid #d8b4fe; font-size:0.72rem; padding:2px 7px;">📦 자산반납</span>
                <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;" title="${d.memo || ''}">처분완료 (배정해제)</div>
              </div>
            `;
          } else if (d.station_name) {
            stationCellHtml = `
              <div onclick="event.stopPropagation(); window.equipmentManager.navigateToStation(${d.station_id}, '${safeStName}', '${targetSection}')" title="클릭 시 [${d.station_name}] 관측소 장비 현황으로 이동" style="cursor:pointer;">
                <div style="font-weight:700; color:#1e40af; font-size:0.88rem; display:flex; align-items:center; gap:4px;">
                  <span>📍</span> <span>${d.station_name}</span>
                </div>
                <div style="font-size:0.75rem; color:#64748b; margin-top:2px; display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                  <code style="background:#eff6ff; color:#1e40af; padding:1px 5px; border-radius:4px; font-weight:700; font-size:0.73rem; border:1px solid #bfdbfe;">${d.station_code || "-"}</code>
                  ${d.location && d.location !== '현장설치' ? `<span style="color:#64748b; font-size:0.72rem;">· ${d.location}</span>` : ''}
                </div>
              </div>
            `;
          } else {
            stationCellHtml = `
              <div>
                <span class="badge badge-amber" style="background:#fef3c7; color:#92400e; font-weight:700; font-size:0.72rem; padding:2px 7px;">🏢 미배정 (본원/보관)</span>
                <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">${d.location || '중앙창고'}</div>
              </div>
            `;
          }

          // Model & Specification Info Display
          const assetDisplay = (d.asset_no || d.asset_no_temp) ? `<span style="color:#475569; font-size:0.73rem;">· 자산: <b style="color:#334155;">${d.asset_no || d.asset_no_temp}</b></span>` : "";
          const modelCellHtml = `
            <div>
              <div style="font-size:0.88rem; font-weight:700; color:#0f172a; letter-spacing:-0.2px;">
                ${d.model_name || "-"}
              </div>
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:3px; font-size:0.75rem;">
                <span style="color:#475569;">S/N: <code style="font-weight:700; color:#1e40af; background:#f8fafc; padding:1px 5px; border-radius:3px; border:1px solid #e2e8f0;">${d.serial_no || "-"}</code></span>
                ${assetDisplay}
                <span style="color:#94a3b8; font-size:0.7rem;">(${d.equipment_id})</span>
              </div>
            </div>
          `;

          const rowClickHandler = d.station_id
            ? `window.equipmentManager.navigateToStation(${d.station_id}, '${safeStName}', '${targetSection}')`
            : `window.equipmentManager.openEditDeviceModal('${d.equipment_id}')`;

          return `
            <tr style="cursor:pointer;" onclick="${rowClickHandler}" title="클릭 시 장비 상세 및 관측소 조회">
              <td style="text-align:center;"><b>${rowNo}</b></td>
              <td>${stationCellHtml}</td>
              <td style="text-align:center;">${catBadge}</td>
              <td>${modelCellHtml}</td>
              <td style="text-align:center;">${stBadge}</td>
              <td style="text-align:center;">${this.renderLifespanCell(d)}</td>
              <td style="text-align:center;">${this.renderCalibCell(d)}</td>
              <td style="text-align:center;" onclick="event.stopPropagation();">
                <div style="display:flex; gap:4px; justify-content:center; flex-wrap:wrap;">
                  <button type="button" class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.73rem; color:#1e40af; border-color:#bfdbfe; font-weight:700; background:#f8fafc;" onclick="window.equipmentManager.openEditDeviceModal('${d.equipment_id}')" title="장비 정보/내용연수/검정일/상태/배치지점 통합 수정">
                    ✏️ 수정
                  </button>
                  ${(d.category === 'FLOWMETER' || d.category === 'WATER_LEVEL') ? `
                  <button type="button" class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.73rem; color:#d97706; border-color:#fde68a; background:#fffbeb; font-weight:700;" onclick="window.equipmentManager.openCalibModal('${d.equipment_id}')" title="검정 이력 대장 및 새 검정 등록">
                    🎯 검정
                  </button>
                  ` : ''}
                  <button type="button" class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.73rem; color:#475569; border-color:#cbd5e1; background:#ffffff; font-weight:600;" onclick="window.equipmentManager.openStatusModal('${d.equipment_id}', '${d.status}', '${safeLoc}', ${d.station_id || 'null'})" title="상태 및 보관처 빠른 변경">
                    🔄 상태
                  </button>
                </div>
              </td>
            </tr>
          `;
        };

        const totalDevs = res.devices.length;
        if (totalDevs <= 60) {
          tbody.innerHTML = res.devices.map(renderRowHtml).join("");
        } else {
          // Chunked progressive rendering to prevent browser freezing on large lists
          const CHUNK = 50;
          tbody.innerHTML = res.devices.slice(0, CHUNK).map(renderRowHtml).join("");
          let curr = CHUNK;
          const appendMore = () => {
            if (curr >= totalDevs) return;
            const nextEnd = Math.min(curr + CHUNK, totalDevs);
            const chunkHtml = res.devices.slice(curr, nextEnd).map((d, i) => renderRowHtml(d, curr + i)).join("");
            tbody.insertAdjacentHTML("beforeend", chunkHtml);
            curr = nextEnd;
            if (curr < totalDevs) {
              requestAnimationFrame(appendMore);
            }
          };
          requestAnimationFrame(appendMore);
        }

        this.renderDevicePagination(res);

        // Scroll table container to top on page change
        const tableWrap = document.querySelector("#eq-subview-devices .table-responsive");
        if (tableWrap) tableWrap.scrollTop = 0;
      }
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:3rem; color:#dc2626;">조회 중 오류가 발생했습니다.</td></tr>`;
    }
  }

  setDeviceCalibFilter(val) {
    this.deviceCalibFilter = val || "ALL";
    this.devicePage = 1;
    this.loadDevices();
  }

  setDeviceLifespanFilter(val) {
    this.deviceLifespanFilter = val || "ALL";
    this.devicePage = 1;
    this.loadDevices();
  }

  async exportFilteredDevicesExcel() {
    if (!window.XLSX) {
      alert("엑셀 라이브러리(SheetJS)를 불러올 수 없습니다.");
      return;
    }
    try {
      const res = await window.apiClient.getEquipmentDevices({
        category: this.deviceCategory,
        status: this.deviceStatus,
        calibFilter: this.deviceCalibFilter,
        isOver: this.deviceLifespanFilter,
        search: this.deviceSearch,
        limit: "all"
      });
      if (!res.success || !res.devices || res.devices.length === 0) {
        alert("다운로드할 장비 내역이 없습니다.");
        return;
      }

      const rows = res.devices.map((d, i) => {
        const cycle = this.getCalibCycleYears(d.category);
        return {
          "순번": i + 1,
          "장비ID": d.equipment_id,
          "설비구분": d.category_name,
          "모델명": d.model_name || "-",
          "제조번호(S/N)": d.serial_no || "-",
          "자산번호": d.asset_no || d.asset_no_temp || "-",
          "취득년도": d.acquisition_date || "-",
          "조달청 내용연수(년)": d.lifespan_years || this.getStandardLifespan(d.category),
          "내용연수 만료년도": d.lifespan_end_year || "-",
          "내용연수 초과여부": Number(d.is_lifespan_over) === 1 ? "초과" : "이내",
          "검정주기": cycle > 0 ? `${cycle}년` : "비대상",
          "최근검정일": d.recent_calib_date || "-",
          "검정만료일": d.calib_expire_date || "-",
          "검정상태": d.calib_status === "overdue" ? "검정만료" : (d.calib_status === "due_soon" ? "금년만료(검정필요)" : (d.calib_status === "valid" ? "유효" : "-")),
          "검정구분/성적서": d.calib_cert_no || "-",
          "지점코드": d.station_code || "-",
          "관측소명": d.station_name || "미배정(본원/보관)",
          "권역": d.region || "-",
          "운영상태": d.status_label || d.status,
          "보관위치": d.location || "-",
          "비고": d.memo || ""
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "장비대장_조회목록");
      const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
      XLSX.writeFile(wb, `자동유량관측시설_장비대장_조회목록_${res.devices.length}건_${today}.xlsx`);
      if (window.app) window.app.showToast(`현재 조회 조건 장비 목록(${res.devices.length}건) 엑셀이 다운로드되었습니다.`, "success");
    } catch (e) {
      alert("엑셀 다운로드 오류: " + e.message);
    }
  }

  setDeviceCategory(cat) {
    this.deviceCategory = cat;
    this.devicePage = 1;
    document.querySelectorAll(".eq-cat-pill").forEach(p => {
      const pCat = p.dataset.cat || "";
      if (pCat.toUpperCase() === String(cat).toUpperCase()) {
        p.classList.add("active");
        if (typeof p.scrollIntoView === "function") {
          p.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      } else {
        p.classList.remove("active");
      }
    });
    this.loadDevices();
  }

  setDeviceLimit(limitVal) {
    this.deviceLimit = (String(limitVal).toLowerCase() === "all") ? "all" : (parseInt(limitVal, 10) || 50);
    this.devicePage = 1;
    this.loadDevices();
  }

  changeDevicePage(page) {
    const target = Math.max(1, Math.min(page, this.deviceTotalPages || 1));
    if (this.devicePage === target) return;
    this.devicePage = target;
    this.loadDevices();
  }

  prevDevicePage() {
    if (this.devicePage > 1) {
      this.devicePage--;
      this.loadDevices();
    }
  }

  nextDevicePage() {
    if (this.devicePage < (this.deviceTotalPages || 1)) {
      this.devicePage++;
      this.loadDevices();
    }
  }

  lastDevicePage() {
    if (this.deviceTotalPages && this.devicePage < this.deviceTotalPages) {
      this.devicePage = this.deviceTotalPages;
      this.loadDevices();
    }
  }

  renderDevicePagination(res) {
    const pageInfo = document.getElementById("eq-dev-page-info");
    const topPageInfo = document.getElementById("eq-dev-top-page-info");
    const topBtnPrev = document.getElementById("btn-eq-dev-top-prev");
    const topBtnNext = document.getElementById("btn-eq-dev-top-next");
    const pageNumbers = document.getElementById("eq-dev-page-numbers");
    const btnFirst = document.getElementById("btn-eq-dev-first");
    const btnPrev = document.getElementById("btn-eq-dev-prev");
    const btnNext = document.getElementById("btn-eq-dev-next");
    const btnLast = document.getElementById("btn-eq-dev-last");

    const total = res.total || 0;
    const page = res.page || 1;
    const totalPages = res.totalPages || 1;
    const isAll = String(this.deviceLimit).toLowerCase() === "all";

    if (pageInfo) {
      if (total === 0) {
        pageInfo.textContent = "0건 / 총 0개 장비";
      } else if (isAll) {
        pageInfo.textContent = `전체 1-${total.toLocaleString()} / 총 ${total.toLocaleString()}개 장비 (전체 표시)`;
      } else {
        const pageSize = parseInt(this.deviceLimit, 10) || 50;
        const startNo = (page - 1) * pageSize + 1;
        const endNo = Math.min(startNo + (res.devices ? res.devices.length : 0) - 1, total);
        pageInfo.textContent = `${startNo.toLocaleString()}-${endNo.toLocaleString()} / 총 ${total.toLocaleString()}개 장비 (페이지 ${page}/${totalPages})`;
      }
    }

    if (topPageInfo) {
      if (total === 0) {
        topPageInfo.textContent = "0건";
      } else if (isAll) {
        topPageInfo.textContent = `전체 (${total.toLocaleString()}대)`;
      } else {
        topPageInfo.textContent = `${page} / ${totalPages} 페이지 (${total.toLocaleString()}대)`;
      }
    }

    if (topBtnPrev) topBtnPrev.disabled = page <= 1 || isAll;
    if (topBtnNext) topBtnNext.disabled = page >= totalPages || isAll;

    if (btnFirst) btnFirst.disabled = page <= 1 || isAll;
    if (btnPrev) btnPrev.disabled = page <= 1 || isAll;
    if (btnNext) btnNext.disabled = page >= totalPages || isAll;
    if (btnLast) btnLast.disabled = page >= totalPages || isAll;

    if (pageNumbers) {
      if (isAll || totalPages <= 1) {
        pageNumbers.innerHTML = "";
        return;
      }

      // Show sliding window of up to 5 page buttons
      let startP = Math.max(1, page - 2);
      let endP = Math.min(totalPages, startP + 4);
      if (endP - startP < 4) {
        startP = Math.max(1, endP - 4);
      }

      let btnsHtml = "";
      for (let p = startP; p <= endP; p++) {
        btnsHtml += `
          <button class="page-btn ${p === page ? "active" : ""}" 
                  style="${p === page ? "font-weight:700; background:#1e40af; color:#ffffff; border-color:#1e40af;" : ""}" 
                  onclick="window.equipmentManager.changeDevicePage(${p})">${p}</button>
        `;
      }
      pageNumbers.innerHTML = btnsHtml;
    }
  }

  /**
   * 3. Sub-View: Repairs
   */
  async loadRepairs() {
    const tbody = document.getElementById("eq-repairs-tbody");
    if (!tbody) return;

    try {
      const res = await window.apiClient.getEquipmentRepairs({
        stage: this.repairStage,
        search: this.repairSearch
      });

      if (res.success) {
        const countEl = document.getElementById("eq-repairs-count");
        if (countEl) countEl.textContent = `${res.count || 0}건`;

        if (!res.repairs || res.repairs.length === 0) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:3rem; color:#94a3b8;">진행 중인 수리 건이 없습니다.</td></tr>`;
          return;
        }

        tbody.innerHTML = res.repairs.map((r, idx) => {
          let stageBadge = `<span class="badge badge-amber">${r.stage}</span>`;
          if (r.stage === "수리완료" || r.stage === "반입·재설치") stageBadge = `<span class="badge badge-green">${r.stage}</span>`;
          else if (r.stage === "진단중") stageBadge = `<span class="badge badge-cyan">${r.stage}</span>`;

          return `
            <tr style="cursor:pointer;" onclick="window.equipmentManager.navigateToStation(${r.station_id || 'null'}, '${(r.station_name || '').replace(/'/g, "\\'")}', 'repairs')" title="클릭 시 [${r.station_name || '이 지점'}] 수리·보관 현황으로 이동">
              <td style="text-align:center;"><b>${idx + 1}</b></td>
              <td><code>${r.repair_no}</code></td>
              <td><b style="color:#1e40af;">📍 ${r.station_name || "보관처"}</b></td>
              <td><b>${r.equipment_name}</b> (<code>${r.equipment_id}</code>)</td>
              <td>${r.vendor || "-"}</td>
              <td>${r.received_date || "-"}</td>
              <td style="text-align:center;">${stageBadge}</td>
              <td style="text-align:center;" onclick="event.stopPropagation();">
                <button class="btn btn-primary btn-sm" style="padding:2px 8px; font-size:0.75rem;" onclick="window.equipmentManager.openRepairModal('${r.equipment_id}', ${r.id}, '${r.stage}')">
                  단계 변경
                </button>
              </td>
            </tr>
          `;
        }).join("");
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * 4. Sub-View: Structured Actions History (Station Filter & List Table & Excel Export)
   */
  populateActionStationDropdown() {
    const select = document.getElementById("eq-act-station-filter");
    if (!select) return;

    const sourceStations = this.allStations || this.stations || [];
    let filtered = sourceStations;
    if (this.actionRegion && this.actionRegion !== "all") {
      filtered = sourceStations.filter(s => s.region && s.region.includes(this.actionRegion));
    }

    const currentVal = select.value;
    const regionLabel = this.actionRegion !== "all" ? `${this.actionRegion}권역` : "전국";
    select.innerHTML = `<option value="all">전체 관측시설 (${regionLabel} ${filtered.length}개소)</option>`;

    // Sort by name
    const sorted = [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko-KR"));
    sorted.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.region || "-"})`;
      select.appendChild(opt);
    });

    if (currentVal && filtered.some(s => String(s.id) === String(currentVal))) {
      select.value = currentVal;
    } else {
      select.value = "all";
      this.actionStationId = "all";
    }
  }

  onActionRegionChange(region) {
    this.actionRegion = region;
    this.populateActionStationDropdown();
    this.loadActions();
  }

  onActionStationChange(stationId) {
    this.actionStationId = stationId;
    this.loadActions();
  }

  setActionViewMode(mode) {
    this.actionViewMode = mode;
    const tableBtn = document.getElementById("eq-act-view-table-btn");
    const cardsBtn = document.getElementById("eq-act-view-cards-btn");
    const tableWrap = document.getElementById("eq-actions-table-wrap");
    const cardsWrap = document.getElementById("eq-actions-cards-wrap");

    if (mode === "table") {
      if (tableBtn) { tableBtn.style.background = "#1e40af"; tableBtn.style.color = "#ffffff"; }
      if (cardsBtn) { cardsBtn.style.background = "#f8fafc"; cardsBtn.style.color = "#475569"; }
      if (tableWrap) tableWrap.style.display = "block";
      if (cardsWrap) cardsWrap.style.display = "none";
    } else {
      if (tableBtn) { tableBtn.style.background = "#f8fafc"; tableBtn.style.color = "#475569"; }
      if (cardsBtn) { cardsBtn.style.background = "#1e40af"; cardsBtn.style.color = "#ffffff"; }
      if (tableWrap) tableWrap.style.display = "none";
      if (cardsWrap) cardsWrap.style.display = "block";
    }
  }

  async loadActions() {
    const tableBody = document.getElementById("eq-actions-table-body");
    const cardsList = document.getElementById("eq-actions-timeline");
    const countBadge = document.getElementById("eq-actions-count");

    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:#64748b;">조치 및 교체 이력을 불러오는 중...</td></tr>`;
    }
    if (cardsList) {
      cardsList.innerHTML = `<div style="padding:3rem; text-align:center; color:#64748b;">조치 및 교체 이력을 불러오는 중...</div>`;
    }

    try {
      const params = {
        actionCode: this.actionCode,
        stationId: this.actionStationId,
        region: this.actionRegion,
        search: this.actionSearch,
        limit: 1000
      };

      const res = await window.apiClient.getEquipmentActions(params);
      if (res.success) {
        this.cachedActions = res.actions || [];
        if (countBadge) countBadge.textContent = `${this.cachedActions.length}건`;

        if (this.cachedActions.length === 0) {
          const emptyMsg = `<div style="padding:3rem; text-align:center; color:#94a3b8;">조건에 맞는 조치 및 교체 이력이 없습니다.</div>`;
          if (tableBody) tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:#94a3b8;">조건에 맞는 조치 및 교체 이력이 없습니다.</td></tr>`;
          if (cardsList) cardsList.innerHTML = emptyMsg;
          return;
        }

        // Render 1: Table Rows (리스트 형태)
        if (tableBody) {
          tableBody.innerHTML = this.cachedActions.map((a, idx) => {
            let badgeClass = "badge-blue";
            if (a.action_code === "REPLACE_FLOW" || a.action_code === "REPLACE_WATER") badgeClass = "badge-red";
            else if (a.action_code === "INSTALL_FLOW" || a.action_code === "INSTALL_WATER") badgeClass = "badge-blue";
            else if (a.action_code === "COMM_PARTS") badgeClass = "badge-purple";
            else if (a.action_code === "POWER_BATTERY") badgeClass = "badge-amber";
            else if (a.action_code === "CABLE_WIRING") badgeClass = "badge-cyan";
            else if (a.action_code === "UNDERWATER_PARTS") badgeClass = "badge-indigo";
            else if (a.action_code === "CONTROL_SYSTEM") badgeClass = "badge-teal";
            else if (a.action_code === "SENSOR_CALIB") badgeClass = "badge-green";
            else if (a.action_code === "STRUCT_MAINT") badgeClass = "badge-orange";
            else if (a.action_code === "CCTV_SURVEIL") badgeClass = "badge-pink";
            else if (a.action_code === "NORMAL_CHECK") badgeClass = "badge-gray";

            let replaceInfo = `<span style="color:#94a3b8;">-</span>`;
            if (a.before_sn && a.after_sn) {
              replaceInfo = `
                <div style="font-size:0.78rem; color:#c2410c; background:#fff7ed; padding:3px 6px; border-radius:4px; border:1px solid #fed7aa; display:inline-block;">
                  🔄 <b>${a.before_model || ""}</b> (<code>${a.before_sn}</code>) ➔ <b>${a.after_model || ""}</b> (<code>${a.after_sn}</code>)
                </div>
              `;
            } else if (a.after_sn) {
              replaceInfo = `
                <div style="font-size:0.78rem; color:#1e40af; background:#eff6ff; padding:3px 6px; border-radius:4px; border:1px solid #bfdbfe; display:inline-block;">
                  ➕ <b>${a.after_model || ""}</b> (<code>${a.after_sn}</code>)
                </div>
              `;
            } else if (a.before_sn) {
              replaceInfo = `
                <div style="font-size:0.78rem; color:#991b1b; background:#fef2f2; padding:3px 6px; border-radius:4px; border:1px solid #fecaca; display:inline-block;">
                  📦 회수: <b>${a.before_model || ""}</b> (<code>${a.before_sn}</code>)
                </div>
              `;
            } else if (a.part_name) {
              replaceInfo = `<span style="font-size:0.8rem; color:#0369a1; font-weight:600;">📦 ${a.part_name} (${a.part_qty || 1}EA)</span>`;
            }

            const paramInfo = a.param_change 
              ? `<span class="badge badge-purple" style="font-size:0.74rem;">${a.param_change}</span>` 
              : `<span style="color:#94a3b8;">-</span>`;

            return `
              <tr style="cursor:pointer;" onclick="window.equipmentManager.navigateToStation(${a.station_id || 'null'}, '${(a.station_name || '').replace(/'/g, "\\'")}', 'actions', ${a.work_id || 'null'})" title="클릭 시 [${a.station_name || '이 지점'}] 조치·교체이력으로 이동">
                <td style="text-align:center;"><b>${idx + 1}</b></td>
                <td style="text-align:center; font-weight:700; color:#1e3a8a;">${a.work_date || "-"}</td>
                <td>
                  <b style="color:#1e40af;">
                    📍 ${a.station_name || "본원/보관처"}
                  </b>
                  <span class="badge badge-gray" style="font-size:0.68rem; margin-left:4px;">${a.region || "-"}</span>
                </td>
                <td style="text-align:center;"><span class="badge badge-gray">${a.work_type || "-"}</span></td>
                <td style="text-align:center;"><span class="badge ${badgeClass}" style="font-weight:700;">${a.action_name}</span></td>
                <td>${replaceInfo}</td>
                <td style="text-align:center;">${paramInfo}</td>
                <td style="text-align:center;">${a.workers || "-"}</td>
                <td>
                  <div style="font-size:0.82rem; color:#334155; line-height:1.4; max-width:320px;">
                    ${a.detail_text || a.summary || "-"}
                  </div>
                </td>
                <td style="text-align:center;" onclick="event.stopPropagation();">
                  <div style="display:flex; gap:4px; justify-content:center;">
                    <button type="button" class="btn btn-outline btn-sm" style="padding:2px 7px; font-size:0.72rem; color:#1e40af; border-color:#bfdbfe; font-weight:700;" onclick="window.equipmentManager.openEditWorkModal(${a.work_id}, ${a.id})" title="이 점검·조치 내역 수정">
                      ✏️ 수정
                    </button>
                    <button type="button" class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:#dc2626; border-color:#fecaca;" onclick="window.equipmentManager.deleteAction(${a.id}, ${a.work_id})" title="이 조치 항목 삭제">
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join("");
        }

        // Render 2: Cards View (타임라인 형태)
        if (cardsList) {
          cardsList.innerHTML = this.cachedActions.map(a => {
            let badgeClass = "badge-blue";
            if (a.action_code === "REPLACE_FLOW" || a.action_code === "REPLACE_WATER") badgeClass = "badge-red";
            else if (a.action_code === "INSTALL_FLOW" || a.action_code === "INSTALL_WATER") badgeClass = "badge-blue";
            else if (a.action_code === "COMM_PARTS") badgeClass = "badge-purple";
            else if (a.action_code === "POWER_BATTERY") badgeClass = "badge-amber";
            else if (a.action_code === "CABLE_WIRING") badgeClass = "badge-cyan";
            else if (a.action_code === "UNDERWATER_PARTS") badgeClass = "badge-indigo";
            else if (a.action_code === "CONTROL_SYSTEM") badgeClass = "badge-teal";
            else if (a.action_code === "SENSOR_CALIB") badgeClass = "badge-green";
            else if (a.action_code === "STRUCT_MAINT") badgeClass = "badge-orange";
            else if (a.action_code === "CCTV_SURVEIL") badgeClass = "badge-pink";
            else if (a.action_code === "NORMAL_CHECK") badgeClass = "badge-gray";

            let replaceHtml = "";
            if (a.before_sn && a.after_sn) {
              replaceHtml = `
                <div style="background:#fff7ed; border:1px solid #fed7aa; padding:6px 10px; border-radius:6px; font-size:0.82rem; color:#c2410c; margin-top:6px;">
                  🔄 <b>교체 내역:</b> ${a.before_model || ""} (<code>${a.before_sn}</code>) ➔ ${a.after_model || ""} (<code>${a.after_sn}</code>)
                </div>
              `;
            } else if (a.after_sn) {
              replaceHtml = `
                <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:6px 10px; border-radius:6px; font-size:0.82rem; color:#1e40af; margin-top:6px;">
                  ➕ <b>신규 설치:</b> ${a.after_model || ""} (<code>${a.after_sn}</code>)
                </div>
              `;
            } else if (a.before_sn) {
              replaceHtml = `
                <div style="background:#fef2f2; border:1px solid #fecaca; padding:6px 10px; border-radius:6px; font-size:0.82rem; color:#991b1b; margin-top:6px;">
                  📦 <b>회수/철거:</b> ${a.before_model || ""} (<code>${a.before_sn}</code>)
                </div>
              `;
            } else if (a.part_name) {
              replaceHtml = `
                <div style="background:#f0f9ff; border:1px solid #bae6fd; padding:6px 10px; border-radius:6px; font-size:0.82rem; color:#0369a1; margin-top:6px;">
                  📦 <b>부품 투입:</b> ${a.part_name} (${a.part_qty || 1}EA)
                </div>
              `;
            }

            return `
              <div class="eq-act-card" style="margin-bottom:0.75rem; padding:1rem; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer;" onclick="window.equipmentManager.navigateToStation(${a.station_id || 'null'}, '${(a.station_name || '').replace(/'/g, "\\'")}', 'actions', ${a.work_id || 'null'})" title="클릭 시 [${a.station_name || '이 지점'}] 조치·교체이력으로 이동">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:0.4rem;">
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span class="badge ${badgeClass}" style="font-weight:700;">${a.action_name}</span>
                    <b style="color:#1e40af;">📍 ${a.station_name || "본원"}</b>
                    <span class="badge badge-gray" style="font-size:0.72rem;">${a.region || "-"}</span>
                    <span style="font-size:0.78rem; color:#64748b;">(${a.work_type})</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;" onclick="event.stopPropagation();">
                    <span style="font-size:0.8rem; color:#64748b;">
                      📅 <b>${a.work_date}</b> | 작업자: ${a.workers || "-"}
                    </span>
                    <button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:0.72rem; color:#1e40af; border-color:#bfdbfe; font-weight:700;" onclick="window.equipmentManager.openEditWorkModal(${a.work_id}, ${a.id})">
                      ✏️ 수정
                    </button>
                    <button type="button" class="btn btn-outline btn-sm" style="padding:2px 6px; font-size:0.72rem; color:#dc2626; border-color:#fecaca;" onclick="window.equipmentManager.deleteAction(${a.id}, ${a.work_id})">
                      🗑️ 삭제
                    </button>
                  </div>
                </div>
                ${replaceHtml}
                <div style="font-size:0.84rem; color:#334155; margin-top:6px; line-height:1.5;">${a.detail_text || a.summary || "-"}</div>
              </div>
            `;
          }).join("");
        }
      }
    } catch (e) {
      console.error(e);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:#dc2626;">조회 중 오류가 발생했습니다.</td></tr>`;
      if (cardsList) cardsList.innerHTML = `<div style="padding:3rem; text-align:center; color:#dc2626;">조회 중 오류가 발생했습니다.</div>`;
    }
  }

  setActionCodeFilter(code) {
    this.actionCode = code;
    document.querySelectorAll(".eq-act-pill").forEach(p => {
      if (p.dataset.code === code) {
        p.classList.add("active");
        if (typeof p.scrollIntoView === "function") {
          p.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
      } else {
        p.classList.remove("active");
      }
    });
    this.loadActions();
  }

  async exportActionsExcel() {
    if (!window.XLSX) {
      alert("엑셀 라이브러리(SheetJS)를 불러올 수 없습니다.");
      return;
    }

    if (!this.cachedActions || this.cachedActions.length === 0) {
      alert("다운로드할 조치 이력 데이터가 없습니다.");
      return;
    }

    try {
      let targetStationName = "전국";
      if (this.actionStationId && this.actionStationId !== "all") {
        const sourceStations = this.allStations || this.stations || [];
        const st = sourceStations.find(s => String(s.id) === String(this.actionStationId));
        targetStationName = st ? st.name : `지점_${this.actionStationId}`;
      } else if (this.actionRegion && this.actionRegion !== "all") {
        targetStationName = `${this.actionRegion}권역`;
      }

      let typeLabel = "전체이력";
      const actionNameMap = {
        REPLACE_FLOW: "유속계본체교체",
        INSTALL_FLOW: "유속계신규설치",
        REPLACE_WATER: "수위계본체교체",
        INSTALL_WATER: "수위계신규설치",
        COMM_PARTS: "통신모뎀컨버터",
        CABLE_WIRING: "케이블배선커넥터",
        UNDERWATER_PARTS: "수중보호리피터",
        CONTROL_SYSTEM: "제어시스템PC",
        SENSOR_CALIB: "센서보정옵셋세척",
        POWER_BATTERY: "전원배터리충전기",
        STRUCT_MAINT: "구조물현황판국사",
        CCTV_SURVEIL: "CCTV영상정비",
        NORMAL_CHECK: "종합점검정상"
      };
      if (this.actionCode && this.actionCode !== "ALL" && this.actionCode !== "all") {
        typeLabel = actionNameMap[this.actionCode] || this.actionCode;
      }

      const headers = [
        "순번", "작업번호", "작업일자", "관할권역", "관측소명(지점명)", "지점코드",
        "작업구분(대분류)", "표준조치유형(중분류)", "조치코드",
        "교체 전 모델", "교체 전 S/N", "교체 후 모델", "교체 후 S/N",
        "부품명", "수량(EA)", "측정/파라미터", "출동 작업자", "작업요약", "상세 조치내역"
      ];

      const rows = this.cachedActions.map((a, i) => [
        i + 1,
        a.work_no || "-",
        a.work_date || "-",
        a.region || "-",
        a.station_name || "-",
        a.station_code || "-",
        a.work_type || "-",
        a.action_name || "-",
        a.action_code || "-",
        a.before_model || "-",
        a.before_sn || "-",
        a.after_model || "-",
        a.after_sn || "-",
        a.part_name || "-",
        a.part_qty || 1,
        a.param_change || "-",
        a.workers || "-",
        a.summary || "-",
        a.detail_text || "-"
      ]);

      const title = `🌊 한국수자원조사기술원 자동유량관측시설 현장 조치 및 부품 교체 이력 대장`;
      const subtitle = `조회대상: [${targetStationName}] | 조치유형: [${typeLabel}] | 총 ${this.cachedActions.length}건 | 기준일시: ${new Date().toLocaleString("ko-KR")} | 한국수자원조사기술원 수자원인프라팀`;

      const options = {
        headerBg: "1E3A8A",
        aligns: [
          "center", "center", "center", "center", "left", "center",
          "center", "center", "center",
          "left", "center", "left", "center",
          "left", "right", "center", "center", "left", "left"
        ],
        statusCols: [6, 7]
      };

      const wb = XLSX.utils.book_new();
      let ws;
      if (window.excelManager && typeof window.excelManager.buildStyledSheet === "function") {
        ws = window.excelManager.buildStyledSheet(title, subtitle, headers, rows, options);
      } else {
        const aoa = [[title], [subtitle], [], headers, ...rows];
        ws = XLSX.utils.aoa_to_sheet(aoa);
      }

      XLSX.utils.book_append_sheet(wb, ws, "장비조치교체이력");
      const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const fileName = `한국수자원조사기술원_장비조치교체이력_${targetStationName}_${today}.xlsx`;
      XLSX.writeFile(wb, fileName);

      if (window.app) window.app.showToast(`[${targetStationName}] 조치·교체이력 엑셀이 다운로드되었습니다. (${this.cachedActions.length}건)`, "success");
    } catch (err) {
      console.error(err);
      alert("엑셀 다운로드 오류: " + err.message);
    }
  }

  // ==========================================
  // MODALS & ACTIONS
  // ==========================================

  openAddDeviceModal(stationId = null, defaultStatus = "OPERATING") {
    const modal = document.getElementById("eq-add-modal");
    if (!modal) return;

    this.setModalStationSelection("eq-add", stationId);
    document.getElementById("eq-add-category").value = "FLOWMETER";
    document.getElementById("eq-add-model").value = "";
    document.getElementById("eq-add-sn").value = "";
    document.getElementById("eq-add-asset").value = "";
    document.getElementById("eq-add-status").value = defaultStatus || "OPERATING";
    document.getElementById("eq-add-location").value = defaultStatus === "SPARE" ? "기술원보관(예비품)" : "현장설치";
    document.getElementById("eq-add-memo").value = "";

    const curYear = new Date().getFullYear();
    const acqEl = document.getElementById("eq-add-acq-date");
    if (acqEl) acqEl.value = String(curYear);

    const todayStr = new Date().toISOString().split("T")[0];
    const calibDateEl = document.getElementById("eq-add-calib-date");
    if (calibDateEl) calibDateEl.value = todayStr;
    const calibCertEl = document.getElementById("eq-add-calib-cert");
    if (calibCertEl) calibCertEl.value = "공식검정성적서";

    this.onAddCategoryChange("FLOWMETER");

    modal.classList.add("active");
  }

  onAddCategoryChange(category) {
    const stdLife = this.getStandardLifespan(category);
    const lifeEl = document.getElementById("eq-add-lifespan-years");
    if (lifeEl) lifeEl.value = stdLife;
    this.onAddLifespanInputChange();

    const calibBox = document.getElementById("eq-add-calib-box");
    const calibTitle = document.getElementById("eq-add-calib-title");
    const calibDateEl = document.getElementById("eq-add-calib-date");
    const calibExpEl = document.getElementById("eq-add-calib-expire");
    const cycle = this.getCalibCycleYears(category);

    if (cycle > 0) {
      if (calibBox) calibBox.style.display = "block";
      if (calibTitle) {
        calibTitle.textContent = category === "FLOWMETER"
          ? "🎯 유속계 법정 검정 정보 (2년 주기 · 검정기록 있을 시 입력)"
          : "🎯 수위계 법정 검정 정보 (3년 주기 · 검정기록 있을 시 입력)";
      }
      if (calibDateEl) calibDateEl.required = false;
      if (calibExpEl) calibExpEl.required = false;
      this.onAddCalibDateChange();
    } else {
      if (calibBox) calibBox.style.display = "none";
      if (calibDateEl) calibDateEl.required = false;
      if (calibExpEl) calibExpEl.required = false;
    }
  }

  onAddLifespanInputChange() {
    const acqEl = document.getElementById("eq-add-acq-date");
    const lifeEl = document.getElementById("eq-add-lifespan-years");
    const endEl = document.getElementById("eq-add-lifespan-end");
    if (!acqEl || !lifeEl || !endEl) return;

    const acqYr = parseInt(acqEl.value, 10);
    const yrs = parseInt(lifeEl.value, 10);
    if (!isNaN(acqYr) && !isNaN(yrs)) {
      const endYr = acqYr + yrs;
      const isOver = 2026 > endYr;
      endEl.value = `${endYr}년 (${isOver ? "⚠️ 내용연수 초과" : "🟢 이내"})`;
      endEl.style.color = isOver ? "#dc2626" : "#1e40af";
    } else {
      endEl.value = "-";
    }
  }

  onAddCalibDateChange() {
    const catEl = document.getElementById("eq-add-category");
    const calibDateEl = document.getElementById("eq-add-calib-date");
    const calibExpEl = document.getElementById("eq-add-calib-expire");
    if (!catEl || !calibDateEl || !calibExpEl) return;

    const cycle = this.getCalibCycleYears(catEl.value);
    if (cycle > 0 && calibDateEl.value) {
      calibExpEl.value = this.calcExpireDate(calibDateEl.value, cycle);
    }
  }

  closeAddDeviceModal() {
    const modal = document.getElementById("eq-add-modal");
    if (modal) modal.classList.remove("active");
  }

  async submitAddDevice(e) {
    e.preventDefault();
    const stId = document.getElementById("eq-add-station-id").value;
    const cat = document.getElementById("eq-add-category").value;
    const model = document.getElementById("eq-add-model").value.trim();
    const sn = document.getElementById("eq-add-sn").value.trim();
    const asset = document.getElementById("eq-add-asset").value.trim();
    const status = document.getElementById("eq-add-status").value;
    const location = document.getElementById("eq-add-location").value.trim();
    const memo = document.getElementById("eq-add-memo").value.trim();
    const acquisition_date = (document.getElementById("eq-add-acq-date")?.value || "").trim();
    const lifespan_years = parseInt(document.getElementById("eq-add-lifespan-years")?.value, 10) || this.getStandardLifespan(cat);
    const recent_calib_date = (document.getElementById("eq-add-calib-date")?.value || "").trim();
    const calib_expire_date = (document.getElementById("eq-add-calib-expire")?.value || "").trim();
    const calib_cert_no = (document.getElementById("eq-add-calib-cert")?.value || "").trim();

    let final_calib_expire = calib_expire_date;
    if ((cat === "FLOWMETER" || cat === "WATER_LEVEL") && recent_calib_date && !final_calib_expire) {
      final_calib_expire = this.calcExpireDate(recent_calib_date, this.getCalibCycleYears(cat));
    }

    const catNameMap = {
      FLOWMETER: "유속계",
      WATER_LEVEL: "수위계",
      CONTROL: "제어시스템",
      MOUNT: "센서지지대",
      SHELTER: "관측국사",
      UNDERWATER: "수중센서보호장치",
      LIGHTNING: "낙뢰보호장치",
      CCTV: "영상정보처리기기",
      ANCILLARY: "부대시설",
      ETC: "기타"
    };

    const payload = {
      station_id: stId ? parseInt(stId, 10) : null,
      category: cat,
      category_name: catNameMap[cat] || "유속계",
      model_name: model,
      serial_no: sn,
      asset_no: asset,
      status,
      location,
      acquisition_date,
      lifespan_years,
      recent_calib_date: (cat === "FLOWMETER" || cat === "WATER_LEVEL") ? (recent_calib_date || null) : null,
      calib_expire_date: (cat === "FLOWMETER" || cat === "WATER_LEVEL") ? (final_calib_expire || null) : null,
      calib_cert_no: (cat === "FLOWMETER" || cat === "WATER_LEVEL") ? (calib_cert_no || null) : null,
      memo
    };

    try {
      const res = await window.apiClient.createEquipmentDevice(payload);
      if (res.success) {
        if (window.app) window.app.showToast(`신규 장비가 성공적으로 등록되었습니다. (ID: ${res.equipmentId})`, "success");
        this.closeAddDeviceModal();
        if (this.selectedStationId) this.selectStation(this.selectedStationId);
        this.loadDevices();
        this.loadDashboard();
        this.loadKPIs();
      } else {
        alert("등록 실패: " + res.message);
      }
    } catch (err) {
      alert("오류: " + err.message);
    }
  }

  /**
   * The Structured Work & Action Registration / Edit Modal
   */
  getActionNameAndCategory(actionCode) {
    const actionNameMap = {
      REPLACE_FLOW: "유속계 본체 교체",
      INSTALL_FLOW: "유속계 신규/재설치",
      REPLACE_WATER: "수위계 본체 교체",
      INSTALL_WATER: "수위계 신규/재설치",
      COMM_PARTS: "통신 컨버터 및 네트워크 장비 정비",
      CABLE_WIRING: "센서 케이블 및 커넥터 교체",
      UNDERWATER_PARTS: "수중보호장치 및 리피터 정비",
      CONTROL_SYSTEM: "시스템 컨트롤러 및 부속 제어반 정비",
      SENSOR_CALIB: "센서 영점/옵셋 보정 및 세척",
      POWER_BATTERY: "전원공급장치 및 배터리 정비",
      STRUCT_MAINT: "관측국사 및 지지대 보수",
      CCTV_SURVEIL: "영상 감시장비 및 모니터 정비",
      NORMAL_CHECK: "종합 점검 및 현장 확인",
      ETC_ACTION: "기타 현장 조치"
    };

    const actionCategoryMap = {
      REPLACE_FLOW: "유속계 본체",
      INSTALL_FLOW: "유속계 본체",
      REPLACE_WATER: "수위계 본체",
      INSTALL_WATER: "수위계 본체",
      COMM_PARTS: "통신·네트워크",
      CABLE_WIRING: "케이블·배선",
      UNDERWATER_PARTS: "수중보호·리피터",
      CONTROL_SYSTEM: "제어시스템",
      SENSOR_CALIB: "센서보정·세척",
      POWER_BATTERY: "전원·배터리",
      STRUCT_MAINT: "구조물·국사",
      CCTV_SURVEIL: "영상·CCTV",
      NORMAL_CHECK: "단순점검",
      ETC_ACTION: "기타"
    };

    return {
      name: actionNameMap[actionCode] || "현장 조치",
      category: actionCategoryMap[actionCode] || "단순점검"
    };
  }

  openWorkModal(stationId = null, targetEquipmentId = null) {
    const modal = document.getElementById("eq-work-modal");
    if (!modal) return;

    const targetStId = (stationId && stationId !== "all" && stationId !== "null") ? stationId : this.selectedStationId;

    document.getElementById("eq-work-id").value = "";
    const titleEl = document.getElementById("eq-work-modal-title-text");
    if (titleEl) titleEl.textContent = "현장 점검 및 조치·교체 등록";
    const noBadge = document.getElementById("eq-work-no-badge");
    if (noBadge) noBadge.style.display = "none";
    const delBtn = document.getElementById("eq-work-delete-btn");
    if (delBtn) delBtn.style.display = "none";
    const submitBtn = document.getElementById("eq-work-submit-btn");
    if (submitBtn) submitBtn.innerHTML = "💾 조치 내역 등록";

    this.setModalStationSelection("eq-work", targetStId);

    document.getElementById("eq-work-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("eq-work-type").value = "수시점검";
    document.getElementById("eq-work-workers").value = "최기철 외 2인";
    document.getElementById("eq-work-summary").value = "";

    const smartSwitchEl = document.getElementById("eq-work-smart-switch");
    if (smartSwitchEl) smartSwitchEl.checked = true;

    let defaultCode = "REPLACE_FLOW";
    let defaultBeforeModel = "";
    let defaultBeforeSn = "";
    if (targetEquipmentId && this.currentStationData && this.currentStationData.operatingDevices) {
      const targetDev = this.currentStationData.operatingDevices.find(d => d.equipment_id === targetEquipmentId);
      if (targetDev) {
        if (targetDev.category === "WATER_LEVEL") defaultCode = "REPLACE_WATER";
        else if (targetDev.category === "FLOWMETER") defaultCode = "REPLACE_FLOW";
        else if (targetDev.category === "CONTROL") defaultCode = "CONTROL_SYSTEM";
        else if (targetDev.category === "UNDERWATER") defaultCode = "UNDERWATER_PARTS";
        else if (targetDev.category === "CCTV") defaultCode = "CCTV_SURVEIL";
        defaultBeforeModel = targetDev.model_name || "";
        defaultBeforeSn = targetDev.serial_no || "";
      }
    }

    const meta = this.getActionNameAndCategory(defaultCode);
    this.workModalActions = [{
      id: null,
      equipment_id: targetEquipmentId || null,
      action_code: defaultCode,
      action_name: meta.name,
      action_category: meta.category,
      before_model: defaultBeforeModel,
      before_sn: defaultBeforeSn,
      after_model: "",
      after_sn: "",
      part_name: "",
      part_qty: 1,
      param_change: "",
      detail_text: ""
    }];

    this.renderWorkModalActions();
    modal.classList.add("active");
  }

  async openEditWorkModal(workId, focusActionId = null) {
    const modal = document.getElementById("eq-work-modal");
    if (!modal || !workId) return;

    try {
      const res = await window.apiClient.getEquipmentWorkDetail(workId);
      if (!res || !res.success || !res.work) {
        alert("현장 점검·조치 이력 정보를 불러올 수 없습니다.");
        return;
      }

      const w = res.work;
      const acts = res.actions || [];

      document.getElementById("eq-work-id").value = w.id;
      const titleEl = document.getElementById("eq-work-modal-title-text");
      if (titleEl) titleEl.textContent = "현장 점검 및 조치·교체 이력 수정";
      const noBadge = document.getElementById("eq-work-no-badge");
      if (noBadge) {
        noBadge.textContent = w.work_no || `WRK-${w.id}`;
        noBadge.style.display = "inline-block";
      }
      const delBtn = document.getElementById("eq-work-delete-btn");
      if (delBtn) delBtn.style.display = "inline-flex";
      const submitBtn = document.getElementById("eq-work-submit-btn");
      if (submitBtn) submitBtn.innerHTML = "💾 수정 내용 저장";

      this.setModalStationSelection("eq-work", w.station_id, w.station_name);

      document.getElementById("eq-work-date").value = w.work_date || new Date().toISOString().split("T")[0];

      const typeSelect = document.getElementById("eq-work-type");
      if (typeSelect) {
        const wType = w.work_type || "수시점검";
        if (!Array.from(typeSelect.options).some(o => o.value === wType)) {
          const opt = document.createElement("option");
          opt.value = wType;
          opt.textContent = wType;
          typeSelect.appendChild(opt);
        }
        typeSelect.value = wType;
      }

      document.getElementById("eq-work-workers").value = w.workers || "";
      document.getElementById("eq-work-summary").value = w.summary || "";

      // When editing historical records, default smart switch to false so fixing typos doesn't unexpectedly change current operating status
      const smartSwitchEl = document.getElementById("eq-work-smart-switch");
      if (smartSwitchEl) smartSwitchEl.checked = false;

      if (acts.length > 0) {
        this.workModalActions = acts.map(a => ({
          id: a.id,
          equipment_id: a.equipment_id || null,
          action_code: a.action_code || "NORMAL_CHECK",
          action_name: a.action_name || this.getActionNameAndCategory(a.action_code || "NORMAL_CHECK").name,
          action_category: a.action_category || this.getActionNameAndCategory(a.action_code || "NORMAL_CHECK").category,
          before_model: a.before_model || "",
          before_sn: a.before_sn || "",
          after_model: a.after_model || "",
          after_sn: a.after_sn || "",
          part_name: a.part_name || "",
          part_qty: a.part_qty || 1,
          param_change: a.param_change || "",
          detail_text: a.detail_text || ""
        }));
      } else {
        const meta = this.getActionNameAndCategory("NORMAL_CHECK");
        this.workModalActions = [{
          id: null,
          equipment_id: null,
          action_code: "NORMAL_CHECK",
          action_name: meta.name,
          action_category: meta.category,
          before_model: "",
          before_sn: "",
          after_model: "",
          after_sn: "",
          part_name: "",
          part_qty: 1,
          param_change: "",
          detail_text: w.summary || ""
        }];
      }

      this.renderWorkModalActions(focusActionId);
      modal.classList.add("active");

      if (focusActionId) {
        setTimeout(() => {
          const cardEl = document.querySelector(`.eq-work-action-card[data-action-id="${focusActionId}"]`);
          if (cardEl && typeof cardEl.scrollIntoView === "function") {
            cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 80);
      }
    } catch (err) {
      console.error(err);
      alert("이력 상세 조회 오류: " + err.message);
    }
  }

  closeWorkModal() {
    const modal = document.getElementById("eq-work-modal");
    if (modal) modal.classList.remove("active");
  }

  syncWorkModalActionsFromDOM() {
    const cards = document.querySelectorAll(".eq-work-action-card");
    if (!cards || cards.length === 0) return;

    cards.forEach((card, idx) => {
      if (!this.workModalActions[idx]) return;
      const item = this.workModalActions[idx];
      const codeEl = card.querySelector(".eq-act-row-code");
      const nameEl = card.querySelector(".eq-act-row-name");
      const beforeModelEl = card.querySelector(".eq-act-row-before-model");
      const beforeSnEl = card.querySelector(".eq-act-row-before-sn");
      const afterModelEl = card.querySelector(".eq-act-row-after-model");
      const afterSnEl = card.querySelector(".eq-act-row-after-sn");
      const partNameEl = card.querySelector(".eq-act-row-part-name");
      const partQtyEl = card.querySelector(".eq-act-row-part-qty");
      const paramEl = card.querySelector(".eq-act-row-param");
      const detailEl = card.querySelector(".eq-act-row-detail");

      if (codeEl) {
        item.action_code = codeEl.value;
        item.action_category = this.getActionNameAndCategory(codeEl.value).category;
      }
      if (nameEl) item.action_name = nameEl.value.trim() || this.getActionNameAndCategory(item.action_code).name;
      if (beforeModelEl) item.before_model = beforeModelEl.value.trim();
      if (beforeSnEl) item.before_sn = beforeSnEl.value.trim();
      if (afterModelEl) item.after_model = afterModelEl.value.trim();
      if (afterSnEl) item.after_sn = afterSnEl.value.trim();
      if (partNameEl) item.part_name = partNameEl.value.trim();
      if (partQtyEl) item.part_qty = parseInt(partQtyEl.value, 10) || 1;
      if (paramEl) item.param_change = paramEl.value.trim();
      if (detailEl) item.detail_text = detailEl.value.trim();
    });
  }

  addWorkActionRow() {
    this.syncWorkModalActionsFromDOM();
    const meta = this.getActionNameAndCategory("NORMAL_CHECK");
    this.workModalActions.push({
      id: null,
      equipment_id: null,
      action_code: "NORMAL_CHECK",
      action_name: meta.name,
      action_category: meta.category,
      before_model: "",
      before_sn: "",
      after_model: "",
      after_sn: "",
      part_name: "",
      part_qty: 1,
      param_change: "",
      detail_text: ""
    });
    this.renderWorkModalActions();
  }

  removeWorkActionRow(index) {
    this.syncWorkModalActionsFromDOM();
    if (this.workModalActions.length <= 1) {
      alert("최소 1개 이상의 세부 조치 항목이 필요합니다. 이력 전체를 삭제하려면 하단의 [전체 삭제] 버튼을 이용해주세요.");
      return;
    }
    this.workModalActions.splice(index, 1);
    this.renderWorkModalActions();
  }

  onWorkActionRowCodeChange(index, newCode) {
    this.syncWorkModalActionsFromDOM();
    if (!this.workModalActions[index]) return;
    const meta = this.getActionNameAndCategory(newCode);
    this.workModalActions[index].action_code = newCode;
    this.workModalActions[index].action_name = meta.name;
    this.workModalActions[index].action_category = meta.category;
    this.renderWorkModalActions();
  }

  renderWorkModalActions(focusActionId = null) {
    const container = document.getElementById("eq-work-actions-list");
    if (!container) return;

    const actions = this.workModalActions || [];
    const esc = (str) => String(str || "").replace(/"/g, "&quot;");

    const codeOptions = [
      ["REPLACE_FLOW", "🔄 유속계 본체 교체 (S/N 스위칭)"],
      ["INSTALL_FLOW", "➕ 유속계 신규/추가/재설치"],
      ["REPLACE_WATER", "🔄 수위계 본체 교체 (S/N 스위칭)"],
      ["INSTALL_WATER", "➕ 수위계 신규/추가/재설치"],
      ["COMM_PARTS", "📡 통신·모뎀·컨버터·공유기 정비"],
      ["CABLE_WIRING", "🔌 센서 케이블·배선·커넥터 교체"],
      ["UNDERWATER_PARTS", "🛡️ 수중센서보호장치·리피터 정비"],
      ["CONTROL_SYSTEM", "💻 시스템 컨트롤러(Logger/Sender)·PC"],
      ["SENSOR_CALIB", "⚖️ 센서 영점/옵셋 보정 및 세척"],
      ["POWER_BATTERY", "🔋 전원·배터리·자동충전기 정비"],
      ["STRUCT_MAINT", "🏗️ 관측국사·센서지지대·지점현황판"],
      ["CCTV_SURVEIL", "📹 영상정보처리기기(CCTV/모니터)"],
      ["NORMAL_CHECK", "✅ 정기/수시 종합점검 및 이상없음"],
      ["ETC_ACTION", "기타 현장 조치"]
    ];

    container.innerHTML = actions.map((a, idx) => {
      const isFocused = focusActionId && String(a.id) === String(focusActionId);
      const isReplaceOrInstall = ["REPLACE_FLOW", "REPLACE_WATER", "INSTALL_FLOW", "INSTALL_WATER"].includes(a.action_code) || a.before_sn || a.after_sn || a.before_model || a.after_model;

      const optionsHtml = codeOptions.map(([val, label]) => `
        <option value="${val}" ${a.action_code === val ? "selected" : ""}>${label}</option>
      `).join("");

      return `
        <div class="eq-work-action-card" data-action-id="${a.id || ''}" style="background:#ffffff; border:${isFocused ? '2px solid #2563eb' : '1px solid #cbd5e1'}; border-radius:8px; padding:0.85rem 0.95rem; box-shadow:${isFocused ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none'};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.65rem; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="badge badge-blue" style="font-size:0.74rem; font-weight:800;">조치 #${idx + 1}</span>
              ${a.id ? `<code style="font-size:0.72rem; color:#64748b;">ID: ${a.id}</code>` : `<span class="badge badge-green" style="font-size:0.68rem;">신규</span>`}
            </div>
            ${actions.length > 1 ? `
              <button type="button" class="btn btn-outline btn-sm" style="padding:1px 7px; font-size:0.7rem; color:#dc2626; border-color:#fecaca;" onclick="window.equipmentManager.removeWorkActionRow(${idx})">
                🗑️ 이 항목 삭제
              </button>
            ` : ""}
          </div>

          <div style="display:grid; grid-template-columns: 1.3fr 1fr; gap:0.65rem; margin-bottom:0.65rem;">
            <div class="form-group" style="min-width:0;">
              <label class="form-label" style="font-size:0.75rem; font-weight:700;">표준 조치 유형 (중분류) *</label>
              <select class="filter-select eq-act-row-code" style="width:100%; box-sizing:border-box; font-weight:700; color:#1e40af; font-size:0.82rem;" onchange="window.equipmentManager.onWorkActionRowCodeChange(${idx}, this.value)">
                ${optionsHtml}
              </select>
            </div>
            <div class="form-group" style="min-width:0;">
              <label class="form-label" style="font-size:0.75rem; font-weight:700;">표시 조치명</label>
              <input type="text" class="form-input eq-act-row-name" value="${esc(a.action_name)}" placeholder="예: 유속계 본체 교체" style="width:100%; box-sizing:border-box; font-size:0.82rem;">
            </div>
          </div>

          ${isReplaceOrInstall ? `
            <div style="background:#fff7ed; border:1px solid #fed7aa; padding:8px 10px; border-radius:6px; margin-bottom:0.65rem;">
              <div style="font-size:0.76rem; font-weight:700; color:#c2410c; margin-bottom:5px;">
                🔄 장비 교체 / 신규 설치 S/N 및 모델 정보
              </div>
              <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px;">
                <div class="form-group" style="min-width:0;">
                  <label class="form-label" style="font-size:0.7rem;">기존(회수) 모델명</label>
                  <input type="text" class="form-input eq-act-row-before-model" value="${esc(a.before_model)}" placeholder="예: CM300" style="width:100%; box-sizing:border-box; font-size:0.8rem; padding:5px 7px;">
                </div>
                <div class="form-group" style="min-width:0;">
                  <label class="form-label" style="font-size:0.7rem;">기존(회수) S/N</label>
                  <input type="text" class="form-input eq-act-row-before-sn" value="${esc(a.before_sn)}" placeholder="예: 19068" style="width:100%; box-sizing:border-box; font-size:0.8rem; padding:5px 7px;">
                </div>
                <div class="form-group" style="min-width:0;">
                  <label class="form-label" style="font-size:0.7rem;">신규(설치) 모델명</label>
                  <input type="text" class="form-input eq-act-row-after-model" value="${esc(a.after_model)}" placeholder="예: CM300" style="width:100%; box-sizing:border-box; font-size:0.8rem; padding:5px 7px;">
                </div>
                <div class="form-group" style="min-width:0;">
                  <label class="form-label" style="font-size:0.7rem;">신규(설치) S/N</label>
                  <input type="text" class="form-input eq-act-row-after-sn" value="${esc(a.after_sn)}" placeholder="예: 23443" style="width:100%; box-sizing:border-box; font-size:0.8rem; padding:5px 7px;">
                </div>
              </div>
            </div>
          ` : `
            <input type="hidden" class="eq-act-row-before-model" value="${esc(a.before_model)}">
            <input type="hidden" class="eq-act-row-before-sn" value="${esc(a.before_sn)}">
            <input type="hidden" class="eq-act-row-after-model" value="${esc(a.after_model)}">
            <input type="hidden" class="eq-act-row-after-sn" value="${esc(a.after_sn)}">
          `}

          <div style="display:grid; grid-template-columns: minmax(0, 1.4fr) 90px minmax(0, 1fr); gap:0.65rem; margin-bottom:0.65rem;">
            <div class="form-group" style="min-width:0;">
              <label class="form-label" style="font-size:0.73rem;">투입 부품 / 대상 장치명</label>
              <input type="text" class="form-input eq-act-row-part-name" value="${esc(a.part_name)}" placeholder="예: 유속계 본체, 센서 리피터, 배터리 등" style="width:100%; box-sizing:border-box; font-size:0.8rem; padding:5px 8px;">
            </div>
            <div class="form-group" style="min-width:0;">
              <label class="form-label" style="font-size:0.73rem;">수량(EA)</label>
              <input type="number" class="form-input eq-act-row-part-qty" value="${a.part_qty || 1}" min="1" style="width:100%; box-sizing:border-box; font-size:0.8rem; padding:5px 8px;">
            </div>
            <div class="form-group" style="min-width:0;">
              <label class="form-label" style="font-size:0.73rem;">측정값 / 파라미터 (전압·옵셋 등)</label>
              <input type="text" class="form-input eq-act-row-param" value="${esc(a.param_change)}" placeholder="예: 13.8V, 1.25m→1.30m" style="width:100%; box-sizing:border-box; font-size:0.8rem; padding:5px 8px;">
            </div>
          </div>

          <div class="form-group" style="width:100%; min-width:0;">
            <label class="form-label" style="font-size:0.78rem; font-weight:700;">상세 조치 내역 (자유 서술) *</label>
            <textarea class="form-input eq-act-row-detail" rows="3" placeholder="현장 점검 및 조치 상세 내용을 입력하세요..." required style="width:100%; box-sizing:border-box; resize:none; min-height:78px; font-size:0.86rem; line-height:1.5;">${a.detail_text || ""}</textarea>
          </div>
        </div>
      `;
    }).join("");
  }

  async submitWork(e) {
    e.preventDefault();
    this.syncWorkModalActionsFromDOM();

    const workId = document.getElementById("eq-work-id").value;
    const stId = document.getElementById("eq-work-station-id").value;
    const workDate = document.getElementById("eq-work-date").value;
    const workType = document.getElementById("eq-work-type").value;
    const workers = document.getElementById("eq-work-workers").value.trim();
    const summaryInput = document.getElementById("eq-work-summary").value.trim();
    const smartSwitchEl = document.getElementById("eq-work-smart-switch");
    const applySmartSwitch = smartSwitchEl ? smartSwitchEl.checked : false;

    if (!stId) {
      alert("대상 관측소를 검색하여 선택해주세요.");
      return;
    }

    const actions = (this.workModalActions || []).map(a => {
      const meta = this.getActionNameAndCategory(a.action_code);
      return {
        id: a.id || null,
        equipment_id: a.equipment_id || null,
        action_code: a.action_code || "NORMAL_CHECK",
        action_name: a.action_name || meta.name,
        action_category: a.action_category || meta.category,
        before_model: a.before_model || "",
        before_sn: a.before_sn || "",
        after_model: a.after_model || "",
        after_sn: a.after_sn || "",
        part_name: a.part_name || "",
        part_qty: a.part_qty || 1,
        param_change: a.param_change || "",
        detail_text: a.detail_text || summaryInput || meta.name
      };
    });

    if (actions.length === 0) {
      alert("최소 1개 이상의 세부 조치 항목을 입력해주세요.");
      return;
    }

    const firstAct = actions[0];
    const extraCnt = actions.length > 1 ? ` 외 ${actions.length - 1}건` : "";
    const autoSummary = `[${workType}] ${firstAct.detail_text || firstAct.action_name}${extraCnt}`;

    const payload = {
      station_id: parseInt(stId, 10),
      work_date: workDate,
      work_type: workType,
      workers,
      summary: summaryInput || autoSummary,
      actions,
      applySmartSwitch
    };

    try {
      if (workId) {
        const res = await window.apiClient.updateEquipmentWork(workId, payload);
        if (res.success) {
          if (window.app) window.app.showToast("현장 점검 및 조치 이력이 성공적으로 수정되었습니다.", "success");
          this.closeWorkModal();
          if (this.selectedStationId) this.selectStation(this.selectedStationId);
          this.loadStationsSummary();
          this.loadActions();
          this.loadDashboard();
        } else {
          alert("수정 실패: " + (res.message || res.error));
        }
      } else {
        const res = await window.apiClient.createEquipmentWork(payload);
        if (res.success) {
          if (window.app) window.app.showToast("새 현장 점검 및 조치 이력이 등록되었습니다.", "success");
          this.closeWorkModal();
          if (this.selectedStationId) this.selectStation(this.selectedStationId);
          this.loadStationsSummary();
          this.loadActions();
          this.loadDashboard();
        } else {
          alert("저장 실패: " + (res.message || res.error));
        }
      }
    } catch (err) {
      alert("오류: " + err.message);
    }
  }

  async deleteWork(workId) {
    if (!workId) return;
    if (!confirm("이 현장 점검 및 조치 이력(포함된 세부 조치 항목 전체)을 삭제하시겠습니까?")) return;

    try {
      const res = await window.apiClient.deleteEquipmentWork(workId);
      if (res.success) {
        if (window.app) window.app.showToast("현장 점검 및 조치 이력이 삭제되었습니다.", "success");
        this.closeWorkModal();
        if (this.selectedStationId) this.selectStation(this.selectedStationId);
        this.loadStationsSummary();
        this.loadActions();
        this.loadDashboard();
      } else {
        alert("삭제 실패: " + (res.message || res.error));
      }
    } catch (err) {
      alert("삭제 오류: " + err.message);
    }
  }

  async deleteWorkFromModal() {
    const workId = document.getElementById("eq-work-id").value;
    if (workId) {
      await this.deleteWork(workId);
    }
  }

  async deleteAction(actionId, workId = null) {
    if (!actionId) return;
    if (!confirm("선택한 세부 조치 이력 항목을 삭제하시겠습니까?")) return;

    try {
      const res = await window.apiClient.deleteEquipmentAction(actionId);
      if (res.success) {
        if (window.app) window.app.showToast("세부 조치 이력 항목이 삭제되었습니다.", "success");
        if (this.selectedStationId) this.selectStation(this.selectedStationId);
        this.loadStationsSummary();
        this.loadActions();
        this.loadDashboard();
      } else {
        alert("삭제 실패: " + (res.message || res.error));
      }
    } catch (err) {
      alert("삭제 오류: " + err.message);
    }
  }

  getStationMasterList() {
    let list = this.allStations || this.stations || [];
    if ((!list || list.length === 0) && window.dataManager) {
      list = window.dataManager.getAll() || [];
    }
    return list;
  }

  setModalStationSelection(prefix, selectedStationId = null, fallbackStationName = "") {
    const hiddenEl = document.getElementById(`${prefix}-station-id`);
    const labelEl = document.getElementById(`${prefix}-station-selected-label`);
    const boxEl = document.getElementById(`${prefix}-station-selected-box`);
    const searchEl = document.getElementById(`${prefix}-station-search`);
    const resultsEl = document.getElementById(`${prefix}-station-results`);

    const list = this.getStationMasterList();
    let matchedStation = null;
    if (selectedStationId && selectedStationId !== "null" && selectedStationId !== "") {
      matchedStation = list.find(s => String(s.id) === String(selectedStationId));
    }

    if (hiddenEl) {
      hiddenEl.value = (selectedStationId && selectedStationId !== "null") ? String(selectedStationId) : "";
    }

    if (labelEl && boxEl) {
      if (matchedStation) {
        labelEl.innerHTML = `📍 <b>${matchedStation.name}</b> <span style="font-weight:500; color:#475569; font-size:0.76rem;">(${matchedStation.region || "-"} · ${matchedStation.river || "-"} · 코드:${matchedStation.code || "-"})</span>`;
        boxEl.style.background = "#eff6ff";
        boxEl.style.borderColor = "#bfdbfe";
        labelEl.style.color = "#1e40af";
      } else if (fallbackStationName && selectedStationId && selectedStationId !== "null") {
        labelEl.innerHTML = `📍 <b>${fallbackStationName}</b>`;
        boxEl.style.background = "#eff6ff";
        boxEl.style.borderColor = "#bfdbfe";
        labelEl.style.color = "#1e40af";
      } else {
        labelEl.innerHTML = `🏢 <b>미배정 (기술원 본원 / 중앙 창고 보관)</b>`;
        boxEl.style.background = "#fffbeb";
        boxEl.style.borderColor = "#fde68a";
        labelEl.style.color = "#92400e";
      }
    }

    if (searchEl) searchEl.value = "";
    if (resultsEl) {
      resultsEl.style.display = "none";
      resultsEl.innerHTML = "";
    }
  }

  onStationSearchInput(prefix, keyword = "") {
    const resultsEl = document.getElementById(`${prefix}-station-results`);
    if (!resultsEl) return;

    const q = String(keyword || "").trim().toLowerCase();
    // Only show matching stations when user actually enters a search term
    if (!q) {
      resultsEl.style.display = "none";
      resultsEl.innerHTML = "";
      return;
    }

    const list = this.getStationMasterList();
    const matches = list.filter(s => {
      const name = String(s.name || "").toLowerCase();
      const river = String(s.river || "").toLowerCase();
      const region = String(s.region || "").toLowerCase();
      const code = String(s.code || "").toLowerCase();
      const addr = String(s.address || "").toLowerCase();
      return name.includes(q) || river.includes(q) || region.includes(q) || code.includes(q) || addr.includes(q);
    });

    const isUnassignedMatch = "미배정 본원 기술원 창고 보관".includes(q);

    if (matches.length === 0 && !isUnassignedMatch) {
      resultsEl.innerHTML = `
        <div style="padding:10px 12px; font-size:0.8rem; color:#64748b; text-align:center;">
          '<b>${keyword}</b>'에 해당하는 관측소가 없습니다.
        </div>
      `;
      resultsEl.style.display = "block";
      return;
    }

    let html = "";
    if (isUnassignedMatch) {
      html += `
        <div style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#fffbeb;"
             onmouseover="this.style.background='#fef3c7'" onmouseout="this.style.background='#fffbeb'"
             onclick="window.equipmentManager.selectStationFromSearch('${prefix}', '')">
          <span style="font-size:0.82rem; font-weight:700; color:#92400e;">🏢 미배정 (기술원 본원 / 중앙 창고 보관)</span>
          <span class="badge badge-amber" style="font-size:0.68rem;">본원보관</span>
        </div>
      `;
    }

    html += matches.slice(0, 30).map(s => `
      <div style="padding:7px 12px; cursor:pointer; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;"
           onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='#ffffff'"
           onclick="window.equipmentManager.selectStationFromSearch('${prefix}', '${s.id}')">
        <div>
          <b style="font-size:0.83rem; color:#0f172a;">📍 ${s.name}</b>
          <span style="font-size:0.75rem; color:#64748b; margin-left:6px;">${s.river || "-"} | 코드: <code>${s.code || "-"}</code></span>
        </div>
        <span class="badge badge-blue" style="font-size:0.7rem;">${s.region || "-"}</span>
      </div>
    `).join("");

    if (matches.length > 30) {
      html += `<div style="padding:6px 12px; font-size:0.74rem; color:#64748b; text-align:center; background:#f8fafc;">외 ${matches.length - 30}개소 더 있음 (검색어를 더 구체적으로 입력해주세요)</div>`;
    }

    resultsEl.innerHTML = html;
    resultsEl.style.display = "block";
  }

  selectStationFromSearch(prefix, stationId = "") {
    this.setModalStationSelection(prefix, stationId);
  }

  async openStatusModal(equipmentId, curStatus, curLocation, curStationId = null) {
    const modal = document.getElementById("eq-status-modal");
    if (!modal) return;

    document.getElementById("eq-status-id").value = equipmentId;
    document.getElementById("eq-status-select").value = curStatus || "OPERATING";
    document.getElementById("eq-status-location").value = curLocation || "";
    document.getElementById("eq-status-reason").value = "";

    this.setModalStationSelection("eq-status", curStationId);

    const labelEl = document.getElementById("eq-status-device-label");
    if (labelEl) labelEl.textContent = `${equipmentId}`;

    // Load exact device info asynchronously to enrich modal header & station selection
    try {
      const res = await window.apiClient.getEquipmentDeviceDetail(equipmentId);
      if (res && res.success && res.device) {
        const d = res.device;
        if (labelEl) {
          labelEl.textContent = `[${d.category_name}] ${d.model_name || "-"} (S/N: ${d.serial_no || "-"} | ID: ${d.equipment_id})`;
        }
        this.setModalStationSelection("eq-status", d.station_id, d.station_name);
        document.getElementById("eq-status-select").value = d.status || curStatus || "OPERATING";
        document.getElementById("eq-status-location").value = d.location || curLocation || "";
      }
    } catch (e) {
      // Ignore detail fetch error, fallback values are already set
    }

    modal.classList.add("active");
  }

  onStatusModalSelectChange(newStatus) {
    const locInput = document.getElementById("eq-status-location");
    if (!locInput) return;
    const curVal = locInput.value.trim();
    if (newStatus === "OPERATING" && (!curVal || curVal.includes("보관") || curVal.includes("수리") || curVal.includes("창고"))) {
      locInput.value = "현장설치";
    } else if (newStatus === "SPARE" && (!curVal || curVal === "현장설치")) {
      locInput.value = "기술원보관(예비품)";
    } else if (newStatus === "REPAIRING" && (!curVal || curVal === "현장설치" || curVal.includes("보관"))) {
      locInput.value = "리버앤씨(수리점검)";
    } else if (newStatus === "DISPOSAL") {
      locInput.value = "불용창고(폐기대기)";
    } else if (newStatus === "RETURNED") {
      locInput.value = "자산반납(처분완료)";
    }
  }

  closeStatusModal() {
    const modal = document.getElementById("eq-status-modal");
    if (modal) modal.classList.remove("active");
  }

  async submitStatusChange(e) {
    e.preventDefault();
    const eqId = document.getElementById("eq-status-id").value;
    const newStatus = document.getElementById("eq-status-select").value;
    const newLoc = document.getElementById("eq-status-location").value.trim();
    const reason = document.getElementById("eq-status-reason").value.trim();
    const stSelect = document.getElementById("eq-status-station-id");
    const stationId = stSelect ? stSelect.value : undefined;

    try {
      const res = await window.apiClient.updateEquipmentStatus(eqId, newStatus, newLoc, reason, stationId);
      if (res.success) {
        if (window.app) window.app.showToast(`장비 상태가 [${res.statusLabel || newStatus}](으)로 변경되었습니다.`, "success");
        this.closeStatusModal();
        if (this.selectedStationId) this.selectStation(this.selectedStationId);
        this.loadStationsSummary();
        this.loadDevices();
        this.loadDashboard();
        this.loadKPIs();
      } else {
        alert("상태 변경 실패: " + (res.message || res.error));
      }
    } catch (err) {
      alert("오류: " + err.message);
    }
  }

  /**
   * Full Equipment Detail & Status/Station Edit Modal (예비품/보관품/수리품/운영중 설비 통합 수정)
   */
  async openEditDeviceModal(equipmentId) {
    const modal = document.getElementById("eq-edit-modal");
    if (!modal || !equipmentId) return;

    document.getElementById("eq-edit-id").value = equipmentId;
    const idBadge = document.getElementById("eq-edit-id-badge");
    if (idBadge) idBadge.textContent = equipmentId;
    document.getElementById("eq-edit-reason").value = "";

    this.setModalStationSelection("eq-edit", null);

    try {
      const res = await window.apiClient.getEquipmentDeviceDetail(equipmentId);
      if (!res || !res.success || !res.device) {
        alert("장비 상세 정보를 불러올 수 없습니다.");
        return;
      }

      const d = res.device;
      const verBadge = document.getElementById("eq-edit-version-badge");
      if (verBadge) verBadge.textContent = `버전 v${d.version || 1} | 최근수정: ${(d.updated_at || "").split(" ")[0] || "-"}`;

      document.getElementById("eq-edit-status").value = d.status || "OPERATING";
      this.setModalStationSelection("eq-edit", d.station_id, d.station_name);
      document.getElementById("eq-edit-location").value = d.location || "";
      document.getElementById("eq-edit-category").value = d.category || "FLOWMETER";
      document.getElementById("eq-edit-model").value = d.model_name || "";
      document.getElementById("eq-edit-sn").value = d.serial_no || "";
      document.getElementById("eq-edit-asset").value = d.asset_no || d.asset_no_temp || "";
      document.getElementById("eq-edit-acq-date").value = d.acquisition_date || "";
      const lifeYrsEl = document.getElementById("eq-edit-lifespan-years");
      if (lifeYrsEl) lifeYrsEl.value = d.lifespan_years || this.getStandardLifespan(d.category);
      this.onEditLifespanInputChange();

      const calibDateEl = document.getElementById("eq-edit-calib-date");
      const calibExpEl = document.getElementById("eq-edit-calib-expire");
      const calibCertEl = document.getElementById("eq-edit-calib-cert");
      if (calibDateEl) calibDateEl.value = d.recent_calib_date || "";
      if (calibExpEl) calibExpEl.value = d.calib_expire_date || "";
      if (calibCertEl) calibCertEl.value = d.calib_cert_no || "";
      this.onEditCategoryChange(d.category || "FLOWMETER", false);

      const calibHistSummary = document.getElementById("eq-edit-calib-hist-summary");
      if (calibHistSummary) {
        const histCount = (res.calibrationHistory || []).length;
        calibHistSummary.innerHTML = `📜 누적 검정 이력: <b style="color:#c2410c;">${histCount}건</b> 등록됨`;
      }

      document.getElementById("eq-edit-memo").value = d.memo || "";

      // Render audit history
      const auditSec = document.getElementById("eq-edit-audit-section");
      const auditList = document.getElementById("eq-edit-audit-list");
      const logs = res.auditLogs || [];
      if (auditSec && auditList) {
        if (logs.length > 0) {
          auditSec.style.display = "block";
          auditList.innerHTML = logs.map(l => `
            <div style="padding:4px 0; border-bottom:1px dashed #e2e8f0; display:flex; justify-content:space-between; gap:8px;">
              <div>
                <span class="badge badge-gray" style="font-size:0.68rem;">${l.field_name}</span>
                <span>${l.before_value ? `<s style="color:#94a3b8;">${l.before_value}</s> ➔ ` : ""}<b style="color:#1e40af;">${l.after_value || "-"}</b></span>
                ${l.reason ? `<span style="color:#64748b;">(${l.reason})</span>` : ""}
              </div>
              <div style="color:#94a3b8; white-space:nowrap;">${(l.changed_at || "").slice(0, 16)} · ${l.changed_by || "-"}</div>
            </div>
          `).join("");
        } else {
          auditSec.style.display = "none";
          auditList.innerHTML = "";
        }
      }

      modal.classList.add("active");
    } catch (err) {
      console.error(err);
      alert("장비 정보 조회 오류: " + err.message);
    }
  }

  onEditModalStatusChange(newStatus) {
    const locInput = document.getElementById("eq-edit-location");
    if (!locInput) return;
    const curVal = locInput.value.trim();
    if (newStatus === "OPERATING" && (!curVal || curVal.includes("보관") || curVal.includes("수리") || curVal.includes("창고"))) {
      locInput.value = "현장설치";
    } else if (newStatus === "SPARE" && (!curVal || curVal === "현장설치")) {
      locInput.value = "기술원보관(예비품)";
    } else if (newStatus === "REPAIRING" && (!curVal || curVal === "현장설치" || curVal.includes("보관"))) {
      locInput.value = "리버앤씨(수리점검)";
    } else if (newStatus === "DISPOSAL") {
      locInput.value = "불용창고(폐기대기)";
    } else if (newStatus === "RETURNED") {
      locInput.value = "자산반납(처분완료)";
    }
  }

  onEditCategoryChange(category, resetLifespan = true) {
    if (resetLifespan) {
      const lifeEl = document.getElementById("eq-edit-lifespan-years");
      if (lifeEl) lifeEl.value = this.getStandardLifespan(category);
      this.onEditLifespanInputChange();
    }
    const calibBox = document.getElementById("eq-edit-calib-box");
    const calibTitle = document.getElementById("eq-edit-calib-title");
    const calibDateEl = document.getElementById("eq-edit-calib-date");
    const calibExpEl = document.getElementById("eq-edit-calib-expire");
    const cycle = this.getCalibCycleYears(category);

    if (cycle > 0) {
      if (calibBox) calibBox.style.display = "block";
      if (calibTitle) {
        calibTitle.textContent = category === "FLOWMETER"
          ? "🎯 유속계 법정 검정 정보 (2년 주기 · 검정기록 있을 시 입력)"
          : "🎯 수위계 법정 검정 정보 (3년 주기 · 검정기록 있을 시 입력)";
      }
      if (calibDateEl) calibDateEl.required = false;
      if (calibExpEl) calibExpEl.required = false;
      if (calibDateEl && calibDateEl.value && (!calibExpEl || !calibExpEl.value)) {
        this.onEditCalibDateChange();
      }
    } else {
      if (calibBox) calibBox.style.display = "none";
      if (calibDateEl) calibDateEl.required = false;
      if (calibExpEl) calibExpEl.required = false;
    }
  }

  onEditLifespanInputChange() {
    const acqEl = document.getElementById("eq-edit-acq-date");
    const lifeEl = document.getElementById("eq-edit-lifespan-years");
    const endEl = document.getElementById("eq-edit-lifespan-end");
    if (!acqEl || !lifeEl || !endEl) return;

    const m = String(acqEl.value || "").match(/(19\d{2}|20\d{2})/);
    const acqYr = m ? parseInt(m[1], 10) : NaN;
    const yrs = parseInt(lifeEl.value, 10);
    if (!isNaN(acqYr) && !isNaN(yrs)) {
      const endYr = acqYr + yrs;
      const isOver = 2026 > endYr;
      endEl.value = `${endYr}년 (${isOver ? "⚠️ 내용연수 초과" : "🟢 이내"})`;
      endEl.style.color = isOver ? "#dc2626" : "#1e40af";
    } else {
      endEl.value = "-";
    }
  }

  onEditCalibDateChange() {
    const catEl = document.getElementById("eq-edit-category");
    const calibDateEl = document.getElementById("eq-edit-calib-date");
    const calibExpEl = document.getElementById("eq-edit-calib-expire");
    if (!catEl || !calibDateEl || !calibExpEl) return;

    const cycle = this.getCalibCycleYears(catEl.value);
    if (cycle > 0 && calibDateEl.value) {
      calibExpEl.value = this.calcExpireDate(calibDateEl.value, cycle);
    }
  }

  closeEditDeviceModal() {
    const modal = document.getElementById("eq-edit-modal");
    if (modal) modal.classList.remove("active");
  }

  async submitEditDevice(e) {
    e.preventDefault();
    const eqId = document.getElementById("eq-edit-id").value;
    const status = document.getElementById("eq-edit-status").value;
    const stationId = document.getElementById("eq-edit-station-id").value;
    const location = document.getElementById("eq-edit-location").value.trim();
    const category = document.getElementById("eq-edit-category").value;
    const model_name = document.getElementById("eq-edit-model").value.trim();
    const serial_no = document.getElementById("eq-edit-sn").value.trim();
    const asset_no = document.getElementById("eq-edit-asset").value.trim();
    const acquisition_date = document.getElementById("eq-edit-acq-date").value.trim();
    const lifespan_years = parseInt(document.getElementById("eq-edit-lifespan-years")?.value, 10) || this.getStandardLifespan(category);
    const recent_calib_date = (document.getElementById("eq-edit-calib-date")?.value || "").trim();
    const calib_expire_date = (document.getElementById("eq-edit-calib-expire")?.value || "").trim();
    const calib_cert_no = (document.getElementById("eq-edit-calib-cert")?.value || "").trim();
    const memo = document.getElementById("eq-edit-memo").value.trim();
    const reason = document.getElementById("eq-edit-reason").value.trim();

    let final_calib_expire = calib_expire_date;
    if ((category === "FLOWMETER" || category === "WATER_LEVEL") && recent_calib_date && !final_calib_expire) {
      final_calib_expire = this.calcExpireDate(recent_calib_date, this.getCalibCycleYears(category));
    }

    const payload = {
      status,
      station_id: stationId ? parseInt(stationId, 10) : null,
      location,
      category,
      model_name,
      serial_no,
      asset_no,
      acquisition_date,
      lifespan_years,
      recent_calib_date: (category === "FLOWMETER" || category === "WATER_LEVEL") ? (recent_calib_date || null) : null,
      calib_expire_date: (category === "FLOWMETER" || category === "WATER_LEVEL") ? (final_calib_expire || null) : null,
      calib_cert_no: (category === "FLOWMETER" || category === "WATER_LEVEL") ? (calib_cert_no || null) : null,
      memo,
      reason: reason || "웹 시스템 장비 상세 수정"
    };

    try {
      const res = await window.apiClient.updateEquipmentDevice(eqId, payload);
      if (res.success) {
        if (window.app) {
          window.app.showToast(`장비(${eqId}) 정보가 저장되었습니다. (${res.changesCount || 0}개 항목 반영)`, "success");
        }
        this.closeEditDeviceModal();
        if (this.selectedStationId) this.selectStation(this.selectedStationId);
        this.loadStationsSummary();
        this.loadDevices();
        this.loadDashboard();
        this.loadKPIs();
      } else {
        alert("수정 실패: " + (res.message || res.error));
      }
    } catch (err) {
      alert("오류: " + err.message);
    }
  }

  async openRepairModal(equipmentId, repairId = null, curStage = "접수") {
    const modal = document.getElementById("eq-repair-modal");
    if (!modal) return;

    document.getElementById("eq-repair-eq-id").value = equipmentId;
    document.getElementById("eq-repair-id").value = repairId || "";
    document.getElementById("eq-repair-stage").value = curStage || "접수";
    document.getElementById("eq-repair-vendor").value = "리버앤씨";
    document.getElementById("eq-repair-memo").value = "";

    // If repairId was not passed, check if this device already has an active repair record
    if (!repairId && equipmentId) {
      try {
        const res = await window.apiClient.getEquipmentDeviceDetail(equipmentId);
        if (res && res.success && res.activeRepair && res.activeRepair.stage !== "반입·재설치") {
          const rep = res.activeRepair;
          document.getElementById("eq-repair-id").value = rep.id;
          document.getElementById("eq-repair-stage").value = rep.stage || "수리중";
          document.getElementById("eq-repair-vendor").value = rep.vendor || "리버앤씨";
          document.getElementById("eq-repair-memo").value = rep.action_memo || rep.issue_desc || "";
        }
      } catch (e) {
        // Ignore
      }
    }

    modal.classList.add("active");
  }

  closeRepairModal() {
    const modal = document.getElementById("eq-repair-modal");
    if (modal) modal.classList.remove("active");
  }

  async submitRepair(e) {
    e.preventDefault();
    const eqId = document.getElementById("eq-repair-eq-id").value;
    const repairId = document.getElementById("eq-repair-id").value;
    const stage = document.getElementById("eq-repair-stage").value;
    const vendor = document.getElementById("eq-repair-vendor").value;
    const memo = document.getElementById("eq-repair-memo").value.trim();

    try {
      if (repairId) {
        // Update stage
        const res = await window.apiClient.updateEquipmentRepairStage(repairId, stage, memo);
        if (res.success) {
          if (window.app) window.app.showToast(`수리 단계가 [${stage}]로 갱신되었습니다.`, "success");
          this.closeRepairModal();
          this.loadRepairs();
          if (this.selectedStationId) this.selectStation(this.selectedStationId);
        }
      } else {
        // Open new repair
        const res = await window.apiClient.createEquipmentRepair({
          equipment_id: eqId,
          vendor,
          issue_desc: memo || "현장 이상 발생으로 인한 수리 접수",
          received_date: new Date().toISOString().split("T")[0]
        });
        if (res.success) {
          if (window.app) window.app.showToast(`새 수리 건(${res.repairNo})이 접수되었습니다.`, "success");
          this.closeRepairModal();
          this.loadRepairs();
          if (this.selectedStationId) this.selectStation(this.selectedStationId);
        }
      }
    } catch (err) {
      alert("수리 처리 오류: " + err.message);
    }
  }

  // ==========================================
  // CALIBRATION HISTORY MANAGEMENT (검정 이력 누적 대장)
  // ==========================================

  async openCalibModal(equipmentId) {
    const modal = document.getElementById("eq-calib-modal");
    if (!modal || !equipmentId) return;

    document.getElementById("eq-calib-target-id").value = equipmentId;
    const badge = document.getElementById("eq-calib-id-badge");
    if (badge) badge.textContent = equipmentId;

    const tbody = document.getElementById("eq-calib-history-tbody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:#94a3b8;">검정 이력을 불러오는 중...</td></tr>`;

    try {
      const res = await window.apiClient.getEquipmentDeviceDetail(equipmentId);
      if (!res || !res.success || !res.device) {
        alert("장비 검정 정보를 불러올 수 없습니다.");
        return;
      }

      const d = res.device;
      this.calibModalTargetCategory = d.category;
      this.calibModalEquipmentId = equipmentId;

      // Header summary
      const nameEl = document.getElementById("eq-calib-summary-name");
      if (nameEl) nameEl.textContent = `${d.category_name || d.category} - ${d.model_name || "미등록 모델"}`;

      const subEl = document.getElementById("eq-calib-summary-sub");
      if (subEl) {
        subEl.innerHTML = `지점: <b>${d.station_name || "미배정(보관)"}</b> | S/N: <code>${d.serial_no || "-"}</code> | 취득: ${d.acquisition_date || "-"}년 | 내용연수: ${d.lifespan_years || this.getStandardLifespan(d.category)}년`;
      }

      const cycle = this.getCalibCycleYears(d.category);
      const cycleEl = document.getElementById("eq-calib-summary-cycle");
      if (cycleEl) {
        cycleEl.textContent = cycle > 0 ? `법정 ${cycle}년 주기` : "검정 비대상";
        cycleEl.className = cycle === 2 ? "badge badge-blue" : (cycle === 3 ? "badge badge-cyan" : "badge badge-gray");
      }

      const stEl = document.getElementById("eq-calib-summary-status");
      if (stEl) {
        if (d.calib_status === "overdue") {
          stEl.className = "badge badge-red";
          stEl.innerHTML = "🚨 검정만료 (검정시급)";
        } else if (d.calib_status === "due_soon") {
          stEl.className = "badge badge-amber";
          stEl.innerHTML = "⏳ 금년만료 도래";
        } else {
          stEl.className = "badge badge-green";
          stEl.innerHTML = "✅ 유효";
        }
      }

      // Default registration form values
      const todayStr = new Date().toISOString().split("T")[0];
      const dateInp = document.getElementById("eq-calib-input-date");
      const expInp = document.getElementById("eq-calib-input-expire");
      if (dateInp) dateInp.value = todayStr;
      if (expInp) expInp.value = this.calcExpireDate(todayStr, cycle > 0 ? cycle : 2);

      const agencyInp = document.getElementById("eq-calib-input-agency");
      if (agencyInp && !agencyInp.value) agencyInp.value = "한국수자원조사기술원";

      const certInp = document.getElementById("eq-calib-input-cert");
      if (certInp) certInp.value = "";

      const resSelect = document.getElementById("eq-calib-input-status");
      if (resSelect) resSelect.value = "합격";

      const costInp = document.getElementById("eq-calib-input-cost");
      if (costInp) costInp.value = "";

      const memoInp = document.getElementById("eq-calib-input-memo");
      if (memoInp) memoInp.value = "";

      // Calibration History Records
      const historyList = res.calibrationHistory || [];
      const countEl = document.getElementById("eq-calib-history-count");
      if (countEl) countEl.textContent = historyList.length;

      if (tbody) {
        if (historyList.length === 0) {
          tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:#94a3b8;">누적된 검정 이력이 없습니다. 위의 양식을 통해 첫 검정을 등록하세요.</td></tr>`;
        } else {
          tbody.innerHTML = historyList.map((item, idx) => {
            const turn = historyList.length - idx;
            let resBadge = `<span class="badge badge-green">🟢 합격</span>`;
            if (item.result_status === "조건부합격") resBadge = `<span class="badge badge-amber">🟡 조건부합격</span>`;
            else if (item.result_status === "보정완료") resBadge = `<span class="badge badge-blue">⚖️ 보정완료</span>`;
            else if (item.result_status === "불합격") resBadge = `<span class="badge badge-red">🔴 불합격</span>`;

            const isOverdue = item.expire_date && item.expire_date < "2026-01-01";
            const expireColor = isOverdue ? "#dc2626" : "#1e40af";

            return `
              <tr>
                <td style="text-align:center; font-weight:700;">${turn}차</td>
                <td style="text-align:center;"><b>${item.calib_date}</b></td>
                <td style="text-align:center;"><b style="color:${expireColor};">${item.expire_date || "-"}</b></td>
                <td style="text-align:center;"><span class="badge badge-purple" style="font-size:0.7rem;">${item.cycle_years || cycle}년</span></td>
                <td>${item.agency || "-"}</td>
                <td><code>${item.cert_no || "-"}</code></td>
                <td style="text-align:center;">${resBadge}</td>
                <td style="font-size:0.75rem; color:#475569;">
                  ${item.calib_cost ? `<span style="color:#0f766e; font-weight:700;">₩${Number(item.calib_cost).toLocaleString()}</span> · ` : ""}${item.memo || "-"}
                </td>
                <td style="text-align:center;">
                  <button type="button" class="btn btn-outline btn-sm" style="padding:1px 6px; font-size:0.7rem; color:#dc2626; border-color:#fca5a5;" onclick="window.equipmentManager.deleteCalibrationRecord(${item.id}, '${equipmentId}')" title="이 검정 기록 삭제">
                    ✕
                  </button>
                </td>
              </tr>
            `;
          }).join("");
        }
      }

      modal.classList.add("active");
    } catch (err) {
      console.error(err);
      alert("검정 이력 조회 오류: " + err.message);
    }
  }

  closeCalibModal() {
    const modal = document.getElementById("eq-calib-modal");
    if (modal) modal.classList.remove("active");
  }

  onNewCalibDateChange() {
    const dateInp = document.getElementById("eq-calib-input-date");
    const expInp = document.getElementById("eq-calib-input-expire");
    if (!dateInp || !expInp) return;

    const cycle = this.getCalibCycleYears(this.calibModalTargetCategory) || 2;
    if (dateInp.value) {
      expInp.value = this.calcExpireDate(dateInp.value, cycle);
    }
  }

  async submitNewCalibration(e) {
    if (e && e.preventDefault) e.preventDefault();
    const equipmentId = document.getElementById("eq-calib-target-id")?.value;
    if (!equipmentId) return;

    const calib_date = document.getElementById("eq-calib-input-date")?.value;
    const expire_date = document.getElementById("eq-calib-input-expire")?.value;
    const agency = (document.getElementById("eq-calib-input-agency")?.value || "").trim();
    const cert_no = (document.getElementById("eq-calib-input-cert")?.value || "").trim();
    const result_status = document.getElementById("eq-calib-input-status")?.value || "합격";
    const rawCost = document.getElementById("eq-calib-input-cost")?.value;
    const calib_cost = rawCost ? parseInt(rawCost, 10) : 0;
    const memo = (document.getElementById("eq-calib-input-memo")?.value || "").trim();

    if (!calib_date || !expire_date) {
      alert("검정 실시일자와 만료일자는 필수 입력값입니다.");
      return;
    }

    const cycle = this.getCalibCycleYears(this.calibModalTargetCategory) || 2;
    const payload = {
      calib_date,
      cycle_years: cycle,
      expire_date,
      agency: agency || "한국수자원조사기술원",
      cert_no: cert_no || null,
      result_status,
      calib_cost,
      memo
    };

    try {
      const res = await window.apiClient.createEquipmentCalibration(equipmentId, payload);
      if (res.success) {
        if (window.app) window.app.showToast(`새 검정 결과가 등록되고 장비 검정일이 갱신되었습니다.`, "success");
        // Refresh calib modal
        await this.openCalibModal(equipmentId);
        // Refresh background views
        if (this.selectedStationId) this.selectStation(this.selectedStationId);
        this.loadStationsSummary();
        this.loadDevices();
        this.loadDashboard();
        this.loadKPIs();
      } else {
        alert("검정 등록 실패: " + (res.message || res.error));
      }
    } catch (err) {
      alert("검정 등록 오류: " + err.message);
    }
  }

  async deleteCalibrationRecord(historyId, equipmentId) {
    if (!confirm("해당 검정 기록을 삭제하시겠습니까?\n\n(삭제 시 이 장비의 최근 검정일과 만료일이 직전 검정 이력으로 자동 재계산됩니다)")) return;

    try {
      const res = await window.apiClient.deleteEquipmentCalibration(historyId);
      if (res.success) {
        if (window.app) window.app.showToast("검정 기록이 삭제되었습니다.", "success");
        await this.openCalibModal(equipmentId);
        if (this.selectedStationId) this.selectStation(this.selectedStationId);
        this.loadStationsSummary();
        this.loadDevices();
        this.loadDashboard();
        this.loadKPIs();
      } else {
        alert("삭제 실패: " + (res.message || res.error));
      }
    } catch (err) {
      alert("삭제 오류: " + err.message);
    }
  }

  // ==========================================
  // EXCEL TEMPLATES & BULK UPLOAD (Section 11)
  // ==========================================

  async exportStationPackage(stationId) {
    if (!window.XLSX) {
      alert("엑셀 라이브러리(SheetJS)를 불러올 수 없습니다.");
      return;
    }

    try {
      const res = await window.apiClient.getEquipmentStationDetails(stationId);
      if (!res.success) throw new Error(res.message);

      const wb = XLSX.utils.book_new();
      const st = res.station;

      // 1. Devices Sheet
      const devRows = (res.operatingDevices || []).concat(res.otherDevices || []).map((d, i) => ({
        "순번": i + 1,
        "장비ID": d.equipment_id,
        "장비구분": d.category_name,
        "모델명": d.model_name,
        "제조번호(S/N)": d.serial_no || "-",
        "자산번호": d.asset_no || d.asset_no_temp || "-",
        "운영상태": d.status_label || d.status,
        "보관위치": d.location || "현장설치",
        "취득년도": d.acquisition_date || "-",
        "내용연수(년)": d.lifespan_years || this.getStandardLifespan(d.category),
        "내용연수만료년도": d.lifespan_end_year || "-",
        "내용연수초과여부": Number(d.is_lifespan_over) === 1 ? "초과" : "이내",
        "검정주기": this.getCalibCycleYears(d.category) > 0 ? `${this.getCalibCycleYears(d.category)}년` : "비대상",
        "최근검정일": d.recent_calib_date || "-",
        "검정만료일": d.calib_expire_date || "-",
        "검정상태": d.calib_status === "overdue" ? "검정만료" : (d.calib_status === "due_soon" ? "금년만료(검정필요)" : (d.calib_status === "valid" ? "유효" : "-")),
        "성적서/구분": d.calib_cert_no || "-"
      }));
      const wsDev = XLSX.utils.json_to_sheet(devRows);
      XLSX.utils.book_append_sheet(wb, wsDev, "장비목록");

      // 2. Works Sheet
      const workRows = (res.works || []).map((w, i) => ({
        "순번": i + 1,
        "작업번호": w.work_no,
        "작업일자": w.work_date,
        "작업구분": w.work_type,
        "작업인원": w.workers,
        "작업요약": w.summary,
        "상세조치": (w.actions || []).map(a => `[${a.action_name}] ${a.detail_text || ""}`).join(" / ")
      }));
      const wsWork = XLSX.utils.json_to_sheet(workRows);
      XLSX.utils.book_append_sheet(wb, wsWork, "조치이력");

      XLSX.writeFile(wb, `${st.name}_장비현황및이력_${new Date().toISOString().split("T")[0]}.xlsx`);
      if (window.app) window.app.showToast(`[${st.name}] 엑셀 패키지가 다운로드되었습니다.`, "success");
    } catch (e) {
      alert("다운로드 오류: " + e.message);
    }
  }

  async downloadBulkTemplate() {
    if (!window.XLSX) return;
    try {
      const res = await window.apiClient.getEquipmentDevices({ limit: 5000 });
      if (!res.success) throw new Error(res.message);

      const rows = res.devices.map(d => ({
        "장비ID(수정불가)": d.equipment_id,
        "데이터버전(수정불가)": d.version || 1,
        "지점코드(수정불가)": d.station_code || "-",
        "지점명(수정불가)": d.station_name,
        "장비구분(수정불가)": d.category_name,
        "모델명": d.model_name,
        "제조번호(S/N)": d.serial_no,
        "자산번호": d.asset_no,
        "취득년도": d.acquisition_date || "",
        "내용연수(년)": d.lifespan_years || this.getStandardLifespan(d.category),
        "최근검정일(YYYY-MM-DD)": d.recent_calib_date || "",
        "검정만료일(YYYY-MM-DD)": d.calib_expire_date || "",
        "보관위치": d.location,
        "비고": d.memo || ""
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "장비정보_수정");

      XLSX.writeFile(wb, `장비정보_일괄수정양식_${new Date().toISOString().split("T")[0]}.xlsx`);
      if (window.app) window.app.showToast("일괄 수정 엑셀 양식이 다운로드되었습니다.", "success");
    } catch (e) {
      alert("양식 다운로드 오류: " + e.message);
    }
  }

  async handleBulkUploadFile(file) {
    if (!file || !window.XLSX) return;
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(firstSheet);

        // Map column names
        const rows = rawRows.map(r => ({
          equipment_id: r["장비ID(수정불가)"] || r["장비ID"] || r["equipment_id"],
          version: r["데이터버전(수정불가)"] || r["데이터버전"] || r["version"] || 1,
          model_name: r["모델명"],
          serial_no: r["제조번호(S/N)"] || r["제조번호"] || r["serial_no"],
          asset_no: r["자산번호"] || r["asset_no"],
          acquisition_date: r["취득년도"] !== undefined ? String(r["취득년도"]) : r["acquisition_date"],
          lifespan_years: r["내용연수(년)"] !== undefined ? r["내용연수(년)"] : r["lifespan_years"],
          recent_calib_date: r["최근검정일(YYYY-MM-DD)"] || r["최근검정일"] || r["recent_calib_date"],
          calib_expire_date: r["검정만료일(YYYY-MM-DD)"] || r["검정만료일"] || r["calib_expire_date"],
          location: r["보관위치"] || r["location"],
          memo: r["비고"] || r["memo"]
        }));

        const res = await window.apiClient.validateBulkUpload(rows);
        if (res.success) {
          this.validatedBulkItems = res.items || [];
          this.renderBulkValidationPreview(res);
        } else {
          alert("검증 실패: " + res.message);
        }
      } catch (err) {
        alert("파일 처리 오류: " + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  renderBulkValidationPreview(result) {
    const box = document.getElementById("eq-bulk-preview-box");
    if (!box) return;

    box.style.display = "block";

    const summaryHtml = `
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:1rem;">
        <span class="badge badge-gray">전체 ${result.total}행</span>
        <span class="badge badge-blue">수정 대상 ${result.changed}행</span>
        <span class="badge badge-gray">변경 없음 ${result.unchanged}행</span>
        <span class="badge badge-red">오류 ${result.errors}행</span>
        <span class="badge badge-purple">충돌 ${result.conflicts}행</span>
      </div>
    `;

    const rowsHtml = result.items.map(it => {
      let stBadge = `<span class="badge badge-green">정상</span>`;
      if (it.status === "ERROR") stBadge = `<span class="badge badge-red">오류</span>`;
      else if (it.status === "CONFLICT") stBadge = `<span class="badge badge-purple">충돌</span>`;
      else if (it.status === "UNCHANGED") stBadge = `<span class="badge badge-gray">무변경</span>`;

      let diffText = "";
      if (it.changes && it.changes.length > 0) {
        diffText = it.changes.map(ch => `<b>${ch.label}:</b> <s>${ch.before || "공란"}</s> ➔ <span style="color:#2563eb; font-weight:700;">${ch.after}</span>`).join("<br>");
      } else {
        diffText = `<span style="color:#94a3b8;">${it.message || "-"}</span>`;
      }

      return `
        <tr>
          <td style="text-align:center;">${it.rowIdx}</td>
          <td><b>${it.station_name || "-"}</b></td>
          <td><code>${it.equipment_id}</code></td>
          <td>${diffText}</td>
          <td style="text-align:center;">${stBadge}</td>
        </tr>
      `;
    }).join("");

    box.innerHTML = `
      ${summaryHtml}
      <div class="table-responsive" style="max-height:360px; margin-bottom:1rem;">
        <table class="custom-table" style="width:100%; font-size:0.83rem;">
          <thead>
            <tr>
              <th style="width:50px; text-align:center;">행</th>
              <th>지점명</th>
              <th>장비ID</th>
              <th>변경 전·후 대조 (Diff)</th>
              <th style="width:80px; text-align:center;">검증결과</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:0.9rem; border-radius:8px;">
        <div style="flex:1; margin-right:1rem;">
          <input type="text" id="eq-bulk-apply-reason" class="form-input" placeholder="변경 사유를 입력해주세요 (예: 2026년 하반기 실물 대조 정비)" value="2026년 하반기 실물 대조 정비">
        </div>
        <button class="btn btn-primary" onclick="window.equipmentManager.applyBulkUpload()" ${result.changed === 0 ? "disabled" : ""} style="font-weight:700;">
          ✅ 정상 변경행 (${result.changed}건) 즉시 반영
        </button>
      </div>
    `;
  }

  async applyBulkUpload() {
    if (this.isBulkApplying) return;
    const reasonInput = document.getElementById("eq-bulk-apply-reason");
    const reason = reasonInput ? reasonInput.value.trim() : "엑셀 일괄 수정 반영";

    this.isBulkApplying = true;
    try {
      const res = await window.apiClient.applyBulkUpload(this.validatedBulkItems, reason);
      if (res.success) {
        if (window.app) window.app.showToast(`총 ${res.appliedCount}건의 장비 정보가 안전하게 일괄 반영되었습니다.`, "success");
        const box = document.getElementById("eq-bulk-preview-box");
        if (box) box.style.display = "none";
        this.loadDevices();
        if (this.selectedStationId) this.selectStation(this.selectedStationId);
      } else {
        alert("반영 실패: " + res.message);
      }
    } catch (e) {
      alert("오류: " + e.message);
    } finally {
      this.isBulkApplying = false;
    }
  }
}

window.equipmentManager = new EquipmentManager();
