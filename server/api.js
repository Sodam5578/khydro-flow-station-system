const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { db, dbService, logActivity } = require("./db");
const { generateToken, verifyToken } = require("./auth");
const liveMonitor = require("./monitor");

// 1. Auth: Login
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "아이디와 비밀번호를 입력해주세요." });
    }

    const user = await dbService.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ success: false, message: "등록되지 않은 사용자 계정입니다." });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "비밀번호가 일치하지 않습니다." });
    }

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
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "데이터베이스 오류" });
  }
});

// 2. Auth: Get Current User Profile
router.get("/auth/me", verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// 3. Activity Logs: Get Audit History (Admin Only)
router.get("/logs", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "관리자(admin) 전용 메뉴입니다. 권한이 없습니다." });
    }
    const limit = parseInt(req.query.limit, 10) || 200;
    const username = req.query.username;
    const actionType = req.query.actionType;

    const rows = await dbService.getActivityLogs({ limit, username, actionType });
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    console.error("Logs error:", err);
    res.status(500).json({ success: false, message: "이력 조회 실패" });
  }
});

// 4. Stations: Get All Stations
router.get("/stations", verifyToken, async (req, res) => {
  try {
    const rows = await dbService.getAllStations();
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
  } catch (err) {
    console.error("Get stations error:", err);
    res.status(500).json({ success: false, message: "지점 조회 오류" });
  }
});

// 5. Stations: Update Station
router.put("/stations/:id", verifyToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const st = req.body;

    const updateFields = {
      seq: st.seq,
      region: st.region,
      river: st.river,
      name: st.name,
      code: st.code,
      address: st.address,
      install_year: st.installYear,
      obs_start_year: st.obsStartYear,
      is_operating: st.isOperating2026 ? 1 : 0,
      gauge_type: st.gaugeType,
      is_dual: st.isDualGauge ? 1 : 0,
      advm_count: st.advmCount,
      ewsv_count: st.ewsvCount,
      calib_2026: st.calib2026 ? 1 : 0,
      calib_count: st.calibCount2026,
      calib_status: st.calibrationStatus || "pending",
      calib_date: st.calibrationDate || "",
      solar_install: st.solarInstall ? 1 : 0,
      flood_alert: st.floodAlert ? 1 : 0,
      drought_alert: st.droughtAlert ? 1 : 0,
      pollution_total: st.pollutionTotal ? 1 : 0,
      water_level_type: st.waterLevelType,
      ref_water_level: st.refWaterLevel,
      memo: st.memo,
      lat: st.coords?.lat || null,
      lon: st.coords?.lon || null,
      lat_dms: st.coords?.latDMS || "",
      lon_dms: st.coords?.lonDMS || "",
      maintenance_json: JSON.stringify(st.maintenance || {})
    };

    await dbService.updateStation(id, updateFields);
    logActivity(req.user, "제원수정", st.name, `관측소 제원 정보 수정 (코드: ${st.code})`, req.ip);
    res.json({ success: true, message: "관측시설 정보가 수정되었습니다." });
  } catch (err) {
    console.error("Update station error:", err);
    res.status(500).json({ success: false, message: "지점 수정 실패" });
  }
});

// 6. Maintenance: Toggle Task Completion (Audit Logged)
router.post("/stations/:id/maintenance/toggle", verifyToken, async (req, res) => {
  try {
    const stationId = parseInt(req.params.id, 10);
    const { taskKey, isDone, note, taskLabel } = req.body;

    const row = await dbService.getStationById(stationId);
    if (!row) return res.status(404).json({ success: false, message: "지점을 찾을 수 없습니다." });

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

    await dbService.updateStation(stationId, { maintenance_json: JSON.stringify(maint) });

    const actionText = isDone ? "조치완료 체크" : "조치대기 전환";
    const noteSuffix = note ? ` [비고: ${note}]` : "";
    logActivity(
      req.user,
      "유지관리체크",
      row.name,
      `[${taskLabel || taskKey}] ${actionText}${noteSuffix}`,
      req.ip
    );

    res.json({ success: true, maintenance: maint });
  } catch (err) {
    console.error("Maintenance toggle error:", err);
    res.status(500).json({ success: false, message: "유지관리 상태 갱신 실패" });
  }
});

// 7. Schedules: Get All Schedules (Team Calendar)
router.get("/schedules", verifyToken, async (req, res) => {
  try {
    const rows = await dbService.getAllSchedules();
    res.json({ success: true, schedules: rows });
  } catch (err) {
    console.error("Get schedules error:", err);
    res.status(500).json({ success: false, message: "일정 조회 실패" });
  }
});

