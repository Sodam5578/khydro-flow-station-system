const http = require("http");
const notifier = require("./notifier");
const sftpCollector = require("./sftpCollector");
const ruleEngine = require("./ruleEngine");

class LiveMonitorService {
  constructor() {
    this.targetUrl = "http://183.96.156.168:8080/";
    this.issueStateMap = {}; // issueKey -> { continuousCount, lastSeenTargetDT }
    this.cache = {
      targetTime: "",
      source: "INITIALIZING",
      summary: {
        totalTarget: 187,
        received: 186,
        newCount: 0,
        ongoingCount: 50,
        reopenedCount: 0,
        resolvedCount: 0,
        actionRequired: 40,
        actionRequiredStations: 40,
        totalIssuesCount: 52,
        normalStations: 147,
        rxRate: 99.5
      },
      issues: [],
      stationIssuesMap: {},
      latestMetricsMap: {},
      lastSyncTime: null
    };
    this.syncInterval = 5 * 60 * 1000; // 5 minutes
    this.timer = null;
  }

  init() {
    this.sync();
    this.timer = setInterval(() => this.sync(), this.syncInterval);
    console.log("🛰️ LiveMonitorService initialized (Primary: SFTP Native, Secondary: HTTP Fallback).");
  }

  fetchHtml() {
    return new Promise((resolve, reject) => {
      http.get(this.targetUrl, { timeout: 8000 }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP Status ${res.statusCode}`));
        }
        let data = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve(data));
      }).on("error", (err) => reject(err));
    });
  }

  fetchJson(path) {
    return new Promise((resolve, reject) => {
      const url = this.targetUrl.replace(/\/$/, "") + path;
      http.get(url, { timeout: 8000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP Status ${res.statusCode} for ${path}`));
        }
        let data = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON from ${path}: ${e.message}`));
          }
        });
      }).on("error", (err) => reject(err));
    });
  }

  /**
   * Main Sync Dispatcher with Automatic Multi-Source Failover.
   * 1. Tries Native SFTP Collector & Rule Engine
   * 2. Falls back to HydroMonitor JSON API (/api/runs + /api/issues) or HTML Scraper
   * 3. Retains last known state if all fail
   */
  async sync() {
    const targetDT = sftpCollector.getLatestTargetDT();
    
    // -------------------------------------------------------------
    // 1. Primary Source: SFTP Direct Collection & Native Rule Engine
    // -------------------------------------------------------------
    try {
      const sftpResult = await sftpCollector.fetchFiles(targetDT);
      if (sftpResult.success && (Object.keys(sftpResult.advmFiles).length > 0 || Object.keys(sftpResult.ewsvFiles).length > 0)) {
        const evalResult = ruleEngine.evaluateAll(
          targetDT,
          sftpResult.advmFiles,
          sftpResult.ewsvFiles,
          this.issueStateMap
        );

        // Update state map
        this.issueStateMap = evalResult.nextIssueStateMap;

        // Build stationIssuesMap with aliases (code & station names)
        const stationIssuesMap = {};
        evalResult.issues.forEach(iss => {
          const addMap = (k) => {
            if (!k) return;
            const keyStr = String(k).trim();
            if (!stationIssuesMap[keyStr]) stationIssuesMap[keyStr] = [];
            stationIssuesMap[keyStr].push(iss);
          };
          addMap(iss.stCode);
          addMap(iss.stationName);
          addMap(iss.stationName.replace(/[\(\)\s]/g, ""));
        });

        this.cache = {
          targetTime: `${targetDT.slice(0, 4)}-${targetDT.slice(4, 6)}-${targetDT.slice(6, 8)} ${targetDT.slice(8, 10)}:${targetDT.slice(10, 12)}`,
          targetDT,
          source: "SFTP_NATIVE",
          summary: evalResult.summary,
          issues: evalResult.issues,
          stationIssuesMap,
          latestMetricsMap: evalResult.latestMetricsMap,
          lastSyncTime: new Date().toISOString()
        };

        // Trigger Smart Email Notifier
        notifier.checkAndNotify(this.cache.issues, this.cache.targetTime).catch(err => {
          console.warn("⚠️ [LiveMonitor] Notifier error:", err.message);
        });

        console.log(`✓ [LiveMonitor] SFTP Native Sync success at ${this.cache.lastSyncTime} (${evalResult.issues.length} issues, ${evalResult.summary.actionRequiredStations} stations, source: SFTP_NATIVE)`);
        return { success: true, source: "SFTP_NATIVE", count: this.cache.issues.length };
      }
    } catch (sftpErr) {
      console.warn("⚠️ [LiveMonitor] Primary SFTP fetch skipped/failed:", sftpErr.message);
    }

    // -------------------------------------------------------------
    // 2. Secondary Source: HydroMonitor JSON API + HTML Fallback
    // -------------------------------------------------------------
    try {
      console.log("🔄 [LiveMonitor] Switching to Secondary HydroMonitor API / Fallback...");
      let parsedFromApi = false;
      try {
        const [runs, rawIssues] = await Promise.all([
          this.fetchJson("/api/runs?limit=5"),
          this.fetchJson("/api/issues")
        ]);
        const latestSuccessRun = Array.isArray(runs)
          ? (runs.find(r => r.status === "SUCCESS" && r.completed_at) || runs[0])
          : null;
        if (latestSuccessRun && Array.isArray(rawIssues) && rawIssues.length > 0) {
          this.parseAndCacheApi(latestSuccessRun, rawIssues);
          parsedFromApi = true;
        }
      } catch (apiErr) {
        console.warn("⚠️ [LiveMonitor] JSON API fallback warning, trying HTML:", apiErr.message);
      }

      if (!parsedFromApi) {
        const html = await this.fetchHtml();
        this.parseAndCacheHttp(html);
      }

      this.cache.source = "HTTP_FALLBACK";
      this.cache.lastSyncTime = new Date().toISOString();

      // Trigger Smart Email Notifier only when valid issues list is present
      if (this.cache.issues && this.cache.issues.length > 0) {
        notifier.checkAndNotify(this.cache.issues, this.cache.targetTime).catch(err => {
          console.warn("⚠️ [LiveMonitor] Notifier error:", err.message);
        });
      }

      console.log(`✓ [LiveMonitor] HTTP Fallback Sync success at ${this.cache.lastSyncTime} (${this.cache.issues.length} issues, source: HTTP_FALLBACK)`);
      return { success: true, source: "HTTP_FALLBACK", count: this.cache.issues.length };
    } catch (httpErr) {
      console.warn("⚠️ [LiveMonitor] Secondary HTTP Fallback failed:", httpErr.message);
      if (this.cache.lastSyncTime) {
        this.cache.source = "CACHED_OFFLINE";
      }
      return { success: false, error: httpErr.message, source: this.cache.source };
    }
  }

  /**
   * Parses structured JSON from /api/runs and /api/issues on HydroMonitor (immune to mid-run HTML empty states).
   */
  parseAndCacheApi(run, rawIssues) {
    const dt = String(run.target_dt || "");
    const targetTime = dt.length === 12
      ? `${dt.slice(0, 4)}년 ${Number(dt.slice(4, 6))}월 ${Number(dt.slice(6, 8))}일 ${dt.slice(8, 10)}시 ${dt.slice(10, 12)}분`
      : (this.cache.targetTime || "");

    const totalTarget = run.total_target || 187;
    const received = run.received || 183;
    const newCount = run.new_count || 0;
    const ongoingCount = run.ongoing_count || 0;
    const reopenedCount = run.reopened_count || 0;
    const resolvedCount = run.resolved_count || 0;
    const rxRate = totalTarget > 0 ? Number(((received / totalTarget) * 100).toFixed(1)) : 0;

    const issues = [];
    const stationIssuesMap = {};

    rawIssues.forEach(raw => {
      if (raw.state && raw.state !== "OPEN") return;
      let statusType = "ongoing";
      let statusLabel = "지속";
      if (raw.first_seen_run_id === run.id) {
        statusType = "new";
        statusLabel = "신규";
      } else if (raw.consecutive_count === 1 && raw.occurrence_count > 1) {
        statusType = "reopened";
        statusLabel = "재발";
      }

      const issueItem = {
        statusType,
        statusLabel,
        method: raw.method || "",
        basin: raw.basin || "",
        stationName: raw.station_name || "",
        stCode: String(raw.station_code || "").trim(),
        sensorNo: raw.sensor_id ? String(raw.sensor_id).trim() : "",
        ruleId: raw.rule_id || "",
        problem: raw.title || "",
        detail: raw.last_detail || "",
        continuousCount: Number(raw.consecutive_count || 0)
      };

      issues.push(issueItem);

      const addMap = (k) => {
        if (!k) return;
        const keyStr = String(k).trim();
        if (!stationIssuesMap[keyStr]) stationIssuesMap[keyStr] = [];
        stationIssuesMap[keyStr].push(issueItem);
      };

      addMap(issueItem.stCode);
      addMap(issueItem.stationName);
      addMap(issueItem.stationName.replace(/[\(\)\s]/g, ""));
    });

    const uniqueCodes = new Set();
    issues.forEach(i => {
      if (i.stCode) uniqueCodes.add(i.stCode);
      else if (i.stationName) uniqueCodes.add(i.stationName);
    });
    const actionRequiredStations = uniqueCodes.size;
    const totalIssuesCount = issues.length;
    const normalStations = Math.max(0, totalTarget - actionRequiredStations);

    this.cache = {
      targetTime,
      targetDT: dt,
      source: "HTTP_FALLBACK",
      summary: {
        totalTarget,
        received,
        newCount,
        ongoingCount,
        reopenedCount,
        resolvedCount,
        actionRequired: actionRequiredStations,
        actionRequiredStations,
        totalIssuesCount,
        normalStations,
        rxRate
      },
      issues,
      stationIssuesMap,
      latestMetricsMap: this.cache.latestMetricsMap || {},
      lastSyncTime: new Date().toISOString()
    };
  }

  /**
   * Scrapes HTML from secondary server when SFTP is unreachable.
   */
  parseAndCacheHttp(html) {
    if (!html) return;

    // 1. Target Time
    const timeMatch = html.match(/최신 대상시각:\s*<strong>(.*?)<\/strong>/i);
    const targetTime = timeMatch ? timeMatch[1].trim() : "";

    // 2. Summary Cards
    const cardMatches = [...html.matchAll(/<div class='card'><div>(.*?)<\/div><div class='num'>(\d+)<\/div><\/div>/gi)];
    const cards = {};
    cardMatches.forEach(m => {
      cards[m[1].trim()] = parseInt(m[2], 10);
    });

    const totalTarget = cards["대상"] || 187;
    const received = cards["수신"] || 186;
    const newCount = cards["신규"] || 0;
    const ongoingCount = cards["지속"] || 50;
    const reopenedCount = cards["재발"] || 0;
    const resolvedCount = cards["해소"] || 0;
    const rxRate = totalTarget > 0 ? Number(((received / totalTarget) * 100).toFixed(1)) : 0;

    // 3. Table Parsing
    const issues = [];
    const stationIssuesMap = {};

    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      const rows = tableMatch[1].split(/<\/tr>/i);
      rows.forEach(row => {
        const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].trim());
        if (tdMatches.length < 9) return;

        const tagMatch = tdMatches[0].match(/class='tag\s*([^']*)'>([^<]*)</i);
        const statusType = tagMatch ? tagMatch[1].trim() : "ongoing";
        const statusLabel = tagMatch ? tagMatch[2].trim() : "지속";

        const method = tdMatches[1];
        const basin = tdMatches[2];

        let stationName = tdMatches[3];
        let stCode = "";
        const codeMatch = tdMatches[3].match(/^(.*?)<br><small>(.*?)<\/small>/i);
        if (codeMatch) {
          stationName = codeMatch[1].trim();
          stCode = codeMatch[2].trim();
        } else {
          stationName = stationName.replace(/<[^>]+>/g, "").trim();
        }

        const sensorNo = tdMatches[4];
        const ruleId = tdMatches[5];
        const problem = tdMatches[6];
        const detail = tdMatches[7];
        const continuousCount = parseInt(tdMatches[8], 10) || 0;

        const issueItem = {
          statusType,
          statusLabel,
          method,
          basin,
          stationName,
          stCode,
          sensorNo,
          ruleId,
          problem,
          detail,
          continuousCount
        };

        issues.push(issueItem);

        const addMap = (k) => {
          if (!k) return;
          const keyStr = String(k).trim();
          if (!stationIssuesMap[keyStr]) stationIssuesMap[keyStr] = [];
          stationIssuesMap[keyStr].push(issueItem);
        };

        addMap(stCode);
        addMap(stationName);
        addMap(stationName.replace(/[\(\)\s]/g, ""));
      });
    }

    const uniqueCodes = new Set();
    issues.forEach(i => {
      if (i.stCode) uniqueCodes.add(i.stCode);
      else if (i.stationName) uniqueCodes.add(i.stationName);
    });
    const actionRequiredStations = uniqueCodes.size;
    const totalIssuesCount = issues.length;
    const normalStations = Math.max(0, totalTarget - actionRequiredStations);

    this.cache = {
      targetTime,
      source: "HTTP_FALLBACK",
      summary: {
        totalTarget,
        received,
        newCount,
        ongoingCount,
        reopenedCount,
        resolvedCount,
        actionRequired: actionRequiredStations,
        actionRequiredStations,
        totalIssuesCount,
        normalStations,
        rxRate
      },
      issues,
      stationIssuesMap,
      latestMetricsMap: {},
      lastSyncTime: new Date().toISOString()
    };
  }

  getData() {
    return this.cache;
  }

  getIssuesForStation(stCodeOrName) {
    if (!stCodeOrName) return [];
    const k = String(stCodeOrName).trim();
    return this.cache.stationIssuesMap[k] || this.cache.stationIssuesMap[k.replace(/[\(\)\s]/g, "")] || [];
  }
}

module.exports = new LiveMonitorService();
