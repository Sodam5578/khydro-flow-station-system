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

    // 6. Initialize Maintenance Manager & Maintenance History Manager
    try {
      window.maintenanceManager.init();
      if (window.maintenanceHistoryManager) window.maintenanceHistoryManager.init();
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
      if (window.maintenanceHistoryManager && window.maintenanceHistoryManager.activeTab === "history") {
        window.maintenanceHistoryManager.loadGlobalHistory();
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

  async loadSmtpConfig() {
    if (!window.apiClient) return;
    try {
      const res = await window.apiClient.getNotificationConfig();
      const isAdmin = window.apiClient.user?.role === "admin";

      const threshEl = document.getElementById("smtp-threshold");
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
      const engineHttpRadio = document.getElementById("engine-type-http");
      const engineSmtpRadio = document.getElementById("engine-type-smtp");

      // UI Admin Enforcement
      if (noticeEl) noticeEl.style.display = isAdmin ? "none" : "block";
      if (saveBtn) saveBtn.style.display = isAdmin ? "inline-flex" : "none";
      if (testBtn) testBtn.style.display = isAdmin ? "inline-flex" : "none";

      [threshEl, hostEl, portEl, userEl, passEl, recipEl, apiKeyEl, apiSenderEl, providerEl, engineHttpRadio, engineSmtpRadio].forEach(el => {
        if (el) el.disabled = !isAdmin;
      });

      if (res.success && res.config) {
        const c = res.config;
        if (threshEl && c.thresholdCount) threshEl.value = String(c.thresholdCount);
        if (hostEl) hostEl.value = c.host || "smtp.naver.com";
        if (portEl) portEl.value = c.port || 465;
        if (userEl) userEl.value = c.user || "";
        if (passEl) passEl.value = c.pass || "";
        if (recipEl) recipEl.value = c.recipients || "psn5578@naver.com, psn5578@kihs.re.kr";
        if (apiKeyEl) apiKeyEl.value = c.rawApiKey || "";
        if (apiSenderEl) apiSenderEl.value = c.apiSender || "seyoo123456789@gmail.com";
        if (providerEl && c.provider && c.provider !== "AUTO") providerEl.value = c.provider;

        // Toggle UI mode based on provider
        if (c.effectiveProvider === "SMTP" && !c.rawApiKey) {
          if (engineSmtpRadio) engineSmtpRadio.checked = true;
        } else {
          if (engineHttpRadio) engineHttpRadio.checked = true;
        }
        this.toggleEmailEngineUI();
        
        if (badgeEl) {
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

  async saveSmtpConfig() {
    if (!window.apiClient) return;
    const threshEl = document.getElementById("smtp-threshold");
    const thresholdCount = threshEl ? parseInt(threshEl.value, 10) : 3;
    const isHttp = document.getElementById("engine-type-http")?.checked;
    const provider = isHttp ? (document.getElementById("email-api-provider")?.value || "BREVO") : "SMTP";
    const apiKey = document.getElementById("email-api-key")?.value.trim() || "";
    const apiSender = document.getElementById("email-api-sender")?.value.trim() || "seyoo123456789@gmail.com";
    const host = document.getElementById("smtp-host")?.value.trim() || "smtp.naver.com";
    const port = document.getElementById("smtp-port")?.value.trim() || 465;
    const user = document.getElementById("smtp-user")?.value.trim() || "";
    const pass = document.getElementById("smtp-pass")?.value.trim() || "";
    const recipients = document.getElementById("smtp-recipients")?.value.trim() || "";

    try {
      const payload = { thresholdCount, provider, apiKey, apiSender, host, port, user, pass, recipients, enabled: true };

      const res = await window.apiClient.updateNotificationConfig(payload);
      if (res.success) {
        this.showToast(`알림 설정(기준: 연속 ${thresholdCount}회, 방식: ${provider})이 저장되었습니다.`, "success");
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
    if (window.apiClient.user?.role !== "admin") {
      alert("⚠️ 테스트 메일 발송은 최고 관리자(admin) 계정으로만 실행할 수 있습니다.");
      return;
    }
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
          roleEl.textContent = user.role === "admin" ? "최고관리자 (admin)" : "일반사용자 (member)";
          roleEl.className = user.role === "admin" ? "badge badge-purple" : "badge badge-blue";
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
