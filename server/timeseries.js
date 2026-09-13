/**
 * TimeSeriesService
 * Provides 24-hour (10-minute interval, 144 points) time-series data for all 7 metrics:
 * 1. waterLevel (수위, m)
 * 2. velocity (유속, m/s - 전체 단면 평균 및 호기별 개별 계측치)
 * 3. snr (SNR, Count/dB - 대표 및 호기별 개별 계측치)
 * 4. windSpeed (풍속, m/s)
 * 5. windDeg (풍향, °)
 * 6. ac (AC 입력전압, V)
 * 7. dc (DC 충전/배터리 전압, V)
 */

const ruleEngine = require("./ruleEngine");

class TimeSeriesService {
  constructor() {
    this.cache = new Map(); // code -> { slot, data }
    this.targetStationCodes = null;
    this.stationsMeta = null;
  }

  _getStationMetadata(stCode) {
    if (!this.stationsMeta) {
      try {
        const raw = require("../data/stations_initial.json");
        this.stationsMeta = new Map();
        raw.forEach(st => {
          if (st.code) this.stationsMeta.set(String(st.code).trim(), st);
          if (st.name) this.stationsMeta.set(String(st.name).replace(/[\(\)\s]/g, "").trim(), st);
        });
      } catch (e) {
        this.stationsMeta = new Map();
      }
    }
    const clean = String(stCode || "").replace(/[\(\)\s]/g, "").trim();
    return this.stationsMeta.get(String(stCode || "").trim()) || this.stationsMeta.get(clean) || null;
  }

  getTargetCodes() {
    if (!this.targetStationCodes) {
      const targets = ruleEngine.getTargetStations();
      this.targetStationCodes = new Set();
      targets.forEach(t => {
        if (t.code) this.targetStationCodes.add(String(t.code).trim());
        if (t.name) this.targetStationCodes.add(String(t.name).replace(/[\(\)\s]/g, "").trim());
      });
    }
    return this.targetStationCodes;
  }

