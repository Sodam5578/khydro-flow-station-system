const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { db, logActivity } = require("./db");
const { generateToken, verifyToken } = require("./auth");

// 1. Auth: Login
router.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "아이디와 비밀번호를 입력해주세요." });
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).json({ success: false, message: "데이터베이스 오류" });
    if (!user) return res.status(401).json({ success: false, message: "등록되지 않은 사용자 계정입니다." });

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ success: false, message: "비밀번호가 일치하지 않습니다." });

    const token = generateToken(user);
    
    // Log Activity
    logActivity(user, "로그인", "시스템 로그인", "정상 로그인 접속", req.ip || req.connection.remoteAddress);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        position: user.position || "팀원",
        role: user.role,
        region: user.region,
        team: user.team
      }
    });
  });
});

// 2. Auth: Get Current User Profile
router.get("/auth/me", verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// 3. Activity Logs: Get Audit History (Admin Only)
router.get("/logs", verifyToken, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "관리자(admin) 전용 메뉴입니다. 권한이 없습니다." });
  }
  const limit = parseInt(req.query.limit, 10) || 200;
  const username = req.query.username;
  const actionType = req.query.actionType;

  let query = "SELECT * FROM activity_logs";
  let params = [];
  let conditions = [];

  if (username && username !== "all") {
    conditions.push("username = ?");
    params.push(username);
  }
  if (actionType && actionType !== "all") {
    conditions.push("action_type = ?");
    params.push(actionType);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY id DESC LIMIT ?";
  params.push(limit);

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "이력 조회 실패" });
    res.json({ success: true, count: rows.length, data: rows });
  });
});

// 4. Stations: Get All Stations
router.get("/stations", verifyToken, (req, res) => {
  db.all("SELECT * FROM stations ORDER BY seq ASC", (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "지점 조회 오류" });

    const stations = rows.map(r => {
      let maint = {};
      try { maint = JSON.parse(r.maintenance_json || "{}"); } catch(e) {}

      return {
        id: r.id,
        seq: r.seq,
        region: r.region,
        river: r.river,
        name: r.name,
        code: r.code,
        address: r.address,
        installYear: r.install_year,
        obsStartYear: r.obs_start_year,
        isOperating2026: r.is_operating === 1,
        gaugeType: r.gauge_type,
        gaugeCategory: r.is_dual === 1 ? "DUAL" : (r.gauge_type?.includes("EWSV") ? "EWSV" : "ADVM"),
        isDualGauge: r.is_dual === 1,
        advmCount: r.advm_count,
        ewsvCount: r.ewsv_count,
        calib2026: r.calib_2026 === 1,
        calibCount2026: r.calib_count,
        calibrationStatus: r.calib_status || "pending",
        calibrationDate: r.calib_date || "",
        solarInstall: r.solar_install === 1,
        floodAlert: r.flood_alert === 1,
        droughtAlert: r.drought_alert === 1,
        pollutionTotal: r.pollution_total === 1,
        waterLevelType: r.water_level_type,
        refWaterLevel: r.ref_water_level,
        rvBoxInstalled: r.rv_box_installed === 1 ? true : (r.rv_box_installed === 0 ? false : null),
        rvBoxStatus: r.rv_box_installed === 1 ? "설치완료" : (r.rv_box_installed === 0 ? "미설치" : "미운영/대상외"),
        rvBoxAgents: r.rv_box_agents ? r.rv_box_agents.split(", ") : [],
        memo: r.memo,
        coords: {
          lat: r.lat,
          lon: r.lon,
          latDMS: r.lat_dms,
          lonDMS: r.lon_dms
        },
        maintenance: maint
      };
    });

    res.json({ success: true, count: stations.length, data: stations });
  });
});

