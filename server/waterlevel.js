const { dbService } = require("./db");

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

    // Base water level anchor based on station ref_water_level or realistic baseline
    let baseWL = parseFloat(station.ref_water_level) || 1.85;
    if (isNaN(baseWL) || baseWL <= 0) baseWL = 2.10;

    const pointsCount = period === "7d" ? 168 : 144; // 7d: 1hr step (168 pts), 24h: 10min step (144 pts)
    const stepMinutes = period === "7d" ? 60 : 10;
    const now = new Date();

    const timeSeries = [];
    let sumDiff = 0;
    let maxDiff = 0;

    // Generate natural water level curve with small sensor deviations
    for (let i = pointsCount - 1; i >= 0; i--) {
      const pointTime = new Date(now.getTime() - i * stepMinutes * 60 * 1000);
      const timeStr = period === "7d" 
        ? `${pointTime.getMonth() + 1}/${pointTime.getDate()} ${String(pointTime.getHours()).padStart(2, "0")}:00`
        : `${String(pointTime.getHours()).padStart(2, "0")}:${String(pointTime.getMinutes()).padStart(2, "0")}`;

      // Smooth hydraulic wave
      const phase = (pointTime.getTime() / (1000 * 60 * 60 * 12)) * Math.PI;
      const tidalVariation = Math.sin(phase) * 0.35 + Math.cos(phase * 0.5) * 0.15;
      const refWL = Number((baseWL + tidalVariation).toFixed(3));

      // Sensor difference (natural jitter ±1.5cm, occasional drift +3~6cm)
      const isDivergent = (i >= 20 && i <= 35) && (station.id % 3 === 0);
      const jitterCm = isDivergent 
        ? 6.5 + Math.sin(i) * 1.8 
        : (Math.sin(i * 1.2) * 1.2 + (Math.cos(i * 0.7) * 0.8));
      
      const gaugeWL = Number((refWL + (jitterCm / 100)).toFixed(3));
      const diffCm = Number((Math.abs(gaugeWL - refWL) * 100).toFixed(1));

      sumDiff += diffCm;
      if (diffCm > maxDiff) maxDiff = diffCm;

      let status = "NORMAL";
      if (diffCm > 10.0) status = "CRITICAL";
      else if (diffCm > 5.0) status = "ATTENTION";

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
    let statusLabel = "정상 (허용 오차 이내)";
    if (currentPoint.diffCm > 10.0) {
      overallStatus = "CRITICAL";
      statusLabel = "경보 (수위차 10cm 초과, 센서 교정 필요)";
    } else if (currentPoint.diffCm > 5.0) {
      overallStatus = "ATTENTION";
      statusLabel = "주의 (수위차 5cm 초과, 모니터링 필요)";
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
        refWaterLevel: baseWL
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
        toleranceCm: 5.0, // 허용 기준 5.0cm
        lastUpdated: currentPoint.timestamp
      },
      timeSeries
    };
  }
}

const waterLevelService = new WaterLevelCompareService();
module.exports = waterLevelService;
