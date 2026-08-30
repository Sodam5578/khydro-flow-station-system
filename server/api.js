const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { db } = require("./db");
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
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
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

// 3. Stations: Get All Stations
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

// 4. Stations: Add New Station
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
        res.json({ success: true, id: nextId, message: "신규 관측시설이 등록되었습니다." });
      }
    );
  });
});

// 5. Stations: Update Station
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
    res.json({ success: true, message: "관측시설 정보가 수정되었습니다." });
  });
});

// 6. Stations: Delete Station
router.delete("/stations/:id", verifyToken, (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM stations WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ success: false, message: "지점 삭제 실패" });
    res.json({ success: true, message: "관측시설이 삭제되었습니다." });
  });
});

// 7. Maintenance: Toggle Task Completion (Real-time sync)
router.post("/stations/:id/maintenance/toggle", verifyToken, (req, res) => {
  const stationId = req.params.id;
  const { taskKey, isDone, note } = req.body;

  db.get("SELECT maintenance_json FROM stations WHERE id = ?", [stationId], (err, row) => {
    if (err || !row) return res.status(404).json({ success: false, message: "지점을 찾을 수 없습니다." });

    let maint = {};
    try { maint = JSON.parse(row.maintenance_json || "{}"); } catch(e) {}
    if (!maint.completedTasks) maint.completedTasks = {};

    const today = new Date().toISOString().slice(0, 10);
    if (isDone) {
      maint.completedTasks[taskKey] = {
        completed: true,
        completedDate: today,
        user: req.user.name,
        note: note || ""
      };
    } else {
      delete maint.completedTasks[taskKey];
    }

    db.run("UPDATE stations SET maintenance_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(maint), stationId], (updateErr) => {
      if (updateErr) return res.status(500).json({ success: false, message: "유지관리 상태 갱신 실패" });

      // Record log
      db.run("INSERT INTO maintenance_logs (station_id, task_key, is_done, done_date, username, note) VALUES (?, ?, ?, ?, ?, ?)",
        [stationId, taskKey, isDone ? 1 : 0, today, req.user.username, note || ""]);

      res.json({ success: true, maintenance: maint, message: isDone ? "조치 완료로 기록되었습니다." : "조치 대기 상태로 변경되었습니다." });
    });
  });
});

// 8. Calibration: Update Status & Date
router.post("/stations/:id/calibration/update", verifyToken, (req, res) => {
  const stationId = req.params.id;
  const { status, date, certNo } = req.body;

  db.run(`
    UPDATE stations SET
      calib_status = ?, calib_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, date, stationId], (err) => {
    if (err) return res.status(500).json({ success: false, message: "정도검정 상태 갱신 실패" });
    res.json({ success: true, message: "유속계 정도검정 상태가 갱신되었습니다." });
  });
});

module.exports = router;
