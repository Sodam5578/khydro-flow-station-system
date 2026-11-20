/**
 * App Controller
 * Main entry point, tab navigation, and global event bindings.
 */
class App {
  constructor() {
    this.activeTab = "dashboard";
    this.emailAlertEnabled = true;
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

    // 6. Initialize Maintenance Manager & Maintenance History Manager
    try {
      window.maintenanceManager.init();
      if (window.maintenanceHistoryManager) window.maintenanceHistoryManager.init();
    } catch(e) {
      console.error("Failed to init maintenanceManager:", e);
    }

    // 7. Initialize Calibration & Equipment Manager
    try {
      if (window.calibrationManager) window.calibrationManager.init();
      if (window.equipmentManager) window.equipmentManager.init();
    } catch(e) {
      console.error(e);
    }
    try {
      window.logsManager.init();
    } catch(e) {
      console.error("Failed to init logsManager:", e);
    }

    // 8. Initialize Schedule, Monitor & TimeSeries Managers
    try {
      if (window.scheduleManager) window.scheduleManager.init();
      if (window.monitorManager) window.monitorManager.init();
      if (window.timeSeriesMenuManager) window.timeSeriesMenuManager.init();
    } catch(e) {
      console.error("Failed to init schedule/monitor/timeseries manager:", e);
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

  switchView(tabName) {
    return this.switchTab(tabName);
  }

  switchTab(tabName) {
    this.activeTab = tabName;

    // 1. Update Sidebar Nav Active States
    document.querySelectorAll(".nav-item[data-tab]").forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-tab") === tabName);
    });

    // 2. Update View Panels Active States ('error-ledger' shares #view-monitor panel)
    const panelKey = tabName === "error-ledger" ? "monitor" : tabName;
    document.querySelectorAll(".view-panel").forEach(panel => {
      const isTarget = panel.id === `view-${panelKey}`;
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
      "equipment": "전국 관측시설 장비 및 물품 통합 관리",
      "schedules": "팀원 업무 및 현장점검 일정 관리",
      "monitor": "전국 자동유량 실시간 관측자료 품질 모니터링",
      "error-ledger": "전국 자동유량 모니터링 조치·오류관리대장 (전체 이력)",
      "timeseries": "실시간 관측자료 시계열 분석",
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
      if (window.maintenanceHistoryManager && window.maintenanceHistoryManager.activeTab === "history") {
        window.maintenanceHistoryManager.loadGlobalHistory();
      }
    } else if (tabName === "calibration") {
      if (window.calibrationManager) {
        window.calibrationManager.renderKPIs();
        window.calibrationManager.renderTable();
      }
    } else if (tabName === "equipment") {
      if (window.equipmentManager) {
        window.equipmentManager.onTabActivated();
      }
    } else if (tabName === "schedules") {
      if (window.scheduleManager) {
        window.scheduleManager.loadSchedules();
      }
    } else if (tabName === "monitor") {
      if (window.errorLedgerManager) {
        window.errorLedgerManager.switchMonitorSubTab("live");
      }
      if (window.monitorManager) {
        window.monitorManager.loadData();
      }
    } else if (tabName === "error-ledger") {
      if (window.errorLedgerManager) {
        window.errorLedgerManager.switchMonitorSubTab("ledger");
      }
    } else if (tabName === "timeseries") {
      if (window.timeSeriesMenuManager) {
        window.timeSeriesMenuManager.onTabVisible();
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
    bindCheck("gis-check-wireless", "wirelessOnly");

    const gisSearch = document.getElementById("gis-search-input");
    if (gisSearch) {
      let searchDebounceTimer = null;
      gisSearch.addEventListener("input", (e) => {
        const val = e.target.value;
        clearTimeout(searchDebounceTimer);
        if (!val) {
          window.gisManager.setFilters({ searchKeyword: "" });
        } else {
          searchDebounceTimer = setTimeout(() => {
            window.gisManager.setFilters({ searchKeyword: val });
          }, 150);
        }
      });
      gisSearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          clearTimeout(searchDebounceTimer);
          window.gisManager.setFilters({ searchKeyword: e.target.value });
        }
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

  resetAllData() {
    if (window.apiClient && window.apiClient.user?.role !== "admin") {
      alert("데이터 원본 초기화는 최고 관리자(admin) 계정만 실행할 수 있습니다.");
      return;
    }
    this.openResetPasswordModal();
  }

  openResetPasswordModal() {
    const modal = document.getElementById("reset-password-modal");
    const input = document.getElementById("reset-admin-password-input");
    const errEl = document.getElementById("reset-password-error");
    if (modal) {
      if (input) input.value = "";
      if (errEl) {
        errEl.textContent = "";
        errEl.style.display = "none";
      }
      modal.classList.add("active");
      setTimeout(() => { if (input) input.focus(); }, 100);
    }
  }

  closeResetPasswordModal() {
    const modal = document.getElementById("reset-password-modal");
    if (modal) modal.classList.remove("active");
  }

  async confirmResetWithPassword(e) {
    if (e) e.preventDefault();
    const input = document.getElementById("reset-admin-password-input");
    const errEl = document.getElementById("reset-password-error");
    const submitBtn = document.getElementById("btn-submit-reset");
    const password = (input?.value || "").trim();

    if (!password) {
      if (errEl) {
        errEl.textContent = "관리자 비밀번호를 입력해주세요.";
        errEl.style.display = "block";
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>⏳</span> <span>초기화 진행중...</span>`;
    }

    try {
      if (window.apiClient) {
        const res = await window.apiClient.resetStations(password);
        if (!res || !res.success) {
          if (errEl) {
            errEl.textContent = res.message || "비밀번호가 일치하지 않습니다. 다시 확인해주세요.";
            errEl.style.display = "block";
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>🔄</span> <span>비밀번호 인증 후 초기화 실행</span>`;
          }
          return;
        }
      }

      window.dataManager.resetToInitial();
      this.closeResetPasswordModal();
      this.refreshAll();
      if (window.logsManager) await window.logsManager.fetchLogs();
      this.showToast("초기 223개소 원본 데이터로 성공적으로 초기화되었습니다.", "success");
    } catch (err) {
      console.error("Factory reset failed:", err);
      if (errEl) {
        errEl.textContent = "초기화 처리 중 오류가 발생했습니다: " + err.message;
        errEl.style.display = "block";
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>🔄</span> <span>비밀번호 인증 후 초기화 실행</span>`;
      }
    }
  }

  refreshAll() {
    if (window.statsManager) window.statsManager.update();
    if (window.gisManager) window.gisManager.renderMarkers();
    if (window.tableManager) window.tableManager.render();
    if (window.maintenanceManager) {
      window.maintenanceManager.renderTaskOverview();
      window.maintenanceManager.renderMaintenanceTable();
    }
    if (window.maintenanceHistoryManager && window.maintenanceHistoryManager.activeTab === "history") {
      window.maintenanceHistoryManager.loadGlobalHistory();
    }
    if (window.calibrationManager) {
      window.calibrationManager.renderKPIs();
      window.calibrationManager.renderTable();
    }
  }

  // Smart Email Notifier Management
  toggleEmailEngineUI() {
    const isHttp = document.getElementById("engine-type-http")?.checked;
    const httpBox = document.getElementById("box-email-http");
    const smtpBox = document.getElementById("box-email-smtp");
    if (httpBox) httpBox.style.display = isHttp ? "block" : "none";
    if (smtpBox) smtpBox.style.display = isHttp ? "none" : "block";
  }

  setEmailActiveState(isActive, saveImmediately = false) {
    this.emailAlertEnabled = !!isActive;

    const boxEl = document.getElementById("email-master-switch-box");
    const iconEl = document.getElementById("email-switch-icon");
    const badgeEl = document.getElementById("email-switch-state-badge");
    const descEl = document.getElementById("email-switch-desc");
    const btnOn = document.getElementById("btn-email-status-on");
    const btnOff = document.getElementById("btn-email-status-off");
    const recipStatusEl = document.getElementById("recipients-active-status");
    const mainBadgeEl = document.getElementById("smtp-status-badge");

    if (boxEl) {
      boxEl.style.background = this.emailAlertEnabled ? "#f0fdf4" : "#fef2f2";
      boxEl.style.borderColor = this.emailAlertEnabled ? "#bbf7d0" : "#fecaca";
    }

    if (iconEl) {
      iconEl.textContent = this.emailAlertEnabled ? "🔔" : "🔕";
    }

    if (badgeEl) {
      badgeEl.className = this.emailAlertEnabled ? "badge badge-green" : "badge";
      if (!this.emailAlertEnabled) {
        badgeEl.style.background = "#fee2e2";
        badgeEl.style.color = "#b91c1c";
      } else {
        badgeEl.style.background = "";
        badgeEl.style.color = "";
      }
      badgeEl.textContent = this.emailAlertEnabled ? "🟢 발송 활성화 (ON)" : "🔴 발송 일시중지 (OFF)";
    }

    if (descEl) {
      descEl.textContent = this.emailAlertEnabled 
        ? "관측소 결측 발생 시 담당자 수신 이메일로 알림을 자동 전송합니다." 
        : "⚠️ 알림 발송이 일시 중지되어 있어 결측이 발생해도 담당자에게 메일이 전송되지 않습니다.";
    }

    if (btnOn) {
      if (this.emailAlertEnabled) {
        btnOn.style.background = "#16a34a";
        btnOn.style.borderColor = "#16a34a";
        btnOn.style.color = "#ffffff";
        btnOn.style.boxShadow = "0 2px 4px rgba(22,163,74,0.3)";
      } else {
        btnOn.style.background = "#ffffff";
        btnOn.style.borderColor = "#cbd5e1";
        btnOn.style.color = "#64748b";
        btnOn.style.boxShadow = "none";
      }
    }

    if (btnOff) {
      if (!this.emailAlertEnabled) {
        btnOff.style.background = "#dc2626";
        btnOff.style.borderColor = "#dc2626";
        btnOff.style.color = "#ffffff";
        btnOff.style.boxShadow = "0 2px 4px rgba(220,38,38,0.3)";
      } else {
        btnOff.style.background = "#ffffff";
        btnOff.style.borderColor = "#cbd5e1";
        btnOff.style.color = "#64748b";
        btnOff.style.boxShadow = "none";
      }
    }

    if (recipStatusEl) {
      recipStatusEl.innerHTML = this.emailAlertEnabled
        ? `<span style="color:#16a34a; font-weight:700;">● 정상 수신 가동 중</span>`
        : `<span style="color:#dc2626; font-weight:700;">● 발송 일시중지됨 (메일 미발송)</span>`;
    }

    if (mainBadgeEl && !this.emailAlertEnabled) {
      mainBadgeEl.className = "badge";
      mainBadgeEl.style.background = "#fee2e2";
      mainBadgeEl.style.color = "#b91c1c";
      mainBadgeEl.textContent = "⏸️ 이메일 알림 일시중지 (OFF)";
    }

    if (saveImmediately) {
      this.saveSmtpConfig(true);
    }
  }

  async loadSmtpConfig() {
    if (!window.apiClient) return;
    try {
      const res = await window.apiClient.getNotificationConfig();
      const isAdmin = window.apiClient.user?.role === "admin";

      const threshEl = document.getElementById("smtp-threshold");
      const reportModeEl = document.getElementById("email-report-mode");
      const minHoursEl = document.getElementById("email-min-hours");
      const hostEl = document.getElementById("smtp-host");
      const portEl = document.getElementById("smtp-port");
      const userEl = document.getElementById("smtp-user");
      const passEl = document.getElementById("smtp-pass");
      const recipEl = document.getElementById("smtp-recipients");
      const apiKeyEl = document.getElementById("email-api-key");
      const apiSenderEl = document.getElementById("email-api-sender");
      const providerEl = document.getElementById("email-api-provider");
      const badgeEl = document.getElementById("smtp-status-badge");
      const noticeEl = document.getElementById("smtp-member-readonly-notice");
      const saveBtn = document.getElementById("smtp-btn-save");
      const testBtn = document.getElementById("smtp-btn-test");
      const testDigestBtn = document.getElementById("smtp-btn-test-digest");
      const engineHttpRadio = document.getElementById("engine-type-http");
      const engineSmtpRadio = document.getElementById("engine-type-smtp");
      const btnOn = document.getElementById("btn-email-status-on");
      const btnOff = document.getElementById("btn-email-status-off");
      const ruleCheckboxes = document.querySelectorAll(".email-rule-checkbox");

      // UI Admin Enforcement
      if (noticeEl) noticeEl.style.display = isAdmin ? "none" : "block";
      if (saveBtn) saveBtn.style.display = isAdmin ? "inline-flex" : "none";
      if (testBtn) testBtn.style.display = isAdmin ? "inline-flex" : "none";
      if (testDigestBtn) testDigestBtn.style.display = isAdmin ? "inline-flex" : "none";
      if (btnOn) btnOn.disabled = !isAdmin;
      if (btnOff) btnOff.disabled = !isAdmin;

      [threshEl, reportModeEl, minHoursEl, hostEl, portEl, userEl, passEl, recipEl, apiKeyEl, apiSenderEl, providerEl, engineHttpRadio, engineSmtpRadio].forEach(el => {
        if (el) el.disabled = !isAdmin;
      });
      ruleCheckboxes.forEach(cb => { cb.disabled = !isAdmin; });

      if (res.success && res.config) {
        const c = res.config;
        if (threshEl && c.thresholdCount) threshEl.value = String(c.thresholdCount);
        if (reportModeEl && c.reportMode) reportModeEl.value = c.reportMode;
        if (minHoursEl && c.minContinuousHours) minHoursEl.value = String(c.minContinuousHours);
        if (hostEl) hostEl.value = c.host || "smtp.naver.com";
        if (portEl) portEl.value = c.port || 465;
        if (userEl) userEl.value = c.user || "";
        if (passEl) passEl.value = c.pass || "";
        if (recipEl) recipEl.value = c.recipients || "";
        const recipStatusEl = document.getElementById("recipients-active-status");
        if (recipStatusEl) {
          const recipCount = (c.recipients || "").split(",").map(r => r.trim()).filter(Boolean).length;
          if (recipCount > 0) {
            recipStatusEl.textContent = `● 정상 수신 가동 중 (${recipCount}명 등록)`;
            recipStatusEl.style.color = "#16a34a";
          } else {
            recipStatusEl.textContent = "⚠️ 수신 대상자 미설정 (이메일을 등록하세요)";
            recipStatusEl.style.color = "#dc2626";
          }
        }
        if (apiKeyEl) apiKeyEl.value = c.rawApiKey || "";
        if (apiSenderEl) apiSenderEl.value = c.apiSender || "seyoo123456789@gmail.com";
        if (providerEl && c.provider && c.provider !== "AUTO") providerEl.value = c.provider;

        // Populate rule checkboxes
        const selectedRules = Array.isArray(c.selectedRules) && c.selectedRules.length > 0 
          ? c.selectedRules 
          : ["DATA_MISSING", "BATTERY_VOLTAGE"];
        ruleCheckboxes.forEach(cb => {
          cb.checked = selectedRules.includes(cb.value);
        });

        // Toggle UI mode based on provider
        if (c.effectiveProvider === "SMTP" && !c.rawApiKey) {
          if (engineSmtpRadio) engineSmtpRadio.checked = true;
        } else {
          if (engineHttpRadio) engineHttpRadio.checked = true;
        }
        this.toggleEmailEngineUI();
        
        // Sync Enabled State
        const isEnabled = c.enabled !== false;
        this.setEmailActiveState(isEnabled, false);

        if (badgeEl && isEnabled) {
          badgeEl.style.background = "";
          badgeEl.style.color = "";
          if (c.effectiveProvider === "RESEND") {
            badgeEl.className = "badge badge-green";
            badgeEl.textContent = "✅ Resend HTTP API 발송 모드";
          } else if (c.effectiveProvider === "BREVO") {
            badgeEl.className = "badge badge-green";
            badgeEl.textContent = "✅ Brevo HTTP API 발송 모드";
          } else if (c.effectiveProvider === "SMTP") {
            badgeEl.className = "badge badge-green";
            badgeEl.textContent = "✅ 일반 SMTP 발송 모드";
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

  async saveSmtpConfig(fromToggle = false) {
    if (!window.apiClient) return;
    const threshEl = document.getElementById("smtp-threshold");
    const thresholdCount = threshEl ? parseInt(threshEl.value, 10) : 6;
    const reportMode = document.getElementById("email-report-mode")?.value || "HOURLY_DIGEST";
    const minContinuousHours = parseInt(document.getElementById("email-min-hours")?.value, 10) || 1;
    const isHttp = document.getElementById("engine-type-http")?.checked;
    const provider = isHttp ? (document.getElementById("email-api-provider")?.value || "BREVO") : "SMTP";
    const apiKey = document.getElementById("email-api-key")?.value.trim() || "";
    const apiSender = document.getElementById("email-api-sender")?.value.trim() || "seyoo123456789@gmail.com";
    const host = document.getElementById("smtp-host")?.value.trim() || "smtp.naver.com";
    const port = document.getElementById("smtp-port")?.value.trim() || 465;
    const user = document.getElementById("smtp-user")?.value.trim() || "";
    const pass = document.getElementById("smtp-pass")?.value.trim() || "";
    const recipients = document.getElementById("smtp-recipients")?.value.trim() || "";
    const enabled = this.emailAlertEnabled !== false;

    // Selected Rules Checklist
    const selectedRules = Array.from(document.querySelectorAll(".email-rule-checkbox:checked")).map(cb => cb.value);
    if (selectedRules.length === 0) {
      alert("⚠️ 정각 리포트에 포함할 오류 항목을 최소 1개 이상 선택해야 합니다.");
      return;
    }

    try {
      const payload = {
        thresholdCount,
        reportMode,
        minContinuousHours,
        selectedRules,
        provider,
        apiKey,
        apiSender,
        host,
        port,
        user,
        pass,
        recipients,
        enabled
      };

      const res = await window.apiClient.updateNotificationConfig(payload);
      if (res.success) {
        if (fromToggle) {
          this.showToast(enabled ? "🔔 결측 이메일 알림이 [발송 활성화 (ON)]되었습니다." : "🔕 결측 이메일 알림이 [발송 일시중지 (OFF)]되었습니다.", enabled ? "success" : "info");
        } else {
          this.showToast(`알림 설정(모드: ${reportMode === "HOURLY_DIGEST" ? "정각 종합리포트" : "개별발송"}, 지속: ${minContinuousHours}시간 이상, 상태: ${enabled ? "ON" : "OFF"})이 저장되었습니다.`, "success");
        }
        this.loadSmtpConfig();
      } else {
        alert(res.message || "설정 저장 실패");
      }
    } catch (e) {
      alert("설정 저장 중 오류가 발생했습니다.");
    }
  }

  async sendTestDigestEmail() {
    if (!window.apiClient) return;
    if (window.apiClient.user?.role !== "admin") {
      alert("⚠️ 정각 종합 리포트 테스트 발송은 최고 관리자(admin) 계정으로만 실행할 수 있습니다.");
      return;
    }
    const defaultRecip = (document.getElementById("smtp-recipients")?.value.split(",")[0] || "").trim();
    const targetEmail = prompt("전국 관측소 정각 종합 리포트를 테스트 발송할 수신 이메일을 입력하세요:\n(현재 1시간 이상 지속된 이상 관측소 목록이 1통의 HTML 종합표로 전송됩니다)", defaultRecip);
    if (!targetEmail) return;

    try {
      this.showToast("📊 정각 종합 리포트(1시간 이상 지속 지점 취합)를 생성하여 전송 중입니다...", "info");
      const res = await window.apiClient.sendTestDigestNotification(targetEmail);
      if (res.success) {
        alert(`✓ 정각 종합 리포트 테스트 발송 성공!\n수신처: ${targetEmail}\n발송 모드: ${res.status || "SUCCESS"}`);
        this.showToast("정각 리포트 발송 완료", "success");
      } else {
        alert(`⚠️ 발송 실패: ${res.message || res.error || "알 수 없는 오류"}`);
      }
    } catch (e) {
      alert("정각 종합 리포트 발송 중 오류가 발생했습니다: " + e.message);
    }
  }

  async sendTestEmail() {
    if (!window.apiClient) return;
    if (window.apiClient.user?.role !== "admin") {
      alert("⚠️ 테스트 메일 발송은 최고 관리자(admin) 계정으로만 실행할 수 있습니다.");
      return;
    }
    const defaultRecip = (document.getElementById("smtp-recipients")?.value.split(",")[0] || "").trim();
    const targetEmail = prompt("테스트 메일을 발송할 수신 이메일 주소를 입력하세요:", defaultRecip);
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

  formatKstDateTime(isoStr) {
    if (!isoStr) return "-";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return String(isoStr).slice(0, 19).replace("T", " ");
      const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).formatToParts(d);
      const get = (t) => parts.find(p => p.type === t)?.value || "";
      return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
    } catch (_) {
      return String(isoStr).slice(0, 19).replace("T", " ");
    }
  }

  isLegacyPerStationLog(log) {
    const subj = log.subject || "";
    const st = log.stationName || "";
    return subj.startsWith("[자동유량관측 경보]") || subj.startsWith("[자동유량관측 주의]") || subj.startsWith("[자동유량관측 복구완료]") || st.includes("(개별");
  }

  setEmailLogDatePreset(preset) {
    const allLogs = this._cachedEmailLogs || [];
    let minDate = "2026-10-30";
    let maxDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (allLogs.length > 0) {
      const dates = allLogs.map(l => this.formatKstDateTime(l.timestamp).slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      if (dates.length > 0) {
        minDate = dates[0];
        maxDate = dates[dates.length - 1];
      }
    }

    if (preset === "all") {
      this._emailLogStartDate = minDate;
      this._emailLogEndDate = maxDate;
    } else if (preset === "7d") {
      const end = new Date(maxDate + "T00:00:00");
      const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
      this._emailLogStartDate = start.toISOString().slice(0, 10);
      this._emailLogEndDate = maxDate;
    } else if (preset === "14d") {
      const end = new Date(maxDate + "T00:00:00");
      const start = new Date(end.getTime() - 13 * 24 * 60 * 60 * 1000);
      this._emailLogStartDate = start.toISOString().slice(0, 10);
      this._emailLogEndDate = maxDate;
    } else if (preset === "month") {
      this._emailLogStartDate = maxDate.slice(0, 8) + "01";
      this._emailLogEndDate = maxDate;
    }
    this._emailLogPreset = preset;
    this.showNotificationLogsModal(false);
  }

  onEmailLogDateInputChange() {
    const sEl = document.getElementById("email-log-start-date");
    const eEl = document.getElementById("email-log-end-date");
    if (sEl) this._emailLogStartDate = sEl.value;
    if (eEl) this._emailLogEndDate = eEl.value;
    this._emailLogPreset = "custom";
    this.showNotificationLogsModal(false);
  }

  async showNotificationLogsModal(forceRefresh = false) {
    if (!window.apiClient) return;
    try {
      if (forceRefresh || !this._cachedEmailLogs) {
        if (forceRefresh) this.showToast("🔄 최신 메일 발송 이력을 동기화 중입니다...", "info");
        const res = await window.apiClient.getNotificationLogs(forceRefresh);
        this._cachedEmailLogs = res.logs || [];
      }
      const allLogs = this._cachedEmailLogs || [];

      // Determine available min/max dates
      const dates = allLogs
        .map(l => this.formatKstDateTime(l.timestamp).slice(0, 10))
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
      const minDate = dates[0] || "2026-10-30";
      const maxDate = dates[dates.length - 1] || new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

      if (!this._emailLogStartDate) this._emailLogStartDate = minDate;
      if (!this._emailLogEndDate) this._emailLogEndDate = maxDate;
      if (!this._emailLogPreset) this._emailLogPreset = "all";

      const startDate = this._emailLogStartDate;
      const endDate = this._emailLogEndDate;

      const filtered = allLogs.filter(l => {
        const d = this.formatKstDateTime(l.timestamp).slice(0, 10);
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      });

      const alertCount = filtered.filter(l => l.subject?.includes("신규") || l.subject?.includes("변동알림")).length;
      const resolvedCount = filtered.filter(l => l.subject?.includes("복구") || l.subject?.includes("정상화")).length;

      const presetBtnStyle = (p) => this._emailLogPreset === p
        ? "background:#1e40af; color:#ffffff; border-color:#1e40af; font-weight:800;"
        : "background:#ffffff; color:#334155; border-color:#cbd5e1; font-weight:600;";

      let html = `
        <div style="display:flex; flex-direction:column; gap:0.85rem;">
          <!-- Top KPI Summary Cards -->
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:0.75rem;">
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:0.8rem 1rem; text-align:center;">
              <div style="font-size:0.76rem; font-weight:700; color:#1e40af;">📊 조회 기간 통합 리포트 수</div>
              <div style="font-size:1.45rem; font-weight:900; color:#1d4ed8; margin-top:2px;">${filtered.length}건 <span style="font-size:0.82rem; font-weight:700; color:#64748b;">/ 전체 ${allLogs.length}건</span></div>
              <div style="font-size:0.7rem; color:#475569;">${startDate} ~ ${endDate}</div>
            </div>
            <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:0.8rem 1rem; text-align:center;">
              <div style="font-size:0.76rem; font-weight:700; color:#b91c1c;">🚨 신규 · 변동 발생 리포트</div>
              <div style="font-size:1.45rem; font-weight:900; color:#dc2626; margin-top:2px;">${alertCount}건</div>
              <div style="font-size:0.7rem; color:#64748b;">1시간 이상 미수신·배터리 이상 발생</div>
            </div>
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:0.8rem 1rem; text-align:center;">
              <div style="font-size:0.76rem; font-weight:700; color:#15803d;">✅ 정상 복구 확인 리포트</div>
              <div style="font-size:1.45rem; font-weight:900; color:#16a34a; margin-top:2px;">${resolvedCount}건</div>
              <div style="font-size:0.7rem; color:#64748b;">결측 및 전압 이상 정상화 확인</div>
            </div>
          </div>

          <!-- Date Range Filter Bar -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; background:#f8fafc; padding:0.65rem 0.9rem; border-radius:8px; border:1px solid #e2e8f0;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:0.8rem; font-weight:800; color:#1e293b;">📅 조회 기간 설정:</span>
              <input type="date" id="email-log-start-date" class="form-input" value="${startDate}" onchange="window.app.onEmailLogDateInputChange()" style="width:142px; height:32px !important; padding:2px 8px; font-size:0.78rem; font-weight:700;">
              <span style="color:#64748b; font-weight:700;">~</span>
              <input type="date" id="email-log-end-date" class="form-input" value="${endDate}" onchange="window.app.onEmailLogDateInputChange()" style="width:142px; height:32px !important; padding:2px 8px; font-size:0.78rem; font-weight:700;">
              <div style="display:flex; gap:4px; margin-left:4px;">
                <button type="button" class="btn btn-sm" style="padding:4px 10px; font-size:0.75rem; ${presetBtnStyle("all")}" onclick="window.app.setEmailLogDatePreset('all')">전체 기간</button>
                <button type="button" class="btn btn-sm" style="padding:4px 10px; font-size:0.75rem; ${presetBtnStyle("7d")}" onclick="window.app.setEmailLogDatePreset('7d')">최근 7일</button>
                <button type="button" class="btn btn-sm" style="padding:4px 10px; font-size:0.75rem; ${presetBtnStyle("14d")}" onclick="window.app.setEmailLogDatePreset('14d')">최근 14일</button>
                <button type="button" class="btn btn-sm" style="padding:4px 10px; font-size:0.75rem; ${presetBtnStyle("month")}" onclick="window.app.setEmailLogDatePreset('month')">이번 달</button>
              </div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" style="padding:4px 10px; font-size:0.75rem; font-weight:700; color:#1e40af; border-color:#93c5fd; background:#ffffff;" onclick="window.app.showNotificationLogsModal(true)">
              🔄 새로고침
            </button>
          </div>

          <!-- Table -->
          <div style="max-height:460px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px;">
            <table class="custom-table" style="font-size:0.79rem; width:100%;">
              <thead style="position:sticky; top:0; z-index:2; background:#f1f5f9;">
                <tr>
                  <th style="width:44px; text-align:center;">No</th>
                  <th style="width:150px; text-align:center;">발송일시 (KST)</th>
                  <th style="width:105px; text-align:center;">구분</th>
                  <th>통합 리포트 제목 및 관측품질 변동 요약</th>
                  <th style="width:80px; text-align:center;">이상지점</th>
                  <th style="width:165px;">수신처</th>
                </tr>
              </thead>
              <tbody>`;

      if (filtered.length === 0) {
        html += `<tr><td colspan="6" style="text-align:center; padding:2.5rem; color:#94a3b8;">설정한 조회 기간(${startDate} ~ ${endDate})에 해당하는 통합 리포트 이력이 없습니다.</td></tr>`;
      } else {
        filtered.forEach((l, idx) => {
          const subj = l.subject || l.stationName || "-";
          let typeBadge = `<span class="badge badge-blue">📊 기준리포트</span>`;
          if (subj.includes("[관측품질 변동알림]")) {
            typeBadge = `<span class="badge badge-red">🚨 신규+복구</span>`;
          } else if (subj.includes("[관측품질 신규이상]")) {
            typeBadge = `<span class="badge badge-red">🚨 신규이상</span>`;
          } else if (subj.includes("[관측품질 정상복구]") || subj.includes("[관측품질 전 지점 정상화]")) {
            typeBadge = `<span class="badge badge-green">✅ 정상복구</span>`;
          } else if (l.level === "TEST" || subj.includes("[테스트]")) {
            typeBadge = `<span class="badge badge-purple">🧪 테스트</span>`;
          }

          const countText = `<b style="color:${l.count > 0 ? "#dc2626" : "#16a34a"};">${l.count || 0}개소</b>`;

          html += `
            <tr>
              <td style="text-align:center; color:#64748b; font-weight:600;">${idx + 1}</td>
              <td style="text-align:center; font-family:monospace; font-size:0.77rem; color:#1e293b; font-weight:700; white-space:nowrap;">
                ${this.formatKstDateTime(l.timestamp)}
              </td>
              <td style="text-align:center; white-space:nowrap;">${typeBadge}</td>
              <td style="line-height:1.4;">
                <div style="font-weight:700; color:#0f172a;">${subj}</div>
                ${l.error ? `<div style="font-size:0.72rem; color:#475569; margin-top:2px;">• ${l.error}</div>` : ""}
              </td>
              <td style="text-align:center; white-space:nowrap;">${countText}</td>
              <td style="font-size:0.75rem; color:#334155; word-break:break-all;">${l.recipients || "psn5578@naver.com"}</td>
            </tr>`;
        });
      }
      html += `
              </tbody>
            </table>
          </div>
        </div>`;

      const modal = document.getElementById("detail-modal");
      const dialog = modal ? modal.querySelector(".modal-dialog") : null;
      if (dialog) dialog.style.maxWidth = "960px";
      const title = document.getElementById("detail-modal-title");
      const body = document.getElementById("detail-modal-body");
      if (modal && title && body) {
        title.innerHTML = `<span>📜 정각 통합 리포트 발송 이력 (조회 기간 ${filtered.length}건 / 누적 ${allLogs.length}건)</span>`;
        body.innerHTML = html;
        modal.classList.add("active");
      }
    } catch (e) {
      console.error("showNotificationLogsModal error:", e);
      alert("발송 로그 조회 중 오류가 발생했습니다: " + e.message);
    }
  }

