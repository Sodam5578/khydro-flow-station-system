const { dbService } = require("./db");
const liveMonitor = require("./monitor");

class WaterLevelCompareService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get 24-hour and 7-day water level comparison dataset for a station
   * @param {string|number} stationCodeOrId 
   * @param {string} period "24h" | "7d"
   */
  async getComparisonData(stationCodeOrId, period = "24h") {
    const stations = await dbService.getAllStations();
    const station = stations.find(s => 
      String(s.code) === String(stationCodeOrId) || 
      String(s.id) === String(stationCodeOrId) ||
      s.name === stationCodeOrId
    );

    if (!station) {
      throw new Error(`관측소 '${stationCodeOrId}'를 찾을 수 없습니다.`);
    }

    const stationId = parseInt(station.id, 10) || 1;
    const codeNum = parseInt(station.code, 10) || (stationId * 10000);

    // 1. Station deterministic seed for unique river characteristics
    const stationSeed = (codeNum * 2654435761) >>> 0;
    const pseudoRand = (stationSeed % 10000) / 10000;
    const pseudoRand2 = ((stationSeed >> 4) % 10000) / 10000;

    // 2. Realistic Base Water Level per River Basin & Station
    const basinBaseMap = {
      "한강": 2.15,
      "낙동강": 3.40,
      "금강": 2.65,
      "영산강": 1.95,
      "섬진강": 2.20
    };
    const basinBase = basinBaseMap[station.region] || 2.30;
    // Each station gets its own distinct baseline elevation/level (e.g. 1.2m ~ 5.8m)
    const baseWL = Number((basinBase + (pseudoRand * 2.80) - 0.60).toFixed(2));

    // 3. Station Hydraulic Wave Parameters
    const phaseOffset = pseudoRand * 2 * Math.PI;
    const waveAmp1 = 0.15 + (pseudoRand2 * 0.28); // 0.15m ~ 0.43m
    const waveAmp2 = 0.04 + ((stationSeed % 100) / 1200); // secondary harmonics
    const waveFrequency = 0.95 + ((stationSeed % 50) / 500); // slight speed variation

    // 4. Live Monitor Issue Check for this station
    const issues = liveMonitor ? liveMonitor.getIssuesForStation(station.code || station.name) : [];
    const hasActiveIssue = issues && issues.length > 0;
    const maxContinuous = hasActiveIssue ? Math.max(...issues.map(it => it.continuousCount || 0)) : 0;

    // Determine baseline sensor offset
    let baseSensorDiffCm = 1.2 + (pseudoRand * 3.2); // Default 1.2~4.4cm (Normal, well within 10cm)
    let isSevereDrift = false;

    if (hasActiveIssue) {
      if (maxContinuous >= 1000) {
        // High count critical issue (20cm+ error: 21cm ~ 28cm)
        baseSensorDiffCm = 21.0 + (pseudoRand * 7.0);
        isSevereDrift = true;
      } else if (maxContinuous >= 20) {
        // Moderate continuous warning (10cm ~ 17cm)
        baseSensorDiffCm = 10.5 + (pseudoRand * 6.5);
      } else {
        // Minor recent warning (6.5cm ~ 11.5cm)
        baseSensorDiffCm = 6.5 + (pseudoRand * 5.0);
      }
    } else {
      // For random 10% of normal stations without issues, add a small transient fluctuation during certain hours
      if (stationId % 9 === 0) {
        baseSensorDiffCm = 5.0 + (pseudoRand * 3.5);
      }
    }

    const pointsCount = period === "7d" ? 168 : 144; // 7d: 1hr step (168 pts), 24h: 10min step (144 pts)
    const stepMinutes = period === "7d" ? 60 : 10;
    const now = new Date();

    const timeSeries = [];
    let sumDiff = 0;
    let maxDiff = 0;

    for (let i = pointsCount - 1; i >= 0; i--) {
      const pointTime = new Date(now.getTime() - i * stepMinutes * 60 * 1000);
      const timeStr = period === "7d" 
        ? `${pointTime.getMonth() + 1}/${pointTime.getDate()} ${String(pointTime.getHours()).padStart(2, "0")}:00`
        : `${String(pointTime.getHours()).padStart(2, "0")}:${String(pointTime.getMinutes()).padStart(2, "0")}`;

      // Smooth, natural hydraulic river wave
      const phase = ((pointTime.getTime() / (1000 * 60 * 60 * 12)) * Math.PI * waveFrequency) + phaseOffset;
      const diurnalWave = Math.sin(phase) * waveAmp1 + Math.cos(phase * 0.47 + phaseOffset * 0.6) * waveAmp2;
      const refWL = Number((baseWL + diurnalWave).toFixed(3));

      // Station-specific sensor noise signature
      const noise = (Math.sin(i * 1.35 + stationSeed) * 0.75) + (Math.cos(i * 0.82 + (stationSeed >> 2)) * 0.45);
      
      // If severe drift, show progressive deviation
      let pointDiffCm = baseSensorDiffCm + noise;
      if (isSevereDrift) {
        const driftFactor = 1 + (Math.sin(i * 0.1) * 0.15);
        pointDiffCm = baseSensorDiffCm * driftFactor + noise;
      }
      pointDiffCm = Math.max(0.1, Number(pointDiffCm.toFixed(1)));

      const sign = (stationId % 2 === 0) ? 1 : -1;
      const gaugeWL = Number((refWL + (sign * (pointDiffCm / 100))).toFixed(3));
      const diffCm = Number((Math.abs(gaugeWL - refWL) * 100).toFixed(1));

      sumDiff += diffCm;
      if (diffCm > maxDiff) maxDiff = diffCm;

      let status = "NORMAL";
      if (diffCm >= 20.0) status = "CRITICAL";
      else if (diffCm >= 10.0) status = "ATTENTION";

      timeSeries.push({
        time: timeStr,
        timestamp: pointTime.toISOString(),
        refWL,
        gaugeWL,
        diffCm,
        status
      });
    }

    const currentPoint = timeSeries[timeSeries.length - 1];
    const avgDiff = Number((sumDiff / pointsCount).toFixed(1));

    let overallStatus = "NORMAL";
    let statusLabel = "정상 (설정기준 10cm 이내)";
    if (currentPoint.diffCm >= 20.0) {
      overallStatus = "CRITICAL";
      statusLabel = "경계 (경계기준 20cm 이상, 현장 점검 필요)";
    } else if (currentPoint.diffCm >= 10.0) {
      overallStatus = "ATTENTION";
      statusLabel = "관심 (관심기준 10cm 이상, 지속 모니터링)";
    }

    return {
      station: {
        id: station.id,
        name: station.name,
        code: station.code,
        region: station.region,
        river: station.river,
        gaugeType: station.gauge_type,
        waterLevelType: station.water_level_type || "레이더식 수위계",
        refWaterLevel: baseWL,
        hasIssues: hasActiveIssue,
        issueCount: issues.length
      },
      period,
      summary: {
        currentGaugeWL: currentPoint.gaugeWL,
        currentRefWL: currentPoint.refWL,
        currentDiffCm: currentPoint.diffCm,
        avgDiffCm: avgDiff,
        maxDiffCm: Number(maxDiff.toFixed(1)),
        status: overallStatus,
        statusLabel,
        cautionCm: 10.0, // 관심 기준 10.0cm (0.100m)
        warningCm: 20.0, // 경계 기준 20.0cm (0.200m)
        toleranceCm: 10.0,
        lastUpdated: currentPoint.timestamp
      },
      timeSeries
    };
  }
}

const waterLevelService = new WaterLevelCompareService();
module.exports = waterLevelService;
