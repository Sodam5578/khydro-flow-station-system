/**
 * TimeSeriesService
 * Provides authentic 24-hour (10-minute interval, 145 inclusive slots from [endSlot - 24h] to [endSlot])
 * real-time observation data based on raw SFTP / KIHS HydroMonitor (.esv & .adv) records.
 *
 * Query Window Rule (KST, Asia/Seoul, UTC+9):
 *   - endSlot   = floor((now - 20 minutes) / 10 minutes) * 10 minutes
 *   - startSlot = endSlot - 24 hours (144 * 10 minutes)
 *   - Example: At 15:44 KST today -> yesterday 15:20 KST ~ today 15:20 KST (145 slots inclusive)
 *
 * Metrics (7):
 *   1. waterLevel (수위, m)
 *   2. velocity   (유속, m/s - 단면 평균 및 유속계 호기별 개별 계측치)
 *   3. snr        (SNR, Count - 대표 및 유속계 호기별 개별 계측치)
 *   4. windSpeed  (풍속, m/s)
 *   5. windDeg    (풍향, °)
 *   6. ac         (AC 입력전압, V)
 *   7. dc         (DC 충전/배터리 전압, V)
 */

const http = require("http");
const https = require("https");
const { dbService } = require("./db");

const TEN_MIN_MS = 10 * 60 * 1000;
const LAG_MS = 20 * 60 * 1000;
const WINDOW_STEPS = 144; // 24 hours = 144 intervals -> 145 inclusive 10-minute timestamps
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KEEP_HISTORY_MS = 36 * 60 * 60 * 1000; // Retain rolling 36h rows per stream in cache
const INDEX_TTL_MS = 5 * 60 * 1000;
const META_TTL_MS = 60 * 1000;
const STREAM_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function formatKstSlot(epochMs) {
  const kst = new Date(epochMs + KST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = String(kst.getUTCFullYear());
  const mm = pad(kst.getUTCMonth() + 1);
  const dd = pad(kst.getUTCDate());
  const hh = pad(kst.getUTCHours());
  const mi = pad(kst.getUTCMinutes());
  return {
    dt: `${yyyy}${mm}${dd}${hh}${mi}`,
    month: `${yyyy}${mm}`,
    full: `${yyyy}-${mm}-${dd} ${hh}:${mi}`,
    short: `${hh}:${mi}`,
    axisLabel: `${mm}/${dd} ${hh}:${mi}`,
    isMidnight: hh === "00" && mi === "00"
  };
}

class TimeSeriesService {
  constructor() {
    this.archiveBaseUrl = (process.env.HYDRO_MONITOR_BASE_URL || "http://183.96.156.168:8080").replace(/\/+$/, "");
    this.payloadCache = new Map(); // `${code}` -> { endDT, builtAtMs, data }
    this.streamCache = new Map();  // `${month}_${code}_${type}` -> { lastFetchedEndDT, fetchedAtMs, rowsMap }
    this.indexCache = new Map();   // `${month}` -> { fetchedAtMs, byStation: Map<code, Set<type>>, entriesByKey: Map }
    this.inflightStreams = new Map();
    this.inflightIndex = new Map();

    this.initialMetaMap = null;
    this.stationsMetaMap = null;
    this.stationsMetaFetchedAt = 0;
  }

  /**
   * Pre-warms current month catalog index and initial station asynchronously after server boot.
   */
  init() {
    setTimeout(async () => {
      try {
        const win = this.getQueryWindow();
        await this._getArchiveIndex(win.endFmt.month);
        await this.get24hTimeSeries("1001529");
        console.log(`📈 TimeSeriesService initialized (Window: ${win.startFmt.full} ~ ${win.endFmt.full} KST).`);
      } catch (err) {
        console.warn("[TimeSeriesService] Pre-warm warning:", err.message);
      }
    }, 1500);
  }

  /**
   * Computes the exact KST 24-hour query window anchored at floor((now - 20m) / 10m) * 10m.
   */
  getQueryWindow(referenceNowMs = Date.now()) {
    const endSlotMs = Math.floor((referenceNowMs - LAG_MS) / TEN_MIN_MS) * TEN_MIN_MS;
    const startSlotMs = endSlotMs - WINDOW_STEPS * TEN_MIN_MS;
    const minKeepMs = endSlotMs - KEEP_HISTORY_MS;
    return {
      startSlotMs,
      endSlotMs,
      startFmt: formatKstSlot(startSlotMs),
      endFmt: formatKstSlot(endSlotMs),
      minKeepDT: formatKstSlot(minKeepMs).dt
    };
  }

  _loadInitialMetaMap() {
    if (this.initialMetaMap) return this.initialMetaMap;
    this.initialMetaMap = new Map();
    try {
      const raw = require("../data/stations_initial.json");
      for (const st of raw) {
        const norm = this._normalizeStationMeta(st, null);
        if (norm.code) this.initialMetaMap.set(norm.code, norm);
        if (norm.id) this.initialMetaMap.set(`id:${norm.id}`, norm);
        if (norm.cleanName) this.initialMetaMap.set(`name:${norm.cleanName}`, norm);
      }
    } catch (_) {}
    return this.initialMetaMap;
  }

  _normalizeStationMeta(st, fallback = null) {
    if (!st) return fallback || null;
    const code = String(st.code ?? fallback?.code ?? "").trim();
    const id = st.id !== undefined && st.id !== null ? String(st.id).trim() : (fallback?.id || "");
    const name = String(st.name ?? fallback?.name ?? "").trim();
    const cleanName = name.replace(/[\(\)\s]/g, "");
    const gaugeType = String(st.gauge_type ?? st.gaugeType ?? fallback?.gaugeType ?? "").trim();
    const isDual = Boolean(
      st.is_dual === 1 ||
      st.is_dual === true ||
      st.isDualGauge === true ||
      st.gaugeCategory === "DUAL" ||
      (gaugeType.toUpperCase().includes("EWSV") && gaugeType.toUpperCase().includes("ADVM"))
    );
    const isOperating = (st.is_operating !== undefined && st.is_operating !== null)
      ? Boolean(st.is_operating === 1 || st.is_operating === true)
      : (st.isOperating2026 !== undefined ? st.isOperating2026 !== false : (fallback ? fallback.isOperating : true));

    const parseCnt = (v, fb = 0) => {
      const n = parseInt(String(v ?? "").trim(), 10);
      return Number.isFinite(n) && n > 0 ? n : fb;
    };

    const ewsvCount = parseCnt(st.ewsv_count ?? st.ewsvCount, fallback?.ewsvCount || 0);
    const advmCount = parseCnt(st.advm_count ?? st.advmCount, fallback?.advmCount || 0);
    const solarInstall = Boolean(
      st.solar_install === 1 || st.solar_install === true || st.solarInstall === true || fallback?.solarInstall
    );
    const ewsvWireless = Boolean(
      st.ewsv_wireless === 1 || st.ewsv_wireless === true || st.ewsvWireless === true || fallback?.ewsvWireless
    );

    return {
      id,
      code,
      name,
      cleanName,
      region: String(st.region ?? fallback?.region ?? "").trim(),
      river: String(st.river ?? fallback?.river ?? "").trim(),
      gaugeType: gaugeType || (isDual ? "EWSV, ADVM" : "EWSV"),
      isDual,
      isOperating,
      ewsvCount,
      advmCount,
      solarInstall,
      ewsvWireless
    };
  }

  async _ensureStationsMeta() {
    const initMap = this._loadInitialMetaMap();
    if (this.stationsMetaMap && Date.now() - this.stationsMetaFetchedAt < META_TTL_MS) {
      return this.stationsMetaMap;
    }

    const nextMap = new Map(initMap);
    try {
      const dbRows = await dbService.getAllStations();
      if (Array.isArray(dbRows) && dbRows.length > 0) {
        for (const row of dbRows) {
          const rowCode = String(row.code || "").trim();
          const fallback = (rowCode && initMap.get(rowCode)) || initMap.get(`id:${row.id}`) || null;
          const norm = this._normalizeStationMeta(row, fallback);
          if (norm.code) nextMap.set(norm.code, norm);
          if (norm.id) nextMap.set(`id:${norm.id}`, norm);
          if (norm.cleanName) nextMap.set(`name:${norm.cleanName}`, norm);
        }
      }
    } catch (err) {
      console.warn("[TimeSeriesService] Station DB metadata fallback warning:", err.message);
    }

    this.stationsMetaMap = nextMap;
    this.stationsMetaFetchedAt = Date.now();
    return this.stationsMetaMap;
  }

  async _resolveStation(codeOrId) {
    const metaMap = await this._ensureStationsMeta();
    const raw = String(codeOrId || "").trim();
    const clean = raw.replace(/[\(\)\s]/g, "");
    const meta = metaMap.get(raw) || metaMap.get(`id:${raw}`) || metaMap.get(`name:${clean}`) || null;
    const code = (meta && meta.code) ? meta.code : raw;
    return { code, meta };
  }

  _httpGetJson(url, timeoutMs = 15000) {
    const client = url.startsWith("https") ? https : http;
    return new Promise((resolve, reject) => {
      const req = client.get(
        url,
        { headers: { Connection: "close", Accept: "application/json" }, timeout: timeoutMs },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          let body = "";
          res.setEncoding("utf-8");
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
            }
          });
        }
      );
      req.on("timeout", () => {
        req.destroy(new Error(`Timeout (${timeoutMs}ms) fetching ${url}`));
      });
      req.on("error", (err) => reject(err));
    });
  }

  async _getArchiveIndex(month, forceRefresh = false) {
    const cached = this.indexCache.get(month);
    const now = Date.now();
    if (cached) {
      const minRefreshAge = forceRefresh ? 15000 : INDEX_TTL_MS;
      if (now - cached.fetchedAtMs < minRefreshAge) {
        return cached;
      }
    }

    if (this.inflightIndex.has(month)) {
      return this.inflightIndex.get(month);
    }

    const promise = (async () => {
      const url = `${this.archiveBaseUrl}/monthly-archive/api/index?month=${encodeURIComponent(month)}`;
      try {
        const json = await this._httpGetJson(url, 15000);
        const byStation = new Map();
        const entriesByKey = new Map();
        const entries = Array.isArray(json?.entries) ? json.entries : [];

        for (const entry of entries) {
          const stCode = String(entry.station_code || "").trim();
          const dtype = String(entry.data_type || "").trim().toUpperCase();
          if (!stCode || (dtype !== "ADVM" && dtype !== "EWSV")) continue;
          if (!byStation.has(stCode)) byStation.set(stCode, new Set());
          byStation.get(stCode).add(dtype);
          entriesByKey.set(`${stCode}_${dtype}`, entry);
        }

        const record = { fetchedAtMs: Date.now(), byStation, entriesByKey };
        this.indexCache.set(month, record);
        return record;
      } catch (err) {
        if (cached) {
          console.warn(`[TimeSeriesService] Using cached index for ${month} due to error:`, err.message);
          return cached;
        }
        throw err;
      } finally {
        this.inflightIndex.delete(month);
      }
    })();

    this.inflightIndex.set(month, promise);
    return promise;
  }

  /**
   * Streams a monthly raw CSV for (month, code, type) chunk-by-chunk, filtering timestamps >= minKeepDT
   * in O(1) before column splitting so multi-MB files parse with minimal memory and CPU overhead.
   */
  _downloadAndParseMonthlyCsv(month, code, type, minKeepDT) {
    const url = `${this.archiveBaseUrl}/monthly-archive/download/station?month=${encodeURIComponent(month)}&station=${encodeURIComponent(code)}&type=${encodeURIComponent(type)}`;
    const client = url.startsWith("https") ? https : http;
    const isAdvm = type === "ADVM";

    return new Promise((resolve, reject) => {
      const req = client.get(
        url,
        { headers: { Connection: "close" }, timeout: 90000 },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} downloading ${code} (${type}, ${month})`));
          }

          const rowsMap = new Map();
          let leftover = "";
          let isFirstLine = true;

          const processLine = (rawLine) => {
            const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
            if (!line) return;

            if (isFirstLine) {
              isFirstLine = false;
              if (!/^\d+,\d{12},/.test(line)) return; // Skip CSV header row
            }

            const c1 = line.indexOf(",");
            if (c1 === -1) return;
            const c2 = line.indexOf(",", c1 + 1);
            if (c2 === -1) return;

            const dt = line.slice(c1 + 1, c2).trim();
            if (dt.length !== 12 || dt < minKeepDT) return;

            const cols = line.split(",");
            const parsed = isAdvm ? this.parseAdvmCols(cols) : this.parseEwsvCols(cols);
            if (parsed) {
              rowsMap.set(dt, parsed);
            }
          };

          res.setEncoding("utf-8");
          res.on("data", (chunk) => {
            leftover += chunk;
            let nl = leftover.indexOf("\n");
            while (nl !== -1) {
              const rawLine = leftover.slice(0, nl);
              leftover = leftover.slice(nl + 1);
              processLine(rawLine);
              nl = leftover.indexOf("\n");
            }
          });

          res.on("end", () => {
            if (leftover.length > 0) {
              processLine(leftover);
              leftover = "";
            }
            resolve(rowsMap);
          });

          res.on("error", (err) => reject(err));
        }
      );

      req.on("timeout", () => {
        req.destroy(new Error(`Timeout (90s) downloading raw archive for ${code} (${type})`));
      });
      req.on("error", (err) => reject(err));
    });
  }

  async _getStreamRows(month, code, type, endDT, minKeepDT, isCurrentMonth, forceRefresh = false) {
    const cacheKey = `${month}_${code}_${type}`;
    const cached = this.streamCache.get(cacheKey);
    const now = Date.now();

    if (cached) {
      if (forceRefresh && now - cached.fetchedAtMs < 15000) {
        return cached.rowsMap;
      }
      if (!forceRefresh) {
        if (!isCurrentMonth && now - cached.fetchedAtMs < 30 * 60 * 1000) {
          return cached.rowsMap;
        }
        if (isCurrentMonth) {
          if (cached.rowsMap.has(endDT)) {
            return cached.rowsMap;
          }
          // If endDT row hadn't arrived yet when last fetched, retry after 45s
          if (cached.lastFetchedEndDT === endDT && now - cached.fetchedAtMs < 45000) {
            return cached.rowsMap;
          }
        }
      }
    }

    if (this.inflightStreams.has(cacheKey)) {
      return this.inflightStreams.get(cacheKey);
    }

    const promise = (async () => {
      try {
        const rowsMap = await this._downloadAndParseMonthlyCsv(month, code, type, minKeepDT);
        this.streamCache.set(cacheKey, {
          lastFetchedEndDT: endDT,
          fetchedAtMs: Date.now(),
          rowsMap
        });
        this._pruneStreamCache();
        return rowsMap;
      } catch (err) {
        if (cached) {
          console.warn(`[TimeSeriesService] Falling back to cached stream ${cacheKey}:`, err.message);
          return cached.rowsMap;
        }
        throw err;
      } finally {
        this.inflightStreams.delete(cacheKey);
      }
    })();

    this.inflightStreams.set(cacheKey, promise);
    return promise;
  }

  _pruneStreamCache() {
    if (this.streamCache.size <= 260) return;
    const cutoff = Date.now() - STREAM_MAX_AGE_MS;
    for (const [key, val] of this.streamCache.entries()) {
      if (val.fetchedAtMs < cutoff) {
        this.streamCache.delete(key);
      }
    }
  }

  /**
   * Parses VTH (AC / DC voltage) fields common to both .esv and .adv (cols[3..8]).
   */
  _parseVth(cols) {
    const deciVTH = String(cols[3] || "").trim();
    const acRaw = parseFloat(cols[4]);
    const dcChargeRaw = parseFloat(cols[5]);
    const dcBattRaw = parseFloat(cols[6]);
    const tempSysRaw = parseFloat(cols[7]);
    const hrSysRaw = parseFloat(cols[8]);

    const allZeroOrNaN = [acRaw, dcChargeRaw, dcBattRaw, tempSysRaw, hrSysRaw].every(
      (v) => !Number.isFinite(v) || v === 0
    );

    if (allZeroOrNaN || (deciVTH.startsWith("2") && (!Number.isFinite(dcBattRaw) || dcBattRaw === 0))) {
      return { ac: null, dc: null };
    }

    const ac = Number.isFinite(acRaw) && acRaw >= 0 && acRaw < 500
      ? Number(acRaw.toFixed(1))
      : null;

    let dc = null;
    if (Number.isFinite(dcBattRaw) && dcBattRaw > 0 && dcBattRaw < 60) {
      dc = Number(dcBattRaw.toFixed(2));
    } else if (Number.isFinite(dcChargeRaw) && dcChargeRaw > 0 && dcChargeRaw < 60) {
      dc = Number(dcChargeRaw.toFixed(2));
    }

    return { ac, dc };
  }

  /**
   * Parses WaterLevel fields (cols[9..13]) for .esv or .adv.
   * Handles the RTU firmware column swap in older ADVM RTUs where cols[10] is 2-decimal WaterDepth
   * and cols[11] is 3-decimal WaterLevel (e.g., 1005597).
   */
  _parseWaterLevel(cols, isAdvm = false) {
    const deciWL = String(cols[9] || "").trim();
    const f10 = String(cols[10] || "").trim();
    const f11 = String(cols[11] || "").trim();
    const n10 = parseFloat(f10);
    const n11 = parseFloat(f11);
    const n12 = parseFloat(cols[12]);
    const n13 = parseFloat(cols[13]);

    const allZeroOrNaN = [n10, n11, n12, n13].every((v) => !Number.isFinite(v) || v === 0);
    if (deciWL.startsWith("2") || allZeroOrNaN) {
      return null;
    }

    let rawWl = n10;
    if (isAdvm && /\.\d{3}$/.test(f11) && !/\.\d{3}$/.test(f10)) {
      rawWl = n11;
    }

    if (!Number.isFinite(rawWl) || Math.abs(rawWl) > 500) {
      return null;
    }
    return Number(rawWl.toFixed(3));
  }

  /**
   * Parses a single .esv (EWSV) CSV row according to KIHS EWSV_FileSpec & EWSV_Rule.
   */
  parseEwsvCols(cols) {
    if (!Array.isArray(cols) || cols.length < 28) return null;

    const { ac, dc } = this._parseVth(cols);
    const waterLevel = this._parseWaterLevel(cols, false);

    // Wind sensor block: cols[14..19]
    const deciWind = String(cols[14] || "").trim();
    const wVals = [15, 16, 17, 18, 19].map((i) => parseFloat(cols[i]));
    const windMissing = deciWind.startsWith("2") || wVals.every((v) => !Number.isFinite(v) || v === 0);

    let windDeg = null;
    let windSpeed = null;
    if (!windMissing) {
      if (Number.isFinite(wVals[0]) && wVals[0] >= 0 && wVals[0] <= 360) {
        windDeg = Number(wVals[0].toFixed(0));
      }
      if (Number.isFinite(wVals[1]) && wVals[1] >= 0 && wVals[1] < 150) {
        windSpeed = Number(wVals[1].toFixed(1));
      }
    }

    // EWSV summary & per-sensor blocks: cols[20..27], then 8 cols per sensor from idx 28
    // Note: Some EWSV RTUs populate ewsvLv/ewsvLvAvg (surface velocity) with ewsvV/ewsvVAvg = 0.000,
    // and radar EWSV models may report SNR in negative dBm (e.g. -98, -125) or positive dB/Count.
    const deciEwsv = String(cols[20] || "").trim();
    const lvAvgRaw = parseFloat(cols[22]);
    const vAvgRaw = parseFloat(cols[23]);
    const rawCnt = parseInt(cols[26], 10);
    const ewsvFlag = String(cols[27] || "").trim();
    const ewsvFailed = deciEwsv.startsWith("2") || ewsvFlag === "" || ewsvFlag === "0";

    const sensors = [];
    for (let idx = 28, sIdx = 0; idx + 6 < cols.length; idx += 8, sIdx++) {
      if (Number.isFinite(rawCnt) && rawCnt > 0 && sIdx >= rawCnt) break;

      const sNo = parseInt(cols[idx], 10);
      const sLv = parseFloat(cols[idx + 1]);
      const sV = parseFloat(cols[idx + 2]);
      const sDeg = parseFloat(cols[idx + 5]);
      const sSnr = parseFloat(cols[idx + 6]);

      const targetIdx = (Number.isFinite(sNo) && sNo >= 1 && sNo <= 16 && sensors[sNo - 1] === undefined)
        ? sNo - 1
        : sIdx;

      const degAndSnrZero = (!Number.isFinite(sDeg) || sDeg === 0) && (!Number.isFinite(sSnr) || sSnr === 0);
      const chosenV = (Number.isFinite(sV) && sV !== 0)
        ? sV
        : ((Number.isFinite(sLv) && sLv !== 0) ? sLv : (Number.isFinite(sV) ? sV : sLv));

      if (ewsvFailed || degAndSnrZero || !Number.isFinite(chosenV) || Math.abs(chosenV) > 30) {
        sensors[targetIdx] = { v: null, snr: null };
      } else {
        sensors[targetIdx] = {
          v: Number(chosenV.toFixed(3)),
          snr: Number.isFinite(sSnr) && sSnr !== 0 ? Number(sSnr.toFixed(1)) : null
        };
      }
    }

    for (let k = 0; k < sensors.length; k++) {
      if (!sensors[k]) sensors[k] = { v: null, snr: null };
    }

    const validVs = sensors.map((s) => s.v).filter((v) => v !== null);
    const validSnrs = sensors.map((s) => s.snr).filter((s) => s !== null);
    const avgCandidate = (Number.isFinite(vAvgRaw) && vAvgRaw !== 0)
      ? vAvgRaw
      : ((Number.isFinite(lvAvgRaw) && lvAvgRaw !== 0) ? lvAvgRaw : vAvgRaw);

    let velocity = null;
    if (!ewsvFailed) {
      if (validVs.length > 0) {
        if (
          Number.isFinite(avgCandidate) &&
          Math.abs(avgCandidate) <= 30 &&
          !(avgCandidate === 0 && validVs.some((v) => v !== 0))
        ) {
          velocity = Number(avgCandidate.toFixed(3));
        } else {
          velocity = Number((validVs.reduce((a, b) => a + b, 0) / validVs.length).toFixed(3));
        }
      } else if (Number.isFinite(avgCandidate) && Math.abs(avgCandidate) <= 30) {
        velocity = Number(avgCandidate.toFixed(3));
      }
    }

    const snr = (!ewsvFailed && validSnrs.length > 0)
      ? Number((validSnrs.reduce((a, b) => a + b, 0) / validSnrs.length).toFixed(1))
      : null;

    return {
      waterLevel,
      velocity,
      snr,
      windSpeed,
      windDeg,
      ac,
      dc,
      sensors
    };
  }

  /**
   * Parses a single .adv (ADVM) CSV row according to KIHS ADVM_FileSpec & ADVM_Rule.
   * - Cell velocity components (V_EW, V_NS) are in mm/s (-32768 sentinel) -> converted to m/s via hypot/1000.
   * - Opposite-bank acoustic noise cells (E1 < 70 || E2 < 70) are excluded from velocity averaging.
   */
  parseAdvmCols(cols) {
    if (!Array.isArray(cols) || cols.length < 14) return null;

    const { ac, dc } = this._parseVth(cols);
    const waterLevel = this._parseWaterLevel(cols, true);

    const sensors = [];
    let idx = 14;
    let sIdx = 0;

    while (idx <= cols.length - 12) {
      const noAdvm = parseInt(cols[idx], 10);
      const deciAdvm = String(cols[idx + 1] || "").trim();
      const wn = parseInt(cols[idx + 6], 10);
      if (!Number.isFinite(wn) || wn < 0 || wn > 200) break;

      const cellStart = idx + 12;
      const cells = [];
      for (let c = 0; c < wn && cellStart + c * 5 + 4 < cols.length; c++) {
        const base = cellStart + c * 5;
        cells.push({
          vEW: parseFloat(cols[base + 1]),
          vNS: parseFloat(cols[base + 2]),
          e1: parseFloat(cols[base + 3]),
          e2: parseFloat(cols[base + 4])
        });
      }

      idx = cellStart + wn * 5;

      const targetIdx = (Number.isFinite(noAdvm) && noAdvm >= 1 && noAdvm <= 16 && sensors[noAdvm - 1] === undefined)
        ? noAdvm - 1
        : sIdx;
      sIdx++;

      if (deciAdvm.startsWith("2") || cells.length === 0) {
        sensors[targetIdx] = { v: null, snr: null };
        continue;
      }

      const wetCells = cells.filter(
        (c) =>
          Number.isFinite(c.vEW) &&
          Number.isFinite(c.vNS) &&
          Math.abs(c.vEW) <= 9999 &&
          Math.abs(c.vNS) <= 9999 &&
          Number.isFinite(c.e1) &&
          Number.isFinite(c.e2) &&
          c.e1 >= 70 &&
          c.e2 >= 70
      );

      const cell1 = cells[0];
      let sVel = null;
      if (wetCells.length > 0) {
        const meanSpeed = wetCells.reduce((acc, c) => acc + Math.hypot(c.vEW, c.vNS) / 1000, 0) / wetCells.length;
        sVel = Number(meanSpeed.toFixed(3));
      } else if (
        cell1 &&
        Number.isFinite(cell1.vEW) &&
        Number.isFinite(cell1.vNS) &&
        Math.abs(cell1.vEW) <= 5000 &&
        Math.abs(cell1.vNS) <= 5000 &&
        Number.isFinite(cell1.e1) &&
        Number.isFinite(cell1.e2) &&
        cell1.e1 >= 50 &&
        cell1.e2 >= 50
      ) {
        sVel = Number((Math.hypot(cell1.vEW, cell1.vNS) / 1000).toFixed(3));
      }

      let sSnr = null;
      const cell1HasSignal =
        cell1 &&
        Number.isFinite(cell1.e1) &&
        Number.isFinite(cell1.e2) &&
        (cell1.e1 > 0 || cell1.e2 > 0);

      if (cell1HasSignal && (cell1.e1 < 70 || cell1.e2 < 70)) {
        // Preserve low-SNR beam degradation (< 70) per ADVM-R19
        sSnr = Number(Math.min(cell1.e1, cell1.e2).toFixed(1));
      } else if (wetCells.length > 0) {
        const meanSnr = wetCells.reduce((acc, c) => acc + (c.e1 + c.e2) / 2, 0) / wetCells.length;
        sSnr = Number(meanSnr.toFixed(1));
      } else if (cell1HasSignal) {
        sSnr = Number(((cell1.e1 + cell1.e2) / 2).toFixed(1));
      }

      sensors[targetIdx] = { v: sVel, snr: sSnr };
    }

    for (let k = 0; k < sensors.length; k++) {
      if (!sensors[k]) sensors[k] = { v: null, snr: null };
    }

    const validVs = sensors.map((s) => s.v).filter((v) => v !== null);
    const validSnrs = sensors.map((s) => s.snr).filter((s) => s !== null);

    return {
      waterLevel,
      velocity: validVs.length > 0 ? Number((validVs.reduce((a, b) => a + b, 0) / validVs.length).toFixed(3)) : null,
      snr: validSnrs.length > 0 ? Number((validSnrs.reduce((a, b) => a + b, 0) / validSnrs.length).toFixed(1)) : null,
      windSpeed: null,
      windDeg: null,
      ac,
      dc,
      sensors
    };
  }

  /**
   * Retrieves authentic 24-hour (10-minute interval, 145 slots) time-series data for a station.
   * Window: [endSlot - 24h, endSlot] where endSlot = floor((now - 20m) / 10m) * 10m in KST.
   */
  async get24hTimeSeries(stCodeOrId, options = {}) {
    const forceRefresh = Boolean(options && typeof options === "object" && options.forceRefresh);
    const { code, meta: stMeta } = await this._resolveStation(stCodeOrId);
    const win = this.getQueryWindow();
    const { startSlotMs, endSlotMs, startFmt, endFmt, minKeepDT } = win;

    if (!code || !/^\d{7}$/.test(code)) {
      return {
        success: true,
        hasData: false,
        code: code || String(stCodeOrId || ""),
        startTime: startFmt.full,
        endTime: endFmt.full,
        reason: "NO_STATION_CODE",
        message: `해당 관측소는 7자리 표준 지점코드가 부여되지 않은 구축예정/미수집 지점으로 조회 가능한 실시간 원시자료가 없습니다. (조회 기준 구간: ${startFmt.full} ~ ${endFmt.full})`
      };
    }

    // Return cached 145-point payload if already built for the current 10-minute endDT slot
    // (If the latest endDT row had not arrived yet when built, expire payload cache after 45s to pick up newly synced files)
    const cachedPayload = this.payloadCache.get(code);
    if (cachedPayload && cachedPayload.endDT === endFmt.dt) {
      const ageMs = Date.now() - cachedPayload.builtAtMs;
      if (forceRefresh) {
        if (ageMs < 15000) return cachedPayload.data;
      } else if (cachedPayload.isCompleteEndSlot || ageMs < 45000) {
        return cachedPayload.data;
      }
    }

    const monthsNeeded = startFmt.month === endFmt.month
      ? [endFmt.month]
      : [startFmt.month, endFmt.month];

    const monthIndices = await Promise.all(
      monthsNeeded.map((m) => this._getArchiveIndex(m, forceRefresh))
    );

    const availableTypes = new Set();
    monthIndices.forEach((idxObj) => {
      const types = idxObj.byStation.get(code);
      if (types) {
        types.forEach((t) => availableTypes.add(t));
      }
    });

    if (availableTypes.size === 0) {
      const isScheduled = stMeta && stMeta.isOperating === false;
      const noDataPayload = {
        success: true,
        hasData: false,
        code,
        startTime: startFmt.full,
        endTime: endFmt.full,
        reason: isScheduled ? "SCHEDULED_STATION" : "NO_ARCHIVE_STREAM",
        message: isScheduled
          ? `해당 관측소(지점코드: ${code})는 2026년 구축예정/미운영 지점으로 실시간 원시자료 수집 대상이 아닙니다.`
          : `해당 관측소(지점코드: ${code})는 현재 원시자료 수집 서버에 수신된 관측 파일이 없습니다. (장기 미수신 또는 점검 지점 · 조회 구간: ${startFmt.full} ~ ${endFmt.full})`
      };
      this.payloadCache.set(code, { endDT: endFmt.dt, builtAtMs: Date.now(), data: noDataPayload });
      return noDataPayload;
    }

    // Fetch required ADVM / EWSV stream(s) across required month(s) in parallel
    const ewsvRowsMap = new Map();
    const advmRowsMap = new Map();

    const fetchTasks = [];
    for (let mIdx = 0; mIdx < monthsNeeded.length; mIdx++) {
      const month = monthsNeeded[mIdx];
      const idxObj = monthIndices[mIdx];
      const monthTypes = idxObj.byStation.get(code);
      if (!monthTypes) continue;
      const isCurrentMonth = month === endFmt.month;

      if (monthTypes.has("EWSV")) {
        fetchTasks.push(
          this._getStreamRows(month, code, "EWSV", endFmt.dt, minKeepDT, isCurrentMonth, forceRefresh).then((map) => {
            for (const [dt, row] of map.entries()) ewsvRowsMap.set(dt, row);
          })
        );
      }
      if (monthTypes.has("ADVM")) {
        fetchTasks.push(
          this._getStreamRows(month, code, "ADVM", endFmt.dt, minKeepDT, isCurrentMonth, forceRefresh).then((map) => {
            for (const [dt, row] of map.entries()) advmRowsMap.set(dt, row);
          })
        );
      }
    }

    await Promise.all(fetchTasks);

    // Build exact 145 timestamps from startSlotMs to endSlotMs (10-minute increments)
    const slotFormats = [];
    let observedEwsvSensors = 0;
    let observedAdvmSensors = 0;
    let receivedCount = 0;
    let ewsvReceivedCount = 0;
    let advmReceivedCount = 0;

    for (let step = 0; step <= WINDOW_STEPS; step++) {
      const fmt = formatKstSlot(startSlotMs + step * TEN_MIN_MS);
      slotFormats.push(fmt);

      const eRow = ewsvRowsMap.get(fmt.dt);
      const aRow = advmRowsMap.get(fmt.dt);
      if (eRow) {
        ewsvReceivedCount++;
        if (eRow.sensors.length > observedEwsvSensors) observedEwsvSensors = eRow.sensors.length;
      }
      if (aRow) {
        advmReceivedCount++;
        if (aRow.sensors.length > observedAdvmSensors) observedAdvmSensors = aRow.sensors.length;
      }
      if (eRow || aRow) {
        receivedCount++;
      }
    }

    if (receivedCount === 0) {
      const emptyWindowPayload = {
        success: true,
        hasData: false,
        code,
        startTime: startFmt.full,
        endTime: endFmt.full,
        receivedCount: 0,
        expectedCount: WINDOW_STEPS + 1,
        reason: "NO_RECENT_24H_DATA",
        message: `조회 기준 구간(${startFmt.full} ~ ${endFmt.full}) 동안 수신된 10분 주기 원시 관측자료가 없습니다 (최근 24시간 수신 0 / ${WINDOW_STEPS + 1}건 · 연속 미수신 상태).`
      };
      this.payloadCache.set(code, { endDT: endFmt.dt, builtAtMs: Date.now(), data: emptyWindowPayload });
      return emptyWindowPayload;
    }

    // Determine single vs dual gauge mode and exact sensor counts from DB metadata + actual raw observations
    const hasBothStreams = availableTypes.has("EWSV") && availableTypes.has("ADVM");
    const isDual = Boolean((stMeta && stMeta.isDual) || hasBothStreams);
    const isAdvmSingle = !isDual && (
      availableTypes.has("ADVM") ||
      (!availableTypes.has("EWSV") && String(stMeta?.gaugeType || "").toUpperCase().includes("ADVM"))
    );

    let ewsvLabels = [];
    let advmLabels = [];
    let sensorLabels = [];

    if (isDual) {
      const eCnt = Math.max(1, stMeta?.ewsvCount || 0, observedEwsvSensors);
      const aCnt = Math.max(1, stMeta?.advmCount || 0, observedAdvmSensors);
      for (let s = 1; s <= eCnt; s++) ewsvLabels.push(`EWSV ${s}번 유속계`);
      for (let s = 1; s <= aCnt; s++) advmLabels.push(`ADVM ${s}번 유속계`);
      sensorLabels = [...ewsvLabels, ...advmLabels];
    } else if (isAdvmSingle) {
      const aCnt = Math.max(1, stMeta?.advmCount || 0, observedAdvmSensors);
      for (let s = 1; s <= aCnt; s++) sensorLabels.push(`${s}번 유속계`);
    } else {
      const eCnt = Math.max(1, stMeta?.ewsvCount || 0, observedEwsvSensors);
      for (let s = 1; s <= eCnt; s++) sensorLabels.push(`${s}번 유속계`);
    }

    const sensorCount = sensorLabels.length;
    const points = [];
    const labels = [];
    const timeLabels = [];

    const sensorVelocitySeries = Array.from({ length: sensorCount }, () => []);
    const sensorSnrSeries = Array.from({ length: sensorCount }, () => []);
    const ewsvSensorVSeries = Array.from({ length: ewsvLabels.length }, () => []);
    const ewsvSensorSnrSeries = Array.from({ length: ewsvLabels.length }, () => []);
    const advmSensorVSeries = Array.from({ length: advmLabels.length }, () => []);
    const advmSensorSnrSeries = Array.from({ length: advmLabels.length }, () => []);

    const isWirelessEwsv = Boolean(stMeta?.ewsvWireless);

    for (let step = 0; step < slotFormats.length; step++) {
      const fmt = slotFormats[step];
      labels.push(fmt.full);

      if (step === 0 || step === slotFormats.length - 1 || fmt.isMidnight) {
        timeLabels.push(fmt.axisLabel);
      } else {
        timeLabels.push(fmt.short);
      }

      const eRow = ewsvRowsMap.get(fmt.dt) || null;
      const aRow = advmRowsMap.get(fmt.dt) || null;
      const received = Boolean(eRow || aRow);

      if (isDual) {
        const waterLevel = isWirelessEwsv
          ? (aRow?.waterLevel ?? eRow?.waterLevel ?? null)
          : (eRow?.waterLevel ?? aRow?.waterLevel ?? null);

        const ac = (eRow?.ac !== null && eRow?.ac !== undefined && !(eRow.ac === 0 && (aRow?.ac ?? 0) > 0))
          ? eRow.ac
          : (aRow?.ac ?? null);
        const dc = eRow?.dc ?? aRow?.dc ?? null;
        const windSpeed = eRow?.windSpeed ?? aRow?.windSpeed ?? null;
        const windDeg = eRow?.windDeg ?? aRow?.windDeg ?? null;

        const ewsvVelocity = eRow?.velocity ?? null;
        const ewsvSnr = eRow?.snr ?? null;
        const advmVelocity = aRow?.velocity ?? null;
        const advmSnr = aRow?.snr ?? null;

        const curEwsvVs = [];
        const curEwsvSnrs = [];
        const curAdvmVs = [];
        const curAdvmSnrs = [];
        const curSensorVs = [];
        const curSensorSnrs = [];

        for (let k = 0; k < ewsvLabels.length; k++) {
          const sv = eRow?.sensors?.[k]?.v ?? null;
          const ssnr = eRow?.sensors?.[k]?.snr ?? null;
          curEwsvVs.push(sv);
          curEwsvSnrs.push(ssnr);
          ewsvSensorVSeries[k].push(sv);
          ewsvSensorSnrSeries[k].push(ssnr);
          curSensorVs.push(sv);
          curSensorSnrs.push(ssnr);
          sensorVelocitySeries[k].push(sv);
          sensorSnrSeries[k].push(ssnr);
        }

        for (let k = 0; k < advmLabels.length; k++) {
          const sv = aRow?.sensors?.[k]?.v ?? null;
          const ssnr = aRow?.sensors?.[k]?.snr ?? null;
          const globalIdx = ewsvLabels.length + k;
          curAdvmVs.push(sv);
          curAdvmSnrs.push(ssnr);
          advmSensorVSeries[k].push(sv);
          advmSensorSnrSeries[k].push(ssnr);
          curSensorVs.push(sv);
          curSensorSnrs.push(ssnr);
          sensorVelocitySeries[globalIdx].push(sv);
          sensorSnrSeries[globalIdx].push(ssnr);
        }

        points.push({
          time: fmt.full,
          timeShort: fmt.short,
          received,
          waterLevel,
          velocity: ewsvVelocity ?? advmVelocity ?? null,
          snr: ewsvSnr ?? advmSnr ?? null,
          windSpeed,
          windDeg,
          ac,
          dc,
          sensorVelocities: curSensorVs,
          sensorSnrs: curSensorSnrs,
          ewsvVelocity,
          ewsvSnr,
          ewsvSensorVelocities: curEwsvVs,
          ewsvSensorSnrs: curEwsvSnrs,
          advmVelocity,
          advmSnr,
          advmSensorVelocities: curAdvmVs,
          advmSensorSnrs: curAdvmSnrs
        });
      } else {
        const row = isAdvmSingle ? aRow : eRow;
        const curSensorVs = [];
        const curSensorSnrs = [];

        for (let k = 0; k < sensorCount; k++) {
          const sv = row?.sensors?.[k]?.v ?? null;
          const ssnr = row?.sensors?.[k]?.snr ?? null;
          curSensorVs.push(sv);
          curSensorSnrs.push(ssnr);
          sensorVelocitySeries[k].push(sv);
          sensorSnrSeries[k].push(ssnr);
        }

        points.push({
          time: fmt.full,
          timeShort: fmt.short,
          received,
          waterLevel: row?.waterLevel ?? null,
          velocity: row?.velocity ?? null,
          snr: row?.snr ?? null,
          windSpeed: row?.windSpeed ?? null,
          windDeg: row?.windDeg ?? null,
          ac: row?.ac ?? null,
          dc: row?.dc ?? null,
          sensorVelocities: curSensorVs,
          sensorSnrs: curSensorSnrs
        });
      }
    }

    const payload = {
      success: true,
      hasData: true,
      code,
      gaugeMode: isDual ? "DUAL" : (isAdvmSingle ? "ADVM" : "EWSV"),
      period: "24h",
      lagMinutes: 20,
      startTime: startFmt.full,
      endTime: endFmt.full,
      pointCount: points.length,
      expectedCount: WINDOW_STEPS + 1,
      receivedCount,
      missingCount: points.length - receivedCount,
      isDual,
      sensorCount,
      sensorLabels,
      labels,
      timeLabels,
      points,
      series: {
        waterLevel: points.map((p) => p.waterLevel),
        velocity: points.map((p) => p.velocity),
        snr: points.map((p) => p.snr),
        windSpeed: points.map((p) => p.windSpeed),
        windDeg: points.map((p) => p.windDeg),
        ac: points.map((p) => p.ac),
        dc: points.map((p) => p.dc)
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
          receivedCount: ewsvReceivedCount,
          labels: ewsvLabels,
          series: {
            velocity: points.map((p) => p.ewsvVelocity),
            snr: points.map((p) => p.ewsvSnr)
          },
          sensorSeries: {
            velocity: ewsvSensorVSeries,
            snr: ewsvSensorSnrSeries
          }
        },
        advm: {
          count: advmLabels.length,
          receivedCount: advmReceivedCount,
          labels: advmLabels,
          series: {
            velocity: points.map((p) => p.advmVelocity),
            snr: points.map((p) => p.advmSnr)
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

    const endEwsvOk = !availableTypes.has("EWSV") || ewsvRowsMap.has(endFmt.dt);
    const endAdvmOk = !availableTypes.has("ADVM") || advmRowsMap.has(endFmt.dt);
    const isCompleteEndSlot = Boolean(endEwsvOk && endAdvmOk);

    this.payloadCache.set(code, {
      endDT: endFmt.dt,
      builtAtMs: Date.now(),
      isCompleteEndSlot,
      data: payload
    });
    return payload;
  }
}

module.exports = new TimeSeriesService();
