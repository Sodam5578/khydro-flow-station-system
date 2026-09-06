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

    // 8. Initialize Schedule & Monitor Managers
    try {
      if (window.scheduleManager) window.scheduleManager.init();
      if (window.monitorManager) window.monitorManager.init();
    } catch(e) {
      console.error("Failed to init schedule/monitor manager:", e);
    }

    // 9. Bind Mobile & Modal Specific Events
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
      "monitor": "전국 자동유량 실시간 관측자료 품질 모니터링",
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
    } else if (tabName === "monitor") {
      if (window.monitorManager) {
        window.monitorManager.loadData();
      }
    } else if (tabName === "logs") {
      if (window.logsManager) {
        window.logsManager.fetchLogs();
      }
    } else if (tabName === "dashboard") {
      if (window.statsManager) {
        window.statsManager.update();
      }
    } else if (tabName === "settings") {
      this.loadSmtpConfig();
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

    const monitorFilter = document.getElementById("gis-filter-monitor");
    if (monitorFilter) {
      monitorFilter.addEventListener("change", (e) => {
        window.gisManager.setFilters({ monitorStatus: e.target.value });
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

  // Smart Email Notifier Management
  async loadSmtpConfig() {
    if (!window.apiClient) return;
    try {
      const res = await window.apiClient.getNotificationConfig();
      if (res.success && res.config) {
        const c = res.config;
        const threshEl = document.getElementById("smtp-threshold");
        const hostEl = document.getElementById("smtp-host");
        const portEl = document.getElementById("smtp-port");
        const userEl = document.getElementById("smtp-user");
        const recipEl = document.getElementById("smtp-recipients");
        const badgeEl = document.getElementById("smtp-status-badge");

        if (threshEl && c.thresholdCount) threshEl.value = String(c.thresholdCount);
        if (hostEl) hostEl.value = c.host || "smtp.gmail.com";
        if (portEl) portEl.value = c.port || 587;
        if (userEl && !userEl.value) userEl.placeholder = c.user ? `현재 설정됨 (${c.user})` : "발신 계정 이메일";
        if (recipEl) recipEl.value = c.recipients || "kihs_infra@kihs.re.kr, sechan@kihs.re.kr";
        
        if (badgeEl) {
          if (c.isConfigured) {
            badgeEl.className = "badge badge-green";
            badgeEl.textContent = "✅ 실제 SMTP 발송 모드";
          } else {
            badgeEl.className = "badge badge-blue";
            badgeEl.textContent = "시뮬레이션 모드 (가상 발송)";
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load SMTP config:", e);
    }
  }

  async saveSmtpConfig() {
    if (!window.apiClient) return;
    const threshEl = document.getElementById("smtp-threshold");
    const thresholdCount = threshEl ? parseInt(threshEl.value, 10) : 3;
    const host = document.getElementById("smtp-host").value.trim();
    const port = document.getElementById("smtp-port").value.trim();
    const user = document.getElementById("smtp-user").value.trim();
    const pass = document.getElementById("smtp-pass").value.trim();
    const recipients = document.getElementById("smtp-recipients").value.trim();

    try {
      const payload = { thresholdCount, host, port, recipients, enabled: true };
      if (user) payload.user = user;
      if (pass) payload.pass = pass;

      const res = await window.apiClient.updateNotificationConfig(payload);
      if (res.success) {
        this.showToast(`알림 설정(기준: 연속 ${thresholdCount}회)이 저장되었습니다.`, "success");
        this.loadSmtpConfig();
      } else {
        alert(res.message || "설정 저장 실패");
      }
    } catch (e) {
      alert("설정 저장 중 오류가 발생했습니다.");
    }
  }

  async sendTestEmail() {
    if (!window.apiClient) return;
    const targetEmail = prompt("테스트 메일을 발송할 수신 이메일 주소를 입력하세요:", "sechan@kihs.re.kr");
    if (!targetEmail) return;

    try {
      this.showToast("테스트 메일을 전송 중입니다...", "info");
      const res = await window.apiClient.sendTestNotification(targetEmail);
      if (res.success) {
        alert(`✓ ${res.message}`);
        this.showToast("테스트 메일 전송 완료", "success");
      } else {
        alert(`⚠️ ${res.message}`);
      }
    } catch (e) {
      alert("테스트 메일 전송 실패: 서버 오류");
    }
  }

  async showNotificationLogsModal() {
    if (!window.apiClient) return;
    try {
      const res = await window.apiClient.getNotificationLogs();
      const logs = res.logs || [];
      
      let html = `<div style="max-height:400px; overflow-y:auto;"><table class="custom-table" style="font-size:0.8rem;">
        <thead><tr><th>발송시각</th><th>구분</th><th>관측소</th><th>연속결측</th><th>수신처</th><th>상태</th></tr></thead><tbody>`;
      
      if (logs.length === 0) {
        html += `<tr><td colspan="6" style="text-align:center; padding:2rem; color:#94a3b8;">아직 발송된 알림 이력이 없습니다.</td></tr>`;
      } else {
        logs.forEach(l => {
          const badge = l.level === "CRITICAL" ? `<span class="badge badge-red">경보</span>` : (l.level === "WARNING" ? `<span class="badge badge-amber">주의</span>` : `<span class="badge badge-green">복구</span>`);
          html += `<tr>
            <td>${l.timestamp.slice(0, 19).replace("T", " ")}</td>
            <td>${badge}</td>
            <td><b>${l.stationName}</b></td>
            <td>${l.count}회</td>
            <td>${l.recipients}</td>
            <td><span class="badge badge-blue">${l.mode}</span></td>
          </tr>`;
        });
      }
      html += `</tbody></table></div>`;

      // Display in a simple alert or reuse detail modal
      const modal = document.getElementById("detail-modal");
      const title = document.getElementById("detail-modal-title");
      const body = document.getElementById("detail-modal-body");
      if (modal && title && body) {
        title.innerHTML = `<span>📜 스마트 결측 알림 발송 이력 (최근 ${logs.length}건)</span>`;
        body.innerHTML = html;
        modal.classList.add("active");
      }
    } catch (e) {
      alert("발송 로그 조회 실패");
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
