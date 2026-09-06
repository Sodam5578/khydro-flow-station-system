const nodemailer = require("nodemailer");

class SmartNotifierService {
  constructor() {
    // Alert state tracker: key -> { level: "WARNING"|"NORMAL", count: number, lastNotifiedLevel: "", lastNotifiedTime: "" }
    this.alertStates = new Map();
    this.notificationLogs = [];
    this.maxLogs = 500;

    // User-configurable alert threshold count (default: 3 times = 30 mins)
    this.thresholdCount = parseInt(process.env.ALERT_THRESHOLD_COUNT, 10) || 3;

    // Default SMTP config (Can be overridden via env or admin settings)
    this.smtpConfig = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
      },
      from: process.env.SMTP_FROM || "자동유량관측 이상알림 <noreply@kihs.re.kr>"
    };

    this.recipients = (process.env.ALERT_RECIPIENTS || "psn5578@kihs.re.kr, psn5578@naver.com, kihs_infra@kihs.re.kr").split(",").map(e => e.trim());
    this.enabled = process.env.ENABLE_EMAIL_ALERTS === "true" || true;
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    if (this.smtpConfig.auth.user && this.smtpConfig.auth.pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host: this.smtpConfig.host,
          port: this.smtpConfig.port,
          secure: this.smtpConfig.port === 465,
          auth: {
            user: this.smtpConfig.auth.user,
            pass: this.smtpConfig.auth.pass
          }
        });
        console.log("📧 SmartNotifier SMTP Transporter configured.");
      } catch (e) {
        console.warn("⚠️ SMTP Transporter init failed:", e.message);
      }
    } else {
      console.log("ℹ️ SmartNotifier running in Simulation Mode (Auto email engine active).");
    }
  }

  updateConfig(config) {
    if (config.thresholdCount) this.thresholdCount = Math.max(1, parseInt(config.thresholdCount, 10) || 3);
    if (config.host) this.smtpConfig.host = config.host;
    if (config.port) this.smtpConfig.port = parseInt(config.port, 10);
    if (config.user) this.smtpConfig.auth.user = config.user;
    if (config.pass) this.smtpConfig.auth.pass = config.pass;
    if (config.from) this.smtpConfig.from = config.from;
    if (config.recipients) this.recipients = config.recipients.split(",").map(e => e.trim()).filter(Boolean);
    if (config.enabled !== undefined) this.enabled = !!config.enabled;
    this.initTransporter();
  }

  getConfig() {
    return {
      thresholdCount: this.thresholdCount,
      host: this.smtpConfig.host,
      port: this.smtpConfig.port,
      user: this.smtpConfig.auth.user ? `${this.smtpConfig.auth.user.slice(0, 3)}***` : "",
      from: this.smtpConfig.from,
      recipients: this.recipients.join(", "),
      enabled: this.enabled,
      isConfigured: !!(this.smtpConfig.auth.user && this.smtpConfig.auth.pass)
    };
  }

  getLogs() {
    return this.notificationLogs;
  }

  /**
   * Main Check & Notify Loop - Runs automatically in background every 5 minutes
   * Even when no user is browsing the webpage!
   */
  async checkAndNotify(currentIssues, targetTime) {
    if (!this.enabled) return;

    const activeKeys = new Set();
    const now = new Date();
    const timeStr = targetTime || now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // 1. Evaluate Active Issues against user-defined threshold
    for (const issue of currentIssues) {
      const key = `${issue.stCode || issue.stationName}_${issue.sensorNo || "0"}_${issue.ruleId || "GEN"}`;
      activeKeys.add(key);

      const count = issue.continuousCount || 1;
      let currentState = this.alertStates.get(key) || {
        level: "NORMAL",
        count: 0,
        lastNotifiedLevel: "",
        lastNotifiedTime: null,
        issue
      };

      currentState.count = count;
      currentState.issue = issue;

      // Single customizable warning threshold
      let newLevel = "NORMAL";
      if (count >= this.thresholdCount) {
        newLevel = "WARNING"; // 연속 N회 결측 도달
      }

      // Trigger email only on first state transition to prevent duplicate spam
      if (newLevel === "WARNING" && currentState.lastNotifiedLevel !== "WARNING") {
        await this.sendWarningEmail(issue, count, timeStr);
        currentState.lastNotifiedLevel = "WARNING";
        currentState.lastNotifiedTime = now.toISOString();
      }

      this.alertStates.set(key, currentState);
    }

    // 2. Evaluate Resolved Issues (Previously alerted, now healthy)
    for (const [key, state] of this.alertStates.entries()) {
      if (!activeKeys.has(key)) {
        if (state.lastNotifiedLevel === "WARNING") {
          await this.sendResolvedEmail(state.issue, timeStr);
        }
        this.alertStates.delete(key);
      }
    }
  }

  async sendWarningEmail(issue, count, timeStr) {
    const durationMin = count * 10;
    const durationStr = durationMin >= 60 ? `${(durationMin / 60).toFixed(1)}시간 (${durationMin}분)` : `${durationMin}분`;
    const subject = `[자동유량관측 주의알림] ${issue.stationName} (${issue.ruleId}) 연속 ${count}회(${durationStr}) 결측 발생`;

    const html = `
      <div style="font-family:'Pretendard',-apple-system,sans-serif; max-width:620px; margin:0 auto; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:#ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <div style="background:#ea580c; padding:20px 24px; color:#ffffff;">
          <div style="font-size:13px; font-weight:700; letter-spacing:0.5px; opacity:0.9;">한국수자원조사기술원 | 실시간 관측품질 자동알림</div>
          <h2 style="margin:8px 0 0 0; font-size:20px; font-weight:800; line-height:1.3;">⚠️ [주의 알림] 연속 ${count}회 결측 감지 (${durationStr})</h2>
        </div>
        <div style="padding:24px;">
          <div style="background:#fff7ed; border-left:4px solid #ea580c; padding:14px 16px; border-radius:4px; margin-bottom:20px;">
            <div style="font-size:16px; font-weight:700; color:#1e293b;">${issue.stationName} <span style="font-size:13px; color:#64748b;">(코드: ${issue.stCode || "-"})</span></div>
            <div style="font-size:13px; color:#475569; margin-top:4px;">권역: <strong>${issue.basin || "전국"}</strong> | 계측방식: <strong>${issue.method || "ADVM/EWSV"}</strong> | 센서: <strong>${issue.sensorNo || "1"}번</strong></div>
          </div>

          <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px;">
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 0; color:#64748b; width:110px; font-weight:600;">진단 룰 ID</td>
              <td style="padding:10px 0; font-weight:700; color:#ea580c;">${issue.ruleId || "-"}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 0; color:#64748b; font-weight:600;">진단 문제</td>
              <td style="padding:10px 0; font-weight:700; color:#1e293b;">${issue.problem || "자료 수신 결측/품질 이상"}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 0; color:#64748b; font-weight:600;">상세 내용</td>
              <td style="padding:10px 0; color:#334155;">${issue.detail || "-"}</td>
            </tr>
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px 0; color:#64748b; font-weight:600;">연속 결측</td>
              <td style="padding:10px 0; font-weight:800; color:#ea580c;">${count}회 연속 (${durationStr}) [설정 임계치: ${this.thresholdCount}회 이상]</td>
            </tr>
            <tr>
              <td style="padding:10px 0; color:#64748b; font-weight:600;">관측 기준시각</td>
              <td style="padding:10px 0; color:#1e293b;">${timeStr}</td>
            </tr>
          </table>

          <div style="text-align:center; margin-top:28px;">
            <a href="https://khydro-flow-station-system.onrender.com" target="_blank" style="display:inline-block; background:#1e293b; color:#ffffff; padding:12px 24px; border-radius:8px; font-weight:700; text-decoration:none; font-size:14px;">
              🛰️ 통합관리시스템에서 상세 확인 & 점검일정 등록 ➡️
            </a>
          </div>
        </div>
        <div style="background:#f1f5f9; padding:14px 24px; text-align:center; font-size:12px; color:#64748b; border-top:1px solid #e2e8f0;">
          본 메일은 수자원인프라팀 24시간 실시간 품질감시 백그라운드 엔진에 의해 자동 발송되었습니다.
        </div>
      </div>
    `;

    return this.deliverEmail(subject, html, issue.stationName, "WARNING", count);
  }

  async sendResolvedEmail(issue, timeStr) {
    const subject = `[자동유량관측 정상복구] ${issue.stationName} (${issue.ruleId}) 데이터 수신 정상화 완료`;
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

  getFromAddress() {
    if (this.smtpConfig.auth && this.smtpConfig.auth.user) {
      return `자동유량관측 이상알림 <${this.smtpConfig.auth.user}>`;
    }
    return this.smtpConfig.from || "자동유량관측 이상알림 <noreply@kihs.re.kr>";
  }

  async deliverEmail(subject, html, stationName, level, count) {
    const fromAddr = this.getFromAddress();
    const logItem = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      stationName,
      level,
      count,
      subject,
      recipients: this.recipients.join(", "),
      status: "SENT",
      mode: this.transporter ? "REAL_SMTP" : "SIMULATED"
    };

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: fromAddr,
          to: this.recipients,
          subject,
          html
        });
        logItem.status = "SUCCESS";
        console.log(`📧 [SmartNotifier] Sent REAL email to ${this.recipients.join(", ")} - ${subject}`);
      } catch (e) {
        logItem.status = "FAILED";
        logItem.error = e.message;
        console.warn(`⚠️ [SmartNotifier] SMTP Send failed:`, e.message);
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

  async sendTestEmail(targetEmail) {
    const testRecipient = targetEmail || this.recipients[0] || "test@kihs.re.kr";
    const fromAddr = this.getFromAddress();
    const subject = `[테스트] 한국수자원조사기술원 스마트 이메일 알림 연동 테스트`;
    const html = `
      <div style="font-family:sans-serif; padding:20px; border:1px solid #e2e8f0; border-radius:8px;">
        <h3 style="color:#2563eb;">🚀 이메일 알림 연동 테스트 성공</h3>
        <p>자동유량관측시설 스마트 알림 엔진(설정 임계치: <strong>연속 ${this.thresholdCount}회</strong>)이 정상 작동 중입니다.</p>
        <p><strong>발신처:</strong> ${fromAddr}</p>
        <p><strong>수신처:</strong> ${testRecipient}</p>
        <p><strong>발송시각:</strong> ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
      </div>
    `;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: fromAddr,
          to: testRecipient,
          subject,
          html
        });
        return { success: true, message: `테스트 메일이 ${testRecipient}로 성공적으로 발송되었습니다! (REAL SMTP)` };
      } catch (e) {
        return { success: false, message: `SMTP 발송 실패: ${e.message}` };
      }
    } else {
      return { success: true, simulated: true, message: `가상 시뮬레이션 모드: 메일 발송 테스트 로그가 성공적으로 생성되었습니다.` };
    }
  }
}

const notifier = new SmartNotifierService();
module.exports = notifier;
