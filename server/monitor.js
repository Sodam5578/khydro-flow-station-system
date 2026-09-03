const http = require("http");

class LiveMonitorService {
  constructor() {
    this.targetUrl = "http://183.96.156.168:8080/";
    this.cache = {
      targetTime: "",
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
      lastSyncTime: null
    };
    this.syncInterval = 5 * 60 * 1000; // 5 minutes
    this.timer = null;
  }

  init() {
    this.sync();
    this.timer = setInterval(() => this.sync(), this.syncInterval);
    console.log("🛰️ LiveMonitorService initialized with 5m sync interval.");
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

  async sync() {
    try {
      const html = await this.fetchHtml();
      this.parseAndCache(html);
      this.cache.lastSyncTime = new Date().toISOString();
      console.log(`✓ [LiveMonitor] Synced successfully at ${this.cache.lastSyncTime} (${this.cache.issues.length} issues, ${this.cache.summary.actionRequiredStations} unique stations)`);
      return { success: true, count: this.cache.issues.length };
    } catch (e) {
      console.warn("⚠️ [LiveMonitor] Failed to sync from live server:", e.message);
      return { success: false, error: e.message };
    }
  }

  parseAndCache(html) {
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

    // 3. Bulletproof Table Parsing via Row Split
    const issues = [];
    const stationIssuesMap = {};

    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (tableMatch) {
      const rows = tableMatch[1].split(/<\/tr>/i);
      rows.forEach(row => {
        const tdMatches = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].trim());
        if (tdMatches.length < 9) return;

        // TD[0]: <span class='tag ongoing'>지속</span>
        const tagMatch = tdMatches[0].match(/class='tag\s*([^']*)'>([^<]*)</i);
        const statusType = tagMatch ? tagMatch[1].trim() : "ongoing";
        const statusLabel = tagMatch ? tagMatch[2].trim() : "지속";

        // TD[1]: method (EWSV / ADVM)
        const method = tdMatches[1];

        // TD[2]: basin (한강 / 낙동강 / 금강 / 영산강)
        const basin = tdMatches[2];

        // TD[3]: 평창군(사초교)<br><small>1002535</small>
        let stationName = tdMatches[3];
        let stCode = "";
        const codeMatch = tdMatches[3].match(/^(.*?)<br><small>(.*?)<\/small>/i);
        if (codeMatch) {
          stationName = codeMatch[1].trim();
          stCode = codeMatch[2].trim();
        } else {
          stationName = stationName.replace(/<[^>]+>/g, "").trim();
        }

        // TD[4]: sensorNo
        const sensorNo = tdMatches[4];

        // TD[5]: ruleId (e.g. EWSV-R04)
        const ruleId = tdMatches[5];

        // TD[6]: problem
        const problem = tdMatches[6];

        // TD[7]: detail
        const detail = tdMatches[7];

        // TD[8]: continuousCount
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

        // Register into lookup map with multiple keys
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

    // Calculate unique abnormal station count
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