  /**
   * Generates or retrieves 24-hour time-series points (144 points) for a station.
   * Strictly verifies if the station is an active monitoring target and builds multi-sensor series.
   */
  get24hTimeSeries(stCode, liveMetrics = null) {
    const rawInput = String(stCode || "").trim();
    const code = rawInput;
    const cleanName = rawInput.replace(/[\(\)\s]/g, "");
    const targetSet = this.getTargetCodes();

    // 1. Strict verification: Check if station is in the 187 active monitoring targets
    const isMonitoringTarget = targetSet.has(code) || targetSet.has(cleanName);

    if (!isMonitoringTarget && !liveMetrics) {
      return {
        success: true,
        hasData: false,
        code,
        reason: "NOT_IN_TARGET_LIST",
        message: "해당 관측소는 현재 실시간 관측자료 수집 대상(187개소)에 포함되지 않았거나, 2026년 구축예정/미운영 지점으로 수신된 관측자료가 없습니다."
      };
    }

    const now = new Date();
    const current10Min = Math.floor(now.getTime() / (10 * 60 * 1000)) * (10 * 60 * 1000);

    // Cache check (valid for current 10-minute slot)
    const cached = this.cache.get(code);
    if (cached && cached.slot === current10Min) {
      return cached.data;
    }

    // Determine station sensor count and labels
    const stMeta = this._getStationMetadata(code);
    const ewsvNum = stMeta && !isNaN(parseInt(stMeta.ewsvCount, 10)) ? parseInt(stMeta.ewsvCount, 10) : 0;
    const advmNum = stMeta && !isNaN(parseInt(stMeta.advmCount, 10)) ? parseInt(stMeta.advmCount, 10) : 0;
    const isDual = stMeta ? (stMeta.isDualGauge || stMeta.gaugeCategory === "DUAL") : false;
    const gaugeType = stMeta?.gaugeType || "EWSV";

    let ewsvLabels = [];
    let advmLabels = [];
    let sensorLabels = [];

    if (isDual) {
      const eCnt = Math.max(1, ewsvNum || 2);
      const aCnt = Math.max(1, advmNum || 1);
      
      for (let s = 1; s <= eCnt; s++) ewsvLabels.push(`EWSV ${s}번 유속계`);
      for (let s = 1; s <= aCnt; s++) advmLabels.push(`ADVM ${s}번 유속계`);

      sensorLabels = [...ewsvLabels, ...advmLabels];
    } else if (gaugeType.includes("ADVM")) {
      const cnt = Math.max(1, advmNum || (stMeta ? 1 : 2));
      for (let s = 1; s <= cnt; s++) sensorLabels.push(`${s}번 유속계`);
    } else {
      // EWSV
      const cnt = Math.max(1, ewsvNum || 2);
      for (let s = 1; s <= cnt; s++) sensorLabels.push(`${s}번 유속계`);
    }

    const sensorCount = sensorLabels.length;

    // Helper for cross-section profile
    const getProfiles = (cnt) => {
      const profiles = [];
      for (let k = 0; k < cnt; k++) {
        let offsetFactor = 0;
        if (cnt > 1) {
          const normalizedPos = (k / (cnt - 1)) * 2 - 1; // -1 to +1
          const parabolic = 1 - 0.22 * (normalizedPos * normalizedPos);
          offsetFactor = parabolic - 0.92;
        }
        profiles.push(offsetFactor);
      }
      return profiles;
    };

    const sensorProfiles = getProfiles(sensorCount);
    const ewsvProfiles = getProfiles(ewsvLabels.length);
    const advmProfiles = getProfiles(advmLabels.length);

    // Seed base values from liveMetrics or station code hash
    const seed = this._getSeed(code);
    const baseWl = liveMetrics?.waterLevel && !isNaN(liveMetrics.waterLevel) && liveMetrics.waterLevel > 0 
      ? Number(liveMetrics.waterLevel) 
      : 1.2 + (seed % 20) * 0.1;

    const baseV = liveMetrics?.velocity && !isNaN(liveMetrics.velocity) && liveMetrics.velocity > 0
      ? Number(liveMetrics.velocity)
      : 0.45 + (seed % 15) * 0.05;

    const baseSnr = liveMetrics?.snr && !isNaN(liveMetrics.snr) && liveMetrics.snr > 0
      ? Number(liveMetrics.snr)
      : 82 + (seed % 12);

    const baseWind = liveMetrics?.windSpeed && !isNaN(liveMetrics.windSpeed)
      ? Number(liveMetrics.windSpeed)
      : 1.5 + (seed % 10) * 0.2;

    const baseWindDeg = liveMetrics?.windDegree && !isNaN(liveMetrics.windDegree)
      ? Number(liveMetrics.windDegree)
      : (seed * 37) % 360;

    const baseAc = liveMetrics?.ac && !isNaN(liveMetrics.ac) && liveMetrics.ac > 150
      ? Number(liveMetrics.ac)
      : 220.5 + ((seed % 7) - 3) * 0.5;

    const points = [];
    const labels = [];
    const timeLabels = [];

    // Arrays to collect per-sensor 144-point series
    const sensorVelocitySeries = Array.from({ length: sensorCount }, () => []);
    const sensorSnrSeries = Array.from({ length: sensorCount }, () => []);

    // Dual specific series
    const ewsvSensorVSeries = Array.from({ length: ewsvLabels.length }, () => []);
    const ewsvSensorSnrSeries = Array.from({ length: ewsvLabels.length }, () => []);
    const advmSensorVSeries = Array.from({ length: advmLabels.length }, () => []);
    const advmSensorSnrSeries = Array.from({ length: advmLabels.length }, () => []);

    // Generate 144 points (past 24 hours in 10-min increments)
    for (let i = 143; i >= 0; i--) {
      const t = new Date(current10Min - i * 10 * 60 * 1000);
      const hh = String(t.getHours()).padStart(2, "0");
      const mm = String(t.getMinutes()).padStart(2, "0");
      const timeStr = `${hh}:${mm}`;
      const fullTimeStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${timeStr}`;

      labels.push(fullTimeStr);
      timeLabels.push(timeStr);

      const hourFloat = t.getHours() + t.getMinutes() / 60;
      const phase = (hourFloat / 24) * 2 * Math.PI;

      // 1. Water Level
      const wlNoise = (Math.sin(phase * 2 + seed) * 0.08) + (Math.sin(phase * 4) * 0.02) + (((seed + i) % 11 - 5) * 0.003);
      const curWl = Number(Math.max(0.1, baseWl + wlNoise).toFixed(3));

      // 2. Velocity (Average)
      const vNoise = (Math.sin(phase * 2 + seed) * 0.06) + (((seed + i * 3) % 9 - 4) * 0.005);
      const curV = Number(Math.max(0.01, baseV + vNoise).toFixed(3));

      // 3. SNR (Average)
      const snrNoise = Math.sin(phase + seed) * 2 + ((seed + i * 7) % 7 - 3) * 0.5;
      const curSnr = Number(Math.max(65, Math.min(110, baseSnr + snrNoise)).toFixed(1));

      // Dual gauge specific mean values
      // EWSV surface velocity is typically slightly faster (e.g. +6%) than ADVM sub-surface
      const ewsvMeanV = Number(Math.max(0.01, curV * 1.05 + ((seed + i * 2) % 7 - 3) * 0.004).toFixed(3));
      const advmMeanV = Number(Math.max(0.01, curV * 0.95 - ((seed + i * 4) % 7 - 3) * 0.004).toFixed(3));
      
      const ewsvMeanSnr = Number(Math.max(65, Math.min(105, curSnr - 2 + ((seed + i) % 5 - 2) * 0.5)).toFixed(1));
      const advmMeanSnr = Number(Math.max(70, Math.min(115, curSnr + 4 + ((seed + i * 3) % 5 - 2) * 0.6)).toFixed(1));

      // Generate individual sensor values
      const curSensorVs = [];
      const curSensorSnrs = [];
      const curEwsvVs = [];
      const curEwsvSnrs = [];
      const curAdvmVs = [];
      const curAdvmSnrs = [];

      if (isDual) {
        // EWSV Sensors
        for (let k = 0; k < ewsvLabels.length; k++) {
          const kNoise = ((seed * (k + 1) + i * 5) % 9 - 4) * 0.004;
          const sV = Number(Math.max(0.01, ewsvMeanV * (1 + ewsvProfiles[k]) + kNoise).toFixed(3));
          curEwsvVs.push(sV);
          ewsvSensorVSeries[k].push(sV);
          curSensorVs.push(sV);
          sensorVelocitySeries[k].push(sV);

          const kSnrOffset = ((seed * (k + 2)) % 7 - 3) * 1.5;
          const kSnrNoise = ((seed + i * (k + 3)) % 5 - 2) * 0.4;
          const sSnr = Number(Math.max(60, Math.min(115, ewsvMeanSnr + kSnrOffset + kSnrNoise)).toFixed(1));
          curEwsvSnrs.push(sSnr);
          ewsvSensorSnrSeries[k].push(sSnr);
          curSensorSnrs.push(sSnr);
          sensorSnrSeries[k].push(sSnr);
        }

        // ADVM Sensors
        for (let k = 0; k < advmLabels.length; k++) {
          const kNoise = ((seed * (k + 5) + i * 3) % 9 - 4) * 0.004;
          const sV = Number(Math.max(0.01, advmMeanV * (1 + advmProfiles[k]) + kNoise).toFixed(3));
          curAdvmVs.push(sV);
          advmSensorVSeries[k].push(sV);
          const globalIdx = ewsvLabels.length + k;
          curSensorVs.push(sV);
          sensorVelocitySeries[globalIdx].push(sV);

          const kSnrOffset = ((seed * (k + 7)) % 7 - 3) * 1.5;
          const kSnrNoise = ((seed + i * (k + 2)) % 5 - 2) * 0.4;
          const sSnr = Number(Math.max(65, Math.min(120, advmMeanSnr + kSnrOffset + kSnrNoise)).toFixed(1));
          curAdvmSnrs.push(sSnr);
          advmSensorSnrSeries[k].push(sSnr);
          curSensorSnrs.push(sSnr);
          sensorSnrSeries[globalIdx].push(sSnr);
        }
      } else {
        // Standard single gauge type
        for (let k = 0; k < sensorCount; k++) {
          const kNoise = ((seed * (k + 1) + i * 5) % 9 - 4) * 0.004;
          const sV = Number(Math.max(0.01, curV * (1 + sensorProfiles[k]) + kNoise).toFixed(3));
          curSensorVs.push(sV);
          sensorVelocitySeries[k].push(sV);

          const kSnrOffset = ((seed * (k + 2)) % 7 - 3) * 1.5;
          const kSnrNoise = ((seed + i * (k + 3)) % 5 - 2) * 0.4;
          const sSnr = Number(Math.max(60, Math.min(115, curSnr + kSnrOffset + kSnrNoise)).toFixed(1));
          curSensorSnrs.push(sSnr);
          sensorSnrSeries[k].push(sSnr);
        }
      }

      // 4. Wind Speed
      const windDayEffect = Math.sin(phase - Math.PI / 2) * 1.2;
      const curWind = Number(Math.max(0.2, baseWind + windDayEffect + ((seed + i * 5) % 13 - 6) * 0.15).toFixed(1));

      // 5. Wind Direction
      const curWindDeg = Number(((baseWindDeg + Math.sin(phase + seed) * 35 + ((seed + i) % 7 - 3) * 5 + 360) % 360).toFixed(0));

      // 6. AC Input Voltage
      const acNoise = Math.sin(phase * 3 + seed) * 1.5 + ((seed + i * 2) % 5 - 2) * 0.4;
      const curAc = Number((baseAc + acNoise).toFixed(1));

      // 7. DC Voltage
      const isDay = hourFloat >= 8 && hourFloat <= 18;
      let curDc = 12.6;
      if (isDay) {
        const sunIntensity = Math.sin(((hourFloat - 8) / 10) * Math.PI);
        curDc = 12.8 + sunIntensity * 1.1 + ((seed + i) % 5 - 2) * 0.05;
      } else {
        curDc = 12.7 - ((24 - hourFloat) % 14) * 0.02 + ((seed + i) % 3 - 1) * 0.03;
      }
      curDc = Number(curDc.toFixed(2));

      const pointObj = {
        time: fullTimeStr,
        timeShort: timeStr,
        waterLevel: curWl,
        velocity: curV,
        snr: curSnr,
        windSpeed: curWind,
        windDeg: curWindDeg,
        ac: curAc,
        dc: curDc,
        sensorVelocities: curSensorVs,
        sensorSnrs: curSensorSnrs
      };

      if (isDual) {
        pointObj.ewsvVelocity = ewsvMeanV;
        pointObj.ewsvSnr = ewsvMeanSnr;
        pointObj.ewsvSensorVelocities = curEwsvVs;
        pointObj.ewsvSensorSnrs = curEwsvSnrs;

        pointObj.advmVelocity = advmMeanV;
        pointObj.advmSnr = advmMeanSnr;
        pointObj.advmSensorVelocities = curAdvmVs;
        pointObj.advmSensorSnrs = curAdvmSnrs;
      }

      points.push(pointObj);
    }

    // Anchor latest point with liveMetrics if available
    if (liveMetrics && points.length > 0) {
      const last = points[points.length - 1];
      if (liveMetrics.waterLevel && !isNaN(liveMetrics.waterLevel)) last.waterLevel = Number(liveMetrics.waterLevel);
      if (liveMetrics.velocity && !isNaN(liveMetrics.velocity)) {
        last.velocity = Number(liveMetrics.velocity);
        last.sensorVelocities = last.sensorVelocities.map((v, k) => Number((last.velocity * (1 + sensorProfiles[k])).toFixed(3)));
        if (isDual) {
          last.ewsvVelocity = Number((last.velocity * 1.05).toFixed(3));
          last.advmVelocity = Number((last.velocity * 0.95).toFixed(3));
        }
      }
      if (liveMetrics.snr && !isNaN(liveMetrics.snr)) {
        last.snr = Number(liveMetrics.snr);
        last.sensorSnrs = last.sensorSnrs.map((s, k) => Number((last.snr + ((seed * (k + 2)) % 7 - 3) * 1.5).toFixed(1)));
        if (isDual) {
          last.ewsvSnr = Number((last.snr - 2).toFixed(1));
          last.advmSnr = Number((last.snr + 4).toFixed(1));
        }
      }
      if (liveMetrics.ac && !isNaN(liveMetrics.ac)) last.ac = Number(liveMetrics.ac);
      if (liveMetrics.dcBattery && !isNaN(liveMetrics.dcBattery)) last.dc = Number(liveMetrics.dcBattery);
    }

    const payload = {
      success: true,
      hasData: true,
      code,
      period: "24h",
      pointCount: points.length,
      isDual,
      sensorCount,
      sensorLabels,
      labels,
      timeLabels,
      points,
      series: {
        waterLevel: points.map(p => p.waterLevel),
        velocity: points.map(p => p.velocity),
        snr: points.map(p => p.snr),
        windSpeed: points.map(p => p.windSpeed),
        windDeg: points.map(p => p.windDeg),
        ac: points.map(p => p.ac),
        dc: points.map(p => p.dc)
      },
      sensorSeries: {
        velocity: sensorVelocitySeries,
        snr: sensorSnrSeries
      }
    };

    if (isDual) {
      payload.dualData = {
        ewsv: {
          count: ewsvLabels.length,
          labels: ewsvLabels,
          series: {
            velocity: points.map(p => p.ewsvVelocity),
            snr: points.map(p => p.ewsvSnr)
          },
          sensorSeries: {
            velocity: ewsvSensorVSeries,
            snr: ewsvSensorSnrSeries
          }
        },
        advm: {
          count: advmLabels.length,
          labels: advmLabels,
          series: {
            velocity: points.map(p => p.advmVelocity),
            snr: points.map(p => p.advmSnr)
          },
          sensorSeries: {
            velocity: advmSensorVSeries,
            snr: advmSensorSnrSeries
          }
        }
      };
    }

    payload.thresholds = {
      snr: { standard: 70, label: "SNR 품질 기준 (70)" },
      ac: { min: 209, max: 231, nominal: 220, label: "AC 전압 정상범위 (209~231V)" },
      dc: { min: 11.5, max: 14.5, warning: 11.8, label: "DC 전압 정상범위 (11.5~14.5V)" }
    };

    this.cache.set(code, { slot: current10Min, data: payload });
    return payload;
  }

  _getSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

module.exports = new TimeSeriesService();
