/**
 * App Controller
 * Main entry point, tab navigation, and global event bindings.
 */
class App {
  constructor() {
    this.activeTab = "dashboard";
  }

  async init() {
    // 0. Auth check
    if (window.apiClient) {
      const isAuthed = await window.apiClient.checkAuth();
      if (!isAuthed && window.location.pathname.endsWith("index.html")) return;
    }

    // 1. Bind navigation FIRST to guarantee tabs always work regardless of data state
    this.bindNavigation();

    // 2. Initialize Core Data Manager
    try {
      await window.dataManager.init();
    } catch(e) {
      console.error("Failed to init dataManager:", e);
    }

    // 3. Initialize GIS Manager
    try {
      window.gisManager.init("map");
    } catch(e) {
      console.error("Failed to init gisManager:", e);
    }

    // 4. Initialize Table Manager
    try {
      window.tableManager.init();
    } catch(e) {
      console.error("Failed to init tableManager:", e);
    }

    // 5. Initialize Stats Manager
    try {
      window.statsManager.update();
    } catch(e) {
      console.error("Failed to init statsManager:", e);
    }

    // 6. Initialize Maintenance Manager
    try {
      window.maintenanceManager.init();
    } catch(e) {
      console.error("Failed to init maintenanceManager:", e);
    }

    // 7. Initialize Calibration Manager
    try {
      window.calibrationManager.init();
    } catch(e) {
      console.error(e);
    }
    try {
      window.logsManager.init();
    } catch(e) {
      console.error("Failed to init logsManager:", e);
    }

    // 8. Initialize Schedule Manager
    try {
      if (window.scheduleManager) window.scheduleManager.init();
    } catch(e) {
      console.error("Failed to init scheduleManager:", e);
    }

    // 8. Bind Mobile & Modal Specific Events
    try {
      this.bindMobileEvents();
      this.bindGISEvents();
      this.bindSettingsEvents();
      if (window.modalManager) window.modalManager.init();
    } catch(e) {
      console.error("Failed to bind events:", e);
    }

    console.log("K-Hydro Flow Station Management System Initialized Successfully.");
  }

  bindMobileEvents() {
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");

    if (mobileMenuBtn && sidebar && backdrop) {
      mobileMenuBtn.addEventListener("click", () => {
        const isOpen = sidebar.classList.toggle("open");
        backdrop.classList.toggle("active", isOpen);
      });

      backdrop.addEventListener("click", () => {
        sidebar.classList.remove("open");
        backdrop.classList.remove("active");
      });
    }

    // GIS Mobile Filter Toggle
    const gisFilterBtn = document.getElementById("gis-mobile-filter-btn");
    const gisCloseBtn = document.getElementById("gis-mobile-close-btn");
    const gisPanel = document.getElementById("gis-floating-panel");

    if (gisFilterBtn && gisPanel) {
      gisFilterBtn.addEventListener("click", () => {
        gisPanel.classList.toggle("open");
      });
    }

    if (gisCloseBtn && gisPanel) {
      gisCloseBtn.addEventListener("click", () => {
        gisPanel.classList.remove("open");
      });
    }
  }