// 5. Stations: Add New Station
router.post("/stations", verifyToken, (req, res) => {
  const st = req.body;
  db.get("SELECT MAX(id) as maxId, MAX(seq) as maxSeq FROM stations", (err, row) => {
    const nextId = (row?.maxId || 0) + 1;
    const nextSeq = st.seq || (row?.maxSeq || 0) + 1;

    const stmt = db.prepare(`
      INSERT INTO stations (
        id, seq, region, river, name, code, address,
        install_year, obs_start_year, is_operating,
        gauge_type, is_dual, advm_count, ewsv_count,
        calib_2026, calib_count, calib_status, calib_date,
        solar_install, flood_alert, drought_alert, pollution_total,
        water_level_type, ref_water_level, memo,
        lat, lon, lat_dms, lon_dms, maintenance_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      nextId, nextSeq, st.region, st.river, st.name, st.code, st.address,
      st.installYear, st.obsStartYear, st.isOperating2026 ? 1 : 0,
      st.gaugeType, st.isDualGauge ? 1 : 0, st.advmCount, st.ewsvCount,
      st.calib2026 ? 1 : 0, st.calibCount2026, st.calibrationStatus || "pending", st.calibrationDate || "",
      st.solarInstall ? 1 : 0, st.floodAlert ? 1 : 0, st.droughtAlert ? 1 : 0, st.pollutionTotal ? 1 : 0,
      st.waterLevelType, st.refWaterLevel, st.memo,
      st.coords?.lat || null, st.coords?.lon || null, st.coords?.latDMS || "", st.coords?.lonDMS || "",
      JSON.stringify(st.maintenance || {}),
      function(err) {
        if (err) return res.status(500).json({ success: false, message: "지점 추가 실패" });
        
        logActivity(req.user, "관측소등록", st.name, `신규 등록 (${st.region} ${st.river})`, req.ip);
        res.json({ success: true, id: nextId, message: "신규 관측시설이 등록되었습니다." });
      }
    );
  });
});

// 6. Stations: Update Station
router.put("/stations/:id", verifyToken, (req, res) => {
  const id = req.params.id;
  const st = req.body;

  db.run(`
    UPDATE stations SET
      seq = ?, region = ?, river = ?, name = ?, code = ?, address = ?,
      install_year = ?, obs_start_year = ?, is_operating = ?,
      gauge_type = ?, is_dual = ?, advm_count = ?, ewsv_count = ?,
      calib_2026 = ?, calib_count = ?, calib_status = ?, calib_date = ?,
      solar_install = ?, flood_alert = ?, drought_alert = ?, pollution_total = ?,
      water_level_type = ?, ref_water_level = ?, memo = ?,
      lat = ?, lon = ?, lat_dms = ?, lon_dms = ?,
      maintenance_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    st.seq, st.region, st.river, st.name, st.code, st.address,
    st.installYear, st.obsStartYear, st.isOperating2026 ? 1 : 0,
    st.gaugeType, st.isDualGauge ? 1 : 0, st.advmCount, st.ewsvCount,
    st.calib2026 ? 1 : 0, st.calibCount2026, st.calibrationStatus || "pending", st.calibrationDate || "",
    st.solarInstall ? 1 : 0, st.floodAlert ? 1 : 0, st.droughtAlert ? 1 : 0, st.pollutionTotal ? 1 : 0,
    st.waterLevelType, st.refWaterLevel, st.memo,
    st.coords?.lat || null, st.coords?.lon || null, st.coords?.latDMS || "", st.coords?.lonDMS || "",
    JSON.stringify(st.maintenance || {}),
    id
  ], function(err) {
    if (err) return res.status(500).json({ success: false, message: "지점 수정 실패" });
    
    logActivity(req.user, "제원수정", st.name, `관측소 제원 정보 수정 (코드: ${st.code})`, req.ip);
    res.json({ success: true, message: "관측시설 정보가 수정되었습니다." });
  });
});

// 7. Stations: Delete Station
router.delete("/stations/:id", verifyToken, (req, res) => {
  const id = req.params.id;
  db.get("SELECT name FROM stations WHERE id = ?", [id], (err, row) => {
    const stationName = row ? row.name : `ID:${id}`;
    db.run("DELETE FROM stations WHERE id = ?", [id], function(err) {
      if (err) return res.status(500).json({ success: false, message: "지점 삭제 실패" });
      
      logActivity(req.user, "관측소삭제", stationName, `관측소 데이터 삭제 처리`, req.ip);
      res.json({ success: true, message: "관측시설이 삭제되었습니다." });
    });
  });
});

// 8. Maintenance: Toggle Task Completion (Audit Logged)
router.post("/stations/:id/maintenance/toggle", verifyToken, (req, res) => {
  const stationId = req.params.id;
  const { taskKey, isDone, note, taskLabel } = req.body;

  db.get("SELECT name, maintenance_json FROM stations WHERE id = ?", [stationId], (err, row) => {
    if (err || !row) return res.status(404).json({ success: false, message: "지점을 찾을 수 없습니다." });

    let maint = {};
    try { maint = JSON.parse(row.maintenance_json || "{}"); } catch(e) {}
    if (!maint.completedTasks) maint.completedTasks = {};

    const today = new Date().toISOString().slice(0, 10);
    const actor = `${req.user.name} (${req.user.position || "팀원"})`;

    if (isDone) {
      maint.completedTasks[taskKey] = {
        completed: true,
        completedDate: today,
        user: actor,
        note: note || ""
      };
    } else {
      delete maint.completedTasks[taskKey];
    }

    db.run("UPDATE stations SET maintenance_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(maint), stationId], (updateErr) => {
      if (updateErr) return res.status(500).json({ success: false, message: "유지관리 상태 갱신 실패" });

      const actionText = isDone ? "조치완료 체크" : "조치대기 전환";
      const details = `[과업: ${taskLabel || taskKey}] ${actionText} ${note ? `(비고: ${note})` : ""}`;
      logActivity(req.user, "유지관리", row.name, details, req.ip);

      res.json({ success: true, maintenance: maint, message: isDone ? "조치 완료로 기록되었습니다." : "조치 대기 상태로 변경되었습니다." });
    });
  });
});