  // --- My Page Modal Handlers ---
  async openMyPageModal() {
    const modal = document.getElementById("mypage-modal");
    if (!modal) return;

    this.switchMyPageTab("profile");

    // Populate user profile info
    try {
      let user = window.apiClient?.user;
      const res = await window.apiClient?.getProfile();
      if (res && res.success && res.user) {
        user = res.user;
      }

      if (user) {
        document.getElementById("mypage-info-username").textContent = user.username || "-";
        const roleEl = document.getElementById("mypage-info-role");
        if (roleEl) {
          if (user.role === "admin") {
            roleEl.textContent = "최고관리자 (admin)";
            roleEl.className = "badge badge-purple";
          } else if (user.role === "manager") {
            roleEl.textContent = "관리자 (manager)";
            roleEl.className = "badge badge-indigo";
          } else {
            roleEl.textContent = "일반사용자 (member)";
            roleEl.className = "badge badge-blue";
          }
        }
        document.getElementById("mypage-info-name").textContent = `${user.name || "-"} (${user.position || "팀원"})`;
        document.getElementById("mypage-info-team").textContent = user.team || "수자원인프라팀";
        document.getElementById("mypage-email-input").value = user.email || "";
      }
    } catch(e) {
      console.warn("Failed to load profile:", e);
    }

    // Reset messages and forms
    const profMsg = document.getElementById("mypage-profile-msg");
    if (profMsg) profMsg.style.display = "none";
    const pwdMsg = document.getElementById("mypage-pwd-msg");
    if (pwdMsg) pwdMsg.style.display = "none";
    const pwdForm = document.getElementById("mypage-password-form");
    if (pwdForm) pwdForm.reset();

    modal.classList.add("active");
  }

