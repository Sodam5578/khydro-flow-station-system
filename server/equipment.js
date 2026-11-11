const { db, logActivity } = require("./db");

class EquipmentService {
  /**
   * Helper to execute SQL with Promises
   */
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  /**
   * Helper: Standard Lifespan Years (조달청 고시 제2024-30호) & Calibration Cycle (유속계 2년 / 수위계 3년)
   */
  getStandardLifespan(category) {
    const map = {
      FLOWMETER: 13,
      WATER_LEVEL: 10,
      MOUNT: 12,
      CONTROL: 8,
      SHELTER: 8,
      UNDERWATER: 7,
      LIGHTNING: 7,
      CCTV: 9,
      ANCILLARY: 10,
      ETC: 10
    };
    return map[category] || 10;
  }

  getCalibCycleYears(category) {
    if (category === "FLOWMETER") return 2;
    if (category === "WATER_LEVEL") return 3;
    return 0;
  }

  addYearsMinusOneDay(dateStr, years) {
    if (!dateStr || !years) return "";
    const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const y = parseInt(m[1], 10) + Number(years);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(Date.UTC(y, mo, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    return dt.toISOString().split("T")[0];
  }

  computeLifespanAndCalib(category, acqDateRaw, customLifespanYears, recentCalibRaw, expireCalibRaw, certNoRaw) {
    const stdLifespan = this.getStandardLifespan(category);
    const lifespanYears = parseInt(customLifespanYears, 10) > 0 ? parseInt(customLifespanYears, 10) : stdLifespan;

    const yrMatch = String(acqDateRaw || "").match(/(19\d{2}|20\d{2})/);
    const acqYear = yrMatch ? parseInt(yrMatch[1], 10) : new Date().getFullYear();
    const acqDate = yrMatch ? String(yrMatch[1]) : String(acqYear);
    const lifespanEndYear = String(acqYear + lifespanYears);
    const isLifespanOver = parseInt(lifespanEndYear, 10) < 2026 ? 1 : 0;

    let recentCalibDate = String(recentCalibRaw || "").trim();
    if (recentCalibDate === "null" || recentCalibDate === "undefined" || recentCalibDate === "-") recentCalibDate = "";
    let calibExpireDate = String(expireCalibRaw || "").trim();
    if (calibExpireDate === "null" || calibExpireDate === "undefined" || calibExpireDate === "-") calibExpireDate = "";
    let calibCertNo = String(certNoRaw || "").trim();
    if (calibCertNo === "null" || calibCertNo === "undefined" || calibCertNo === "-") calibCertNo = "";
    let calibStatus = "none";

    const cycle = this.getCalibCycleYears(category);
    if (cycle > 0) {
      if (!recentCalibDate && !calibExpireDate) {
        recentCalibDate = "";
        calibExpireDate = "";
        calibCertNo = "";
        calibStatus = "none";
      } else {
        if (recentCalibDate && !calibExpireDate) {
          calibExpireDate = this.addYearsMinusOneDay(recentCalibDate, cycle);
        } else if (!recentCalibDate && calibExpireDate) {
          recentCalibDate = this.addYearsMinusOneDay(calibExpireDate, -cycle);
        }
        const todayStr = new Date().toISOString().split("T")[0];
        const refToday = todayStr < "2026-11-03" ? "2026-11-03" : todayStr;
        if (calibExpireDate && calibExpireDate < refToday) {
          calibStatus = "overdue";
        } else if (calibExpireDate && calibExpireDate <= "2026-12-31") {
          calibStatus = "due_soon";
        } else if (calibExpireDate) {
          calibStatus = "valid";
        } else {
          calibStatus = "none";
        }
      }
    }

    return {
      acquisition_date: acqDate,
      lifespan_years: lifespanYears,
      lifespan_end_year: lifespanEndYear,
      is_lifespan_over: isLifespanOver,
      recent_calib_date: recentCalibDate,
      calib_expire_date: calibExpireDate,
      calib_cert_no: calibCertNo,
      calib_status: calibStatus
    };
  }

  /**
   * 0. Overall Equipment Dashboard Aggregations
   */
  async getDashboardStats() {
    const overview = await this.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status='OPERATING' THEN 1 ELSE 0 END) as operating,
        SUM(CASE WHEN status='SPARE' THEN 1 ELSE 0 END) as spare,
        SUM(CASE WHEN status='REPAIRING' THEN 1 ELSE 0 END) as repairing,
        SUM(CASE WHEN status='DISPOSAL' THEN 1 ELSE 0 END) as disposal,
        SUM(CASE WHEN status='RETURNED' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN is_lifespan_over=1 AND status != 'RETURNED' THEN 1 ELSE 0 END) as lifespan_over,
        SUM(CASE WHEN category IN ('FLOWMETER', 'WATER_LEVEL') AND status != 'RETURNED' AND calib_status IN ('overdue', 'due_soon') THEN 1 ELSE 0 END) as calib_need_total,
        SUM(CASE WHEN category='FLOWMETER' AND status != 'RETURNED' AND calib_status IN ('overdue', 'due_soon') THEN 1 ELSE 0 END) as flow_calib_need,
        SUM(CASE WHEN category='WATER_LEVEL' AND status != 'RETURNED' AND calib_status IN ('overdue', 'due_soon') THEN 1 ELSE 0 END) as water_calib_need
      FROM equipment_master
    `);

    const categories = await this.all(`
      SELECT 
        category,
        category_name,
        MAX(lifespan_years) as lifespan_years,
        COUNT(*) as total,
        SUM(CASE WHEN status='OPERATING' THEN 1 ELSE 0 END) as operating,
        SUM(CASE WHEN status='SPARE' THEN 1 ELSE 0 END) as spare,
        SUM(CASE WHEN status='REPAIRING' THEN 1 ELSE 0 END) as repairing,
        SUM(CASE WHEN status='DISPOSAL' THEN 1 ELSE 0 END) as disposal,
        SUM(CASE WHEN status='RETURNED' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN is_lifespan_over=1 AND status != 'RETURNED' THEN 1 ELSE 0 END) as lifespan_over,
        SUM(CASE WHEN status != 'RETURNED' AND calib_status IN ('overdue', 'due_soon') THEN 1 ELSE 0 END) as calib_need
      FROM equipment_master
      GROUP BY category, category_name
      ORDER BY total DESC
    `);

    const calibSummary = await this.all(`
      SELECT
        category,
        category_name,
        COUNT(*) as total,
        SUM(CASE WHEN status='OPERATING' THEN 1 ELSE 0 END) as operating,
        SUM(CASE WHEN status='RETURNED' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN calib_status='overdue' AND status != 'RETURNED' THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN calib_status='due_soon' AND status != 'RETURNED' THEN 1 ELSE 0 END) as due_soon,
        SUM(CASE WHEN calib_status IN ('overdue', 'due_soon') AND status != 'RETURNED' THEN 1 ELSE 0 END) as need_calib,
        SUM(CASE WHEN calib_status IN ('overdue', 'due_soon') AND status != 'RETURNED' AND calib_cert_no != '취득·설치일 기준' THEN 1 ELSE 0 END) as need_calib_cert,
        SUM(CASE WHEN calib_status='valid' AND status != 'RETURNED' THEN 1 ELSE 0 END) as valid,
        SUM(CASE WHEN (calib_status='none' OR calib_status IS NULL OR recent_calib_date IS NULL OR recent_calib_date = '') AND status != 'RETURNED' THEN 1 ELSE 0 END) as no_record,
        SUM(CASE WHEN calib_expire_date LIKE '2027%' AND status != 'RETURNED' THEN 1 ELSE 0 END) as due_2027
      FROM equipment_master
      WHERE category IN ('FLOWMETER', 'WATER_LEVEL')
      GROUP BY category, category_name
    `);

    const flowModels = await this.all(`
      SELECT 
        model_name,
        CASE 
          WHEN model_name IN ('RG-30D', 'RQ-30D', 'RQ-30', 'ESVFlow') THEN '비접촉식 (전자파표면)'
          ELSE '접촉식 (초음파도플러/ADVM)'
        END as method,
        COUNT(*) as total,
        SUM(CASE WHEN status='OPERATING' THEN 1 ELSE 0 END) as operating,
        SUM(CASE WHEN status='SPARE' THEN 1 ELSE 0 END) as spare,
        SUM(CASE WHEN status='REPAIRING' THEN 1 ELSE 0 END) as repairing,
        SUM(CASE WHEN status='DISPOSAL' THEN 1 ELSE 0 END) as disposal,
        SUM(CASE WHEN status='RETURNED' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN is_lifespan_over=1 AND status != 'RETURNED' THEN 1 ELSE 0 END) as lifespan_over,
        SUM(CASE WHEN calib_status IN ('overdue', 'due_soon') AND status != 'RETURNED' THEN 1 ELSE 0 END) as calib_need,
        SUM(CASE WHEN calib_status='valid' AND status != 'RETURNED' THEN 1 ELSE 0 END) as calib_valid,
        SUM(CASE WHEN (calib_status='none' OR calib_status IS NULL OR recent_calib_date IS NULL OR recent_calib_date = '') AND status != 'RETURNED' THEN 1 ELSE 0 END) as calib_none
      FROM equipment_master
      WHERE category='FLOWMETER'
      GROUP BY model_name
      ORDER BY total DESC
    `);

    const waterModels = await this.all(`
      SELECT 
        CASE 
          WHEN model_name IS NULL OR TRIM(model_name) = '' OR model_name = '-' THEN '기타/미지정'
          ELSE model_name
        END as clean_model,
        CASE 
          WHEN model_name LIKE '%VEGA%' THEN '비접촉식 (레이더)'
          ELSE '접촉식 (압력/수압)'
        END as method,
        COUNT(*) as total,
        SUM(CASE WHEN status='OPERATING' THEN 1 ELSE 0 END) as operating,
        SUM(CASE WHEN status='SPARE' THEN 1 ELSE 0 END) as spare,
        SUM(CASE WHEN status='REPAIRING' THEN 1 ELSE 0 END) as repairing,
        SUM(CASE WHEN status='DISPOSAL' THEN 1 ELSE 0 END) as disposal,
        SUM(CASE WHEN status='RETURNED' THEN 1 ELSE 0 END) as returned,
        SUM(CASE WHEN is_lifespan_over=1 AND status != 'RETURNED' THEN 1 ELSE 0 END) as lifespan_over,
        SUM(CASE WHEN calib_status IN ('overdue', 'due_soon') AND status != 'RETURNED' THEN 1 ELSE 0 END) as calib_need,
        SUM(CASE WHEN calib_status='valid' AND status != 'RETURNED' THEN 1 ELSE 0 END) as calib_valid,
        SUM(CASE WHEN (calib_status='none' OR calib_status IS NULL OR recent_calib_date IS NULL OR recent_calib_date = '') AND status != 'RETURNED' THEN 1 ELSE 0 END) as calib_none
      FROM equipment_master
      WHERE category='WATER_LEVEL'
      GROUP BY clean_model
      ORDER BY total DESC
    `);

    const regions = await this.all(`
      SELECT 
        COALESCE(s.region, '본원/미배정') as region,
        COUNT(e.id) as total_devices,
        SUM(CASE WHEN e.category='FLOWMETER' THEN 1 ELSE 0 END) as flow_count,
        SUM(CASE WHEN e.category='WATER_LEVEL' THEN 1 ELSE 0 END) as water_count,
        SUM(CASE WHEN e.status='OPERATING' THEN 1 ELSE 0 END) as operating_count,
        SUM(CASE WHEN e.status='SPARE' THEN 1 ELSE 0 END) as spare_count,
        SUM(CASE WHEN e.status='REPAIRING' THEN 1 ELSE 0 END) as repairing_count,
        COUNT(DISTINCT s.id) as station_count
      FROM equipment_master e
      LEFT JOIN stations s ON e.station_id = s.id
      GROUP BY region
      ORDER BY total_devices DESC
    `);

    const repairsCount = await this.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN stage='수리중' OR stage='접수' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN stage='수리완료' OR stage='반입·재설치' THEN 1 ELSE 0 END) as completed
      FROM equipment_repair
    `);

    const actionsCount = await this.get(`
      SELECT COUNT(*) as total FROM equipment_action
    `);

    const calibCount = await this.get(`
      SELECT COUNT(*) as total FROM stations WHERE calib_2026=1
    `);

    return {
      overview: {
        ...overview,
        active_repairs: (repairsCount && repairsCount.in_progress) || 0,
        calib_stations: (calibCount && calibCount.total) || 0,
        total_actions: (actionsCount && actionsCount.total) || 0
      },
      calibSummary,
      categories,
      flowModels,
      waterModels,
      regions
    };
  }

