/**
 * ExcelManager
 * Handles Professional Styled Multi-Sheet Excel (.xlsx) Export, Modular Tab Exports, 
 * and Full System Snapshot JSON Backup / Restore.
 * Powered by xlsx-js-style for rich colors, borders, font formatting, and auto-fitting column widths.
 */
class ExcelManager {
  constructor() {
    this.defaultFont = "맑은 고딕";
  }

  // =========================================================================
  // 1. STYLING UTILITIES (Borders, Headers, Status Highlights, Column Widths)
  // =========================================================================
  getStyles(headerBg = "1E3A8A") {
    const thinBorder = { style: "thin", color: { rgb: "CBD5E1" } };
    const borderAll = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
    const headerBorder = {
      top: { style: "thin", color: { rgb: "94A3B8" } },
      bottom: { style: "medium", color: { rgb: "0F172A" } },
      left: { style: "thin", color: { rgb: "94A3B8" } },
      right: { style: "thin", color: { rgb: "94A3B8" } }
    };

    return {
      titleBanner: {
        fill: { fgColor: { rgb: "0F172A" } },
        font: { name: this.defaultFont, sz: 14, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "left", vertical: "center", indent: 1 }
      },
      subBanner: {
        fill: { fgColor: { rgb: "1E293B" } },
        font: { name: this.defaultFont, sz: 9.5, italic: true, color: { rgb: "94A3B8" } },
        alignment: { horizontal: "left", vertical: "center", indent: 1 }
      },
      header: {
        fill: { fgColor: { rgb: headerBg } },
        font: { name: this.defaultFont, sz: 10, bold: true, color: { rgb: "FFFFFF" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: headerBorder
      },
      cellLeft: {
        font: { name: this.defaultFont, sz: 9.5, color: { rgb: "1E293B" } },
        alignment: { horizontal: "left", vertical: "center" },
        border: borderAll
      },
      cellCenter: {
        font: { name: this.defaultFont, sz: 9.5, color: { rgb: "1E293B" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: borderAll
      },
      cellRight: {
        font: { name: this.defaultFont, sz: 9.5, color: { rgb: "1E293B" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: borderAll
      },
      cellZebraLeft: {
        fill: { fgColor: { rgb: "F8FAFC" } },
        font: { name: this.defaultFont, sz: 9.5, color: { rgb: "1E293B" } },
        alignment: { horizontal: "left", vertical: "center" },
        border: borderAll
      },
      cellZebraCenter: {
        fill: { fgColor: { rgb: "F8FAFC" } },
        font: { name: this.defaultFont, sz: 9.5, color: { rgb: "1E293B" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: borderAll
      },
      cellZebraRight: {
        fill: { fgColor: { rgb: "F8FAFC" } },
        font: { name: this.defaultFont, sz: 9.5, color: { rgb: "1E293B" } },
        alignment: { horizontal: "right", vertical: "center" },
        border: borderAll
      },
      statusGreen: {
        fill: { fgColor: { rgb: "DCFCE7" } },
        font: { name: this.defaultFont, sz: 9.5, bold: true, color: { rgb: "166534" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: borderAll
      },
      statusAmber: {
        fill: { fgColor: { rgb: "FEF3C7" } },
        font: { name: this.defaultFont, sz: 9.5, bold: true, color: { rgb: "92400E" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: borderAll
      },
      statusRed: {
        fill: { fgColor: { rgb: "FEE2E2" } },
        font: { name: this.defaultFont, sz: 9.5, bold: true, color: { rgb: "991B1B" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: borderAll
      },
      statusBlue: {
        fill: { fgColor: { rgb: "EFF6FF" } },
        font: { name: this.defaultFont, sz: 9.5, bold: true, color: { rgb: "1E40AF" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: borderAll
      },
      statusPurple: {
        fill: { fgColor: { rgb: "F3E8FF" } },
        font: { name: this.defaultFont, sz: 9.5, bold: true, color: { rgb: "6B21A8" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: borderAll
      }
    };
  }

  calculateColWidths(headers, rows) {
    const colWidths = headers.map(h => {
      let len = 0;
      for (const char of String(h)) {
        len += char.charCodeAt(0) > 127 ? 2.1 : 1.1;
      }
      return Math.max(10, Math.ceil(len + 4));
    });

    for (const row of rows) {
      row.forEach((val, colIdx) => {
        if (val !== null && val !== undefined) {
          const str = String(val);
          let len = 0;
          for (const char of str) {
            len += char.charCodeAt(0) > 127 ? 2.1 : 1.1;
          }
          if (len + 3 > colWidths[colIdx]) {
            colWidths[colIdx] = Math.min(65, Math.ceil(len + 3));
          }
        }
      });
    }

    return colWidths.map(w => ({ wch: w }));
  }

  buildStyledSheet(title, subtitle, headers, rows, options = {}) {
    const headerBg = options.headerBg || "1E3A8A";
    const styles = this.getStyles(headerBg);
    const aligns = options.aligns || [];
    const numFmts = options.numFmts || [];
    const statusCols = options.statusCols || [];

    const aoa = [];
    let startRowIdx = 0;

    if (title) {
      aoa.push([title]);
      aoa.push([subtitle || `기준일시: ${new Date().toLocaleString("ko-KR")} | 한국수자원조사기술원 자동유량관측시설 관리시스템`]);
      aoa.push([]); // blank spacing row
      startRowIdx = 3;
    }

    const headerRowIdx = startRowIdx;
    aoa.push(headers);

    for (const r of rows) {
      aoa.push(r);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Merges for title banner
    if (title) {
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }
      ];
    }

    // Set Row Heights
    const rowHeights = [];
    if (title) {
      rowHeights.push({ hpt: 30 }); // Title
      rowHeights.push({ hpt: 18 }); // Subtitle
      rowHeights.push({ hpt: 8 });  // Gap
    }
    rowHeights.push({ hpt: 26 }); // Header
    for (let i = 0; i < rows.length; i++) {
      rowHeights.push({ hpt: 20 }); // Data rows
    }
    ws["!rows"] = rowHeights;

    // Set Column Widths
    ws["!cols"] = this.calculateColWidths(headers, rows);

    // Apply Cell Styles
    const totalCols = headers.length;
    const totalRows = aoa.length;

    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) continue;

        if (title && r === 0) {
          ws[cellRef].s = styles.titleBanner;
        } else if (title && r === 1) {
          ws[cellRef].s = styles.subBanner;
        } else if (title && r === 2) {
          // spacing
        } else if (r === headerRowIdx) {
          ws[cellRef].s = styles.header;
        } else {
          // Data Row
          const isZebra = (r - headerRowIdx) % 2 === 0;
          const align = aligns[c] || "left";
          const val = ws[cellRef].v;
          const strVal = String(val || "").trim();

          let appliedStyle = null;

          // Check Status Column Highlights
          if (statusCols.includes(c)) {
            if (["완료", "정상운영", "설치완료", "○", "O", "y", "Y", "적합"].includes(strVal)) {
              appliedStyle = styles.statusGreen;
            } else if (["대기", "진행중", "미설치", "대기중", "시험·검정중", "추진중"].includes(strVal)) {
              appliedStyle = styles.statusAmber;
            } else if (["미운영", "추가조치필요", "경계", "부적합", "장애"].includes(strVal)) {
              appliedStyle = styles.statusRed;
            } else if (strVal.includes("기술원")) {
              appliedStyle = styles.statusBlue;
            } else if (strVal.includes("리버앤씨") || strVal.includes("RNS")) {
              appliedStyle = styles.statusAmber;
            } else if (["EWSV", "ADVM", "DUAL"].includes(strVal) || strVal.length > 0) {
              appliedStyle = styles.statusPurple;
            }
          }

          if (!appliedStyle) {
            if (align === "center") appliedStyle = isZebra ? styles.cellZebraCenter : styles.cellCenter;
            else if (align === "right") appliedStyle = isZebra ? styles.cellZebraRight : styles.cellRight;
            else appliedStyle = isZebra ? styles.cellZebraLeft : styles.cellLeft;
          }

          ws[cellRef].s = appliedStyle;

          // Number Formats
          if (numFmts[c] && typeof val === "number") {
            ws[cellRef].z = numFmts[c];
          }
        }
      }
    }

    return ws;
  }

  // =========================================================================
  // 2. MASTER MULTI-SHEET EXCEL EXPORT (All 5 Core Datasets in One .xlsx)
  // =========================================================================
  async exportMasterPack() {
    if (window.apiClient && window.apiClient.user?.role !== "admin") {
      alert("전국 시설 종합 마스터팩 일괄 다운로드는 최고 관리자(admin) 전용 기능입니다.\n개별 엑셀 파일은 각 업무 메뉴(관측시설, 유지관리, 검정, 일정표) 화면에서 직접 다운로드해 주세요.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const today = new Date().toISOString().slice(0, 10);
    const todayFormatted = today.replace(/-/g, "");

    // -------------------------------------------------------------
    // SHEET 1: 전국 관측시설 종합 제원 및 현황 (223개소)
    // -------------------------------------------------------------
    const stations = window.dataManager.getAll();
    const sheet1Headers = [
      "연번", "관할권역", "하천명", "지점명(관측소)", "지점코드", "위치(주소)",
      "경도(DMS)", "위도(DMS)", "경도(십진수)", "위도(십진수)",
      "설치년도", "관측개시년도", "2026년 운영여부", "설치방향", "설치방식", "국사형태",
      "홍수특보", "갈수예보", "배수영향", "조위영향", "오염총량",
      "유속계 형식", "이중화여부", "ADVM 수량(대)", "EWSV 수량(대)",
      "26년 검정대상", "26년 검정수량(대)", "태양광 설치", "기준수위(m)", "수위계 방식",
      "RV박스 상태", "로거PC 에이전트", "샌더PC 에이전트", "특이사항 및 비고"
    ];

    const sheet1Rows = stations.map(st => {
      const isDual = st.isDualGauge || st.gaugeCategory === "DUAL";
      const rv = st.rvBox || {};
      const rvStatus = st.rvBoxStatus || (st.rvBoxInstalled === true ? "설치완료" : (st.rvBoxInstalled === false ? "미설치" : "대상외"));
      const loggerAgent = rv.logger?.agentName || (st.rvBoxAgents && st.rvBoxAgents.find(a => a.endsWith("_L"))) || "-";
      const senderAgent = rv.sender?.agentName || (st.rvBoxAgents && st.rvBoxAgents.find(a => a.endsWith("_S"))) || "-";

      return [
        st.seq || st.id,
        st.region || "",
        st.river || "",
        st.name || "",
        st.code || "",
        st.address || "",
        st.coords?.lonDMS || "",
        st.coords?.latDMS || "",
        st.coords?.lon || "",
        st.coords?.lat || "",
        st.installYear || "",
        st.obsStartYear || "",
        st.isOperating2026 ? "정상운영" : "미운영",
        st.installDirection || "",
        st.mountType || "-",
        st.shelterType || "-",
        st.floodAlert ? "○" : "-",
        st.droughtAlert ? "○" : "-",
        st.drainage ? "○" : "-",
        st.tide ? "○" : "-",
        st.pollutionTotal ? "○" : "-",
        st.gaugeType || "",
        isDual ? "이중화" : "단독",
        st.advmCount || "0",
        st.ewsvCount || "0",
        st.calib2026 ? "대상지점" : "-",
        st.calibCount2026 || "0",
        st.solarInstall ? "설치" : "-",
        st.refWaterLevel || "-",
        st.waterLevelType || "-",
        rvStatus,
        loggerAgent,
        senderAgent,
        st.memo || ""
      ];
    });

    const sheet1Aligns = [
      "center", "center", "center", "left", "center", "left",
      "center", "center", "right", "right",
      "center", "center", "center", "center", "center", "center",
      "center", "center", "center", "center", "center",
      "center", "center", "center", "center",
      "center", "center", "center", "center", "center",
      "center", "left", "left", "left"
    ];

    const sheet1StatusCols = [12, 16, 17, 18, 19, 20, 22, 25, 27, 30];

    const ws1 = this.buildStyledSheet(
      "🌊 한국수자원조사기술원 전국 자동유량관측시설 종합 제원 대장",
      `총 ${stations.length}개소 관측시설 마스터 데이터 | 기준일: ${today}`,
      sheet1Headers,
      sheet1Rows,
      { headerBg: "1E3A8A", aligns: sheet1Aligns, statusCols: sheet1StatusCols }
    );
    XLSX.utils.book_append_sheet(wb, ws1, "1.시설마스터_총괄제원");

    // -------------------------------------------------------------
    // SHEET 2: 2026년 유지관리 18종 과업 총괄 현황표
    // -------------------------------------------------------------
    const sheet2Headers = [
      "연번", "권역", "하천명", "관측소명", "지점코드", "과업건수", "완료건수", "추진율(%)",
      "자동복구누전차단기", "배터리교체", "태양광판넬", "소화기(RNS)", "소화기(기술원)",
      "DP컨버터", "Win11업그레이드", "로거(Logger)", "샌더(Sender)", "리모트뷰박스",
      "유속계이중화", "수위계점검", "풍향풍속계", "시설현황판", "점용표지(낙동)", "점용표지(영산)",
      "CCTV유선", "CCTV신규", "NVR설치"
    ];

    const taskKeys = [
      "circuitBreaker", "battery", "solarPanel", "extinguisherRns", "extinguisherKihs",
      "dpConverter", "osUpgrade", "logger", "sender", "rvBox",
      "dualGaugeSync", "waterLevel", "anemometer", "statusBoard", "signNakdong", "signYeongsan",
      "cctvWired", "cctvNew", "nvr"
    ];

    const sheet2Rows = stations.map(st => {
      const m = st.maintenance || {};
      const tasks = m.tasks || {};
      const completed = m.completedTasks || {};

      let totalTasks = 0;
      let completedTasks = 0;

      const taskStatuses = taskKeys.map(k => {
        const req = tasks[k];
        const isTarget = (typeof req === "boolean" && req) || (typeof req === "string" && req !== "");
        if (isTarget) {
          totalTasks++;
          const isDone = completed[k]?.completed;
          if (isDone) completedTasks++;
          return isDone ? "완료" : "대기";
        }
        return "-";
      });

      const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

      return [
        st.seq || st.id,
        st.region || "",
        st.river || "",
        st.name || "",
        st.code || "",
        totalTasks,
        completedTasks,
        `${rate}%`,
        ...taskStatuses
      ];
    });

    const sheet2Aligns = ["center", "center", "center", "left", "center", "center", "center", "center", ...taskKeys.map(() => "center")];
    const sheet2StatusCols = [7, ...taskKeys.map((_, i) => 8 + i)];

    const ws2 = this.buildStyledSheet(
      "🛠️ 2026년 자동유량관측시설 유지관리 18개 과업 현황 총괄표",
      `18종 유지관리 과업 지점별 대상 지정 및 조치완료율 현황 | 기준일: ${today}`,
      sheet2Headers,
      sheet2Rows,
      { headerBg: "047857", aligns: sheet2Aligns, statusCols: sheet2StatusCols }
    );
    XLSX.utils.book_append_sheet(wb, ws2, "2.2026_유지관리과업현황");

    // -------------------------------------------------------------
    // SHEET 3: 전국 시설 유지관리 조치 이력 대장 (누적 로그)
    // -------------------------------------------------------------
    let historyList = [];
    try {
      const histRes = await window.apiClient.getMaintenanceHistory();
      if (histRes.success && histRes.data) {
        historyList = histRes.data;
      }
    } catch (e) {
      console.warn("Failed to fetch full history for excel:", e);
    }

    const sheet3Headers = [
      "순번", "문제발생(인지)일", "조치완료(작업)일", "관측소명", "조치구분",
      "과업분류", "대상장비 및 부품", "조치 내용 및 결과", "수행주체", "작업자/담당자",
      "조치상태", "소요비용(원)", "특이사항 및 비고", "등록자"
    ];

    const sheet3Rows = historyList.map((h, idx) => [
      idx + 1,
      h.issue_date || h.action_date || "-",
      h.action_date || "-",
      h.station_name || "-",
      h.action_type || "-",
      h.category || "-",
      h.target_equipment || "-",
      h.description || "-",
      h.actor_type || "-",
      h.worker_name || "-",
      h.result_status || "-",
      h.cost || 0,
      h.memo || "-",
      h.created_by || "-"
    ]);

    const sheet3Aligns = [
      "center", "center", "center", "left", "center",
      "center", "left", "left", "center", "center",
      "center", "right", "left", "left"
    ];
    const sheet3NumFmts = [];
    sheet3NumFmts[11] = "₩#,##0";
    const sheet3StatusCols = [4, 8, 10];

    const ws3 = this.buildStyledSheet(
      "📜 전국 관측시설 유지관리 조치 이력 대장 (누적 로그)",
      `현장 점검, 보수, 부품교체, 정비 등 누적 조치 실적 | 총 ${historyList.length}건`,
      sheet3Headers,
      sheet3Rows,
      { headerBg: "1E40AF", aligns: sheet3Aligns, numFmts: sheet3NumFmts, statusCols: sheet3StatusCols }
    );
    XLSX.utils.book_append_sheet(wb, ws3, "3.누적_유지관리조치이력");

    // -------------------------------------------------------------
    // SHEET 4: 2026년 유속계 정도검정 현황 (30개소, 176대)
    // -------------------------------------------------------------
    const calibStations = stations.filter(s => s.calib2026 || parseInt(s.calibCount2026, 10) > 0);
    const sheet4Headers = [
      "순번", "권역", "하천명", "관측소명", "지점코드", "유속계 형식",
      "검정대상 대수(대)", "검정 진행상태", "검정완료일자", "검정 성적서 번호", "특이사항"
    ];

    const sheet4Rows = calibStations.map((s, idx) => {
      const statusMap = { "completed": "검정완료", "ongoing": "시험·검정중", "pending": "검정대기" };
      return [
        idx + 1,
        s.region || "",
        s.river || "",
        s.name || "",
        s.code || "",
        s.gaugeType || "",
        parseInt(s.calibCount2026, 10) || 0,
        statusMap[s.calibStatus] || s.calibStatus || "검정대기",
        s.calibDate || "-",
        s.calibCertNo || "-",
        s.memo || ""
      ];
    });

    const sheet4Aligns = ["center", "center", "center", "left", "center", "center", "center", "center", "center", "center", "left"];
    const sheet4StatusCols = [7];

    const ws4 = this.buildStyledSheet(
      "🎯 2026년 유속계 정기 정도검정 추진 현황",
      `법정 정도검정 대상 지점: ${calibStations.length}개소 | 총 검정 대상 유속계: 176대`,
      sheet4Headers,
      sheet4Rows,
      { headerBg: "6B21A8", aligns: sheet4Aligns, statusCols: sheet4StatusCols }
    );
    XLSX.utils.book_append_sheet(wb, ws4, "4.2026_유속계정도검정");

    // -------------------------------------------------------------
    // SHEET 5: 팀원 업무 및 현장점검 일정 현황
    // -------------------------------------------------------------
    let scheduleList = [];
    if (window.scheduleManager && window.scheduleManager.schedules && window.scheduleManager.schedules.length > 0) {
      scheduleList = window.scheduleManager.schedules;
    }
    if (scheduleList.length === 0 && window.apiClient) {
      try {
        const schedRes = await window.apiClient.getSchedules();
        if (schedRes && schedRes.success) {
          scheduleList = schedRes.schedules || schedRes.data || [];
        }
      } catch (e) {
        console.warn("Failed to fetch schedules for excel:", e);
      }
    }

    const sheet5Headers = [
      "순번", "일정구분", "일정명(제목)", "관련 관측소", "시작일자", "종료일자",
      "담당자", "동행자/참석자", "진행상태", "상세내용 및 비고", "등록자"
    ];

    const schedTypeMap = {
      "inspection": "현장 점검·출장",
      "check": "현장 점검·출장",
      "maint": "유지관리 조치",
      "maintenance": "유지관리 조치",
      "calib": "유속계 검정",
      "calibration": "유속계 검정",
      "meeting": "회의 및 내부업무",
      "vacation": "휴가·연차",
      "emergency": "긴급 보수",
      "other": "기타"
    };

    const schedStatusMap = {
      "scheduled": "대기·예정",
      "pending": "대기·예정",
      "in_progress": "진행중",
      "ongoing": "진행중",
      "completed": "완료",
      "done": "완료",
      "cancelled": "취소"
    };

    const sheet5Rows = scheduleList.map((sc, idx) => {
      const rawType = sc.schedule_type || sc.scheduleType || "";
      const rawStatus = sc.status || "scheduled";
      let stName = sc.station_name || sc.stationName || "";

      if (!stName) {
        let stIds = sc.stationIds || [];
        if (stIds.length === 0 && sc.station_id) {
          if (String(sc.station_id).startsWith("[")) {
            try { stIds = JSON.parse(sc.station_id); } catch(e) { stIds = [sc.station_id]; }
          } else {
            stIds = String(sc.station_id).split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
          }
        }
        if (stIds.length > 0) {
          stName = stIds.map(id => window.dataManager.getById(id)?.name).filter(Boolean).join(", ");
        }
      }

      return [
        idx + 1,
        schedTypeMap[rawType] || rawType || "-",
        sc.title || "-",
        stName || "-",
        sc.start_date || sc.startDate || "-",
        sc.end_date || sc.endDate || sc.start_date || sc.startDate || "-",
        sc.assignee || "-",
        sc.attendees || "-",
        schedStatusMap[rawStatus] || rawStatus || "-",
        sc.description || "-",
        sc.created_by || sc.createdBy || "-"
      ];
    });

    const sheet5Aligns = ["center", "center", "left", "left", "center", "center", "center", "left", "center", "left", "left"];
    const sheet5StatusCols = [1, 8];

    const ws5 = this.buildStyledSheet(
      "📅 한국수자원조사기술원 수자원인프라팀 업무 및 현장점검 일정표",
      `현장 출장, 정기점검, 긴급보수 및 팀 업무 일정 | 총 ${scheduleList.length}건 수록`,
      sheet5Headers,
      sheet5Rows,
      { headerBg: "B45309", aligns: sheet5Aligns, statusCols: sheet5StatusCols }
    );
    XLSX.utils.book_append_sheet(wb, ws5, "5.팀원_업무점검일정");

    // -------------------------------------------------------------
    // SHEET 6: 시스템 작업 이력 및 보안 감사 로그 (관리자 감사용)
    // -------------------------------------------------------------
    let auditLogs = [];
    if (window.logsManager && window.logsManager.logs && window.logsManager.logs.length > 0) {
      auditLogs = window.logsManager.logs;
    } else if (window.apiClient) {
      try {
        const logRes = await window.apiClient.getLogs("all", "all", 300);
        if (logRes && logRes.success && logRes.data) {
          auditLogs = logRes.data;
        }
      } catch (e) {
        console.warn("Failed to fetch logs for master pack:", e);
      }
    }

    if (auditLogs.length > 0) {
      const sheet6Headers = [
        "로그ID", "작업일시", "작업자 성명", "직책", "계정ID", "작업 유형", "대상 관측소", "상세 변경 내용 및 비고", "접속 IP"
      ];

      const sheet6Rows = auditLogs.map((l, idx) => [
        l.id || (idx + 1),
        l.created_at ? l.created_at.replace("T", " ").slice(0, 19) : "-",
        l.name || "-",
        l.position || "팀원",
        l.username || "-",
        l.action_type || "-",
        l.target_name || "-",
        l.details || "-",
        l.ip_address || "-"
      ]);

      const sheet6Aligns = ["center", "center", "center", "center", "center", "center", "left", "left", "center"];
      const sheet6StatusCols = [5];

      const ws6 = this.buildStyledSheet(
        "🛡️ 한국수자원조사기술원 시스템 작업 이력 및 보안 감사 로그",
        `사용자 활동 및 변경 내역 실시간 감사 추적 (최근 ${auditLogs.length}건) | 기준일: ${today}`,
        sheet6Headers,
        sheet6Rows,
        { headerBg: "334155", aligns: sheet6Aligns, statusCols: sheet6StatusCols }
      );
      XLSX.utils.book_append_sheet(wb, ws6, "6.시스템_작업감사로그");
    }

    // File Output
    const fileName = `한국수자원조사기술원_자동유량관측시설_종합마스터팩_${todayFormatted}.xlsx`;
    XLSX.writeFile(wb, fileName);

    const sheetCount = auditLogs.length > 0 ? 6 : 5;
    window.app.showToast(`[${fileName}] ${sheetCount}개 시트 종합 마스터팩 엑셀이 생성되었습니다.`, "success");
  }

  // =========================================================================
  // 3. DEDICATED MODULAR EXCEL EXPORTS (Per Tab)
  // =========================================================================

  // A. 관측시설 마스터 엑셀 (.xlsx)
  exportStationsMaster(onlyFiltered = false) {
    const dataList = onlyFiltered && window.tableManager?.filteredData 
      ? window.tableManager.filteredData 
      : window.dataManager.getAll();

    if (!dataList || dataList.length === 0) {
      alert("내보낼 관측시설 데이터가 없습니다.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayFormatted = today.replace(/-/g, "");

    const headers = [
      "연번", "관할권역", "하천명", "관측소명(지점명)", "지점코드", "위치(주소)",
      "경도(DMS)", "위도(DMS)", "경도(십진수)", "위도(십진수)",
      "설치년도", "관측개시년도", "2026년 운영여부", "설치방향", "설치방식", "국사형태",
      "홍수특보", "갈수예보", "배수영향", "조위영향", "오염총량",
      "유속계 형식", "이중화여부", "ADVM 수량(대)", "EWSV 수량(대)",
      "26년 검정대상", "26년 검정수량(대)", "태양광 설치", "기준수위(m)", "수위계 방식",
      "RV박스 상태", "로거PC 에이전트", "샌더PC 에이전트", "특이사항 및 비고"
    ];

    const rows = dataList.map(st => {
      const isDual = st.isDualGauge || st.gaugeCategory === "DUAL";
      const rv = st.rvBox || {};
      const rvStatus = st.rvBoxStatus || (st.rvBoxInstalled === true ? "설치완료" : (st.rvBoxInstalled === false ? "미설치" : "대상외"));
      const loggerAgent = rv.logger?.agentName || (st.rvBoxAgents && st.rvBoxAgents.find(a => a.endsWith("_L"))) || "-";
      const senderAgent = rv.sender?.agentName || (st.rvBoxAgents && st.rvBoxAgents.find(a => a.endsWith("_S"))) || "-";

      return [
        st.seq || st.id,
        st.region || "",
        st.river || "",
        st.name || "",
        st.code || "",
        st.address || "",
        st.coords?.lonDMS || "",
        st.coords?.latDMS || "",
        st.coords?.lon || "",
        st.coords?.lat || "",
        st.installYear || "",
        st.obsStartYear || "",
        st.isOperating2026 ? "정상운영" : "미운영",
        st.installDirection || "",
        st.mountType || "-",
        st.shelterType || "-",
        st.floodAlert ? "○" : "-",
        st.droughtAlert ? "○" : "-",
        st.drainage ? "○" : "-",
        st.tide ? "○" : "-",
        st.pollutionTotal ? "○" : "-",
        st.gaugeType || "",
        isDual ? "이중화" : "단독",
        st.advmCount || "0",
        st.ewsvCount || "0",
        st.calib2026 ? "대상지점" : "-",
        st.calibCount2026 || "0",
        st.solarInstall ? "설치" : "-",
        st.refWaterLevel || "-",
        st.waterLevelType || "-",
        rvStatus,
        loggerAgent,
        senderAgent,
        st.memo || ""
      ];
    });

    const aligns = [
      "center", "center", "center", "left", "center", "left",
      "center", "center", "right", "right",
      "center", "center", "center", "center", "center", "center",
      "center", "center", "center", "center", "center",
      "center", "center", "center", "center",
      "center", "center", "center", "center", "center",
      "center", "left", "left", "left"
    ];

    const statusCols = [12, 16, 17, 18, 19, 20, 22, 25, 27, 30];

    const wb = XLSX.utils.book_new();
    const ws = this.buildStyledSheet(
      "🌊 한국수자원조사기술원 전국 자동유량관측시설 제원 현황",
      `${onlyFiltered ? `[필터 적용 조회결과: ${dataList.length}개소]` : `[전국 223개소 전체]`} | 기준일: ${today}`,
      headers,
      rows,
      { headerBg: "1E3A8A", aligns, statusCols }
    );

    XLSX.utils.book_append_sheet(wb, ws, "관측시설_제원현황");
    const fileName = `관측시설_상세제원_${onlyFiltered ? "필터추출_" : "전체_"}${todayFormatted}.xlsx`;
    XLSX.writeFile(wb, fileName);
    window.app.showToast(`[${fileName}] 엑셀 파일이 다운로드되었습니다.`, "success");
  }

  // Alias for backward compatibility
  exportToExcel(onlyFiltered = false) {
    return this.exportStationsMaster(onlyFiltered);
  }

  // B. 2026년 유지관리 18개 과업 현황 엑셀 (.xlsx)
  exportMaintenanceChecklist() {
    const stations = window.dataManager.getAll();
    const today = new Date().toISOString().slice(0, 10);
    const todayFormatted = today.replace(/-/g, "");

    const headers = [
      "연번", "권역", "하천명", "관측소명", "지점코드", "과업건수", "완료건수", "추진율(%)",
      "자동복구누전차단기", "배터리교체", "태양광판넬", "소화기(RNS)", "소화기(기술원)",
      "DP컨버터", "Win11업그레이드", "로거(Logger)", "샌더(Sender)", "리모트뷰박스",
      "유속계이중화", "수위계점검", "풍향풍속계", "시설현황판", "점용표지(낙동)", "점용표지(영산)",
      "CCTV유선", "CCTV신규", "NVR설치"
    ];

    const taskKeys = [
      "circuitBreaker", "battery", "solarPanel", "extinguisherRns", "extinguisherKihs",
      "dpConverter", "osUpgrade", "logger", "sender", "rvBox",
      "dualGaugeSync", "waterLevel", "anemometer", "statusBoard", "signNakdong", "signYeongsan",
      "cctvWired", "cctvNew", "nvr"
    ];

    const rows = stations.map(st => {
      const m = st.maintenance || {};
      const tasks = m.tasks || {};
      const completed = m.completedTasks || {};

      let totalTasks = 0;
      let completedTasks = 0;

      const taskStatuses = taskKeys.map(k => {
        const req = tasks[k];
        const isTarget = (typeof req === "boolean" && req) || (typeof req === "string" && req !== "");
        if (isTarget) {
          totalTasks++;
          const isDone = completed[k]?.completed;
          if (isDone) completedTasks++;
          return isDone ? "완료" : "대기";
        }
        return "-";
      });

      const rate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

      return [
        st.seq || st.id,
        st.region || "",
        st.river || "",
        st.name || "",
        st.code || "",
        totalTasks,
        completedTasks,
        `${rate}%`,
        ...taskStatuses
      ];
    });

    const aligns = ["center", "center", "center", "left", "center", "center", "center", "center", ...taskKeys.map(() => "center")];
    const statusCols = [7, ...taskKeys.map((_, i) => 8 + i)];

    const wb = XLSX.utils.book_new();
    const ws = this.buildStyledSheet(
      "🛠️ 2026년 자동유량관측시설 유지관리 과업 총괄 관리대장",
      `18종 유지관리 과업 대상 지정 및 현장 조치 진행률 현황 | 기준일: ${today}`,
      headers,
      rows,
      { headerBg: "047857", aligns, statusCols }
    );

    XLSX.utils.book_append_sheet(wb, ws, "2026_유지관리과업총괄");
    const fileName = `2026년_유지관리_과업총괄현황_${todayFormatted}.xlsx`;
    XLSX.writeFile(wb, fileName);
    window.app.showToast(`[${fileName}] 엑셀 파일이 다운로드되었습니다.`, "success");
  }

  // C. 누적 유지관리 조치 이력 대장 엑셀 (.xlsx)
  async exportMaintenanceHistory(onlyFiltered = false) {
    let list = [];
    if (onlyFiltered && window.maintenanceHistoryManager?.historyList) {
      list = window.maintenanceHistoryManager.historyList;
    } else {
      try {
        const res = await window.apiClient.getMaintenanceHistory();
        if (res.success && res.data) list = res.data;
      } catch (e) {
        list = window.maintenanceHistoryManager?.historyList || [];
      }
    }

    if (!list || list.length === 0) {
      alert("내보낼 유지관리 조치 이력 데이터가 없습니다.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayFormatted = today.replace(/-/g, "");

    const headers = [
      "순번", "문제발생(인지)일", "조치완료(작업)일", "관측소명", "조치구분",
      "과업분류", "대상장비 및 부품", "조치 내용 및 결과", "수행주체", "작업자/담당자",
      "조치상태", "소요비용(원)", "특이사항 및 비고", "등록자"
    ];

    const rows = list.map((h, idx) => [
      idx + 1,
      h.issue_date || h.action_date || "-",
      h.action_date || "-",
      h.station_name || "-",
      h.action_type || "-",
      h.category || "-",
      h.target_equipment || "-",
      h.description || "-",
      h.actor_type || "-",
      h.worker_name || "-",
      h.result_status || "-",
      h.cost || 0,
      h.memo || "-",
      h.created_by || "-"
    ]);

    const aligns = [
      "center", "center", "center", "left", "center",
      "center", "left", "left", "center", "center",
      "center", "right", "left", "left"
    ];
    const numFmts = [];
    numFmts[11] = "₩#,##0";
    const statusCols = [4, 8, 10];

    const wb = XLSX.utils.book_new();
    const ws = this.buildStyledSheet(
      "📜 전국 관측시설 유지관리 조치 이력 대장 (누적 로그)",
      `현장 점검, 긴급보수, 부품교체, 정비 등 누적 조치 실적 (총 ${list.length}건) | 기준일: ${today}`,
      headers,
      rows,
      { headerBg: "1E40AF", aligns, numFmts, statusCols }
    );

    XLSX.utils.book_append_sheet(wb, ws, "유지관리_조치이력대장");
    const fileName = `유지관리_누적조치이력대장_${todayFormatted}.xlsx`;
    XLSX.writeFile(wb, fileName);
    window.app.showToast(`[${fileName}] 엑셀 파일이 다운로드되었습니다.`, "success");
  }

  // D. 2026년 유속계 정도검정 현황 엑셀 (.xlsx)
  exportCalibration() {
    const stations = window.dataManager.getAll();
    const calibStations = stations.filter(s => s.calib2026 || parseInt(s.calibCount2026, 10) > 0);

    if (calibStations.length === 0) {
      alert("검정 대상 지점 데이터가 없습니다.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayFormatted = today.replace(/-/g, "");

    const headers = [
      "순번", "권역", "하천명", "관측소명", "지점코드", "유속계 형식",
      "검정대상 대수(대)", "검정 진행상태", "검정완료일자", "검정 성적서 번호", "특이사항"
    ];

    const statusMap = { "completed": "검정완료", "ongoing": "시험·검정중", "pending": "검정대기" };

    const rows = calibStations.map((s, idx) => [
      idx + 1,
      s.region || "",
      s.river || "",
      s.name || "",
      s.code || "",
      s.gaugeType || "",
      parseInt(s.calibCount2026, 10) || 0,
      statusMap[s.calibStatus] || s.calibStatus || "검정대기",
      s.calibDate || "-",
      s.calibCertNo || "-",
      s.memo || ""
    ]);

    const aligns = ["center", "center", "center", "left", "center", "center", "center", "center", "center", "center", "left"];
    const statusCols = [7];

    const wb = XLSX.utils.book_new();
    const ws = this.buildStyledSheet(
      "🎯 2026년 유속계 정기 정도검정 추진 현황 대장",
      `검정 대상 30개소 (총 176대 유속계) 시험·검정 및 교정 결과 | 기준일: ${today}`,
      headers,
      rows,
      { headerBg: "6B21A8", aligns, statusCols }
    );

    XLSX.utils.book_append_sheet(wb, ws, "2026_유속계정도검정");
    const fileName = `2026년_유속계_정도검정현황_${todayFormatted}.xlsx`;
    XLSX.writeFile(wb, fileName);
    window.app.showToast(`[${fileName}] 엑셀 파일이 다운로드되었습니다.`, "success");
  }

  // E. 업무 및 현장점검 일정표 엑셀 (.xlsx)
  // E. 업무 및 현장점검 일정표 엑셀 (.xlsx)
  async exportSchedules() {
    let list = [];
    if (window.scheduleManager && window.scheduleManager.schedules && window.scheduleManager.schedules.length > 0) {
      list = window.scheduleManager.schedules;
    }
    if (list.length === 0 && window.apiClient) {
      try {
        const res = await window.apiClient.getSchedules();
        if (res && res.success) {
          list = res.schedules || res.data || [];
        }
      } catch (e) {
        list = [];
      }
    }

    if (!list || list.length === 0) {
      alert("내보낼 일정 데이터가 없습니다.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayFormatted = today.replace(/-/g, "");

    const headers = [
      "순번", "일정구분", "일정명(제목)", "관련 관측소", "시작일자", "종료일자",
      "담당자", "동행자/참석자", "진행상태", "상세내용 및 비고", "등록자"
    ];

    const schedTypeMap = {
      "inspection": "현장 점검·출장",
      "check": "현장 점검·출장",
      "maint": "유지관리 조치",
      "maintenance": "유지관리 조치",
      "calib": "유속계 검정",
      "calibration": "유속계 검정",
      "meeting": "회의 및 내부업무",
      "vacation": "휴가·연차",
      "emergency": "긴급 보수",
      "other": "기타"
    };

    const schedStatusMap = {
      "scheduled": "대기·예정",
      "pending": "대기·예정",
      "in_progress": "진행중",
      "ongoing": "진행중",
      "completed": "완료",
      "done": "완료",
      "cancelled": "취소"
    };

    const rows = list.map((sc, idx) => {
      const rawType = sc.schedule_type || sc.scheduleType || "";
      const rawStatus = sc.status || "scheduled";
      let stName = sc.station_name || sc.stationName || "";

      if (!stName) {
        let stIds = sc.stationIds || [];
        if (stIds.length === 0 && sc.station_id) {
          if (String(sc.station_id).startsWith("[")) {
            try { stIds = JSON.parse(sc.station_id); } catch(e) { stIds = [sc.station_id]; }
          } else {
            stIds = String(sc.station_id).split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
          }
        }
        if (stIds.length > 0) {
          stName = stIds.map(id => window.dataManager.getById(id)?.name).filter(Boolean).join(", ");
        }
      }

      return [
        idx + 1,
        schedTypeMap[rawType] || rawType || "-",
        sc.title || "-",
        stName || "-",
        sc.start_date || sc.startDate || "-",
        sc.end_date || sc.endDate || sc.start_date || sc.startDate || "-",
        sc.assignee || "-",
        sc.attendees || "-",
        schedStatusMap[rawStatus] || rawStatus || "-",
        sc.description || "-",
        sc.created_by || sc.createdBy || "-"
      ];
    });

    const aligns = ["center", "center", "left", "left", "center", "center", "center", "left", "center", "left", "left"];
    const statusCols = [1, 8];

    const wb = XLSX.utils.book_new();
    const ws = this.buildStyledSheet(
      "📅 한국수자원조사기술원 수자원인프라팀 업무 및 현장점검 일정 관리대장",
      `현장 출장, 정기점검, 긴급보수 및 팀 업무 일정 (총 ${list.length}건) | 기준일: ${today}`,
      headers,
      rows,
      { headerBg: "B45309", aligns, statusCols }
    );

    XLSX.utils.book_append_sheet(wb, ws, "업무점검일정");
    const fileName = `수자원인프라팀_업무점검일정표_${todayFormatted}.xlsx`;
    XLSX.writeFile(wb, fileName);
    window.app.showToast(`[${fileName}] 엑셀 파일이 다운로드되었습니다.`, "success");
  }

  // F. 관리자 작업 이력 및 보안 감사 로그 엑셀 (.xlsx)
  async exportLogs(onlyFiltered = false) {
    let list = [];
    if (onlyFiltered && window.logsManager?.logs && window.logsManager.logs.length > 0) {
      list = [...window.logsManager.logs];
      if (window.logsManager.filterUser !== "all") {
        list = list.filter(l => l.username === window.logsManager.filterUser);
      }
      if (window.logsManager.filterAction !== "all") {
        list = list.filter(l => l.action_type === window.logsManager.filterAction);
      }
    } else {
      if (window.apiClient) {
        try {
          const res = await window.apiClient.getLogs("all", "all", 500);
          if (res && res.success && res.data) {
            list = res.data;
          }
        } catch (e) {
          list = window.logsManager?.logs || [];
        }
      } else {
        list = window.logsManager?.logs || [];
      }
    }

    if (!list || list.length === 0) {
      alert("내보낼 작업 이력 및 감사 로그 데이터가 없습니다.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayFormatted = today.replace(/-/g, "");

    const headers = [
      "로그ID", "작업일시", "작업자 성명", "직책", "계정ID", "작업 유형", "대상 관측소(지점)", "상세 변경 내용 및 비고", "접속 IP"
    ];

    const rows = list.map((l, idx) => [
      l.id || (idx + 1),
      l.created_at ? l.created_at.replace("T", " ").slice(0, 19) : "-",
      l.name || "-",
      l.position || "팀원",
      l.username || "-",
      l.action_type || "-",
      l.target_name || "-",
      l.details || "-",
      l.ip_address || "-"
    ]);

    const aligns = ["center", "center", "center", "center", "center", "center", "left", "left", "center"];
    const statusCols = [5];

    const wb = XLSX.utils.book_new();
    const ws = this.buildStyledSheet(
      "🛡️ 한국수자원조사기술원 시스템 관리자 작업 이력 및 감사 로그",
      `${onlyFiltered ? `[필터 적용 조회결과: ${list.length}건]` : `[전체 감사 기록: ${list.length}건]`} | 기준일: ${today}`,
      headers,
      rows,
      { headerBg: "334155", aligns, statusCols }
    );

    XLSX.utils.book_append_sheet(wb, ws, "시스템_작업감사로그");
    const fileName = `시스템_작업이력_감사로그_${todayFormatted}.xlsx`;
    XLSX.writeFile(wb, fileName);
    window.app.showToast(`[${fileName}] 작업 이력 엑셀 파일이 다운로드되었습니다.`, "success");
  }

  // =========================================================================
  // 4. FULL SYSTEM SNAPSHOT JSON BACKUP & RESTORE
  // =========================================================================
  async exportBackupJSON() {
    try {
      const stations = window.dataManager.getAll();
      let maintenanceHistory = [];
      let schedules = [];
      let notifyConfig = null;

      try {
        const hRes = await window.apiClient.getMaintenanceHistory();
        if (hRes.success) maintenanceHistory = hRes.data;
      } catch (e) {}

      try {
        const sRes = await window.apiClient.getSchedules();
        if (sRes.success) schedules = sRes.data;
      } catch (e) {}

      try {
        const nRes = await window.apiClient.getNotificationConfig();
        if (nRes.success) notifyConfig = nRes.data;
      } catch (e) {}

      const backupSnapshot = {
        system: "K-Hydro Flow Station Management System",
        version: "2.2",
        exportedAt: new Date().toISOString(),
        exportedBy: window.apiClient?.user?.name || "관리자",
        counts: {
          stations: stations.length,
          maintenanceHistory: maintenanceHistory.length,
          schedules: schedules.length
        },
        data: {
          stations,
          maintenanceHistory,
          schedules,
          notifyConfig
        }
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupSnapshot, null, 2));
      const dlAnchorElem = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      dlAnchorElem.setAttribute("href", dataStr);
      dlAnchorElem.setAttribute("download", `khydro_full_system_snapshot_${today}.json`);
      dlAnchorElem.click();
      window.app.showToast("전체 시스템 통합 JSON 스냅샷 백업이 생성되었습니다.", "success");
    } catch (err) {
      console.error("Backup JSON error:", err);
      alert("백업 파일 생성 중 오류가 발생했습니다: " + err.message);
    }
  }

  triggerJSONUpload() {
    if (window.apiClient && window.apiClient.user?.role !== "admin") {
      alert("JSON 백업 파일 복원은 최고 관리자(admin)만 가능합니다.");
      return;
    }
    const input = document.getElementById("json-file-input");
    if (input) input.click();
  }

  importBackupJSON(file) {
    if (window.apiClient && window.apiClient.user?.role !== "admin") {
      alert("JSON 데이터 복원은 최고 관리자(admin) 계정만 실행할 수 있습니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        
        // 1. Full Snapshot Schema Check
        if (parsed.data && Array.isArray(parsed.data.stations)) {
          const stCount = parsed.data.stations.length;
          const histCount = parsed.data.maintenanceHistory?.length || 0;
          const schedCount = parsed.data.schedules?.length || 0;

          const msg = `📦 [시스템 종합 스냅샷 복원]\n\n` +
                      `- 관측시설: ${stCount}개소\n` +
                      `- 유지관리 이력: ${histCount}건\n` +
                      `- 업무/점검 일정: ${schedCount}건\n` +
                      `- 백업 생성일: ${parsed.exportedAt || "알수없음"}\n\n` +
                      `해당 스냅샷으로 시스템 전체 데이터를 복원하시겠습니까?`;

          if (!confirm(msg)) return;

          // Restore stations
          window.dataManager.importAll(parsed.data.stations);
          if (window.apiClient) {
            await window.apiClient.batchUpdateStations(parsed.data.stations);
          }

          // Restore maintenance history (if any)
          if (Array.isArray(parsed.data.maintenanceHistory) && parsed.data.maintenanceHistory.length > 0 && window.apiClient) {
            await window.apiClient.batchImportMaintenanceHistory(parsed.data.maintenanceHistory);
          }

          window.app.refreshAll();
          window.app.showToast(`전체 시스템 데이터가 성공적으로 복원되었습니다. (시설: ${stCount}개소)`, "success");
        } 
        // 2. Legacy Stations Array Schema Check
        else if (Array.isArray(parsed) && parsed.length > 0) {
          if (confirm(`JSON 파일에서 ${parsed.length}개의 지점 데이터를 복원하시겠습니까?`)) {
            window.dataManager.importAll(parsed);
            if (window.apiClient) {
              await window.apiClient.batchUpdateStations(parsed);
            }
            window.app.refreshAll();
            window.app.showToast(`${parsed.length}개 지점이 복원되었습니다.`, "success");
          }
        } else {
          alert("올바르지 않은 JSON 백업 파일 형식입니다.");
        }
      } catch (err) {
        console.error("JSON restore error:", err);
        alert("JSON 파싱 및 복원 중 오류가 발생했습니다: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  // =========================================================================
  // =========================================================================
  // 5. EXCEL UPLOAD & DATA PUSH ENGINE (Admin Only)
  // =========================================================================
  triggerExcelUpload() {
    if (window.apiClient && window.apiClient.user?.role !== "admin") {
      alert("엑셀 파일 업로드 및 데이터 일괄 밀어넣기(반영)는 최고 관리자(admin)만 가능합니다.");
      return;
    }
    const input = document.getElementById("excel-file-input");
    if (input) {
      input.value = ""; // reset file input
      input.click();
    }
  }

  // Smart Parser: Extracts structured row objects by detecting actual header row (ignoring title banners)
  parseSheetToObjects(worksheet) {
    const rawAoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    if (!rawAoa || rawAoa.length === 0) return [];

    let headerRowIdx = -1;
    for (let r = 0; r < Math.min(10, rawAoa.length); r++) {
      const row = rawAoa[r];
      if (Array.isArray(row)) {
        const rowStr = row.map(c => String(c || "")).join(" ");
        if (
          rowStr.includes("연번") || 
          rowStr.includes("관할권역") || 
          rowStr.includes("관할명") || 
          rowStr.includes("하천명") || 
          rowStr.includes("관측소명") || 
          rowStr.includes("지점명") || 
          rowStr.includes("과업건수") || 
          rowStr.includes("자동복구누전차단기") || 
          rowStr.includes("문제발생") || 
          rowStr.includes("조치구분") || 
          rowStr.includes("검정 진행상태") ||
          rowStr.includes("검정대상")
        ) {
          headerRowIdx = r;
          break;
        }
      }
    }

    if (headerRowIdx === -1) {
      return XLSX.utils.sheet_to_json(worksheet);
    }

    const headers = rawAoa[headerRowIdx].map(h => String(h || "").trim());
    const objects = [];

    for (let r = headerRowIdx + 1; r < rawAoa.length; r++) {
      const row = rawAoa[r];
      if (!row || row.length === 0 || row.every(c => c === "" || c === null || c === undefined)) continue;
      
      const obj = {};
      let hasVal = false;
      headers.forEach((h, colIdx) => {
        if (h) {
          const val = row[colIdx] !== undefined ? row[colIdx] : "";
          obj[h] = val;
          if (val !== "" && val !== null && val !== undefined) hasVal = true;
        }
      });
      if (hasVal) objects.push(obj);
    }

    return objects;
  }

  // Parse DMS coordinate string to decimal
  parseDMSCoords(dmsStr) {
    if (!dmsStr) return null;
    const parts = String(dmsStr).split("-").map(p => parseFloat(p.trim()));
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return Number((parts[0] + parts[1] / 60 + parts[2] / 3600).toFixed(6));
    }
    return null;
  }

  // Main Excel Import Controller (Supports Multi-Sheet Master Pack & Individual Sheets)
  importExcel(file) {
    if (window.apiClient && window.apiClient.user?.role !== "admin") {
      alert("데이터 업로드 및 갱신은 최고 관리자(admin) 계정만 실행할 수 있습니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        const currentStations = window.dataManager.getAll();
        const stationMapByCode = new Map();
        const stationMapByName = new Map();
        const stationMapById = new Map();

        currentStations.forEach(st => {
          if (st.code) stationMapByCode.set(String(st.code).trim(), st);
          if (st.name) stationMapByName.set(String(st.name).trim(), st);
          stationMapById.set(st.id, st);
        });

        let updatedStationsCount = 0;
        let updatedTasksCount = 0;
        let updatedCalibCount = 0;
        let newHistoryRecords = [];

        // Task Column mapping for 18 maintenance items
        const taskColumnMap = {
          "자동복구누전차단기": "circuitBreaker",
          "배터리교체": "battery",
          "태양광판넬": "solarPanel",
          "소화기(RNS)": "extinguisherRns",
          "소화기(기술원)": "extinguisherKihs",
          "DP컨버터": "dpConverter",
          "Win11업그레이드": "osUpgrade",
          "로거(Logger)": "logger",
          "로거": "logger",
          "샌더(Sender)": "sender",
          "샌더": "sender",
          "리모트뷰박스": "rvBox",
          "RV박스": "rvBox",
          "유속계이중화": "dualGaugeSync",
          "수위계점검": "waterLevel",
          "풍향풍속계": "anemometer",
          "시설현황판": "statusBoard",
          "점용표지(낙동)": "signNakdong",
          "점용표지(영산)": "signYeongsan",
          "CCTV유선": "cctvWired",
          "CCTV신규": "cctvNew",
          "NVR설치": "nvr"
        };

        const today = new Date().toISOString().slice(0, 10);

        // Iterate through all sheets in the uploaded workbook
        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName];
          const rows = this.parseSheetToObjects(ws);
          if (!rows || rows.length === 0) continue;

          const sampleKeys = Object.keys(rows[0] || {}).join(" ");

          // 1. Check if Sheet represents Station Master Specs
          if (sampleKeys.includes("위치") || sampleKeys.includes("지점코드") || sampleKeys.includes("유속계 형식") || sampleKeys.includes("국사형태")) {
            rows.forEach((r, idx) => {
              const code = String(r["지점코드"] || "").trim();
              const name = String(r["지점명"] || r["지점명(관측소)"] || r["관측소명(지점명)"] || "").trim();
              const seq = parseInt(r["연번"] || r["순번"], 10) || (idx + 1);

              let targetStation = stationMapByCode.get(code) || stationMapByName.get(name) || stationMapById.get(seq);
              if (!targetStation) {
                targetStation = {
                  id: seq,
                  seq: seq,
                  maintenance: { completedTasks: {}, tasks: {} }
                };
                currentStations.push(targetStation);
                if (code) stationMapByCode.set(code, targetStation);
                if (name) stationMapByName.set(name, targetStation);
                stationMapById.set(seq, targetStation);
              }

              const lonDMS = String(r["경도"] || r["경도(DMS)"] || targetStation.coords?.lonDMS || "").trim();
              const latDMS = String(r["위도"] || r["위도(DMS)"] || targetStation.coords?.latDMS || "").trim();
              const gaugeType = String(r["형식(유속계)"] || r["유속계 형식"] || targetStation.gaugeType || "").trim();
              const isDual = (gaugeType.includes("EWSV") && gaugeType.includes("ADVM")) || gaugeType.includes(",") || String(r["이중화여부"] || "").includes("이중화");

              targetStation.region = String(r["관할명"] || r["관할권역"] || targetStation.region || "").trim();
              targetStation.river = String(r["하천명"] || targetStation.river || "").trim();
              targetStation.name = name || targetStation.name;
              targetStation.code = code || targetStation.code;
              targetStation.address = String(r["위치"] || r["위치(주소)"] || targetStation.address || "").trim();
              targetStation.installYear = String(r["설치년도"] || targetStation.installYear || "").trim();
              targetStation.obsStartYear = String(r["관측개시년도"] || targetStation.obsStartYear || "").trim();

              if (r["2026년 운영"] !== undefined || r["2026년 운영여부"] !== undefined) {
                const opStr = String(r["2026년 운영"] || r["2026년 운영여부"] || "").trim();
                targetStation.isOperating2026 = ["○", "O", "o", "1", "Y", "y", "운영", "정상운영"].includes(opStr);
              }

              if (r["설치방향"] !== undefined) targetStation.installDirection = String(r["설치방향"] || "").trim();
              if (r["설치방식"] !== undefined) targetStation.mountType = String(r["설치방식"] || "-").trim();
              if (r["국사형태"] !== undefined) targetStation.shelterType = String(r["국사형태"] || "-").trim();

              if (r["홍수특보"] !== undefined) targetStation.floodAlert = ["○", "O", "o", "1", "Y", "y"].includes(String(r["홍수특보"]).trim());
              if (r["갈수예보"] !== undefined) targetStation.droughtAlert = ["○", "O", "o", "1", "Y", "y"].includes(String(r["갈수예보"]).trim());
              if (r["배수"] !== undefined || r["배수영향"] !== undefined) targetStation.drainage = ["○", "O", "o", "1", "Y", "y"].includes(String(r["배수"] || r["배수영향"]).trim());
              if (r["조위"] !== undefined || r["조위영향"] !== undefined) targetStation.tide = ["○", "O", "o", "1", "Y", "y"].includes(String(r["조위"] || r["조위영향"]).trim());
              if (r["오염총량"] !== undefined) targetStation.pollutionTotal = ["○", "O", "o", "1", "Y", "y"].includes(String(r["오염총량"]).trim());

              targetStation.gaugeType = gaugeType;
              targetStation.gaugeCategory = isDual ? "DUAL" : (gaugeType.includes("EWSV") ? "EWSV" : "ADVM");
              targetStation.isDualGauge = isDual;

              if (r["ADVM (대)"] !== undefined || r["ADVM 수량(대)"] !== undefined) {
                targetStation.advmCount = String(r["ADVM (대)"] || r["ADVM 수량(대)"] || "").trim();
              }
              if (r["EWSV (대)"] !== undefined || r["EWSV 수량(대)"] !== undefined) {
                targetStation.ewsvCount = String(r["EWSV (대)"] || r["EWSV 수량(대)"] || "").trim();
              }

              if (r["26년 유속계 검정지점"] !== undefined || r["26년 검정대상"] !== undefined) {
                targetStation.calib2026 = ["○", "O", "o", "1", "Y", "y", "대상지점"].includes(String(r["26년 유속계 검정지점"] || r["26년 검정대상"]).trim());
              }
              if (r["26년 검정대상 유속계(대)"] !== undefined || r["26년 검정수량(대)"] !== undefined) {
                targetStation.calibCount2026 = String(r["26년 검정대상 유속계(대)"] || r["26년 검정수량(대)"] || "").trim();
              }

              if (r["태양광 설치 지점"] !== undefined || r["태양광 설치"] !== undefined) {
                targetStation.solarInstall = ["○", "O", "o", "1", "Y", "y", "설치"].includes(String(r["태양광 설치 지점"] || r["태양광 설치"]).trim());
              }

              if (r["기준수위"] !== undefined || r["기준수위(m)"] !== undefined) {
                targetStation.refWaterLevel = String(r["기준수위"] || r["기준수위(m)"] || "").trim();
              }
              if (r["수위계 방식"] !== undefined) {
                targetStation.waterLevelType = String(r["수위계 방식"] || "").trim();
              }

              if (r["RV박스 상태"] !== undefined) {
                const rvStr = String(r["RV박스 상태"]).trim();
                targetStation.rvBoxStatus = rvStr || undefined;
                targetStation.rvBoxInstalled = rvStr.includes("설치완료") || rvStr.includes("○") || rvStr === "O" ? true : (rvStr.includes("미설치") ? false : null);
              }

              if (r["비고"] !== undefined || r["특이사항 및 비고"] !== undefined) {
                targetStation.memo = String(r["비고"] || r["특이사항 및 비고"] || "").trim();
              }

              targetStation.coords = {
                lonDMS: lonDMS,
                latDMS: latDMS,
                lon: this.parseDMSCoords(lonDMS) || targetStation.coords?.lon,
                lat: this.parseDMSCoords(latDMS) || targetStation.coords?.lat
              };

              updatedStationsCount++;
            });
          }

          // 2. Check if Sheet represents 18 Maintenance Tasks Checklist
          else if (sampleKeys.includes("자동복구누전차단기") || sampleKeys.includes("Win11업그레이드") || sampleKeys.includes("과업건수")) {
            rows.forEach((r, idx) => {
              const code = String(r["지점코드"] || "").trim();
              const name = String(r["관측소명"] || r["지점명"] || "").trim();
              const seq = parseInt(r["연번"] || r["순번"], 10) || (idx + 1);

              const st = stationMapByCode.get(code) || stationMapByName.get(name) || stationMapById.get(seq);
              if (!st) return;

              if (!st.maintenance) st.maintenance = {};
              if (!st.maintenance.tasks) st.maintenance.tasks = {};
              if (!st.maintenance.completedTasks) st.maintenance.completedTasks = {};

              Object.keys(taskColumnMap).forEach(colName => {
                if (r[colName] !== undefined) {
                  const taskKey = taskColumnMap[colName];
                  const val = String(r[colName]).trim();

                  if (val === "완료" || val === "○" || val === "O" || val === "Y" || val === "y") {
                    st.maintenance.tasks[taskKey] = true;
                    st.maintenance.completedTasks[taskKey] = {
                      completed: true,
                      completedDate: today,
                      user: "관리자 (엑셀반영)"
                    };
                  } else if (val === "대기" || val === "대기중" || val === "미완료" || val === "진행중") {
                    st.maintenance.tasks[taskKey] = true;
                    delete st.maintenance.completedTasks[taskKey];
                  } else if (val === "-" || val === "미대상" || val === "") {
                    st.maintenance.tasks[taskKey] = false;
                    delete st.maintenance.completedTasks[taskKey];
                  }
                }
              });

              st.maintenance.hasMaintData = true;
              updatedTasksCount++;
            });
          }

          // 3. Check if Sheet represents Flowmeter Calibration
          else if (sampleKeys.includes("검정 진행상태") || sampleKeys.includes("검정 성적서 번호") || sampleKeys.includes("검정완료일자")) {
            rows.forEach((r, idx) => {
              const code = String(r["지점코드"] || "").trim();
              const name = String(r["관측소명"] || r["지점명"] || "").trim();
              const seq = parseInt(r["순번"] || r["연번"], 10) || (idx + 1);

              const st = stationMapByCode.get(code) || stationMapByName.get(name) || stationMapById.get(seq);
              if (!st) return;

              const statusStr = String(r["검정 진행상태"] || r["검정상태"] || "").trim();
              if (statusStr) {
                if (statusStr.includes("완료")) st.calibStatus = "completed";
                else if (statusStr.includes("시험") || statusStr.includes("검정중") || statusStr.includes("진행")) st.calibStatus = "ongoing";
                else st.calibStatus = "pending";
              }

              if (r["검정완료일자"] !== undefined) st.calibDate = String(r["검정완료일자"] || "").trim();
              if (r["검정 성적서 번호"] !== undefined || r["성적서번호"] !== undefined) {
                st.calibCertNo = String(r["검정 성적서 번호"] || r["성적서번호"] || "").trim();
              }

              updatedCalibCount++;
            });
          }

          // 4. Check if Sheet represents Maintenance Action History Logs
          else if (sampleKeys.includes("조치구분") || sampleKeys.includes("문제발생(인지)일") || sampleKeys.includes("조치 내용 및 결과") || sampleKeys.includes("소요비용")) {
            rows.forEach(r => {
              const stName = String(r["관측소명"] || r["관측소명(지점명)"] || r["지점명"] || "").trim();
              const st = stationMapByName.get(stName) || (stName ? currentStations.find(s => s.name && s.name.includes(stName)) : null);
              const stId = st ? st.id : (parseInt(r["지점코드"] || 0, 10) || 1);

              const costRaw = String(r["소요비용(원)"] || r["소요비용"] || "0").replace(/[^\d]/g, "");
              const cost = parseInt(costRaw, 10) || 0;

              const record = {
                station_id: stId,
                station_name: stName || (st ? st.name : "미지정"),
                issue_date: String(r["문제발생(인지)일"] || r["문제발생일"] || r["등록일"] || today).trim(),
                action_date: String(r["조치완료(작업)일"] || r["조치일"] || r["작업일자"] || today).trim(),
                action_type: String(r["조치구분"] || r["조치유형"] || "정기점검").trim(),
                category: String(r["과업분류"] || r["분류"] || "전원·안전").trim(),
                target_equipment: String(r["대상장비 및 부품"] || r["대상장비"] || "-").trim(),
                description: String(r["조치 내용 및 결과"] || r["조치내용"] || "-").trim(),
                actor_type: String(r["수행주체"] || "기술원(자체)").trim(),
                worker_name: String(r["작업자/담당자"] || r["작업자"] || "-").trim(),
                result_status: String(r["조치상태"] || "완료").trim(),
                cost: cost,
                memo: String(r["특이사항 및 비고"] || r["비고"] || "").trim(),
                created_by: `관리자 (엑셀일괄반영)`
              };

              newHistoryRecords.push(record);
            });
          }
        }

        // Summary Confirmation Modal
        const summaryMsg = [
          "📋 [엑셀 데이터 분석 및 반영 내역]",
          updatedStationsCount > 0 ? `• 관측시설 상세 제원: ${updatedStationsCount}개소 감지/갱신` : null,
          updatedTasksCount > 0 ? `• 2026 유지관리 18개 과업 현황: ${updatedTasksCount}개소 감지/갱신` : null,
          updatedCalibCount > 0 ? `• 2026 유속계 정도검정 현황: ${updatedCalibCount}개소 감지/갱신` : null,
          newHistoryRecords.length > 0 ? `• 유지관리 누적 조치 이력: ${newHistoryRecords.length}건 감지/추가` : null,
          "",
          "수정된 엑셀 파일의 내용을 시스템 데이터베이스에 일괄 밀어넣기(반영)하시겠습니까?"
        ].filter(line => line !== null).join("\n");

        if (updatedStationsCount === 0 && updatedTasksCount === 0 && updatedCalibCount === 0 && newHistoryRecords.length === 0) {
          alert("업로드된 엑셀 파일에서 유효한 시설, 과업, 검정, 또는 조치이력 데이터를 찾을 수 없습니다. 원본 양식을 확인해주세요.");
          return;
        }

        if (confirm(summaryMsg)) {
          // 1. Save all station updates
          window.dataManager.importAll(currentStations);
          if (window.apiClient) {
            await window.apiClient.batchUpdateStations(currentStations);
          }

          // 2. Save history records if any
          if (newHistoryRecords.length > 0 && window.apiClient) {
            try {
              await window.apiClient.batchImportMaintenanceHistory(newHistoryRecords);
            } catch (err) {
              console.warn("Failed to batch import maintenance history:", err);
            }
          }

          // 3. Refresh UI & Feedback
          window.app.refreshAll();
          if (window.maintenanceHistoryManager) {
            await window.maintenanceHistoryManager.fetchHistory();
          }
          if (window.logsManager) {
            await window.logsManager.fetchLogs();
          }

          window.app.showToast("✅ 엑셀 데이터가 시스템 데이터베이스에 성공적으로 일괄 반영(밀어넣기 완료)되었습니다.", "success");
        }
      } catch (err) {
        console.error("Excel import error:", err);
        alert("엑셀 파일 파싱 및 밀어넣기 중 오류가 발생했습니다: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

window.excelManager = new ExcelManager();