  closeMyPageModal() {
    const modal = document.getElementById("mypage-modal");
    if (modal) modal.classList.remove("active");
  }

  switchMyPageTab(tab) {
    const profTab = document.getElementById("mypage-tab-profile");
    const pwdTab = document.getElementById("mypage-tab-password");
    const profBtn = document.getElementById("mypage-tab-btn-profile");
    const pwdBtn = document.getElementById("mypage-tab-btn-password");

    if (tab === "profile") {
      if (profTab) profTab.style.display = "block";
      if (pwdTab) pwdTab.style.display = "none";
      if (profBtn) {
        profBtn.style.borderBottom = "2px solid #2563eb";
        profBtn.style.color = "#2563eb";
        profBtn.style.fontWeight = "700";
        profBtn.style.background = "#ffffff";
      }
      if (pwdBtn) {
        pwdBtn.style.borderBottom = "2px solid transparent";
        pwdBtn.style.color = "#64748b";
        pwdBtn.style.fontWeight = "600";
        pwdBtn.style.background = "#f8fafc";
      }
    } else {
      if (profTab) profTab.style.display = "none";
      if (pwdTab) pwdTab.style.display = "block";
      if (pwdBtn) {
        pwdBtn.style.borderBottom = "2px solid #2563eb";
        pwdBtn.style.color = "#2563eb";
        pwdBtn.style.fontWeight = "700";
        pwdBtn.style.background = "#ffffff";
      }
      if (profBtn) {
        profBtn.style.borderBottom = "2px solid transparent";
        profBtn.style.color = "#64748b";
        profBtn.style.fontWeight = "600";
        profBtn.style.background = "#f8fafc";
      }
    }
  }

