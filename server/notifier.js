const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

class SmartNotifierService {
  constructor() {
    this.configFilePath = path.join(__dirname, "../data/notification_config.json");

    // Alert state tracker: key -> { level: "WARNING"|"NORMAL", count: number, lastNotifiedLevel: "", lastNotifiedTime: "" }
    this.alertStates = new Map();
    this.notificationLogs = [];
    this.maxLogs = 500;

    // Default values
    this.thresholdCount = parseInt(process.env.ALERT_THRESHOLD_COUNT, 10) || 3;
    this.provider = process.env.EMAIL_PROVIDER || "BREVO"; // "RESEND" | "BREVO" | "SMTP" | "AUTO"
    this.apiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY || process.env.BREVO_API_KEY || "";
    this.apiSender = process.env.EMAIL_API_SENDER || "seyoo123456789@gmail.com";
    this.smtpConfig = {
      host: process.env.SMTP_HOST || "smtp.naver.com",
      port: parseInt(process.env.SMTP_PORT, 10) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
      },
      from: process.env.SMTP_FROM || ""
    };
    this.recipients = (process.env.ALERT_RECIPIENTS || "").split(",").map(e => e.trim()).filter(Boolean);
    this.enabled = process.env.ENABLE_EMAIL_ALERTS === "true" || true;
    this.transporter = null;

    // NEW: 매 정각 1회 전국 종합 리포트 발송 설정
    this.reportMode = process.env.EMAIL_REPORT_MODE || "HOURLY_DIGEST"; // "HOURLY_DIGEST" (정각 1통 통합 리포트) | "PER_STATION"
    this.minContinuousHours = parseInt(process.env.MIN_CONTINUOUS_HOURS, 10) || 1; // 1시간(60분, 6회 이상)
    this.selectedRules = (process.env.EMAIL_SELECTED_RULES || "DATA_MISSING,BATTERY_VOLTAGE").split(",").map(r => r.trim()).filter(Boolean);
    this.lastReportedHourKey = ""; // "YYYY-MM-DD-HH" 중복 발송 방지용 키