  /**
   * 1. Get Stations Summary with Aggregated Equipment Counts
   */
  async getStationsSummary(filters = {}) {
    const { search = "", region = "all", filterType = "all" } = filters;

    // Base stations query
    let sql = `
      SELECT 
        s.id, s.name, s.code, s.region, s.river, s.address,
        s.install_year, s.is_operating,
        s.gauge_type, s.is_dual, s.advm_count, s.ewsv_count,
        s.calib_2026, s.calib_count, s.calib_status, s.calib_date,
        COUNT(e.id) as total_devices,
        SUM(CASE WHEN e.category = 'FLOWMETER' AND e.status = 'OPERATING' THEN 1 ELSE 0 END) as flowmeter_count,
        SUM(CASE WHEN e.category = 'WATER_LEVEL' AND e.status = 'OPERATING' THEN 1 ELSE 0 END) as waterlevel_count,
        SUM(CASE WHEN e.status = 'REPAIRING' THEN 1 ELSE 0 END) as repairing_count,
        SUM(CASE WHEN e.status = 'SPARE' THEN 1 ELSE 0 END) as spare_count,
        SUM(CASE WHEN e.is_lifespan_over = 1 THEN 1 ELSE 0 END) as lifespan_over_count,
        SUM(CASE WHEN e.category IN ('FLOWMETER', 'WATER_LEVEL') AND e.calib_status IN ('overdue', 'due_soon') THEN 1 ELSE 0 END) as calib_due_count,
        (SELECT COUNT(*) FROM equipment_work w WHERE w.station_id = s.id) as work_count
      FROM stations s
      LEFT JOIN equipment_master e ON s.id = e.station_id
      WHERE 1=1
    `;
    const params = [];

    if (region && region !== "all") {
      sql += ` AND s.region LIKE ?`;
      params.push(`%${region}%`);
    }

    if (search) {
      const q = `%${search.toLowerCase()}%`;
      sql += ` AND (LOWER(s.name) LIKE ? OR LOWER(s.code) LIKE ? OR LOWER(s.river) LIKE ?)`;
      params.push(q, q, q);
    }

    sql += ` GROUP BY s.id ORDER BY s.id ASC`;

    let rows = await this.all(sql, params);

    // Filter by quick status filter
    if (filterType === "calib" || filterType === "calib2026") {
      rows = rows.filter(r => r.calib_2026 === 1 || (r.calib_due_count || 0) > 0);
    } else if (filterType === "calibDue") {
      rows = rows.filter(r => (r.calib_due_count || 0) > 0);
    } else if (filterType === "lifespanOver") {
      rows = rows.filter(r => (r.lifespan_over_count || 0) > 0);
    } else if (filterType === "flow") {
      rows = rows.filter(r => (r.flowmeter_count || 0) > 0);
    } else if (filterType === "water") {
      rows = rows.filter(r => (r.waterlevel_count || 0) > 0);
    } else if (filterType === "repair" || filterType === "inRepair") {
      rows = rows.filter(r => (r.repairing_count || 0) > 0);
    } else if (filterType === "spare") {
      rows = rows.filter(r => (r.spare_count || 0) > 0);
    } else if (filterType === "operating") {
      rows = rows.filter(r => (r.total_devices || 0) > 0);
    } else if (filterType === "planned" || filterType === "new2026") {
      rows = rows.filter(r => (r.total_devices || 0) === 0 || r.install_year === "2026");
    } else if (filterType === "hasHistory") {
      rows = rows.filter(r => (r.work_count || 0) > 0);
    }

    return rows;
  }

