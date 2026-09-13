/**
 * TimeSeriesMenuManager
 * Manages the dedicated full-screen "실시간 관측자료 시계열 분석" view with
 * integrated search, multi-dimensional filtering, and 7-metric Chart.js time-series analysis.
 */

class TimeSeriesMenuManager {
  constructor() {
    this.chart = null;
    this.selectedStationCode = null;
    this.activeTab = "waterLevel";
    this.cachedData = null;
    this.isInitialized = false;
    this.isGridOpen = false;
    this.resizeObserver = null;
    this.dualDeviceMode = "ewsv"; // 'ewsv' | 'advm' | 'compare'

    this.tabConfigs = {
      waterLevel: {
        title: "🌊 수위 추이",
        unit: "m",
        color: "#2563eb",
        bgColor: "rgba(37, 99, 235, 0.12)",
        label: "수위 (m)",
        field: "waterLevel",
        decimals: 2,
        guideText: "최근 24시간 동안의 10분 주기 수위 변화 곡선입니다."
      },
      velocity: {
        title: "⏩ 유속 추이",
        unit: "m/s",
        color: "#059669",
        bgColor: "rgba(5, 150, 105, 0.12)",
        label: "평균 유속 (m/s)",
        field: "velocity",
        decimals: 2,
        guideText: "관측 지점의 수류 유속 시계열입니다."
      },
      snr: {
        title: "📡 SNR 품질 추이",
        unit: "Count",
        color: "#7c3aed",
        bgColor: "rgba(124, 58, 237, 0.12)",
        label: "SNR (Count)",
        field: "snr",
        decimals: 0,
        threshold: 70,
        thresholdLabel: "SNR 기준선 (70)",
        guideText: "수신 신호품질 지표인 SNR 기준 70 이상을 유지해야 정상 수신으로 인정됩니다."
      },
      windSpeed: {
        title: "🌬️ 풍속 추이",
        unit: "m/s",
        color: "#0284c7",
        bgColor: "rgba(2, 132, 199, 0.12)",
        label: "풍속 (m/s)",
        field: "windSpeed",
        decimals: 1,
        guideText: "국사 기상 센서에서 측정된 풍속 시계열입니다."
      },
      windDeg: {
        title: "🧭 풍향 추이 (0~360°)",
        unit: "°",
        color: "#d97706",
        bgColor: "rgba(217, 119, 6, 0.12)",
        label: "풍향 (°)",
        field: "windDeg",
        decimals: 0,
        minY: 0,
        maxY: 360,
        guideText: "0°(북풍), 90°(동풍), 180°(남풍), 270°(서풍)"
      },
      ac: {
        title: "⚡ 상용전원(AC) 입력전압 안정성",
        unit: "V",
        color: "#b45309",
        bgColor: "rgba(180, 83, 9, 0.1)",
        label: "AC 전압 (V)",
        field: "ac",
        decimals: 1,
        rangeMin: 209,
        rangeMax: 231,
        rangeLabel: "정상 안전구간 (209V ~ 231V)",
        guideText: "상용전원 정상 안전 허용범위는 209V ~ 231V (공칭 220V)입니다."
      },
      dc: {
        title: "🔋 배터리 및 태양광 충전전압(DC) 추이",
        unit: "V",
        color: "#0891b2",
        bgColor: "rgba(8, 145, 178, 0.12)",
        label: "DC 전압 (V)",
        field: "dc",
        decimals: 1,
        rangeMin: 11.5,
        rangeMax: 14.5,
        warningThreshold: 11.8,
        warningLabel: "방전 경고선 (11.8V)",
        guideText: "정상 충전범위: 11.5V ~ 14.5V (주간 태양광 충전 / 야간 배터리 방전)"
      }
    };
  }

  /**
   * Value formatting helper adhering strictly to decimal requirements:
   * - waterLevel, velocity: 0.00 (2 decimal places)
   * - windSpeed, dc, ac: 0.0 (1 decimal place)
   * - snr, windDeg: integer (0 decimal places)
   */
  formatValue(field, val) {
    if (val === null || val === undefined || val === "" || isNaN(val)) return "-";
    const num = Number(val);
    if (field === "waterLevel" || field === "velocity") {
      return num.toFixed(2);
    }
    if (field === "windSpeed" || field === "dc" || field === "ac") {
      return num.toFixed(1);
    }
    if (field === "snr" || field === "windDeg") {
      return Math.round(num).toString();
    }
    return String(val);
  }

  /**
   * Safely searches station from DataManager by code or ID
   */
  findStation(codeOrId) {
    if (!window.dataManager || !codeOrId) return null;
    const str = String(codeOrId).trim();
    if (typeof window.dataManager.getByCode === "function") {
      const found = window.dataManager.getByCode(str);
      if (found) return found;
    }
    if (typeof window.dataManager.getById === "function") {
      const found = window.dataManager.getById(str);
      if (found) return found;
    }
    const all = window.dataManager.getAll ? window.dataManager.getAll() : [];
    return all.find(s => String(s.code || "").trim() === str || String(s.id || "").trim() === str) || null;
  }

  init() {
    const stations = window.dataManager ? window.dataManager.getAll() : [];
    if (!this.selectedStationCode && stations.length > 0) {
      // Pick first operating target station with live data
      const firstOperating = stations.find(s => s.isOperating2026 !== false && s.code);
      const targetSt = firstOperating || stations.find(s => s.code) || stations[0];
      if (targetSt) {
        this.selectedStationCode = String(targetSt.code || targetSt.id);
      }
    }
    this.populateStationDropdown();
    if (this.selectedStationCode && !this.cachedData) {
      this.loadStationData(this.selectedStationCode);
    }
    this.isInitialized = true;
  }

  /**
   * Called when user activates timeseries view panel
   */
  onTabVisible() {
    if (!this.isInitialized) {
      this.init();
      return;
    }
    this.populateStationDropdown();
    if (this.chart) {
      setTimeout(() => {
        try {
          this.chart.resize();
          this.chart.update();
        } catch (e) {}
      }, 50);
    } else if (this.cachedData) {
      this.renderView();
    } else if (this.selectedStationCode) {
      this.loadStationData(this.selectedStationCode);
    }
  }

  /**
   * Opens this view from external modules (e.g. from detail modal) directly focused on a station.
   */
  openForStation(codeOrId) {
    if (window.app) {
      window.app.switchTab("timeseries");
    }
    this.selectedStationCode = String(codeOrId).trim();
    this.populateStationDropdown();
    this.loadStationData(this.selectedStationCode);
  }

