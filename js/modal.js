/**
 * ModalManager
 * Handles Detail View, Edit Form, Add Station, and Delete Confirm modals with Interactive Completion Toggle.
 */
class ModalManager {
  constructor() {
    this.currentStationId = null;
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

    // Task definition list for this station
    const taskItems = [];

    const addTask = (key, name, owner, cat, icon) => {
      const val = tasks[key];
      const isNeeded = (typeof val === "boolean" && val) || (typeof val === "string" && val !== "");
      if (isNeeded) {
        const isDone = !!(completedTasks[key] && completedTasks[key].completed);
        const doneDate = isDone ? completedTasks[key].completedDate : "";
        const detailStr = (typeof val === "string" && val !== "O" && val !== "true") ? ` (${val})` : "";
        taskItems.push({
          key: key,
          name: `${name}${detailStr}`,
          owner: owner,
          category: cat,
          icon: icon,
          isDone: isDone,
          doneDate: doneDate
        });
      }
    };

    addTask("breaker", "자동복구 누전차단기", "공통", "전원·안전", "⚡");
    addTask("battery", "노후 배터리 교체", "공통", "전원·안전", "🔋");
    addTask("solar", "태양광 설비 정비", "공통", "전원·안전", "☀️");
    addTask("extinguisherRNS", "소화기 비치 (용역사: 리버앤씨 RNS)", "용역사(RNS)", "전원·안전", "🧯");
    addTask("extinguisherKIHS", "소화기 비치 (한국수자원조사기술원)", "기술원(자체)", "전원·안전", "🧯");
    addTask("dpConverter", "DP컨버터 교체/설치", "공통", "통신·데이터", "🔌");
    addTask("osUpgrade", "OS 업그레이드", "공통", "통신·데이터", "💻");
    addTask("logger", "Logger(로거) 교체", "공통", "통신·데이터", "📟");
    addTask("sender", "Sender(센더) 교체", "공통", "통신·데이터", "📡");
    addTask("rvBox", "RV박스 정비/교체", "공통", "통신·데이터", "📦");
    addTask("dualGaugeUpdate", "유속계(2대) 현행화", "공통", "센서·계측", "🌊");
    addTask("waterLevelGauge", "수위계 신설/정비", "공통", "센서·계측", "📏");
    addTask("anemometer", "풍향풍속계 설치", "공통", "센서·계측", "💨");
    addTask("infoBoard", "관측소 현황판 설치", "공통", "현장표지", "🪧");
    addTask("signNakdong", "점용표지판 (낙동강)", "낙동강", "현장표지", "🚩");
    addTask("signYeongsan", "점용표지판 (영산강)", "영산강", "현장표지", "🚩");
    addTask("cctvWired", "CCTV 유선 연결", "공통", "영상·감시", "📹");
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
                           onchange="window.modalManager.toggleTask(${st.id}, "${t.key}", this.checked)" 
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
          <th>지점명</th><td><b>${st.name || "-"}</b> (연번: ${st.seq || "-"})</td>
          <th>위치(주소)</th><td>${st.address || "-"}</td>
        </tr>
        <tr>
          <th>국사형태 / 설치방식</th>
          <td><b>${m.stationType || "-"}</b> / ${m.mountType || "-"}</td>
          <th>수위계 설치 여부</th>
          <td>${m.waterLevelInstalled ? "설치됨 (" + (m.waterLevelPos||"") + ")" : "미설치"}</td>
        </tr>
        <tr>
          <th>설치년도 / 개시년도</th>
          <td>${st.installYear || "-"}년 / ${st.obsStartYear || "-"}년</td>
          <th>유속계 형식</th>
          <td><b>${st.gaugeType || "-"}</b> (EWSV:${st.ewsvCount||"-"}, ADVM:${st.advmCount||"-"})</td>
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
    document.getElementById("form-seq").value = st.seq || "";
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

  saveStation() {
    const id = document.getElementById("form-id").value;
    const name = document.getElementById("form-name").value.trim();
    if (!name) {
      alert("지점명을 입력해주세요.");
      return;
    }

    let lat = parseFloat(document.getElementById("form-lat").value);
    let lon = parseFloat(document.getElementById("form-lon").value);
    const latDMS = document.getElementById("form-lat-dms").value.trim();
    const lonDMS = document.getElementById("form-lon-dms").value.trim();

    if ((isNaN(lat) || isNaN(lon)) && (latDMS && lonDMS)) {
      try {
        const pLat = latDMS.split("-").map(Number);
        const pLon = lonDMS.split("-").map(Number);
        if (pLat.length >= 2) lat = pLat[0] + pLat[1]/60 + (pLat[2]||0)/3600;
        if (pLon.length >= 2) lon = pLon[0] + pLon[1]/60 + (pLon[2]||0)/3600;
      } catch(e){}
    }

    const gaugeType = document.getElementById("form-gauge-type").value.trim();
    const advmCount = document.getElementById("form-advm-count").value.trim();
    const ewsvCount = document.getElementById("form-ewsv-count").value.trim();
    
    const isDualGauge = ("EWSV" in gaugeType && "ADVM" in gaugeType) || 
                        (gaugeType.includes("EWSV") && gaugeType.includes("ADVM")) ||
                        (gaugeType === "EWSV, ADVM");

    const stationData = {
      seq: parseInt(document.getElementById("form-seq").value, 10) || 1,
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
      coords: {
        lat: isNaN(lat) ? null : lat,
        lon: isNaN(lon) ? null : lon,
        latDMS: latDMS,
        lonDMS: lonDMS
      }
    };

    if (id) {
      window.dataManager.update(id, stationData);
      window.app.showToast("관측시설 정보가 성공적으로 수정되었습니다.", "success");
    } else {
      window.dataManager.add(stationData);
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