// 8. Schedules: Create New Schedule
router.post("/schedules", verifyToken, async (req, res) => {
  try {
    const title = req.body.title;
    const schedule_type = req.body.schedule_type || req.body.scheduleType;
    const start_date = req.body.start_date || req.body.startDate;
    const end_date = req.body.end_date || req.body.endDate || start_date;
    const station_id = req.body.station_id || req.body.stationId || "";
    const station_name = req.body.station_name || req.body.stationName || "";
    const assignee = req.body.assignee;
    const attendees = req.body.attendees || "";
    const status = req.body.status || "scheduled";
    const description = req.body.description || "";

    if (!title || !schedule_type || !start_date || !assignee) {
      return res.status(400).json({ success: false, message: "필수 항목(제목, 구분, 시작일, 담당자)을 모두 입력해주세요." });
    }

    const createdBy = `${req.user.name} (${req.user.username})`;
    const scheduleData = {
      title,
      station_id: station_id ? String(station_id) : "",
      station_name: station_name || "",
      schedule_type,
      start_date,
      end_date: end_date || start_date,
      assignee,
      attendees: attendees || "",
      status: status || "scheduled",
      description: description || "",
      created_by: createdBy
    };

    const newSchedule = await dbService.createSchedule(scheduleData);
    logActivity(req.user, "일정등록", title, `[${schedule_type}] ${start_date} ~ ${end_date || start_date} (등록자: ${req.user.name}, 담당: ${assignee})`, req.ip);

    res.json({ success: true, schedule: newSchedule, message: "일정이 등록되었습니다." });
  } catch (err) {
    console.error("Create schedule error:", err);
    res.status(500).json({ success: false, message: "일정 등록 실패" });
  }
});

// 9. Schedules: Update Schedule (With Permission Check)
router.put("/schedules/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const schedules = await dbService.getAllSchedules();
    const existing = schedules.find(s => String(s.id) === String(id));

    if (!existing) {
      return res.status(404).json({ success: false, message: "수정할 일정을 찾을 수 없습니다." });
    }

    const isAdmin = req.user.role === "admin";
    const isCreator = existing.created_by && existing.created_by.includes(req.user.username);
    const isAssignee = existing.assignee === req.user.name;
    const isAttendee = existing.attendees && existing.attendees.split(",").map(a => a.trim()).includes(req.user.name);

    if (!isAdmin && !isCreator && !isAssignee && !isAttendee) {
      return res.status(403).json({ success: false, message: "해당 일정을 수정할 권한이 없습니다. (등록자, 담당자, 동행자 또는 관리자만 수정 가능)" });
    }

    const title = req.body.title || existing.title;
    const schedule_type = req.body.schedule_type || req.body.scheduleType || existing.schedule_type;
    const start_date = req.body.start_date || req.body.startDate || existing.start_date;
    const end_date = req.body.end_date || req.body.endDate || start_date || existing.end_date;
    const station_id = req.body.station_id !== undefined ? String(req.body.station_id) : (req.body.stationId !== undefined ? String(req.body.stationId) : existing.station_id);
    const station_name = req.body.station_name !== undefined ? req.body.station_name : (req.body.stationName !== undefined ? req.body.stationName : existing.station_name);
    const assignee = req.body.assignee || existing.assignee;
    const attendees = req.body.attendees !== undefined ? req.body.attendees : existing.attendees;
    const status = req.body.status || existing.status;
    const description = req.body.description !== undefined ? req.body.description : existing.description;

    const updateData = {
      title,
      station_id,
      station_name,
      schedule_type,
      start_date,
      end_date,
      assignee,
      attendees,
      status,
      description
    };

    const updated = await dbService.updateSchedule(id, updateData);
    logActivity(req.user, "일정수정", updateData.title, `[${updateData.schedule_type}] 일정 내용 수정 처리`, req.ip);

    res.json({ success: true, schedule: updated, message: "일정이 수정되었습니다." });
  } catch (err) {
    console.error("Update schedule error:", err);
    res.status(500).json({ success: false, message: "일정 수정 실패" });
  }
});

// 10. Schedules: Delete Schedule (With Permission Check)
router.delete("/schedules/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const schedules = await dbService.getAllSchedules();
    const existing = schedules.find(s => String(s.id) === String(id));

    if (!existing) {
      return res.status(404).json({ success: false, message: "삭제할 일정을 찾을 수 없습니다." });
    }

    const isAdmin = req.user.role === "admin";
    const isCreator = existing.created_by && existing.created_by.includes(req.user.username);
    const isAssignee = existing.assignee === req.user.name;

    if (!isAdmin && !isCreator && !isAssignee) {
      return res.status(403).json({ success: false, message: "해당 일정을 삭제할 권한이 없습니다. (등록자, 담당자 또는 관리자만 삭제 가능)" });
    }

    await dbService.deleteSchedule(id);
    logActivity(req.user, "일정삭제", existing.title, `[${existing.schedule_type}] 일정 삭제 처리`, req.ip);

    res.json({ success: true, message: "일정이 삭제되었습니다." });
  } catch (err) {
    console.error("Delete schedule error:", err);
    res.status(500).json({ success: false, message: "일정 삭제 실패" });
  }
});

// 11. Live Monitor: Summary KPI & Issues
router.get("/monitor/summary", (req, res) => {
  try {
    const data = liveMonitor.getData();
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 12. Live Monitor: Issues List
router.get("/monitor/issues", (req, res) => {
  try {
    const data = liveMonitor.getData();
    res.json({ success: true, issues: data.issues || [], targetTime: data.targetTime });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 13. Live Monitor: Single Station Diagnostic Issues
router.get("/monitor/station/:code", (req, res) => {
  try {
    const codeOrName = req.params.code;
    const issues = liveMonitor.getIssuesForStation(codeOrName);
    res.json({ success: true, count: issues.length, issues });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 14. Live Monitor: Force Manual Sync Trigger
router.post("/monitor/sync", async (req, res) => {
  try {
    const result = await liveMonitor.sync();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
