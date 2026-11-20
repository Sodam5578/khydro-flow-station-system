/**
 * ErrorLedgerManager (모니터링 조치·오류관리대장)
 * - HydroMonitor 공식 진단 규칙(ADVM-R01~R19, EWSV-R01~R13) 기준
 * - 불필요한 Logger/Sender(0,1) 표출 제거 및 깔끔한 단일 원인 선택
 * - 관측소별 기본 [지점 담당자] 관리 + 건별 [실제 조치자(용역사/내부직원 타출장자 등)] 유연 지정
 */
class ErrorLedgerManager {
  constructor() {
    this.codebook = [];
    this.codebookMap = new Map();
    this.stationAssignments = [];
    this.assignmentByCode = new Map();
    this.assignmentByName = new Map();
    this.allManagersList = [];

    this.logs = [];
    this.unifiedRows = [];
    this.unifiedCounts = { total: 0, monitoring: 0, maintenance: 0, unresolved: 0 };
    this.summary = null;
    this.activeByStationCode = {};

    this.currentSubTab = "live"; // 'live' | 'ledger'
    this.historyViewMode = "UNIFIED"; // 'UNIFIED' | 'MONITORING' | 'MAINTENANCE'
    this.displayViewMode = "TIMELINE"; // 'TIMELINE' | 'STATION_SUMMARY'
    this.stationSummaryFilter = "all"; // 'all' | 'unresolved' | 'frequent' | basin
    this.stationSummarySort = "TOTAL_DESC"; // 'TOTAL_DESC' | 'UNRES_DESC' | 'LATEST_DESC' | 'NAME_ASC'
    this.focusedStationId = null;
    this.focusedStationName = null;
    this.selectedStationId = "all";
    this.editingId = null;
    this.pendingPrefill = null;

    this.filters = {
      errorStatus: "all",
      region: "all",
      installMethod: "all",
      actorCategory: "all",
      assignedTeam: "all",
      priority: "all",
      keyword: ""
    };

    // HydroMonitor Official Diagnostic Rules (server/ruleEngine.js 기준)
    this.hydroMonitorRules = [
      // ADVM Official Rules
      { code: "ADVM-R01", method: "ADVM", name: "자료 미수신", priority: "높음", defaultCause: "Sender PC / 전송 프로그램 이상", desc: "대상일시 원시자료(.adv) 미수신" },
      { code: "ADVM-R02", method: "ADVM", name: "VTH 자료 결측", priority: "높음", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "전원·온습도(AC~Hr_Sys) 수치 전체 결측/0" },
      { code: "ADVM-R03", method: "ADVM", name: "수위계 자료 결측", priority: "높음", defaultCause: "수위계 센서 / 대기압 보정 이상", desc: "WaterDepth~Salinity 수위 수치 전체 결측/0" },
      { code: "ADVM-R04", method: "ADVM", name: "ADVM 유속계 자료 결측", priority: "높음", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "ADVM 유속계 센서 자료 블록 누락" },
      { code: "ADVM-R05", method: "ADVM", name: "센서 수심 이상", priority: "보통", defaultCause: "수위계 센서 / 대기압 보정 이상", desc: "설정 셀 개수와 수신 셀 개수 불일치 / 수심 이상" },
      { code: "ADVM-R06", method: "ADVM", name: "초음파 수위 이상", priority: "보통", defaultCause: "수위계 센서 / 대기압 보정 이상", desc: "초음파 수위 또는 자세 값 결측" },
      { code: "ADVM-R07", method: "ADVM", name: "압력식 수위 이상", priority: "보통", defaultCause: "수위계 센서 / 대기압 보정 이상", desc: "압력식 수위계 자료 이상" },
      { code: "ADVM-R08", method: "ADVM", name: "AC 입력전압 이상", priority: "높음", defaultCause: "상전(AC) 차단 / 배터리·충전기 전압 저하", desc: "AC 입력전압 정상범위(209~231V) 이탈" },
      { code: "ADVM-R09", method: "ADVM", name: "DC 충전전압 이상", priority: "높음", defaultCause: "상전(AC) 차단 / 배터리·충전기 전압 저하", desc: "DC 충전전압 정상범위(11.5~14.5V) 이탈" },
      { code: "ADVM-R10", method: "ADVM", name: "배터리전압 이상", priority: "높음", defaultCause: "상전(AC) 차단 / 배터리·충전기 전압 저하", desc: "DC 배터리전압 정상범위(11.5~14.5V) 이탈" },
      { code: "ADVM-R11", method: "ADVM", name: "함체 내부온도 이상", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "시스템 온도 정상범위(-20~80℃) 이탈" },
      { code: "ADVM-R12", method: "ADVM", name: "함체 내부습도 이상", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "시스템 습도 정상범위(10~90%) 이탈" },
      { code: "ADVM-R13", method: "ADVM", name: "함체 문열림 감지", priority: "낮음", defaultCause: "하천 공사 / 식생·부유물 등 현장 환경 요인", desc: "함체 도어 상태 또는 염도 범위 이탈" },
      { code: "ADVM-R14", method: "ADVM", name: "수위 급변 및 이상치", priority: "높음", defaultCause: "수위계 센서 / 대기압 보정 이상", desc: "WaterLevel과 WL_Offset 값 동일 / 수위 급변" },
      { code: "ADVM-R15", method: "ADVM", name: "수온센서 이상", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "유속계 수온 40℃ 이상 과다" },
      { code: "ADVM-R16", method: "ADVM", name: "유속센서 기울기(Pitch/Roll) 이상", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "유속계 Pitch/Roll 기울기 5° 이상" },
      { code: "ADVM-R17", method: "ADVM", name: "평균유속 이상치", priority: "높음", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "평균유속 산정 이상치 발생" },
      { code: "ADVM-R18", method: "ADVM", name: "셀(Cell) 유속 오측", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "1번 셀 유속 절대값 9999 초과" },
      { code: "ADVM-R19", method: "ADVM", name: "ADVM 신호강도(SNR) 저하", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "1번 셀 초음파 신호강도(E1/E2) 70 미만" },

      // EWSV Official Rules
      { code: "EWSV-R01", method: "EWSV", name: "자료 미수신", priority: "높음", defaultCause: "Sender PC / 전송 프로그램 이상", desc: "대상일시 원시자료(.esv) 미수신" },
      { code: "EWSV-R02", method: "EWSV", name: "VTH 자료 결측", priority: "높음", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "전원·온습도(AC~Hr_Sys) 수치 전체 결측/0" },
      { code: "EWSV-R03", method: "EWSV", name: "수위계 자료 결측", priority: "높음", defaultCause: "수위계 센서 / 대기압 보정 이상", desc: "WaterLevel~Salinity 수위 자료 전체 결측/0" },
      { code: "EWSV-R04", method: "EWSV", name: "유속계 통신 이상", priority: "높음", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "유속계 또는 기상 센서 통신 결측" },
      { code: "EWSV-R05", method: "EWSV", name: "EWSV 유속계 자료 결측", priority: "높음", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "EWSV 유속계 전체 결측 (Flag/Cnt=0)" },
      { code: "EWSV-R06", method: "EWSV", name: "일부 유속계 결측", priority: "높음", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "설정 센서 수와 실제 수신 센서 수 불일치" },
      { code: "EWSV-R07", method: "EWSV", name: "평균유속 이상치", priority: "높음", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "유속계 각도(Deg)·SNR 결측 또는 음수유속" },
      { code: "EWSV-R08", method: "EWSV", name: "AC 입력전압 이상", priority: "높음", defaultCause: "상전(AC) 차단 / 배터리·충전기 전압 저하", desc: "AC 입력전압 정상범위(209~231V) 이탈" },
      { code: "EWSV-R09", method: "EWSV", name: "DC 충전전압 이상", priority: "높음", defaultCause: "상전(AC) 차단 / 배터리·충전기 전압 저하", desc: "DC 충전전압 정상범위(11.5~14.5V) 이탈" },
      { code: "EWSV-R10", method: "EWSV", name: "배터리전압 이상", priority: "높음", defaultCause: "상전(AC) 차단 / 배터리·충전기 전압 저하", desc: "DC 배터리전압 정상범위(11.5~14.5V) 이탈" },
      { code: "EWSV-R11", method: "EWSV", name: "함체 내부온도 이상", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "제어시스템 온도 정상범위(0~80℃) 이탈" },
      { code: "EWSV-R12", method: "EWSV", name: "함체 내부습도 이상", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "제어시스템 습도 정상범위(10~90%) 이탈" },
      { code: "EWSV-R13", method: "EWSV", name: "전자파 표면유속계 신호약화", priority: "보통", defaultCause: "유속계 센서 / 컨트롤러 하드웨어 이상", desc: "저 SNR·Opposite Direction 또는 설치각도 이상" },

      // Common Operational / Manual Rules
      { code: "MAN-QD01", method: "COMMON", name: "유량·매개변수·관계식 산정 이상", priority: "높음", defaultCause: "수위 영점(Offset) / 유량 매개변수 이상", desc: "유량 과대·과소 산정 및 매개변수·관계식 조정" },
      { code: "MAN-HD01", method: "COMMON", name: "수위 시계열·영점 오프셋 이상", priority: "높음", defaultCause: "수위 영점(Offset) / 유량 매개변수 이상", desc: "수위 시계열 편차 및 영점 오프셋 보정" },
      { code: "OPS-01", method: "COMMON", name: "설치·회수·공사·교체 등 운영이력", priority: "낮음", defaultCause: "장비 신규설치 · 철거 · 정기교체", desc: "장비 회수·재설치·교량공사 등 일반 운영기록" }
    ];

    // 수계별 조직도 팀 개수 (한강·낙동강: 1~6팀 / 금강·영산강: 1~5팀)
    this.basinMaxTeams = {
      "한강": 6,
      "낙동강": 6,
      "금강": 5,
      "영산강": 5
    };
    this.basinTeamManagers = {
      "한강": {},
      "낙동강": {},
      "금강": {},
      "영산강": {}
    };
  }

  normalizeBasin(raw) {
    const s = String(raw || "").trim();
    if (s.includes("낙동강")) return "낙동강";
    if (s.includes("금강")) return "금강";
    if (s.includes("영산강") || s.includes("섬진강")) return "영산강";
    return "한강";
  }

  formatBasinTeamManager(region, team, manager) {
    if (!manager) return "미지정";
    const b = this.normalizeBasin(region);
    return team ? `${b} ${team}팀 ${manager}` : `${b} ${manager}`;
  }

  async init() {
    await this.loadMetadata();
    await this.loadLedger(true);
  }

  async loadMetadata() {
    if (!window.apiClient) return;
    try {
      const res = await window.apiClient.getMonitoringMetadata();
      if (res.success) {
        this.codebook = res.codebook || [];
        this.codebookMap.clear();
        for (const c of this.codebook) {
          this.codebookMap.set(c.rule_code, c);
        }
        for (const hr of this.hydroMonitorRules) {
          if (!this.codebookMap.has(hr.code)) {
            this.codebookMap.set(hr.code, {
              rule_code: hr.code,
              equipment_type: hr.method === "COMMON" ? "공통" : hr.method,
              standard_name: hr.name,
              default_priority: hr.priority,
              criteria: hr.desc
            });
          }
        }

        this.stationAssignments = res.stationAssignments || [];
        this.assignmentByCode.clear();
        this.assignmentByName.clear();
        this.basinTeamManagers = { "한강": {}, "낙동강": {}, "금강": {}, "영산강": {} };

        const mgrSet = new Set([
          "박세찬 (인프라팀)", "이동오 (인프라팀)", "나형욱 (인프라팀)", "윤영선 (인프라팀)",
          "리버앤씨(RNS) 유지관리팀", "서준석 (RNS)", "최기철 (RNS)", "수문정보관리팀", "AI품질팀"
        ]);

        for (const sa of this.stationAssignments) {
          if (sa.station_code) this.assignmentByCode.set(String(sa.station_code).trim(), sa);
          if (sa.station_name) this.assignmentByName.set(String(sa.station_name).trim(), sa);

          const b = this.normalizeBasin(sa.region);
          const t = String(sa.assigned_team || "").trim();
          const m = String(sa.assigned_manager || "").trim();
          if (m) {
            const label = t ? `${b} ${t}팀 ${m}` : `${b} ${m}`;
            mgrSet.add(label);
            if (t) {
              if (!this.basinTeamManagers[b][t]) this.basinTeamManagers[b][t] = new Set();
              this.basinTeamManagers[b][t].add(m);
            }
          }
        }
        this.allManagersList = Array.from(mgrSet);
      }
    } catch (e) {
      console.error("Failed to load monitoring metadata:", e);
    }
  }

