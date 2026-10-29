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
    this._loadSeq = 0;

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

  isValidNum(val) {
    return val !== null && val !== undefined && val !== "" && Number.isFinite(Number(val));
  }

  /**
   * Value formatting helper adhering strictly to decimal requirements:
   * - waterLevel, velocity: 0.00 (2 decimal places)
   * - windSpeed, dc, ac: 0.0 (1 decimal place)
   * - snr, windDeg: integer (0 decimal places)
   */
  formatValue(field, val) {
    if (!this.isValidNum(val)) return "-";
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

  formatCsvValue(field, val) {
    if (!this.isValidNum(val)) return "";
    return this.formatValue(field, val);
  }

  formatWithUnit(field, val, unit) {
    if (!this.isValidNum(val)) return "-";
    return `${this.formatValue(field, val)}${unit}`;
  }

  getLatestMetric(points, field) {
    if (!Array.isArray(points) || points.length === 0) {
      return { val: null, time: null, isLatestSlot: false };
    }
    const lastIdx = points.length - 1;
    if (this.isValidNum(points[lastIdx]?.[field])) {
      return { val: points[lastIdx][field], time: points[lastIdx].time, isLatestSlot: true };
    }
    for (let i = lastIdx - 1; i >= 0; i--) {
      if (this.isValidNum(points[i]?.[field])) {
        return { val: points[i][field], time: points[i].time, isLatestSlot: false };
      }
    }
    return { val: null, time: null, isLatestSlot: false };
  }

  renderSnrBadge(val, small = false, isEwsv = false) {
    if (!this.isValidNum(val)) {
      return `<span style="color:#94a3b8; font-family:monospace;">-</span>`;
    }
    const num = Number(val);
    const cls = isEwsv
      ? (num !== 0 ? "badge-green" : "badge-amber")
      : (num >= 70 ? "badge-green" : "badge-amber");
    const style = small ? "font-size:0.78rem; padding:2px 6px;" : "font-size:0.8rem; padding:3px 8px;";
    return `<span class="badge ${cls}" style="${style}">${this.formatValue("snr", val)}</span>`;
  }

  renderAcBadge(val) {
    if (!this.isValidNum(val)) {
      return `<span style="color:#94a3b8; font-family:monospace;">-</span>`;
    }
    const num = Number(val);
    const cls = num >= 209 && num <= 231 ? "badge-gray" : "badge-amber";
    return `<span class="badge ${cls}" style="font-size:0.8rem; padding:3px 8px;">${this.formatValue("ac", val)}V</span>`;
  }

  renderDcBadge(val) {
    if (!this.isValidNum(val)) {
      return `<span style="color:#94a3b8; font-family:monospace;">-</span>`;
    }
    const num = Number(val);
    const cls = num >= 11.8 && num <= 14.8 ? "badge-gray" : "badge-red";
    return `<span class="badge ${cls}" style="font-size:0.8rem; padding:3px 8px;">${this.formatValue("dc", val)}V</span>`;
  }

  renderWindDeg(val) {
    if (!this.isValidNum(val)) {
      return `<span style="color:#94a3b8; font-family:monospace;">-</span>`;
    }
    return `${this.formatValue("windDeg", val)}°`;
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
      this.loadStationData(this.selectedStationCode, true);
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
    this.loadStationData(this.selectedStationCode, false);
  }

  async loadStationData(codeOrId, forceRefresh = false) {
    if (!codeOrId) return;
    const reqSeq = ++this._loadSeq;
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
      statusBadge.innerHTML = isOperating ? "⏳ 실시간 원시자료 조회 중..." : "⚪ 2026년 구축예정 (미수집)";
      statusBadge.style.background = isOperating ? "rgba(255, 255, 255, 0.22)" : "rgba(148, 163, 184, 0.3)";
      statusBadge.style.color = "#ffffff";
    }

    const container = document.getElementById("ts-content-container");
    if (!container) return;

    container.innerHTML = `
      <div style="text-align:center; padding:3.5rem; color:#64748b; background:#ffffff; border-radius:12px; border:1px solid #e2e8f0; margin-top:0.5rem;">
        <div style="font-size:2.2rem; margin-bottom:10px; animation:spin 1.5s infinite linear;">⏳</div>
        <div style="font-size:1.05rem; font-weight:700; color:#1e293b;">[${st?.name || code}] 현 시각 20분 전 ~ 1일 전 (24시간) 원시 관측자료를 조회 중입니다...</div>
        <div style="font-size:0.84rem; color:#64748b; margin-top:4px;">10분 주기 실제 수집 원시파일(.esv / .adv) 정밀 파싱 중 (대용량 ADVM 지점은 최초 조회 시 수 초가 소요될 수 있습니다)</div>
      </div>
    `;

    try {
      const qs = forceRefresh ? "?refresh=1" : "";
      const res = await fetch(`/api/monitor/timeseries/${encodeURIComponent(code)}${qs}`);
      const json = await res.json();

      if (reqSeq !== this._loadSeq) return;

      if (!json.success || !json.hasData || !json.points || json.points.length === 0) {
        this.cachedData = null;
        if (statusBadge) {
          const isSched = json.reason === "SCHEDULED_STATION" || !isOperating;
          statusBadge.innerHTML = isSched ? "⚪ 2026년 구축예정 (미수집)" : "🔴 최근 24시간 미수신";
          statusBadge.style.background = isSched ? "rgba(148, 163, 184, 0.3)" : "rgba(239, 68, 68, 0.35)";
        }
        const rangeInfoHtml = (json.startTime && json.endTime)
          ? `<div style="margin-top:0.75rem; font-size:0.82rem; color:#475569; font-family:monospace; background:#e2e8f0; display:inline-block; padding:4px 12px; border-radius:6px;">조회 기준 구간: ${json.startTime} ~ ${json.endTime} (현 시각 20분 전 기준)</div>`
          : "";
        container.innerHTML = `
          <div style="text-align:center; padding:3.5rem 1.5rem; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; margin-top:0.5rem;">
            <div style="font-size:3rem; margin-bottom:1rem;">📡</div>
            <h3 style="font-size:1.2rem; font-weight:700; color:#1e293b; margin-bottom:0.5rem;">실시간 관측자료 미수집 · 미수신 지점</h3>
            <p style="color:#64748b; font-size:0.92rem; line-height:1.6; max-width:620px; margin:0 auto;">
              ${json.message || `해당 관측소(<b>지점코드: ${code}</b>)는 현재 수신된 원시 관측자료가 없습니다.`}
            </p>
            ${rangeInfoHtml}
            <div style="margin-top:1.25rem;">
              <button class="btn btn-primary btn-sm" onclick="window.timeSeriesMenuManager.resetFilters()" style="padding:6px 14px;">
                🟢 실시간 수집중인 다른 지점 탐색하기
              </button>
            </div>
          </div>
        `;
        return;
      }

      if (statusBadge) {
        const rec = json.receivedCount ?? json.points.length;
        const tot = json.pointCount ?? json.points.length;
        const isFull = rec >= tot;
        statusBadge.innerHTML = isFull
          ? `🟢 실시간 수집 정상 (${rec}/${tot}건)`
          : `🟡 부분 수신 (${rec}/${tot}건 · 미수신 ${tot - rec}건)`;
        statusBadge.style.background = isFull
          ? "rgba(16, 185, 129, 0.3)"
          : "rgba(245, 158, 11, 0.35)";
      }

      // If Dual station has only ADVM active (e.g. wireless EWSV not yet transmitting), auto-focus active stream
      if (json.isDual && json.dualData) {
        const eRec = json.dualData.ewsv?.receivedCount ?? 0;
        const aRec = json.dualData.advm?.receivedCount ?? 0;
        if (this.dualDeviceMode === "ewsv" && eRec === 0 && aRec > 0) {
          this.dualDeviceMode = "advm";
        } else if (this.dualDeviceMode === "advm" && aRec === 0 && eRec > 0) {
          this.dualDeviceMode = "ewsv";
        }
      }

      this.cachedData = json;
      this.renderView();
    } catch (e) {
      if (reqSeq !== this._loadSeq) return;
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

    const points = this.cachedData.points || [];
    const lastPoint = points[points.length - 1] || {};
    const startTime = this.cachedData.startTime || points[0]?.time || "-";
    const endTime = this.cachedData.endTime || lastPoint.time || "-";
    const pointCount = this.cachedData.pointCount || points.length;
    const receivedCount = this.cachedData.receivedCount ?? points.filter(p => p.received !== false).length;
    const missingCount = Math.max(0, pointCount - receivedCount);

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

    const wlLatest = this.getLatestMetric(points, "waterLevel");
    const vLatest = this.getLatestMetric(points, "velocity");
    const ewsvVLatest = this.getLatestMetric(points, "ewsvVelocity");
    const advmVLatest = this.getLatestMetric(points, "advmVelocity");
    const snrLatest = this.getLatestMetric(points, "snr");
    const ewsvSnrLatest = this.getLatestMetric(points, "ewsvSnr");
    const advmSnrLatest = this.getLatestMetric(points, "advmSnr");
    const acLatest = this.getLatestMetric(points, "ac");
    const dcLatest = this.getLatestMetric(points, "dc");

    const currentConf = this.tabConfigs[this.activeTab] || this.tabConfigs.waterLevel;
    let activeMetric = this.getLatestMetric(points, currentConf.field);
    if (isDual && this.activeTab === "velocity") {
      if (this.dualDeviceMode === "ewsv") {
        activeMetric = ewsvVLatest;
      } else if (this.dualDeviceMode === "advm") {
        activeMetric = advmVLatest;
      } else {
        activeMetric = ewsvVLatest.val !== null ? ewsvVLatest : advmVLatest;
      }
    } else if (isDual && this.activeTab === "snr") {
      if (this.dualDeviceMode === "ewsv") {
        activeMetric = ewsvSnrLatest;
      } else if (this.dualDeviceMode === "advm") {
        activeMetric = advmSnrLatest;
      } else {
        activeMetric = ewsvSnrLatest.val !== null ? ewsvSnrLatest : advmSnrLatest;
      }
    }
    const latestFormatted = this.formatValue(currentConf.field, activeMetric.val);
    const latestTimeNote = activeMetric.time && !activeMetric.isLatestSlot
      ? ` <span style="font-size:0.76rem; color:#64748b; font-weight:600;">(${activeMetric.time.slice(5)} 수신)</span>`
      : "";

    container.innerHTML = `
      <!-- 0. Exact KST 24h Query Window & Reception Status Banner -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding:10px 14px; margin-bottom:1rem; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; font-size:0.84rem; color:#1e3a8a;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-weight:800;">🕒 조회 기준 구간 (현 시각 20분 전 ~ 1일 전):</span>
          <code style="background:#ffffff; border:1px solid #93c5fd; padding:2px 8px; border-radius:6px; font-weight:800; color:#1d4ed8; font-size:0.86rem;">${startTime} ~ ${endTime}</code>
          <span style="color:#475569; font-size:0.8rem;">(10분 주기 실제 원시자료)</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="badge ${missingCount === 0 ? 'badge-green' : 'badge-amber'}" style="font-size:0.78rem; padding:4px 10px; font-weight:700;">
            수신 ${receivedCount} / ${pointCount}건${missingCount > 0 ? ` (미수신 ${missingCount}건)` : " (100%)"}
          </span>
          ${isDual ? `<span class="badge badge-blue" style="font-size:0.76rem; padding:4px 8px;">EWSV ${dualData?.ewsv?.receivedCount ?? 0}건 · ADVM ${dualData?.advm?.receivedCount ?? 0}건</span>` : ""}
        </div>
      </div>

      <!-- 1. Top 4 KPI Metric Summary Cards -->
      <div class="kpi-grid" style="margin-bottom:1.25rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div class="kpi-card" style="border-left: 4px solid #2563eb;">
          <div class="kpi-icon blue">🌊</div>
          <div class="kpi-info">
            <div class="kpi-value">${this.formatValue('waterLevel', wlLatest.val)} <span style="font-size:1rem; font-weight:500;">${this.isValidNum(wlLatest.val) ? 'm' : ''}</span></div>
            <div class="kpi-label">현재 수위 (${wlLatest.time ? wlLatest.time.slice(11) : '미수신'})</div>
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid #059669;">
          <div class="kpi-icon green">⏩</div>
          <div class="kpi-info">
            ${isDual ? `
              <div class="kpi-value" style="font-size:1.15rem;">
                <span style="color:#059669;">⚡ ${this.formatValue('velocity', ewsvVLatest.val)}</span> 
                <span style="font-size:0.8rem; color:#64748b;">/</span> 
                <span style="color:#2563eb;">🌊 ${this.formatValue('velocity', advmVLatest.val)}</span> 
                <span style="font-size:0.85rem; font-weight:500;">m/s</span>
              </div>
              <div class="kpi-label">이중화 유속 (EWSV / ADVM)</div>
            ` : `
              <div class="kpi-value">${this.formatValue('velocity', vLatest.val)} <span style="font-size:1rem; font-weight:500;">${this.isValidNum(vLatest.val) ? 'm/s' : ''}</span></div>
              <div class="kpi-label">단면 평균 유속 (${vLatest.time ? vLatest.time.slice(11) : '미수신'})</div>
            `}
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid #7c3aed;">
          <div class="kpi-icon purple">📡</div>
          <div class="kpi-info">
            ${isDual ? `
              <div class="kpi-value" style="font-size:1.15rem;">
                <span style="color:#7c3aed;">⚡ ${this.formatValue('snr', ewsvSnrLatest.val)}</span> 
                <span style="font-size:0.8rem; color:#64748b;">/</span> 
                <span style="color:#0284c7;">🌊 ${this.formatValue('snr', advmSnrLatest.val)}</span>
              </div>
              <div class="kpi-label">이중화 SNR (EWSV / ADVM)</div>
            ` : `
              <div class="kpi-value">${this.formatValue('snr', snrLatest.val)} <span style="font-size:1rem; font-weight:500;">${this.isValidNum(snrLatest.val) ? 'Count' : ''}</span></div>
              <div class="kpi-label">SNR (기준 ≥ 70)</div>
            `}
          </div>
        </div>
        <div class="kpi-card" style="border-left: 4px solid #b45309;">
          <div class="kpi-icon amber">⚡</div>
          <div class="kpi-info">
            <div class="kpi-value" style="font-size:1.25rem;">${this.formatWithUnit('ac', acLatest.val, 'V')} <span style="font-size:0.85rem; color:#64748b;">/</span> ${this.formatWithUnit('dc', dcLatest.val, 'V')}</div>
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
              ⚡ EWSV 전자파유속계 (${dualData?.ewsv?.count || 1}대)
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
              <span class="badge badge-purple" style="margin-left:8px; font-size:0.8rem; font-weight:700;">⚡ 이중화 관측소 (EWSV ${dualData?.ewsv?.count || 1}대 + ADVM ${dualData?.advm?.count || 1}대)</span>
            ` : (isMultiSensor && (this.activeTab === "velocity" || this.activeTab === "snr") ? `
              <span class="badge badge-purple" style="margin-left:8px; font-size:0.8rem; font-weight:700;">🎯 유속계 총 ${sensorCount}대 설치 (유속계별 멀티라인)</span>
            ` : "")}
            <span style="font-size:0.82rem; color:#64748b; margin-left:10px;">💡 ${currentConf.guideText}</span>
          </div>
          <div style="font-size:0.95rem; font-weight:800; color:${currentConf.color};">
            최근 측정값: <span style="font-size:1.25rem; font-family:monospace;">${latestFormatted}</span> ${this.isValidNum(activeMetric.val) ? currentConf.unit : ""}${latestTimeNote}
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
            <span style="font-size:0.82rem; color:#64748b; margin-left:8px; font-weight:600;">(${startTime} ~ ${endTime} · 수신 ${receivedCount} / ${pointCount}건)</span>
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
              ${[...points].reverse().map((p, idx) => {
                const isEven = idx % 2 === 0;
                const isMissing = p.received === false;
                const baseBg = isMissing ? "#fff5f5" : (isEven ? "#ffffff" : "#f8fafc");
                return `
                  <tr style="background:${baseBg}; border-bottom:1px solid #e2e8f0; transition:background 0.15s ease;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='${baseBg}'">
                    <td style="padding:10px 14px; font-weight:600; color:${isMissing ? '#dc2626' : '#1e3a8a'}; font-family:monospace; font-size:0.88rem; white-space:nowrap;">
                      ${p.time}${isMissing ? ' <span class="badge badge-red" style="font-size:0.68rem; padding:1px 5px; margin-left:4px;">미수신</span>' : ''}
                    </td>
                    <td style="padding:10px 14px; font-weight:700; color:#2563eb; font-family:monospace; font-size:0.9rem;">${this.formatValue('waterLevel', p.waterLevel)}</td>
                    
                    ${isDual ? `
                      <td style="padding:10px 10px; font-weight:800; color:#059669; font-family:monospace; background:${isMissing ? '#fff5f5' : (isEven ? '#f0fdf4' : '#ecfdf5')};">${this.formatValue('velocity', p.ewsvVelocity)}</td>
                      ${(dualData?.ewsv?.labels || []).map((_, k) => {
                        const sv = Array.isArray(p.ewsvSensorVelocities) ? p.ewsvSensorVelocities[k] : null;
                        return `<td style="padding:10px 10px; font-weight:600; color:#0d9488; font-family:monospace; background:${isMissing ? '#fff5f5' : (isEven ? '#f0fdf4' : '#ecfdf5')};">${this.formatValue('velocity', sv)}</td>`;
                      }).join("")}
                      <td style="padding:10px 10px; font-weight:800; color:#2563eb; font-family:monospace; background:${isMissing ? '#fff5f5' : (isEven ? '#eff6ff' : '#ebf5ff')};">${this.formatValue('velocity', p.advmVelocity)}</td>
                      ${(dualData?.advm?.labels || []).map((_, k) => {
                        const sv = Array.isArray(p.advmSensorVelocities) ? p.advmSensorVelocities[k] : null;
                        return `<td style="padding:10px 10px; font-weight:600; color:#3b82f6; font-family:monospace; background:${isMissing ? '#fff5f5' : (isEven ? '#eff6ff' : '#ebf5ff')};">${this.formatValue('velocity', sv)}</td>`;
                      }).join("")}
                      <td style="padding:10px 10px; background:${isMissing ? '#fff5f5' : (isEven ? '#faf5ff' : '#f5f3ff')};">${this.renderSnrBadge(p.ewsvSnr, false, true)}</td>
                      <td style="padding:10px 10px; background:${isMissing ? '#fff5f5' : (isEven ? '#f0f9ff' : '#e0f2fe')};">${this.renderSnrBadge(p.advmSnr, false, false)}</td>
                    ` : `
                      <td style="padding:10px 14px; font-weight:700; color:#059669; font-family:monospace; font-size:0.9rem;">${this.formatValue('velocity', p.velocity)}</td>
                      ${isMultiSensor ? sensorLabels.map((_, k) => {
                        const sv = Array.isArray(p.sensorVelocities) ? p.sensorVelocities[k] : null;
                        return `<td style="padding:10px 10px; font-weight:600; color:#0d9488; font-family:monospace;">${this.formatValue('velocity', sv)}</td>`;
                      }).join("") : ""}
                      <td style="padding:10px 14px;">${this.renderSnrBadge(p.snr, false, this.cachedData.gaugeMode === 'EWSV')}</td>
                      ${isMultiSensor ? sensorLabels.map((_, k) => {
                        const ssnr = Array.isArray(p.sensorSnrs) ? p.sensorSnrs[k] : null;
                        return `<td style="padding:10px 10px;">${this.renderSnrBadge(ssnr, true, this.cachedData.gaugeMode === 'EWSV')}</td>`;
                      }).join("") : ""}
                    `}

                    <td style="padding:10px 14px; color:#334155; font-family:monospace;">${this.formatValue('windSpeed', p.windSpeed)}</td>
                    <td style="padding:10px 14px; color:#64748b;">${this.renderWindDeg(p.windDeg)}</td>
                    <td style="padding:10px 14px;">${this.renderAcBadge(p.ac)}</td>
                    <td style="padding:10px 14px;">${this.renderDcBadge(p.dc)}</td>
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

    // Ensure missing 10-min intervals render as honest gaps while single valid points remain visible
    datasets.forEach((ds) => {
      ds.spanGaps = false;
      if (!ds.pointRadius || ds.pointRadius < 1.2) {
        ds.pointRadius = 1.5;
      }
    });

    const showSnrThreshold = conf.threshold && !(
      this.activeTab === "snr" &&
      (this.cachedData.gaugeMode === "EWSV" || (isDual && this.dualDeviceMode === "ewsv"))
    );
    if (showSnrThreshold) {
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
                  if (raw === null || raw === undefined || Number.isNaN(raw)) {
                    return ` ${item.dataset.label}: 미수신/결측 (-)`;
                  }
                  let formatted = item.formattedValue;
                  if (typeof raw === "number") {
                    if (conf.field === "waterLevel" || conf.field === "velocity") {
                      formatted = raw.toFixed(2);
                    } else if (conf.field === "windSpeed" || conf.field === "dc" || conf.field === "ac") {
                      formatted = raw.toFixed(1);
                    } else if (conf.field === "snr" || conf.field === "windDeg") {
                      formatted = Math.round(raw).toString();
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
        this.formatCsvValue('waterLevel', p.waterLevel)
      ];

      if (isDual) {
        row.push(this.formatCsvValue('velocity', p.ewsvVelocity));
        (dualData?.ewsv?.labels || []).forEach((_, k) => {
          const sv = Array.isArray(p.ewsvSensorVelocities) ? p.ewsvSensorVelocities[k] : null;
          row.push(this.formatCsvValue('velocity', sv));
        });
        row.push(this.formatCsvValue('velocity', p.advmVelocity));
        (dualData?.advm?.labels || []).forEach((_, k) => {
          const sv = Array.isArray(p.advmSensorVelocities) ? p.advmSensorVelocities[k] : null;
          row.push(this.formatCsvValue('velocity', sv));
        });
        row.push(this.formatCsvValue('snr', p.ewsvSnr), this.formatCsvValue('snr', p.advmSnr));
      } else {
        row.push(this.formatCsvValue('velocity', p.velocity));
        if (isMultiSensor) {
          for (let k = 0; k < sensorCount; k++) {
            const sv = Array.isArray(p.sensorVelocities) ? p.sensorVelocities[k] : null;
            row.push(this.formatCsvValue('velocity', sv));
          }
        }
        row.push(this.formatCsvValue('snr', p.snr));
        if (isMultiSensor) {
          for (let k = 0; k < sensorCount; k++) {
            const ssnr = Array.isArray(p.sensorSnrs) ? p.sensorSnrs[k] : null;
            row.push(this.formatCsvValue('snr', ssnr));
          }
        }
      }

      row.push(
        this.formatCsvValue('windSpeed', p.windSpeed),
        this.formatCsvValue('windDeg', p.windDeg),
        this.formatCsvValue('ac', p.ac),
        this.formatCsvValue('dc', p.dc)
      );
      return row;
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateTag = (this.cachedData.endTime || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `실시간관측자료_${stationName}_${dateTag}.csv`);
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