// 9. Calibration: Update Status & Date (Audit Logged)
router.post("/stations/:id/calibration/update", verifyToken, (req, res) => {
  const stationId = req.params.id;
  const { status, date, certNo } = req.body;

  db.get("SELECT name FROM stations WHERE id = ?", [stationId], (err, row) => {
    const stationName = row ? row.name : `ID:${stationId}`;
    db.run(`
      UPDATE stations SET
        calib_status = ?, calib_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, date, stationId], (err) => {
      if (err) return res.status(500).json({ success: false, message: "유속계 검정 상태 갱신 실패" });

      let statusKr = "대기";
      if (status === "ongoing") statusKr = "시험·검정중";
      if (status === "completed") statusKr = "검정완료";

      const details = `유속계 검정 상태를 [${statusKr}]로 변경 ${date ? `(완료일: ${date})` : ""}`;
      logActivity(req.user, "유속계 검정", stationName, details, req.ip);

      res.json({ success: true, message: "유속계 검정 상태가 갱신되었습니다." });
    });
  });
});

// 10. Schedules: Get All Schedules
router.get("/schedules", (req, res) => {
  const { assignee, scheduleType, status } = req.query;
  let sql = "SELECT * FROM schedules WHERE 1=1";
  const params = [];

  if (assignee && assignee !== "all") {
    sql += " AND (assignee = ? OR assignee = '전체')";
    params.push(assignee);
  }

  if (scheduleType && scheduleType !== "all") {
    sql += " AND schedule_type = ?";
    params.push(scheduleType);
  }

  if (status && status !== "all") {
    sql += " AND status = ?";
    params.push(status);
  }

  sql += " ORDER BY start_date ASC, id ASC";

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "일정 조회 실패" });
    res.json({ success: true, schedules: rows });
  });
});

// 11. Schedules: Add New Schedule (Audit Logged)
router.post("/schedules", verifyToken, (req, res) => {
  const { title, stationId, stationName, scheduleType, startDate, endDate, assignee, attendees, status, description } = req.body;

  if (!title || !scheduleType || !startDate || !assignee) {
    return res.status(400).json({ success: false, message: "제목, 유형, 시작일자, 담당자는 필수 입력 항목입니다." });
  }

  const createdBy = req.user ? req.user.name : "관리자";
  const end = endDate || startDate;
  const schedStatus = status || "scheduled";

  db.run(`
    INSERT INTO schedules (
      title, station_id, station_name, schedule_type,
      start_date, end_date, assignee, attendees, status, description, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    title, stationId || null, stationName || "", scheduleType,
    startDate, end, assignee, attendees || "", schedStatus, description || "", createdBy
  ], function(err) {
    if (err) return res.status(500).json({ success: false, message: "일정 등록 실패" });

    const newId = this.lastID;
    const target = stationName ? `${stationName} (${title})` : title;
    const details = `[${assignee}${attendees ? `, 동행:${attendees}` : ""}] ${startDate} ~ ${end} (${scheduleType}): ${title}`;
    logActivity(req.user, "일정 등록", target, details, req.ip);

    res.json({ success: true, id: newId, message: "일정이 등록되었습니다." });
  });
});

// 12. Schedules: Update Schedule (Audit Logged)
router.put("/schedules/:id", verifyToken, (req, res) => {
  const id = req.params.id;
  const { title, stationId, stationName, scheduleType, startDate, endDate, assignee, attendees, status, description } = req.body;

  db.get("SELECT * FROM schedules WHERE id = ?", [id], (err, oldRow) => {
    if (err || !oldRow) return res.status(404).json({ success: false, message: "일정을 찾을 수 없습니다." });

    // Permission Check: Author, Assignee, Attendee or Admin
    const currentUserName = req.user.name;
    const isOwner = (oldRow.created_by === currentUserName) || 
                    (oldRow.assignee === currentUserName) || 
                    (oldRow.attendees && oldRow.attendees.includes(currentUserName));
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "본인이 등록한 일정 또는 배정된 일정만 수정할 수 있습니다." });
    }

    const updatedTitle = title || oldRow.title;
    const updatedStationId = stationId !== undefined ? stationId : oldRow.station_id;
    const updatedStationName = stationName !== undefined ? stationName : oldRow.station_name;
    const updatedType = scheduleType || oldRow.schedule_type;
    const updatedStart = startDate || oldRow.start_date;
    const updatedEnd = endDate || oldRow.end_date;
    const updatedAssignee = assignee || oldRow.assignee;
    const updatedAttendees = attendees !== undefined ? attendees : (oldRow.attendees || "");
    const updatedStatus = status || oldRow.status;
    const updatedDesc = description !== undefined ? description : oldRow.description;

    db.run(`
      UPDATE schedules SET
        title = ?, station_id = ?, station_name = ?, schedule_type = ?,
        start_date = ?, end_date = ?, assignee = ?, attendees = ?, status = ?, description = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      updatedTitle, updatedStationId, updatedStationName, updatedType,
      updatedStart, updatedEnd, updatedAssignee, updatedAttendees, updatedStatus, updatedDesc, id
    ], (updateErr) => {
      if (updateErr) return res.status(500).json({ success: false, message: "일정 수정 실패" });

      const target = updatedStationName ? `${updatedStationName} (${updatedTitle})` : updatedTitle;
      const details = `[${updatedAssignee}${updatedAttendees ? `, 동행:${updatedAttendees}` : ""}] ${updatedStart} [상태: ${updatedStatus}]: ${updatedTitle}`;
      logActivity(req.user, "일정 수정", target, details, req.ip);

      res.json({ success: true, message: "일정이 성공적으로 수정되었습니다." });
    });
  });
});

// 13. Schedules: Delete Schedule (Audit Logged)
router.delete("/schedules/:id", verifyToken, (req, res) => {
  const id = req.params.id;

  db.get("SELECT * FROM schedules WHERE id = ?", [id], (err, row) => {
    if (err || !row) return res.status(404).json({ success: false, message: "일정을 찾을 수 없습니다." });

    // Permission Check: Author, Assignee, Attendee or Admin
    const currentUserName = req.user.name;
    const isOwner = (row.created_by === currentUserName) || 
                    (row.assignee === currentUserName) || 
                    (row.attendees && row.attendees.includes(currentUserName));
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "본인이 등록한 일정 또는 배정된 일정만 삭제할 수 있습니다." });
    }

    db.run("DELETE FROM schedules WHERE id = ?", [id], (delErr) => {
      if (delErr) return res.status(500).json({ success: false, message: "일정 삭제 실패" });

      const target = row.station_name ? `${row.station_name} (${row.title})` : row.title;
      const details = `[${row.assignee}] ${row.start_date} 일정 삭제: ${row.title}`;
      logActivity(req.user, "일정 삭제", target, details, req.ip);

      res.json({ success: true, message: "일정이 삭제되었습니다." });
    });
  });
});

// 14. Admin Only: Batch Update Stations (from Excel/JSON)
router.post("/stations/batch", verifyToken, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "데이터 일괄 갱신은 관리자(admin)만 가능합니다." });
  }

  const { stations } = req.body;
  if (!Array.isArray(stations) || stations.length === 0) {
    return res.status(400).json({ success: false, message: "갱신할 관측소 데이터가 올바르지 않습니다." });
  }

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    db.run("DELETE FROM stations", (delErr) => {
      if (delErr) {
        db.run("ROLLBACK");
        return res.status(500).json({ success: false, message: "기존 데이터 삭제 실패" });
      }

      const stmt = db.prepare(`
        INSERT INTO stations (
          id, seq, region, river, name, code, address,
          install_year, obs_start_year, is_operating,
          gauge_type, is_dual, advm_count, ewsv_count,
          calib_2026, calib_count, calib_status, calib_date,
          solar_install, flood_alert, drought_alert, pollution_total,
          water_level_type, ref_water_level, memo,
          lat, lon, lat_dms, lon_dms, maintenance_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stations.forEach((st, idx) => {
        const id = st.id || idx + 1;
        stmt.run(
          id,
          st.seq || id,
          st.region || "",
          st.river || "",
          st.name || "",
          st.code || "",
          st.address || "",
          st.installYear || "",
          st.obsStartYear || "",
          st.isOperating2026 ? 1 : 0,
          st.gaugeType || "",
          st.isDualGauge ? 1 : 0,
          st.advmCount || "",
          st.ewsvCount || "",
          st.calib2026 ? 1 : 0,
          st.calibCount2026 || "",
          st.calibrationStatus || "pending",
          st.calibrationDate || "",
          st.solarInstall ? 1 : 0,
          st.floodAlert ? 1 : 0,
          st.droughtAlert ? 1 : 0,
          st.pollutionTotal ? 1 : 0,
          st.waterLevelType || "",
          st.refWaterLevel || "",
          st.memo || "",
          st.coords?.lat || null,
          st.coords?.lon || null,
          st.coords?.latDMS || "",
          st.coords?.lonDMS || "",
          JSON.stringify(st.maintenance || {})
        );
      });

      stmt.finalize((finalErr) => {
        if (finalErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ success: false, message: "일괄 데이터 저장 실패" });
        }

        db.run("COMMIT", (commitErr) => {
          if (commitErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ success: false, message: "트랜잭션 커밋 실패" });
          }

          logActivity(req.user, "데이터일괄갱신", "전체 관측소", `총 ${stations.length}개소 데이터 파일 업로드 갱신`, req.ip);
          res.json({ success: true, count: stations.length, message: `${stations.length}개소 관측시설 데이터가 성공적으로 갱신되었습니다.` });
        });
      });
    });
  });
});

