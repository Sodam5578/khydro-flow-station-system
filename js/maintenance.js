/**
 * MaintenanceManager
 * Handles 2026 Maintenance Task Oversight & Monitoring for Administrators with Progress Bars & Status Filters.
 */
class MaintenanceManager {
  constructor() {
    this.selectedTaskKey = "all";
    this.selectedRegion = "all";
    this.selectedStatus = "all"; // all, pending, done
    this.searchTerm = "";
    this.taskDefinitions = [
      // 1. Power & Electrical Safety
      { key: "breaker", name: "자동복구 누전차단기", targetCount: 101, owner: "공통", category: "전원·안전", icon: "⚡", desc: "원격 자동 복구 차단기 설치" },
      { key: "battery", name: "노후 배터리 교체", targetCount: 27, owner: "공통", category: "전원·안전", icon: "🔋", desc: "수명 만료 백업 배터리 교체" },
      { key: "solar", name: "태양광 설비 정비", targetCount: 40, owner: "공통", category: "전원·안전", icon: "☀️", desc: "독립전원 패널 및 컨트롤러 정비" },
      { key: "extinguisherRNS", name: "소화기 비치 (용역사)", targetCount: 75, owner: "용역사(RNS)", category: "전원·안전", icon: "🧯", desc: "리버앤씨(RNS) 소화기 비치 대상" },
      { key: "extinguisherKIHS", name: "소화기 비치 (기술원)", targetCount: 6, owner: "기술원(자체)", category: "전원·안전", icon: "🧯", desc: "한국수자원조사기술원 자체 비치" },
      
      // 2. Data & Communication
      { key: "dpConverter", name: "DP컨버터 교체/설치", targetCount: 176, owner: "공통", category: "통신·데이터", icon: "🔌", desc: "전 지점 신규 DP컨버터 적용" },
      { key: "osUpgrade", name: "OS 업그레이드", targetCount: 97, owner: "공통", category: "통신·데이터", icon: "💻", desc: "로거/센더 펌웨어 및 OS 현행화" },
      { key: "logger", name: "Logger(로거) 교체", targetCount: 24, owner: "공통", category: "통신·데이터", icon: "📟", desc: "노후 수집 로거 신규 교체" },
      { key: "sender", name: "Sender(센더) 교체", targetCount: 21, owner: "공통", category: "통신·데이터", icon: "📡", desc: "데이터 전송 센더 교체" },
      { key: "rvBox", name: "RV박스 정비/교체", targetCount: 39, owner: "공통", category: "통신·데이터", icon: "📦", desc: "외함 내 RV박스 정비" },

      // 3. Sensor & Measurement
      { key: "dualGaugeUpdate", name: "유속계(2대) 현행화", targetCount: 22, owner: "공통", category: "센서·계측", icon: "🌊", desc: "CM600/CM1200 복합 운영 현행화" },
      { key: "waterLevelGauge", name: "수위계 신설/정비", targetCount: 13, owner: "공통", category: "센서·계측", icon: "📏", desc: "수위계 신규 설치 및 위치 정비" },
      { key: "anemometer", name: "풍향풍속계 설치", targetCount: 23, owner: "공통", category: "센서·계측", icon: "💨", desc: "기상 풍황 관측 센서 설치" },

      // 4. Infrastructure & Signs
      { key: "infoBoard", name: "관측소 현황판 설치", targetCount: 101, owner: "공통", category: "현장표지", icon: "🪧", desc: "시설 안내 현황판 제작 및 부착" },
      { key: "signNakdong", name: "점용표지판 (낙동강)", targetCount: 34, owner: "낙동강", category: "현장표지", icon: "🚩", desc: "낙동강 하천점용허가 표지판" },
      { key: "signYeongsan", name: "점용표지판 (영산강)", targetCount: 20, owner: "영산강", category: "현장표지", icon: "🚩", desc: "영산강 하천점용허가 표지판" },

      // 5. Video Monitoring
      { key: "cctvWired", name: "CCTV 유선 연결", targetCount: 104, owner: "공통", category: "영상·감시", icon: "📹", desc: "안정적 영상 전송 유선망 결선" },
      { key: "cctvNew", name: "CCTV 신규 설치", targetCount: 13, owner: "공통", category: "영상·감시", icon: "🎥", desc: "신규 모니터링 카메라 설치" },
      { key: "nvr", name: "NVR(녹화기) 설치", targetCount: 11, owner: "공통", category: "영상·감시", icon: "📼", desc: "현장 영상 녹화 저장장치 구축" }
    ];
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
        selectedTaskTitleEl.textContent = "전체 176개 운영 지점 유지관리 과업 현황";
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

    tbody.innerHTML = filtered.map(st => {
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

      const neededCount = Object.keys(tasks).filter(k => (typeof tasks[k] === "boolean" && tasks[k]) || (typeof tasks[k] === "string" && tasks[k] !== "")).length;
      const doneCount = Object.keys(tasks).filter(k => completed[k] && completed[k].completed).length;

      const regionBadgeClass = st.region?.includes("한강") ? "badge-blue" :
                              (st.region?.includes("낙동강") ? "badge-amber" :
                              (st.region?.includes("금강") ? "badge-green" : "badge-purple"));

      const isAllDone = neededCount > 0 && doneCount >= neededCount;

      return `
        <tr onclick="window.modalManager.openDetail(${st.id})" style="${isAllDone ? "background-color:#f0fdf4;" : ""}">
          <td><b>${st.seq || "-"}</b></td>
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
              ${taskChips.join("")}
            </div>
          </td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); window.modalManager.openDetail(${st.id})">상세관리</button>
          </td>
        </tr>
      `;
    }).join("");
  }
}

window.maintenanceManager = new MaintenanceManager();
