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
        SUM(CASE WHEN is_lifespan_over=1 THEN 1 ELSE 0 END) as lifespan_over
      FROM equipment_master
    `);

    const categories = await this.all(`
      SELECT 
        category,
        category_name,
        COUNT(*) as total,
        SUM(CASE WHEN status='OPERATING' THEN 1 ELSE 0 END) as operating,
        SUM(CASE WHEN status='SPARE' THEN 1 ELSE 0 END) as spare,
        SUM(CASE WHEN status='REPAIRING' THEN 1 ELSE 0 END) as repairing,
        SUM(CASE WHEN status='DISPOSAL' THEN 1 ELSE 0 END) as disposal,
        SUM(CASE WHEN is_lifespan_over=1 THEN 1 ELSE 0 END) as lifespan_over
      FROM equipment_master
      GROUP BY category, category_name
      ORDER BY total DESC
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
        SUM(CASE WHEN is_lifespan_over=1 THEN 1 ELSE 0 END) as lifespan_over
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
        SUM(CASE WHEN is_lifespan_over=1 THEN 1 ELSE 0 END) as lifespan_over
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
      rows = rows.filter(r => r.calib_2026 === 1);
    } else if (filterType === "flow") {
      rows = rows.filter(r => (r.flowmeter_count || 0) > 0);
    } else if (filterType === "water") {
      rows = rows.filter(r => (r.waterlevel_count || 0) > 0);
    } else if (filterType === "repair" || filterType === "inRepair") {
      rows = rows.filter(r => (r.repairing_count || 0) > 0);
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
      calibOnly = false,
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
      whereClause += " AND category = ?";
      params.push(category);
    }

    if (status && String(status).toLowerCase() !== "all") {
      whereClause += " AND status = ?";
      params.push(status);
    }

    if (calibOnly === "1" || calibOnly === "true" || calibOnly === true) {
      whereClause += " AND (calib_status IS NOT NULL AND calib_status != '' AND recent_calib_date != '')";
    }

    if (search) {
      const q = `%${search.toLowerCase()}%`;
      whereClause += ` AND (
        LOWER(station_name) LIKE ? OR 
        LOWER(model_name) LIKE ? OR 
        LOWER(serial_no) LIKE ? OR 
        LOWER(asset_no) LIKE ? OR 
        LOWER(manage_no) LIKE ? OR 
        LOWER(location) LIKE ?
      )`;
      params.push(q, q, q, q, q, q);
    }

    const countRow = await this.get(`SELECT COUNT(*) as total FROM equipment_master ${whereClause}`, params);
    const total = countRow ? countRow.total : 0;

    const isAll = (String(limit).toLowerCase() === "all" || parseInt(limit, 10) <= 0);
    const parsedLimit = isAll ? (total || 1) : (parseInt(limit, 10) || 50);
    const parsedPage = isAll ? 1 : Math.max(1, parseInt(page, 10) || 1);
    const offset = isAll ? 0 : (parsedPage - 1) * parsedLimit;

    const sql = isAll
      ? `SELECT * FROM equipment_master ${whereClause} ORDER BY id ASC`
      : `SELECT * FROM equipment_master ${whereClause} ORDER BY id ASC LIMIT ? OFFSET ?`;

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

    const sql = `
      INSERT INTO equipment_master (
        equipment_id, station_id, station_name, station_code,
        category, category_name, item_name, manage_no,
        model_name, spec, serial_no, asset_no, asset_no_temp,
        quantity, status, status_label, location,
        acquisition_date, acquisition_cost, lifespan_years,
        lifespan_end_year, is_lifespan_over,
        calib_status, recent_calib_date, calib_cert_no,
        memo, source_sheet
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '사용자직접등록')
    `;

    const res = await this.run(sql, [
      equipmentId,
      data.station_id || null,
      stationName,
      stationCode,
      data.category || "FLOWMETER",
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
      data.acquisition_date || new Date().getFullYear().toString(),
      data.acquisition_cost || 0,
      data.lifespan_years || 10,
      data.lifespan_end_year || "",
      data.is_lifespan_over || 0,
      data.calib_status || "pending",
      data.recent_calib_date || "",
      data.calib_cert_no || "",
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
   * 5. Update Equipment Status & Location with Audit Log
   */
  async updateDeviceStatus(equipmentId, newStatus, newLocation, reason = "", user = {}) {
    const current = await this.get(`SELECT * FROM equipment_master WHERE equipment_id = ?`, [equipmentId]);
    if (!current) throw new Error("장비를 찾을 수 없습니다.");

    let statusLabel = "운영중";
    if (newStatus === "SPARE") statusLabel = "예비품";
    else if (newStatus === "REPAIRING") statusLabel = "수리중";
    else if (newStatus === "DISPOSAL") statusLabel = "폐품";
    else if (newStatus === "RETURN") statusLabel = "반납예정";

    await this.run(`
      UPDATE equipment_master 
      SET status = ?, status_label = ?, location = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE equipment_id = ?
    `, [newStatus, statusLabel, newLocation || current.location, equipmentId]);

    // Audit Log
    await this.run(`
      INSERT INTO equipment_audit_log (equipment_id, field_name, before_value, after_value, changed_by, reason, source)
      VALUES (?, 'STATUS', ?, ?, ?, ?, 'UI')
    `, [
      equipmentId,
      `${current.status} (${current.location})`,
      `${newStatus} (${newLocation || current.location})`,
      user.name || "사용자",
      reason || "상태 변경"
    ]);

    return { success: true, equipmentId, newStatus, statusLabel };
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
      actions = []
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

    const countRow = await this.get(`SELECT COUNT(*) as cnt FROM equipment_work`);
    const nextSeq = (countRow ? countRow.cnt : 0) + 1;
    const workNo = `WRK-2026-${String(nextSeq).padStart(4, "0")}`;

    const workRes = await this.run(`
      INSERT INTO equipment_work (
        work_no, station_id, station_name, station_code,
        work_date, work_type, workers, summary, detail_raw, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      workNo, station_id || null, stationName, stationCode,
      work_date || new Date().toISOString().split("T")[0],
      work_type, workers, summary || `[${work_type}] 현장 조치 등록`,
      detail_raw, user.name || "사용자"
    ]);

    const workId = workRes.lastID;

    // Process each structured action
    for (const act of actions) {
      const actRes = await this.run(`
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
      if (["REPLACE_FLOW", "REPLACE_WATER", "INSTALL_FLOW", "INSTALL_WATER"].includes(act.action_code)) {
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
