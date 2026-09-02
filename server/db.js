const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "../data/khydro.db");
const db = new sqlite3.Database(dbPath);

function initDb() {
  db.serialize(() => {
    // 1. Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        position TEXT DEFAULT "팀원",
        role TEXT NOT NULL DEFAULT "member",
        region TEXT DEFAULT "all",
        team TEXT DEFAULT "수자원인프라팀",
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Stations Table
    db.run(`
      CREATE TABLE IF NOT EXISTS stations (
        id INTEGER PRIMARY KEY,
        seq INTEGER,
        region TEXT,
        river TEXT,
        name TEXT,
        code TEXT,
        address TEXT,
        install_year TEXT,
        obs_start_year TEXT,
        is_operating INTEGER DEFAULT 1,
        gauge_type TEXT,
        is_dual INTEGER DEFAULT 0,
        advm_count TEXT,
        ewsv_count TEXT,
        calib_2026 INTEGER DEFAULT 0,
        calib_count TEXT,
        calib_status TEXT DEFAULT "pending",
        calib_date TEXT,
        solar_install INTEGER DEFAULT 0,
        flood_alert INTEGER DEFAULT 0,
        drought_alert INTEGER DEFAULT 0,
        pollution_total INTEGER DEFAULT 0,
        water_level_type TEXT,
        ref_water_level TEXT,
        memo TEXT,
        lat REAL,
        lon REAL,
        lat_dms TEXT,
        lon_dms TEXT,
        maintenance_json TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Activity Logs Table (Comprehensive Audit Log)
    db.run(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        name TEXT NOT NULL,
        position TEXT DEFAULT "팀원",
        action_type TEXT NOT NULL,
        target_name TEXT,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Schedules Table (Team Work & Inspection Calendar)
    db.run(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        station_id INTEGER,
        station_name TEXT,
        schedule_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        assignee TEXT NOT NULL,
        attendees TEXT,
        status TEXT DEFAULT "scheduled",
        description TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add attendees column if not exists
    db.run("ALTER TABLE schedules ADD COLUMN attendees TEXT", (err) => {
      // Ignore if column already exists
    });

    // Initialize or Reset Official Team Accounts
    console.log("Setting up official team accounts (윤영선 팀장, 이동오, 나형욱, 박세찬, admin)...");
    
    // Clear old accounts and re-seed official 5 accounts
    db.run("DELETE FROM users", (err) => {
      if (err) return console.error("Error clearing users:", err);
      
      const officialUsers = [
        { u: "admin", p: "admin1234", name: "관리자 (총괄)", pos: "최고관리자", role: "admin", team: "수자원인프라팀" },
        { u: "kihs01", p: "kihs01", name: "윤영선", pos: "팀장", role: "member", team: "수자원인프라팀" },
        { u: "kihs02", p: "kihs02", name: "이동오", pos: "팀원", role: "member", team: "수자원인프라팀" },
        { u: "kihs03", p: "kihs03", name: "나형욱", pos: "팀원", role: "member", team: "수자원인프라팀" },
        { u: "kihs04", p: "kihs04", name: "박세찬", pos: "팀원", role: "member", team: "수자원인프라팀" }
      ];

      const stmt = db.prepare("INSERT INTO users (username, password_hash, name, position, role, team) VALUES (?, ?, ?, ?, ?, ?)");
      officialUsers.forEach(user => {
        const hash = bcrypt.hashSync(user.p, 10);
        stmt.run(user.u, hash, user.name, user.pos, user.role, user.team);
      });
      stmt.finalize();
      console.log("Official 5 team accounts seeded successfully.");
    });

    // Seed Initial Stations if empty
    db.get("SELECT COUNT(*) as count FROM stations", (err, row) => {
      if (err) return console.error("Error checking stations count:", err);
      if (row.count === 0) {
        console.log("Seeding initial 223 stations into SQLite...");
        const jsonPath = path.join(__dirname, "../data/stations_initial.json");
        if (fs.existsSync(jsonPath)) {
          const rawData = fs.readFileSync(jsonPath, "utf-8");
          const stations = JSON.parse(rawData);

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
          stmt.finalize();
          console.log(`Seeded ${stations.length} stations into SQLite database.`);
        }
      }
    });

    // Seed Initial Schedules if empty
    db.get("SELECT COUNT(*) as count FROM schedules", (err, row) => {
      if (err) return console.error("Error checking schedules count:", err);
      if (row.count === 0) {
        console.log("Seeding sample team schedules into SQLite...");
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const todayStr = `${yyyy}-${mm}-${dd}`;
        
        // Next week dates
        const d1 = new Date(today); d1.setDate(d1.getDate() + 1);
        const d1Str = d1.toISOString().slice(0, 10);
        const d2 = new Date(today); d2.setDate(d2.getDate() + 3);
        const d2Str = d2.toISOString().slice(0, 10);
        const d3 = new Date(today); d3.setDate(d3.getDate() + 5);
        const d3Str = d3.toISOString().slice(0, 10);

        const sampleSchedules = [
          {
            title: "한강권역 주요 자동유량관측소 현장 점검",
            station_id: 1,
            station_name: "정선군(송천교)",
            schedule_type: "check",
            start_date: todayStr,
            end_date: todayStr,
            assignee: "윤영선",
            status: "in_progress",
            description: "송천교 현장 점검 및 센서 브라켓 고정 상태 확인",
            created_by: "윤영선"
          },
          {
            title: "광주광역시(유촌교) 차단기 및 배터리 교체 작업",
            station_id: 147,
            station_name: "광주광역시(유촌교)",
            schedule_type: "maint",
            start_date: d1Str,
            end_date: d1Str,
            assignee: "박세찬",
            status: "scheduled",
            description: "2026 유지관리 과업 연계 차단기·배터리 현장 조치",
            created_by: "박세찬"
          },
          {
            title: "영동군(양강교) EWSV 유속계 검정 입회",
            station_id: 87,
            station_name: "영동군(양강교)",
            schedule_type: "calib",
            start_date: d2Str,
            end_date: d2Str,
            assignee: "나형욱",
            status: "scheduled",
            description: "2026 유속계 검정 수행 및 성적서 발급 협의",
            created_by: "나형욱"
          },
          {
            title: "낙동강권역 3분기 관측망 운영 실무 회의",
            station_id: null,
            station_name: "기술원 본원 대회의실",
            schedule_type: "meeting",
            start_date: d3Str,
            end_date: d3Str,
            assignee: "전체",
            status: "scheduled",
            description: "팀 전체 자동유량관측망 운영 현황 및 2차 개발 시스템 피드백 회의",
            created_by: "이동오"
          }
        ];

        const stmt = db.prepare(`
          INSERT INTO schedules (
            title, station_id, station_name, schedule_type,
            start_date, end_date, assignee, status, description, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        sampleSchedules.forEach(s => {
          stmt.run(
            s.title, s.station_id, s.station_name, s.schedule_type,
            s.start_date, s.end_date, s.assignee, s.status, s.description, s.created_by
          );
        });
        stmt.finalize();
        console.log(`Seeded ${sampleSchedules.length} sample schedules.`);
      }
    });
  });
}

function logActivity(user, actionType, targetName, details, ip = "") {
  if (!user) return;
  const username = user.username || "unknown";
  const name = user.name || "알수없음";
  const pos = user.position || "팀원";

  db.run(
    "INSERT INTO activity_logs (username, name, position, action_type, target_name, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [username, name, pos, actionType, targetName || "", details || "", ip],
    (err) => {
      if (err) console.error("Failed to record activity log:", err);
    }
  );
}

module.exports = { db, initDb, logActivity };
