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
    this.provider = process.env.EMAIL_PROVIDER || "AUTO"; // "RESEND" | "BREVO" | "SMTP" | "AUTO"
    this.apiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY || process.env.BREVO_API_KEY || "";
    this.smtpConfig = {
      host: process.env.SMTP_HOST || "smtp.naver.com",
      port: parseInt(process.env.SMTP_PORT, 10) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
      },
      from: process.env.SMTP_FROM || "자동유량관측 이상알림 <psn5578@naver.com>"
    };
    this.recipients = (process.env.ALERT_RECIPIENTS || "psn5578@naver.com, psn5578@kihs.re.kr").split(",").map(e => e.trim());
    this.enabled = process.env.ENABLE_EMAIL_ALERTS === "true" || true;
    this.transporter = null;

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
        if (saved.host) this.smtpConfig.host = saved.host;
        if (saved.port) this.smtpConfig.port = saved.port;
        if (saved.user) this.smtpConfig.auth.user = saved.user;
        if (saved.pass) this.smtpConfig.auth.pass = saved.pass;
        if (saved.from) this.smtpConfig.from = saved.from;
        if (saved.recipients && Array.isArray(saved.recipients)) this.recipients = saved.recipients;
        if (saved.enabled !== undefined) this.enabled = saved.enabled;
        console.log(`📁 [SmartNotifier] Loaded persisted config from disk (threshold: ${this.thresholdCount}회, provider: ${this.getEffectiveProvider()})`);
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
        apiKey: this.apiKey,
        host: this.smtpConfig.host,
        port: this.smtpConfig.port,
        user: this.smtpConfig.auth.user,
        pass: this.smtpConfig.auth.pass,
        from: this.smtpConfig.from,
        recipients: this.recipients,
        enabled: this.enabled,
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
      if (this.apiKey.startsWith("re_") || this.provider === "RESEND") return "RESEND";
      if (this.apiKey.startsWith("xkeysib-") || this.provider === "BREVO") return "BREVO";
      return this.provider || "RESEND";
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
    if (config.host) this.smtpConfig.host = config.host;
    if (config.port) this.smtpConfig.port = parseInt(config.port, 10);
    if (config.user !== undefined) this.smtpConfig.auth.user = config.user.trim();
    if (config.pass !== undefined) this.smtpConfig.auth.pass = config.pass.trim();
    if (config.from) this.smtpConfig.from = config.from;
    if (config.recipients) {
      if (Array.isArray(config.recipients)) {
        this.recipients = config.recipients;
      } else {
        this.recipients = config.recipients.split(",").map(e => e.trim()).filter(Boolean);
      }
    }
    if (config.enabled !== undefined) this.enabled = !!config.enabled;

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
      host: this.smtpConfig.host || "smtp.naver.com",
      port: this.smtpConfig.port || 465,
      user: this.smtpConfig.auth.user || "",
      pass: this.smtpConfig.auth.pass || "",
      from: this.smtpConfig.from,
      recipients: this.recipients.join(", "),
      enabled: this.enabled,
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
    return this.smtpConfig.from || "자동유량관측 이상알림 <psn5578@naver.com>";
  }

  /**
   * Main Check & Notify Loop - Runs automatically in background every 5 minutes
   */
  async checkAndNotify(currentIssues, targetTime) {
    if (!this.enabled) return;

    const activeKeys = new Set();
    const now = new Date();
    const timeStr = targetTime || now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // 1. Evaluate Active Issues against user-defined threshold
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

      // Determine current alert level
      let currentLevel = "NORMAL";
      if (count >= this.thresholdCount * 2) {
        currentLevel = "CRITICAL"; // 2x threshold (e.g. 6 counts / 1hr)
      } else if (count >= this.thresholdCount) {
        currentLevel = "WARNING"; // threshold counts (e.g. 3 counts / 30m)
      }

      state.level = currentLevel;

      // Check if we need to dispatch email (level transitioned or first threshold hit)
      if (currentLevel !== "NORMAL" && state.lastNotifiedLevel !== currentLevel) {
        state.lastNotifiedLevel = currentLevel;
        state.lastNotifiedTime = timeStr;
        this.alertStates.set(key, state);

        await this.sendAlertEmail(issue, currentLevel, count, timeStr);
      } else {
        this.alertStates.set(key, state);
      }
    }

    // 2. Check for Resolved Issues
    for (const [key, state] of this.alertStates.entries()) {
      if (!activeKeys.has(key)) {
        if (state.lastNotifiedLevel === "WARNING" || state.lastNotifiedLevel === "CRITICAL") {
          await this.sendResolvedEmail(state, timeStr);
        }
        this.alertStates.delete(key);
      }
    }
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

  async deliverEmail(subject, html, stationName, level, count) {
    const eff = this.getEffectiveProvider();
    const logItem = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      stationName,
      level,
      count,
      subject,
      recipients: this.recipients.join(", "),
      status: "SENT",
      mode: eff === "RESEND" ? "HTTP_API (Resend)" : (eff === "BREVO" ? "HTTP_API (Brevo)" : (eff === "SMTP" ? "REAL_SMTP" : "SIMULATED"))
    };

    if (eff === "RESEND") {
      try {
        const res = await this.sendViaResend(this.recipients, subject, html);
        if (res.success) {
          logItem.status = "SUCCESS";
          console.log(`📧 [SmartNotifier (Resend)] Sent to ${this.recipients.join(", ")} - ${subject}`);
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
        const res = await this.sendViaBrevo(this.recipients, subject, html);
        if (res.success) {
          logItem.status = "SUCCESS";
          console.log(`📧 [SmartNotifier (Brevo)] Sent to ${this.recipients.join(", ")} - ${subject}`);
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
          to: this.recipients,
          subject,
          html
        });
        logItem.status = "SUCCESS";
        console.log(`📧 [SmartNotifier (SMTP)] Sent REAL email to ${this.recipients.join(", ")} - ${subject}`);
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
        return { success: false, error: data.message || JSON.stringify(data) };
      }
      return { success: true, id: data.id };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async sendViaBrevo(recipients, subject, html) {
    if (!this.apiKey) return { success: false, error: "Brevo API Key가 설정되지 않았습니다." };

    try {
      const senderEmail = (this.smtpConfig.auth && this.smtpConfig.auth.user) ? this.smtpConfig.auth.user : "psn5578@naver.com";
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
          "accept": "application/json"
        },
        body: JSON.stringify({
          sender: { name: "자동유량관측 이상알림", email: senderEmail },
          to: recipients.map(email => ({ email })),
          subject,
          htmlContent: html
        })
      });

      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.message || JSON.stringify(data) };
      }
      return { success: true, id: data.messageId };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async sendTestEmail(targetEmail) {
    const testRecipient = targetEmail || this.recipients[0] || "test@kihs.re.kr";
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
}

const notifier = new SmartNotifierService();
module.exports = notifier;
