/**
 * CalibrationManager
 * Dedicated controller for 2026 Flowmeter Accuracy Inspection & Periodic Calibration (30 Stations).
 */
class CalibrationManager {
  constructor() {
    this.selectedRegion = "all";
    this.selectedStatus = "all"; // all, pending, ongoing, completed
    this.searchTerm = "";
  }

  init() {
    this.bindEvents();
    this.renderKPIs();
    this.renderTable();
  }

  bindEvents() {
    const searchInput = document.getElementById("calib-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        this.renderTable();
      });
    }

    const regionSelect = document.getElementById("calib-filter-region");
    if (regionSelect) {
      regionSelect.addEventListener("change", (e) => {
        this.selectedRegion = e.target.value;
        this.renderTable();
      });
    }

    const statusSelect = document.getElementById("calib-filter-status");
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => {
        this.selectedStatus = e.target.value;
        this.renderTable();
      });
    }
  }

  getCalibStations() {
    const all = window.dataManager.getAll();
    return all.filter(s => s.calib2026);
  }

  renderKPIs() {
    const calibStations = this.getCalibStations();
    const totalCount = calibStations.length;

    let totalGauges = 0;
    let completedCount = 0;

    calibStations.forEach(st => {
      const gCount = parseInt(st.calibCount2026, 10) || 1;
      totalGauges += gCount;
      if (st.calibrationStatus === "completed") {
        completedCount++;
      }
    });

    const progPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const totalEl = document.getElementById("kpi-calib-total-stations");
    if (totalEl) totalEl.textContent = `${totalCount}개소`;

    const gaugesEl = document.getElementById("kpi-calib-total-gauges");
    if (gaugesEl) gaugesEl.textContent = `${totalGauges}대`;

    const progEl = document.getElementById("kpi-calib-progress");
    if (progEl) progEl.textContent = `${progPct}% (${completedCount}/${totalCount}개소)`;
  }

  updateStatus(stationId, newStatus, date = "", certNo = "") {
    const st = window.dataManager.getById(stationId);
    if (!st) return;

    st.calibrationStatus = newStatus;
    if (date) st.calibrationDate = date;
    if (certNo) st.calibrationCertNo = certNo;

    window.dataManager.updateCalibration(stationId, newStatus, date, certNo);
    this.renderKPIs();
    this.renderTable();
    window.app.showToast(`[${st.name}] 유속계 정도검정 상태가 변경되었습니다.`, "success");
  }

  renderTable() {
    const calibStations = this.getCalibStations();
    const tbody = document.getElementById("calib-table-body");
    const countEl = document.getElementById("calib-table-count");

    if (!tbody) return;

    let filtered = [...calibStations];

    // 1. Region Filter
    if (this.selectedRegion !== "all") {
      filtered = filtered.filter(s => s.region && s.region.includes(this.selectedRegion));
    }

    // 2. Status Filter
    if (this.selectedStatus !== "all") {
      filtered = filtered.filter(s => {
        const curStatus = s.calibrationStatus || "pending";
        return curStatus === this.selectedStatus;
      });
    }

    // 3. Search Filter
    if (this.searchTerm) {
      filtered = filtered.filter(s => {
        const name = (s.name || "").toLowerCase();
        const river = (s.river || "").toLowerCase();
        const addr = (s.address || "").toLowerCase();
        const code = String(s.code || "").toLowerCase();
        return name.includes(this.searchTerm) || river.includes(this.searchTerm) || addr.includes(this.searchTerm) || code.includes(this.searchTerm);
      });
    }

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2.5rem; color:#94a3b8;">검색 및 필터 조건에 해당하는 유속계 검정 대상 지점이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(st => {
      const isDual = st.isDualGauge || st.gaugeCategory === "DUAL";
      const status = st.calibrationStatus || "pending";
      const calibDate = st.calibrationDate || "";
      const certNo = st.calibrationCertNo || "";
      const gaugeCount = st.calibCount2026 || "1";

      const regionBadgeClass = st.region?.includes("한강") ? "badge-blue" :
                              (st.region?.includes("낙동강") ? "badge-amber" :
                              (st.region?.includes("금강") ? "badge-green" : "badge-purple"));

      let statusBadge = `<span class="badge badge-amber">⏳ 검정 대기</span>`;
      if (status === "ongoing") statusBadge = `<span class="badge badge-cyan">🧪 시험·검정중</span>`;
      if (status === "completed") statusBadge = `<span class="badge badge-green">✅ 검정 완료</span>`;

      return `
        <tr style="${status === "completed" ? "background-color:#f0fdf4;" : ""}">
          <td><b>${st.seq || "-"}</b></td>
          <td><span class="badge ${regionBadgeClass}">${st.region || "-"}</span></td>
          <td><b>${st.river || "-"}</b></td>
          <td>
            <div style="font-weight:700; color:#1e40af;">
              ${st.name || "-"}
              ${isDual ? '<span title="EWSV+ADVM 이중화 지점">⚡</span>' : ""}
            </div>
            <div style="font-size:0.75rem; color:#64748b;">코드: ${st.code || "-"}</div>
          </td>
          <td>
            <b>${st.gaugeType || "-"}</b>
            <div style="font-size:0.75rem; color:#0284c7;">검정대상: <b>${gaugeCount}대</b></div>
          </td>
          <td>${statusBadge}</td>
          <td>
            <input type="date" class="form-input" style="padding:4px 6px; font-size:0.8rem; width:130px;" 
                   value="${calibDate}" 
                   onchange="window.calibrationManager.updateStatus(${st.id}, 0, this.value, )">
          </td>
          <td>
            <select class="filter-select" style="padding:4px 8px; font-size:0.8rem; font-weight:600;" 
                    onchange="window.calibrationManager.updateStatus(${st.id}, this.value, , )">
              <option value="pending" ${status === "pending" ? "selected" : ""}>⏳ 검정 대기</option>
              <option value="ongoing" ${status === "ongoing" ? "selected" : ""}>🧪 시험·검정중</option>
              <option value="completed" ${status === "completed" ? "selected" : ""}>✅ 검정 완료</option>
            </select>
          </td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="window.modalManager.openDetail(${st.id})">상세제원</button>
          </td>
        </tr>
      `;
    }).join("");
  }
}

window.calibrationManager = new CalibrationManager();