  /**
   * 2. Get Single Station Detailed Equipment, Recent Works, and Repairs
   */
  async getStationDetails(stationId) {
    const station = await this.get(`SELECT * FROM stations WHERE id = ?`, [stationId]);
    if (!station) return null;

    // Devices linked to this station
    const devices = await this.all(
      `SELECT * FROM equipment_master WHERE station_id = ? ORDER BY category ASC, id ASC`,
      [stationId]
    );

    const operatingDevices = devices.filter(d => d.status === "OPERATING");
    const otherDevices = devices.filter(d => d.status !== "OPERATING");

    // Works & Actions
    const works = await this.all(
      `SELECT * FROM equipment_work WHERE station_id = ? ORDER BY work_date DESC, id DESC LIMIT 20`,
      [stationId]
    );

    for (const w of works) {
      w.actions = await this.all(
        `SELECT * FROM equipment_action WHERE work_id = ? ORDER BY id ASC`,
        [w.id]
      );
    }

    // Active Repairs
    const repairs = await this.all(
      `SELECT * FROM equipment_repair WHERE station_id = ? ORDER BY id DESC`,
      [stationId]
    );

    return {
      station,
      operatingDevices,
      otherDevices,
      totalCount: devices.length,
      works,
      repairs
    };
  }

  /**
   * 3. Search and List Devices Across All Stations
   */
  async getDevices(filters = {}) {
    const {
      search = "",
      stationId = null,
      category = "all",
      status = "all",
      isOver = "all",
      calibFilter = "all",
      calibOnly = false,
      sortBy = "station_code",
      sortOrder = "asc",
      page = 1,
      limit = 50
    } = filters;

    let whereClause = "WHERE 1=1";
    const params = [];

    if (stationId) {
      whereClause += " AND station_id = ?";
      params.push(stationId);
    }

    if (category && String(category).toLowerCase() !== "all") {
      if (category === "FLOW_WATER") {
        whereClause += " AND category IN ('FLOWMETER', 'WATER_LEVEL')";
      } else {
        whereClause += " AND category = ?";
        params.push(category);
      }
    }

    if (status && String(status).toLowerCase() !== "all") {
      if (status === "UNASSIGNED") {
        whereClause += " AND (station_id IS NULL OR station_name IS NULL OR TRIM(station_name) = '')";
      } else {
        whereClause += " AND status = ?";
        params.push(status);
      }
    }

    if (isOver === "1" || isOver === "OVER" || isOver === "true") {
      whereClause += " AND is_lifespan_over = 1";
    } else if (isOver === "0" || isOver === "WITHIN" || isOver === "false") {
      whereClause += " AND is_lifespan_over = 0";
    }

    const cf = String(calibFilter || "all").toUpperCase();
    if (cf === "NEED_ALL" || cf === "NEED_CALIB") {
      whereClause += " AND category IN ('FLOWMETER', 'WATER_LEVEL') AND status != 'RETURNED' AND calib_status IN ('overdue', 'due_soon')";
    } else if (cf === "NEED_CERT") {
      whereClause += " AND category IN ('FLOWMETER', 'WATER_LEVEL') AND status != 'RETURNED' AND calib_status IN ('overdue', 'due_soon') AND calib_cert_no != '취득·설치일 기준'";
    } else if (cf === "OVERDUE") {
      whereClause += " AND category IN ('FLOWMETER', 'WATER_LEVEL') AND status != 'RETURNED' AND calib_status = 'overdue'";
    } else if (cf === "DUE_SOON") {
      whereClause += " AND category IN ('FLOWMETER', 'WATER_LEVEL') AND status != 'RETURNED' AND calib_status = 'due_soon'";
    } else if (cf === "DUE_2027") {
      whereClause += " AND category IN ('FLOWMETER', 'WATER_LEVEL') AND status != 'RETURNED' AND calib_expire_date LIKE '2027%'";
    } else if (cf === "VALID") {
      whereClause += " AND category IN ('FLOWMETER', 'WATER_LEVEL') AND status != 'RETURNED' AND calib_status = 'valid'";
    } else if (cf === "NO_RECORD" || cf === "NONE" || cf === "UNINSPECTED") {
      whereClause += " AND category IN ('FLOWMETER', 'WATER_LEVEL') AND status != 'RETURNED' AND (calib_status = 'none' OR calib_status IS NULL OR recent_calib_date IS NULL OR recent_calib_date = '' OR recent_calib_date = '-')";
    } else if (calibOnly === "1" || calibOnly === "true" || calibOnly === true) {
      whereClause += " AND status != 'RETURNED' AND (calib_status IS NOT NULL AND calib_status != '' AND recent_calib_date != '')";
    }

    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereClause += ` AND (
        LOWER(COALESCE(station_name, '')) LIKE ? OR 
        LOWER(COALESCE(station_code, '')) LIKE ? OR 
        LOWER(COALESCE(model_name, '')) LIKE ? OR 
        LOWER(COALESCE(serial_no, '')) LIKE ? OR 
        LOWER(COALESCE(asset_no, '')) LIKE ? OR 
        LOWER(COALESCE(manage_no, '')) LIKE ? OR 
        LOWER(COALESCE(location, '')) LIKE ? OR
        LOWER(COALESCE(equipment_id, '')) LIKE ? OR
        LOWER(COALESCE(memo, '')) LIKE ?
      )`;
      params.push(q, q, q, q, q, q, q, q, q);
    }

    const countRow = await this.get(`SELECT COUNT(*) as total FROM equipment_master ${whereClause}`, params);
    const total = countRow ? countRow.total : 0;

    const isAll = (String(limit).toLowerCase() === "all" || parseInt(limit, 10) <= 0);
    const parsedLimit = isAll ? (total || 1) : (parseInt(limit, 10) || 50);
    const parsedPage = isAll ? 1 : Math.max(1, parseInt(page, 10) || 1);
    const offset = isAll ? 0 : (parsedPage - 1) * parsedLimit;

    // Default Order: 관측소 코드 오름차순 (station_code ASC)
    // 관측소 코드가 없는 미배정/보관/반납품은 뒤쪽으로 배치
    let orderByClause = "";
    if (sortBy === "id") {
      orderByClause = `ORDER BY id ${String(sortOrder).toLowerCase() === "desc" ? "DESC" : "ASC"}`;
    } else {
      const dir = String(sortOrder).toLowerCase() === "desc" ? "DESC" : "ASC";
      orderByClause = `
        ORDER BY 
          CASE WHEN station_code IS NULL OR TRIM(station_code) = '' THEN 1 ELSE 0 END ASC,
          station_code ${dir},
          CASE WHEN station_name IS NULL OR TRIM(station_name) = '' THEN 1 ELSE 0 END ASC,
          station_name ${dir},
          CASE category 
            WHEN 'FLOWMETER' THEN 1 
            WHEN 'WATER_LEVEL' THEN 2 
            WHEN 'CONTROL' THEN 3 
            WHEN 'CCTV' THEN 4 
            WHEN 'MOUNT' THEN 5 
            WHEN 'SHELTER' THEN 6 
            WHEN 'LIGHTNING' THEN 7 
            WHEN 'UNDERWATER' THEN 8 
            WHEN 'ANCILLARY' THEN 9 
            ELSE 10 
          END ASC,
          id ASC
      `;
    }

    const sql = isAll
      ? `SELECT * FROM equipment_master ${whereClause} ${orderByClause}`
      : `SELECT * FROM equipment_master ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`;

    const queryParams = isAll ? params : [...params, parsedLimit, offset];
    const rows = await this.all(sql, queryParams);

