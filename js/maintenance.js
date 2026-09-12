/**
 * MaintenanceManager
 * Handles 2026 Maintenance Task Oversight, Monitoring & Direct User Input/Editing for Administrators.
 */
class MaintenanceManager {
  constructor() {
    this.selectedTaskKey = "all";
    this.selectedRegion = "all";
    this.selectedStatus = "all"; // all, pending, done
    this.searchTerm = "";
    this.editingStationId = null;
    this.tempMaintenanceState = null;

    this.taskGroups = [
      {
        category: "⚡ 전원 · 안전",
        tasks: [
          { key: "breaker", name: "자동복구 누전차단기", targetCount: 101, owner: "공통", icon: "⚡", desc: "원격 자동 복구 차단기 설치" },
          { key: "battery", name: "노후 배터리 교체", targetCount: 27, owner: "공통", icon: "🔋", desc: "수명 만료 백업 배터리 교체" },
          { key: "solar", name: "태양광 설비 정비", targetCount: 40, owner: "공통", icon: "☀️", desc: "독립전원 패널 및 컨트롤러 정비" },
          { key: "extinguisherRNS", name: "소화기 비치 (용역사)", targetCount: 75, owner: "용역사(RNS)", icon: "🧯", desc: "리버앤씨(RNS) 소화기 비치" },
          { key: "extinguisherKIHS", name: "소화기 비치 (기술원)", targetCount: 6, owner: "기술원(자체)", icon: "🧯", desc: "한국수자원조사기술원 자체 비치" }
        ]
      },
      {
        category: "🔌 통신 · 데이터",
        tasks: [
          { key: "dpConverter", name: "DP컨버터 교체/설치", targetCount: 176, owner: "공통", icon: "🔌", desc: "전 지점 신규 DP컨버터 적용" },
          { key: "osUpgrade", name: "OS 업그레이드", targetCount: 97, owner: "공통", icon: "💻", desc: "로거/센더 펌웨어 및 OS 현행화" },
          { key: "logger", name: "Logger(로거) 교체", targetCount: 24, owner: "공통", icon: "📟", desc: "노후 수집 로거 신규 교체" },
          { key: "sender", name: "Sender(센더) 교체", targetCount: 21, owner: "공통", icon: "📡", desc: "데이터 전송 센더 교체" },
          { key: "rvBox", name: "RV박스 정비/교체", targetCount: 39, owner: "공통", icon: "📦", desc: "외함 내 RV박스 정비" }
        ]
      },
      {
        category: "🌊 센서 · 계측",
        tasks: [
          { key: "dualGaugeUpdate", name: "유속계(2대) 현행화", targetCount: 22, owner: "공통", icon: "🌊", desc: "CM600/CM1200 복합 운영 현행화" },
          { key: "waterLevelGauge", name: "수위계 신설/정비", targetCount: 13, owner: "공통", icon: "📏", desc: "수위계 신규 설치 및 위치 정비" },
          { key: "anemometer", name: "풍향풍속계 설치", targetCount: 23, owner: "공통", icon: "💨", desc: "기상 풍황 관측 센서 설치" }
        ]
      },
      {
        category: "🪧 현장표지",
        tasks: [
          { key: "infoBoard", name: "관측소 현황판 설치", targetCount: 101, owner: "공통", icon: "🪧", desc: "시설 안내 현황판 제작 및 부착" },
          { key: "signNakdong", name: "점용표지판 (낙동강)", targetCount: 34, owner: "낙동강", icon: "🚩", desc: "낙동강 하천점용허가 표지판" },
          { key: "signYeongsan", name: "점용표지판 (영산강)", targetCount: 20, owner: "영산강", icon: "🚩", desc: "영산강 하천점용허가 표지판" }
        ]
      },
      {
        category: "📹 영상 · 감시",
        tasks: [
          { key: "cctvWired", name: "CCTV 유선 연결", targetCount: 104, owner: "공통", icon: "📹", desc: "안정적 영상 전송 유선망 결선" },
          { key: "cctvNew", name: "CCTV 신규 설치", targetCount: 13, owner: "공통", icon: "🎥", desc: "신규 모니터링 카메라 설치" },
          { key: "nvr", name: "NVR(녹화기) 설치", targetCount: 11, owner: "공통", icon: "📼", desc: "현장 영상 녹화 저장장치 구축" }
        ]
      }
    ];

    // Flat list for easy lookup
    this.taskDefinitions = this.taskGroups.flatMap(g => g.tasks.map(t => ({ ...t, category: g.category })));
  }