  bindNavigation() {
    const navItems = document.querySelectorAll(".nav-item[data-tab]");
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");

    navItems.forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = item.getAttribute("data-tab");
        if (tab) {
          this.switchTab(tab);
          // Auto close mobile drawer on tab selection
          if (window.innerWidth <= 768 && sidebar && backdrop) {
            sidebar.classList.remove("open");
            backdrop.classList.remove("active");
          }
        }
      });
    });
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // 1. Update Sidebar Nav Active States
    document.querySelectorAll(".nav-item[data-tab]").forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-tab") === tabName);
    });

    // 2. Update View Panels Active States
    document.querySelectorAll(".view-panel").forEach(panel => {
      const isTarget = panel.id === `view-${tabName}`;
      panel.classList.toggle("active", isTarget);
      panel.style.display = isTarget ? "block" : "none";
    });

    // 3. Update Header Title
    const titles = {
      "dashboard": "통합 운영 대시보드",
      "gis": "전국 GIS 관측망 현황",
      "stations": "관측시설 목록 및 상세 관리",
      "maintenance": "2026년 유지관리 과업 총괄 관제",
      "calibration": "2026년 유속계 검정 관리",
      "schedules": "팀원 업무 및 현장점검 일정 관리",
      "logs": "팀원 작업 이력 및 감사 로그",
      "settings": "데이터 백업 및 시스템 설정"
    };
    const titleEl = document.getElementById("current-page-title");
    if (titleEl) {
      titleEl.textContent = titles[tabName] || "자동유량관측시설 관리";
    }

    // 4. Tab-Specific Refresh Triggers
    if (tabName === "gis") {
      setTimeout(() => {
        if (window.gisManager && window.gisManager.map) {
          window.gisManager.map.invalidateSize();
          window.gisManager.renderMarkers();
        }
      }, 50);
    } else if (tabName === "stations") {
      if (window.tableManager) {
        window.tableManager.render();
      }
    } else if (tabName === "maintenance") {
      if (window.maintenanceManager) {
        window.maintenanceManager.renderTaskOverview();
        window.maintenanceManager.renderMaintenanceTable();
      }
    } else if (tabName === "calibration") {
      if (window.calibrationManager) {
        window.calibrationManager.renderKPIs();
        window.calibrationManager.renderTable();
      }
    } else if (tabName === "schedules") {
      if (window.scheduleManager) {
        window.scheduleManager.loadSchedules();
      }
    } else if (tabName === "logs") {
      if (window.logsManager) {
        window.logsManager.fetchLogs();
      }
    } else if (tabName === "dashboard") {
      if (window.statsManager) {
        window.statsManager.update();
      }
    }
  }

  locateOnMap(id) {
    this.switchTab("gis");
    setTimeout(() => {
      if (window.gisManager) {
        window.gisManager.focusStation(id);
      }
    }, 200);
  }

  bindGISEvents() {
    const basinCheck = document.getElementById("gis-check-basins");
    if (basinCheck) {
      basinCheck.addEventListener("change", (e) => {
        if (window.gisManager) {
          window.gisManager.toggleBasins(e.target.checked);
        }
      });
    }

    const regionFilter = document.getElementById("gis-filter-region");
    if (regionFilter) {
      regionFilter.addEventListener("change", (e) => {
        window.gisManager.setFilters({ region: e.target.value });
      });
    }

    const gaugeFilter = document.getElementById("gis-filter-gauge");
    if (gaugeFilter) {
      gaugeFilter.addEventListener("change", (e) => {
        window.gisManager.setFilters({ gaugeType: e.target.value });
      });
    }

    const yearFilter = document.getElementById("gis-filter-year");
    if (yearFilter) {
      yearFilter.addEventListener("change", (e) => {
        window.gisManager.setFilters({ installYear: e.target.value });
      });
    }

    const bindCheck = (id, filterKey) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", (e) => {
          const update = {};
          update[filterKey] = e.target.checked;
          window.gisManager.setFilters(update);
        });
      }
    };

    bindCheck("gis-check-operating", "operatingOnly");
    bindCheck("gis-check-flood", "floodOnly");
    bindCheck("gis-check-drought", "droughtOnly");
    bindCheck("gis-check-calib", "calibOnly");
    bindCheck("gis-check-solar", "solarOnly");
    bindCheck("gis-check-dual", "dualOnly");

    const gisSearch = document.getElementById("gis-search-input");
    if (gisSearch) {
      gisSearch.addEventListener("input", (e) => {
        window.gisManager.setFilters({ searchKeyword: e.target.value });
      });
    }
  }

  bindSettingsEvents() {
    const btnExportExcel = document.getElementById("btn-export-excel");
    if (btnExportExcel) {
      btnExportExcel.addEventListener("click", () => {
        window.excelManager.exportToExcel();
      });
    }

    const btnExportJson = document.getElementById("btn-export-json");
    if (btnExportJson) {
      btnExportJson.addEventListener("click", () => {
        window.excelManager.exportToJson();
      });
    }

    const excelInput = document.getElementById("excel-file-input");
    if (excelInput) {
      excelInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          window.excelManager.importExcel(e.target.files[0]);
        }
      });
    }

    const jsonInput = document.getElementById("json-file-input");
    if (jsonInput) {
      jsonInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          window.excelManager.importBackupJSON(e.target.files[0]);
        }
      });
    }
  }

  async resetAllData() {
    if (window.apiClient && window.apiClient.user?.role !== "admin") {
      alert("데이터 원본 초기화는 최고 관리자(admin) 계정만 실행할 수 있습니다.");
      return;
    }

    if (!confirm("⚠️ 정말로 모든 시설 데이터를 초기 배포 원본(223개소)으로 초기화하시겠습니까?\n모든 수정 내역이 원본 상태로 되돌아갑니다.")) {
      return;
    }

    if (window.apiClient) {
      try {
        await window.apiClient.resetStations();
      } catch(e) {
        console.error("Server reset failed:", e);
      }
    }

    window.dataManager.resetToInitial();
    this.refreshAll();
    this.showToast("초기 223개소 원본 데이터로 초기화되었습니다.", "info");
  }

  refreshAll() {
    if (window.statsManager) window.statsManager.update();
    if (window.gisManager) window.gisManager.renderMarkers();
    if (window.tableManager) window.tableManager.render();
    if (window.maintenanceManager) {
      window.maintenanceManager.renderTaskOverview();
      window.maintenanceManager.renderMaintenanceTable();
    }
    if (window.calibrationManager) {
      window.calibrationManager.renderKPIs();
      window.calibrationManager.renderTable();
    }
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${type === "success" ? "✓" : (type === "error" ? "⚠️" : "ℹ️")}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

window.app = new App();

// Boot on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.app.init();
});
