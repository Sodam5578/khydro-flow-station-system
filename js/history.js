/**
 * MaintenanceHistoryManager
 * Manages chronological maintenance action history / inspection logs for all 223 stations.
 */
class MaintenanceHistoryManager {
  constructor() {
    this.historyList = [];
    this.currentStationHistory = [];
    this.editingHistoryId = null;
    this.currentStationId = null;
    this.activeTab = "checklist"; // "checklist" | "history"

    this.filters = {
      stationId: "all",
      region: "all",
      actionType: "all",
      category: "all",
      actorType: "all",
      resultStatus: "all",
      startDate: "",
      endDate: "",
      keyword: ""
    };
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    const searchInput = document.getElementById("maint-hist-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.filters.keyword = e.target.value.trim();
        this.loadGlobalHistory();
      });
    }

    const typeSelect = document.getElementById("maint-hist-filter-type");
    if (typeSelect) {
      typeSelect.addEventListener("change", (e) => {
        this.filters.actionType = e.target.value;
        this.loadGlobalHistory();
      });
    }

    const actorSelect = document.getElementById("maint-hist-filter-actor");
    if (actorSelect) {
      actorSelect.addEventListener("change", (e) => {
        this.filters.actorType = e.target.value;
        this.loadGlobalHistory();
      });
    }

    const statusSelect = document.getElementById("maint-hist-filter-status");
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => {
        this.filters.resultStatus = e.target.value;
        this.loadGlobalHistory();
      });
    }

    const startInput = document.getElementById("maint-hist-start-date");
    if (startInput) {
      startInput.addEventListener("change", (e) => {
        this.filters.startDate = e.target.value;
        this.loadGlobalHistory();
      });
    }

    const endInput = document.getElementById("maint-hist-end-date");
    if (endInput) {
      endInput.addEventListener("change", (e) => {
        this.filters.endDate = e.target.value;
        this.loadGlobalHistory();
      });
    }
  }

  switchSubTab(tabKey) {
    this.activeTab = tabKey;
    const checklistSection = document.getElementById("maint-subtab-checklist");
    const historySection = document.getElementById("maint-subtab-history");
    const btnChecklist = document.getElementById("btn-subtab-checklist");
    const btnHistory = document.getElementById("btn-subtab-history");

    if (tabKey === "checklist") {
      if (checklistSection) checklistSection.style.display = "block";
      if (historySection) historySection.style.display = "none";
      if (btnChecklist) {
        btnChecklist.className = "btn btn-primary btn-sm";
      }
      if (btnHistory) {
        btnHistory.className = "btn btn-outline btn-sm";
      }
    } else {
      if (checklistSection) checklistSection.style.display = "none";
      if (historySection) historySection.style.display = "block";
      if (btnChecklist) {
        btnChecklist.className = "btn btn-outline btn-sm";
      }
      if (btnHistory) {
        btnHistory.className = "btn btn-primary btn-sm";
      }
      this.loadGlobalHistory();
    }
  }

  onActorTypeChange(val) {
    const customInput = document.getElementById("hist-form-actor-custom");
    if (!customInput) return;
    if (val === "custom") {
      customInput.style.display = "block";
      customInput.required = true;
      customInput.focus();
    } else {
      customInput.style.display = "none";
      customInput.required = false;
      customInput.value = "";
    }
  }

  // ==========================================
  // 1. GLOBAL MAINTENANCE HISTORY LOGS
  // ==========================================
  async loadGlobalHistory() {
    const tbody = document.getElementById("maint-hist-table-body");
    const countEl = document.getElementById("maint-hist-table-count");
    if (!tbody) return;

    try {
      const res = await window.apiClient.getMaintenanceHistory(this.filters);
      if (!res.success) throw new Error(res.message);

      this.historyList = res.data || [];

      // Update KPI summaries
      this.updateHistoryKpis(this.historyList);

      if (countEl) countEl.textContent = this.historyList.length;

      if (this.historyList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2.5rem; color:#94a3b8;">검색 및 필터 조건에 해당하는 유지관리 조치 이력이 없습니다.</td></tr>`;
        return;
      }

      tbody.innerHTML = this.historyList.map((item, idx) => {
        const typeBadge = this.getActionTypeBadge(item.action_type);
        const statusBadge = this.getResultStatusBadge(item.result_status);
        
        let actorBadge = "";
        if (item.actor_type?.includes("리버앤씨") || item.actor_type?.includes("RNS")) {
          actorBadge = `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:0.75rem; font-weight:700;">용역사(리버앤씨)</span>`;
        } else if (item.actor_type?.includes("기술원")) {
          actorBadge = `<span class="badge" style="background:#eff6ff; color:#1e40af; font-size:0.75rem; font-weight:700;">기술원(자체)</span>`;
        } else {
          actorBadge = `<span class="badge" style="background:#f3e8ff; color:#6b21a8; font-size:0.75rem; font-weight:700;">${this.escapeHtml(item.actor_type || "기타")}</span>`;
        }

        let dateDisplay = "";
        if (item.issue_date && item.issue_date !== item.action_date) {
          dateDisplay = `
            <div style="font-size:0.75rem; color:#dc2626; font-weight:600; white-space:nowrap;" title="문제 발생(인지)일">🚨 ${item.issue_date}</div>
            <div style="font-size:0.82rem; font-weight:800; color:#1e293b; white-space:nowrap; margin-top:2px;" title="조치 완료(작업)일">🛠️ ${item.action_date}</div>
          `;
        } else {
          dateDisplay = `<div style="font-weight:700; font-size:0.85rem; color:#1e293b; white-space:nowrap;" title="조치일자">${item.action_date}</div>`;
        }

        return `
          <tr>
            <td><b>${idx + 1}</b></td>
            <td>${dateDisplay}</td>
            <td>
              <a href="javascript:void(0)" onclick="window.modalManager.openDetail(${item.station_id})" style="font-weight:700; color:#1e40af; text-decoration:none;">
                ${item.station_name}
              </a>
            </td>
            <td>${typeBadge}</td>
            <td><span style="font-size:0.8rem; font-weight:600; color:#334155;">${item.target_equipment || "-"}</span></td>
            <td style="max-width:320px; text-align:left;">
              <div style="font-size:0.85rem; color:#1e293b; line-height:1.4;">${this.escapeHtml(item.description)}</div>
              ${item.memo ? `<div style="font-size:0.75rem; color:#64748b; margin-top:2px;">💬 <i>${this.escapeHtml(item.memo)}</i></div>` : ""}
            </td>
            <td>
              <div>${actorBadge}</div>
              ${item.worker_name ? `<div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${item.worker_name}</div>` : ""}
            </td>
            <td>${statusBadge}</td>
            <td>
              <div style="display:flex; gap:4px; justify-content:center;">
                <button class="btn btn-outline btn-sm" onclick="window.maintenanceHistoryManager.openEditModal(${item.id})" style="padding:2px 6px; font-size:0.72rem;">✏️ 수정</button>
                <button class="btn btn-outline btn-sm" onclick="window.maintenanceHistoryManager.deleteRecord(${item.id})" style="padding:2px 6px; font-size:0.72rem; color:#dc2626; border-color:#fca5a5;">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    } catch (e) {
      console.error("Load global maintenance history error:", e);
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:#dc2626;">이력 데이터를 불러오는 중 오류가 발생했습니다: ${e.message}</td></tr>`;
    }
  }

  updateHistoryKpis(list) {
    const totalCount = list.length;
    const currentYear = new Date().getFullYear().toString();
    const thisYearCount = list.filter(item => item.action_date && item.action_date.startsWith(currentYear)).length;
    const kihsCount = list.filter(item => item.actor_type?.includes("기술원")).length;
    const rnsCount = list.filter(item => item.actor_type?.includes("리버앤씨") || item.actor_type?.includes("RNS") || item.actor_type?.includes("용역사")).length;

    const elTotal = document.getElementById("kpi-hist-total");
    const elYear = document.getElementById("kpi-hist-this-year");
    const elKihs = document.getElementById("kpi-hist-kihs");
    const elRns = document.getElementById("kpi-hist-rns");

    if (elTotal) elTotal.textContent = `${totalCount}건`;
    if (elYear) elYear.textContent = `${thisYearCount}건`;
    if (elKihs) elKihs.textContent = `${kihsCount}건`;
    if (elRns) elRns.textContent = `${rnsCount}건`;
  }

  // ==========================================
  // 2. STATION-SPECIFIC MAINTENANCE HISTORY (Detail Modal)
  // ==========================================
  async loadStationHistory(stationId) {
    this.currentStationId = stationId;
    const container = document.getElementById(`station-history-container-${stationId}`) || document.getElementById("station-history-container");
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; padding:1.5rem; color:#64748b;">⏳ 유지관리 조치 이력을 불러오는 중...</div>`;

    try {
      const res = await window.apiClient.getStationMaintenanceHistory(stationId);
      if (!res.success) throw new Error(res.message);

      this.currentStationHistory = res.data || [];

      if (this.currentStationHistory.length === 0) {
        container.innerHTML = `
          <div style="padding:1.5rem; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; text-align:center;">
            <div style="font-size:1.5rem; margin-bottom:4px;">📜</div>
            <div style="font-size:0.85rem; font-weight:700; color:#475569;">등록된 과거 유지관리 조치 이력이 없습니다.</div>
            <div style="font-size:0.78rem; color:#94a3b8; margin-top:2px;">상단의 [+ 새 조치 이력 등록] 버튼으로 현장 점검, 부품 교체, 보수 내역을 기록할 수 있습니다.</div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.6rem; max-height:300px; overflow-y:auto; padding-right:4px;">
          ${this.currentStationHistory.map(item => {
            const typeBadge = this.getActionTypeBadge(item.action_type);
            const statusBadge = this.getResultStatusBadge(item.result_status);
            
            let actorBadge = "";
            if (item.actor_type?.includes("리버앤씨") || item.actor_type?.includes("RNS")) {
              actorBadge = `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:0.7rem; font-weight:700;">용역사(리버앤씨)</span>`;
            } else if (item.actor_type?.includes("기술원")) {
              actorBadge = `<span class="badge" style="background:#eff6ff; color:#1e40af; font-size:0.7rem; font-weight:700;">기술원(자체)</span>`;
            } else {
              actorBadge = `<span class="badge" style="background:#f3e8ff; color:#6b21a8; font-size:0.7rem; font-weight:700;">${this.escapeHtml(item.actor_type || "기타")}</span>`;
            }

            let dateDisplay = "";
            if (item.issue_date && item.issue_date !== item.action_date) {
              dateDisplay = `<span style="font-size:0.75rem; color:#dc2626; font-weight:700;" title="발생일">🚨 발생 ${item.issue_date}</span> <span style="font-size:0.75rem; color:#64748b;">➔</span> <span style="font-size:0.82rem; font-weight:800; color:#1e293b;" title="조치일">🛠️ 조치 ${item.action_date}</span>`;
            } else {
              dateDisplay = `<span style="font-size:0.82rem; font-weight:800; color:#1e293b;">📅 ${item.action_date}</span>`;
            }

            return `
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:0.65rem 0.85rem; transition:all 0.15s ease;" class="hover-shadow-sm">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; flex-wrap:wrap; gap:4px;">
                  <div style="display:flex; align-items:center; gap:6px;">
                    ${dateDisplay}
                    ${typeBadge}
                    ${item.target_equipment ? `<span class="badge badge-gray" style="font-size:0.72rem;">⚙️ ${item.target_equipment}</span>` : ""}
                  </div>
                  <div style="display:flex; align-items:center; gap:6px;">
                    ${actorBadge}
                    ${statusBadge}
                    <button class="btn btn-outline btn-sm" onclick="window.maintenanceHistoryManager.openEditModal(${item.id})" style="padding:1px 6px; font-size:0.7rem;">✏️ 수정</button>
                    <button class="btn btn-outline btn-sm" onclick="window.maintenanceHistoryManager.deleteRecord(${item.id}, ${stationId})" style="padding:1px 6px; font-size:0.7rem; color:#dc2626; border-color:#fca5a5;">🗑️</button>
                  </div>
                </div>

                <div style="font-size:0.85rem; color:#1e293b; line-height:1.45;">
                  ${this.escapeHtml(item.description)}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.35rem; font-size:0.75rem; color:#64748b; border-top:1px dashed #f1f5f9; padding-top:0.25rem;">
                  <div>
                    ${item.worker_name ? `<span>작업자: <b>${item.worker_name}</b></span>` : ""}
                    ${item.memo ? `<span style="margin-left:8px;">비고: <i>${this.escapeHtml(item.memo)}</i></span>` : ""}
                  </div>
                  <div>
                    ${item.cost ? `<span style="color:#059669; font-weight:700;">비용: ₩${Number(item.cost).toLocaleString()}</span>` : ""}
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } catch (e) {
      console.error("Load station history error:", e);
      container.innerHTML = `<div style="padding:1rem; color:#dc2626; font-size:0.8rem;">이력 로딩 실패: ${e.message}</div>`;
    }
  }

  // ==========================================
  // 3. MODAL CRUD HANDLERS
  // ==========================================
  openCreateModal(stationId = null) {
    this.editingHistoryId = null;
    const allStations = window.dataManager.getAll();

    const titleEl = document.getElementById("maint-hist-form-modal-title");
    if (titleEl) titleEl.textContent = "🛠️ 유지관리 조치 이력 신규 등록";

    // Populate Station Select
    const selectEl = document.getElementById("hist-form-station-id");
    if (selectEl) {
      selectEl.innerHTML = allStations.map(s => {
        const isSel = String(s.id) === String(stationId) ? "selected" : "";
        return `<option value="${s.id}" data-name="${s.name}" ${isSel}>${s.name} (${s.river || s.region}) [${s.code || "코드미부여"}]</option>`;
      }).join("");
    }

    // Reset fields
    const today = new Date().toISOString().slice(0, 10);
    const issueDateEl = document.getElementById("hist-form-issue-date");
    if (issueDateEl) issueDateEl.value = today;
    document.getElementById("hist-form-date").value = today;
    document.getElementById("hist-form-type").value = "정기점검";
    document.getElementById("hist-form-category").value = "전원·안전";
    document.getElementById("hist-form-equipment").value = "";
    document.getElementById("hist-form-actor-type").value = "기술원(자체)";
    this.onActorTypeChange("기술원(자체)");
    document.getElementById("hist-form-worker").value = window.apiClient?.user?.name || "";
    document.getElementById("hist-form-status").value = "완료";
    document.getElementById("hist-form-cost").value = "";
    document.getElementById("hist-form-desc").value = "";
    document.getElementById("hist-form-memo").value = "";

    const modal = document.getElementById("maint-history-form-modal");
    if (modal) modal.classList.add("active");
  }

  async openEditModal(historyId) {
    this.editingHistoryId = historyId;
    let item = this.historyList.find(h => String(h.id) === String(historyId)) ||
               this.currentStationHistory.find(h => String(h.id) === String(historyId));

    if (!item) {
      try {
        const res = await window.apiClient.getMaintenanceHistory();
        if (res.success && res.data) {
          item = res.data.find(h => String(h.id) === String(historyId));
        }
      } catch (e) {}
    }

    if (!item) {
      alert("수정할 이력 정보를 찾을 수 없습니다.");
      return;
    }

    const titleEl = document.getElementById("maint-hist-form-modal-title");
    if (titleEl) titleEl.textContent = `🛠️ 유지관리 조치 이력 수정 - ${item.station_name}`;

    const allStations = window.dataManager.getAll();
    const selectEl = document.getElementById("hist-form-station-id");
    if (selectEl) {
      selectEl.innerHTML = allStations.map(s => {
        const isSel = String(s.id) === String(item.station_id) ? "selected" : "";
        return `<option value="${s.id}" data-name="${s.name}" ${isSel}>${s.name} (${s.river || s.region})</option>`;
      }).join("");
    }

    const issueDateEl = document.getElementById("hist-form-issue-date");
    if (issueDateEl) issueDateEl.value = item.issue_date || item.action_date || "";
    document.getElementById("hist-form-date").value = item.action_date || "";
    document.getElementById("hist-form-type").value = item.action_type || "정기점검";
    document.getElementById("hist-form-category").value = item.category || "전원·안전";
    document.getElementById("hist-form-equipment").value = item.target_equipment || "";

    const actorSelect = document.getElementById("hist-form-actor-type");
    const customInput = document.getElementById("hist-form-actor-custom");
    const actor = item.actor_type || "기술원(자체)";

    if (actor === "기술원(자체)" || actor.includes("기술원")) {
      actorSelect.value = "기술원(자체)";
      this.onActorTypeChange("기술원(자체)");
    } else if (actor === "용역사(리버앤씨)" || actor.includes("리버앤씨") || actor.includes("RNS")) {
      actorSelect.value = "용역사(리버앤씨)";
      this.onActorTypeChange("용역사(리버앤씨)");
    } else {
      actorSelect.value = "custom";
      this.onActorTypeChange("custom");
      if (customInput) customInput.value = actor;
    }

    document.getElementById("hist-form-worker").value = item.worker_name || "";
    document.getElementById("hist-form-status").value = item.result_status || "완료";
    document.getElementById("hist-form-cost").value = item.cost || "";
    document.getElementById("hist-form-desc").value = item.description || "";
    document.getElementById("hist-form-memo").value = item.memo || "";

    const modal = document.getElementById("maint-history-form-modal");
    if (modal) modal.classList.add("active");
  }

  closeFormModal() {
    const modal = document.getElementById("maint-history-form-modal");
    if (modal) modal.classList.remove("active");
    this.editingHistoryId = null;
  }

  async saveForm() {
    const stationSelect = document.getElementById("hist-form-station-id");
    const stationId = parseInt(stationSelect.value, 10);
    const stationName = stationSelect.options[stationSelect.selectedIndex]?.dataset.name || "";

    const issueDateEl = document.getElementById("hist-form-issue-date");
    const actionDate = document.getElementById("hist-form-date").value.trim();
    const issueDate = (issueDateEl ? issueDateEl.value.trim() : "") || actionDate;

    const actionType = document.getElementById("hist-form-type").value;
    const category = document.getElementById("hist-form-category").value;
    const targetEquipment = document.getElementById("hist-form-equipment").value.trim();

    const actorSelectVal = document.getElementById("hist-form-actor-type").value;
    let actorType = actorSelectVal;
    if (actorSelectVal === "custom") {
      actorType = document.getElementById("hist-form-actor-custom").value.trim() || "기타(직접입력)";
    }

    const workerName = document.getElementById("hist-form-worker").value.trim();
    const resultStatus = document.getElementById("hist-form-status").value;
    const cost = parseInt(document.getElementById("hist-form-cost").value, 10) || 0;
    const description = document.getElementById("hist-form-desc").value.trim();
    const memo = document.getElementById("hist-form-memo").value.trim();

    if (!stationId || !actionDate || !description) {
      alert("관측시설, 조치일자, 작업 상세내용은 필수 입력 항목입니다.");
      return;
    }

    const payload = {
      station_id: stationId,
      station_name: stationName,
      issue_date: issueDate,
      action_date: actionDate,
      action_type: actionType,
      category,
      target_equipment: targetEquipment,
      actor_type: actorType,
      worker_name: workerName,
      result_status: resultStatus,
      cost,
      description,
      memo
    };

    try {
      if (this.editingHistoryId) {
        const res = await window.apiClient.updateMaintenanceHistory(this.editingHistoryId, payload);
        if (!res.success) throw new Error(res.message);
        window.app.showToast("유지관리 조치 이력이 성공적으로 수정되었습니다.", "success");
      } else {
        const res = await window.apiClient.createMaintenanceHistory(payload);
        if (!res.success) throw new Error(res.message);
        window.app.showToast("새로운 유지관리 조치 이력이 등록되었습니다.", "success");
      }

      this.closeFormModal();

      // Refresh views
      if (this.activeTab === "history") {
        this.loadGlobalHistory();
      }
      if (this.currentStationId) {
        this.loadStationHistory(this.currentStationId);
      }
      window.app.refreshAll();
    } catch (e) {
      console.error("Save maintenance history error:", e);
      alert("이력 저장 실패: " + e.message);
    }
  }

  async deleteRecord(historyId, stationId = null) {
    if (!confirm("정말로 이 유지관리 조치 이력을 삭제하시겠습니까?")) return;

    try {
      const res = await window.apiClient.deleteMaintenanceHistory(historyId);
      if (!res.success) throw new Error(res.message);

      window.app.showToast("조치 이력이 삭제되었습니다.", "info");

      if (this.activeTab === "history") {
        this.loadGlobalHistory();
      }
      if (stationId || this.currentStationId) {
        this.loadStationHistory(stationId || this.currentStationId);
      }
      window.app.refreshAll();
    } catch (e) {
      console.error("Delete maintenance history error:", e);
      alert("이력 삭제 실패: " + e.message);
    }
  }

  exportCsv() {
    if (!this.historyList || this.historyList.length === 0) {
      alert("내보낼 이력 데이터가 없습니다.");
      return;
    }

    const headers = ["순번", "문제발생(인지)일", "조치완료(작업)일", "관측소명", "조치구분", "과업분류", "대상장비", "조치내용", "수행주체", "작업자", "조치결과", "소요비용(원)", "비고"];
    const rows = this.historyList.map((item, idx) => [
      idx + 1,
      `"${item.issue_date || item.action_date}"`,
      `"${item.action_date}"`,
      `"${item.station_name}"`,
      `"${item.action_type}"`,
      `"${item.category || ""}"`,
      `"${item.target_equipment || ""}"`,
      `"${(item.description || "").replace(/"/g, '""')}"`,
      `"${item.actor_type || ""}"`,
      `"${item.worker_name || ""}"`,
      `"${item.result_status || ""}"`,
      item.cost || 0,
      `"${(item.memo || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `한국수자원조사기술원_유지관리_조치이력대장_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ==========================================
  // 4. BADGE HELPERS
  // ==========================================
  getActionTypeBadge(type) {
    if (!type) return `<span class="badge badge-gray">-</span>`;
    if (type.includes("정기점검")) return `<span class="badge badge-blue">🔍 정기점검</span>`;
    if (type.includes("긴급") || type.includes("장애")) return `<span class="badge badge-red">🚨 긴급보수</span>`;
    if (type.includes("교체")) return `<span class="badge badge-amber">🔧 부품교체</span>`;
    if (type.includes("수위계")) return `<span class="badge badge-green">📏 수위계정비</span>`;
    if (type.includes("검정")) return `<span class="badge badge-purple">🎯 정도검정</span>`;
    if (type.includes("전원") || type.includes("통신")) return `<span class="badge" style="background:#e0e7ff; color:#3730a3; font-weight:700;">⚡ 통신/전원</span>`;
    return `<span class="badge badge-gray">🛠️ ${type}</span>`;
  }

  getResultStatusBadge(status) {
    if (status === "완료" || status === "조치완료") {
      return `<span class="badge badge-green" style="font-weight:700;">✅ 완료</span>`;
    } else if (status === "진행중") {
      return `<span class="badge badge-blue" style="font-weight:700;">🔄 진행중</span>`;
    } else if (status === "추가조치필요") {
      return `<span class="badge badge-red" style="font-weight:700;">⚠️ 추가조치</span>`;
    } else if (status === "자재발주대기" || status === "부품발주대기") {
      return `<span class="badge badge-amber" style="font-weight:700;">📦 발주대기</span>`;
    }
    return `<span class="badge badge-gray">${status || "대기"}</span>`;
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
}

window.maintenanceHistoryManager = new MaintenanceHistoryManager();