  getFilteredStations() {
    if (!window.dataManager) return [];
    let stations = window.dataManager.getAll();

    const searchKeyword = document.getElementById("ts-search-input")?.value.trim().toLowerCase() || "";
    const regionFilter = document.getElementById("ts-region-filter")?.value || "all";
    const gaugeFilter = document.getElementById("ts-gauge-filter")?.value || "all";
    const statusFilter = document.getElementById("ts-status-filter")?.value || "all";

    return stations.filter(s => {
      // 1. Text Search Filter (name, code, river, address)
      if (searchKeyword) {
        const nameMatch = (s.name || "").toLowerCase().includes(searchKeyword);
        const codeMatch = (s.code || "").toLowerCase().includes(searchKeyword);
        const riverMatch = (s.river || "").toLowerCase().includes(searchKeyword);
        const addrMatch = (s.address || "").toLowerCase().includes(searchKeyword);
        if (!nameMatch && !codeMatch && !riverMatch && !addrMatch) return false;
      }

      // 2. Region Filter
      if (regionFilter !== "all" && s.region !== regionFilter) {
        return false;
      }

      // 3. Gauge Type Filter
      if (gaugeFilter !== "all") {
        if (gaugeFilter === "DUAL") {
          if (!s.isDualGauge && s.gaugeCategory !== "DUAL") return false;
        } else {
          if (s.gaugeType !== gaugeFilter && s.gaugeCategory !== gaugeFilter) return false;
        }
      }

      // 4. Status Filter (operating vs scheduled)
      if (statusFilter === "operating") {
        if (s.isOperating2026 === false) return false;
      } else if (statusFilter === "scheduled") {
        if (s.isOperating2026 !== false) return false;
      }

      return true;
    });
  }

