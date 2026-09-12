const http = require("http");
const { dbService } = require("./db");

class WaterLevelCompareService {
  constructor() {
    this.baseUrl = "http://183.96.156.168:8080";
    this.hmStations = new Map();
    this.timeSeriesCache = new Map();
    this.lastMasterSync = 0;
    this.syncInterval = 3 * 60 * 1000; // 3 minutes
  }

  fetchUrl(url) {
    return new Promise((resolve, reject) => {
      http.get(url, { timeout: 8000 }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HydroMonitor HTTP ${res.statusCode}`));
        }
        let data = "";
        res.setEncoding("utf-8");
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });
  }

  async syncMasterList() {
    try {
      const html = await this.fetchUrl(`${this.baseUrl}/water-level`);
      const rows = html.match(/<tr>([\s\S]*?)<\/tr>/gi) || [];
      const newMap = new Map();

      for (const row of rows.slice(1)) {
        const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].trim());
        if (tds.length >= 12) {
          const linkMatch = tds[3].match(/href=[\x27\x22]\/water-level\/([^\/\x27\x22]+)\/(\d+)[\x27\x22]/);
          const nameMatch = tds[3].match(/>([^<]+)<\/a>/);
          const name = nameMatch ? nameMatch[1].trim() : tds[3].replace(/<[^>]+>/g, "").trim();
          const code = linkMatch ? linkMatch[2] : "";
          const method = linkMatch ? linkMatch[1] : tds[1];

          const item = {
            code,
            name,
            method,
            statusRaw: tds[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
            refSt: tds[4].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
            targetTime: tds[5].trim(),
            autoWl: tds[6].trim(),
            refWl: tds[7].trim(),
            diffM: tds[8].trim(),
            maeM: tds[9].trim(),
            maxDiffM: tds[10].trim(),
            rate: tds[11].trim(),
            reason: tds[12] ? tds[12].trim() : ""
          };

          if (code) newMap.set(code, item);
          if (name) newMap.set(name, item);
          newMap.set(name.replace(/[\(\)\s]/g, ""), item);
        }
      }

      this.hmStations = newMap;
      this.lastMasterSync = Date.now();
      console.log(`✓ [WaterLevelService] Synced master list from HydroMonitor (${newMap.size / 3 | 0} stations)`);
    } catch (e) {
      console.warn("⚠️ [WaterLevelService] Failed to sync master list from HydroMonitor:", e.message);
    }
  }

  formatTime(rawTimeStr, period) {
    // rawTimeStr format: YYYYMMDDHHmm e.g. 202609122250
    if (!rawTimeStr || rawTimeStr.length < 12) return rawTimeStr;
    const year = rawTimeStr.substring(0, 4);
    const month = rawTimeStr.substring(4, 6);
    const day = rawTimeStr.substring(6, 8);
    const hour = rawTimeStr.substring(8, 10);
    const min = rawTimeStr.substring(10, 12);

    const isoStr = `${year}-${month}-${day}T${hour}:${min}:00+09:00`;
    const labelStr = period === "7d"
      ? `${month}/${day} ${hour}:${min}`
      : `${hour}:${min}`;

    return { time: labelStr, timestamp: isoStr };
  }

  async getComparisonData(stationCodeOrId, period = "24h") {
    // 1. Ensure master list is synced
    if (!this.lastMasterSync || (Date.now() - this.lastMasterSync > this.syncInterval)) {
      await this.syncMasterList();
    }

    // 2. Fetch station from database
    const stations = await dbService.getAllStations();
    const station = stations.find(s => 
      String(s.code) === String(stationCodeOrId) || 
      String(s.id) === String(stationCodeOrId) ||
      s.name === stationCodeOrId ||
      s.name.replace(/[\(\)\s]/g, "") === String(stationCodeOrId).replace(/[\(\)\s]/g, "")
    );

    if (!station) {
      throw new Error(`관측소 '${stationCodeOrId}'를 찾을 수 없습니다.`);
    }

    // 3. Match against HydroMonitor stations
    const stCode = String(station.code || "").trim();
    const stName = String(station.name || "").trim();
    const stCleanName = stName.replace(/[\(\)\s]/g, "");

    const hmInfo = this.hmStations.get(stCode) || 
                   this.hmStations.get(stName) || 
                   this.hmStations.get(stCleanName);

    // 4. If station is NOT in HydroMonitor (e.g. 자료 취득 전, 수위 비교 미제공)
    if (!hmInfo) {
      return {
        hasData: false,
        station: {
          id: station.id,
          name: station.name,
          code: station.code,
          region: station.region,
          river: station.river,
          gaugeType: station.gauge_type,
          waterLevelType: station.water_level_type || "레이더식 수위계",
          refWaterLevel: station.ref_water_level || "-"
        },
        message: "본 관측소는 아직 HydroMonitor 실시간 수위 비교 자료 취득 전(미연계) 상태입니다."
      };
    }

    // 5. Check cache for time-series
    const cacheKey = `${hmInfo.method}_${hmInfo.code}_${period}`;
    const cached = this.timeSeriesCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt < 2 * 60 * 1000)) {
      return cached.data;
    }

    // 6. Fetch real CSV time-series from HydroMonitor
    const days = period === "7d" ? 7 : 1;
    const csvUrl = `${this.baseUrl}/water-level/${hmInfo.method}/${hmInfo.code}/export.csv?days=${days}`;
    
    let csvData = "";
    try {
      csvData = await this.fetchUrl(csvUrl);
    } catch (e) {
      console.warn(`⚠️ [WaterLevelService] Failed to fetch CSV for ${hmInfo.name} (${hmInfo.code}):`, e.message);
      throw new Error(`HydroMonitor 실시간 수위 데이터를 조회할 수 없습니다: ${e.message}`);
    }

    // 7. Parse CSV
    // target_time,auto_water_level_m,reference_water_level_m,adjusted_reference_water_level_m,difference_m,paired_rate_7d,status,transition,reason
    const lines = csvData.split(/\r?\n/).filter(l => l.trim().length > 0);
    const timeSeries = [];
    let maxDiffCm = 0;
    let sumDiffCm = 0;
    let validDiffCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length < 5) continue;

      const rawTime = parts[0].trim();
      const autoStr = parts[1].trim();
      const refStr = parts[2].trim() || parts[3].trim();
      const diffStr = parts[4].trim();
      const statusStr = parts[6] ? parts[6].trim() : "NORMAL";
      const reasonStr = parts[8] ? parts[8].trim() : "";

      const gaugeWL = autoStr !== "" ? parseFloat(autoStr) : null;
      const refWL = refStr !== "" ? parseFloat(refStr) : null;
      let diffCm = null;

      if (diffStr !== "") {
        const diffVal = parseFloat(diffStr);
        diffCm = parseFloat((Math.abs(diffVal) * 100).toFixed(1));
        sumDiffCm += diffCm;
        validDiffCount++;
        if (diffCm > maxDiffCm) maxDiffCm = diffCm;
      }

      const { time, timestamp } = this.formatTime(rawTime, period);

      let itemStatus = "NORMAL";
      if (statusStr.includes("MISSING") || gaugeWL === null || refWL === null) {
        itemStatus = "MISSING";
      } else if (diffCm !== null && diffCm >= 20.0) {
        itemStatus = "CRITICAL";
      } else if (diffCm !== null && diffCm >= 10.0) {
        itemStatus = "ATTENTION";
      }

      timeSeries.push({
        time,
        timestamp,
        rawTime,
        gaugeWL,
        refWL,
        diffCm,
        status: itemStatus,
        reason: reasonStr
      });
    }

    // 8. Calculate KPI metrics
    const lastPoint = timeSeries.length > 0 ? timeSeries[timeSeries.length - 1] : null;
    const currentGaugeWL = lastPoint && lastPoint.gaugeWL !== null ? lastPoint.gaugeWL : (hmInfo.autoWl ? parseFloat(hmInfo.autoWl) : null);
    const currentRefWL = lastPoint && lastPoint.refWL !== null ? lastPoint.refWL : (hmInfo.refWl ? parseFloat(hmInfo.refWl) : null);
    const currentDiffCm = lastPoint && lastPoint.diffCm !== null ? lastPoint.diffCm : (hmInfo.diffM ? parseFloat((Math.abs(parseFloat(hmInfo.diffM)) * 100).toFixed(1)) : null);

    const avgDiffCm = hmInfo.maeM ? parseFloat((parseFloat(hmInfo.maeM) * 100).toFixed(1)) : (validDiffCount > 0 ? parseFloat((sumDiffCm / validDiffCount).toFixed(1)) : 0);
    const finalMaxDiffCm = hmInfo.maxDiffM ? parseFloat((parseFloat(hmInfo.maxDiffM) * 100).toFixed(1)) : maxDiffCm;

    let overallStatus = "NORMAL";
    let statusLabel = "정상 (설정기준 10cm 이내)";
    if (hmInfo.statusRaw.includes("경계") || (currentDiffCm !== null && currentDiffCm >= 20.0)) {
      overallStatus = "CRITICAL";
      statusLabel = "경계 (경계기준 20cm 이상, 현장 점검 필요)";
    } else if (hmInfo.statusRaw.includes("관심") || (currentDiffCm !== null && currentDiffCm >= 10.0)) {
      overallStatus = "ATTENTION";
      statusLabel = "관심 (관심기준 10cm 이상, 지속 모니터링)";
    } else if (hmInfo.statusRaw.includes("결측") || currentGaugeWL === null || currentRefWL === null) {
      overallStatus = "MISSING";
      statusLabel = hmInfo.statusRaw || "수위 자료 결측";
    }

    const result = {
      hasData: true,
      station: {
        id: station.id,
        name: station.name,
        code: station.code,
        region: station.region,
        river: station.river,
        gaugeType: station.gauge_type,
        waterLevelType: station.water_level_type || "레이더식 수위계",
        refWaterLevel: currentRefWL || station.ref_water_level || "-",
        refStation: hmInfo.refSt
      },
      period,
      summary: {
        currentGaugeWL,
        currentRefWL,
        currentDiffCm,
        avgDiffCm,
        maxDiffCm: finalMaxDiffCm,
        rate: hmInfo.rate,
        status: overallStatus,
        statusLabel,
        reason: hmInfo.reason,
        cautionCm: 10.0,
        warningCm: 20.0,
        lastUpdated: hmInfo.targetTime || (lastPoint ? lastPoint.timestamp : "")
      },
      timeSeries
    };

    // Cache the result
    this.timeSeriesCache.set(cacheKey, { data: result, cachedAt: Date.now() });

    return result;
  }
}

const waterLevelService = new WaterLevelCompareService();
module.exports = waterLevelService;