  async saveProfileEmail(e) {
    e.preventDefault();
    const emailInput = document.getElementById("mypage-email-input");
    const msgEl = document.getElementById("mypage-profile-msg");
    const btn = document.getElementById("btn-save-mypage-profile");
    const email = emailInput.value.trim();

    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> <span>저장 중...</span>`;
    msgEl.style.display = "none";

    try {
      const res = await window.apiClient.updateProfile({ email });
      if (res && res.success) {
        msgEl.style.display = "block";
        msgEl.style.background = "#ecfdf5";
        msgEl.style.color = "#065f46";
        msgEl.style.border = "1px solid #a7f3d0";
        msgEl.textContent = `✓ ${res.message || "이메일 정보가 성공적으로 저장되었습니다."}`;
        
        if (window.apiClient.user) {
          window.apiClient.user.email = email;
          localStorage.setItem("khydro_user_profile", JSON.stringify(window.apiClient.user));
        }
        this.showToast("이메일 정보 저장 완료", "success");
      } else {
        msgEl.style.display = "block";
        msgEl.style.background = "#fef2f2";
        msgEl.style.color = "#991b1b";
        msgEl.style.border = "1px solid #fecaca";
        msgEl.textContent = `⚠️ ${res?.message || "이메일 저장 실패"}`;
      }
    } catch(err) {
      msgEl.style.display = "block";
      msgEl.style.background = "#fef2f2";
      msgEl.style.color = "#991b1b";
      msgEl.style.border = "1px solid #fecaca";
      msgEl.textContent = "서버 통신 오류가 발생했습니다.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span>💾</span> <span>이메일 정보 저장</span>`;
    }
  }

  async changeAccountPassword(e) {
    e.preventDefault();
    const curPwd = document.getElementById("mypage-cur-pwd").value;
    const newPwd = document.getElementById("mypage-new-pwd").value;
    const confirmPwd = document.getElementById("mypage-confirm-pwd").value;
    const msgEl = document.getElementById("mypage-pwd-msg");
    const btn = document.getElementById("btn-submit-change-pwd");

    if (newPwd !== confirmPwd) {
      msgEl.style.display = "block";
      msgEl.style.background = "#fef2f2";
      msgEl.style.color = "#991b1b";
      msgEl.style.border = "1px solid #fecaca";
      msgEl.textContent = "⚠️ 새로 입력한 비밀번호와 비밀번호 확인이 일치하지 않습니다.";
      return;
    }

    if (newPwd.length < 4) {
      msgEl.style.display = "block";
      msgEl.style.background = "#fef2f2";
      msgEl.style.color = "#991b1b";
      msgEl.style.border = "1px solid #fecaca";
      msgEl.textContent = "⚠️ 새 비밀번호는 최소 4자 이상이어야 합니다.";
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> <span>비밀번호 변경 중...</span>`;
    msgEl.style.display = "none";

    try {
      const res = await window.apiClient.changePassword(curPwd, newPwd);
      if (res && res.success) {
        msgEl.style.display = "block";
        msgEl.style.background = "#ecfdf5";
        msgEl.style.color = "#065f46";
        msgEl.style.border = "1px solid #a7f3d0";
        msgEl.textContent = `✓ ${res.message || "비밀번호가 성공적으로 변경되었습니다."}`;
        
        document.getElementById("mypage-password-form").reset();
        this.showToast("비밀번호 변경 완료", "success");
      } else {
        msgEl.style.display = "block";
        msgEl.style.background = "#fef2f2";
        msgEl.style.color = "#991b1b";
        msgEl.style.border = "1px solid #fecaca";
        msgEl.textContent = `⚠️ ${res?.message || "비밀번호 변경 실패"}`;
      }
    } catch(err) {
      msgEl.style.display = "block";
      msgEl.style.background = "#fef2f2";
      msgEl.style.color = "#991b1b";
      msgEl.style.border = "1px solid #fecaca";
      msgEl.textContent = "서버 통신 오류가 발생했습니다.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<span>🔑</span> <span>비밀번호 변경 실행</span>`;
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
