/**
 * TableManager
 * Handles Station List table view, searching, multi-criteria filtering (Region, Gauge, Operating, Install Year), sorting, pagination.
 */
class TableManager {
  constructor() {
    this.currentPage = 1;
    this.pageSize = 25;
    this.sortField = "seq";
    this.sortAsc = true;
    this.searchTerm = "";
    this.filters = {
      region: "all",
      gaugeType: "all",
      operating: "all",
      installYear: "all",
      floodAlert: "all",
      droughtAlert: "all",
      calib2026: "all",
      solarInstall: "all"
    };
    this.filteredData = [];
  }

  init() {
    this.bindEvents();
    this.render();
  }

  populateYearFilter() {
    const yearSelect = document.getElementById("table-filter-year");
    if (!yearSelect) return;

    const allStations = window.dataManager.getAll();
    const yearsSet = new Set();
    allStations.forEach(st => {
      if (st.installYear) {
        yearsSet.add(String(st.installYear).trim());
      }
    });

    const sortedYears = Array.from(yearsSet).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    const currentVal = this.filters.installYear;

    let optionsHtml = '<option value="all">전체 설치년도</option>';
    sortedYears.forEach(y => {
      optionsHtml += `<option value="${y}" ${currentVal === y ? "selected" : ""}>${y}년 설치</option>`;
    });

    yearSelect.innerHTML = optionsHtml;
  }