  populateStationDropdown() {
    const select = document.getElementById("ts-station-select");
    const countBadge = document.getElementById("ts-result-count-badge");
    const gridContainer = document.getElementById("ts-grid-items-container");
    const gridCountText = document.getElementById("ts-grid-count-text");
    const searchClearBtn = document.getElementById("ts-search-clear-btn");
    const searchVal = document.getElementById("ts-search-input")?.value || "";

    if (searchClearBtn) {
      searchClearBtn.style.display = searchVal ? "block" : "none";
    }

    const filtered = this.getFilteredStations();
    const totalCount = window.dataManager ? window.dataManager.getAll().length : 0;

    if (countBadge) {
      countBadge.textContent = `검색결과: ${filtered.length} / 총 ${totalCount}개소`;
      countBadge.className = `badge ${filtered.length > 0 ? 'badge-blue' : 'badge-red'}`;
    }

    if (gridCountText) {
      gridCountText.textContent = `검색결과: ${filtered.length}개소`;
    }

    if (!select) return;

    if (filtered.length === 0) {
      select.innerHTML = `<option value="">검색 조건에 일치하는 관측소가 없습니다</option>`;
      select.disabled = true;
      if (gridContainer) {
        gridContainer.innerHTML = `
          <div style="grid-column: 1 / -1; text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.85rem;">
            🔍 일치하는 관측시설이 없습니다. 검색어나 필터 조건을 변경해주세요.
          </div>
        `;
      }
      return;
    }

    select.disabled = false;
    select.innerHTML = filtered.map(s => {
      const codeStr = s.code ? ` (${s.code})` : "";
      const isOperating = s.isOperating2026 !== false;
      const statusIcon = isOperating ? "🟢" : "⚪";
      const statusText = isOperating ? "수집중" : "2026구축예정";
      const isSelected = String(s.code || s.id) === String(this.selectedStationCode) ? "selected" : "";

      return `<option value="${s.code || s.id}" ${isSelected}>${statusIcon} [${s.region || "전국"}] ${s.name}${codeStr} | ${s.river || "-"} | ${s.gaugeType || "유속계"} (${statusText})</option>`;
    }).join("");

    // Ensure selected station value matches if present in filtered list
    const hasSelected = filtered.some(s => String(s.code || s.id) === String(this.selectedStationCode));
    if (!this.selectedStationCode && filtered.length > 0) {
      this.selectedStationCode = String(filtered[0].code || filtered[0].id);
      select.value = this.selectedStationCode;
    } else if (hasSelected) {
      select.value = this.selectedStationCode;
    }

    // Populate Quick Grid Chips
    if (gridContainer) {
      gridContainer.innerHTML = filtered.map(s => {
        const codeVal = s.code || s.id;
        const isCurrent = String(codeVal) === String(this.selectedStationCode);
        const isOperating = s.isOperating2026 !== false;

        return `
          <div onclick="window.timeSeriesMenuManager.selectStation('${codeVal}')" 
               style="cursor:pointer; padding:6px 10px; border-radius:8px; border:1px solid ${isCurrent ? '#2563eb' : '#e2e8f0'}; background:${isCurrent ? '#eff6ff' : '#ffffff'}; transition:all 0.15s ease; display:flex; flex-direction:column; gap:2px; box-shadow:${isCurrent ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none'};">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; font-size:0.84rem; color:${isCurrent ? '#1e40af' : '#1e293b'};">${s.name}</span>
              <span style="font-size:0.7rem;">${isOperating ? '🟢' : '⚪'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.74rem; color:#64748b;">
              <span>${s.region} · ${s.river || "-"}</span>
              <code style="font-weight:600; color:#3b82f6;">${s.code || "-"}</code>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  onFilterChange() {
    this.populateStationDropdown();
    const select = document.getElementById("ts-station-select");
    if (select && select.value && select.value !== this.selectedStationCode) {
      this.selectStation(select.value);
    }
  }

  clearSearch() {
    const searchInput = document.getElementById("ts-search-input");
    if (searchInput) {
      searchInput.value = "";
      this.onFilterChange();
      searchInput.focus();
    }
  }

  resetFilters() {
    const searchInput = document.getElementById("ts-search-input");
    const regionFilter = document.getElementById("ts-region-filter");
    const gaugeFilter = document.getElementById("ts-gauge-filter");
    const statusFilter = document.getElementById("ts-status-filter");

    if (searchInput) searchInput.value = "";
    if (regionFilter) regionFilter.value = "all";
    if (gaugeFilter) gaugeFilter.value = "all";
    if (statusFilter) statusFilter.value = "operating";

    this.populateStationDropdown();
    const select = document.getElementById("ts-station-select");
    if (select && select.options.length > 0) {
      this.selectStation(select.options[0].value);
    }
  }

  toggleGrid() {
    this.isGridOpen = !this.isGridOpen;
    const grid = document.getElementById("ts-quick-station-grid");
    const btnText = document.getElementById("ts-toggle-grid-text");
    const btn = document.getElementById("ts-toggle-grid-btn");

    if (grid) grid.style.display = this.isGridOpen ? "block" : "none";
    if (btnText) btnText.textContent = this.isGridOpen ? "지점 빠른 탐색창 접기" : "지점 빠른 탐색창 열기";
    if (btn) {
      btn.style.background = this.isGridOpen ? "#e2e8f0" : "#ffffff";
      btn.style.fontWeight = this.isGridOpen ? "700" : "600";
    }
  }

  reloadCurrentStation() {
    if (this.selectedStationCode) {
      this.cachedData = null;
      this.loadStationData(this.selectedStationCode);
    }
  }

  selectStation(codeOrId) {
    if (!codeOrId) return;
    this.selectedStationCode = String(codeOrId).trim();
    const select = document.getElementById("ts-station-select");
    if (select && select.value !== this.selectedStationCode) {
      select.value = this.selectedStationCode;
    }

    this.populateStationDropdown();
    this.loadStationData(this.selectedStationCode);
  }

  async loadStationData(codeOrId) {
    if (!codeOrId) return;
    const st = this.findStation(codeOrId);
    const code = st ? (st.code || st.id) : codeOrId;
    const isOperating = st ? st.isOperating2026 !== false : true;

    // Update Station Header Banner
    const titleEl = document.getElementById("ts-station-title");
    const descEl = document.getElementById("ts-station-desc");
    const statusBadge = document.getElementById("ts-header-status-badge");

    if (titleEl) {
      titleEl.innerHTML = `🌊 ${st?.name || codeOrId} <span class="badge badge-blue" style="font-size:0.8rem; margin-left:6px;">${st?.region || "전국"}</span> ${st?.isDualGauge ? '<span class="badge badge-purple" style="font-size:0.8rem;">⚡ 이중화</span>' : ''}`;
    }
    if (descEl) {
      descEl.innerHTML = `지점코드: <b style="color:#ffffff;">${st?.code || "-"}</b> &nbsp;|&nbsp; 하천명: <b>${st?.river || "-"}</b> &nbsp;|&nbsp; 주소: ${st?.address || "-"} &nbsp;|&nbsp; 유속계: <b>${st?.gaugeType || "-"}</b>`;
    }
    if (statusBadge) {
      statusBadge.innerHTML = isOperating ? "🟢 실시간 수집중 (정상)" : "⚪ 2026년 구축예정 (미수집)";
      statusBadge.style.background = isOperating ? "rgba(16, 185, 129, 0.25)" : "rgba(148, 163, 184, 0.3)";
      statusBadge.style.color = "#ffffff";
    }

    const container = document.getElementById("ts-content-container");
    if (!container) return;

    container.innerHTML = `
      <div style="text-align:center; padding:3.5rem; color:#64748b; background:#ffffff; border-radius:12px; border:1px solid #e2e8f0; margin-top:0.5rem;">
        <div style="font-size:2.2rem; margin-bottom:10px; animation:spin 1.5s infinite linear;">⏳</div>
        <div style="font-size:1.05rem; font-weight:700; color:#1e293b;">[${st?.name || code}] 최근 24시간 실시간 시계열 관측자료를 조회 중입니다...</div>
        <div style="font-size:0.84rem; color:#64748b; margin-top:4px;">원천 SFTP(211.114.42.234) 10분 주기 수집 데이터 분석 중</div>
      </div>
    `;

    try {
      const res = await fetch(`/api/monitor/timeseries/${encodeURIComponent(code)}`);
      const json = await res.json();

      if (!json.success || !json.hasData || !json.points || json.points.length === 0) {
        this.cachedData = null;
        container.innerHTML = `
          <div style="text-align:center; padding:3.5rem 1.5rem; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; margin-top:0.5rem;">
            <div style="font-size:3rem; margin-bottom:1rem;">📡</div>
            <h3 style="font-size:1.2rem; font-weight:700; color:#1e293b; margin-bottom:0.5rem;">실시간 관측자료 미수집 지점</h3>
            <p style="color:#64748b; font-size:0.92rem; line-height:1.6; max-width:580px; margin:0 auto;">
              ${json.message || `해당 관측소(<b>지점코드: ${code}</b>)는 현재 실시간 관측자료 수집 대상에 포함되지 않았거나, 2026년 구축예정/미운영 상태로 수신된 관측자료가 없습니다.`}
            </p>
            <div style="margin-top:1.25rem;">
              <button class="btn btn-primary btn-sm" onclick="window.timeSeriesMenuManager.resetFilters()" style="padding:6px 14px;">
                🟢 실시간 수집중인 다른 지점 탐색하기
              </button>
            </div>
          </div>
        `;
        return;
      }

      this.cachedData = json;
      this.renderView();
    } catch (e) {
      console.error("[TimeSeriesMenu] Error loading:", e);
      container.innerHTML = `
        <div style="text-align:center; padding:2rem; color:#ef4444; background:#fef2f2; border-radius:8px; margin-top:0.5rem;">
          ⚠️ 시계열 데이터 조회 중 오류가 발생했습니다: ${e.message}
        </div>
      `;
    }
  }

  renderView() {
    const container = document.getElementById("ts-content-container");
    if (!container || !this.cachedData) return;

    const lastPoint = this.cachedData.points[this.cachedData.points.length - 1] || {};

    const tabs = [
      { key: "waterLevel", icon: "🌊", name: "수위" },
      { key: "velocity", icon: "⏩", name: "유속" },
      { key: "snr", icon: "📡", name: "SNR" },
      { key: "windSpeed", icon: "🌬️", name: "풍속" },
      { key: "windDeg", icon: "🧭", name: "풍향" },
      { key: "ac", icon: "⚡", name: "AC 전압" },
      { key: "dc", icon: "🔋", name: "DC 전압" }
    ];

    const isDual = this.cachedData.isDual || false;
    const dualData = this.cachedData.dualData || null;
    const sensorCount = this.cachedData.sensorCount || 1;
    const sensorLabels = this.cachedData.sensorLabels || [];
    const isMultiSensor = !isDual && sensorCount > 1;

    const currentConf = this.tabConfigs[this.activeTab] || this.tabConfigs.waterLevel;
    let latestFormatted = this.formatValue(currentConf.field, lastPoint[currentConf.field]);
    if (isDual && this.activeTab === "velocity") {
      if (this.dualDeviceMode === "ewsv") {
        latestFormatted = this.formatValue("velocity", lastPoint.ewsvVelocity);
      } else if (this.dualDeviceMode === "advm") {
        latestFormatted = this.formatValue("velocity", lastPoint.advmVelocity);
      }
    } else if (isDual && this.activeTab === "snr") {
      if (this.dualDeviceMode === "ewsv") {
        latestFormatted = this.formatValue("snr", lastPoint.ewsvSnr);
      } else if (this.dualDeviceMode === "advm") {
        latestFormatted = this.formatValue("snr", lastPoint.advmSnr);
      }
    }

    container.innerHTML = `
      <!-- 1. Top 4 KPI Metric Summary Cards -->
      <div class="kpi-grid" style="margin-bottom:1.25rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div class="kpi-card" style="border-left: 4px solid #2563eb;">
          <div class="kpi-icon blue">🌊</div>
          <div class="kpi-info">
            <div class="kpi-value">${this.formatValue('waterLevel', lastPoint.waterLevel)} <span style="font-size:1rem; font-weight:500;">m</span></div>
            <div class="kpi-label">현재 수위 (최근 측정)</div>
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid #059669;">
          <div class="kpi-icon green">⏩</div>
          <div class="kpi-info">
            ${isDual ? `
              <div class="kpi-value" style="font-size:1.15rem;">
                <span style="color:#059669;">⚡ ${this.formatValue('velocity', lastPoint.ewsvVelocity)}</span> 
                <span style="font-size:0.8rem; color:#64748b;">/</span> 
                <span style="color:#2563eb;">🌊 ${this.formatValue('velocity', lastPoint.advmVelocity)}</span> 
                <span style="font-size:0.85rem; font-weight:500;">m/s</span>
              </div>
              <div class="kpi-label">이중화 유속 (EWSV / ADVM)</div>
            ` : `
              <div class="kpi-value">${this.formatValue('velocity', lastPoint.velocity)} <span style="font-size:1rem; font-weight:500;">m/s</span></div>
              <div class="kpi-label">단면 평균 유속</div>
            `}
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid #7c3aed;">
          <div class="kpi-icon purple">📡</div>
          <div class="kpi-info">
            ${isDual ? `
              <div class="kpi-value" style="font-size:1.15rem;">
                <span style="color:#7c3aed;">⚡ ${this.formatValue('snr', lastPoint.ewsvSnr)}</span> 
                <span style="font-size:0.8rem; color:#64748b;">/</span> 
                <span style="color:#0284c7;">🌊 ${this.formatValue('snr', lastPoint.advmSnr)}</span>
              </div>
              <div class="kpi-label">이중화 SNR (EWSV / ADVM)</div>
            ` : `
              <div class="kpi-value">${this.formatValue('snr', lastPoint.snr)} <span style="font-size:1rem; font-weight:500;">Count</span></div>
              <div class="kpi-label">SNR (기준 ≥ 70)</div>
            `}
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid #b45309;">
          <div class="kpi-icon amber">⚡</div>
          <div class="kpi-info">
            <div class="kpi-value" style="font-size:1.25rem;">${this.formatValue('ac', lastPoint.ac)}V <span style="font-size:0.85rem; color:#64748b;">/</span> ${this.formatValue('dc', lastPoint.dc)}V</div>
            <div class="kpi-label">국사 전원 (AC / DC 배터리)</div>
          </div>
        </div>
      </div>

      <!-- 2. Main Full-Width Chart Card -->
      <div class="card" style="margin-bottom:1.5rem; padding:1.25rem; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
        <!-- 7 Tab Navigation Buttons -->
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:1rem; background:#f1f5f9; padding:8px; border-radius:10px;">
          ${tabs.map(t => {
            const isActive = t.key === this.activeTab;
            return `
              <button class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}" 
                      onclick="window.timeSeriesMenuManager.switchTab('${t.key}')" 
                      style="font-size:0.85rem; padding:6px 14px; border-radius:8px; flex:1 1 auto; font-weight:${isActive ? '700' : '600'}; background:${isActive ? '#1e40af' : '#ffffff'}; color:${isActive ? '#ffffff' : '#334155'}; border:1px solid ${isActive ? '#1e40af' : '#cbd5e1'};">
                <span>${t.icon}</span> <span>${t.name}</span>
              </button>
            `;
          }).join("")}
        </div>

        <!-- Dual Gauge Device Switcher Pills (Visible only for Dual Gauge on Velocity & SNR Tabs) -->
        ${isDual && (this.activeTab === "velocity" || this.activeTab === "snr") ? `
          <div style="display:flex; gap:8px; margin-bottom:12px; align-items:center; background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; flex-wrap:wrap;">
            <span style="font-size:0.85rem; font-weight:800; color:#1e293b;">⚡ 이중화 장비 분리 분석:</span>
            <button class="btn btn-sm" onclick="window.timeSeriesMenuManager.setDualDeviceMode('ewsv')"
                    style="font-size:0.82rem; padding:5px 14px; font-weight:700; border-radius:6px; cursor:pointer; transition:all 0.15s ease; ${this.dualDeviceMode === 'ewsv' ? 'background:#059669; color:#ffffff; border:1px solid #059669; box-shadow:0 2px 4px rgba(5,150,105,0.3);' : 'background:#ffffff; color:#334155; border:1px solid #cbd5e1;'}">
              ⚡ EWSV 전자파유속계 (${dualData?.ewsv?.count || 2}대)
            </button>
            <button class="btn btn-sm" onclick="window.timeSeriesMenuManager.setDualDeviceMode('advm')"
                    style="font-size:0.82rem; padding:5px 14px; font-weight:700; border-radius:6px; cursor:pointer; transition:all 0.15s ease; ${this.dualDeviceMode === 'advm' ? 'background:#2563eb; color:#ffffff; border:1px solid #2563eb; box-shadow:0 2px 4px rgba(37,99,235,0.3);' : 'background:#ffffff; color:#334155; border:1px solid #cbd5e1;'}">
              🌊 ADVM 초음파유속계 (${dualData?.advm?.count || 1}대)
            </button>
            <button class="btn btn-sm" onclick="window.timeSeriesMenuManager.setDualDeviceMode('compare')"
                    style="font-size:0.82rem; padding:5px 14px; font-weight:700; border-radius:6px; cursor:pointer; transition:all 0.15s ease; ${this.dualDeviceMode === 'compare' ? 'background:#7c3aed; color:#ffffff; border:1px solid #7c3aed; box-shadow:0 2px 4px rgba(124,58,237,0.3);' : 'background:#ffffff; color:#334155; border:1px solid #cbd5e1;'}">
              📊 EWSV vs ADVM 상호대조
            </button>
          </div>
        ` : ""}

        <!-- Chart Info Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:10px 14px; background:#f8fafc; border-radius:8px; border-left:4px solid ${currentConf.color}; flex-wrap:wrap; gap:8px;">
          <div>
            <span style="font-weight:800; font-size:1.05rem; color:#1e293b;">
              ${isDual && this.activeTab === "velocity" ? (this.dualDeviceMode === "ewsv" ? "⚡ EWSV 전자파 표면유속 추이" : this.dualDeviceMode === "advm" ? "🌊 ADVM 초음파 수중유속 추이" : "📊 EWSV vs ADVM 유속 대조 분석") : (isDual && this.activeTab === "snr" ? (this.dualDeviceMode === "ewsv" ? "📡 EWSV 전자파 신호품질(SNR)" : this.dualDeviceMode === "advm" ? "📡 ADVM 초음파 신호품질(SNR)" : "📊 EWSV vs ADVM SNR 대조 분석") : currentConf.title)}
            </span>
            ${isDual ? `
              <span class="badge badge-purple" style="margin-left:8px; font-size:0.8rem; font-weight:700;">⚡ 이중화 관측소 (EWSV ${dualData?.ewsv?.count || 2}대 + ADVM ${dualData?.advm?.count || 1}대)</span>
            ` : (isMultiSensor && (this.activeTab === "velocity" || this.activeTab === "snr") ? `
              <span class="badge badge-purple" style="margin-left:8px; font-size:0.8rem; font-weight:700;">🎯 유속계 총 ${sensorCount}대 설치 (유속계별 멀티라인)</span>
            ` : "")}
            <span style="font-size:0.82rem; color:#64748b; margin-left:10px;">💡 ${currentConf.guideText}</span>
          </div>
          <div style="font-size:0.95rem; font-weight:800; color:${currentConf.color};">
            최근 측정값: <span style="font-size:1.25rem; font-family:monospace;">${latestFormatted}</span> ${currentConf.unit}
          </div>
        </div>

        <!-- Wide Canvas -->
        <div id="ts-chart-parent-wrapper" style="position:relative; width:100%; height:360px; min-height:360px;">
          <canvas id="ts-menu-canvas" style="display:block; width:100%; height:100%;"></canvas>
        </div>
      </div>

      <!-- 3. 24-Hour Raw Data Grid (Recent 10-Min Log) -->
      <div class="card" style="padding:1.4rem; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05); border:1px solid #e2e8f0;">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.1rem; flex-wrap:wrap; gap:0.75rem;">
          <div>
            <span style="font-size:1.05rem; font-weight:800; color:#1e293b;">📋 최근 24시간 10분 주기 원시 관측 로그</span>
            <span style="font-size:0.82rem; color:#64748b; margin-left:8px; font-weight:600;">(총 ${this.cachedData.points.length}건 수집)</span>
            ${isDual ? `<span class="badge badge-purple" style="margin-left:8px; font-size:0.78rem;">EWSV / ADVM 장비별 분리 표출</span>` : (isMultiSensor ? `<span class="badge badge-blue" style="margin-left:8px; font-size:0.78rem;">유속계 ${sensorCount}대 개별 계측치 포함</span>` : "")}
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="btn btn-outline btn-sm" onclick="window.timeSeriesMenuManager.exportCsv()" style="font-size:0.82rem; font-weight:700; padding:6px 14px; border-radius:6px; background:#ffffff; border-color:#cbd5e1; color:#334155; display:flex; align-items:center; gap:5px;">
              <span>📥</span> <span>24시간 관측자료 CSV 다운로드</span>
            </button>
          </div>
        </div>

        <div style="border:1px solid #e2e8f0; border-radius:8px; overflow-x:auto; overflow-y:auto; max-height:420px; background:#ffffff;">
          <table style="width:100%; border-collapse:collapse; font-size:0.86rem; text-align:center; min-width:${isDual ? '1350px' : (isMultiSensor ? '1100px' : '860px')};">
            <thead style="position:sticky; top:0; background:#f1f5f9; z-index:2; border-bottom:2px solid #cbd5e1;">
              <tr>
                <th style="padding:12px 14px; font-weight:700; color:#1e293b; white-space:nowrap;">관측 일시</th>
                <th style="padding:12px 14px; font-weight:700; color:#1e40af; white-space:nowrap;">수위 (m)</th>
                
                ${isDual ? `
                  <!-- EWSV Group -->
                  <th style="padding:12px 10px; font-weight:800; color:#065f46; background:#ecfdf5; white-space:nowrap;">EWSV 평균유속 (m/s)</th>
                  ${(dualData?.ewsv?.labels || []).map(lbl => `<th style="padding:12px 10px; font-weight:700; color:#059669; background:#ecfdf5; white-space:nowrap;">${lbl} (m/s)</th>`).join("")}
                  <!-- ADVM Group -->
                  <th style="padding:12px 10px; font-weight:800; color:#1e40af; background:#eff6ff; white-space:nowrap;">ADVM 평균유속 (m/s)</th>
                  ${(dualData?.advm?.labels || []).map(lbl => `<th style="padding:12px 10px; font-weight:700; color:#2563eb; background:#eff6ff; white-space:nowrap;">${lbl} (m/s)</th>`).join("")}
                  <!-- SNR Group -->
                  <th style="padding:12px 10px; font-weight:700; color:#7c3aed; background:#f5f3ff; white-space:nowrap;">EWSV SNR</th>
                  <th style="padding:12px 10px; font-weight:700; color:#0284c7; background:#f0f9ff; white-space:nowrap;">ADVM SNR</th>
                ` : `
                  <th style="padding:12px 14px; font-weight:700; color:#065f46; white-space:nowrap;">단면평균 유속 (m/s)</th>
                  ${isMultiSensor ? sensorLabels.map(lbl => `<th style="padding:12px 10px; font-weight:700; color:#0d9488; white-space:nowrap;">${lbl} (m/s)</th>`).join("") : ""}
                  <th style="padding:12px 14px; font-weight:700; color:#5b21b6; white-space:nowrap;">대표 SNR</th>
                  ${isMultiSensor ? sensorLabels.map(lbl => `<th style="padding:12px 10px; font-weight:700; color:#7c3aed; white-space:nowrap;">${lbl} SNR</th>`).join("") : ""}
                `}

                <th style="padding:12px 14px; font-weight:700; color:#0369a1; white-space:nowrap;">풍속 (m/s)</th>
                <th style="padding:12px 14px; font-weight:700; color:#b45309; white-space:nowrap;">풍향 (°)</th>
                <th style="padding:12px 14px; font-weight:700; color:#475569; white-space:nowrap;">AC 전압 (V)</th>
                <th style="padding:12px 14px; font-weight:700; color:#0e7490; white-space:nowrap;">DC 전압 (V)</th>
              </tr>
            </thead>
            <tbody>
              ${[...this.cachedData.points].reverse().map((p, idx) => {
                const isEven = idx % 2 === 0;
                return `
                  <tr style="background:${isEven ? '#ffffff' : '#f8fafc'}; border-bottom:1px solid #e2e8f0; transition:background 0.15s ease;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='${isEven ? '#ffffff' : '#f8fafc'}'">
                    <td style="padding:10px 14px; font-weight:600; color:#1e3a8a; font-family:monospace; font-size:0.88rem;">${p.time}</td>
                    <td style="padding:10px 14px; font-weight:700; color:#2563eb; font-family:monospace; font-size:0.9rem;">${this.formatValue('waterLevel', p.waterLevel)}</td>
                    
                    ${isDual ? `
                      <td style="padding:10px 10px; font-weight:800; color:#059669; font-family:monospace; background:${isEven ? '#f0fdf4' : '#ecfdf5'};">${this.formatValue('velocity', p.ewsvVelocity)}</td>
                      ${(dualData?.ewsv?.labels || []).map((_, k) => {
                        const sv = p.ewsvSensorVelocities && p.ewsvSensorVelocities[k] !== undefined ? p.ewsvSensorVelocities[k] : p.ewsvVelocity;
                        return `<td style="padding:10px 10px; font-weight:600; color:#0d9488; font-family:monospace; background:${isEven ? '#f0fdf4' : '#ecfdf5'};">${this.formatValue('velocity', sv)}</td>`;
                      }).join("")}
                      <td style="padding:10px 10px; font-weight:800; color:#2563eb; font-family:monospace; background:${isEven ? '#eff6ff' : '#ebf5ff'};">${this.formatValue('velocity', p.advmVelocity)}</td>
                      ${(dualData?.advm?.labels || []).map((_, k) => {
                        const sv = p.advmSensorVelocities && p.advmSensorVelocities[k] !== undefined ? p.advmSensorVelocities[k] : p.advmVelocity;
                        return `<td style="padding:10px 10px; font-weight:600; color:#3b82f6; font-family:monospace; background:${isEven ? '#eff6ff' : '#ebf5ff'};">${this.formatValue('velocity', sv)}</td>`;
                      }).join("")}
                      <td style="padding:10px 10px; background:${isEven ? '#faf5ff' : '#f5f3ff'};"><span class="badge ${p.ewsvSnr >= 70 ? 'badge-green' : 'badge-amber'}" style="font-size:0.8rem; padding:3px 8px;">${this.formatValue('snr', p.ewsvSnr)}</span></td>
                      <td style="padding:10px 10px; background:${isEven ? '#f0f9ff' : '#e0f2fe'};"><span class="badge ${p.advmSnr >= 70 ? 'badge-green' : 'badge-amber'}" style="font-size:0.8rem; padding:3px 8px;">${this.formatValue('snr', p.advmSnr)}</span></td>
                    ` : `
                      <td style="padding:10px 14px; font-weight:700; color:#059669; font-family:monospace; font-size:0.9rem;">${this.formatValue('velocity', p.velocity)}</td>
                      ${isMultiSensor ? sensorLabels.map((_, k) => {
                        const sv = p.sensorVelocities && p.sensorVelocities[k] !== undefined ? p.sensorVelocities[k] : p.velocity;
                        return `<td style="padding:10px 10px; font-weight:600; color:#0d9488; font-family:monospace;">${this.formatValue('velocity', sv)}</td>`;
                      }).join("") : ""}
                      <td style="padding:10px 14px;"><span class="badge ${p.snr >= 70 ? 'badge-green' : 'badge-amber'}" style="font-size:0.8rem; padding:3px 8px;">${this.formatValue('snr', p.snr)}</span></td>
                      ${isMultiSensor ? sensorLabels.map((_, k) => {
                        const ssnr = p.sensorSnrs && p.sensorSnrs[k] !== undefined ? p.sensorSnrs[k] : p.snr;
                        return `<td style="padding:10px 10px;"><span class="badge ${ssnr >= 70 ? 'badge-green' : 'badge-amber'}" style="font-size:0.78rem; padding:2px 6px;">${this.formatValue('snr', ssnr)}</span></td>`;
                      }).join("") : ""}
                    `}

                    <td style="padding:10px 14px; color:#334155; font-family:monospace;">${this.formatValue('windSpeed', p.windSpeed)}</td>
                    <td style="padding:10px 14px; color:#64748b;">${this.formatValue('windDeg', p.windDeg)}°</td>
                    <td style="padding:10px 14px;"><span class="badge ${p.ac >= 209 && p.ac <= 231 ? 'badge-gray' : 'badge-amber'}" style="font-size:0.8rem; padding:3px 8px;">${this.formatValue('ac', p.ac)}V</span></td>
                    <td style="padding:10px 14px;"><span class="badge ${p.dc >= 11.8 ? 'badge-gray' : 'badge-red'}" style="font-size:0.8rem; padding:3px 8px;">${this.formatValue('dc', p.dc)}V</span></td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Render chart in next frame when canvas layout is painted
    requestAnimationFrame(() => {
      this.drawChart();
      this.attachResizeObserver();
    });
  }

  attachResizeObserver() {
    if (this.resizeObserver) {
      try { this.resizeObserver.disconnect(); } catch (e) {}
      this.resizeObserver = null;
    }
    const wrapper = document.getElementById("ts-chart-parent-wrapper");
    if (!wrapper || typeof ResizeObserver === "undefined") return;

    this.resizeObserver = new ResizeObserver(() => {
      if (this.chart) {
        try {
          this.chart.resize();
        } catch (e) {}
      }
    });
    this.resizeObserver.observe(wrapper);
  }

  switchTab(tabKey) {
    if (this.activeTab === tabKey) return;
    this.activeTab = tabKey;
    this.renderView();
  }

  setDualDeviceMode(mode) {
    this.dualDeviceMode = mode;
    this.renderView();
  }

  drawChart() {
    const canvas = document.getElementById("ts-menu-canvas");
    if (!canvas || !this.cachedData) return;

    if (typeof Chart === "undefined") {
      console.error("[TimeSeriesMenu] Chart.js is not loaded.");
      return;
    }

    // Cleanly destroy any existing chart on canvas
    try {
      const existing = Chart.getChart(canvas);
      if (existing) {
        existing.destroy();
      }
    } catch (e) {}

    if (this.chart) {
      try {
        this.chart.destroy();
      } catch (e) {}
      this.chart = null;
    }

    const conf = this.tabConfigs[this.activeTab] || this.tabConfigs.waterLevel;
    const timeLabels = this.cachedData.timeLabels || [];
    const isDual = this.cachedData.isDual || false;
    const dualData = this.cachedData.dualData || null;
    const sensorCount = this.cachedData.sensorCount || 1;
    const sensorLabels = this.cachedData.sensorLabels || [];
    const sensorSeries = this.cachedData.sensorSeries || {};

    const sensorColorPalette = [
      "#2563eb", // Blue
      "#7c3aed", // Purple
      "#d97706", // Amber
      "#0891b2", // Cyan
      "#dc2626", // Red
      "#4f46e5", // Indigo
      "#ea580c", // Orange
      "#059669", // Teal
      "#ec4899", // Pink
      "#475569"  // Slate
    ];

    const datasets = [];

    // ==========================================
    // CASE A: DUAL GAUGE STATION (Velocity or SNR)
    // ==========================================
    if (isDual && (this.activeTab === "velocity" || this.activeTab === "snr") && dualData) {
      if (this.activeTab === "velocity") {
        if (this.dualDeviceMode === "ewsv") {
          // 1. EWSV Mean Line
          datasets.push({
            label: `⚡ EWSV 단면 평균 유속`,
            data: dualData.ewsv.series.velocity,
            borderColor: "#059669",
            backgroundColor: "rgba(5, 150, 105, 0.08)",
            borderWidth: 3.5,
            pointRadius: 1,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.25,
            order: 0
          });
          // EWSV Individual Sensors
          dualData.ewsv.sensorSeries.velocity.forEach((sData, idx) => {
            const sLabel = dualData.ewsv.labels[idx] || `EWSV ${idx + 1}번 유속계`;
            const color = sensorColorPalette[idx % sensorColorPalette.length];
            datasets.push({
              label: sLabel,
              data: sData,
              borderColor: color,
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 5,
              fill: false,
              tension: 0.25,
              order: idx + 1
            });
          });
        } else if (this.dualDeviceMode === "advm") {
          // 2. ADVM Mean Line
          datasets.push({
            label: `🌊 ADVM 단면 평균 유속`,
            data: dualData.advm.series.velocity,
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            borderWidth: 3.5,
            pointRadius: 1,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.25,
            order: 0
          });
          // ADVM Individual Sensors
          dualData.advm.sensorSeries.velocity.forEach((sData, idx) => {
            const sLabel = dualData.advm.labels[idx] || `ADVM ${idx + 1}번 유속계`;
            const color = sensorColorPalette[(idx + 2) % sensorColorPalette.length];
            datasets.push({
              label: sLabel,
              data: sData,
              borderColor: color,
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 5,
              fill: false,
              tension: 0.25,
              order: idx + 1
            });
          });
        } else {
          // 3. Compare Mode: EWSV Mean vs ADVM Mean
          datasets.push({
            label: `⚡ EWSV 단면 평균 유속 (표면)`,
            data: dualData.ewsv.series.velocity,
            borderColor: "#059669",
            backgroundColor: "transparent",
            borderWidth: 3.5,
            pointRadius: 1,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.25,
            order: 0
          });
          datasets.push({
            label: `🌊 ADVM 단면 평균 유속 (수중)`,
            data: dualData.advm.series.velocity,
            borderColor: "#4f46e5",
            backgroundColor: "transparent",
            borderWidth: 3.5,
            pointRadius: 1,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.25,
            order: 1
          });
        }
      } else if (this.activeTab === "snr") {
        if (this.dualDeviceMode === "ewsv") {
          // EWSV Mean SNR
          datasets.push({
            label: `📡 EWSV 대표 SNR`,
            data: dualData.ewsv.series.snr,
            borderColor: "#7c3aed",
            backgroundColor: "rgba(124, 58, 237, 0.08)",
            borderWidth: 3.5,
            pointRadius: 1,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.25,
            order: 0
          });
          dualData.ewsv.sensorSeries.snr.forEach((sData, idx) => {
            const sLabel = dualData.ewsv.labels[idx] || `EWSV ${idx + 1}번 유속계`;
            const color = sensorColorPalette[idx % sensorColorPalette.length];
            datasets.push({
              label: `${sLabel} SNR`,
              data: sData,
              borderColor: color,
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 5,
              fill: false,
              tension: 0.25,
              order: idx + 1
            });
          });
        } else if (this.dualDeviceMode === "advm") {
          // ADVM Mean SNR
          datasets.push({
            label: `📡 ADVM 대표 SNR`,
            data: dualData.advm.series.snr,
            borderColor: "#0284c7",
            backgroundColor: "rgba(2, 132, 199, 0.08)",
            borderWidth: 3.5,
            pointRadius: 1,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.25,
            order: 0
          });
          dualData.advm.sensorSeries.snr.forEach((sData, idx) => {
            const sLabel = dualData.advm.labels[idx] || `ADVM ${idx + 1}번 유속계`;
            const color = sensorColorPalette[(idx + 2) % sensorColorPalette.length];
            datasets.push({
              label: `${sLabel} SNR`,
              data: sData,
              borderColor: color,
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 5,
              fill: false,
              tension: 0.25,
              order: idx + 1
            });
          });
        } else {
          // Compare Mode: EWSV SNR vs ADVM SNR
          datasets.push({
            label: `⚡ EWSV 대표 SNR`,
            data: dualData.ewsv.series.snr,
            borderColor: "#7c3aed",
            backgroundColor: "transparent",
            borderWidth: 3,
            pointRadius: 1,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.25,
            order: 0
          });
          datasets.push({
            label: `🌊 ADVM 대표 SNR`,
            data: dualData.advm.series.snr,
            borderColor: "#0284c7",
            backgroundColor: "transparent",
            borderWidth: 3,
            pointRadius: 1,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.25,
            order: 1
          });
        }
      }
    }
    // ==========================================
    // CASE B: SINGLE GAUGE MULTI-SENSOR VELOCITY
    // ==========================================
    else if (this.activeTab === "velocity" && sensorSeries.velocity && sensorCount > 1) {
      const dataValues = this.cachedData.series ? (this.cachedData.series.velocity || []) : [];
      datasets.push({
        label: `⚡ 전체 단면 평균 유속`,
        data: dataValues,
        borderColor: "#059669",
        backgroundColor: "rgba(5, 150, 105, 0.08)",
        borderWidth: 3.5,
        pointRadius: 1,
        pointHoverRadius: 6,
        fill: false,
        tension: 0.25,
        order: 0
      });

      sensorSeries.velocity.forEach((sData, idx) => {
        const sLabel = sensorLabels[idx] || `${idx + 1}번 유속계`;
        const color = sensorColorPalette[idx % sensorColorPalette.length];
        datasets.push({
          label: sLabel,
          data: sData,
          borderColor: color,
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: false,
          tension: 0.25,
          order: idx + 1
        });
      });
    }
    // ==========================================
    // CASE C: SINGLE GAUGE MULTI-SENSOR SNR
    // ==========================================
    else if (this.activeTab === "snr" && sensorSeries.snr && sensorCount > 1) {
      const dataValues = this.cachedData.series ? (this.cachedData.series.snr || []) : [];
      datasets.push({
        label: `📡 대표/평균 SNR`,
        data: dataValues,
        borderColor: "#7c3aed",
        backgroundColor: "rgba(124, 58, 237, 0.08)",
        borderWidth: 3.5,
        pointRadius: 1,
        pointHoverRadius: 6,
        fill: false,
        tension: 0.25,
        order: 0
      });

      sensorSeries.snr.forEach((sData, idx) => {
        const sLabel = sensorLabels[idx] ? `${sensorLabels[idx]} SNR` : `${idx + 1}번 유속계 SNR`;
        const color = sensorColorPalette[idx % sensorColorPalette.length];
        datasets.push({
          label: sLabel,
          data: sData,
          borderColor: color,
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: false,
          tension: 0.25,
          order: idx + 1
        });
      });
    }
    // ==========================================
    // CASE D: STANDARD SINGLE METRIC (waterLevel, wind, power)
    // ==========================================
    else {
      const dataValues = this.cachedData.series ? (this.cachedData.series[conf.field] || []) : [];
      datasets.push({
        label: `${conf.label}`,
        data: dataValues,
        borderColor: conf.color,
        backgroundColor: conf.bgColor,
        borderWidth: 2.5,
        pointRadius: 1,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.25
      });
    }

    if (conf.threshold) {
      const dataLen = timeLabels.length;
      datasets.push({
        label: conf.thresholdLabel,
        data: Array(dataLen).fill(conf.threshold),
        borderColor: "#ef4444",
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      });
    }

    if (conf.rangeMin !== undefined && conf.rangeMax !== undefined) {
      const dataLen = timeLabels.length;
      const formattedMin = this.formatValue(conf.field, conf.rangeMin);
      const formattedMax = this.formatValue(conf.field, conf.rangeMax);
      datasets.push({
        label: `${formattedMin}${conf.unit} (하한)`,
        data: Array(dataLen).fill(conf.rangeMin),
        borderColor: "rgba(16, 185, 129, 0.7)",
        borderWidth: 1.2,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false
      });
      datasets.push({
        label: `${formattedMax}${conf.unit} (상한)`,
        data: Array(dataLen).fill(conf.rangeMax),
        borderColor: "rgba(16, 185, 129, 0.7)",
        borderWidth: 1.2,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false
      });
    }

    if (conf.warningThreshold !== undefined) {
      const dataLen = timeLabels.length;
      datasets.push({
        label: conf.warningLabel,
        data: Array(dataLen).fill(conf.warningThreshold),
        borderColor: "#ef4444",
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
      });
    }

    try {
      const ctx = canvas.getContext("2d");
      const yScaleOpts = {
        grid: { color: "#f1f5f9" },
        ticks: {
          font: { size: 11 },
          color: "#64748b",
          callback: (val) => {
            if (typeof val === "number") {
              if (conf.field === "waterLevel" || conf.field === "velocity") {
                return val.toFixed(2) + " " + conf.unit;
              }
              if (conf.field === "windSpeed" || conf.field === "dc" || conf.field === "ac") {
                return val.toFixed(1) + " " + conf.unit;
              }
            }
            return val + " " + conf.unit;
          }
        }
      };
      if (conf.minY !== undefined) yScaleOpts.min = conf.minY;
      if (conf.maxY !== undefined) yScaleOpts.max = conf.maxY;

      this.chart = new Chart(ctx, {
        type: "line",
        data: {
          labels: timeLabels,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "index",
            intersect: false
          },
          plugins: {
            datalabels: {
              display: false
            },
            legend: {
              display: true,
              position: "top",
              labels: {
                boxWidth: 14,
                font: { size: 12, weight: "bold" },
                padding: 12,
                usePointStyle: false
              }
            },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const idx = items[0]?.dataIndex;
                  return this.cachedData.labels ? (this.cachedData.labels[idx] || "") : "";
                },
                label: (item) => {
                  const raw = item.raw;
                  let formatted = item.formattedValue;
                  if (typeof raw === "number") {
                    if (conf.field === "waterLevel" || conf.field === "velocity") {
                      formatted = raw.toFixed(2);
                    } else if (conf.field === "windSpeed" || conf.field === "dc" || conf.field === "ac") {
                      formatted = raw.toFixed(1);
                    }
                  }
                  return ` ${item.dataset.label}: ${formatted} ${conf.unit}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: "#f1f5f9" },
              ticks: {
                maxTicksLimit: 16,
                font: { size: 11 },
                color: "#64748b"
              }
            },
            y: yScaleOpts
          }
        }
      });
    } catch (chartErr) {
      console.error("[TimeSeriesMenu] Chart rendering error:", chartErr);
    }
  }

  exportCsv() {
    if (!this.cachedData || !this.cachedData.points) return;
    const st = this.findStation(this.selectedStationCode);
    const stationName = st?.name || this.selectedStationCode;
    const isDual = this.cachedData.isDual || false;
    const dualData = this.cachedData.dualData || null;
    const sensorCount = this.cachedData.sensorCount || 1;
    const sensorLabels = this.cachedData.sensorLabels || [];
    const isMultiSensor = !isDual && sensorCount > 1;

    let headers = ["관측시각", "수위(m)"];

    if (isDual) {
      headers.push("EWSV_평균유속(m/s)");
      (dualData?.ewsv?.labels || []).forEach(l => headers.push(`${l}_(m/s)`));
      headers.push("ADVM_평균유속(m/s)");
      (dualData?.advm?.labels || []).forEach(l => headers.push(`${l}_(m/s)`));
      headers.push("EWSV_SNR", "ADVM_SNR");
    } else {
      headers.push("단면평균유속(m/s)");
      if (isMultiSensor) {
        sensorLabels.forEach(l => headers.push(`${l} 유속(m/s)`));
      }
      headers.push("대표SNR");
      if (isMultiSensor) {
        sensorLabels.forEach(l => headers.push(`${l} SNR`));
      }
    }

    headers.push("풍속(m/s)", "풍향(deg)", "AC전압(V)", "DC전압(V)");

    const rows = this.cachedData.points.map(p => {
      const row = [
        p.time,
        this.formatValue('waterLevel', p.waterLevel)
      ];

      if (isDual) {
        row.push(this.formatValue('velocity', p.ewsvVelocity));
        (dualData?.ewsv?.labels || []).forEach((_, k) => {
          const sv = p.ewsvSensorVelocities && p.ewsvSensorVelocities[k] !== undefined ? p.ewsvSensorVelocities[k] : p.ewsvVelocity;
          row.push(this.formatValue('velocity', sv));
        });
        row.push(this.formatValue('velocity', p.advmVelocity));
        (dualData?.advm?.labels || []).forEach((_, k) => {
          const sv = p.advmSensorVelocities && p.advmSensorVelocities[k] !== undefined ? p.advmSensorVelocities[k] : p.advmVelocity;
          row.push(this.formatValue('velocity', sv));
        });
        row.push(this.formatValue('snr', p.ewsvSnr), this.formatValue('snr', p.advmSnr));
      } else {
        row.push(this.formatValue('velocity', p.velocity));
        if (isMultiSensor) {
          for (let k = 0; k < sensorCount; k++) {
            const sv = p.sensorVelocities && p.sensorVelocities[k] !== undefined ? p.sensorVelocities[k] : p.velocity;
            row.push(this.formatValue('velocity', sv));
          }
        }
        row.push(this.formatValue('snr', p.snr));
        if (isMultiSensor) {
          for (let k = 0; k < sensorCount; k++) {
            const ssnr = p.sensorSnrs && p.sensorSnrs[k] !== undefined ? p.sensorSnrs[k] : p.snr;
            row.push(this.formatValue('snr', ssnr));
          }
        }
      }

      row.push(
        this.formatValue('windSpeed', p.windSpeed),
        this.formatValue('windDeg', p.windDeg),
        this.formatValue('ac', p.ac),
        this.formatValue('dc', p.dc)
      );
      return row;
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `실시간관측자료_${stationName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  destroy() {
    if (this.resizeObserver) {
      try { this.resizeObserver.disconnect(); } catch (e) {}
      this.resizeObserver = null;
    }
    if (this.chart) {
      try { this.chart.destroy(); } catch (e) {}
      this.chart = null;
    }
  }
}

window.timeSeriesMenuManager = new TimeSeriesMenuManager();