    return {
      total,
      page: parsedPage,
      limit: isAll ? total : parsedLimit,
      totalPages: isAll ? 1 : (Math.ceil(total / parsedLimit) || 1),
      devices: rows
    };
  }

  /**
   * 4. Register a Single New Equipment
   */
  async createDevice(data, user = {}) {
    const countRow = await this.get(`SELECT COUNT(*) as cnt FROM equipment_master`);
    const nextSeq = (countRow ? countRow.cnt : 0) + 1;
    const equipmentId = `EQ-${String(nextSeq).padStart(5, "0")}`;

    let stationName = data.station_name || "";
    let stationCode = data.station_code || "";
    if (data.station_id) {
      const st = await this.get(`SELECT name, code FROM stations WHERE id = ?`, [data.station_id]);
      if (st) {
        stationName = st.name;
        stationCode = st.code;
      }
    }

    let statusLabel = "운영중";
    if (data.status === "SPARE") statusLabel = "예비품";
    else if (data.status === "REPAIRING") statusLabel = "수리중";
    else if (data.status === "DISPOSAL") statusLabel = "폐품";
    else if (data.status === "RETURN") statusLabel = "반납예정";

    const cat = data.category || "FLOWMETER";
    const lc = this.computeLifespanAndCalib(
      cat,
      data.acquisition_date,
      data.lifespan_years,
      data.recent_calib_date,
      data.calib_expire_date,
      data.calib_cert_no
    );

    const sql = `
      INSERT INTO equipment_master (
        equipment_id, station_id, station_name, station_code,
        category, category_name, item_name, manage_no,
        model_name, spec, serial_no, asset_no, asset_no_temp,
        quantity, status, status_label, location,
        acquisition_date, acquisition_cost, lifespan_years,
        lifespan_end_year, is_lifespan_over,
        calib_status, recent_calib_date, calib_cert_no, calib_expire_date,
        memo, source_sheet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '사용자직접등록')
    `;

    const res = await this.run(sql, [
      equipmentId,
      data.station_id || null,
      stationName,
      stationCode,
      cat,
      data.category_name || "유속계",
      data.item_name || data.category_name || "유속계",
      data.manage_no || "",
      data.model_name || "",
      data.spec || "",
      String(data.serial_no || "").trim(),
      String(data.asset_no || "").trim(),
      data.asset_no_temp || "",
      data.quantity || 1,
      data.status || "OPERATING",
      statusLabel,
      data.location || "현장설치",
      lc.acquisition_date,
      data.acquisition_cost || 0,
      lc.lifespan_years,
      lc.lifespan_end_year,
      lc.is_lifespan_over,
      lc.calib_status,
      lc.recent_calib_date,
      lc.calib_cert_no,
      lc.calib_expire_date,
      data.memo || ""
    ]);

    // Audit Log
    await this.run(`
      INSERT INTO equipment_audit_log (equipment_id, field_name, before_value, after_value, changed_by, reason, source)
      VALUES (?, 'CREATE', '', ?, ?, ?, 'UI')
    `, [equipmentId, JSON.stringify(data), user.name || "사용자", "신규 장비 등록"]);

    return { success: true, equipmentId, id: res.lastID };
  }

  /**
   * 4-1. Get Single Equipment Detail with Audit History & Active Repair & Calibration History
   */
  async getDeviceById(equipmentId) {
    const device = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [equipmentId]);
    if (!device) return null;

    const auditLogs = await this.all(
      `SELECT * FROM equipment_audit_log WHERE equipment_id = ? ORDER BY id DESC LIMIT 15`,
      [equipmentId]
    );
    const activeRepair = await this.get(
      `SELECT * FROM equipment_repair WHERE equipment_id = ? ORDER BY id DESC LIMIT 1`,
      [equipmentId]
    );
    const calibrationHistory = await this.all(
      `SELECT * FROM equipment_calibration_history WHERE equipment_id = ? ORDER BY calib_date DESC, id DESC`,
      [equipmentId]
    );

    return {
      device,
      auditLogs,
      activeRepair,
      calibrationHistory
    };
  }

  /**
   * Helper: Synchronize device recent_calib_date, calib_expire_date, calib_cert_no, calib_status with latest calibration history
   */
  async syncDeviceLatestCalibration(equipmentId) {
    const dev = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [equipmentId]);
    if (!dev) return;

    const latest = await this.get(
      `SELECT * FROM equipment_calibration_history WHERE equipment_id = ? ORDER BY calib_date DESC, id DESC LIMIT 1`,
      [equipmentId]
    );

    if (!latest) {
      await this.run(
        `UPDATE equipment_master 
         SET recent_calib_date = NULL, calib_expire_date = NULL, calib_cert_no = NULL, calib_status = 'none', updated_at = CURRENT_TIMESTAMP
         WHERE equipment_id = ?`,
        [equipmentId]
      );
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const refToday = todayStr < "2026-11-03" ? "2026-11-03" : todayStr;
    let calibStatus = "valid";
    if (latest.expire_date < refToday) {
      calibStatus = "overdue";
    } else if (latest.expire_date >= "2026-11-03" && latest.expire_date <= "2026-12-31") {
      calibStatus = "due_soon";
    }

    await this.run(
      `UPDATE equipment_master 
       SET recent_calib_date = ?, calib_expire_date = ?, calib_cert_no = ?, calib_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE equipment_id = ?`,
      [latest.calib_date, latest.expire_date, latest.cert_no || "", calibStatus, equipmentId]
    );
  }

  /**
   * 4-1b. Get Calibration History for Equipment
   */
  async getDeviceCalibrations(equipmentId) {
    return await this.all(
      `SELECT * FROM equipment_calibration_history WHERE equipment_id = ? ORDER BY calib_date DESC, id DESC`,
      [equipmentId]
    );
  }

  /**
   * 4-1c. Add New Calibration Record for Equipment
   */
  async addCalibrationRecord(equipmentId, data = {}, user = {}) {
    const dev = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [equipmentId]);
    if (!dev) throw new Error("장비를 찾을 수 없습니다.");

    const cycle = this.getCalibCycleYears(dev.category) || 2;
    const calibDate = String(data.calib_date || "").trim();
    if (!calibDate) throw new Error("검정 실시일자를 입력해주세요.");

    let expireDate = String(data.expire_date || "").trim();
    if (!expireDate) {
      expireDate = this.addYearsMinusOneDay(calibDate, cycle);
    }

    const agency = String(data.agency || "한국수자원조사기술원").trim();
    const certNo = String(data.cert_no || "").trim();
    const resultStatus = String(data.result_status || "합격").trim();
    const calibCost = parseInt(data.calib_cost, 10) || 0;
    const memo = String(data.memo || "").trim();
    const actor = user.name ? `${user.name} (${user.username || ""})` : (user.username || "관리자");

    const insertRes = await this.run(
      `INSERT INTO equipment_calibration_history 
        (equipment_id, station_id, station_name, category, model_name, serial_no, calib_date, cycle_years, expire_date, agency, cert_no, result_status, calib_cost, memo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        equipmentId,
        dev.station_id || null,
        dev.station_name || "",
        dev.category,
        dev.model_name || "",
        dev.serial_no || "",
        calibDate,
        cycle,
        expireDate,
        agency,
        certNo,
        resultStatus,
        calibCost,
        memo,
        actor
      ]
    );

    // Synchronize latest calibration state onto equipment_master
    await this.syncDeviceLatestCalibration(equipmentId);

    // Audit log
    await this.run(
      `INSERT INTO equipment_audit_log (equipment_id, field_name, before_value, after_value, changed_by, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        equipmentId,
        "검정이력등록",
        dev.recent_calib_date || "-",
        `${calibDate} (~${expireDate}) / ${resultStatus} [성적서:${certNo || "-"}]`,
        actor,
        memo || "새 법정 검정 결과 등록"
      ]
    );

    return {
      success: true,
      historyId: insertRes.lastID,
      message: "검정 이력이 등록되고 장비 상태가 갱신되었습니다."
    };
  }

  /**
   * 4-1d. Update Existing Calibration Record
   */
  async updateCalibrationRecord(historyId, data = {}, user = {}) {
    const existing = await this.get(`SELECT * FROM equipment_calibration_history WHERE id = ?`, [historyId]);
    if (!existing) throw new Error("수정할 검정 이력을 찾을 수 없습니다.");

    const calibDate = data.calib_date || existing.calib_date;
    const cycle = parseInt(data.cycle_years, 10) || existing.cycle_years || 2;
    let expireDate = data.expire_date || existing.expire_date;
    if (data.calib_date && !data.expire_date) {
      expireDate = this.addYearsMinusOneDay(calibDate, cycle);
    }
    const agency = data.agency !== undefined ? data.agency : existing.agency;
    const certNo = data.cert_no !== undefined ? data.cert_no : existing.cert_no;
    const resultStatus = data.result_status !== undefined ? data.result_status : existing.result_status;
    const calibCost = data.calib_cost !== undefined ? parseInt(data.calib_cost, 10) : existing.calib_cost;
    const memo = data.memo !== undefined ? data.memo : existing.memo;

    await this.run(
      `UPDATE equipment_calibration_history 
       SET calib_date = ?, cycle_years = ?, expire_date = ?, agency = ?, cert_no = ?, result_status = ?, calib_cost = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [calibDate, cycle, expireDate, agency, certNo, resultStatus, calibCost, memo, historyId]
    );

    await this.syncDeviceLatestCalibration(existing.equipment_id);

    return {
      success: true,
      message: "검정 이력이 수정되었습니다."
    };
  }

  /**
   * 4-1e. Delete Calibration Record
   */
  async deleteCalibrationRecord(historyId, user = {}) {
    const existing = await this.get(`SELECT * FROM equipment_calibration_history WHERE id = ?`, [historyId]);
    if (!existing) throw new Error("삭제할 검정 이력을 찾을 수 없습니다.");

    await this.run(`DELETE FROM equipment_calibration_history WHERE id = ?`, [historyId]);
    await this.syncDeviceLatestCalibration(existing.equipment_id);

    return {
      success: true,
      message: "검정 이력이 삭제되었습니다."
    };
  }

  /**
   * 4-2. Update Single Equipment Full Details (Model, S/N, Asset No, Station, Status, Location, Lifespan, Calibration, Memo)
   */
  async updateDevice(equipmentId, data = {}, user = {}) {
    const current = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [equipmentId]);
    if (!current) throw new Error("장비를 찾을 수 없습니다.");

    const catNameMap = {
      FLOWMETER: "유속계",
      WATER_LEVEL: "수위계",
      CONTROL: "제어시스템",
      MOUNT: "센서지지대",
      SHELTER: "관측국사",
      UNDERWATER: "수중센서보호장치",
      LIGHTNING: "낙뢰보호장치",
      CCTV: "영상정보처리기기",
      ANCILLARY: "부대시설",
      ETC: "기타"
    };

    const statusLabelMap = {
      OPERATING: "운영중",
      SPARE: "예비품",
      REPAIRING: "수리중",
      DISPOSAL: "폐품",
      RETURNED: "자산반납",
      RETURN: "반납완료"
    };

    // Resolve station assignment
    let stationId = current.station_id;
    let stationName = current.station_name || "";
    let stationCode = current.station_code || "";

    if (data.station_id !== undefined) {
      if (data.station_id === null || data.station_id === "" || data.station_id === "null") {
        stationId = null;
        stationName = "";
        stationCode = "";
      } else {
        const parsedStId = parseInt(data.station_id, 10);
        const st = await this.get(`SELECT id, name, code FROM stations WHERE id = ?`, [parsedStId]);
        if (st) {
          stationId = st.id;
          stationName = st.name;
          stationCode = st.code;
        }
      }
    }

    const newCategory = data.category || current.category || "FLOWMETER";
    const newCategoryName = data.category_name || catNameMap[newCategory] || current.category_name || "유속계";
    const newModel = data.model_name !== undefined ? String(data.model_name).trim() : (current.model_name || "");
    const newSerial = data.serial_no !== undefined ? String(data.serial_no).trim() : (current.serial_no || "");
    const newAsset = data.asset_no !== undefined ? String(data.asset_no).trim() : (current.asset_no || "");
    const newStatus = data.status || current.status || "OPERATING";
    const newStatusLabel = statusLabelMap[newStatus] || "운영중";
    const newLocation = data.location !== undefined ? String(data.location).trim() : (current.location || "");
    const rawAcqDate = data.acquisition_date !== undefined ? (data.acquisition_date ? String(data.acquisition_date).trim() : "") : (current.acquisition_date || "");
    const rawLifespanYears = data.lifespan_years !== undefined ? data.lifespan_years : (newCategory !== current.category ? this.getStandardLifespan(newCategory) : current.lifespan_years);
    const rawRecentCalib = data.recent_calib_date !== undefined ? (data.recent_calib_date ? String(data.recent_calib_date).trim() : "") : (current.recent_calib_date || "");
    const rawExpireCalib = data.calib_expire_date !== undefined ? (data.calib_expire_date ? String(data.calib_expire_date).trim() : "") : (current.calib_expire_date || "");
    const rawCertNo = data.calib_cert_no !== undefined ? (data.calib_cert_no ? String(data.calib_cert_no).trim() : "") : (current.calib_cert_no || "");

    const lc = this.computeLifespanAndCalib(
      newCategory,
      rawAcqDate,
      rawLifespanYears,
      rawRecentCalib,
      rawExpireCalib,
      rawCertNo
    );

    const newMemo = data.memo !== undefined ? String(data.memo).trim() : (current.memo || "");
    const reason = data.reason ? String(data.reason).trim() : "장비 정보/상태 직접 수정";

    // Track changes for audit log
    const changes = [];
    const comparePairs = [
      ["category_name", "설비구분", current.category_name || "", newCategoryName],
      ["model_name", "모델명", current.model_name || "", newModel],
      ["serial_no", "제조번호(S/N)", current.serial_no || "", newSerial],
      ["asset_no", "자산번호", current.asset_no || "", newAsset],
      ["station_name", "배정관측소", current.station_name || "미배정(보관)", stationName || "미배정(보관)"],
      ["status", "운영상태", `${current.status_label || current.status}`, `${newStatusLabel}(${newStatus})`],
      ["location", "보관/설치위치", current.location || "", newLocation],
      ["acquisition_date", "취득년도", current.acquisition_date || "", lc.acquisition_date],
      ["lifespan_years", "내용연수(년)", String(current.lifespan_years || ""), String(lc.lifespan_years || "")],
      ["recent_calib_date", "최근검정일", current.recent_calib_date || "", lc.recent_calib_date],
      ["calib_expire_date", "검정만료일", current.calib_expire_date || "", lc.calib_expire_date],
      ["memo", "비고", current.memo || "", newMemo]
    ];

    for (const [field, label, beforeVal, afterVal] of comparePairs) {
      if (String(beforeVal).trim() !== String(afterVal).trim()) {
        changes.push({ field, label, before: String(beforeVal).trim(), after: String(afterVal).trim() });
      }
    }

    await this.run(`
      UPDATE equipment_master
      SET station_id = ?, station_name = ?, station_code = ?,
          category = ?, category_name = ?,
          model_name = ?, serial_no = ?, asset_no = ?,
          status = ?, status_label = ?, location = ?,
          acquisition_date = ?, lifespan_years = ?, lifespan_end_year = ?, is_lifespan_over = ?,
          calib_status = ?, recent_calib_date = ?, calib_expire_date = ?, calib_cert_no = ?,
          memo = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE equipment_id = ?
    `, [
      stationId, stationName, stationCode,
      newCategory, newCategoryName,
      newModel, newSerial, newAsset,
      newStatus, newStatusLabel, newLocation,
      lc.acquisition_date, lc.lifespan_years, lc.lifespan_end_year, lc.is_lifespan_over,
      lc.calib_status, lc.recent_calib_date, lc.calib_expire_date, lc.calib_cert_no,
      newMemo,
      equipmentId
    ]);

    for (const ch of changes) {
      await this.run(`
        INSERT INTO equipment_audit_log (equipment_id, field_name, before_value, after_value, changed_by, reason, source)
        VALUES (?, ?, ?, ?, ?, ?, 'UI')
      `, [equipmentId, ch.label, ch.before, ch.after, user.name || "사용자", reason]);
    }

    const updated = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [equipmentId]);
    return {
      success: true,
      equipmentId,
      changesCount: changes.length,
      changes,
      device: updated
    };
  }

  /**
   * 5. Update Equipment Status & Location (& Optional Station) with Audit Log
   */
  async updateDeviceStatus(equipmentId, newStatus, newLocation, reason = "", user = {}, stationId = undefined) {
    const current = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [equipmentId]);
    if (!current) throw new Error("장비를 찾을 수 없습니다.");

    let statusLabel = "운영중";
    if (newStatus === "SPARE") statusLabel = "예비품";
    else if (newStatus === "REPAIRING") statusLabel = "수리중";
    else if (newStatus === "DISPOSAL") statusLabel = "폐품";
    else if (newStatus === "RETURN") statusLabel = "반납예정";

    let targetStationId = current.station_id;
    let targetStationName = current.station_name || "";
    let targetStationCode = current.station_code || "";

    if (stationId !== undefined) {
      if (stationId === null || stationId === "" || stationId === "null") {
        targetStationId = null;
        targetStationName = "";
        targetStationCode = "";
      } else {
        const st = await this.get(`SELECT id, name, code FROM stations WHERE id = ?`, [parseInt(stationId, 10)]);
        if (st) {
          targetStationId = st.id;
          targetStationName = st.name;
          targetStationCode = st.code;
        }
      }
    }

    await this.run(`
      UPDATE equipment_master 
      SET station_id = ?, station_name = ?, station_code = ?,
          status = ?, status_label = ?, location = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE equipment_id = ?
    `, [
      targetStationId,
      targetStationName,
      targetStationCode,
      newStatus,
      statusLabel,
      newLocation !== undefined ? newLocation : current.location,
      equipmentId
    ]);

    // Audit Log
    await this.run(`
      INSERT INTO equipment_audit_log (equipment_id, field_name, before_value, after_value, changed_by, reason, source)
      VALUES (?, 'STATUS', ?, ?, ?, ?, 'UI')
    `, [
      equipmentId,
      `${current.status_label || current.status} (${current.station_name || "미배정"} / ${current.location || "-"})`,
      `${statusLabel} (${targetStationName || "미배정"} / ${newLocation || current.location || "-"})`,
      user.name || "사용자",
      reason || "상태 변경"
    ]);

    return { success: true, equipmentId, newStatus, statusLabel, stationId: targetStationId, stationName: targetStationName };
  }

  /**
   * 6. Create Field Work & Structured Actions (With Smart Equipment State Switching)
   */
  async createWork(workData, user = {}) {
    const {
      station_id,
      work_date,
      work_type = "정기점검",
      workers = "",
      summary = "",
      detail_raw = "",
      actions = [],
      applySmartSwitch = true
    } = workData;

    let stationName = "";
    let stationCode = "";
    if (station_id) {
      const st = await this.get(`SELECT name, code FROM stations WHERE id = ?`, [station_id]);
      if (st) {
        stationName = st.name;
        stationCode = st.code;
      }
    }

    const maxRow = await this.get(`SELECT COALESCE(MAX(id), 0) as maxId FROM equipment_work`);
    const nextSeq = (maxRow ? maxRow.maxId : 0) + 1;
    const workNo = `WRK-2026-${String(nextSeq).padStart(4, "0")}`;

    const computedDetailRaw = detail_raw || actions.map(a => a.detail_text || a.action_name || "").filter(Boolean).join(", ");

    const workRes = await this.run(`
      INSERT INTO equipment_work (
        work_no, station_id, station_name, station_code,
        work_date, work_type, workers, summary, detail_raw, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      workNo, station_id || null, stationName, stationCode,
      work_date || new Date().toISOString().split("T")[0],
      work_type, workers, summary || `[${work_type}] 현장 조치 등록`,
      computedDetailRaw, user.name || "사용자"
    ]);

    const workId = workRes.lastID;

    // Process each structured action
    for (const act of actions) {
      await this.run(`
        INSERT INTO equipment_action (
          work_id, equipment_id, action_category, action_code, action_name,
          before_model, before_sn, after_model, after_sn,
          part_name, part_qty, param_change, detail_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        workId,
        act.equipment_id || null,
        act.action_category || "단순점검",
        act.action_code || "NORMAL_CHECK",
        act.action_name || "종합 점검 및 정상 확인",
        act.before_model || "",
        act.before_sn || "",
        act.after_model || "",
        act.after_sn || "",
        act.part_name || "",
        act.part_qty || 1,
        act.param_change || "",
        act.detail_text || ""
      ]);

      // Smart State Switching for Equipment Replacements & New Installs
      if (applySmartSwitch && ["REPLACE_FLOW", "REPLACE_WATER", "INSTALL_FLOW", "INSTALL_WATER"].includes(act.action_code)) {
        // 1. If old equipment S/N exists, move it to REPAIRING or SPARE
        if (act.before_sn) {
          const oldDev = await this.get(`SELECT equipment_id, status FROM equipment_master WHERE serial_no = ?`, [act.before_sn]);
          if (oldDev) {
            await this.updateDeviceStatus(
              oldDev.equipment_id,
              "REPAIRING",
              "기술원/수리업체(회수)",
              `현장 교체로 인한 회수 (${workNo})`,
              user
            );
          }
        }

        // 2. If new equipment S/N exists in inventory, assign to this station & set OPERATING
        if (act.after_sn) {
          const newDev = await this.get(`SELECT equipment_id FROM equipment_master WHERE serial_no = ?`, [act.after_sn]);
          if (newDev) {
            await this.run(`
              UPDATE equipment_master
              SET station_id = ?, station_name = ?, station_code = ?,
                  status = 'OPERATING', status_label = '운영중', location = '현장설치',
                  version = version + 1, updated_at = CURRENT_TIMESTAMP
              WHERE equipment_id = ?
            `, [station_id, stationName, stationCode, newDev.equipment_id]);

            await this.run(`
              INSERT INTO equipment_audit_log (equipment_id, field_name, before_value, after_value, changed_by, reason, source)
              VALUES (?, 'DEPLOY', '예비품', ?, ?, ?, 'UI')
            `, [newDev.equipment_id, `현장 설치 (${stationName})`, user.name || "사용자", `현장 교체 배치 (${workNo})`]);
          }
        }
      }
    }

    return { success: true, workId, workNo };
  }

  /**
   * 6-1. Get Single Field Work & Its Structured Actions
   */
  async getWorkById(workId) {
    const work = await this.get(`SELECT * FROM equipment_work WHERE id = ?`, [workId]);
    if (!work) return null;

    const actions = await this.all(
      `SELECT * FROM equipment_action WHERE work_id = ? ORDER BY id ASC`,
      [workId]
    );
    return { work, actions };
  }

  /**
   * 6-2. Update Existing Field Work & Its Structured Actions
   */
  async updateWork(workId, workData = {}, user = {}) {
    const existing = await this.get(`SELECT * FROM equipment_work WHERE id = ?`, [workId]);
    if (!existing) throw new Error("수정할 현장 점검·조치 이력을 찾을 수 없습니다.");

    let stationId = existing.station_id;
    let stationName = existing.station_name || "";
    let stationCode = existing.station_code || "";

    if (workData.station_id !== undefined && workData.station_id !== null && workData.station_id !== "") {
      const parsedStId = parseInt(workData.station_id, 10);
      const st = await this.get(`SELECT id, name, code FROM stations WHERE id = ?`, [parsedStId]);
      if (st) {
        stationId = st.id;
        stationName = st.name;
        stationCode = st.code;
      }
    }

    const workDate = workData.work_date || existing.work_date;
    const workType = workData.work_type || existing.work_type || "수시점검";
    const workers = workData.workers !== undefined ? String(workData.workers).trim() : (existing.workers || "");
    const actions = Array.isArray(workData.actions) ? workData.actions : [];
    const applySmartSwitch = Boolean(workData.applySmartSwitch);

    let summary = workData.summary !== undefined ? String(workData.summary).trim() : (existing.summary || "");
    if (!summary && actions.length > 0) {
      const firstAct = actions[0];
      const extraCnt = actions.length > 1 ? ` 외 ${actions.length - 1}건` : "";
      summary = `[${workType}] ${firstAct.action_name || "현장 조치"}${extraCnt}`;
    }

    const detailRaw = actions.map(a => a.detail_text || a.action_name || "").filter(Boolean).join(", ") || existing.detail_raw || "";

    await this.run(`
      UPDATE equipment_work
      SET station_id = ?, station_name = ?, station_code = ?,
          work_date = ?, work_type = ?, workers = ?,
          summary = ?, detail_raw = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      stationId, stationName, stationCode,
      workDate, workType, workers,
      summary, detailRaw, workId
    ]);

    // Sync actions for this work_id
    const existingActions = await this.all(`SELECT * FROM equipment_action WHERE work_id = ? ORDER BY id ASC`, [workId]);
    const existingMap = new Map(existingActions.map(a => [Number(a.id), a]));
    const incomingIds = new Set(actions.map(a => Number(a.id)).filter(id => !isNaN(id) && id > 0));

    // Delete removed actions
    for (const oldAct of existingActions) {
      if (!incomingIds.has(Number(oldAct.id))) {
        await this.run(`DELETE FROM equipment_action WHERE id = ? AND work_id = ?`, [oldAct.id, workId]);
      }
    }

    // Update or Insert incoming actions
    for (const act of actions) {
      const actId = Number(act.id);
      const prevAct = (!isNaN(actId) && existingMap.has(actId)) ? existingMap.get(actId) : null;

      const equipmentId = act.equipment_id !== undefined ? (act.equipment_id || null) : (prevAct ? prevAct.equipment_id : null);
      const actionCategory = act.action_category || (prevAct ? prevAct.action_category : "단순점검");
      const actionCode = act.action_code || (prevAct ? prevAct.action_code : "NORMAL_CHECK");
      const actionName = act.action_name || (prevAct ? prevAct.action_name : "종합 점검 및 현장 확인");
      const beforeModel = act.before_model !== undefined ? String(act.before_model).trim() : (prevAct ? prevAct.before_model : "");
      const beforeSn = act.before_sn !== undefined ? String(act.before_sn).trim() : (prevAct ? prevAct.before_sn : "");
      const afterModel = act.after_model !== undefined ? String(act.after_model).trim() : (prevAct ? prevAct.after_model : "");
      const afterSn = act.after_sn !== undefined ? String(act.after_sn).trim() : (prevAct ? prevAct.after_sn : "");
      const partName = act.part_name !== undefined ? String(act.part_name).trim() : (prevAct ? prevAct.part_name : "");
      const partQty = act.part_qty !== undefined && act.part_qty !== "" ? (parseInt(act.part_qty, 10) || 1) : (prevAct ? prevAct.part_qty : 1);
      const paramChange = act.param_change !== undefined ? String(act.param_change).trim() : (prevAct ? prevAct.param_change : "");
      const detailText = act.detail_text !== undefined ? String(act.detail_text).trim() : (prevAct ? prevAct.detail_text : "");

      if (prevAct) {
        await this.run(`
          UPDATE equipment_action
          SET equipment_id = ?, action_category = ?, action_code = ?, action_name = ?,
              before_model = ?, before_sn = ?, after_model = ?, after_sn = ?,
              part_name = ?, part_qty = ?, param_change = ?, detail_text = ?
          WHERE id = ? AND work_id = ?
        `, [
          equipmentId, actionCategory, actionCode, actionName,
          beforeModel, beforeSn, afterModel, afterSn,
          partName, partQty, paramChange, detailText,
          prevAct.id, workId
        ]);
      } else {
        await this.run(`
          INSERT INTO equipment_action (
            work_id, equipment_id, action_category, action_code, action_name,
            before_model, before_sn, after_model, after_sn,
            part_name, part_qty, param_change, detail_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          workId, equipmentId, actionCategory, actionCode, actionName,
          beforeModel, beforeSn, afterModel, afterSn,
          partName, partQty, paramChange, detailText
        ]);
      }

      if (applySmartSwitch && ["REPLACE_FLOW", "REPLACE_WATER", "INSTALL_FLOW", "INSTALL_WATER"].includes(actionCode)) {
        if (beforeSn) {
          const oldDev = await this.get(`SELECT equipment_id FROM equipment_master WHERE serial_no = ?`, [beforeSn]);
          if (oldDev) {
            await this.updateDeviceStatus(
              oldDev.equipment_id,
              "REPAIRING",
              "기술원/수리업체(회수)",
              `현장 교체 이력 수정 반영 (${existing.work_no})`,
              user
            );
          }
        }
        if (afterSn) {
          const newDev = await this.get(`SELECT equipment_id FROM equipment_master WHERE serial_no = ?`, [afterSn]);
          if (newDev) {
            await this.run(`
              UPDATE equipment_master
              SET station_id = ?, station_name = ?, station_code = ?,
                  status = 'OPERATING', status_label = '운영중', location = '현장설치',
                  version = version + 1, updated_at = CURRENT_TIMESTAMP
              WHERE equipment_id = ?
            `, [stationId, stationName, stationCode, newDev.equipment_id]);
          }
        }
      }
    }

    return {
      success: true,
      workId,
      workNo: existing.work_no,
      stationId,
      stationName,
      summary
    };
  }

  /**
   * 6-3. Delete Entire Field Work & Its Actions
   */
  async deleteWork(workId) {
    const existing = await this.get(`SELECT * FROM equipment_work WHERE id = ?`, [workId]);
    if (!existing) throw new Error("삭제할 현장 점검·조치 이력을 찾을 수 없습니다.");

    await this.run(`DELETE FROM equipment_action WHERE work_id = ?`, [workId]);
    await this.run(`DELETE FROM equipment_work WHERE id = ?`, [workId]);

    return {
      success: true,
      workId,
      workNo: existing.work_no,
      stationId: existing.station_id,
      stationName: existing.station_name,
      summary: existing.summary
    };
  }

  /**
   * 6-4. Delete Single Structured Action (and parent work if no actions remain)
   */
  async deleteAction(actionId) {
    const act = await this.get(`SELECT * FROM equipment_action WHERE id = ?`, [actionId]);
    if (!act) throw new Error("삭제할 세부 조치 항목을 찾을 수 없습니다.");

    const work = await this.get(`SELECT * FROM equipment_work WHERE id = ?`, [act.work_id]);
    await this.run(`DELETE FROM equipment_action WHERE id = ?`, [actionId]);

    const remaining = await this.all(`SELECT * FROM equipment_action WHERE work_id = ? ORDER BY id ASC`, [act.work_id]);
    if (remaining.length === 0) {
      await this.run(`DELETE FROM equipment_work WHERE id = ?`, [act.work_id]);
    }

    return {
      success: true,
      actionId,
      workId: act.work_id,
      workDeleted: remaining.length === 0,
      stationName: work ? work.station_name : "",
      actionName: act.action_name
    };
  }

  /**
   * 7. List Active Repairs & Kanban
   */
  async getRepairs(filters = {}) {
    const { stage = "all", search = "" } = filters;
    let sql = `SELECT * FROM equipment_repair WHERE 1=1`;
    const params = [];

    if (stage && stage !== "all") {
      sql += ` AND stage = ?`;
      params.push(stage);
    }

    if (search) {
      const q = `%${search.toLowerCase()}%`;
      sql += ` AND (LOWER(equipment_name) LIKE ? OR LOWER(station_name) LIKE ? OR LOWER(vendor) LIKE ?)`;
      params.push(q, q, q);
    }

    sql += ` ORDER BY id DESC`;
    return await this.all(sql, params);
  }

  /**
   * 8. Open a New Repair Case
   */
  async createRepair(repairData, user = {}) {
    const {
      equipment_id,
      vendor = "리버앤씨",
      issue_desc = "",
      received_date,
      target_date,
      cost = 0
    } = repairData;

    const dev = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [equipment_id]);
    if (!dev) throw new Error("장비를 찾을 수 없습니다.");

    const countRow = await this.get(`SELECT COUNT(*) as cnt FROM equipment_repair`);
    const nextSeq = (countRow ? countRow.cnt : 0) + 1;
    const repairNo = `REP-2026-${String(nextSeq).padStart(4, "0")}`;

    const res = await this.run(`
      INSERT INTO equipment_repair (
        repair_no, equipment_id, equipment_name, station_id, station_name,
        stage, vendor, issue_desc, received_date, target_date, cost, created_by
      ) VALUES (?, ?, ?, ?, ?, '접수', ?, ?, ?, ?, ?, ?)
    `, [
      repairNo,
      equipment_id,
      `${dev.model_name} (S/N: ${dev.serial_no})`,
      dev.station_id,
      dev.station_name,
      vendor,
      issue_desc,
      received_date || new Date().toISOString().split("T")[0],
      target_date || "",
      cost || 0,
      user.name || "사용자"
    ]);

    // Mark equipment as REPAIRING
    await this.updateDeviceStatus(equipment_id, "REPAIRING", vendor, `수리 접수 (${repairNo})`, user);

    return { success: true, repairNo, id: res.lastID };
  }

  /**
   * 9. Update Repair Stage (접수 -> 진단중 -> 수리중 -> 수리완료 -> 반입·재설치)
   */
  async updateRepairStage(repairId, newStage, memo = "", completedDate = "", cost = 0, user = {}) {
    const rep = await this.get(`SELECT * FROM equipment_repair WHERE id = ?`, [repairId]);
    if (!rep) throw new Error("수리 건을 찾을 수 없습니다.");

    await this.run(`
      UPDATE equipment_repair
      SET stage = ?, action_memo = ?, completed_date = ?, cost = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newStage, memo || rep.action_memo, completedDate || rep.completed_date, cost || rep.cost, repairId]);

    // If stage is '수리완료', mark equipment as SPARE in technical center
    if (newStage === "수리완료" || newStage === "반입·재설치") {
      await this.updateDeviceStatus(
        rep.equipment_id,
        "SPARE",
        "기술원보관(수리완료)",
        `수리 완료 단계 반영 (${rep.repair_no})`,
        user
      );
    }

    return { success: true, repairId, newStage };
  }

  /**
   * 10. List Actions Across All Stations with Category Filter
   */
  async getActions(filters = {}) {
    const { actionCode = "all", stationId = "all", region = "all", search = "", limit = 1000 } = filters;
    let sql = `
      SELECT 
        a.*, 
        w.work_no, w.work_date, w.station_id, w.station_name, w.station_code, w.work_type, w.workers, w.summary,
        s.region, s.river
      FROM equipment_action a
      JOIN equipment_work w ON a.work_id = w.id
      LEFT JOIN stations s ON w.station_id = s.id
      WHERE 1=1
    `;
    const params = [];

    const normActionCode = (actionCode || "all").toString().trim().toUpperCase();
    if (normActionCode && normActionCode !== "ALL") {
      sql += ` AND UPPER(a.action_code) = ?`;
      params.push(normActionCode);
    }

    const normStationId = (stationId || "all").toString().trim();
    if (normStationId && normStationId.toLowerCase() !== "all") {
      if (!isNaN(Number(normStationId))) {
        sql += ` AND (w.station_id = ? OR w.station_name LIKE ?)`;
        params.push(parseInt(normStationId, 10), `%${normStationId}%`);
      } else {
        sql += ` AND (w.station_name LIKE ? OR s.name LIKE ?)`;
        params.push(`%${normStationId}%`, `%${normStationId}%`);
      }
    }

    const normRegion = (region || "all").toString().trim();
    if (normRegion && normRegion.toLowerCase() !== "all") {
      sql += ` AND (s.region LIKE ? OR w.station_name LIKE ?)`;
      params.push(`%${normRegion}%`, `%${normRegion}%`);
    }

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      sql += ` AND (
        LOWER(w.station_name) LIKE ? OR 
        LOWER(a.detail_text) LIKE ? OR 
        LOWER(a.before_sn) LIKE ? OR 
        LOWER(a.after_sn) LIKE ? OR 
        LOWER(w.workers) LIKE ? OR 
        LOWER(a.action_name) LIKE ? OR 
        LOWER(w.summary) LIKE ? OR
        LOWER(COALESCE(s.river, '')) LIKE ? OR
        LOWER(COALESCE(s.name, '')) LIKE ?
      )`;
      params.push(q, q, q, q, q, q, q, q, q);
    }

    sql += ` ORDER BY w.work_date DESC, a.id DESC`;

    if (limit && limit !== "all" && parseInt(limit, 10) > 0) {
      sql += ` LIMIT ?`;
      params.push(parseInt(limit, 10));
    }

    return await this.all(sql, params);
  }

  /**
   * 11. Excel Bulk Upload Validation (Section 11)
   */
  async validateBulkUpload(rows = []) {
    const result = {
      total: rows.length,
      changed: 0,
      unchanged: 0,
      errors: 0,
      conflicts: 0,
      items: []
    };

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const eqId = String(row.equipment_id || "").trim();
      const excelVersion = parseInt(row.version, 10) || 1;

      if (!eqId) {
        result.errors++;
        result.items.push({ rowIdx: idx + 1, equipment_id: "-", status: "ERROR", message: "장비 ID가 누락되었습니다." });
        continue;
      }

      const current = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [eqId]);
      if (!current) {
        result.errors++;
        result.items.push({ rowIdx: idx + 1, equipment_id: eqId, status: "ERROR", message: "존재하지 않는 장비 ID입니다." });
        continue;
      }

      // Check version conflict
      if (excelVersion !== current.version) {
        result.conflicts++;
        result.items.push({
          rowIdx: idx + 1,
          equipment_id: eqId,
          status: "CONFLICT",
          message: `버전 충돌: 최신 DB 버전(${current.version})과 일치하지 않습니다.`
        });
        continue;
      }

      // Detect field changes
      const changes = [];
      const fieldsToCheck = [
        ["model_name", "모델명"],
        ["serial_no", "제조번호(S/N)"],
        ["asset_no", "자산번호"],
        ["acquisition_date", "취득년도"],
        ["recent_calib_date", "최근검정일"],
        ["calib_expire_date", "검정만료일"],
        ["location", "보관위치"],
        ["memo", "비고"]
      ];

      for (const [fKey, fLabel] of fieldsToCheck) {
        if (row[fKey] !== undefined && String(row[fKey]).trim() !== String(current[fKey] || "").trim()) {
          changes.push({
            field: fKey,
            label: fLabel,
            before: current[fKey] || "",
            after: String(row[fKey]).trim()
          });
        }
      }

      if (changes.length > 0) {
        result.changed++;
        result.items.push({
          rowIdx: idx + 1,
          equipment_id: eqId,
          station_name: current.station_name,
          category_name: current.category_name,
          status: "READY",
          changes,
          newData: row
        });
      } else {
        result.unchanged++;
        result.items.push({
          rowIdx: idx + 1,
          equipment_id: eqId,
          station_name: current.station_name,
          status: "UNCHANGED",
          message: "변경 사항 없음"
        });
      }
    }

    return result;
  }

  /**
   * 12. Apply Validated Bulk Upload Rows
   */
  async applyBulkUpload(items = [], user = {}, reason = "엑셀 일괄 수정 반영") {
    let appliedCount = 0;

    for (const item of items) {
      if (item.status !== "READY" || !item.newData) continue;
      const { equipment_id, newData, changes } = item;

      const setClauses = [];
      const setParams = [];

      for (const ch of changes) {
        setClauses.push(`${ch.field} = ?`);
        setParams.push(ch.after);
      }

      if (setClauses.length > 0) {
        setClauses.push(`version = version + 1`, `updated_at = CURRENT_TIMESTAMP`);
        setParams.push(equipment_id);

        await this.run(
          `UPDATE equipment_master SET ${setClauses.join(", ")} WHERE equipment_id = ?`,
          setParams
        );

        // Audit Log for each change
        for (const ch of changes) {
          await this.run(`
            INSERT INTO equipment_audit_log (equipment_id, field_name, before_value, after_value, changed_by, reason, source)
            VALUES (?, ?, ?, ?, ?, ?, 'XLSX_UPLOAD')
          `, [equipment_id, ch.field, ch.before, ch.after, user.name || "사용자", reason]);
        }

        appliedCount++;
      }
    }

    return { success: true, appliedCount };
  }
}

module.exports = new EquipmentService();
