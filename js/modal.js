/**
 * ModalManager
 * Handles Detail View, Edit Form, Add Station, and Delete Confirm modals with Interactive Completion Toggle
 * and Real-Time Bidirectional DMS <-> Decimal Coordinate Synchronization.
 */
class ModalManager {
  constructor() {
    this.currentStationId = null;
    this.isSyncingCoords = false;
  }

  init() {
    this.bindCoordSyncEvents();
  }

  // --- Coordinate Conversion Utilities ---
  dmsToDecimal(dmsStr) {
    if (!dmsStr) return null;
    const clean = String(dmsStr).replace(/[^0-9.\-+]/g, " ").trim();
    const parts = clean.split(/\s+/).filter(Boolean).map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const deg = Math.abs(parts[0]);
      const min = parts[1];
      const sec = parts[2] || 0;
      let dd = deg + (min / 60) + (sec / 3600);
      if (parts[0] < 0 || String(dmsStr).includes("S") || String(dmsStr).includes("W")) dd = -dd;
      return parseFloat(dd.toFixed(6));
    }
    return null;
  }

  decimalToDms(dd) {
    if (isNaN(dd) || dd === null || dd === "") return "";
    const val = Math.abs(parseFloat(dd));
    const d = Math.floor(val);
    const mFloat = (val - d) * 60;
    const m = Math.floor(mFloat);
    const s = ((mFloat - m) * 60).toFixed(1);
    const sign = parseFloat(dd) < 0 ? "-" : "";
    return sign + d + "-" + String(m).padStart(2, "0") + "-" + String(parseFloat(s) < 10 ? "0" + s : s);
  }

  bindCoordSyncEvents() {
    // 1. Latitude DMS -> Decimal
    const latDmsInput = document.getElementById("form-lat-dms");
    const latDecInput = document.getElementById("form-lat");
    if (latDmsInput && latDecInput) {
      latDmsInput.addEventListener("input", () => {
        if (this.isSyncingCoords) return;
        this.isSyncingCoords = true;
        const dd = this.dmsToDecimal(latDmsInput.value);
        if (dd !== null) latDecInput.value = dd;
        this.isSyncingCoords = false;
      });

      latDecInput.addEventListener("input", () => {
        if (this.isSyncingCoords) return;
        this.isSyncingCoords = true;
        const dms = this.decimalToDms(latDecInput.value);
        if (dms) latDmsInput.value = dms;
        this.isSyncingCoords = false;
      });
    }

    // 2. Longitude DMS -> Decimal
    const lonDmsInput = document.getElementById("form-lon-dms");
    const lonDecInput = document.getElementById("form-lon");
    if (lonDmsInput && lonDecInput) {
      lonDmsInput.addEventListener("input", () => {
        if (this.isSyncingCoords) return;
        this.isSyncingCoords = true;
        const dd = this.dmsToDecimal(lonDmsInput.value);
        if (dd !== null) lonDecInput.value = dd;
        this.isSyncingCoords = false;
      });

      lonDecInput.addEventListener("input", () => {
        if (this.isSyncingCoords) return;
        this.isSyncingCoords = true;
        const dms = this.decimalToDms(lonDecInput.value);
        if (dms) lonDmsInput.value = dms;
        this.isSyncingCoords = false;
      });
    }
  }

  openDetail(id) {
    const st = window.dataManager.getById(id);
    if (!st) return;

    this.currentStationId = id;
    const isDual = st.isDualGauge || st.gaugeCategory === "DUAL";

    const modalBody = document.getElementById("detail-modal-body");
    const modalTitle = document.getElementById("detail-modal-title");

    if (modalTitle) {
      modalTitle.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span>🌊 ${st.name || "-"}</span> 
          <span class="badge badge-blue">${st.region || "-"}권역</span>
          ${isDual ? `<span class="badge badge-purple" style="font-weight:700;">⚡ EWSV+ADVM 이중화</span>` : ""}
        </div>
      `;
    }

    if (modalBody) {
      this.renderDetailBody(st);
    }

    const modal = document.getElementById("detail-modal");
    if (modal) modal.classList.add("active");
  }

  renderDetailBody(st) {
    const modalBody = document.getElementById("detail-modal-body");
    if (!modalBody) return;

    const isDual = st.isDualGauge || st.gaugeCategory === "DUAL";
    const operatingHtml = st.isOperating2026 
      ? `<span class="badge badge-green">2026년 정상 운영</span>` 
      : `<span class="badge badge-gray">미운영 / 구축예정</span>`;

    const m = st.maintenance || {};
    const tasks = m.tasks || {};
    const completedTasks = m.completedTasks || {};

    const taskItems = [];
    const addTask = (key, name, owner, cat, icon) => {
      const val = tasks[key];
      const isNeeded = (typeof val === "boolean" && val) || (typeof val === "string" && val !== "");
      if (isNeeded) {
        const isDone = !!(completedTasks[key] && completedTasks[key].completed);
        const doneDate = isDone ? completedTasks[key].completedDate : "";
        const detailStr = (typeof val === "string" && val !== "O" && val !== "true") ? ` (${val})` : "";

        taskItems.push({
          key,
          name: name + detailStr,
          owner,
          cat,
          icon,
          isDone,
          doneDate
        });
      }
    };

    addTask("circuitBreaker", "자동복구 누전차단기", "공통", "전원·보안", "⚡");
    addTask("battery", "배터리 교체", "공통", "전원·보안", "🔋");
    addTask("solarPanel", "태양광 판넬 세척/보수", "공통", "전원·보안", "☀️");
    addTask("extinguisherRns", "소화기 비치 (RNS)", "용역사 (RNS)", "전원·보안", "🧯");
    addTask("extinguisherKihs", "소화기 비치 (기술원)", "한국수자원조사기술원", "전원·보안", "🏢");
    addTask("dpConverter", "DP 컨버터(단자대)", "공통", "신호·통신", "🔌");
    addTask("osUpgrade", "Windows 11 OS 업그레이드", "공통", "신호·통신", "💻");
    addTask("logger", "자료수집장치(Logger) 정비", "공통", "신호·통신", "📟");
    addTask("sender", "자료전송장치(Sender) 정비", "공통", "신호·통신", "📡");
    addTask("rvBox", "리모트뷰(RV) 박스 설치", "공통", "신호·통신", "🎛️");
    addTask("dualGaugeSync", "유속계 2대 현행화", "공통", "관측기기", "⚡");
    addTask("waterLevel", "수위계 점검/현행화", "공통", "관측기기", "📏");
    addTask("anemometer", "풍향풍속계 정비", "공통", "관측기기", "💨");
    addTask("statusBoard", "관측시설 현황판 정비", "공통", "시설·부대", "📋");
    addTask("signNakdong", "하천점용표지판 (낙동강)", "낙동강", "시설·부대", "🪧");
    addTask("signYeongsan", "하천점용표지판 (영산강)", "영산강", "시설·부대", "🪧");
    addTask("cctvWired", "CCTV 유선연결 정비", "공통", "영상·감시", "📹");
    addTask("cctvNew", "CCTV 신규 설치", "공통", "영상·감시", "🎥");
    addTask("nvr", "NVR(녹화기) 설치", "공통", "영상·감시", "📼");

    const totalTasks = taskItems.length;
    const completedCount = taskItems.filter(t => t.isDone).length;
    const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 100;

    let checklistHtml = "";
    if (totalTasks === 0) {
      checklistHtml = `<div style="padding:0.75rem; background:#f8fafc; border-radius:6px; color:#64748b; font-size:0.85rem;">현재 등록된 유지관리 조치 필요사항이 없습니다. (정상 상태)</div>`;
    } else {
      checklistHtml = `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.85rem; margin-bottom:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <div>
              <span style="font-size:0.85rem; font-weight:700; color:#1e293b;">🛠️ 2026년 유지관리 과업 조치 현황</span>
              <span style="font-size:0.75rem; color:#64748b; margin-left:6px;">(총 ${totalTasks}건 중 <b>${completedCount}건 조치완료</b>)</span>
            </div>
            <span class="badge ${progressPct === 100 ? "badge-green" : "badge-amber"}" style="font-size:0.8rem; font-weight:700;">추진율 ${progressPct}%</span>
          </div>

          <div class="maint-progress-bar-bg" style="margin-bottom:0.85rem;">
            <div class="maint-progress-bar-fill" style="width:${progressPct}%;"></div>
          </div>

          <div style="display:flex; flex-direction:column; gap:0.35rem; max-height:240px; overflow-y:auto; padding-right:4px;">
            ${taskItems.map(t => {
              const ownerBadge = t.owner.includes("RNS") 
                ? `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:0.7rem; font-weight:700;">용역사 (RNS)</span>`
                : (t.owner.includes("기술원") 
                  ? `<span class="badge" style="background:#eff6ff; color:#1e40af; font-size:0.7rem; font-weight:700;">기술원 (자체)</span>`
                  : `<span class="badge badge-gray" style="font-size:0.7rem;">${t.owner}</span>`);

              return `
                <div class="task-item-row ${t.isDone ? "done" : ""}">
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="checkbox" id="chk-${st.id}-${t.key}" ${t.isDone ? "checked" : ""} 
                           onchange="window.modalManager.toggleTask(${st.id}, '${t.key}', this.checked)" 
                           style="width:16px; height:16px; cursor:pointer; accent-color:#059669;">
                    <label for="chk-${st.id}-${t.key}" class="task-name" style="font-size:0.85rem; font-weight:600; cursor:pointer; user-select:none;">
                      <span>${t.icon}</span> <span>${t.name}</span>
                    </label>
                    ${ownerBadge}
                  </div>
                  <div>
                    ${t.isDone ? `<span class="badge badge-green" style="font-size:0.7rem;">완료 (${t.doneDate})</span>` : `<span class="badge badge-amber" style="font-size:0.7rem;">조치대기</span>`}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }

    const rvHtml = st.rvBoxInstalled === true ? `<span class="badge badge-green">✅ 설치완료</span>` : (st.rvBoxInstalled === false ? `<span class="badge badge-amber">⏳ 미설치 (과업대상)</span>` : `<span class="badge badge-gray">미운영/대상외</span>`);
    const agentsHtml = (st.rvBoxAgents && st.rvBoxAgents.length > 0) ? `<div style="font-size:0.72rem; color:#64748b; margin-top:2px;">${st.rvBoxAgents.join(", ")}</div>` : "";

    modalBody.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding:0.75rem 1rem; background:${isDual ? "#fdf4ff; border:1px solid #f0abfc;" : "#eff6ff; border:1px solid #bfdbfe;"} border-radius:8px;">
        <div>
          <div style="font-size:0.8rem; color:${isDual ? "#86198f" : "#1e40af"}; font-weight:600;">지점 관리코드</div>
          <div style="font-size:1.2rem; font-weight:800; color:${isDual ? "#701a75" : "#1e3a8a"};">${st.code || "미부여"}</div>
        </div>
        <div>${operatingHtml}</div>
      </div>

      <div class="detail-section-title">🛠️ 2026년 유지관리 과업 체크리스트 (관리자 상태 변경)</div>
      ${checklistHtml}

      <div class="detail-section-title">📍 시설 기본 제원 및 위치 정보</div>
      <table class="detail-table">
        <tr>
          <th>관할 권역</th><td>${st.region || "-"}</td>
          <th>하천명</th><td><b>${st.river || "-"}</b></td>
        </tr>
        <tr>
          <th>지점명</th><td><b>${st.name || "-"}</b></td>
          <th>위치(주소)</th><td>${st.address || "-"}</td>
        </tr>
        <tr>
          <th>경위도 (도분초)</th><td><b>${st.coords?.latDMS || "-"} / ${st.coords?.lonDMS || "-"}</b></td>
          <th>경위도 (십진수)</th><td>${st.coords?.lat || "-"}, ${st.coords?.lon || "-"}</td>
        </tr>
        <tr>
          <th>설치년도 / 개시년도</th>
          <td>${st.installYear || "-"}년 / ${st.obsStartYear || "-"}년</td>
          <th>유속계 형식</th>
          <td><b>${st.gaugeType || "-"}</b> (EWSV:${st.ewsvCount||"-"}, ADVM:${st.advmCount||"-"})</td>
        </tr>
        <tr>
          <th>RV박스 (리모트뷰)</th>
          <td>
            ${rvHtml}
            ${agentsHtml}
          </td>
          <th>수위계 설치 여부</th>
          <td>${m.waterLevelInstalled ? "설치됨 (" + (m.waterLevelPos||"") + ")" : "미설치"}</td>
        </tr>
        <tr>
          <th>특이사항 및 비고</th>
          <td colspan="3" style="color:#b91c1c; font-weight:600;">${st.memo || "특이사항 없음"}</td>
        </tr>
      </table>
    `;
  }

  toggleTask(stationId, taskKey, isChecked) {
    const updated = window.dataManager.toggleTaskCompletion(stationId, taskKey, isChecked);
    if (updated) {
      this.renderDetailBody(updated);
      window.app.refreshAll();
      window.app.showToast(isChecked ? "유지관리 과업이 [조치완료]로 기록되었습니다." : "과업 상태가 [조치대기]로 변경되었습니다.", isChecked ? "success" : "info");
    }
  }

  closeDetail() {
    const modal = document.getElementById("detail-modal");
    if (modal) modal.classList.remove("active");
  }

  openEdit(id) {
    this.closeDetail();
    const st = window.dataManager.getById(id);
    if (!st) return;

    this.currentStationId = id;

    const titleEl = document.getElementById("edit-modal-title");
    if (titleEl) titleEl.textContent = `관측시설 정보 수정 - ${st.name}`;

    document.getElementById("form-id").value = st.id;
    if (document.getElementById("form-seq")) document.getElementById("form-seq").value = st.seq || "";
    document.getElementById("form-region").value = st.region || "한강";
    document.getElementById("form-river").value = st.river || "";
    document.getElementById("form-name").value = st.name || "";
    document.getElementById("form-code").value = st.code || "";
    document.getElementById("form-address").value = st.address || "";
    document.getElementById("form-lat").value = st.coords?.lat || "";
    document.getElementById("form-lon").value = st.coords?.lon || "";
    document.getElementById("form-lat-dms").value = st.coords?.latDMS || "";
    document.getElementById("form-lon-dms").value = st.coords?.lonDMS || "";
    document.getElementById("form-gauge-type").value = st.gaugeType || "EWSV";
    document.getElementById("form-install-direction").value = st.installDirection || "상류";
    document.getElementById("form-install-year").value = st.installYear || "";
    document.getElementById("form-obs-year").value = st.obsStartYear || "";
    document.getElementById("form-advm-count").value = st.advmCount || "";
    document.getElementById("form-ewsv-count").value = st.ewsvCount || "";
    document.getElementById("form-waterlevel-type").value = st.waterLevelType || "";
    document.getElementById("form-ref-waterlevel").value = st.refWaterLevel || "";
    document.getElementById("form-memo").value = st.memo || "";

    // Checkboxes
    document.getElementById("form-is-operating").checked = !!st.isOperating2026;
    document.getElementById("form-flood-alert").checked = !!st.floodAlert;
    document.getElementById("form-drought-alert").checked = !!st.droughtAlert;
    document.getElementById("form-calib-2026").checked = !!st.calib2026;
    document.getElementById("form-calib-count").value = st.calibCount2026 || "";
    document.getElementById("form-solar-install").checked = !!st.solarInstall;
    document.getElementById("form-pollution-total").checked = !!st.pollutionTotal;

    // Auto calculate decimal if only DMS is provided or vice versa
    if (st.coords?.latDMS && !st.coords?.lat) {
      document.getElementById("form-lat").value = this.dmsToDecimal(st.coords.latDMS) || "";
    }
    if (st.coords?.lonDMS && !st.coords?.lon) {
      document.getElementById("form-lon").value = this.dmsToDecimal(st.coords.lonDMS) || "";
    }

    const modal = document.getElementById("edit-modal");
    if (modal) modal.classList.add("active");
  }

  openAdd() {
    this.currentStationId = null;
    const titleEl = document.getElementById("edit-modal-title");
    if (titleEl) titleEl.textContent = "신규 관측시설 추가";

    document.getElementById("station-form").reset();
    document.getElementById("form-id").value = "";

    const modal = document.getElementById("edit-modal");
    if (modal) modal.classList.add("active");
  }

  closeEdit() {
    const modal = document.getElementById("edit-modal");
    if (modal) modal.classList.remove("active");
  }

  async saveStation() {
    const id = document.getElementById("form-id").value;
    const name = document.getElementById("form-name").value.trim();
    if (!name) {
      alert("지점명을 입력해주세요.");
      return;
    }

    const latDMS = document.getElementById("form-lat-dms").value.trim();
    const lonDMS = document.getElementById("form-lon-dms").value.trim();
    let lat = parseFloat(document.getElementById("form-lat").value);
    let lon = parseFloat(document.getElementById("form-lon").value);

    // If DMS is provided, prioritize calculating accurate decimal
    if (latDMS) {
      const calcLat = this.dmsToDecimal(latDMS);
      if (calcLat !== null) lat = calcLat;
    }
    if (lonDMS) {
      const calcLon = this.dmsToDecimal(lonDMS);
      if (calcLon !== null) lon = calcLon;
    }

    const gaugeType = document.getElementById("form-gauge-type").value.trim();
    const advmCount = document.getElementById("form-advm-count").value.trim();
    const ewsvCount = document.getElementById("form-ewsv-count").value.trim();
    
    const isDualGauge = (gaugeType.includes("EWSV") && gaugeType.includes("ADVM")) || 
                        (gaugeType === "EWSV, ADVM") ||
                        (gaugeType.includes(","));

    // Preserve existing metadata
    const existingSt = id ? window.dataManager.getById(id) : null;

    const stationData = {
      seq: existingSt ? (existingSt.seq || 1) : (parseInt(document.getElementById("form-seq")?.value, 10) || 999),
      region: document.getElementById("form-region").value,
      river: document.getElementById("form-river").value.trim(),
      name: name,
      code: document.getElementById("form-code").value.trim(),
      address: document.getElementById("form-address").value.trim(),
      installYear: document.getElementById("form-install-year").value.trim(),
      obsStartYear: document.getElementById("form-obs-year").value.trim(),
      gaugeType: gaugeType,
      gaugeCategory: isDualGauge ? "DUAL" : (gaugeType.includes("EWSV") ? "EWSV" : "ADVM"),
      isDualGauge: isDualGauge,
      installDirection: document.getElementById("form-install-direction").value,
      advmCount: advmCount,
      ewsvCount: ewsvCount,
      waterLevelType: document.getElementById("form-waterlevel-type").value.trim(),
      refWaterLevel: document.getElementById("form-ref-waterlevel").value.trim(),
      memo: document.getElementById("form-memo").value.trim(),
      isOperating2026: document.getElementById("form-is-operating").checked,
      floodAlert: document.getElementById("form-flood-alert").checked,
      droughtAlert: document.getElementById("form-drought-alert").checked,
      calib2026: document.getElementById("form-calib-2026").checked,
      calibCount2026: document.getElementById("form-calib-count").value.trim(),
      solarInstall: document.getElementById("form-solar-install").checked,
      pollutionTotal: document.getElementById("form-pollution-total").checked,
      rvBoxInstalled: existingSt ? existingSt.rvBoxInstalled : null,
      rvBoxStatus: existingSt ? existingSt.rvBoxStatus : "미운영/대상외",
      rvBoxAgents: existingSt ? existingSt.rvBoxAgents : [],
      maintenance: existingSt ? existingSt.maintenance : {},
      coords: {
        lat: isNaN(lat) ? null : lat,
        lon: isNaN(lon) ? null : lon,
        latDMS: latDMS || (lat ? this.decimalToDms(lat) : ""),
        lonDMS: lonDMS || (lon ? this.decimalToDms(lon) : "")
      }
    };

    if (id) {
      await window.dataManager.update(id, stationData);
      window.app.showToast("관측시설 정보가 성공적으로 수정되었습니다.", "success");
    } else {
      await window.dataManager.add(stationData);
      window.app.showToast("신규 관측시설이 등록되었습니다.", "success");
    }

    this.closeEdit();
    window.app.refreshAll();
  }

  deleteCurrentStation() {
    if (!this.currentStationId) return;
    const st = window.dataManager.getById(this.currentStationId);
    if (!st) return;

    if (confirm(`정말로 [${st.name}] 관측시설을 삭제하시겠습니까?`)) {
      window.dataManager.delete(this.currentStationId);
      this.closeDetail();
      this.closeEdit();
      window.app.refreshAll();
      window.app.showToast("관측시설이 삭제되었습니다.", "info");
    }
  }
}

window.modalManager = new ModalManager();