  bindEvents() {
    const searchInput = document.getElementById("table-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchTerm = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    const regionSelect = document.getElementById("table-filter-region");
    if (regionSelect) {
      regionSelect.addEventListener("change", (e) => {
        this.filters.region = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    const gaugeSelect = document.getElementById("table-filter-gauge");
    if (gaugeSelect) {
      gaugeSelect.addEventListener("change", (e) => {
        this.filters.gaugeType = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    const operatingSelect = document.getElementById("table-filter-operating");
    if (operatingSelect) {
      operatingSelect.addEventListener("change", (e) => {
        this.filters.operating = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    const yearSelect = document.getElementById("table-filter-year");
    if (yearSelect) {
      yearSelect.addEventListener("change", (e) => {
        this.filters.installYear = e.target.value;
        this.currentPage = 1;
        this.render();
      });
    }

    const pageSizeSelect = document.getElementById("table-page-size");
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener("change", (e) => {
        this.pageSize = e.target.value === "all" ? 999999 : parseInt(e.target.value, 10);
        this.currentPage = 1;
        this.render();
      });
    }
  }

  applyFilters() {
    const allStations = window.dataManager.getAll();
    
    this.filteredData = allStations.filter(st => {
      // Keyword search
      if (this.searchTerm) {
        const kw = this.searchTerm.toLowerCase().trim();
        const match = (st.name && st.name.toLowerCase().includes(kw)) ||
                      (st.river && st.river.toLowerCase().includes(kw)) ||
                      (st.region && st.region.toLowerCase().includes(kw)) ||
                      (st.address && st.address.toLowerCase().includes(kw)) ||
                      (st.code && String(st.code).includes(kw)) ||
                      (st.installYear && String(st.installYear).includes(kw)) ||
                      (st.memo && st.memo.toLowerCase().includes(kw));
        if (!match) return false;
      }

      // Region
      if (this.filters.region !== "all" && !st.region.includes(this.filters.region)) {
        return false;
      }

      // Gauge Type
      if (this.filters.gaugeType !== "all") {
        if (this.filters.gaugeType === "DUAL" && !st.isDualGauge && st.gaugeCategory !== "DUAL") return false;
        if (this.filters.gaugeType === "EWSV" && (st.isDualGauge || !st.gaugeType?.includes("EWSV"))) return false;
        if (this.filters.gaugeType === "ADVM" && (st.isDualGauge || !st.gaugeType?.includes("ADVM"))) return false;
      }

      // Operating
      if (this.filters.operating === "operating" && !st.isOperating2026) return false;
      if (this.filters.operating === "non-operating" && st.isOperating2026) return false;

      // Install Year Filter
      if (this.filters.installYear !== "all") {
        if (String(st.installYear).trim() !== this.filters.installYear) return false;
      }

      // Flood Alert
      if (this.filters.floodAlert === "yes" && !st.floodAlert) return false;

      // Drought Alert
      if (this.filters.droughtAlert === "yes" && !st.droughtAlert) return false;

      // Calibration
      if (this.filters.calib2026 === "yes" && !st.calib2026) return false;

      // Solar
      if (this.filters.solarInstall === "yes" && !st.solarInstall) return false;

      return true;
    });

    // Sort
    this.filteredData.sort((a, b) => {
      let valA = a[this.sortField];
      let valB = b[this.sortField];

      if (valA === undefined || valA === null) valA = "";
      if (valB === undefined || valB === null) valB = "";

      if (typeof valA === "number" && typeof valB === "number") {
        return this.sortAsc ? valA - valB : valB - valA;
      }

      valA = String(valA);
      valB = String(valB);
      return this.sortAsc ? valA.localeCompare(valB, "ko", { numeric: true }) : valB.localeCompare(valA, "ko", { numeric: true });
    });
  }

  setSort(field) {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      this.sortAsc = true;
    }
    this.render();
  }

  render() {
    this.populateYearFilter();
    this.applyFilters();

    const totalCount = this.filteredData.length;
    const totalPages = Math.ceil(totalCount / this.pageSize) || 1;
    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIdx = (this.currentPage - 1) * this.pageSize;
    const pageItems = this.filteredData.slice(startIdx, startIdx + this.pageSize);

    const tbody = document.getElementById("stations-table-body");
    if (!tbody) return;

    if (pageItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding: 2.5rem; color: #94a3b8;">조건에 해당하는 관측시설이 없습니다.</td></tr>`;
    } else {
      tbody.innerHTML = pageItems.map((st, idx) => {
        const rowNum = startIdx + idx + 1;
        const isDual = st.isDualGauge || st.gaugeCategory === "DUAL";
        const regionBadgeClass = st.region?.includes("한강") ? "badge-blue" :
                                (st.region?.includes("낙동강") ? "badge-amber" :
                                (st.region?.includes("금강") ? "badge-green" : "badge-purple"));
        
        const operatingBadge = st.isOperating2026 
          ? `<span class="badge badge-green">운영중</span>` 
          : `<span class="badge badge-gray">미운영</span>`;

        let gaugeBadge = `<span class="badge badge-gray">${st.gaugeType || "-"}</span>`;
        if (isDual) {
          gaugeBadge = `<span class="badge badge-purple" style="font-weight:700;">⚡ 이중화 (${st.gaugeType})</span>`;
        } else if (st.gaugeType?.includes("EWSV")) {
          gaugeBadge = `<span class="badge badge-blue">EWSV (전자파)</span>`;
        } else if (st.gaugeType?.includes("ADVM")) {
          gaugeBadge = `<span class="badge badge-cyan">ADVM (초음파)</span>`;
        }

        const floodBadge = st.floodAlert ? `<span class="badge badge-red">홍수특보</span>` : `-`;
        const droughtBadge = st.droughtAlert ? `<span class="badge badge-amber">갈수예보</span>` : `-`;
        const calibBadge = st.calib2026 ? `<span class="badge badge-cyan">검정(${st.calibCount2026||1}대)</span>` : `-`;
        const yearText = st.installYear ? `<b>${st.installYear}년</b>` : `<span style="color:#94a3b8;">-</span>`;

        return `
          <tr onclick="window.modalManager.openDetail(${st.id})" style="${isDual ? "background-color: #faf5ff;" : ""}">
            <td><b>${rowNum}</b></td>
            <td><span class="badge ${regionBadgeClass}">${st.region || "-"}</span></td>
            <td><b>${st.river || "-"}</b></td>
            <td>
              <div style="display:flex; align-items:center; gap:0.35rem;">
                <span style="font-weight: 700; color: #1e40af;">${st.name || "-"}</span>
                ${isDual ? '<span title="EWSV+ADVM 이중화 지점">⚡</span>' : ""}
              </div>
            </td>
            <td><code style="font-size:0.75rem; background:#f1f5f9; padding:2px 4px; border-radius:4px;">${st.code || "-"}</code></td>
            <td style="max-width: 170px; overflow: hidden; text-overflow: ellipsis;" title="${st.address || ""}">${st.address || "-"}</td>
            <td>${yearText}</td>
            <td>${gaugeBadge}</td>
            <td>${operatingBadge}</td>
            <td>${floodBadge}</td>
            <td>${droughtBadge}</td>
            <td>${calibBadge}</td>
            <td>
              <div style="display:flex; gap:0.25rem;" onclick="event.stopPropagation();">
                <button class="btn btn-outline btn-sm" onclick="window.modalManager.openEdit(${st.id})" title="수정">✏️</button>
                <button class="btn btn-outline btn-sm" onclick="window.app.locateOnMap(${st.id})" title="지도에서 위치 보기">🗺️</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    // Update Pagination UI
    const totalCountEl = document.getElementById("table-total-count");
    if (totalCountEl) totalCountEl.textContent = totalCount;

    const pageInfoEl = document.getElementById("table-page-info");
    if (pageInfoEl) {
      const currentStart = totalCount > 0 ? startIdx + 1 : 0;
      const currentEnd = Math.min(startIdx + this.pageSize, totalCount);
      pageInfoEl.textContent = `${currentStart}-${currentEnd} / 총 ${totalCount}개 지점 (페이지 ${this.currentPage}/${totalPages})`;
    }

    const prevBtn = document.getElementById("btn-prev-page");
    const nextBtn = document.getElementById("btn-next-page");
    if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages;
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.render();
    }
  }

  nextPage() {
    const totalPages = Math.ceil(this.filteredData.length / this.pageSize) || 1;
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.render();
    }
  }
}

window.tableManager = new TableManager();