  getStationAssignment(stCode, stName) {
    if (stCode && this.assignmentByCode.has(String(stCode).trim())) {
      return this.assignmentByCode.get(String(stCode).trim());
    }
    if (stName && this.assignmentByName.has(String(stName).trim())) {
      return this.assignmentByName.get(String(stName).trim());
    }
    if (stName) {
      for (const [k, v] of this.assignmentByName.entries()) {
        if (k.includes(stName) || stName.includes(k)) return v;
      }
    }
    return null;
  }

  getActiveIssueForStation(stCode, stName) {
    if (stCode && this.activeByStationCode && this.activeByStationCode[String(stCode).trim()]) {
      return this.activeByStationCode[String(stCode).trim()];
    }
    if (stName && this.logs && this.logs.length > 0) {
      return this.logs.find(l => l.is_unresolved && (l.station_name === stName || (l.station_name && l.station_name.includes(stName)))) || null;
    }
    return null;
  }

  switchMonitorSubTab(subTab, initialStatusFilter = null) {
    this.currentSubTab = subTab;
    const liveEl = document.getElementById("monitor-subview-live");
    const ledgerEl = document.getElementById("monitor-subview-ledger");
    const btnLive = document.getElementById("mon-subtab-btn-live");
    const btnLedger = document.getElementById("mon-subtab-btn-ledger");

    const targetNavKey = subTab === "ledger" ? "error-ledger" : "monitor";
    document.querySelectorAll(".nav-item[data-tab]").forEach(el => {
      if (el.getAttribute("data-tab") === "monitor" || el.getAttribute("data-tab") === "error-ledger") {
        el.classList.toggle("active", el.getAttribute("data-tab") === targetNavKey);
      }
    });

    if (subTab === "ledger") {
      if (liveEl) liveEl.style.display = "none";
      if (ledgerEl) ledgerEl.style.display = "block";
      if (btnLive) {
        btnLive.style.background = "rgba(255,255,255,0.15)";
        btnLive.style.color = "#ffffff";
        btnLive.style.border = "1px solid rgba(255,255,255,0.3)";
      }
      if (btnLedger) {
        btnLedger.style.background = "#ffffff";
        btnLedger.style.color = "#1e3a8a";
        btnLedger.style.border = "none";
      }
      if (initialStatusFilter) {
        this.setQuickStatus(initialStatusFilter);
      } else {
        this.loadLedger();
      }
    } else {
      if (liveEl) liveEl.style.display = "block";
      if (ledgerEl) ledgerEl.style.display = "none";
      if (btnLive) {
        btnLive.style.background = "#ffffff";
        btnLive.style.color = "#1e3a8a";
        btnLive.style.border = "none";
      }
      if (btnLedger) {
        btnLedger.style.background = "rgba(255,255,255,0.15)";
        btnLedger.style.color = "#ffffff";
        btnLedger.style.border = "1px solid rgba(255,255,255,0.3)";
      }
      if (window.monitorManager) {
        window.monitorManager.renderTable();
      }
    }
  }

  async loadLedger(isSilent = false) {
    if (!window.apiClient) return;
    try {
      const apiFilters = {
        ...this.filters,
        stationId: "all",
        stationCode: "all"
      };

      const [monRes, uniRes] = await Promise.all([
        window.apiClient.getMonitoringErrorLogs(apiFilters),
        window.apiClient.getUnifiedActionHistory({
          stationId: "all",
          stationCode: "all",
          stationName: "",
          region: this.filters.region || "all",
          sourceType: "all",
          keyword: "",
          limit: 3000
        })
      ]);

      if (!monRes.success) throw new Error(monRes.message);

      this.logs = monRes.data || [];
      this.summary = monRes.summary || null;
      this.activeByStationCode = (this.summary && this.summary.activeByStationCode) || {};

      if (uniRes && uniRes.success) {
        this.unifiedRows = uniRes.rows || [];
        this.unifiedCounts = uniRes.counts || {
          total: this.unifiedRows.length,
          monitoring: this.logs.length,
          maintenance: 0,
          unresolved: (this.summary && this.summary.unresolvedTotal) || 0
        };
      } else {
        this.unifiedRows = [];
      }

      this.renderSummaryKPIs();
      if (this.displayViewMode === "STATION_SUMMARY") {
        this.renderStationSummaryTable();
      } else {
        this.renderLedgerTable();
      }

      if (window.monitorManager && this.currentSubTab === "live") {
        window.monitorManager.renderKPIs();
        window.monitorManager.renderTable();
      }
    } catch (e) {
      console.error("Failed to load monitoring error ledger:", e);
      if (!isSilent && window.app) {
        window.app.showToast("통합 이력 대장 조회 중 오류가 발생했습니다.", "error");
      }
    }
  }

  // =========================================================
  // DISPLAY VIEW MODE: TIMELINE vs STATION_SUMMARY
  // =========================================================
  setDisplayViewMode(mode) {
    this.displayViewMode = mode || "TIMELINE";
    const btnTimeline = document.getElementById("err-view-btn-timeline");
    const btnStations = document.getElementById("err-view-btn-stations");
    const timelineWrapper = document.getElementById("err-timeline-view-wrapper");
    const summaryWrapper = document.getElementById("err-station-summary-view-wrapper");

    const activeTimelineStyle = "background:#1e3a8a; color:#ffffff; font-weight:800; border:none; padding:6px 13px; border-radius:7px; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 4px rgba(30,58,138,0.2);";
    const activeSummaryStyle = "background:#1e3a8a; color:#ffffff; font-weight:800; border:none; padding:6px 13px; border-radius:7px; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 4px rgba(30,58,138,0.2);";
    const inactiveStyle = "background:#ffffff; color:#334155; font-weight:700; border:1px solid #cbd5e1; padding:6px 13px; border-radius:7px; display:inline-flex; align-items:center; gap:5px;";

    if (this.displayViewMode === "TIMELINE") {
      if (btnTimeline) btnTimeline.style.cssText = activeTimelineStyle;
      if (btnStations) btnStations.style.cssText = inactiveStyle;
      if (timelineWrapper) timelineWrapper.style.display = "block";
      if (summaryWrapper) summaryWrapper.style.display = "none";
      this.renderLedgerTable();
    } else {
      if (btnTimeline) btnTimeline.style.cssText = inactiveStyle;
      if (btnStations) btnStations.style.cssText = activeSummaryStyle;
      if (timelineWrapper) timelineWrapper.style.display = "none";
      if (summaryWrapper) summaryWrapper.style.display = "block";
      this.renderStationSummaryTable();
    }
  }

  setStationSummaryFilter(filterKey) {
    this.stationSummaryFilter = filterKey || "all";
    const pills = [
      { id: "err-st-pill-all", key: "all" },
      { id: "err-st-pill-unres", key: "unresolved" },
      { id: "err-st-pill-freq", key: "frequent" },
      { id: "err-st-pill-hk", key: "한강" },
      { id: "err-st-pill-nd", key: "낙동강" },
      { id: "err-st-pill-gg", key: "금강" },
      { id: "err-st-pill-ys", key: "영산강" }
    ];

    pills.forEach(p => {
      const el = document.getElementById(p.id);
      if (!el) return;
      if (p.key === this.stationSummaryFilter) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });

    this.renderStationSummaryTable();
  }

  onStationSummarySortChange(sortKey) {
    this.stationSummarySort = sortKey || "TOTAL_DESC";
    this.renderStationSummaryTable();
  }

  getStationSummaryData() {
    const allStations = window.dataManager ? window.dataManager.getAll() : [];
    const stationMap = new Map();

    for (const r of (this.unifiedRows || [])) {
      const stId = r.station_id;
      const code = r.station_code || "";
      const name = r.station_name || "미지정";
      const key = stId ? `ID_${stId}` : (code ? `CODE_${code}` : `NAME_${name}`);

      if (!stationMap.has(key)) {
        const stObj = stId
          ? allStations.find(s => Number(s.id) === Number(stId))
          : (code ? allStations.find(s => String(s.code) === String(code)) : allStations.find(s => s.name === name));

        const assign = this.getStationAssignment(code, name);
        const region = this.normalizeBasin(r.region || (stObj ? (stObj.basin || stObj.region) : ""));
        const team = (assign && assign.assigned_team) || (r.assigned_team || "");
        const manager = (assign && assign.assigned_manager) || (r.assigned_manager || "");
        const method = (assign && assign.install_method) || (stObj ? stObj.gaugeType : (r.install_method || "EWSV"));

        stationMap.set(key, {
          id: stId || (stObj ? stObj.id : null),
          code: code || (stObj ? stObj.code : ""),
          name: name,
          region: region,
          team: team,
          manager: manager,
          method: method,
          totalCount: 0,
          monitoringCount: 0,
          maintenanceCount: 0,
          unresolvedCount: 0,
          latestDate: "",
          latestSummary: "",
          latestSource: ""
        });
      }

      const item = stationMap.get(key);
      item.totalCount += 1;
      if (r.source === "MONITORING") {
        item.monitoringCount += 1;
        if (r.is_unresolved) item.unresolvedCount += 1;
      } else {
        item.maintenanceCount += 1;
      }

      const d = r.date || "";
      if (d >= item.latestDate) {
        item.latestDate = d;
        item.latestSummary = r.action_summary || r.title || r.detail || "";
        item.latestSource = r.source;
      }
    }

    return Array.from(stationMap.values());
  }