// 15. Admin Only: Factory Reset Stations to Initial 223 Data
router.post("/stations/reset", verifyToken, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "데이터 원본 초기화는 관리자(admin)만 가능합니다." });
  }

  const path = require("path");
  const fs = require("fs");
  const jsonPath = path.join(__dirname, "../data/stations_initial.json");

  if (!fs.existsSync(jsonPath)) {
    return res.status(500).json({ success: false, message: "초기 데이터 파일(stations_initial.json)을 찾을 수 없습니다." });
  }

  try {
    const stations = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      db.run("DELETE FROM stations", (delErr) => {
        if (delErr) {
          db.run("ROLLBACK");
          return res.status(500).json({ success: false, message: "초기화 중 기존 데이터 삭제 실패" });
        }

        const stmt = db.prepare(`
          INSERT INTO stations (
            id, seq, region, river, name, code, address,
            install_year, obs_start_year, is_operating,
            gauge_type, is_dual, advm_count, ewsv_count,
            calib_2026, calib_count, calib_status, calib_date,
            solar_install, flood_alert, drought_alert, pollution_total,
            water_level_type, ref_water_level, memo,
            lat, lon, lat_dms, lon_dms, maintenance_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stations.forEach(st => {
          stmt.run(
            st.id,
            st.seq || st.id,
            st.region || "",
            st.river || "",
            st.name || "",
            st.code || "",
            st.address || "",
            st.installYear || "",
            st.obsStartYear || "",
            st.isOperating2026 ? 1 : 0,
            st.gaugeType || "",
            st.isDualGauge ? 1 : 0,
            st.advmCount || "",
            st.ewsvCount || "",
            st.calib2026 ? 1 : 0,
            st.calibCount2026 || "",
            st.calibrationStatus || "pending",
            st.calibrationDate || "",
            st.solarInstall ? 1 : 0,
            st.floodAlert ? 1 : 0,
            st.droughtAlert ? 1 : 0,
            st.pollutionTotal ? 1 : 0,
            st.waterLevelType || "",
            st.refWaterLevel || "",
            st.memo || "",
            st.coords?.lat || null,
            st.coords?.lon || null,
            st.coords?.latDMS || "",
            st.coords?.lonDMS || "",
            JSON.stringify(st.maintenance || {})
          );
        });

        stmt.finalize((finalErr) => {
          if (finalErr) {
            db.run("ROLLBACK");
            return res.status(500).json({ success: false, message: "초기 데이터 주입 실패" });
          }

          db.run("COMMIT", (commitErr) => {
            if (commitErr) {
              db.run("ROLLBACK");
              return res.status(500).json({ success: false, message: "초기화 트랜잭션 완료 실패" });
            }

            logActivity(req.user, "원본초기화", "전체 관측소", "초기 223개소 원본 데이터로 공장 초기화 수행", req.ip);
            res.json({ success: true, count: stations.length, message: "초기 223개소 원본 데이터로 초기화되었습니다." });
          });
        });
      });
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "초기화 처리 중 오류: " + e.message });
  }
});

module.exports = router;