    // Load persisted configuration from storage
    this.loadPersistedConfig();
    this.initTransporter();
  }

  loadPersistedConfig() {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, "utf-8");
        const saved = JSON.parse(raw);
        if (saved.thresholdCount) this.thresholdCount = saved.thresholdCount;
        if (saved.provider) this.provider = saved.provider;
        if (saved.apiKey) this.apiKey = saved.apiKey;
        if (saved.apiSender) this.apiSender = saved.apiSender;
        if (saved.host) this.smtpConfig.host = saved.host;
        if (saved.port) this.smtpConfig.port = saved.port;
        if (saved.user) this.smtpConfig.auth.user = saved.user;
        if (saved.pass) this.smtpConfig.auth.pass = saved.pass;
        if (saved.from) this.smtpConfig.from = saved.from;
        if (saved.recipients && Array.isArray(saved.recipients)) this.recipients = saved.recipients;
        if (saved.enabled !== undefined) this.enabled = saved.enabled;
        if (saved.reportMode) this.reportMode = saved.reportMode;
        if (saved.minContinuousHours) this.minContinuousHours = saved.minContinuousHours;
        if (saved.selectedRules && Array.isArray(saved.selectedRules)) this.selectedRules = saved.selectedRules;
        console.log(`📁 [SmartNotifier] Loaded persisted config from disk (mode: ${this.reportMode}, minHours: ${this.minContinuousHours}h, rules: ${this.selectedRules.join(",")}, provider: ${this.getEffectiveProvider()})`);
      }

      // Check .env if apiKey is not yet set
      if (!this.apiKey) {
        const envPath = path.join(__dirname, "../.env");
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, "utf-8");
          const m = envContent.match(/BREVO_API_KEY\s*=\s*([^\r\n]+)/);
          if (m) this.apiKey = m[1].trim().replace(/^["']|["']$/g, "");
        }
      }
    } catch (e) {
      console.warn("⚠️ Failed to load persisted notification config:", e.message);
    }
  }

  persistConfig() {
    try {
      const dataDir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dataToSave = {
        thresholdCount: this.thresholdCount,
        provider: this.provider,
        apiKey: (process.env.BREVO_API_KEY || fs.existsSync(path.join(__dirname, "../.env"))) ? "" : this.apiKey,
        apiSender: this.apiSender,
        host: this.smtpConfig.host,
        port: this.smtpConfig.port,
        user: this.smtpConfig.auth.user,
        pass: this.smtpConfig.auth.pass,
        from: this.smtpConfig.from,
        recipients: this.recipients,
        enabled: this.enabled,
        reportMode: this.reportMode,
        minContinuousHours: this.minContinuousHours,
        selectedRules: this.selectedRules,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.configFilePath, JSON.stringify(dataToSave, null, 2), "utf-8");
      console.log("💾 [SmartNotifier] Notification settings saved permanently to disk.");
    } catch (e) {
      console.warn("⚠️ Failed to persist notification config:", e.message);
    }
  }

  getEffectiveProvider() {
    if (this.apiKey) {
      if (this.apiKey.startsWith("xkeysib-") || this.provider === "BREVO") return "BREVO";
      if (this.apiKey.startsWith("re_") || this.provider === "RESEND") return "RESEND";
      return this.provider || "BREVO";
    }
    if (this.smtpConfig.auth.user && this.smtpConfig.auth.pass) {
      return "SMTP";
    }
    return "SIMULATION";
  }

  initTransporter() {
    this.transporter = null;
    const eff = this.getEffectiveProvider();
    if (eff === "RESEND") {
      console.log(`📧 [SmartNotifier] Using Resend HTTPS REST API (Port 443 - Cloud Firewall Safe).`);
    } else if (eff === "BREVO") {
      console.log(`📧 [SmartNotifier] Using Brevo HTTPS REST API (Port 443 - Cloud Firewall Safe).`);
    } else if (eff === "SMTP") {
      try {
        this.transporter = nodemailer.createTransport({
          host: this.smtpConfig.host,
          port: this.smtpConfig.port,
          secure: this.smtpConfig.port === 465,
          auth: {
            user: this.smtpConfig.auth.user,
            pass: this.smtpConfig.auth.pass
          },
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 5000
        });
        console.log(`📧 SmartNotifier SMTP Transporter configured (${this.smtpConfig.host}:${this.smtpConfig.port}).`);
      } catch (e) {
        console.warn("⚠️ SMTP Transporter init failed:", e.message);
      }
    } else {
      console.log("ℹ️ SmartNotifier running in Simulation Mode (Auto email engine active).");
    }
  }

  updateConfig(config) {
    if (config.thresholdCount) this.thresholdCount = Math.max(1, parseInt(config.thresholdCount, 10) || 3);
    if (config.provider !== undefined) this.provider = config.provider;
    if (config.apiKey !== undefined) this.apiKey = config.apiKey.trim();
    if (config.apiSender !== undefined) this.apiSender = config.apiSender.trim();
    if (config.host) this.smtpConfig.host = config.host;
    if (config.port) this.smtpConfig.port = parseInt(config.port, 10);
    if (config.user !== undefined) this.smtpConfig.auth.user = config.user.trim();
    if (config.pass !== undefined) this.smtpConfig.auth.pass = config.pass.trim();
    if (config.from !== undefined) this.smtpConfig.from = (config.from || "").trim();
    if (config.recipients !== undefined) {
      if (Array.isArray(config.recipients)) {
        this.recipients = config.recipients.map(e => (e || "").trim()).filter(Boolean);
      } else if (typeof config.recipients === "string") {
        this.recipients = config.recipients.split(",").map(e => e.trim()).filter(Boolean);
      }
    }
    if (config.enabled !== undefined) this.enabled = !!config.enabled;
    if (config.reportMode !== undefined) this.reportMode = config.reportMode;
    if (config.minContinuousHours !== undefined) this.minContinuousHours = parseInt(config.minContinuousHours, 10) || 1;
    if (config.selectedRules !== undefined && Array.isArray(config.selectedRules)) this.selectedRules = config.selectedRules;

    this.persistConfig();
    this.initTransporter();
  }

  getConfig() {
    const eff = this.getEffectiveProvider();
    return {
      thresholdCount: this.thresholdCount,
      provider: this.provider,
      effectiveProvider: eff,
      apiKey: this.apiKey ? (this.apiKey.slice(0, 5) + "••••••••" + this.apiKey.slice(-4)) : "",
      rawApiKey: this.apiKey || "",
      apiSender: this.apiSender || "seyoo123456789@gmail.com",
      host: this.smtpConfig.host || "smtp.naver.com",
      port: this.smtpConfig.port || 465,
      user: this.smtpConfig.auth.user || "",
      pass: this.smtpConfig.auth.pass || "",
      from: this.smtpConfig.from,
      recipients: this.recipients.join(", "),
      enabled: this.enabled,
      reportMode: this.reportMode,
      minContinuousHours: this.minContinuousHours,
      selectedRules: this.selectedRules,
      isConfigured: eff !== "SIMULATION"
    };
  }

  getLogs() {
    return this.notificationLogs;
  }

  getFromAddress() {
    if (this.smtpConfig.auth && this.smtpConfig.auth.user) {
      return `자동유량관측 이상알림 <${this.smtpConfig.auth.user}>`;
    }
    if (this.apiSender) {
      return `자동유량관측 이상알림 <${this.apiSender}>`;
    }
    return this.smtpConfig.from || "자동유량관측 이상알림";
  }

  getRuleCategory(ruleId, problem = "") {
    const p = (problem || "").toLowerCase();
    const r = (ruleId || "").toUpperCase();
    if (r === "ADVM-R01" || r === "EWSV-R01" || p.includes("자료 미수신") || p.includes("데이터 미수신") || p.includes("미수신")) {
      return "DATA_MISSING";
    }
    if (r === "ADVM-R10" || r === "EWSV-R10" || p.includes("배터리") || p.includes("battery")) {
      return "BATTERY_VOLTAGE";
    }
    if (r === "ADVM-R08" || r === "EWSV-R08" || p.includes("ac")) {
      return "AC_POWER";
    }
    if (r === "ADVM-R09" || r === "EWSV-R09" || p.includes("충전")) {
      return "DC_CHARGE";
    }
    if (r === "ADVM-R03" || r === "ADVM-R14" || r === "EWSV-R03" || p.includes("수위")) {
      return "WATER_LEVEL";
    }
    if (r === "ADVM-R04" || r === "EWSV-R05" || r === "EWSV-R06" || p.includes("유속계")) {
      return "VELOCITY_SENSOR";
    }
    if (r === "ADVM-R11" || r === "EWSV-R11" || r === "ADVM-R12" || r === "EWSV-R12" || p.includes("온도") || p.includes("습도")) {
      return "ENV_TEMP_HUMID";
    }
    return "OTHER";
  }

  /**
   * Main Check & Notify Loop - Runs automatically in background every 5 minutes
   */
  async checkAndNotify(currentIssues, targetTime) {
    if (!this.enabled) return;

    // 1. 기본 모드: 매 정각(00분 경) 1회만 단일 통합 리포트 발송 (지점별 개별 발송 중단)
    if (this.reportMode === "HOURLY_DIGEST") {
      await this.checkAndSendHourlyDigest(currentIssues, targetTime);
      return;
    }

    // 2. [선택적 모드] 지점별 개별 발송 모드 (PER_STATION)
    const activeKeys = new Set();
    const now = new Date();
    const timeStr = targetTime || now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    for (const issue of currentIssues) {
      const key = `${issue.stCode || issue.stationName}_${issue.ruleId}_${issue.sensorNo || 0}`;
      activeKeys.add(key);

      const count = issue.continuousCount || 1;
      let state = this.alertStates.get(key) || {
        level: "NORMAL",
        count: 0,
        lastNotifiedLevel: "",
        lastNotifiedTime: null,
        stationName: issue.stationName,
        ruleId: issue.ruleId,
        detail: issue.detail,
        problem: issue.problem
      };

      state.count = count;
      state.stationName = issue.stationName;
      state.ruleId = issue.ruleId;
      state.detail = issue.detail;
      state.problem = issue.problem;

      let currentLevel = "NORMAL";
      if (count >= this.thresholdCount * 2) {
        currentLevel = "CRITICAL";
      } else if (count >= this.thresholdCount) {
        currentLevel = "WARNING";
      }

      state.level = currentLevel;

      if (currentLevel !== "NORMAL" && state.lastNotifiedLevel !== currentLevel) {
        state.lastNotifiedLevel = currentLevel;
        state.lastNotifiedTime = timeStr;
        this.alertStates.set(key, state);

        await this.sendAlertEmail(issue, currentLevel, count, timeStr);
      } else {
        this.alertStates.set(key, state);
      }
    }

    for (const [key, state] of this.alertStates.entries()) {
      if (!activeKeys.has(key)) {
        if (state.lastNotifiedLevel === "WARNING" || state.lastNotifiedLevel === "CRITICAL") {
          await this.sendResolvedEmail(state, timeStr);
        }
        this.alertStates.delete(key);
      }
    }
  }

  /**
   * Hourly Digest: Evaluates top-of-hour timing and triggers a single consolidated report
   */
  async checkAndSendHourlyDigest(currentIssues, targetTime, isManualForce = false, customTargetEmail = null) {
    if (!this.enabled && !isManualForce) return;

    const now = new Date();
    let hourKey = "";
    let isNearTopOfTheHour = false;
    let displayTime = targetTime;

    if (targetTime && typeof targetTime === "string") {
      const parts = targetTime.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
      if (parts) {
        const minute = parseInt(parts[3], 10);
        // 정각 기준 00분~15분 사이 자료 수집 시 정각 리포트 발송 대상
        isNearTopOfTheHour = (minute >= 0 && minute <= 15);
        hourKey = `${parts[1]}-${parts[2]}`;
      }
    }

    if (!hourKey) {
      const kstDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
      const min = kstDate.getMinutes();
      isNearTopOfTheHour = (min >= 0 && min <= 15);
      hourKey = `${kstDate.getFullYear()}-${String(kstDate.getMonth()+1).padStart(2, "0")}-${String(kstDate.getDate()).padStart(2, "0")}-${String(kstDate.getHours()).padStart(2, "0")}`;
      if (!displayTime) {
        displayTime = `${kstDate.getFullYear()}-${String(kstDate.getMonth()+1).padStart(2, "0")}-${String(kstDate.getDate()).padStart(2, "0")} ${String(kstDate.getHours()).padStart(2, "0")}:00`;
      }
    }

    // 수동 테스트 발송이 아닌 경우 정각 부근인지 확인 및 중복 발송 방지
    if (!isManualForce) {
      if (!isNearTopOfTheHour) {
        return; // 정각이 아니면 건너뜀
      }
      if (this.lastReportedHourKey === hourKey) {
        return; // 이번 시간에 이미 발송 완료됨
      }
    }

    if (!isManualForce) {
      this.lastReportedHourKey = hourKey;
    }

    return await this.sendHourlyDigestReport(currentIssues, displayTime, isManualForce, customTargetEmail);
  }

  /**
   * Builds and dispatches the single consolidated Hourly Quality Digest Email
   */
  async sendHourlyDigestReport(currentIssues = [], displayTime = "", isManual = false, customTargetEmail = null) {
    const minThresholdCount = (this.minContinuousHours || 1) * 6; // 1시간 = 연속 6회
    const selected = new Set(this.selectedRules || ["DATA_MISSING", "BATTERY_VOLTAGE"]);

    // 1. Filter: 1시간 이상 지속된 오류 & 사용자가 선택한 오류 항목만 추출
    const filteredIssues = [];
    const stationMap = new Map(); // stCode -> consolidated issue object

    for (const iss of currentIssues) {
      const count = iss.continuousCount || 1;
      if (count < minThresholdCount) continue; // 1시간 미만 건너뜀

      const category = this.getRuleCategory(iss.ruleId, iss.problem);
      if (!selected.has(category)) continue; // 선택되지 않은 룰 건너뜀

      const key = `${iss.stCode || iss.stationName}_${category}`;
      if (!stationMap.has(key) || stationMap.get(key).continuousCount < count) {
        stationMap.set(key, { ...iss, category });
      }
    }

    const reportIssues = Array.from(stationMap.values());

    // 2. Group by Category
    const missingStations = reportIssues.filter(i => i.category === "DATA_MISSING");
    const batteryStations = reportIssues.filter(i => i.category === "BATTERY_VOLTAGE");
    const otherStations = reportIssues.filter(i => i.category !== "DATA_MISSING" && i.category !== "BATTERY_VOLTAGE");

    const totalAbnormalCount = reportIssues.length;
    const timeLabel = displayTime || new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // 3. Email Subject
    let subject = "";
    if (isManual) {
      subject = `[테스트] [한국수자원조사기술원] 전국 관측소 품질감시 정기 리포트 (${timeLabel} 기준)`;
    } else if (totalAbnormalCount > 0) {
      subject = `[전국 관측소 품질감시 정기 리포트] 1시간 이상 이상지점 총 ${totalAbnormalCount}건 요약 (${timeLabel} 기준)`;
    } else {
      subject = `[전국 관측소 품질감시 정기 리포트] 전국 관측소 1시간 이상 이상 없음 (정상 가동) (${timeLabel} 기준)`;
    }

    // 4. Build Table Rows
    const renderTableRows = (list, isBattery = false) => {
      if (list.length === 0) {
        return `<tr><td colspan="5" style="text-align:center; padding:16px; color:#94a3b8; font-size:13px;">해당되는 1시간 이상 이상 지점이 없습니다.</td></tr>`;
      }
      return list.map((item, idx) => {
        const count = item.continuousCount || 6;
        const durationHours = (count / 6).toFixed(1);
        const durationText = `${durationHours}시간 (${count * 10}분, ${count}회)`;
        const regionBadge = `<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:700; font-size:11px;">${item.region || "전국"}</span>`;
        const gaugeBadge = `<span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-size:11px;">${item.gaugeType || "ADVM/EWSV"}</span>`;

        let detailText = item.detail || item.problem || "-";
        if (isBattery) {
          detailText = `<b style="color:#b91c1c;">${item.detail || "배터리 전압 기준치 미달"}</b>`;
        }

        return `
          <tr style="border-bottom:1px solid #f1f5f9; font-size:13px;">
            <td style="padding:10px 8px; text-align:center; color:#64748b;">${idx + 1}</td>
            <td style="padding:10px 8px; font-weight:700; color:#1e293b;">
              ${item.stationName} ${gaugeBadge}
            </td>
            <td style="padding:10px 8px; text-align:center;">${regionBadge}</td>
            <td style="padding:10px 8px; text-align:center; color:#ea580c; font-weight:700;">${durationText}</td>
            <td style="padding:10px 8px; color:#334155;">${detailText}</td>
          </tr>
        `;
      }).join("");
    };

    // 5. Build Full HTML Template
    const html = `
      <div style="font-family:'Pretendard',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif; max-width:680px; margin:0 auto; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:#ffffff; box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <!-- Top Brand Header -->
        <div style="background:#1e3a8a; padding:22px 24px; color:#ffffff;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12px; font-weight:700; letter-spacing:0.8px; opacity:0.85; text-transform:uppercase;">KIHS 한국수자원조사기술원</span>
            <span style="font-size:11px; background:rgba(255,255,255,0.2); padding:3px 8px; border-radius:12px;">매 정각 종합 리포트</span>
          </div>
          <h2 style="margin:10px 0 4px 0; font-size:20px; font-weight:800; line-height:1.3;">
            📊 전국 자동유량관측소 품질감시 정기 리포트
          </h2>
          <div style="font-size:13px; opacity:0.9; margin-top:4px;">
            • 기준 시각: <strong>${timeLabel}</strong> | 감시 대상: <strong>전국 223개 관측소</strong>
          </div>
        </div>

        <!-- Summary KPI Cards -->
        <div style="padding:20px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
          <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:10px;">📌 1시간(6회) 이상 중대 이상 현황 요약</div>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
            <div style="background:#ffffff; border:1px solid #fed7aa; border-radius:8px; padding:12px 14px; text-align:center;">
              <div style="font-size:12px; color:#ea580c; font-weight:700;">📡 자료 미수신</div>
              <div style="font-size:22px; font-weight:900; color:#ea580c; margin-top:2px;">${missingStations.length}개소</div>
              <div style="font-size:11px; color:#94a3b8;">1시간 이상 통신두절</div>
            </div>
            <div style="background:#ffffff; border:1px solid #fecaca; border-radius:8px; padding:12px 14px; text-align:center;">
              <div style="font-size:12px; color:#dc2626; font-weight:700;">🔋 배터리 전압 이상</div>
              <div style="font-size:22px; font-weight:900; color:#dc2626; margin-top:2px;">${batteryStations.length}개소</div>
              <div style="font-size:11px; color:#94a3b8;">1시간 이상 전압저하</div>
            </div>
            <div style="background:#ffffff; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px; text-align:center;">
              <div style="font-size:12px; color:#16a34a; font-weight:700;">🟢 정상 운영 관측소</div>
              <div style="font-size:22px; font-weight:900; color:#16a34a; margin-top:2px;">${Math.max(0, 223 - totalAbnormalCount)}개소</div>
              <div style="font-size:11px; color:#94a3b8;">중대 결측 없음</div>
            </div>
          </div>
        </div>

        <!-- Body Tables -->
        <div style="padding:24px;">
          <!-- Section 1: 자료 미수신 (1시간 이상) -->
          <div style="margin-bottom:28px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:2px solid #ea580c; padding-bottom:6px;">
              <h3 style="margin:0; font-size:15px; font-weight:800; color:#1e293b;">
                📡 1. 자료 미수신 지점 (1시간 이상 지속)
              </h3>
              <span style="font-size:12px; font-weight:700; color:#ea580c;">총 ${missingStations.length}개소</span>
            </div>
            <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="background:#f1f5f9; font-size:12px; color:#475569;">
                  <th style="padding:8px; text-align:center; width:36px;">No</th>
                  <th style="padding:8px;">관측소명</th>
                  <th style="padding:8px; text-align:center; width:65px;">권역</th>
                  <th style="padding:8px; text-align:center; width:130px;">지속시간</th>
                  <th style="padding:8px;">상태 및 점검메모</th>
                </tr>
              </thead>
              <tbody>
                ${renderTableRows(missingStations)}
              </tbody>
            </table>
          </div>

          <!-- Section 2: 배터리 전압 이상 (1시간 이상) -->
          <div style="margin-bottom:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:2px solid #dc2626; padding-bottom:6px;">
              <h3 style="margin:0; font-size:15px; font-weight:800; color:#1e293b;">
                🔋 2. 배터리 전압 이상 지점 (1시간 이상 지속)
              </h3>
              <span style="font-size:12px; font-weight:700; color:#dc2626;">총 ${batteryStations.length}개소</span>
            </div>
            <table style="width:100%; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="background:#f1f5f9; font-size:12px; color:#475569;">
                  <th style="padding:8px; text-align:center; width:36px;">No</th>
                  <th style="padding:8px;">관측소명</th>
                  <th style="padding:8px; text-align:center; width:65px;">권역</th>
                  <th style="padding:8px; text-align:center; width:130px;">지속시간</th>
                  <th style="padding:8px;">배터리 전압 상태</th>
                </tr>
              </thead>
              <tbody>
                ${renderTableRows(batteryStations, true)}
              </tbody>
            </table>
          </div>

          ${otherStations.length > 0 ? `
            <!-- Section 3: 기타 품질 이상 -->
            <div style="margin-bottom:24px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:2px solid #6366f1; padding-bottom:6px;">
                <h3 style="margin:0; font-size:15px; font-weight:800; color:#1e293b;">
                  ⚠️ 3. 기타 선택된 품질 이상 지점 (1시간 이상 지속)
                </h3>
                <span style="font-size:12px; font-weight:700; color:#6366f1;">총 ${otherStations.length}개소</span>
              </div>
              <table style="width:100%; border-collapse:collapse; text-align:left;">
                <thead>
                  <tr style="background:#f1f5f9; font-size:12px; color:#475569;">
                    <th style="padding:8px; text-align:center; width:36px;">No</th>
                    <th style="padding:8px;">관측소명</th>
                    <th style="padding:8px; text-align:center; width:65px;">권역</th>
                    <th style="padding:8px; text-align:center; width:130px;">지속시간</th>
                    <th style="padding:8px;">세부 문제내용</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderTableRows(otherStations)}
                </tbody>
              </table>
            </div>
          ` : ""}

          <!-- Link CTA -->
          <div style="text-align:center; margin-top:28px; padding-top:20px; border-top:1px dashed #e2e8f0;">
            <a href="https://khydro-flow-station-system.onrender.com" target="_blank" style="display:inline-block; background:#1e3a8a; color:#ffffff; padding:12px 28px; border-radius:8px; font-weight:700; text-decoration:none; font-size:14px; box-shadow:0 2px 6px rgba(30,58,138,0.25);">
              📊 통합 관리시스템 실시간 분석 바로가기 ➔
            </a>
            <div style="font-size:11px; color:#94a3b8; margin-top:8px;">
              * 본 리포트는 매 정각(00분) 1시간 이상 지속된 오류만 1통으로 취합하여 자동 발송됩니다.
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc; padding:14px 24px; font-size:11px; color:#94a3b8; border-top:1px solid #e2e8f0; text-align:center;">
          한국수자원조사기술원 자동유량관측시설 및 유지관리 총괄 시스템 | 24시간 품질감시 엔진
        </div>
      </div>
    `;

    return await this.deliverEmail(subject, html, "전국 관측소 정기 종합 리포트", totalAbnormalCount > 0 ? "CRITICAL" : "NORMAL", totalAbnormalCount, customTargetEmail);
  }

  async sendTestDigestEmail(targetEmail, currentIssues = []) {
    const testRecipient = targetEmail || this.recipients[0];
    if (!testRecipient) {
      return { success: false, message: "수신 대상자 이메일이 설정되지 않았습니다. 수신자 이메일을 입력하세요." };
    }
    const nowTime = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const res = await this.sendHourlyDigestReport(currentIssues, `${nowTime} (테스트)`, true, testRecipient);
    return res;
  }

  async sendAlertEmail(issue, level, count, timeStr) {
    const isCritical = level === "CRITICAL";
    const badgeColor = isCritical ? "#dc2626" : "#ea580c";
    const levelName = isCritical ? "긴급경보 (1시간 이상 지속)" : `주의알림 (연속 ${this.thresholdCount}회 이상)`;
    const durationMins = count * 10;
    const durationHours = (durationMins / 60).toFixed(1);

    const subject = `[자동유량관측 ${isCritical ? "경보" : "주의"}] ${issue.stationName} (${issue.ruleId}) 연속 ${count}회(${durationHours}시간 (${durationMins}분)) 결측 발생`;

    const html = `
      <div style="font-family:'Pretendard',-apple-system,sans-serif; max-width:620px; margin:0 auto; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:#ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="background:${badgeColor}; padding:20px 24px; color:#ffffff;">
          <div style="font-size:13px; font-weight:700; letter-spacing:0.5px; opacity:0.9;">한국수자원조사기술원 | 실시간 관측품질 자동알림</div>
          <h2 style="margin:8px 0 0 0; font-size:20px; font-weight:800; line-height:1.3;">🚨 ${levelName}</h2>
        </div>

        <!-- Body -->
        <div style="padding:24px;">
          <p style="font-size:15px; color:#1e293b; line-height:1.5; margin-top:0;">
            <strong>${issue.stationName}</strong> 관측소에서 <strong>[${issue.ruleId}]</strong> 품질 룰 위반 및 결측이 연속 <strong>${count}회(${durationHours}시간)</strong> 감지되었습니다.
          </p>

          <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px; background:#f8fafc; border-radius:8px; overflow:hidden; border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:10px 14px; font-weight:600; color:#475569; width:28%; border-bottom:1px solid #e2e8f0;">관측소명 (코드)</td>
              <td style="padding:10px 14px; font-weight:700; color:#0f172a; border-bottom:1px solid #e2e8f0;">${issue.stationName} (<code>${issue.stCode || "-"}</code>)</td>
            </tr>
            <tr>
              <td style="padding:10px 14px; font-weight:600; color:#475569; border-bottom:1px solid #e2e8f0;">위반 룰 ID</td>
              <td style="padding:10px 14px; color:#dc2626; font-weight:700; border-bottom:1px solid #e2e8f0;">${issue.ruleId} (${issue.method || "ADVM/EWSV"})</td>
            </tr>
            <tr>
              <td style="padding:10px 14px; font-weight:600; color:#475569; border-bottom:1px solid #e2e8f0;">이상 현상</td>
              <td style="padding:10px 14px; color:#0f172a; border-bottom:1px solid #e2e8f0;">${issue.problem || issue.detail}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px; font-weight:600; color:#475569; border-bottom:1px solid #e2e8f0;">연속 결측 횟수</td>
              <td style="padding:10px 14px; font-weight:800; color:${badgeColor}; border-bottom:1px solid #e2e8f0;">${count}회 연속 (${durationHours}시간 지속)</td>
            </tr>
            <tr>
              <td style="padding:10px 14px; font-weight:600; color:#475569;">발생 감지시각</td>
              <td style="padding:10px 14px; color:#0f172a;">${timeStr}</td>
            </tr>
          </table>

          <!-- Actions -->
          <div style="background:#f1f5f9; padding:16px; border-radius:8px; font-size:13px; color:#475569; line-height:1.5;">
            💡 <strong>조치 안내:</strong> 시스템에 접속하여 해당 관측소의 실시간 수위 비교 및 원격 통신 상태를 확인하시기 바랍니다.
          </div>

          <div style="text-align:center; margin-top:24px;">
            <a href="https://khydro-flow-station-system.onrender.com" target="_blank" style="display:inline-block; background:#1e293b; color:#ffffff; padding:12px 24px; border-radius:8px; font-weight:700; text-decoration:none; font-size:14px;">
              📊 통합 관리시스템 바로가기 ➔
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc; padding:16px 24px; font-size:12px; color:#94a3b8; border-top:1px solid #e2e8f0; text-align:center;">
          본 메일은 전국 자동유량관측시설 품질감시 엔진에 의해 자동 발송되었습니다.
        </div>
      </div>
    `;

    return this.deliverEmail(subject, html, issue.stationName, level, count);
  }

  async sendResolvedEmail(issue, timeStr) {
    const subject = `[자동유량관측 복구완료] ${issue.stationName} (${issue.ruleId}) 정상 수신 복구`;
    const html = `
      <div style="font-family:'Pretendard',-apple-system,sans-serif; max-width:620px; margin:0 auto; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:#ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <div style="background:#16a34a; padding:20px 24px; color:#ffffff;">
          <div style="font-size:13px; font-weight:700; letter-spacing:0.5px; opacity:0.9;">한국수자원조사기술원 | 실시간 관측품질 자동알림</div>
          <h2 style="margin:8px 0 0 0; font-size:20px; font-weight:800; line-height:1.3;">✅ [정상 복구] 관측자료 정상 수신 확인</h2>
        </div>
        <div style="padding:24px;">
          <p style="font-size:15px; color:#1e293b; line-height:1.5;">
            <strong>${issue.stationName}</strong> 관측소의 <strong>[${issue.ruleId}]</strong> 결측/이상 상태가 해소되어 정상 수신으로 복구되었습니다.
          </p>
          <div style="background:#f0fdf4; border-left:4px solid #16a34a; padding:12px 16px; border-radius:4px; font-size:13px; color:#166534; margin:16px 0;">
            • 정상 복구 확인시각: <strong>${timeStr}</strong>
          </div>
        </div>
      </div>
    `;

    return this.deliverEmail(subject, html, issue.stationName, "RESOLVED", 0);
  }

  async deliverEmail(subject, html, stationName, level, count, customRecipients = null) {
    const eff = this.getEffectiveProvider();
    const actualRecipients = (customRecipients 
      ? (Array.isArray(customRecipients) ? customRecipients : [customRecipients]) 
      : this.recipients).map(r => (r || "").trim()).filter(Boolean);

    if (actualRecipients.length === 0) {
      console.log(`ℹ️ [SmartNotifier] 수신 대상자(recipients)가 지정되지 않아 이메일을 발송하지 않습니다. (${subject})`);
      return { success: false, message: "수신 대상자 이메일이 지정되지 않았습니다. [데이터 관리]에서 수신 이메일을 등록해주세요." };
    }

    const logItem = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      stationName,
      level,
      count,
      subject,
      recipients: actualRecipients.join(", "),
      status: "SENT",
      mode: eff === "RESEND" ? "HTTP_API (Resend)" : (eff === "BREVO" ? "HTTP_API (Brevo)" : (eff === "SMTP" ? "REAL_SMTP" : "SIMULATED"))
    };

    if (eff === "RESEND") {
      try {
        const res = await this.sendViaResend(actualRecipients, subject, html);
        if (res.success) {
          logItem.status = "SUCCESS";
          console.log(`📧 [SmartNotifier (Resend)] Sent to ${actualRecipients.join(", ")} - ${subject}`);
        } else {
          logItem.status = "FAILED";
          logItem.error = res.error;
          console.warn(`⚠️ [SmartNotifier (Resend)] Error:`, res.error);
        }
      } catch (e) {
        logItem.status = "FAILED";
        logItem.error = e.message;
      }
    } else if (eff === "BREVO") {
      try {
        const res = await this.sendViaBrevo(actualRecipients, subject, html);
        if (res.success) {
          logItem.status = "SUCCESS";
          console.log(`📧 [SmartNotifier (Brevo)] Sent to ${actualRecipients.join(", ")} - ${subject}`);
        } else {
          logItem.status = "FAILED";
          logItem.error = res.error;
          console.warn(`⚠️ [SmartNotifier (Brevo)] Error:`, res.error);
        }
      } catch (e) {
        logItem.status = "FAILED";
        logItem.error = e.message;
      }
    } else if (eff === "SMTP" && this.transporter) {
      try {
        const fromAddr = this.getFromAddress();
        await this.transporter.sendMail({
          from: fromAddr,
          to: actualRecipients,
          subject,
          html
        });
        logItem.status = "SUCCESS";
        console.log(`📧 [SmartNotifier (SMTP)] Sent REAL email to ${actualRecipients.join(", ")} - ${subject}`);
      } catch (e) {
        logItem.status = "FAILED";
        logItem.error = e.message;
        console.warn(`⚠️ [SmartNotifier (SMTP)] Send failed:`, e.message);
      }
    } else {
      console.log(`📨 [SmartNotifier Simulation] Auto email logged for ${stationName} (${level}, ${count}회)`);
    }

    this.notificationLogs.unshift(logItem);
    if (this.notificationLogs.length > this.maxLogs) {
      this.notificationLogs = this.notificationLogs.slice(0, this.maxLogs);
    }

    return logItem;
  }

  async sendViaResend(recipients, subject, html) {
    if (!this.apiKey) return { success: false, error: "Resend API Key가 설정되지 않았습니다." };

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "자동유량관측 이상알림 <onboarding@resend.dev>",
          to: recipients,
          subject,
          html
        })
      });

      const data = await response.json();
      if (!response.ok) {
        let errMsg = data.message || JSON.stringify(data);
        if (errMsg.includes("unrecognised IP address") || data.code === "unauthorized") {
          errMsg += " -> Brevo 대시보드(Security > Authorised IPs: https://app.brevo.com/security/authorised_ips )에서 [Deactivate blocking]을 클릭하여 차단을 해제해야 합니다.";
        }
        return { success: false, error: errMsg };
      }
      return { success: true, id: data.id };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async sendViaBrevo(recipients, subject, html) {
    if (!this.apiKey) return { success: false, error: "Brevo API Key가 설정되지 않았습니다." };

    try {
      const senderEmail = this.apiSender || (this.smtpConfig.auth && this.smtpConfig.auth.user) || "seyoo123456789@gmail.com";
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
          "accept": "application/json"
        },
        body: JSON.stringify({
          sender: { name: "한국수자원조사기술원 이상알림", email: senderEmail },
          to: recipients.map(email => ({ email })),
          subject,
          htmlContent: html
        })
      });

      const data = await response.json();
      if (!response.ok) {
        let errMsg = data.message || JSON.stringify(data);
        if (errMsg.includes("unrecognised IP address") || data.code === "unauthorized") {
          errMsg += " -> Brevo 대시보드(Security > Authorised IPs: https://app.brevo.com/security/authorised_ips )에서 [Deactivate blocking]을 클릭하여 차단을 해제해야 합니다.";
        }
        return { success: false, error: errMsg };
      }
      return { success: true, id: data.messageId };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async sendTestEmail(targetEmail) {
    const testRecipient = targetEmail || this.recipients[0];
    if (!testRecipient) {
      return { success: false, message: "수신 대상자 이메일이 설정되지 않았습니다. 수신자 이메일을 입력하세요." };
    }
    const eff = this.getEffectiveProvider();
    const subject = `[테스트] 한국수자원조사기술원 스마트 이메일 알림 연동 테스트 (${eff})`;
    const html = `
      <div style="font-family:sans-serif; padding:20px; border:1px solid #e2e8f0; border-radius:8px;">
        <h3 style="color:#2563eb;">🚀 이메일 알림 연동 테스트 성공</h3>
        <p>자동유량관측시설 스마트 알림 엔진(설정 임계치: <strong>연속 ${this.thresholdCount}회</strong>)이 정상 작동 중입니다.</p>
        <p><strong>발송 엔진:</strong> ${eff === "RESEND" ? "Resend HTTPS REST API (클라우드 방화벽 안심)" : (eff === "BREVO" ? "Brevo HTTPS REST API" : (eff === "SMTP" ? "네이버/사내 SMTP" : "시뮬레이션 모드"))}</p>
        <p><strong>수신처:</strong> ${testRecipient}</p>
        <p><strong>발송시각:</strong> ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
      </div>
    `;

    if (eff === "RESEND") {
      const res = await this.sendViaResend([testRecipient], subject, html);
      if (res.success) {
        return { success: true, message: `[Resend HTTP API] 테스트 메일이 ${testRecipient}로 성공적으로 발송되었습니다!` };
      } else {
        return { success: false, message: `Resend 발송 실패: ${res.error}` };
      }
    } else if (eff === "BREVO") {
      const res = await this.sendViaBrevo([testRecipient], subject, html);
      if (res.success) {
        return { success: true, message: `[Brevo HTTP API] 테스트 메일이 ${testRecipient}로 성공적으로 발송되었습니다!` };
      } else {
        return { success: false, message: `Brevo 발송 실패: ${res.error}` };
      }
    } else if (eff === "SMTP" && this.transporter) {
      try {
        const fromAddr = this.getFromAddress();
        await this.transporter.sendMail({
          from: fromAddr,
          to: testRecipient,
          subject,
          html
        });
        return { success: true, message: `테스트 메일이 ${testRecipient}로 성공적으로 발송되었습니다! (REAL SMTP)` };
      } catch (e) {
        return { success: false, message: `SMTP 발송 실패 (${e.message}). 클라우드 호스팅 방화벽 정책으로 인해 HTTP REST API (Resend/Brevo) 사용을 권장합니다.` };
      }
    } else {
      return { success: true, simulated: true, message: `가상 시뮬레이션 모드: 메일 발송 테스트 로그가 성공적으로 생성되었습니다. (API Key 또는 SMTP 계정 입력 필요)` };
    }
  }

  /**
   * Send Temporary Password Reset Email to User
   */
  async sendPasswordResetEmail(targetEmail, username, name, tempPassword) {
    const eff = this.getEffectiveProvider();
    const subject = `[한국수자원조사기술원] 자동유량관측시스템 임시 비밀번호 안내 (${username})`;
    const userDisplayName = name ? `${name} (${username})` : username;
    const sendTime = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    const html = `
      <div style="font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif; max-width:580px; margin:0 auto; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:#ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="background:linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding:24px 28px; color:#ffffff;">
          <div style="font-size:12px; font-weight:700; letter-spacing:0.5px; opacity:0.85; margin-bottom:4px;">한국수자원조사기술원 수자원인프라팀</div>
          <h2 style="margin:0; font-size:20px; font-weight:800; line-height:1.3;">🔐 임시 비밀번호 발급 안내</h2>
        </div>

        <!-- Body -->
        <div style="padding:28px;">
          <p style="font-size:15px; color:#1e293b; line-height:1.6; margin-top:0;">
            안녕하세요, <strong>${userDisplayName}</strong>님.<br>
            자동유량관측시설 관리시스템 계정의 비밀번호 재설정 요청이 정상적으로 접수되었습니다.
          </p>

          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:20px; margin:24px 0; text-align:center;">
            <div style="font-size:13px; font-weight:600; color:#64748b; margin-bottom:8px;">발급된 임시 비밀번호</div>
            <div style="display:inline-block; background:#ffffff; border:2px dashed #2563eb; padding:10px 24px; border-radius:8px; font-family:'Courier New',monospace; font-size:22px; font-weight:800; color:#1d4ed8; letter-spacing:2px;">
              ${tempPassword}
            </div>
            <div style="font-size:12px; color:#94a3b8; margin-top:8px;">* 대소문자 및 특수기호를 정확하게 입력해 주세요.</div>
          </div>

          <div style="background:#eff6ff; border-left:4px solid #3b82f6; padding:14px 16px; border-radius:0 8px 8px 0; font-size:13px; color:#1e40af; line-height:1.6; margin-bottom:20px;">
            <b>📌 로그인 후 필수 조치 안내:</b><br>
            위 임시 비밀번호로 로그인하신 후, 우측 상단의 <b>[마이페이지] > [비밀번호 변경]</b> 메뉴에서 본인만의 안전한 새 비밀번호로 반드시 변경해 주시기 바랍니다.
          </div>

          <div style="font-size:12px; color:#64748b; line-height:1.5; border-top:1px solid #f1f5f9; padding-top:16px;">
            • 발송 일시: ${sendTime}<br>
            • 발송 방식: ${eff} 엔진<br>
            • 본인이 요청하지 않은 경우 시스템 관리자에게 즉시 문의하시기 바랍니다.
          </div>
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc; padding:14px 28px; font-size:11px; color:#94a3b8; text-align:center; border-top:1px solid #e2e8f0;">
          © 한국수자원조사기술원(KIHS) 수자원인프라팀 관제시스템 | 본 메일은 발신전용입니다.
        </div>
      </div>
    `;

    const logItem = {
      id: "pwd_" + Date.now(),
      timestamp: new Date().toISOString(),
      stationName: `계정 [${username}]`,
      level: "PASSWORD_RESET",
      count: 1,
      recipients: targetEmail,
      mode: eff,
      status: "PENDING"
    };

    if (eff === "RESEND") {
      const res = await this.sendViaResend([targetEmail], subject, html);
      logItem.status = res.success ? "SUCCESS" : "FAILED";
      if (!res.success) logItem.error = res.error;
    } else if (eff === "BREVO") {
      const res = await this.sendViaBrevo([targetEmail], subject, html);
      logItem.status = res.success ? "SUCCESS" : "FAILED";
      if (!res.success) logItem.error = res.error;
    } else if (eff === "SMTP" && this.transporter) {
      try {
        const fromAddr = this.getFromAddress();
        await this.transporter.sendMail({
          from: fromAddr,
          to: targetEmail,
          subject,
          html
        });
        logItem.status = "SUCCESS";
      } catch (e) {
        logItem.status = "FAILED";
        logItem.error = e.message;
      }
    } else {
      logItem.status = "SIMULATED";
      console.log(`📨 [SmartNotifier Simulation] Password reset email for ${username} (${targetEmail}): Temp Password = ${tempPassword}`);
    }

    this.notificationLogs.unshift(logItem);
    if (this.notificationLogs.length > this.maxLogs) {
      this.notificationLogs = this.notificationLogs.slice(0, this.maxLogs);
    }

    return {
      success: logItem.status === "SUCCESS" || logItem.status === "SIMULATED",
      mode: eff,
      error: logItem.error
    };
  }
}

const notifier = new SmartNotifierService();
module.exports = notifier;