  renderStationSummaryTable() {
    const tbody = document.getElementById("err-station-summary-tbody");
    const countEl = document.getElementById("err-st-summary-count");
    if (!tbody) return;

    const allData = this.getStationSummaryData();

    // Update Pills Count
    const setPillCount = (id, count) => {
      const el = document.getElementById(id);
      if (el) el.textContent = count.toLocaleString();
    };
    setPillCount("err-st-pill-all-count", allData.length);
    setPillCount("err-st-pill-unres-count", allData.filter(s => s.unresolvedCount > 0).length);
    setPillCount("err-st-pill-freq-count", allData.filter(s => s.totalCount >= 5).length);
    setPillCount("err-st-pill-hk-count", allData.filter(s => s.region === "한강").length);
    setPillCount("err-st-pill-nd-count", allData.filter(s => s.region === "낙동강").length);
    setPillCount("err-st-pill-gg-count", allData.filter(s => s.region === "금강").length);
    setPillCount("err-st-pill-ys-count", allData.filter(s => s.region === "영산강").length);

    const badgeStations = document.getElementById("err-view-badge-stations");
    if (badgeStations) badgeStations.textContent = `${allData.length}개소`;

    // Filter
    let filtered = [...allData];
    const filter = this.stationSummaryFilter || "all";
    if (filter === "unresolved") {
      filtered = filtered.filter(s => s.unresolvedCount > 0);
    } else if (filter === "frequent") {
      filtered = filtered.filter(s => s.totalCount >= 5);
    } else if (["한강", "낙동강", "금강", "영산강"].includes(filter)) {
      filtered = filtered.filter(s => s.region === filter);
    }

    // Keyword Search
    const searchEl = document.getElementById("err-st-search-keyword");
    const kw = searchEl ? searchEl.value.trim().toLowerCase() : "";
    if (kw) {
      filtered = filtered.filter(s =>
        (s.name || "").toLowerCase().includes(kw) ||
        (s.code || "").toLowerCase().includes(kw) ||
        (s.manager || "").toLowerCase().includes(kw) ||
        (s.latestSummary || "").toLowerCase().includes(kw)
      );
    }

    // Sort
    const sort = this.stationSummarySort || "TOTAL_DESC";
    filtered.sort((a, b) => {
      if (sort === "TOTAL_DESC") return b.totalCount - a.totalCount;
      if (sort === "UNRES_DESC") return (b.unresolvedCount - a.unresolvedCount) || (b.totalCount - a.totalCount);
      if (sort === "LATEST_DESC") return (b.latestDate || "").localeCompare(a.latestDate || "");
      if (sort === "NAME_ASC") return (a.name || "").localeCompare(b.name || "", "ko-KR");
      return 0;
    });

    if (countEl) countEl.textContent = filtered.length.toLocaleString();

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:3rem; color:#94a3b8;">조건에 해당하는 관측시설 집계 내역이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((s, idx) => {
      const safeName = (s.name || "").replace(/'/g, "\\'");
      const rowBg = s.unresolvedCount > 0 ? "background:#fffafa;" : "";

      const methodBadge = s.method === "ADVM"
        ? `<span class="badge badge-blue" style="font-size:0.7rem;">ADVM</span>`
        : s.method === "EWSV"
        ? `<span class="badge badge-cyan" style="font-size:0.7rem;">EWSV</span>`
        : `<span class="badge badge-purple" style="font-size:0.7rem;">${this.escapeHtml(s.method || "-")}</span>`;

      return `
        <tr style="${rowBg}">
          <td style="text-align:center; font-weight:700; color:#64748b;">${idx + 1}</td>
          <td>
            <div style="font-weight:800; color:#1e3a8a; cursor:pointer;" onclick="window.monitorManager.openStationActionHistoryModal(${s.id || "null"}, '${safeName}', '${s.code}')" title="클릭 시 [${this.escapeHtml(s.name)}] 지점의 모니터링+유지관리 통합 타임라인 창을 엽니다">
              📍 ${this.escapeHtml(s.name)}
            </div>
            <code style="font-size:0.7rem; color:#64748b;">${this.escapeHtml(s.code || "-")}</code>
          </td>
          <td style="text-align:center;">
            <span class="badge badge-blue" style="font-size:0.72rem;">${this.escapeHtml(s.region || "-")}</span>
            ${s.team ? `<span class="badge" style="background:#f1f5f9; color:#334155; font-size:0.7rem; margin-left:3px;">${s.team}팀</span>` : ""}
          </td>
          <td style="text-align:center;">${methodBadge}</td>
          <td style="text-align:center; font-weight:700; color:#0f766e; font-size:0.78rem;">
            ${this.escapeHtml(s.manager || "미지정")}
          </td>
          <td style="text-align:center;">
            <b style="font-size:0.95rem; color:#1e3a8a;">${s.totalCount}건</b>
          </td>
          <td style="text-align:center;">
            <span style="font-weight:700; color:#1e40af;">${s.monitoringCount}건</span>
            ${s.unresolvedCount > 0 ? `<span class="badge badge-red" style="font-size:0.68rem; margin-left:4px; font-weight:800;">🔥미종료 ${s.unresolvedCount}</span>` : ""}
          </td>
          <td style="text-align:center;">
            <span style="font-weight:700; color:#047857;">${s.maintenanceCount}건</span>
          </td>
          <td style="text-align:center; font-weight:700; font-size:0.78rem; color:#334155;">
            ${this.escapeHtml(s.latestDate || "-")}
          </td>
          <td class="cell-wrap" style="font-size:0.78rem; color:#475569;" title="${this.escapeHtml(s.latestSummary)}">
            ${this.escapeHtml(s.latestSummary || "-")}
          </td>
          <td style="text-align:center; white-space:nowrap;">
            <div style="display:flex; gap:4px; justify-content:center;">
              <button type="button" class="btn btn-primary btn-sm" onclick="window.monitorManager.openStationActionHistoryModal(${s.id || "null"}, '${safeName}', '${s.code}')" style="padding:2px 7px; font-size:0.72rem; font-weight:800;" title="모니터링 이상 + 현장 유지관리 통합 타임라인 팝업">
                📜 타임라인
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="window.errorLedgerManager.focusStationInTimeline(${s.id || "null"}, '${safeName}')" style="padding:2px 6px; font-size:0.72rem; color:#1d4ed8; border-color:#bfdbfe; background:#eff6ff; font-weight:700;" title="건별 조치 타임라인 대장에서 이 지점만 보기">
                📋 대장보기
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // =========================================================
  // FOCUSED STATION FILTERING (TIMELINE VIEW)
  // =========================================================
  focusStationInTimeline(stationId, stationName) {
    this.focusedStationId = stationId ? String(stationId) : null;
    this.focusedStationName = stationName || null;

    const chip = document.getElementById("err-active-station-chip");
    const labelEl = document.getElementById("err-active-station-label");
    const metaEl = document.getElementById("err-active-station-meta");
    const statsEl = document.getElementById("err-active-station-stats");

    if (chip && labelEl) {
      const allStations = window.dataManager ? window.dataManager.getAll() : [];
      const stObj = stationId
        ? allStations.find(s => Number(s.id) === Number(stationId))
        : allStations.find(s => s.name === stationName);

      const finalName = stObj ? stObj.name : (stationName || "관측시설");
      labelEl.textContent = `📍 선택 지점: ${finalName}`;

      const assign = stObj ? this.getStationAssignment(stObj.code, stObj.name) : null;
      const region = this.normalizeBasin(assign?.region || stObj?.basin || stObj?.region || "-");
      const team = assign?.assigned_team ? `${assign.assigned_team}팀` : "";
      const method = assign?.install_method || stObj?.gaugeType || "EWSV";
      if (metaEl) metaEl.textContent = `${region}${team ? ` · ${team}` : ""} · ${method}`;

      const stRows = (this.unifiedRows || []).filter(r =>
        (stationId && String(r.station_id) === String(stationId)) ||
        (finalName && r.station_name === finalName)
      );
      const monCount = stRows.filter(r => r.source === "MONITORING").length;
      const maintCount = stRows.filter(r => r.source === "MAINTENANCE").length;
      if (statsEl) statsEl.textContent = `총 ${stRows.length}건 (모니터링 ${monCount}건 / 현장 ${maintCount}건)`;

      chip.style.display = "flex";
    }

    this.setDisplayViewMode("TIMELINE");
  }

  clearStationFocus() {
    this.focusedStationId = null;
    this.focusedStationName = null;
    const chip = document.getElementById("err-active-station-chip");
    if (chip) chip.style.display = "none";
    this.renderLedgerTable();
  }

  openFocusedStationTimelineModal() {
    if (!this.focusedStationId && !this.focusedStationName) return;
    const allStations = window.dataManager ? window.dataManager.getAll() : [];
    const stObj = this.focusedStationId
      ? allStations.find(s => Number(s.id) === Number(this.focusedStationId))
      : allStations.find(s => s.name === this.focusedStationName);

    if (window.monitorManager) {
      window.monitorManager.openStationActionHistoryModal(
        stObj ? stObj.id : this.focusedStationId,
        stObj ? stObj.name : this.focusedStationName,
        stObj ? (stObj.code || "") : ""
      );
    }
  }

  openSelectedStationTimelineModal() {
    this.openFocusedStationTimelineModal();
  }

  focusStationInUnifiedLedger(stationId, viewMode = "UNIFIED") {
    if (window.app && window.app.activeTab !== "error-ledger") {
      window.app.switchTab("error-ledger");
    } else {
      this.switchMonitorSubTab("ledger");
    }
    const allStations = window.dataManager ? window.dataManager.getAll() : [];
    const st = allStations.find(s => Number(s.id) === Number(stationId));
    this.focusStationInTimeline(stationId, st ? st.name : "");
    this.setHistoryViewMode(viewMode);
  }

  getSelectedStationPrefill() {
    if (!this.focusedStationId && !this.focusedStationName) return {};
    const allStations = window.dataManager ? window.dataManager.getAll() : [];
    const st = this.focusedStationId
      ? allStations.find(s => Number(s.id) === Number(this.focusedStationId))
      : allStations.find(s => s.name === this.focusedStationName);
    if (!st) return {};
    return {
      stationId: st.id,
      stationName: st.name,
      stCode: st.code || ""
    };
  }

  setHistoryViewMode(mode) {
    this.historyViewMode = mode || "UNIFIED";
    const modes = [
      { key: "UNIFIED", btnId: "err-mode-btn-unified", activeBg: "#1e3a8a" },
      { key: "MONITORING", btnId: "err-mode-btn-monitoring", activeBg: "#b91c1c" },
      { key: "MAINTENANCE", btnId: "err-mode-btn-maintenance", activeBg: "#047857" }
    ];
    modes.forEach(m => {
      const btn = document.getElementById(m.btnId);
      if (!btn) return;
      if (m.key === this.historyViewMode) {
        btn.style.background = m.activeBg;
        btn.style.color = "#ffffff";
        btn.style.border = "none";
        btn.style.fontWeight = "800";
      } else {
        btn.style.background = "#ffffff";
        btn.style.color = "#334155";
        btn.style.border = "1px solid #cbd5e1";
        btn.style.fontWeight = "700";
      }
    });
    this.renderLedgerTable();
  }

  renderSummaryKPIs() {
    if (!this.summary) return;
    const s = this.summary;

    const badgeUnres = document.getElementById("mon-ledger-unresolved-badge");
    if (badgeUnres) {
      badgeUnres.textContent = `미종료 ${s.unresolvedTotal || 0}`;
    }

    const monNewEl = document.getElementById("kpi-mon-new");
    const monNewSubEl = document.getElementById("kpi-mon-new-sub");
    if (monNewEl) monNewEl.textContent = `${s.unresolvedTotal || 0}건`;
    if (monNewSubEl) monNewSubEl.textContent = `오류관리대장 진행중 (높음 ${s.unresolvedHigh || 0}건) ➔`;

    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const uCounts = this.unifiedCounts || { total: s.total || 0, monitoring: s.total || 0, maintenance: 0 };
    setEl("err-mode-count-unified", uCounts.total || 0);
    setEl("err-mode-count-monitoring", uCounts.monitoring || s.total || 0);
    setEl("err-mode-count-maintenance", uCounts.maintenance || 0);

    setEl("err-kpi-unified-total", `${uCounts.total || 0}건`);
    setEl("err-kpi-unified-sub", `모니터링 ${uCounts.monitoring || 0}건 + 현장정비 ${uCounts.maintenance || 0}건`);

    const mAdvm = s.byMethod?.["ADVM"] || 0;
    const mEwsv = s.byMethod?.["EWSV"] || 0;
    const mDual = s.byMethod?.["ADVM/EWSV"] || 0;
    setEl("err-kpi-total", `${uCounts.monitoring || s.total || 0}건`);
    setEl("err-kpi-total-sub", `EWSV ${mEwsv} · ADVM ${mAdvm} · 복합 ${mDual}`);

    setEl("err-kpi-maint-total", `${uCounts.maintenance || 0}건`);
    setEl("err-kpi-maint-sub", `현장 출동 · 유속계/수위계/부품 교체`);

    setEl("err-kpi-unresolved", `${s.unresolvedTotal || 0}건`);
    setEl("err-kpi-unresolved-sub", `긴급(높음) ${s.unresolvedHigh || 0}건 · 종료 ${s.byStatus?.["종료"] || 0}건`);

    const rns = s.byActor?.["용역사(RNS)"] || { total: 0, active: 0 };
    setEl("err-kpi-actor-rns", `${rns.total}건`);
    setEl("err-kpi-actor-rns-sub", `현재 진행중 ${rns.active}건 · 완료 ${rns.total - rns.active}건`);

    setEl("err-pill-all", s.total || 0);
    setEl("err-pill-unresolved", s.unresolvedTotal || 0);
    setEl("err-pill-new", s.byStatus?.["신규"] || 0);
    setEl("err-pill-check", s.byStatus?.["원인확인"] || 0);
    setEl("err-pill-req", s.byStatus?.["조치요청"] || 0);
    setEl("err-pill-prog", s.byStatus?.["조치중"] || 0);
    setEl("err-pill-verify", s.byStatus?.["정상화확인"] || 0);
    setEl("err-pill-hold", s.byStatus?.["보류"] || 0);
    setEl("err-pill-done", s.byStatus?.["종료"] || 0);
    setEl("err-pill-ref", s.byStatus?.["참고"] || 0);
  }

  setQuickStatus(statusVal) {
    this.filters.errorStatus = statusVal || "all";
    if (statusVal && statusVal !== "all" && this.historyViewMode === "MAINTENANCE") {
      this.setHistoryViewMode("UNIFIED");
    }
    const pills = document.querySelectorAll("#err-status-pills-wrap .btn-filter-pill");
    pills.forEach(p => {
      if (p.dataset.errStatus === this.filters.errorStatus) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    });
    this.loadLedger();
  }

  setActorFilter(actorVal) {
    const sel = document.getElementById("err-filter-actor");
    if (sel) sel.value = actorVal;
    this.filters.actorCategory = actorVal;
    if (actorVal === "현장정비(장비·부품)") {
      this.setHistoryViewMode("MAINTENANCE");
    }
    this.loadLedger();
  }

  onRegionFilterChange(regionVal) {
    const teamSelect = document.getElementById("err-filter-team");
    if (teamSelect) {
      if (!regionVal || regionVal === "all") {
        teamSelect.innerHTML = `
          <option value="all">담당팀 전체</option>
          <optgroup label="한강 (1~6팀)">
            <option value="한강|1">한강 1팀</option>
            <option value="한강|2">한강 2팀</option>
            <option value="한강|3">한강 3팀</option>
            <option value="한강|4">한강 4팀</option>
            <option value="한강|5">한강 5팀</option>
            <option value="한강|6">한강 6팀</option>
          </optgroup>
          <optgroup label="낙동강 (1~6팀)">
            <option value="낙동강|1">낙동강 1팀</option>
            <option value="낙동강|2">낙동강 2팀</option>
            <option value="낙동강|3">낙동강 3팀</option>
            <option value="낙동강|4">낙동강 4팀</option>
            <option value="낙동강|5">낙동강 5팀</option>
            <option value="낙동강|6">낙동강 6팀</option>
          </optgroup>
          <optgroup label="금강 (1~5팀)">
            <option value="금강|1">금강 1팀</option>
            <option value="금강|2">금강 2팀</option>
            <option value="금강|3">금강 3팀</option>
            <option value="금강|4">금강 4팀</option>
            <option value="금강|5">금강 5팀</option>
          </optgroup>
          <optgroup label="영산강 (1~5팀)">
            <option value="영산강|1">영산강 1팀</option>
            <option value="영산강|2">영산강 2팀</option>
            <option value="영산강|3">영산강 3팀</option>
            <option value="영산강|4">영산강 4팀</option>
            <option value="영산강|5">영산강 5팀</option>
          </optgroup>
        `;
      } else {
        const basin = this.normalizeBasin(regionVal);
        const maxTeam = this.basinMaxTeams[basin] || 6;
        let opts = `<option value="all">${basin} 전체 (1~${maxTeam}팀)</option>`;
        for (let t = 1; t <= maxTeam; t++) {
          opts += `<option value="${basin}|${t}">${basin} ${t}팀</option>`;
        }
        teamSelect.innerHTML = opts;
      }
      teamSelect.value = "all";
    }
    this.onFilterChange();
  }

  onFilterChange() {
    this.filters.region = document.getElementById("err-filter-region")?.value || "all";
    this.filters.installMethod = document.getElementById("err-filter-method")?.value || "all";
    this.filters.actorCategory = document.getElementById("err-filter-actor")?.value || "all";
    this.filters.assignedTeam = document.getElementById("err-filter-team")?.value || "all";
    this.filters.priority = document.getElementById("err-filter-priority")?.value || "all";
    this.filters.keyword = (document.getElementById("err-filter-keyword")?.value || "").trim();
    this.loadLedger();
  }

  QuickFilterReset() {
    this.filters = {
      errorStatus: "all",
      region: "all",
      installMethod: "all",
      actorCategory: "all",
      assignedTeam: "all",
      priority: "all",
      keyword: ""
    };
    this.selectedStationId = "all";
    const stEl = document.getElementById("err-filter-station");
    if (stEl) stEl.value = "all";
    const regionEl = document.getElementById("err-filter-region");
    if (regionEl) regionEl.value = "all";
    this.onRegionFilterChange("all");
    const ids = ["err-filter-method", "err-filter-actor", "err-filter-team", "err-filter-priority"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "all";
    });
    const kwEl = document.getElementById("err-filter-keyword");
    if (kwEl) kwEl.value = "";
    this.setHistoryViewMode("UNIFIED");
    this.setQuickStatus("all");
  }

  getStatusBadgeHtml(status) {
    const map = {
      "신규": { bg: "#fee2e2", text: "#b91c1c", label: "🚨 신규" },
      "원인확인": { bg: "#ffedd5", text: "#c2410c", label: "🔍 원인확인" },
      "조치요청": { bg: "#fef3c7", text: "#b45309", label: "📢 조치요청" },
      "조치중": { bg: "#dbeafe", text: "#1d4ed8", label: "🛠️ 조치중" },
      "정상화확인": { bg: "#e0f2fe", text: "#0369a1", label: "✅ 정상화확인" },
      "보류": { bg: "#f3e8ff", text: "#6b21a8", label: "⏸️ 보류" },
      "종료": { bg: "#dcfce7", text: "#15803d", label: "🏁 종료" },
      "완료": { bg: "#dcfce7", text: "#15803d", label: "✅ 정비완료" },
      "참고": { bg: "#f1f5f9", text: "#475569", label: "📌 참고" }
    };
    const st = map[status] || { bg: "#f1f5f9", text: "#334155", label: status || "-" };
    return `<span class="badge" style="background:${st.bg}; color:${st.text}; font-weight:800; font-size:0.74rem; padding:3px 8px;">${st.label}</span>`;
  }

  getActorBadgeHtml(actorCat) {
    const map = {
      "용역사(RNS)": { bg: "#fffbeb", border: "#fde68a", text: "#b45309", icon: "🚚", label: "용역사(RNS)" },
      "내부출장직(담당팀)": { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857", icon: "🏃", label: "내부직원(출장)" },
      "수문정보관리팀": { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", icon: "💻", label: "수문정보관리팀" },
      "AI품질팀": { bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9", icon: "📊", label: "AI품질팀" },
      "인프라팀(자체)": { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1", icon: "🏢", label: "인프라팀(자체)" },
      "현장정비(장비·부품)": { bg: "#ecfdf5", border: "#6ee7b7", text: "#047857", icon: "🛠️", label: "현장정비·교체" },
      "기타/관망": { bg: "#f8fafc", border: "#e2e8f0", text: "#64748b", icon: "📌", label: "기타/관망" }
    };
    const c = map[actorCat] || map["기타/관망"];
    return `<span style="display:inline-flex; align-items:center; gap:3px; background:${c.bg}; border:1px solid ${c.border}; color:${c.text}; font-size:0.71rem; font-weight:700; padding:1px 6px; border-radius:4px;">${c.icon} ${c.label}</span>`;
  }

  getFilteredUnifiedRows() {
    let rows = [...(this.unifiedRows || [])];

    // 1. Mode Filter ('UNIFIED' | 'MONITORING' | 'MAINTENANCE')
    if (this.historyViewMode === "MONITORING") {
      rows = rows.filter(r => r.source === "MONITORING");
    } else if (this.historyViewMode === "MAINTENANCE") {
      rows = rows.filter(r => r.source === "MAINTENANCE");
    }

    // 2. Enrich station assignment info for maintenance rows if missing
    rows = rows.map(r => {
      const assign = this.getStationAssignment(r.station_code, r.station_name);
      return {
        ...r,
        region: r.region || (assign && assign.region) || "한강",
        install_method: r.install_method || (assign && assign.install_method) || "EWSV",
        assigned_team: r.assigned_team || (assign && assign.assigned_team) || "",
        assigned_manager: r.assigned_manager || (assign && assign.assigned_manager) || ""
      };
    });

    // 3. Apply UI Filters
    if (this.filters.region && this.filters.region !== "all") {
      rows = rows.filter(r => this.normalizeBasin(r.region) === this.normalizeBasin(this.filters.region));
    }
    if (this.filters.installMethod && this.filters.installMethod !== "all") {
      rows = rows.filter(r => r.install_method === this.filters.installMethod);
    }
    if (this.filters.actorCategory && this.filters.actorCategory !== "all") {
      rows = rows.filter(r => r.actor_category === this.filters.actorCategory);
    }
    if (this.filters.assignedTeam && this.filters.assignedTeam !== "all") {
      const tf = String(this.filters.assignedTeam);
      if (tf.includes("|")) {
        const [fBasin, fTeam] = tf.split("|");
        rows = rows.filter(r => this.normalizeBasin(r.region) === this.normalizeBasin(fBasin) && String(r.assigned_team) === String(fTeam));
      } else {
        rows = rows.filter(r => String(r.assigned_team) === tf);
      }
    }
    if (this.filters.priority && this.filters.priority !== "all") {
      rows = rows.filter(r => r.priority === this.filters.priority);
    }
    if (this.filters.errorStatus && this.filters.errorStatus !== "all") {
      if (this.filters.errorStatus === "UNRESOLVED") {
        rows = rows.filter(r => r.is_unresolved);
      } else if (this.filters.errorStatus === "종료") {
        rows = rows.filter(r => r.status === "종료" || r.status === "완료");
      } else {
        rows = rows.filter(r => r.status === this.filters.errorStatus);
      }
    }
    if (this.filters.keyword) {
      const kw = this.filters.keyword.toLowerCase();
      rows = rows.filter(r =>
        (r.station_name || "").toLowerCase().includes(kw) ||
        (r.station_code || "").toLowerCase().includes(kw) ||
        (r.code || "").toLowerCase().includes(kw) ||
        (r.title || "").toLowerCase().includes(kw) ||
        (r.cause_or_part || "").toLowerCase().includes(kw) ||
        (r.action_summary || "").toLowerCase().includes(kw) ||
        (r.worker || "").toLowerCase().includes(kw) ||
        (r.discoverer || "").toLowerCase().includes(kw) ||
        (r.assigned_manager || "").toLowerCase().includes(kw) ||
        (r.detail || "").toLowerCase().includes(kw)
      );
    }

    // Filter by focused station (if focused via "이 지점만 🔎" or from station summary)
    if (this.focusedStationId || this.focusedStationName) {
      rows = rows.filter(r =>
        (this.focusedStationId && String(r.station_id) === String(this.focusedStationId)) ||
        (this.focusedStationName && r.station_name === this.focusedStationName)
      );
    }

    return rows;
  }

  renderLedgerTable() {
    const tbody = document.getElementById("err-ledger-tbody");
    const countEl = document.getElementById("err-ledger-count");
    if (!tbody) return;

    const rowsToRender = this.getFilteredUnifiedRows();
    if (countEl) countEl.textContent = rowsToRender.length.toLocaleString();

    if (rowsToRender.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:3rem; color:#94a3b8;">조건에 해당하는 모니터링 조치 또는 유지관리 이력이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = rowsToRender.map((item, idx) => {
      const isMaint = item.source === "MAINTENANCE";
      const isUnres = item.is_unresolved;
      const rowBg = isUnres
        ? "background:#fffafa;"
        : (isMaint ? "background:#f8fafc;" : "");

      const sourceTag = isMaint
        ? `<span class="badge" style="background:#dcfce7; color:#166534; border:1px solid #86efac; font-size:0.68rem; font-weight:800; padding:1px 6px; margin-bottom:3px; display:inline-block;">🛠️ 현장유지관리</span>`
        : `<span class="badge" style="background:#dbeafe; color:#1e40af; border:1px solid #93c5fd; font-size:0.68rem; font-weight:800; padding:1px 6px; margin-bottom:3px; display:inline-block;">🛰️ 모니터링조치</span>`;

      const methodBadge = item.install_method === "ADVM"
        ? `<span class="badge badge-blue" style="font-size:0.68rem;">ADVM</span>`
        : item.install_method === "EWSV"
        ? `<span class="badge badge-cyan" style="font-size:0.68rem;">EWSV</span>`
        : `<span class="badge badge-purple" style="font-size:0.68rem;">${this.escapeHtml(item.install_method || "-")}</span>`;

      const prioBadge = isMaint
        ? ""
        : (item.priority === "높음"
          ? `<span style="color:#dc2626; font-weight:800; font-size:0.7rem;">🔴높음</span>`
          : item.priority === "보통"
          ? `<span style="color:#d97706; font-weight:700; font-size:0.7rem;">🟡보통</span>`
          : `<span style="color:#64748b; font-size:0.7rem;">🟢낮음</span>`);

      const durText = !isMaint && item.duration_days !== null && item.duration_days !== undefined
        ? (isUnres ? `<span style="color:#dc2626; font-weight:800; font-size:0.75rem;">🔥 D+${item.duration_days}일</span>` : `<span style="color:#475569; font-size:0.74rem;">${item.duration_days}일</span>`)
        : (isMaint && item.work_no ? `<code style="font-size:0.68rem; color:#64748b;">${this.escapeHtml(item.work_no)}</code>` : `<span style="color:#94a3b8; font-size:0.72rem;">-</span>`);

      const actualWorkerText = item.worker
        ? `<div style="font-size:0.74rem; color:#0f766e; font-weight:700; margin-top:2px;">👤 ${isMaint ? "작업자" : "조치자"}: ${this.escapeHtml(item.worker)}</div>`
        : "";

      const codeBadgeStyle = isMaint
        ? "background:#ecfdf5; color:#047857; border:1px solid #6ee7b7;"
        : "background:#fee2e2; color:#991b1b;";

      const safeStName = (item.station_name || "").replace(/'/g, "\\'");

      return `
        <tr style="${rowBg}">
          <td style="text-align:center; font-weight:700; color:#64748b;">${idx + 1}</td>
          <td style="text-align:center; white-space:nowrap;">
            <div>${sourceTag}</div>
            <div style="font-weight:800; color:#0f172a; font-size:0.8rem;">${this.escapeHtml(item.date || "-")}</div>
            <div style="font-size:0.71rem; color:${item.subDate && item.subDate.startsWith("종료") ? "#15803d; font-weight:700;" : "#64748b;"}">${this.escapeHtml(item.subDate || "")}</div>
          </td>
          <td class="cell-wrap">
            <div style="font-weight:800; color:#1e3a8a; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:4px;" onclick="window.monitorManager.openStationActionHistoryModal(${item.station_id || "null"}, '${safeStName}', '${this.escapeHtml(item.station_code || "")}')" title="클릭 시 [${this.escapeHtml(item.station_name)}] 지점의 모니터링+유지관리 통합 타임라인 창을 엽니다">
              <span>📍 ${this.escapeHtml(item.station_name)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:4px; margin-top:3px; flex-wrap:wrap;">
              <span style="font-size:0.72rem; color:#475569; font-weight:700;">${this.escapeHtml(this.normalizeBasin(item.region))}</span>
              <code style="font-size:0.7rem; color:#64748b;">${this.escapeHtml(item.station_code || "")}</code>
              ${methodBadge}
              ${item.station_id && String(this.focusedStationId) !== String(item.station_id) ? `
                <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation(); window.errorLedgerManager.focusStationInTimeline('${item.station_id}', '${safeStName}')" style="padding:0px 5px; font-size:0.66rem; color:#1d4ed8; border-color:#bfdbfe; background:#eff6ff; font-weight:700;" title="이 관측소의 모니터링+유지관리 이력만 필터링">
                  이 지점만 🔎
                </button>
              ` : ""}
            </div>
          </td>
          <td style="text-align:center;">
            <div style="font-size:0.77rem; font-weight:700; color:#334155;" title="시설목록 기준 수계별 지점 담당자">
              ${this.escapeHtml(this.formatBasinTeamManager(item.region, item.assigned_team, item.assigned_manager))}
            </div>
            ${!isMaint && item.discoverer ? `
              <div style="font-size:0.7rem; color:#94a3b8; margin-top:2px;">
                발견: ${this.escapeHtml(item.discoverer)}
              </div>
            ` : (isMaint ? `<div style="font-size:0.69rem; color:#047857; margin-top:2px;">현장출동·정비</div>` : "")}
          </td>
          <td class="cell-wrap">
            <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
              <span class="badge" style="font-family:monospace; font-weight:800; ${codeBadgeStyle} font-size:0.72rem;">
                ${this.escapeHtml(item.code)}
              </span>
              ${prioBadge}
            </div>
            <div style="font-weight:700; color:#1e293b; font-size:0.8rem; margin-top:3px;">
              ${this.escapeHtml(item.title)}
            </div>
          </td>
          <td class="cell-wrap">
            <div style="font-weight:700; color:${isMaint ? "#0f766e" : "#334155"}; font-size:0.79rem;">
              ${this.escapeHtml(item.cause_or_part || "-")}
            </div>
          </td>
          <td class="cell-wrap">
            <div>${this.getActorBadgeHtml(item.actor_category)}</div>
            ${actualWorkerText}
            <div style="font-size:0.75rem; color:#475569; margin-top:2px;">
              ${this.escapeHtml(item.action_summary || "-")}
            </div>
          </td>
          <td style="text-align:center;">
            <div>${this.getStatusBadgeHtml(item.status)}</div>
            <div style="margin-top:4px;">${durText}</div>
          </td>
          <td class="cell-wrap">
            <div style="font-size:0.78rem; color:#1e293b; line-height:1.4; white-space:pre-wrap;">${this.escapeHtml(item.detail || "-")}</div>
          </td>
          <td style="text-align:center;">
            ${!isMaint ? `
              <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                ${isUnres ? `
                  <button type="button" class="btn btn-sm" onclick="window.errorLedgerManager.quickResolve(${item.id})" style="width:100%; padding:3px 8px; font-size:0.72rem; background:#16a34a; color:#ffffff; border:none; font-weight:800;" title="원클릭으로 오늘자 조치완료(종료) 처리합니다">
                    🏁 완료처리
                  </button>
                ` : ""}
                <div style="display:flex; gap:4px; width:100%; justify-content:center;">
                  <button type="button" class="btn btn-outline btn-sm" onclick="window.errorLedgerManager.openEditModal(${item.id})" style="padding:2px 7px; font-size:0.72rem; font-weight:700; color:#1e40af; border-color:#93c5fd;">
                    ✏️ 수정
                  </button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="window.errorLedgerManager.deleteLog(${item.id})" style="padding:2px 6px; font-size:0.72rem; color:#dc2626; border-color:#fca5a5;">
                    🗑️
                  </button>
                </div>
              </div>
            ` : `
              <div style="display:flex; gap:4px; width:100%; justify-content:center;">
                ${item.work_id ? `
                  <button type="button" class="btn btn-outline btn-sm" onclick="window.equipmentManager.openEditWorkModal(${item.work_id}, ${item.id})" style="padding:2px 7px; font-size:0.72rem; font-weight:700; color:#047857; border-color:#6ee7b7;">
                    ✏️ 수정
                  </button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="window.equipmentManager.deleteAction(${item.id}, ${item.work_id})" style="padding:2px 6px; font-size:0.72rem; color:#dc2626; border-color:#fca5a5;">
                    🗑️
                  </button>
                ` : `
                  <button type="button" class="btn btn-outline btn-sm" onclick="window.maintenanceHistoryManager.openEditModal(${item.id})" style="padding:2px 7px; font-size:0.72rem; font-weight:700;">
                    ✏️ 수정
                  </button>
                `}
              </div>
            `}
          </td>
        </tr>
      `;
    }).join("");
  }

  // =========================================================
  // STREAMLINED HYDROMONITOR REGISTRATION / EDIT MODAL
  // =========================================================
  populateModalSelects(selectedStationKey = "", selectedRuleCode = "") {
    const stSelect = document.getElementById("err-form-station-select");
    if (stSelect) {
      const allStations = window.dataManager ? window.dataManager.getAll() : [];
      stSelect.innerHTML = allStations.map(s => {
        const assign = this.getStationAssignment(s.code, s.name);
        const method = assign?.install_method || s.gaugeType || "EWSV";
        const val = `${s.code || s.id}|${s.name}`;
        const isSel = (selectedStationKey && (String(s.code) === String(selectedStationKey) || String(s.id) === String(selectedStationKey) || s.name === selectedStationKey)) ? "selected" : "";
        return `<option value="${this.escapeHtml(val)}" data-id="${s.id}" data-code="${this.escapeHtml(s.code || "")}" data-name="${this.escapeHtml(s.name)}" data-region="${this.escapeHtml(s.basin || s.region || "")}" data-method="${this.escapeHtml(method)}" data-team="${this.escapeHtml(assign?.assigned_team || "")}" data-manager="${this.escapeHtml(assign?.assigned_manager || "")}" ${isSel}>${this.escapeHtml(s.name)} (${this.escapeHtml(s.code || "-")}) [${this.escapeHtml(method)}]</option>`;
      }).join("");
    }

    // Populate worker datalist with all field managers & team members
    const dl = document.getElementById("err-worker-datalist");
    if (dl) {
      dl.innerHTML = this.allManagersList.map(m => `<option value="${this.escapeHtml(m)}"></option>`).join("");
    }

    this.onStationSelectChange(null, selectedRuleCode);
  }

  onStationSelectChange(_val, preferredRuleCode = "") {
    const stSelect = document.getElementById("err-form-station-select");
    if (!stSelect || stSelect.selectedIndex < 0) return;
    const opt = stSelect.options[stSelect.selectedIndex];
    const code = opt.dataset.code || "";
    const name = opt.dataset.name || "";
    const assign = this.getStationAssignment(code, name);

    const region = this.normalizeBasin(assign?.region || opt.dataset.region || "한강");
    const method = (assign?.install_method || opt.dataset.method || "EWSV").toUpperCase();
    const team = assign?.assigned_team || opt.dataset.team || "";
    const manager = assign?.assigned_manager || opt.dataset.manager || "";
    const mgrText = manager ? this.formatBasinTeamManager(region, team, manager) : "미지정";

    const badgeContainer = document.getElementById("err-form-station-meta-badges");
    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <span class="badge badge-blue" style="font-size:0.74rem;">${this.escapeHtml(region)}</span>
        <span class="badge badge-cyan" style="font-size:0.74rem;">${this.escapeHtml(method)}</span>
        <span class="badge" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; font-weight:800; font-size:0.75rem;">📍 지점 담당자: ${this.escapeHtml(mgrText)}</span>
      `;
    }

    const refHintEl = document.getElementById("err-form-station-mgr-ref-hint");
    if (refHintEl) {
      refHintEl.textContent = `📍 지점 기본 담당자: ${mgrText}`;
    }

    // Filter HydroMonitor rules to match the selected station's method (ADVM vs EWSV)
    this.populateHydroMonitorRuleSelect(method, preferredRuleCode);
  }

  populateHydroMonitorRuleSelect(method = "EWSV", selectedCode = "") {
    const codeSelect = document.getElementById("err-form-code-select");
    if (!codeSelect) return;

    const isAdvmOnly = method === "ADVM";
    const isEwsvOnly = method === "EWSV";

    const filteredRules = this.hydroMonitorRules.filter(r => {
      if (r.method === "COMMON") return true;
      if (isAdvmOnly) return r.method === "ADVM";
      if (isEwsvOnly) return r.method === "EWSV";
      return true; // ADVM/EWSV dual station shows both
    });

    // If editing an older historical record whose code is not in filteredRules, include it at top
    let extraOptionHtml = "";
    if (selectedCode && !filteredRules.some(r => r.code === selectedCode)) {
      const cb = this.codebookMap.get(selectedCode);
      const label = cb ? cb.standard_name : selectedCode;
      extraOptionHtml = `<option value="${this.escapeHtml(selectedCode)}" selected>[${this.escapeHtml(selectedCode)}] ${this.escapeHtml(label)}</option>`;
    }

    const defaultCode = selectedCode || (isAdvmOnly ? "ADVM-R01" : "EWSV-R01");

    codeSelect.innerHTML = extraOptionHtml + filteredRules.map(r => {
      const isSel = r.code === defaultCode ? "selected" : "";
      return `<option value="${this.escapeHtml(r.code)}" ${isSel}>[${this.escapeHtml(r.code)}] ${this.escapeHtml(r.name)}</option>`;
    }).join("");

    this.onRuleCodeChange(codeSelect.value, Boolean(selectedCode));
  }

  onRuleCodeChange(ruleCode, preserveExistingCause = false) {
    const hmRule = this.hydroMonitorRules.find(r => r.code === ruleCode);
    const cbRule = this.codebookMap.get(ruleCode);

    const nameInput = document.getElementById("err-form-error-name");
    const prioSelect = document.getElementById("err-form-priority");
    const causeSelect = document.getElementById("err-form-cause-select");

    if (hmRule) {
      if (nameInput) nameInput.value = hmRule.name;
      if (prioSelect) prioSelect.value = hmRule.priority;
      if (causeSelect && !preserveExistingCause && hmRule.defaultCause) {
        causeSelect.value = hmRule.defaultCause;
      }
    } else if (cbRule) {
      if (nameInput) nameInput.value = cbRule.standard_name || ruleCode;
      if (prioSelect && cbRule.default_priority) prioSelect.value = cbRule.default_priority;
    }
  }

  onActorCategoryChange(cat) {
    // 실제 조치자(err-form-actual-worker)는 자동 입력하지 않고 수기 텍스트 입력을 유지합니다.
    const reqSelect = document.getElementById("err-form-action-request");
    if (!reqSelect) return;

    if (cat === "용역사(RNS)") {
      reqSelect.value = "유지관리업체 점검요청";
    } else if (cat === "내부출장직(담당팀)") {
      reqSelect.value = "담당직원 현장점검 요청";
    } else if (cat === "인프라팀(자체)" || cat === "수문정보관리팀") {
      reqSelect.value = "원격점검 및 제어 복구";
    } else if (cat === "AI품질팀") {
      reqSelect.value = "수위 영점 / 매개변수 조정";
    } else if (cat === "기타/관망") {
      reqSelect.value = "지속 모니터링 (관망)";
    }
  }

  selectStatus(statusVal) {
    const hidden = document.getElementById("err-form-status");
    if (hidden) hidden.value = statusVal;

    const endDateEl = document.getElementById("err-form-end-date");
    const today = new Date().toISOString().slice(0, 10);
    if (endDateEl) {
      if (statusVal === "종료" && !endDateEl.value) {
        endDateEl.value = today;
      } else if (statusVal !== "종료") {
        endDateEl.value = "";
      }
    }

    document.querySelectorAll("#err-status-step-btns .err-status-btn").forEach(btn => {
      if (btn.dataset.status === statusVal) {
        const isDone = statusVal === "종료";
        btn.style.background = isDone ? "#16a34a" : "#1e40af";
        btn.style.color = "#ffffff";
        btn.style.borderColor = isDone ? "#16a34a" : "#1e40af";
      } else {
        btn.style.background = "#ffffff";
        btn.style.color = "#334155";
        btn.style.borderColor = "#cbd5e1";
      }
    });
  }

  openRegisterModal(prefill = {}, forceNew = false) {
    if (this.codebook.length === 0) {
      this.loadMetadata().then(() => this.openRegisterModal(prefill, forceNew));
      return;
    }

    this.pendingPrefill = prefill;
    const stCode = prefill.stCode || "";
    const stName = prefill.stationName || "";

    const existingActive = !forceNew ? this.getActiveIssueForStation(stCode, stName) : null;
    if (existingActive && existingActive.id) {
      this.openEditModal(existingActive.id, true);
      return;
    }

    this.editingId = null;

    const bannerEl = document.getElementById("err-modal-ongoing-banner");
    if (bannerEl) bannerEl.style.display = "none";

    const titleEl = document.getElementById("err-modal-title");
    if (titleEl) {
      titleEl.textContent = prefill.ruleId
        ? `✍️ [${prefill.stationName || ""}] 실시간 이상 조치 등록 (${prefill.ruleId})`
        : "✍️ 모니터링 조치·오류 이력 등록";
    }

    const submitBtn = document.getElementById("err-form-submit-btn");
    if (submitBtn) submitBtn.textContent = "💾 신규 이력 저장";

    const today = new Date().toISOString().slice(0, 10);
    this.populateModalSelects(stCode || stName || prefill.stationId, prefill.ruleId || "");

    const firstDateEl = document.getElementById("err-form-first-date");
    const checkDateEl = document.getElementById("err-form-check-date");
    if (firstDateEl) firstDateEl.value = prefill.firstOccurDate || today;
    if (checkDateEl) checkDateEl.value = today;

    const currentUserName = window.apiClient?.user?.name || "박세찬";
    const discSelect = document.getElementById("err-form-discoverer");
    if (discSelect) {
      const matchOpt = Array.from(discSelect.options).find(o => currentUserName.includes(o.value));
      discSelect.value = matchOpt ? matchOpt.value : "박세찬";
    }

    const actorSelect = document.getElementById("err-form-actor-category");
    if (actorSelect) {
      actorSelect.value = "용역사(RNS)";
      this.onActorCategoryChange("용역사(RNS)");
    }

    // 실제 조치자는 항상 빈 값으로 시작하여 수기 입력받음
    const workerInput = document.getElementById("err-form-actual-worker");
    if (workerInput) workerInput.value = "";

    this.selectStatus("조치요청");

    const memoEl = document.getElementById("err-form-memo");
    if (memoEl) memoEl.value = prefill.memo || "";

    const modal = document.getElementById("monitoring-error-form-modal");
    if (modal) modal.classList.add("active");
  }

  async openEditModal(id, isAutoContinuation = false) {
    if (this.codebook.length === 0) await this.loadMetadata();

    let item = this.logs.find(l => Number(l.id) === Number(id));
    if (!item && window.apiClient) {
      const res = await window.apiClient.getMonitoringErrorLogs({ limit: 1000 });
      if (res.success && res.data) {
        item = res.data.find(l => Number(l.id) === Number(id));
      }
    }
    if (!item) {
      if (window.app) window.app.showToast("해당 이력을 찾을 수 없습니다.", "error");
      return;
    }

    this.editingId = item.id;
    const today = new Date().toISOString().slice(0, 10);

    const bannerEl = document.getElementById("err-modal-ongoing-banner");
    if (bannerEl) {
      if (isAutoContinuation || item.is_unresolved) {
        bannerEl.style.display = "block";
        bannerEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="font-size:0.78rem; color:#92400e;">
              🔄 <b>진행 중인 동일 지점 오류 이어쓰기</b> (최초발생: ${this.escapeHtml(item.first_occur_date)} · 상태: ${this.escapeHtml(item.error_status)})
            </div>
            ${this.pendingPrefill ? `
              <button type="button" class="btn btn-outline btn-sm" onclick="window.errorLedgerManager.openRegisterModal(window.errorLedgerManager.pendingPrefill, true)" style="background:#ffffff; font-size:0.72rem; padding:2px 8px; font-weight:700; color:#b45309; border-color:#f59e0b;">
                ➕ 별도 신규 건으로 전환
              </button>
            ` : ""}
          </div>
        `;
      } else {
        bannerEl.style.display = "none";
      }
    }

    const titleEl = document.getElementById("err-modal-title");
    if (titleEl) {
      titleEl.textContent = `✏️ [${item.station_name}] 조치·오류 이력 수정 (#${item.id})`;
    }
    const submitBtn = document.getElementById("err-form-submit-btn");
    if (submitBtn) submitBtn.textContent = "💾 변경사항 저장";

    this.populateModalSelects(item.station_code || item.station_name, item.error_code);

    const firstDateEl = document.getElementById("err-form-first-date");
    const checkDateEl = document.getElementById("err-form-check-date");
    if (firstDateEl) firstDateEl.value = item.first_occur_date || today;
    if (checkDateEl) checkDateEl.value = isAutoContinuation ? today : (item.check_date || today);

    const discSelect = document.getElementById("err-form-discoverer");
    if (discSelect) {
      const hasOpt = Array.from(discSelect.options).some(o => o.value === item.discoverer);
      if (!hasOpt && item.discoverer) {
        const opt = document.createElement("option");
        opt.value = item.discoverer;
        opt.textContent = item.discoverer;
        discSelect.appendChild(opt);
      }
      discSelect.value = item.discoverer || "미기록";
    }

    // Set Cause
    const causeSelect = document.getElementById("err-form-cause-select");
    if (causeSelect && item.cause_basis) {
      const hasCause = Array.from(causeSelect.options).some(o => o.value === item.cause_basis);
      if (!hasCause) {
        const opt = document.createElement("option");
        opt.value = item.cause_basis;
        opt.textContent = item.cause_basis;
        causeSelect.appendChild(opt);
      }
      causeSelect.value = item.cause_basis;
    }

    // Set Actor Category & Actual Worker (수기 저장된 값만 불러오고 자동 채우지 않음)
    const actorSelect = document.getElementById("err-form-actor-category");
    if (actorSelect) {
      actorSelect.value = item.action_actor_category || "용역사(RNS)";
    }

    const workerInput = document.getElementById("err-form-actual-worker");
    if (workerInput) {
      workerInput.value = item.actual_worker || "";
    }

    const reqSelect = document.getElementById("err-form-action-request");
    if (reqSelect && item.action_request) {
      const hasReq = Array.from(reqSelect.options).some(o => o.value === item.action_request);
      if (!hasReq) {
        const opt = document.createElement("option");
        opt.value = item.action_request;
        opt.textContent = item.action_request;
        reqSelect.appendChild(opt);
      }
      reqSelect.value = item.action_request;
    }

    this.selectStatus(item.error_status || "조치요청");
    const endDateEl = document.getElementById("err-form-end-date");
    if (endDateEl) endDateEl.value = item.end_date || "";

    const memoEl = document.getElementById("err-form-memo");
    if (memoEl) memoEl.value = item.memo || "";

    const modal = document.getElementById("monitoring-error-form-modal");
    if (modal) modal.classList.add("active");
  }

  closeFormModal() {
    const modal = document.getElementById("monitoring-error-form-modal");
    if (modal) modal.classList.remove("active");
    this.editingId = null;
    this.pendingPrefill = null;
  }

  async saveForm() {
    const stSelect = document.getElementById("err-form-station-select");
    if (!stSelect || stSelect.selectedIndex < 0) {
      alert("관측소를 선택해주세요.");
      return;
    }
    const opt = stSelect.options[stSelect.selectedIndex];
    const station_id = opt.dataset.id ? parseInt(opt.dataset.id, 10) : null;
    const station_code = opt.dataset.code || "";
    const station_name = opt.dataset.name || "";
    const assign = this.getStationAssignment(station_code, station_name);

    const error_code = document.getElementById("err-form-code-select")?.value || "EWSV-R01";
    const error_name = document.getElementById("err-form-error-name")?.value || "자료 미수신";
    const cause_basis = document.getElementById("err-form-cause-select")?.value || "Sender PC / 전송 프로그램 이상";

    const payload = {
      station_id,
      station_code,
      station_name,
      region: assign?.region || opt.dataset.region || "한강",
      install_method: assign?.install_method || opt.dataset.method || "EWSV",
      assigned_team: assign?.assigned_team || opt.dataset.team || "",
      assigned_manager: assign?.assigned_manager || opt.dataset.manager || "",
      first_occur_date: document.getElementById("err-form-first-date")?.value || new Date().toISOString().slice(0, 10),
      check_date: document.getElementById("err-form-check-date")?.value || new Date().toISOString().slice(0, 10),
      discoverer: document.getElementById("err-form-discoverer")?.value || "미기록",
      error_code,
      error_name,
      priority: document.getElementById("err-form-priority")?.value || "높음",
      phenomenon: error_name,
      cause_basis,
      action_actor_category: document.getElementById("err-form-actor-category")?.value || "용역사(RNS)",
      actual_worker: (document.getElementById("err-form-actual-worker")?.value || "").trim(),
      action_request: document.getElementById("err-form-action-request")?.value || "유지관리업체 점검요청",
      error_status: document.getElementById("err-form-status")?.value || "조치요청",
      end_date: document.getElementById("err-form-end-date")?.value || "",
      memo: (document.getElementById("err-form-memo")?.value || "").trim()
    };

    try {
      let res;
      if (this.editingId) {
        res = await window.apiClient.updateMonitoringErrorLog(this.editingId, payload);
      } else {
        res = await window.apiClient.createMonitoringErrorLog(payload);
      }

      if (!res.success) throw new Error(res.message);

      if (window.app) {
        window.app.showToast(res.message || "저장되었습니다.", "success");
      }

      this.closeFormModal();
      await this.loadLedger(true);

      if (window.monitorManager && window.monitorManager.currentStationActionId) {
        window.monitorManager.refreshStationActionHistory(
          window.monitorManager.currentStationActionId,
          station_code,
          station_name
        );
      }
    } catch (e) {
      console.error("Save monitoring error log failed:", e);
      alert("저장 실패: " + e.message);
    }
  }

  async quickResolve(id) {
    const item = this.logs.find(l => Number(l.id) === Number(id));
    if (!item) return;

    const today = new Date().toISOString().slice(0, 10);
    const updatedMemo = item.memo
      ? (item.memo.includes("조치완료") ? item.memo : `${item.memo} / 조치완료(${today})`)
      : `조치완료(${today})`;

    try {
      const res = await window.apiClient.updateMonitoringErrorLog(id, {
        error_status: "종료",
        check_date: today,
        end_date: today,
        memo: updatedMemo
      });
      if (!res.success) throw new Error(res.message);

      if (window.app) {
        window.app.showToast(`[${item.station_name}] 오류 건이 종료(완료) 처리되었습니다.`, "success");
      }
      await this.loadLedger(true);

      if (window.monitorManager && window.monitorManager.currentStationActionId) {
        window.monitorManager.refreshStationActionHistory(
          window.monitorManager.currentStationActionId,
          item.station_code,
          item.station_name
        );
      }
    } catch (e) {
      alert("완료 처리 실패: " + e.message);
    }
  }

  async deleteLog(id) {
    if (!confirm("이 오류관리대장 이력을 삭제하시겠습니까?")) return;
    try {
      const res = await window.apiClient.deleteMonitoringErrorLog(id);
      if (!res.success) throw new Error(res.message);
      if (window.app) window.app.showToast("이력이 삭제되었습니다.", "info");
      await this.loadLedger(true);
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  }

  // =========================================================
  // DEDICATED STATION ASSIGNMENTS MANAGER MODAL (지점 담당자 관리 & 엑셀 일괄 업로드)
  // =========================================================
  async openStationAssignmentsModal() {
    await this.loadMetadata();
    this.renderStationAssignmentsTable();
    const modal = document.getElementById("station-assignments-modal");
    if (modal) modal.classList.add("active");
  }

  closeStationAssignmentsModal() {
    const modal = document.getElementById("station-assignments-modal");
    if (modal) modal.classList.remove("active");
  }

  onStationAssignFilterRegionChange(regionVal) {
    const teamSel = document.getElementById("st-assign-filter-team");
    if (teamSel) {
      if (!regionVal || regionVal === "all") {
        teamSel.innerHTML = `
          <option value="all">전체 담당팀</option>
          <option value="1">1팀</option>
          <option value="2">2팀</option>
          <option value="3">3팀</option>
          <option value="4">4팀</option>
          <option value="5">5팀</option>
          <option value="6">6팀 (한강·낙동강)</option>
        `;
      } else {
        const basin = this.normalizeBasin(regionVal);
        const maxT = this.basinMaxTeams[basin] || 6;
        let opts = `<option value="all">${basin} 전체 (1~${maxT}팀)</option>`;
        for (let t = 1; t <= maxT; t++) {
          opts += `<option value="${t}">${basin} ${t}팀</option>`;
        }
        teamSel.innerHTML = opts;
      }
      teamSel.value = "all";
    }
    this.renderStationAssignmentsTable();
  }

  getCombinedStationAssignmentsList() {
    const allStations = window.dataManager ? window.dataManager.getAll() : [];
    const seenCodes = new Set();
    const list = [];

    // 1. From stationAssignments (시설목록 176+ stations)
    for (const a of this.stationAssignments) {
      const code = String(a.station_code || "").trim();
      if (code) seenCodes.add(code);
      list.push({
        station_code: code,
        station_name: a.station_name || "",
        region: this.normalizeBasin(a.region || "한강"),
        install_method: a.install_method || "EWSV",
        assigned_team: String(a.assigned_team || "1").replace(/팀/g, "").trim(),
        assigned_manager: a.assigned_manager || ""
      });
    }

    // 2. Include any remaining stations from dataManager not yet in stationAssignments
    for (const s of allStations) {
      const code = String(s.code || "").trim();
      if (code && seenCodes.has(code)) continue;
      const existingByName = this.getStationAssignment(code, s.name);
      if (existingByName) continue;
      list.push({
        station_code: code || String(s.id),
        station_name: s.name || "",
        region: this.normalizeBasin(s.basin || s.region || "한강"),
        install_method: s.gaugeType || "EWSV",
        assigned_team: "1",
        assigned_manager: ""
      });
    }

    return list;
  }

  renderStationAssignmentsTable() {
    const tbody = document.getElementById("st-assign-tbody");
    const countEl = document.getElementById("st-assign-count");
    if (!tbody) return;

    const regionFilter = document.getElementById("st-assign-filter-region")?.value || "all";
    const teamFilter = document.getElementById("st-assign-filter-team")?.value || "all";
    const kw = (document.getElementById("st-assign-search-input")?.value || "").trim().toLowerCase();

    const fullList = this.getCombinedStationAssignmentsList();
    const filtered = fullList.filter(item => {
      if (regionFilter !== "all" && item.region !== regionFilter) return false;
      if (teamFilter !== "all" && String(item.assigned_team) !== String(teamFilter)) return false;
      if (kw) {
        return (
          (item.station_name || "").toLowerCase().includes(kw) ||
          (item.station_code || "").toLowerCase().includes(kw) ||
          (item.assigned_manager || "").toLowerCase().includes(kw)
        );
      }
      return true;
    });

    if (countEl) countEl.textContent = filtered.length.toLocaleString();

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2.5rem; color:#94a3b8;">조건에 해당하는 관측소가 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((item, idx) => {
      const rowKey = `${item.station_code || idx}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      const basin = this.normalizeBasin(item.region);
      const maxTeams = this.basinMaxTeams[basin] || 6;
      let teamOpts = "";
      for (let t = 1; t <= maxTeams; t++) {
        const isSel = String(item.assigned_team) === String(t) ? "selected" : "";
        teamOpts += `<option value="${t}" ${isSel}>${basin} ${t}팀</option>`;
      }

      return `
        <tr>
          <td style="text-align:center; color:#64748b; font-weight:700;">${idx + 1}</td>
          <td style="text-align:center;"><code style="font-size:0.77rem; font-weight:700; color:#334155;">${this.escapeHtml(item.station_code)}</code></td>
          <td style="font-weight:800; color:#0f172a;">📍 ${this.escapeHtml(item.station_name)}</td>
          <td style="text-align:center;"><span class="badge ${item.install_method === "ADVM" ? "badge-blue" : "badge-cyan"}" style="font-size:0.7rem;">${this.escapeHtml(item.install_method)}</span></td>
          <td style="text-align:center;">
            <select id="st-assign-reg-${rowKey}" class="form-select" onchange="window.errorLedgerManager.onInlineAssignRegionChange('${rowKey}', this.value)" style="height:32px !important; min-height:32px !important; padding:0 24px 0 8px !important; font-size:0.78rem !important; font-weight:700;">
              <option value="한강" ${basin === "한강" ? "selected" : ""}>한강 (1~6팀)</option>
              <option value="낙동강" ${basin === "낙동강" ? "selected" : ""}>낙동강 (1~6팀)</option>
              <option value="금강" ${basin === "금강" ? "selected" : ""}>금강 (1~5팀)</option>
              <option value="영산강" ${basin === "영산강" ? "selected" : ""}>영산강 (1~5팀)</option>
            </select>
          </td>
          <td style="text-align:center;">
            <select id="st-assign-team-${rowKey}" class="form-select" style="height:32px !important; min-height:32px !important; padding:0 24px 0 8px !important; font-size:0.78rem !important; font-weight:700;">
              ${teamOpts}
            </select>
          </td>
          <td style="text-align:center;">
            <input type="text" id="st-assign-mgr-${rowKey}" class="form-input" value="${this.escapeHtml(item.assigned_manager)}" placeholder="담당자 성명 입력" style="height:32px !important; min-height:32px !important; padding:0 8px !important; font-size:0.8rem !important; font-weight:700; text-align:center;">
          </td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.errorLedgerManager.saveInlineStationAssignment('${rowKey}', '${this.escapeHtml(item.station_code)}', '${this.escapeHtml(item.station_name)}', '${this.escapeHtml(item.install_method)}')" style="padding:4px 10px; font-size:0.74rem; font-weight:800;">
              💾 저장
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  onInlineAssignRegionChange(rowKey, basinVal) {
    const basin = this.normalizeBasin(basinVal);
    const maxTeams = this.basinMaxTeams[basin] || 6;
    const teamEl = document.getElementById(`st-assign-team-${rowKey}`);
    if (!teamEl) return;
    const prevTeam = teamEl.value || "1";
    let opts = "";
    for (let t = 1; t <= maxTeams; t++) {
      opts += `<option value="${t}">${basin} ${t}팀</option>`;
    }
    teamEl.innerHTML = opts;
    teamEl.value = Number(prevTeam) <= maxTeams ? prevTeam : "1";
  }

  async saveInlineStationAssignment(rowKey, stationCode, stationName, installMethod) {
    const region = document.getElementById(`st-assign-reg-${rowKey}`)?.value || "한강";
    const assigned_team = document.getElementById(`st-assign-team-${rowKey}`)?.value || "1";
    const assigned_manager = (document.getElementById(`st-assign-mgr-${rowKey}`)?.value || "").trim();

    if (!assigned_manager) {
      alert("지점 담당자 성명을 입력해주세요.");
      return;
    }

    try {
      const res = await window.apiClient.updateStationAssignment({
        station_code: stationCode,
        station_name: stationName,
        region,
        install_method: installMethod,
        assigned_team,
        assigned_manager
      });
      if (!res.success) throw new Error(res.message);

      await this.loadMetadata();
      await this.loadLedger(true);
      if (window.app) {
        window.app.showToast(`✓ [${stationName}] 지점 담당자가 '${region} ${assigned_team}팀 ${assigned_manager}'(으)로 저장되었습니다.`, "success");
      }
    } catch (e) {
      alert("지점 담당자 저장 실패: " + e.message);
    }
  }

  exportStationAssignmentsExcel() {
    if (typeof XLSX === "undefined") {
      alert("엑셀 라이브러리를 불러오지 못했습니다.");
      return;
    }

    const fullList = this.getCombinedStationAssignmentsList();
    const headers = ["No", "수계(권역)", "관측소코드", "관측소명", "측정방식", "담당팀(숫자)", "지점담당자", "수계별_담당표기(참고)"];
    const rows = fullList.map((item, idx) => [
      idx + 1,
      item.region || "한강",
      item.station_code || "",
      item.station_name || "",
      item.install_method || "EWSV",
      item.assigned_team || "1",
      item.assigned_manager || "",
      this.formatBasinTeamManager(item.region, item.assigned_team, item.assigned_manager)
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [
      { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "시설목록");

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `HydroHub_지점별_담당자_관리양식_${today}.xlsx`);
    if (window.app) {
      window.app.showToast("📥 지점별 담당자 엑셀 양식이 다운로드되었습니다. 수정 후 업로드하시면 일괄 반영됩니다.", "info");
    }
  }

  async handleStationAssignmentsExcelUpload(file) {
    if (!file || typeof XLSX === "undefined") return;

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });

      // Prefer '시설목록' or '지점별_담당자_현황' sheet if present, otherwise first sheet
      const targetSheetName = wb.SheetNames.find(n => n.includes("시설목록") || n.includes("담당자")) || wb.SheetNames[0];
      const ws = wb.Sheets[targetSheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      if (!aoa || aoa.length < 2) {
        alert("엑셀 파일에서 데이터를 찾을 수 없습니다.");
        return;
      }

      // Auto-detect header row (looks for '관측소' and '담당')
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(10, aoa.length); i++) {
        const rowStr = (aoa[i] || []).map(c => String(c || "").trim()).join("|");
        if (rowStr.includes("관측소") && (rowStr.includes("담당") || rowStr.includes("팀"))) {
          headerRowIdx = i;
          break;
        }
      }

      const headers = (aoa[headerRowIdx] || []).map(h => String(h || "").replace(/\s+/g, "").toLowerCase());
      const findCol = (keywords) => headers.findIndex(h => keywords.some(k => h.includes(k)));

      const codeCol = findCol(["관측소코드", "지점코드", "코드", "code"]);
      const nameCol = findCol(["관측소명", "관측소", "지점명", "표준관측소명"]);
      const regCol = findCol(["권역", "수계", "유역", "region"]);
      const methodCol = findCol(["설치방식", "측정방식", "방식", "형식"]);
      const teamCol = findCol(["담당팀", "팀"]);
      const mgrCol = findCol(["지점담당자", "담당자", "성명"]);

      if ((codeCol < 0 && nameCol < 0) || mgrCol < 0) {
        alert("엑셀 헤더에서 [관측소코드/관측소명] 및 [담당자] 열을 찾을 수 없습니다.\n다운로드한 양식 또는 기존 엑셀(시설목록 시트)을 사용해주세요.");
        return;
      }

      const records = [];
      for (let r = headerRowIdx + 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!row || row.length === 0) continue;
        const station_code = codeCol >= 0 ? String(row[codeCol] || "").trim() : "";
        const station_name = nameCol >= 0 ? String(row[nameCol] || "").trim() : "";
        const assigned_manager = String(row[mgrCol] || "").trim();
        if ((!station_code && !station_name) || !assigned_manager) continue;

        const rawRegion = regCol >= 0 ? String(row[regCol] || "").trim() : "";
        const region = rawRegion ? this.normalizeBasin(rawRegion) : "";
        const install_method = methodCol >= 0 ? String(row[methodCol] || "EWSV").trim() : "EWSV";
        let assigned_team = teamCol >= 0 ? String(row[teamCol] || "1").replace(/[^0-9]/g, "").trim() : "1";
        if (!assigned_team) assigned_team = "1";

        // Validate max teams per basin (한강/낙동강 1~6, 금강/영산강 1~5)
        if (region && this.basinMaxTeams[region] && Number(assigned_team) > this.basinMaxTeams[region]) {
          assigned_team = String(this.basinMaxTeams[region]);
        }

        records.push({
          station_code,
          station_name,
          region,
          install_method,
          assigned_team,
          assigned_manager
        });
      }

      if (records.length === 0) {
        alert("업로드할 유효한 지점 담당자 데이터가 없습니다.");
        return;
      }

      if (!confirm(`[${file.name}] 시트(${targetSheetName})에서 총 ${records.length}개 관측소의 지점 담당자 정보를 확인했습니다.\n시스템에 일괄 반영하시겠습니까?`)) {
        return;
      }

      const res = await window.apiClient.bulkUpdateStationAssignments(records);
      if (!res.success) throw new Error(res.message);

      await this.loadMetadata();
      this.renderStationAssignmentsTable();
      await this.loadLedger(true);

      if (window.app) {
        window.app.showToast(`✓ 총 ${res.count}개 관측소의 지점 담당자 정보가 엑셀에서 일괄 반영되었습니다!`, "success");
      }
    } catch (e) {
      console.error("Excel station assignment upload error:", e);
      alert("엑셀 업로드 처리 중 오류가 발생했습니다: " + e.message);
    }
  }

  // =========================================================
  // RULE CODEBOOK REFERENCE MODAL (HydroMonitor 기준)
  // =========================================================
  async openCodebookModal() {
    this.renderCodebookTable();
    const modal = document.getElementById("monitoring-codebook-modal");
    if (modal) modal.classList.add("active");
  }

  closeCodebookModal() {
    const modal = document.getElementById("monitoring-codebook-modal");
    if (modal) modal.classList.remove("active");
  }

  renderCodebookTable() {
    const tbody = document.getElementById("codebook-table-tbody");
    if (!tbody) return;
    const eqFilter = document.getElementById("codebook-filter-eq")?.value || "all";
    const kw = (document.getElementById("codebook-search-input")?.value || "").trim().toLowerCase();

    const filtered = this.hydroMonitorRules.filter(r => {
      const eq = r.method === "COMMON" ? "공통" : r.method;
      if (eqFilter !== "all" && eq !== eqFilter) return false;
      if (kw) {
        return (
          r.code.toLowerCase().includes(kw) ||
          r.name.toLowerCase().includes(kw) ||
          r.desc.toLowerCase().includes(kw) ||
          r.defaultCause.toLowerCase().includes(kw)
        );
      }
      return true;
    });

    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td><code style="font-weight:800; color:#b91c1c; background:#fee2e2; padding:2px 6px; border-radius:4px;">${this.escapeHtml(r.code)}</code></td>
        <td style="text-align:center;"><b>${this.escapeHtml(r.method === "COMMON" ? "공통" : r.method)}</b></td>
        <td style="font-weight:700; color:#0f172a;">${this.escapeHtml(r.name)}</td>
        <td style="text-align:center;">${this.escapeHtml(r.priority)}</td>
        <td style="font-size:0.78rem; color:#334155;">${this.escapeHtml(r.desc)}</td>
        <td style="font-size:0.78rem; color:#0369a1;">원시자료 및 계통 상태 확인</td>
        <td style="font-size:0.78rem; color:#15803d; font-weight:600;">${this.escapeHtml(r.defaultCause)} 점검·조치</td>
      </tr>
    `).join("");
  }

  // =========================================================
  // MULTI-SHEET FORMATTED EXCEL EXPORT (.xlsx)
  // =========================================================
  exportExcel() {
    const unifiedFiltered = this.getFilteredUnifiedRows();
    if ((!this.logs || this.logs.length === 0) && unifiedFiltered.length === 0) {
      alert("내보낼 이력 데이터가 없습니다.");
      return;
    }

    if (typeof XLSX === "undefined") {
      alert("엑셀 생성 라이브러리를 불러오지 못했습니다.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const stObj = this.getSelectedStationObject();
    const stationPrefix = stObj ? `${stObj.name}_` : "";

    // 1. Sheet 1: 모니터링 + 유지관리 통합 타임라인
    const unifiedHeaders = [
      "No",
      "이력구분",
      "발생/작업일자",
      "확인/종료/작업구분",
      "진행상태",
      "지속일수(일)",
      "수계(권역)",
      "관측소코드",
      "관측소명",
      "측정방식",
      "담당팀",
      "지점담당자",
      "진단규칙 / 조치코드",
      "표준오류명 / 조치유형명",
      "추정원인 / 교체장비·부품(S/N)",
      "조치배정 / 수행구분",
      "실제 조치자 / 출동작업자",
      "발견자(모니터링)",
      "조치요청 / 작업요약",
      "상세 조치내용 및 경과 (비고)"
    ];

    const unifiedRowsAoA = unifiedFiltered.map((item, idx) => {
      const basin = this.normalizeBasin(item.region || "한강");
      const teamLabel = item.assigned_team ? `${basin} ${item.assigned_team}팀` : "-";
      return [
        idx + 1,
        item.source === "MAINTENANCE" ? "현장 유지관리·교체" : "모니터링 조치·오류",
        item.date || "",
        item.subDate || "-",
        item.status || "",
        item.duration_days !== null && item.duration_days !== undefined ? item.duration_days : "-",
        basin,
        item.station_code || "",
        item.station_name || "",
        item.install_method || "-",
        teamLabel,
        item.assigned_manager || "-",
        item.code || "",
        item.title || "",
        item.cause_or_part || "-",
        item.actor_category || "",
        item.worker || "-",
        item.discoverer || "-",
        item.action_summary || "-",
        item.detail || ""
      ];
    });

    const wsUnified = XLSX.utils.aoa_to_sheet([unifiedHeaders, ...unifiedRowsAoA]);
    wsUnified["!cols"] = [
      { wch: 6 },  // No
      { wch: 18 }, // 이력구분
      { wch: 13 }, // 일자
      { wch: 16 }, // 확인/종료
      { wch: 11 }, // 상태
      { wch: 11 }, // 지속일수
      { wch: 10 }, // 수계
      { wch: 12 }, // 관측소코드
      { wch: 22 }, // 관측소명
      { wch: 10 }, // 측정방식
      { wch: 13 }, // 담당팀
      { wch: 12 }, // 지점담당자
      { wch: 18 }, // 규칙/조치코드
      { wch: 24 }, // 오류명/조치유형
      { wch: 36 }, // 추정원인/교체내역
      { wch: 18 }, // 조치구분
      { wch: 18 }, // 실제조치자
      { wch: 13 }, // 발견자
      { wch: 24 }, // 조치요청
      { wch: 52 }  // 상세내용
    ];
    XLSX.utils.book_append_sheet(wb, wsUnified, "1.통합이력(모니터링+유지관리)");

    // 2. Sheet 2: 모니터링 조치·오류관리대장 (전용 시트)
    const ledgerHeaders = [
      "No",
      "최초발생일",
      "최근확인일",
      "종료일",
      "지속일수(일)",
      "진행상태",
      "수계(권역)",
      "관측소코드",
      "관측소명",
      "측정방식",
      "담당팀",
      "지점담당자",
      "발견자(모니터링)",
      "HydroMonitor 규칙코드",
      "표준 오류명",
      "우선순위",
      "추정 원인",
      "조치 배정 구분",
      "실제 조치자(수기)",
      "조치 요청/수행 내용",
      "상세 비고 (조치내용 및 경과)"
    ];

    const ledgerRows = this.logs.map((r, idx) => {
      const basin = this.normalizeBasin(r.region || "한강");
      const teamLabel = r.assigned_team ? `${basin} ${r.assigned_team}팀` : "-";
      return [
        idx + 1,
        r.first_occur_date || "",
        r.check_date || "",
        r.end_date || "-",
        r.duration_days !== null && r.duration_days !== undefined ? r.duration_days : 0,
        r.error_status || "",
        basin,
        r.station_code || "",
        r.station_name || "",
        r.install_method || "",
        teamLabel,
        r.assigned_manager || "-",
        r.discoverer || "미기록",
        r.error_code || "",
        r.error_name || "",
        r.priority || "",
        r.cause_basis || "-",
        r.action_actor_category || "",
        r.actual_worker || "",
        r.action_request || "-",
        r.memo || ""
      ];
    });

    const wsLedger = XLSX.utils.aoa_to_sheet([ledgerHeaders, ...ledgerRows]);
    wsLedger["!cols"] = [
      { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 11 },
      { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 11 }, { wch: 13 }, { wch: 12 },
      { wch: 14 }, { wch: 19 }, { wch: 26 }, { wch: 9 }, { wch: 32 }, { wch: 18 },
      { wch: 16 }, { wch: 24 }, { wch: 52 }
    ];
    XLSX.utils.book_append_sheet(wb, wsLedger, "2.모니터링_오류관리대장");

    // 3. Sheet 3: 현장 유지관리·장비교체 이력 (전용 시트)
    const maintOnly = unifiedFiltered.filter(i => i.source === "MAINTENANCE");
    const maintHeaders = [
      "No", "작업일자", "작업번호", "작업구분", "수계(권역)", "관측소코드", "관측소명",
      "지점담당자", "조치코드", "표준 조치유형", "교체 내역(전/후 S/N) 및 투입부품", "출동 작업자", "상세 조치내역"
    ];
    const maintRows = maintOnly.map((m, idx) => [
      idx + 1,
      m.date || "",
      m.work_no || "-",
      m.subDate || "현장점검",
      this.normalizeBasin(m.region || "한강"),
      m.station_code || "",
      m.station_name || "",
      this.formatBasinTeamManager(m.region, m.assigned_team, m.assigned_manager),
      m.code || "",
      m.title || "",
      m.cause_or_part || "-",
      m.worker || "-",
      m.detail || ""
    ]);
    const wsMaint = XLSX.utils.aoa_to_sheet([maintHeaders, ...maintRows]);
    wsMaint["!cols"] = [
      { wch: 6 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 38 }, { wch: 18 }, { wch: 50 }
    ];
    XLSX.utils.book_append_sheet(wb, wsMaint, "3.현장유지관리_교체이력");

    // 4. Sheet 4: 지점별 담당자 현황 (시설목록 호환 시트)
    const assignList = this.getCombinedStationAssignmentsList();
    const assignHeaders = ["No", "수계(권역)", "관측소코드", "관측소명", "측정방식", "담당팀(숫자)", "지점담당자", "수계별_담당표기"];
    const assignRows = assignList.map((a, idx) => [
      idx + 1,
      a.region || "한강",
      a.station_code || "",
      a.station_name || "",
      a.install_method || "EWSV",
      a.assigned_team || "1",
      a.assigned_manager || "",
      this.formatBasinTeamManager(a.region, a.assigned_team, a.assigned_manager)
    ]);
    const wsAssign = XLSX.utils.aoa_to_sheet([assignHeaders, ...assignRows]);
    wsAssign["!cols"] = [
      { wch: 6 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 22 }
    ];
    XLSX.utils.book_append_sheet(wb, wsAssign, "4.시설목록(지점담당자)");

    // 5. Sheet 5: 지점별 조치 종합 집계 현황 (151개소 요약)
    const stSummaryList = this.getStationSummaryData();
    const stSummaryHeaders = ["순위", "관측소명", "관측소코드", "수계(권역)", "담당팀", "측정방식", "지점담당자", "총 이력건수", "모니터링 조치건수", "미종료 오류건수", "현장 유지관리건수", "최근 조치일자", "최근 조치·오류 요약"];
    const stSummaryRows = stSummaryList.map((s, idx) => [
      idx + 1,
      s.name,
      s.code,
      s.region,
      s.team ? `${s.team}팀` : "-",
      s.method,
      s.manager || "미지정",
      s.totalCount,
      s.monitoringCount,
      s.unresolvedCount,
      s.maintenanceCount,
      s.latestDate || "-",
      s.latestSummary || "-"
    ]);
    const wsSummary = XLSX.utils.aoa_to_sheet([stSummaryHeaders, ...stSummaryRows]);
    wsSummary["!cols"] = [
      { wch: 6 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 45 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, "5.지점별_조치종합집계");

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `HydroHub_${stationPrefix}모니터링_유지관리_통합이력대장_${today}.xlsx`);
    if (window.app) {
      window.app.showToast(`📥 총 ${unifiedFiltered.length}건(모니터링+유지관리)의 통합 이력 엑셀(.xlsx)이 다운로드되었습니다.`, "success");
    }
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

window.errorLedgerManager = new ErrorLedgerManager();
