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
        role TEXT NOT NULL DEFAULT "manager",
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

    // 3. Maintenance Logs Table
    db.run(`
      CREATE TABLE IF NOT EXISTS maintenance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id INTEGER,
        task_key TEXT,
        is_done INTEGER,
        done_date TEXT,
        username TEXT,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed Initial Users if empty
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) return console.error("Error checking users count:", err);
      if (row.count === 0) {
        console.log("Seeding default team accounts...");
        const defaultUsers = [
          { u: "admin", p: "admin1234", name: "관리자 (총괄)", role: "admin", reg: "all" },
          { u: "han_manager", p: "user1234", name: "한강권역 담당자", role: "manager", reg: "한강" },
          { u: "nakdong_manager", p: "user1234", name: "낙동강권역 담당자", role: "manager", reg: "낙동강" },
          { u: "geum_manager", p: "user1234", name: "금강권역 담당자", role: "manager", reg: "금강" },
          { u: "yeongsan_manager", p: "user1234", name: "영산강권역 담당자", role: "manager", reg: "영산강" },
          { u: "viewer", p: "viewer1234", name: "현장 조회자", role: "viewer", reg: "all" }
        ];

        const stmt = db.prepare("INSERT INTO users (username, password_hash, name, role, region) VALUES (?, ?, ?, ?, ?)");
        defaultUsers.forEach(user => {
          const hash = bcrypt.hashSync(user.p, 10);
          stmt.run(user.u, hash, user.name, user.role, user.reg);
        });
        stmt.finalize();
        console.log("Team accounts seeded successfully.");
      }
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
  });
}

module.exports = { db, initDb };