  init() {
    this.bindEvents();
    this.renderTaskOverview();
    this.renderMaintenanceTable();
  }

  bindEvents() {
    const searchInput = document.getElementById("maint-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        this.renderMaintenanceTable();
      });
    }

    const regionSelect = document.getElementById("maint-filter-region");
    if (regionSelect) {
      regionSelect.addEventListener("change", (e) => {
        this.selectedRegion = e.target.value;
        this.renderMaintenanceTable();
      });
    }

    const statusSelect = document.getElementById("maint-filter-status");
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => {
        this.selectedStatus = e.target.value;
        this.renderMaintenanceTable();
      });
    }
  }

  getTaskProgress(taskKey) {
    const stations = window.dataManager.getAll();
    let needed = 0;
    let completed = 0;

    stations.forEach(s => {
      if (s.maintenance && s.maintenance.tasks) {
        const val = s.maintenance.tasks[taskKey];
        const isNeeded = (typeof val === "boolean" && val) || (typeof val === "string" && val !== "");
        if (isNeeded) {
          needed++;
          if (s.maintenance.completedTasks && s.maintenance.completedTasks[taskKey]?.completed) {
            completed++;
          }
        }
      }
    });

    return { needed, completed, pct: needed > 0 ? Math.round((completed / needed) * 100) : 0 };
  }

  renderTaskOverview() {
    const container = document.getElementById("maint-task-grid");
    if (!container) return;

    let grandNeeded = 0;
    let grandCompleted = 0;

    container.innerHTML = this.taskDefinitions.map(t => {
      const isSelected = this.selectedTaskKey === t.key;
      const prog = this.getTaskProgress(t.key);
      grandNeeded += prog.needed;
      grandCompleted += prog.completed;

      const ownerBadge = t.owner.includes("RNS") 
        ? `<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:700;">용역사 (RNS)</span>`
        : (t.owner.includes("기술원") 
          ? `<span class="badge" style="background:#eff6ff; color:#1e40af; font-weight:700;">기술원 (자체)</span>`
          : `<span class="badge badge-gray">${t.owner}</span>`);

      return `
        <div class="maint-task-card ${isSelected ? "active" : ""}" onclick="window.maintenanceManager.filterByTask('${t.key}')">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.35rem;">
            <div style="font-size:1.3rem;">${t.icon}</div>
            <div>${ownerBadge}</div>
          </div>
          <div style="font-size:0.9rem; font-weight:700; color:#1e293b; line-height:1.25;">${t.name}</div>
          <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">${t.desc}</div>
          
          <div class="maint-progress-bar-bg" style="margin-top:0.6rem;">
            <div class="maint-progress-bar-fill" style="width:${prog.pct}%;"></div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:0.45rem; font-size:0.75rem; color:#64748b;">
            <span>진행률: <b style="color:${prog.pct === 100 ? "#059669" : "#1e40af"};">${prog.pct}%</b></span>
            <span><b>${prog.completed}</b> / ${prog.needed}개소</span>
          </div>
        </div>
      `;
    }).join("");

    // Update overall top KPIs
    const totalTasksEl = document.getElementById("kpi-maint-total-tasks");
    if (totalTasksEl) {
      totalTasksEl.textContent = `${grandNeeded}건`;
    }

    const totalProgEl = document.getElementById("kpi-maint-overall-prog");
    if (totalProgEl) {
      const overallPct = grandNeeded > 0 ? Math.round((grandCompleted / grandNeeded) * 100) : 0;
      totalProgEl.textContent = `${overallPct}% (${grandCompleted}/${grandNeeded}건 완료)`;
    }
  }

  filterByTask(taskKey) {
    if (this.selectedTaskKey === taskKey) {
      this.selectedTaskKey = "all";
    } else {
      this.selectedTaskKey = taskKey;
    }
    this.renderTaskOverview();
    this.renderMaintenanceTable();
  }

  renderMaintenanceTable() {
    const stations = window.dataManager.getAll();
    const tbody = document.getElementById("maint-table-body");
    const countEl = document.getElementById("maint-table-count");
    const selectedTaskTitleEl = document.getElementById("maint-selected-task-title");

    if (!tbody) return;

    let filtered = stations.filter(s => s.maintenance && s.maintenance.hasMaintData);

    // 1. Filter by Region
    if (this.selectedRegion !== "all") {
      filtered = filtered.filter(s => s.region && s.region.includes(this.selectedRegion));
    }

    // 2. Filter by Selected Task
    if (this.selectedTaskKey !== "all") {
      const taskDef = this.taskDefinitions.find(t => t.key === this.selectedTaskKey);
      if (selectedTaskTitleEl && taskDef) {
        selectedTaskTitleEl.innerHTML = `<span style="color:#1e40af;">[${taskDef.icon} ${taskDef.name}]</span> 조치 대상 지점 목록`;
      }

      filtered = filtered.filter(s => {
        const tVal = s.maintenance.tasks[this.selectedTaskKey];
        return (typeof tVal === "boolean" && tVal) || (typeof tVal === "string" && tVal !== "");
      });
    } else {
      if (selectedTaskTitleEl) {
        selectedTaskTitleEl.textContent = `전체 ${filtered.length}개 운영 지점 유지관리 과업 현황`;
      }
    }

    // 3. Filter by Search Term
    if (this.searchTerm) {
      filtered = filtered.filter(s => {
        const name = (s.name || "").toLowerCase();
        const river = (s.river || "").toLowerCase();
        const addr = (s.address || "").toLowerCase();
        const code = String(s.code || "").toLowerCase();
        return name.includes(this.searchTerm) || river.includes(this.searchTerm) || addr.includes(this.searchTerm) || code.includes(this.searchTerm);
      });
    }

    // 4. Filter by Completion Status
    if (this.selectedStatus === "pending") {
      filtered = filtered.filter(s => {
        const tasks = s.maintenance.tasks || {};
        const completed = s.maintenance.completedTasks || {};
        return Object.keys(tasks).some(k => {
          const isNeeded = (typeof tasks[k] === "boolean" && tasks[k]) || (typeof tasks[k] === "string" && tasks[k] !== "");
          return isNeeded && (!completed[k] || !completed[k].completed);
        });
      });
    } else if (this.selectedStatus === "done") {
      filtered = filtered.filter(s => {
        const tasks = s.maintenance.tasks || {};
        const completed = s.maintenance.completedTasks || {};
        const neededKeys = Object.keys(tasks).filter(k => (typeof tasks[k] === "boolean" && tasks[k]) || (typeof tasks[k] === "string" && tasks[k] !== ""));
        return neededKeys.length > 0 && neededKeys.every(k => completed[k] && completed[k].completed);
      });
    }

    if (countEl) countEl.textContent = filtered.length;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2.5rem; color:#94a3b8;">검색 및 필터 조건에 해당하는 유지관리 대상 지점이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((st, idx) => {
      const m = st.maintenance || {};
      const tasks = m.tasks || {};
      const completed = m.completedTasks || {};

      const taskChips = [];
      const renderChip = (key, icon, shortName, isRNS = false, isKIHS = false) => {
        const val = tasks[key];
        const isNeeded = (typeof val === "boolean" && val) || (typeof val === "string" && val !== "");
        if (isNeeded) {
          const isDone = !!(completed[key] && completed[key].completed);
          let styleClass = isDone ? "badge badge-green" : (isRNS ? "badge" : (isKIHS ? "badge badge-blue" : "badge badge-amber"));
          let inlineStyle = (!isDone && isRNS) ? 'style="background:#fef3c7; color:#92400e; font-weight:700;"' : '';
          taskChips.push(`<span class="${styleClass}" ${inlineStyle} title="${shortName}: ${isDone ? "완료" : "미조치"}">${icon} ${shortName} ${isDone ? "✓" : ""}</span>`);
        }
      };

      renderChip("breaker", "⚡", "차단기");
      renderChip("battery", "🔋", "배터리");
      renderChip("solar", "☀️", "태양광");
      renderChip("extinguisherRNS", "🧯", "소화기(RNS)", true);
      renderChip("extinguisherKIHS", "🧯", "소화기(기술원)", false, true);
      renderChip("infoBoard", "🪧", "현황판");
      renderChip("signNakdong", "🚩", "표지판(낙동)");
      renderChip("signYeongsan", "🚩", "표지판(영산)");
      renderChip("cctvWired", "📹", "CCTV유선");
      renderChip("cctvNew", "🎥", "CCTV신규");
      renderChip("osUpgrade", "💻", `OS`);
      renderChip("dualGaugeUpdate", "🌊", `유속계`);
      renderChip("dpConverter", "🔌", "DP");

      // Custom tasks chips
      if (Array.isArray(m.customTasks)) {
        m.customTasks.forEach(ct => {
          if (ct.name) {
            const isDone = ct.status === "completed";
            taskChips.push(`<span class="badge ${isDone ? "badge-green" : "badge-purple"}" title="${ct.name}: ${isDone ? "완료" : "미조치"}">📌 ${ct.name} ${isDone ? "✓" : ""}</span>`);
          }
        });
      }

      const neededCount = Object.keys(tasks).filter(k => (typeof tasks[k] === "boolean" && tasks[k]) || (typeof tasks[k] === "string" && tasks[k] !== "")).length + (m.customTasks ? m.customTasks.length : 0);
      const doneCount = Object.keys(tasks).filter(k => completed[k] && completed[k].completed).length + (m.customTasks ? m.customTasks.filter(ct => ct.status === "completed").length : 0);

      const regionBadgeClass = st.region?.includes("한강") ? "badge-blue" :
                              (st.region?.includes("낙동강") ? "badge-amber" :
                              (st.region?.includes("금강") ? "badge-green" : "badge-purple"));

      const isAllDone = neededCount > 0 && doneCount >= neededCount;

      return `
        <tr onclick="window.modalManager.openDetail(${st.id})" style="${isAllDone ? "background-color:#f0fdf4;" : ""}">
          <td><b>${idx + 1}</b></td>
          <td><span class="badge ${regionBadgeClass}">${st.region || "-"}</span></td>
          <td><b>${st.river || "-"}</b></td>
          <td><span style="font-weight:700; color:#1e40af;">${st.name || "-"}</span></td>
          <td><span style="font-size:0.8rem; color:#475569;">${m.stationType || "-"} / ${m.mountType || "-"}</span></td>
          <td>
            <div style="font-size:0.85rem; font-weight:700;">
              <span style="color:${isAllDone ? "#059669" : "#b91c1c"};">${doneCount}/${neededCount}건</span>
              ${isAllDone ? `<span class="badge badge-green" style="font-size:0.68rem; margin-left:2px;">완료</span>` : ""}
            </div>
          </td>
          <td>
            <div style="display:flex; flex-wrap:wrap; gap:0.25rem; max-width:420px;">
              ${taskChips.length > 0 ? taskChips.join("") : `<span style="color:#94a3b8; font-size:0.75rem;">과업 없음</span>`}
            </div>
          </td>
          <td>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.maintenanceManager.openMaintEditModal(${st.id})" style="font-size:0.75rem; padding:3px 8px;">✏️ 과업수정</button>
              <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); window.modalManager.openDetail(${st.id})" style="font-size:0.75rem; padding:3px 8px;">상세</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // ==========================================
  // DIRECT MAINTENANCE TASK EDIT MODAL SYSTEM
  // ==========================================

  openMaintEditModal(stationId = null) {
    const allStations = window.dataManager.getAll();
    if (!allStations || allStations.length === 0) {
      alert("관측시설 목록을 불러올 수 없습니다.");
      return;
    }

    // 1. Determine editing station
    let targetId = stationId;
    if (!targetId) {
      const firstWithMaint = allStations.find(s => s.maintenance && s.maintenance.hasMaintData);
      targetId = firstWithMaint ? firstWithMaint.id : allStations[0].id;
    }
    this.editingStationId = targetId;

    // 2. Populate Station Selector Dropdown
    const selectEl = document.getElementById("maint-edit-station-select");
    if (selectEl) {
      // Group stations by Region
      const regions = ["한강", "낙동강", "금강", "영산강·섬진강", "기타"];
      selectEl.innerHTML = regions.map(reg => {
        const list = allStations.filter(s => (s.region || "").includes(reg.slice(0, 2)));
        if (list.length === 0) return "";
        const options = list.map(s => {
          const isSel = String(s.id) === String(targetId) ? "selected" : "";
          const codeStr = s.code ? ` (${s.code})` : "";
          const riverStr = s.river ? ` - ${s.river}` : "";
          return `<option value="${s.id}" ${isSel}>${s.name}${riverStr}${codeStr}</option>`;
        }).join("");
        return `<optgroup label="🌊 ${reg}권역 (${list.length}개소)">${options}</optgroup>`;
      }).join("");
    }

    // 3. Load station maintenance state
    this.loadStationMaintenanceState(targetId);

    // 4. Open Modal
    const modal = document.getElementById("maint-task-modal");
    if (modal) modal.classList.add("active");
  }

  closeMaintEditModal() {
    const modal = document.getElementById("maint-task-modal");
    if (modal) modal.classList.remove("active");
    this.editingStationId = null;
    this.tempMaintenanceState = null;
  }

  onStationSelectChange(stationId) {
    this.editingStationId = stationId;
    this.loadStationMaintenanceState(stationId);
  }

  loadStationMaintenanceState(stationId) {
    const st = window.dataManager.getById(stationId);
    if (!st) return;

    // Clone or initialize maintenance object
    const maint = JSON.parse(JSON.stringify(st.maintenance || {}));
    if (!maint.tasks) maint.tasks = {};
    if (!maint.completedTasks) maint.completedTasks = {};
    if (!Array.isArray(maint.customTasks)) maint.customTasks = [];

    this.tempMaintenanceState = maint;

    // Update Subtitle
    const titleEl = document.getElementById("maint-modal-title");
    const subEl = document.getElementById("maint-modal-sub");
    if (titleEl) titleEl.textContent = `🛠️ 유지관리 과업 직접 입력 및 편집 - ${st.name}`;
    if (subEl) subEl.textContent = `관할: ${st.region || "-"} | 하천: ${st.river || "-"} | 코드: ${st.code || "미부여"} | 유속계: ${st.gaugeType || "-"}`;

    // Render 18 Task Group Form
    this.renderTaskEditGroups();

    // Render Custom Tasks
    this.renderCustomTasks();

    // Update Summary Header
    this.updateModalSummaryStats();
  }

  renderTaskEditGroups() {
    const container = document.getElementById("maint-task-form-container");
    if (!container || !this.tempMaintenanceState) return;

    const tasks = this.tempMaintenanceState.tasks || {};
    const completed = this.tempMaintenanceState.completedTasks || {};

    const today = new Date().toISOString().slice(0, 10);

    container.innerHTML = this.taskGroups.map(group => {
      const taskRowsHtml = group.tasks.map(t => {
        const isNeeded = (typeof tasks[t.key] === "boolean" && tasks[t.key]) || (typeof tasks[t.key] === "string" && tasks[t.key] !== "");
        const compInfo = completed[t.key] || {};
        const isDone = !!compInfo.completed;
        const doneDate = compInfo.completedDate || (isDone ? today : "");
        const owner = compInfo.user || t.owner || "공통";
        const note = compInfo.note || "";

        return `
          <div class="maint-task-edit-row ${isNeeded ? "selected" : ""} ${isDone ? "completed" : ""}" id="maint-row-${t.key}">
            <div class="maint-task-edit-top">
              <label style="display:flex; align-items:center; gap:0.5rem; font-weight:700; color:#1e293b; cursor:pointer; font-size:0.88rem;">
                <input type="checkbox" id="chk-task-${t.key}" ${isNeeded ? "checked" : ""} 
                       onchange="window.maintenanceManager.onTaskNeededToggle('${t.key}', this.checked)"
                       style="width:16px; height:16px; accent-color:#2563eb; cursor:pointer;">
                <span>${t.icon} ${t.name}</span>
                <span style="font-size:0.75rem; color:#64748b; font-weight:normal;">(${t.desc})</span>
              </label>

              <div style="display:flex; align-items:center; gap:6px;">
                <span class="badge badge-gray" style="font-size:0.72rem;">기본주체: ${t.owner}</span>
                <span id="badge-status-${t.key}" class="badge ${isDone ? "badge-green" : (isNeeded ? "badge-amber" : "badge-gray")}" style="font-size:0.75rem;">
                  ${isDone ? "✅ 조치완료" : (isNeeded ? "⏳ 조치대기" : "미대상")}
                </span>
              </div>
            </div>

            <div class="maint-task-edit-fields" id="fields-${t.key}" style="display:${isNeeded ? "grid" : "none"};">
              <div>
                <label style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">조치 상태</label>
                <select id="status-task-${t.key}" class="form-select" style="font-size:0.78rem; padding:4px 6px;" onchange="window.maintenanceManager.onTaskStatusChange('${t.key}', this.value)">
                  <option value="pending" ${!isDone ? "selected" : ""}>⏳ 조치대기</option>
                  <option value="completed" ${isDone ? "selected" : ""}>✅ 조치완료</option>
                </select>
              </div>

              <div>
                <label style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">완료 일자</label>
                <input type="date" id="date-task-${t.key}" class="form-input" style="font-size:0.78rem; padding:4px 6px;" value="${doneDate}">
              </div>

              <div>
                <label style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">수행 주체 / 작업자</label>
                <input type="text" id="owner-task-${t.key}" class="form-input" style="font-size:0.78rem; padding:4px 6px;" value="${owner}" placeholder="예: 용역사(RNS), 자체">
              </div>

              <div>
                <label style="font-size:0.72rem; color:#64748b; display:block; margin-bottom:2px;">조치 내용 및 비고</label>
                <input type="text" id="note-task-${t.key}" class="form-input" style="font-size:0.78rem; padding:4px 6px;" value="${note}" placeholder="조치 세부내용, 교체 품목 등">
              </div>
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="maint-edit-category">
          <div class="maint-edit-category-header">
            <span>${group.category}</span>
            <span style="font-size:0.75rem; color:#64748b; font-weight:normal;">총 ${group.tasks.length}개 과업 항목</span>
          </div>
          <div>
            ${taskRowsHtml}
          </div>
        </div>
      `;
    }).join("");
  }

  onTaskNeededToggle(taskKey, isChecked) {
    if (!this.tempMaintenanceState) return;

    this.tempMaintenanceState.tasks[taskKey] = isChecked;

    const row = document.getElementById(`maint-row-${taskKey}`);
    const fields = document.getElementById(`fields-${taskKey}`);
    const badge = document.getElementById(`badge-status-${taskKey}`);

    if (row) row.classList.toggle("selected", isChecked);
    if (fields) fields.style.display = isChecked ? "grid" : "none";

    if (!isChecked) {
      if (this.tempMaintenanceState.completedTasks[taskKey]) {
        delete this.tempMaintenanceState.completedTasks[taskKey];
      }
      if (row) row.classList.remove("completed");
      if (badge) {
        badge.className = "badge badge-gray";
        badge.textContent = "미대상";
      }
    } else {
      const isDone = !!this.tempMaintenanceState.completedTasks[taskKey]?.completed;
      if (badge) {
        badge.className = isDone ? "badge badge-green" : "badge badge-amber";
        badge.textContent = isDone ? "✅ 조치완료" : "⏳ 조치대기";
      }
    }

    this.updateModalSummaryStats();
  }

  onTaskStatusChange(taskKey, statusVal) {
    if (!this.tempMaintenanceState) return;

    const isDone = statusVal === "completed";
    const today = new Date().toISOString().slice(0, 10);
    const dateInput = document.getElementById(`date-task-${taskKey}`);
    const ownerInput = document.getElementById(`owner-task-${taskKey}`);
    const noteInput = document.getElementById(`note-task-${taskKey}`);
    const row = document.getElementById(`maint-row-${taskKey}`);
    const badge = document.getElementById(`badge-status-${taskKey}`);

    if (isDone) {
      if (dateInput && !dateInput.value) dateInput.value = today;
      this.tempMaintenanceState.completedTasks[taskKey] = {
        completed: true,
        completedDate: dateInput?.value || today,
        user: ownerInput?.value || "관리자",
        note: noteInput?.value || ""
      };
      if (row) row.classList.add("completed");
      if (badge) {
        badge.className = "badge badge-green";
        badge.textContent = "✅ 조치완료";
      }
    } else {
      delete this.tempMaintenanceState.completedTasks[taskKey];
      if (row) row.classList.remove("completed");
      if (badge) {
        badge.className = "badge badge-amber";
        badge.textContent = "⏳ 조치대기";
      }
    }

    this.updateModalSummaryStats();
  }

  renderCustomTasks() {
    const listEl = document.getElementById("maint-custom-tasks-list");
    if (!listEl || !this.tempMaintenanceState) return;

    const customTasks = this.tempMaintenanceState.customTasks || [];
    if (customTasks.length === 0) {
      listEl.innerHTML = `<div style="text-align:center; padding:1rem; color:#94a3b8; font-size:0.8rem;">등록된 추가 사용자 정의 과업이 없습니다. (+ 신규 과업 추가 버튼으로 추가 가능)</div>`;
      return;
    }

    listEl.innerHTML = customTasks.map((ct, idx) => {
      const isDone = ct.status === "completed";
      return `
        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; background:#ffffff; border:1px solid #e2e8f0; padding:6px 10px; border-radius:6px;">
          <input type="text" class="form-input" style="flex:2; min-width:140px; font-size:0.8rem;" value="${ct.name || ""}" placeholder="과업명 (예: 철탑 도색, 울타리 보수)" oninput="window.maintenanceManager.onCustomTaskChange(${idx}, 'name', this.value)">
          
          <select class="form-select" style="flex:1; min-width:110px; font-size:0.78rem;" onchange="window.maintenanceManager.onCustomTaskChange(${idx}, 'status', this.value)">
            <option value="pending" ${!isDone ? "selected" : ""}>⏳ 대기</option>
            <option value="completed" ${isDone ? "selected" : ""}>✅ 완료</option>
          </select>

          <input type="date" class="form-input" style="flex:1; min-width:120px; font-size:0.78rem;" value="${ct.date || ""}" onchange="window.maintenanceManager.onCustomTaskChange(${idx}, 'date', this.value)">

          <input type="text" class="form-input" style="flex:1; min-width:110px; font-size:0.78rem;" value="${ct.owner || ""}" placeholder="담당자" oninput="window.maintenanceManager.onCustomTaskChange(${idx}, 'owner', this.value)">

          <input type="text" class="form-input" style="flex:2; min-width:140px; font-size:0.8rem;" value="${ct.note || ""}" placeholder="비고 / 조치내용" oninput="window.maintenanceManager.onCustomTaskChange(${idx}, 'note', this.value)">

          <button type="button" class="btn btn-outline btn-sm" style="color:#dc2626; border-color:#fca5a5; padding:2px 6px;" onclick="window.maintenanceManager.removeCustomTask(${idx})">✕</button>
        </div>
      `;
    }).join("");
  }

  addCustomTaskRow() {
    if (!this.tempMaintenanceState) return;
    if (!Array.isArray(this.tempMaintenanceState.customTasks)) {
      this.tempMaintenanceState.customTasks = [];
    }
    this.tempMaintenanceState.customTasks.push({
      name: "",
      status: "pending",
      date: "",
      owner: "관리자",
      note: ""
    });
    this.renderCustomTasks();
    this.updateModalSummaryStats();
  }

  onCustomTaskChange(idx, field, val) {
    if (!this.tempMaintenanceState || !this.tempMaintenanceState.customTasks[idx]) return;
    this.tempMaintenanceState.customTasks[idx][field] = val;
    this.updateModalSummaryStats();
  }

  removeCustomTask(idx) {
    if (!this.tempMaintenanceState || !this.tempMaintenanceState.customTasks) return;
    this.tempMaintenanceState.customTasks.splice(idx, 1);
    this.renderCustomTasks();
    this.updateModalSummaryStats();
  }

  clearAllTasks() {
    if (!confirm("현재 지점의 모든 18종 과업 대상을 해제하시겠습니까?")) return;
    if (!this.tempMaintenanceState) return;

    this.taskDefinitions.forEach(t => {
      this.tempMaintenanceState.tasks[t.key] = false;
      delete this.tempMaintenanceState.completedTasks[t.key];
    });

    this.renderTaskEditGroups();
    this.updateModalSummaryStats();
  }

  selectRecommendedTasks() {
    if (!this.tempMaintenanceState) return;
    // Standard basic package: dpConverter, breaker, infoBoard, cctvWired, osUpgrade
    const recommendedKeys = ["dpConverter", "breaker", "infoBoard", "cctvWired", "osUpgrade", "extinguisherRNS"];
    recommendedKeys.forEach(k => {
      this.tempMaintenanceState.tasks[k] = true;
    });
    this.renderTaskEditGroups();
    this.updateModalSummaryStats();
  }

  updateModalSummaryStats() {
    if (!this.tempMaintenanceState) return;

    let needed = 0;
    let done = 0;

    this.taskDefinitions.forEach(t => {
      const isNeeded = !!document.getElementById(`chk-task-${t.key}`)?.checked;
      if (isNeeded) {
        needed++;
        const statusVal = document.getElementById(`status-task-${t.key}`)?.value;
        if (statusVal === "completed") done++;
      }
    });

    if (Array.isArray(this.tempMaintenanceState.customTasks)) {
      this.tempMaintenanceState.customTasks.forEach(ct => {
        if (ct.name && ct.name.trim().length > 0) {
          needed++;
          if (ct.status === "completed") done++;
        }
      });
    }

    const pct = needed > 0 ? Math.round((done / needed) * 100) : 0;

    const countEl = document.getElementById("maint-edit-summary-count");
    const badgeEl = document.getElementById("maint-edit-summary-badge");
    const barEl = document.getElementById("maint-edit-prog-bar");

    if (countEl) countEl.innerHTML = `조치 필요 과업: <b style="color:#1e40af;">총 ${needed}건</b> (${done}건 조치완료)`;
    if (barEl) barEl.style.width = `${pct}%`;
    if (badgeEl) {
      if (needed === 0) {
        badgeEl.className = "badge badge-gray";
        badgeEl.textContent = "과업 없음";
      } else if (done >= needed) {
        badgeEl.className = "badge badge-green";
        badgeEl.textContent = "✅ 전 과업 완료 (100%)";
      } else {
        badgeEl.className = "badge badge-amber";
        badgeEl.textContent = `진행률 ${pct}% (${done}/${needed}건)`;
      }
    }
  }

  async saveMaintEditModal() {
    if (!this.editingStationId || !this.tempMaintenanceState) return;

    const st = window.dataManager.getById(this.editingStationId);
    if (!st) return;

    // Collect DOM values
    const newTasks = {};
    const newCompleted = {};

    this.taskDefinitions.forEach(t => {
      const isNeeded = !!document.getElementById(`chk-task-${t.key}`)?.checked;
      newTasks[t.key] = isNeeded;

      if (isNeeded) {
        const statusVal = document.getElementById(`status-task-${t.key}`)?.value;
        const isDone = statusVal === "completed";
        if (isDone) {
          const dateVal = document.getElementById(`date-task-${t.key}`)?.value || new Date().toISOString().slice(0, 10);
          const ownerVal = document.getElementById(`owner-task-${t.key}`)?.value.trim() || t.owner;
          const noteVal = document.getElementById(`note-task-${t.key}`)?.value.trim() || "";

          newCompleted[t.key] = {
            completed: true,
            completedDate: dateVal,
            user: ownerVal,
            note: noteVal
          };
        }
      }
    });

    // Clean custom tasks
    const cleanCustom = (this.tempMaintenanceState.customTasks || []).filter(ct => ct.name && ct.name.trim().length > 0);

    const payload = {
      hasMaintData: true,
      tasks: newTasks,
      completedTasks: newCompleted,
      customTasks: cleanCustom,
      stationType: this.tempMaintenanceState.stationType || st.shelterType || "-",
      mountType: this.tempMaintenanceState.mountType || st.mountType || "-"
    };

    try {
      await window.dataManager.updateStationMaintenance(this.editingStationId, payload);
      window.app.showToast(`[${st.name}] 유지관리 과업이 성공적으로 저장되었습니다.`, "success");
      this.closeMaintEditModal();
      window.app.refreshAll();
    } catch (e) {
      console.error("Save maintenance error:", e);
      alert("유지관리 과업 저장 중 오류가 발생했습니다: " + e.message);
    }
  }
}

window.maintenanceManager = new MaintenanceManager();
