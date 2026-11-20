const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

// 1. Supabase Connection Settings
const SUPABASE_URL = process.env.SUPABASE_URL || "https://yillotmxhrchjvslgvym.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_xydgPFAE_mWsyDJYnawu1g_yzJDOCR_";

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    console.log("☁️ Supabase PostgreSQL Cloud DB Client Initialized.");
  } catch (e) {
    console.warn("⚠️ Supabase init warning:", e.message);
  }
}

// 2. Local SQLite Fallback
const localDbPath = path.join(__dirname, "../data/khydro.db");
const sqliteDb = new sqlite3.Database(localDbPath);

const officialUsers = [
  { u: "green", p: "green0617!", name: "관리자 (총괄)", pos: "최고관리자", role: "admin", team: "수자원인프라팀", email: "" },
  { u: "kihsa", p: "kihsa12#$", name: "송재현", pos: "실장", role: "manager", team: "수자원기획실", email: "" },
  { u: "kihs01", p: "kihs01", name: "윤영선", pos: "팀장", role: "member", team: "수자원인프라팀", email: "" },
  { u: "kihs02", p: "kihs02", name: "이동오", pos: "팀원", role: "member", team: "수자원인프라팀", email: "" },
  { u: "kihs03", p: "kihs03", name: "나형욱", pos: "팀원", role: "member", team: "수자원인프라팀", email: "" },
  { u: "kihs04", p: "kihs04", name: "박세찬", pos: "팀원", role: "member", team: "수자원인프라팀", email: "" },
  { u: "test", p: "test2026", name: "테스트", pos: "팀원", role: "member", team: "수자원인프라팀", email: "" }
];

async function initDb() {
  // A. Initialize Local SQLite (Always prepared as offline/local store)
  sqliteDb.serialize(() => {
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        position TEXT DEFAULT "팀원",
        role TEXT NOT NULL DEFAULT "member",
        region TEXT DEFAULT "all",
        team TEXT DEFAULT "수자원인프라팀",
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure email column exists if users table was already created
    sqliteDb.run(`ALTER TABLE users ADD COLUMN email TEXT`, () => {});

    // Ensure legacy 'admin' account is removed from local SQLite
    sqliteDb.run(`DELETE FROM users WHERE username = 'admin'`, () => {});

    // Seed official users in SQLite (Email left empty for user direct input)
    for (const u of officialUsers) {
      const hash = bcrypt.hashSync(u.p, 10);
      sqliteDb.run(
        `INSERT OR IGNORE INTO users (username, password_hash, name, position, role, team, email)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [u.u, hash, u.name, u.pos, u.role, u.team, ""]
      );
    }

    sqliteDb.run(`
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
        mount_type TEXT DEFAULT "-",
        shelter_type TEXT DEFAULT "-",
        memo TEXT,
        lat REAL,
        lon REAL,
        lat_dms TEXT,
        lon_dms TEXT,
        maintenance_json TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure columns exist in SQLite if migrated
    sqliteDb.run(`ALTER TABLE stations ADD COLUMN mount_type TEXT DEFAULT "-"`, () => {});
    sqliteDb.run(`ALTER TABLE stations ADD COLUMN shelter_type TEXT DEFAULT "-"`, () => {});
    sqliteDb.run(`ALTER TABLE stations ADD COLUMN ewsv_wireless INTEGER DEFAULT 0`, () => {});

    sqliteDb.run(`
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

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        station_id TEXT,
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

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS maintenance_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id INTEGER NOT NULL,
        station_name TEXT NOT NULL,
        issue_date TEXT,
        action_date TEXT NOT NULL,
        action_type TEXT NOT NULL,
        category TEXT DEFAULT "전원·안전",
        target_equipment TEXT,
        description TEXT NOT NULL,
        actor_type TEXT DEFAULT "기술원(자체)",
        worker_name TEXT,
        result_status TEXT DEFAULT "완료",
        cost INTEGER DEFAULT 0,
        memo TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure issue_date, cause_category, and action_method columns exist if table was previously created
    sqliteDb.run(`ALTER TABLE maintenance_history ADD COLUMN issue_date TEXT`, () => {});
    sqliteDb.run(`ALTER TABLE maintenance_history ADD COLUMN cause_category TEXT`, () => {});
    sqliteDb.run(`ALTER TABLE maintenance_history ADD COLUMN action_method TEXT`, () => {});

    // Quality Monitoring Hourly Snapshots Table (Diff alert & 30-day retention)
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS quality_hourly_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hourly_slot TEXT NOT NULL,
        st_code TEXT NOT NULL,
        station_name TEXT NOT NULL,
        gauge_type TEXT DEFAULT "ADVM",
        region TEXT DEFAULT "전국",
        rule_id TEXT NOT NULL,
        category TEXT NOT NULL,
        continuous_count INTEGER DEFAULT 6,
        problem_detail TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_quality_snapshots_slot ON quality_hourly_snapshots (hourly_slot)`);

    // Equipment & Asset Management Tables
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS equipment_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id TEXT UNIQUE NOT NULL,
        station_id INTEGER,
        station_name TEXT,
        station_code TEXT,
        category TEXT NOT NULL,
        category_name TEXT NOT NULL,
        item_name TEXT,
        manage_no TEXT,
        model_name TEXT,
        spec TEXT,
        serial_no TEXT,
        asset_no TEXT,
        asset_no_temp TEXT,
        quantity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'OPERATING',
        status_label TEXT DEFAULT '운영중',
        location TEXT,
        acquisition_date TEXT,
        acquisition_cost INTEGER DEFAULT 0,
        lifespan_years INTEGER DEFAULT 0,
        lifespan_end_year TEXT,
        is_lifespan_over INTEGER DEFAULT 0,
        calib_status TEXT DEFAULT 'pending',
        recent_calib_date TEXT,
        calib_cert_no TEXT,
        calib_expire_date TEXT,
        version INTEGER DEFAULT 1,
        memo TEXT,
        source_sheet TEXT,
        source_row INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS equipment_work (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_no TEXT UNIQUE NOT NULL,
        station_id INTEGER,
        station_name TEXT,
        station_code TEXT,
        work_date TEXT NOT NULL,
        work_type TEXT NOT NULL,
        workers TEXT,
        summary TEXT NOT NULL,
        detail_raw TEXT,
        source_ref TEXT,
        created_by TEXT DEFAULT '관리자',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS equipment_action (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_id INTEGER NOT NULL,
        equipment_id TEXT,
        action_category TEXT,
        action_code TEXT NOT NULL,
        action_name TEXT NOT NULL,
        before_model TEXT,
        before_sn TEXT,
        after_model TEXT,
        after_sn TEXT,
        part_name TEXT,
        part_qty INTEGER DEFAULT 1,
        param_change TEXT,
        detail_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS equipment_repair (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repair_no TEXT UNIQUE NOT NULL,
        equipment_id TEXT NOT NULL,
        equipment_name TEXT,
        station_id INTEGER,
        station_name TEXT,
        stage TEXT DEFAULT '접수',
        vendor TEXT,
        issue_desc TEXT,
        received_date TEXT NOT NULL,
        target_date TEXT,
        completed_date TEXT,
        cost INTEGER DEFAULT 0,
        action_memo TEXT,
        created_by TEXT DEFAULT '관리자',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS equipment_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        before_value TEXT,
        after_value TEXT,
        changed_by TEXT NOT NULL,
        reason TEXT,
        source TEXT DEFAULT 'UI',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS equipment_upload_batch (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        total_rows INTEGER DEFAULT 0,
        changed_rows INTEGER DEFAULT 0,
        unchanged_rows INTEGER DEFAULT 0,
        error_rows INTEGER DEFAULT 0,
        conflict_rows INTEGER DEFAULT 0,
        status TEXT DEFAULT 'VALIDATED',
        summary_json TEXT,
        applied_by TEXT,
        applied_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Equipment Calibration History Table (연도별 누적 검정 이력 관리)
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS equipment_calibration_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id TEXT NOT NULL,
        station_id INTEGER,
        station_name TEXT,
        category TEXT NOT NULL,
        model_name TEXT,
        serial_no TEXT,
        calib_date TEXT NOT NULL,
        cycle_years INTEGER DEFAULT 2,
        expire_date TEXT NOT NULL,
        agency TEXT DEFAULT '한국수자원조사기술원',
        cert_no TEXT,
        result_status TEXT DEFAULT '합격',
        calib_cost INTEGER DEFAULT 0,
        memo TEXT,
        created_by TEXT DEFAULT '관리자',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed initial calibration history from existing equipment_master records (1회차 기본 이력 자동 적재)
    sqliteDb.run(`
      INSERT OR IGNORE INTO equipment_calibration_history 
        (equipment_id, station_id, station_name, category, model_name, serial_no, calib_date, cycle_years, expire_date, agency, cert_no, result_status, memo, created_by)
      SELECT 
        equipment_id, station_id, station_name, category, model_name, serial_no, recent_calib_date, 
        CASE WHEN category = 'FLOWMETER' THEN 2 ELSE 3 END,
        calib_expire_date, '한국수자원조사기술원', calib_cert_no, '합격', 
        CASE WHEN calib_cert_no LIKE '%취득%' THEN '취득년도 기준 초기 산정 이력' ELSE '물품관리대장 기재 검정 이력' END,
        '시스템초기화'
      FROM equipment_master
      WHERE category IN ('FLOWMETER', 'WATER_LEVEL')
        AND recent_calib_date IS NOT NULL AND recent_calib_date != '' AND recent_calib_date != '-'
        AND NOT EXISTS (
          SELECT 1 FROM equipment_calibration_history h WHERE h.equipment_id = equipment_master.equipment_id
        )
    `);

    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_station ON equipment_master (station_id)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_station_code ON equipment_master (station_code)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_category ON equipment_master (category)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_sn ON equipment_master (serial_no)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_status ON equipment_master (status)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_work_st ON equipment_work (station_id)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_action_work ON equipment_action (work_id)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_calib_hist_eq ON equipment_calibration_history (equipment_id)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_eq_calib_hist_date ON equipment_calibration_history (calib_date)`);

    // -------------------------------------------------------------
    // Monitoring Error Response Ledger (오류관리대장 & Rule_Codebook & 시설목록)
    // -------------------------------------------------------------
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS station_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_code TEXT UNIQUE NOT NULL,
        station_name TEXT NOT NULL,
        region TEXT,
        install_method TEXT,
        assigned_team TEXT,
        assigned_manager TEXT,
        standard_name TEXT,
        memo TEXT
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS error_rule_codebook (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_code TEXT UNIQUE NOT NULL,
        equipment_type TEXT DEFAULT '공통',
        auto_rule TEXT DEFAULT '-',
        standard_name TEXT NOT NULL,
        criteria TEXT,
        legacy_code TEXT,
        code_type TEXT,
        default_priority TEXT DEFAULT '보통',
        check_points TEXT,
        recommended_action TEXT,
        usage_status TEXT DEFAULT '사용',
        memo TEXT
      )
    `);

    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS monitoring_error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id INTEGER,
        station_code TEXT,
        station_name TEXT NOT NULL,
        region TEXT,
        install_method TEXT,
        assigned_team TEXT,
        assigned_manager TEXT,
        check_date TEXT NOT NULL,
        first_occur_date TEXT NOT NULL,
        discoverer TEXT DEFAULT '미기록',
        error_code TEXT NOT NULL,
        error_name TEXT NOT NULL,
        error_status TEXT DEFAULT '조치요청',
        priority TEXT DEFAULT '높음',
        logger_status TEXT DEFAULT '-',
        sender_status TEXT DEFAULT '-',
        phenomenon TEXT DEFAULT '결측',
        cause_basis TEXT DEFAULT '-',
        action_request TEXT DEFAULT '-',
        action_actor_category TEXT DEFAULT '용역사(RNS)',
        end_date TEXT DEFAULT '',
        duration_days INTEGER,
        memo TEXT DEFAULT '',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    sqliteDb.run(`ALTER TABLE monitoring_error_logs ADD COLUMN actual_worker TEXT DEFAULT ''`, () => {});
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_mon_err_st_code ON monitoring_error_logs (station_code)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_mon_err_st_name ON monitoring_error_logs (station_name)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_mon_err_status ON monitoring_error_logs (error_status)`);
    sqliteDb.run(`CREATE INDEX IF NOT EXISTS idx_mon_err_first_date ON monitoring_error_logs (first_occur_date)`);

    // Seed from data/monitoring_error_seed.json if empty
    const monSeedPath = path.join(__dirname, "../data/monitoring_error_seed.json");
    if (fs.existsSync(monSeedPath)) {
      try {
        const seedRaw = JSON.parse(fs.readFileSync(monSeedPath, "utf-8"));

        sqliteDb.get("SELECT COUNT(*) as cnt FROM station_assignments", (err, row) => {
          if (!err && row && row.cnt === 0 && Array.isArray(seedRaw.stationAssignments)) {
            const stmt = sqliteDb.prepare(`
              INSERT OR IGNORE INTO station_assignments
              (station_code, station_name, region, install_method, assigned_team, assigned_manager, standard_name, memo)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const sa of seedRaw.stationAssignments) {
              stmt.run([
                sa.station_code, sa.station_name, sa.region, sa.install_method,
                sa.assigned_team, sa.assigned_manager, sa.standard_name, sa.memo || ""
              ]);
            }
            stmt.finalize();
            console.log(`✓ [SQLite] Seeded ${seedRaw.stationAssignments.length} station assignment records.`);
          }
        });

        sqliteDb.get("SELECT COUNT(*) as cnt FROM error_rule_codebook", (err, row) => {
          if (!err && row && row.cnt === 0 && Array.isArray(seedRaw.ruleCodebook)) {
            const stmt = sqliteDb.prepare(`
              INSERT OR IGNORE INTO error_rule_codebook
              (rule_code, equipment_type, auto_rule, standard_name, criteria, legacy_code, code_type, default_priority, check_points, recommended_action, usage_status, memo)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const rc of seedRaw.ruleCodebook) {
              stmt.run([
                rc.rule_code, rc.equipment_type, rc.auto_rule, rc.standard_name,
                rc.criteria, rc.legacy_code, rc.code_type, rc.default_priority,
                rc.check_points, rc.recommended_action, rc.usage_status, rc.memo || ""
              ]);
            }
            stmt.finalize();
            console.log(`✓ [SQLite] Seeded ${seedRaw.ruleCodebook.length} error rule codebook entries.`);
          }
        });

        sqliteDb.get("SELECT COUNT(*) as cnt FROM monitoring_error_logs", (err, row) => {
          if (!err && row && row.cnt === 0 && Array.isArray(seedRaw.errorLogs)) {
            sqliteDb.all("SELECT id, code, name FROM stations", (stErr, stRows) => {
              const codeMap = new Map();
              const nameMap = new Map();
              if (!stErr && stRows) {
                for (const s of stRows) {
                  if (s.code) codeMap.set(String(s.code).trim(), s.id);
                  if (s.name) nameMap.set(String(s.name).trim(), s.id);
                }
              }
              const stmt = sqliteDb.prepare(`
                INSERT INTO monitoring_error_logs
                (station_id, station_code, station_name, region, install_method, assigned_team, assigned_manager,
                 check_date, first_occur_date, discoverer, error_code, error_name, error_status, priority,
                 logger_status, sender_status, phenomenon, cause_basis, action_request, action_actor_category,
                 end_date, duration_days, memo, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              for (const log of seedRaw.errorLogs) {
                const stId = codeMap.get(String(log.station_code).trim()) || nameMap.get(String(log.station_name).trim()) || null;
                stmt.run([
                  stId, log.station_code, log.station_name, log.region, log.install_method,
                  log.assigned_team, log.assigned_manager, log.check_date, log.first_occur_date,
                  log.discoverer, log.error_code, log.error_name, log.error_status, log.priority,
                  log.logger_status, log.sender_status, log.phenomenon, log.cause_basis,
                  log.action_request, log.action_actor_category, log.end_date || "",
                  log.duration_days, log.memo || "", "엑셀초기이관"
                ]);
              }
              stmt.finalize();
              console.log(`✓ [SQLite] Seeded ${seedRaw.errorLogs.length} monitoring error logs (오류관리대장).`);
            });
          }
        });
      } catch (seedErr) {
        console.warn("⚠️ Monitoring error seed warning:", seedErr.message);
      }
    }

    // 7. Email Notification Logs Table (Persistent Email Dispatch History)
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS email_notification_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        station_name TEXT,
        level TEXT,
        count INTEGER DEFAULT 0,
        subject TEXT,
        recipients TEXT,
        status TEXT,
        mode TEXT,
        error_msg TEXT,
        message_id TEXT,
        opened_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      const emailSeedPath = path.join(__dirname, "../data/email_history_seed_73.json");
      if (fs.existsSync(emailSeedPath)) {
        sqliteDb.get("SELECT COUNT(*) AS cnt FROM email_notification_logs", [], (err, row) => {
          if (!err && (!row || row.cnt === 0)) {
            try {
              const seedItems = JSON.parse(fs.readFileSync(emailSeedPath, "utf-8"));
              sqliteDb.serialize(() => {
                const stmt = sqliteDb.prepare(`
                  INSERT OR REPLACE INTO email_notification_logs
                  (id, timestamp, station_name, level, count, subject, recipients, status, mode, error_msg, message_id, opened_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                for (const item of seedItems) {
                  stmt.run([
                    item.id,
                    item.timestamp,
                    item.stationName || "전국 관측소 정기 종합 리포트",
                    item.level || "DIGEST",
                    Number(item.count) || 0,
                    item.subject || "",
                    item.recipients || "",
                    item.status || "DELIVERED",
                    item.mode || "HTTP_API (Brevo)",
                    item.error || "",
                    item.messageId || item.id,
                    item.openedAt || ""
                  ]);
                }
                stmt.finalize();
                console.log(`✓ [SQLite] Seeded ${seedItems.length} historical email digest logs.`);
              });
            } catch (e) {
              console.warn("⚠️ Email history seed warning:", e.message);
            }
          }
        });
      }
    });
  });

  // B. Seed Supabase Cloud DB
  if (supabase) {
    try {
      // 1. Seed Users in Supabase
      const { data: existingUsers, error: uErr } = await supabase.from("users").select("username");
      if (!uErr) {
        const existingMap = new Map((existingUsers || []).map(u => [u.username, u]));
        for (const user of officialUsers) {
          const hash = bcrypt.hashSync(user.p, 10);
          if (!existingMap.has(user.u)) {
            await supabase.from("users").insert({
              username: user.u,
              password_hash: hash,
              name: user.name,
              position: user.pos,
              role: user.role,
              team: user.team
            });
          }
        }
        console.log("✓ [Supabase] Official accounts verified in cloud.");
      }

      // 2. Seed Stations in Supabase (if empty)
      const { count, error: sCountErr } = await supabase.from("stations").select("*", { count: "exact", head: true });
      if (!sCountErr && (count === 0 || count === null)) {
        console.log("Seeding initial 223 stations into Supabase Cloud...");
        const jsonPath = path.join(__dirname, "../data/stations_initial.json");
        if (fs.existsSync(jsonPath)) {
          const rawData = fs.readFileSync(jsonPath, "utf-8");
          const stations = JSON.parse(rawData);

          const stationRows = stations.map(st => ({
            id: st.id,
            seq: st.seq || st.id,
            region: st.region || "",
            river: st.river || "",
            name: st.name || "",
            code: st.code || "",
            address: st.address || "",
            install_year: st.installYear || "",
            obs_start_year: st.obsStartYear || "",
            is_operating: st.isOperating2026 ? 1 : 0,
            gauge_type: st.gaugeType || "",
            is_dual: st.isDualGauge ? 1 : 0,
            advm_count: st.advmCount || "",
            ewsv_count: st.ewsvCount || "",
            calib_2026: st.calib2026 ? 1 : 0,
            calib_count: st.calibCount2026 || "",
            calib_status: st.calibrationStatus || "pending",
            calib_date: st.calibrationDate || "",
            solar_install: st.solarInstall ? 1 : 0,
            flood_alert: st.floodAlert ? 1 : 0,
            drought_alert: st.droughtAlert ? 1 : 0,
            pollution_total: st.pollutionTotal ? 1 : 0,
            water_level_type: st.waterLevelType || "",
            ref_water_level: st.refWaterLevel || "",
            mount_type: st.mountType || "-",
            shelter_type: st.shelterType || "-",
            memo: st.memo || "",
            lat: st.coords?.lat || null,
            lon: st.coords?.lon || null,
            lat_dms: st.coords?.latDMS || "",
            lon_dms: st.coords?.lonDMS || "",
            maintenance_json: JSON.stringify(st.maintenance || {})
          }));

          // Batch insert into Supabase in chunks of 50
          for (let i = 0; i < stationRows.length; i += 50) {
            const chunk = stationRows.slice(i, i + 50);
            await supabase.from("stations").upsert(chunk);
          }
          console.log(`✓ [Supabase] 223 stations successfully seeded into Cloud DB.`);
        }
      }
    } catch (e) {
      console.warn("⚠️ [Supabase] Seeding warning:", e.message);
    }
  }
}

// Unified Async Data Access Layer
const dbService = {
  // Users
  async getUserByUsername(username) {
    if (username === "admin") {
      // Legacy admin username is permanently disabled and replaced by 'green'
      return null;
    }
    let cloudUser = null;
    if (supabase) {
      const { data, error } = await supabase.from("users").select("*").eq("username", username).maybeSingle();
      if (!error && data) cloudUser = data;
    }
    const localUser = await new Promise((resolve, reject) => {
      sqliteDb.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (cloudUser) {
      return {
        ...cloudUser,
        email: cloudUser.email || (localUser ? localUser.email : "") || ""
      };
    }
    return localUser;
  },

  async getUserByUsernameAndEmail(username, email) {
    const cleanUser = (username || "").trim();
    if (cleanUser === "admin") return null;
    const cleanEmail = (email || "").trim().toLowerCase();

    // 1. Check local SQLite (has real email column)
    const localUser = await new Promise((resolve, reject) => {
      sqliteDb.get(
        "SELECT * FROM users WHERE username = ? AND LOWER(TRIM(COALESCE(email, ''))) = LOWER(TRIM(?))",
        [cleanUser, cleanEmail],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });
    if (localUser) return localUser;

    // 2. Check Supabase
    if (supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", cleanUser)
        .ilike("email", cleanEmail)
        .maybeSingle();
      if (!error && data) return data;
    }
    return null;
  },

  async updateUserProfile(username, fields) {
    const updateObj = {};
    if (fields.email !== undefined) updateObj.email = (fields.email || "").trim();
    if (fields.name !== undefined) updateObj.name = fields.name.trim();
    if (fields.position !== undefined) updateObj.position = fields.position.trim();
    if (fields.team !== undefined) updateObj.team = fields.team.trim();

    if (supabase) {
      const { error } = await supabase.from("users").update(updateObj).eq("username", username);
      if (error) console.warn("Supabase user profile update warning:", error.message);
    }

    const keys = Object.keys(updateObj);
    if (keys.length === 0) return true;
    const setClause = keys.map(k => `${k} = ?`).join(", ");
    const values = keys.map(k => updateObj[k]);
    values.push(username);

    return new Promise((resolve, reject) => {
      sqliteDb.run(`UPDATE users SET ${setClause} WHERE username = ?`, values, function(err) {
        if (err) return reject(err);
        resolve(true);
      });
    });
  },

  async updateUserPassword(username, newPasswordHash) {
    if (supabase) {
      const { error } = await supabase.from("users").update({ password_hash: newPasswordHash }).eq("username", username);
      if (error) console.warn("Supabase user password update warning:", error.message);
    }

    return new Promise((resolve, reject) => {
      sqliteDb.run("UPDATE users SET password_hash = ? WHERE username = ?", [newPasswordHash, username], function(err) {
        if (err) return reject(err);
        resolve(true);
      });
    });
  },

  // Stations
  async getAllStations() {
    if (supabase) {
      const { data, error } = await supabase.from("stations").select("*").order("seq", { ascending: true });
      if (!error && data && data.length > 0) return data;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM stations ORDER BY seq ASC", (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  async getStationById(id) {
    if (supabase) {
      const { data, error } = await supabase.from("stations").select("*").eq("id", id).maybeSingle();
      if (!error && data) return data;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.get("SELECT * FROM stations WHERE id = ?", [id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  },

  async updateStation(id, updateFields) {
    if (supabase) {
      const supabaseFields = { ...updateFields };
      delete supabaseFields.mount_type;
      delete supabaseFields.shelter_type;
      delete supabaseFields.rv_box_installed;
      delete supabaseFields.rv_box_agents;
      delete supabaseFields.ewsv_wireless;
      const { data, error } = await supabase.from("stations").update(supabaseFields).eq("id", id).select();
      if (error) console.warn("Supabase update warning:", error.message);
    }
    // Also always update local SQLite
    const keys = Object.keys(updateFields);
    const values = Object.values(updateFields);
    const setClause = keys.map(k => `${k} = ?`).join(", ");
    values.push(id);
    return new Promise((resolve, reject) => {
      sqliteDb.run(`UPDATE stations SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values, function(err) {
        if (err) return reject(err);
        resolve({ id, changes: this.changes });
      });
    });
  },

  async upsertStation(id, updateFields) {
    if (supabase) {
      const supabaseFields = { id, ...updateFields };
      delete supabaseFields.mount_type;
      delete supabaseFields.shelter_type;
      delete supabaseFields.rv_box_installed;
      delete supabaseFields.rv_box_agents;
      delete supabaseFields.ewsv_wireless;
      const { error } = await supabase.from("stations").upsert(supabaseFields, { onConflict: "id" });
      if (error) console.warn("Supabase upsert warning:", error.message);
    }
    const keys = Object.keys(updateFields);
    const values = Object.values(updateFields);
    const setClause = keys.map(k => `${k} = ?`).join(", ");
    const updateVals = [...values, id];
    return new Promise((resolve, reject) => {
      sqliteDb.run(`UPDATE stations SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, updateVals, function(err) {
        if (err) return reject(err);
        if (this.changes > 0) return resolve({ id, changes: this.changes });
        const insKeys = ["id", ...keys];
        const placeholders = insKeys.map(() => "?").join(", ");
        sqliteDb.run(`INSERT INTO stations (${insKeys.join(", ")}) VALUES (${placeholders})`, [id, ...values], function(insErr) {
          if (insErr) return reject(insErr);
          resolve({ id, changes: 1, inserted: true });
        });
      });
    });
  },

  async deleteStation(id) {
    if (supabase) {
      const { error } = await supabase.from("stations").delete().eq("id", id);
      if (error) console.warn("Supabase station delete warning:", error.message);
    }
    return new Promise((resolve, reject) => {
      sqliteDb.run("DELETE FROM stations WHERE id = ?", [id], function(err) {
        if (err) return reject(err);
        resolve({ id, changes: this.changes });
      });
    });
  },

  async resetStationsToInitial() {
    const jsonPath = path.join(__dirname, "../data/stations_initial.json");
    if (!fs.existsSync(jsonPath)) {
      throw new Error("초기 데이터 파일(stations_initial.json)을 찾을 수 없습니다.");
    }
    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const stations = JSON.parse(rawData);

    // 1. Reset SQLite DB
    await new Promise((resolve, reject) => {
      sqliteDb.run("DELETE FROM stations", (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    for (const st of stations) {
      const stmt = `INSERT INTO stations (
        id, seq, region, river, name, code, address,
        install_year, obs_start_year, is_operating, gauge_type, is_dual,
        advm_count, ewsv_count, ewsv_wireless, calib_2026, calib_count, calib_status, calib_date,
        solar_install, flood_alert, drought_alert, pollution_total,
        water_level_type, ref_water_level, mount_type, shelter_type,
        memo, lat, lon, lat_dms, lon_dms, maintenance_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const values = [
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
        st.ewsvWireless ? 1 : 0,
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
        st.mountType || "-",
        st.shelterType || "-",
        st.memo || "",
        st.coords?.lat || null,
        st.coords?.lon || null,
        st.coords?.latDMS || "",
        st.coords?.lonDMS || "",
        JSON.stringify(st.maintenance || {})
      ];

      await new Promise((resolve, reject) => {
        sqliteDb.run(stmt, values, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    // 2. Reset Supabase Cloud DB if connected
    if (supabase) {
      try {
        await supabase.from("stations").delete().neq("id", 0);
        const stationRows = stations.map(st => ({
          id: st.id,
          seq: st.seq || st.id,
          region: st.region || "",
          river: st.river || "",
          name: st.name || "",
          code: st.code || "",
          address: st.address || "",
          install_year: st.installYear || "",
          obs_start_year: st.obsStartYear || "",
          is_operating: st.isOperating2026 ? 1 : 0,
          gauge_type: st.gaugeType || "",
          is_dual: st.isDualGauge ? 1 : 0,
          advm_count: st.advmCount || "",
          ewsv_count: st.ewsvCount || "",
          calib_2026: st.calib2026 ? 1 : 0,
          calib_count: st.calibCount2026 || "",
          calib_status: st.calibrationStatus || "pending",
          calib_date: st.calibrationDate || "",
          solar_install: st.solarInstall ? 1 : 0,
          flood_alert: st.floodAlert ? 1 : 0,
          drought_alert: st.droughtAlert ? 1 : 0,
          pollution_total: st.pollutionTotal ? 1 : 0,
          water_level_type: st.waterLevelType || "",
          ref_water_level: st.refWaterLevel || "",
          memo: st.memo || "",
          lat: st.coords?.lat || null,
          lon: st.coords?.lon || null,
          lat_dms: st.coords?.latDMS || "",
          lon_dms: st.coords?.lonDMS || "",
          maintenance_json: JSON.stringify(st.maintenance || {})
        }));
        await supabase.from("stations").insert(stationRows);
      } catch (e) {
        console.warn("Supabase reset warning:", e);
      }
    }

    return stations;
  },

  // Schedules (Persistent Calendar)
  async getAllSchedules() {
    if (supabase) {
      const { data, error } = await supabase.from("schedules").select("*").order("start_date", { ascending: true });
      if (!error && data) return data;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM schedules ORDER BY start_date ASC", (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  async createSchedule(s) {
    let cloudData = null;
    if (supabase) {
      const { data, error } = await supabase.from("schedules").insert([{
        title: s.title,
        station_id: s.station_id ? String(s.station_id) : "",
        station_name: s.station_name || "",
        schedule_type: s.schedule_type,
        start_date: s.start_date,
        end_date: s.end_date || s.start_date,
        assignee: s.assignee,
        attendees: s.attendees || "",
        status: s.status || "scheduled",
        description: s.description || "",
        created_by: s.created_by
      }]).select().single();
      if (!error && data) cloudData = data;
    }
    const localData = await new Promise((resolve, reject) => {
      const explicitId = cloudData && cloudData.id ? cloudData.id : null;
      const sql = explicitId
        ? `INSERT OR REPLACE INTO schedules (id, title, station_id, station_name, schedule_type, start_date, end_date, assignee, attendees, status, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO schedules (title, station_id, station_name, schedule_type, start_date, end_date, assignee, attendees, status, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = explicitId
        ? [explicitId, s.title, String(s.station_id||""), s.station_name||"", s.schedule_type, s.start_date, s.end_date||s.start_date, s.assignee, s.attendees||"", s.status||"scheduled", s.description||"", s.created_by]
        : [s.title, String(s.station_id||""), s.station_name||"", s.schedule_type, s.start_date, s.end_date||s.start_date, s.assignee, s.attendees||"", s.status||"scheduled", s.description||"", s.created_by];
      sqliteDb.run(sql, params, function(err) {
        if (err) return reject(err);
        resolve({ id: explicitId || this.lastID, ...s });
      });
    });
    return cloudData || localData;
  },

  async updateSchedule(id, s) {
    let cloudData = null;
    if (supabase) {
      const { data, error } = await supabase.from("schedules").update({
        title: s.title,
        station_id: s.station_id ? String(s.station_id) : "",
        station_name: s.station_name || "",
        schedule_type: s.schedule_type,
        start_date: s.start_date,
        end_date: s.end_date || s.start_date,
        assignee: s.assignee,
        attendees: s.attendees || "",
        status: s.status || "scheduled",
        description: s.description || "",
        updated_at: new Date().toISOString()
      }).eq("id", id).select().single();
      if (!error && data) cloudData = data;
    }
    const localData = await new Promise((resolve, reject) => {
      sqliteDb.run(`
        UPDATE schedules 
        SET title = ?, station_id = ?, station_name = ?, schedule_type = ?, start_date = ?, end_date = ?, assignee = ?, attendees = ?, status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [s.title, String(s.station_id||""), s.station_name||"", s.schedule_type, s.start_date, s.end_date||s.start_date, s.assignee, s.attendees||"", s.status||"scheduled", s.description||"", id], function(err) {
        if (err) return reject(err);
        resolve({ id, ...s });
      });
    });
    return cloudData || localData;
  },

  async deleteSchedule(id) {
    if (supabase) {
      await supabase.from("schedules").delete().eq("id", id);
    }
    return new Promise((resolve, reject) => {
      sqliteDb.run("DELETE FROM schedules WHERE id = ?", [id], function(err) {
        if (err) return reject(err);
        resolve(true);
      });
    });
  },

  // ========================================================
  // Maintenance History (관측시설별 유지관리 조치 내역)
  // ========================================================
  async getAllMaintenanceHistory(options = {}) {
    const limit = options.limit || 500;
    if (supabase) {
      let query = supabase.from("maintenance_history").select("*").order("action_date", { ascending: false }).limit(limit);
      if (options.stationId && options.stationId !== "all") query = query.eq("station_id", parseInt(options.stationId, 10));
      if (options.actionType && options.actionType !== "all") query = query.eq("action_type", options.actionType);
      if (options.category && options.category !== "all") query = query.eq("category", options.category);
      if (options.actorType && options.actorType !== "all") query = query.eq("actor_type", options.actorType);
      if (options.resultStatus && options.resultStatus !== "all") query = query.eq("result_status", options.resultStatus);
      const { data, error } = await query;
      if (!error && data) return data;
    }

    return new Promise((resolve, reject) => {
      let q = "SELECT * FROM maintenance_history";
      let p = [];
      let conds = [];

      if (options.stationId && options.stationId !== "all") {
        conds.push("station_id = ?");
        p.push(parseInt(options.stationId, 10));
      }
      if (options.actionType && options.actionType !== "all") {
        conds.push("action_type = ?");
        p.push(options.actionType);
      }
      if (options.category && options.category !== "all") {
        conds.push("category = ?");
        p.push(options.category);
      }
      if (options.actorType && options.actorType !== "all") {
        conds.push("actor_type = ?");
        p.push(options.actorType);
      }
      if (options.resultStatus && options.resultStatus !== "all") {
        conds.push("result_status = ?");
        p.push(options.resultStatus);
      }
      if (options.startDate) {
        conds.push("action_date >= ?");
        p.push(options.startDate);
      }
      if (options.endDate) {
        conds.push("action_date <= ?");
        p.push(options.endDate);
      }
      if (options.keyword) {
        conds.push("(station_name LIKE ? OR description LIKE ? OR target_equipment LIKE ? OR worker_name LIKE ?)");
        const kw = `%${options.keyword}%`;
        p.push(kw, kw, kw, kw);
      }

      if (conds.length > 0) q += " WHERE " + conds.join(" AND ");
      q += " ORDER BY action_date DESC, id DESC LIMIT ?";
      p.push(limit);

      sqliteDb.all(q, p, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  async getMaintenanceHistoryByStation(stationId) {
    const stId = parseInt(stationId, 10);
    if (supabase) {
      const { data, error } = await supabase.from("maintenance_history").select("*").eq("station_id", stId).order("action_date", { ascending: false });
      if (!error && data) return data;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM maintenance_history WHERE station_id = ? ORDER BY action_date DESC, id DESC", [stId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  async createMaintenanceHistory(log) {
    const record = {
      station_id: parseInt(log.station_id, 10),
      station_name: log.station_name || "",
      issue_date: log.issue_date || log.action_date || new Date().toISOString().slice(0, 10),
      action_date: log.action_date || new Date().toISOString().slice(0, 10),
      action_type: log.action_type || "정기점검",
      category: log.category || "전원·안전",
      cause_category: log.cause_category || "기타/일반",
      target_equipment: log.target_equipment || "",
      action_method: log.action_method || "",
      description: log.description || "",
      actor_type: log.actor_type || "기술원(자체)",
      worker_name: log.worker_name || "",
      result_status: log.result_status || "완료",
      cost: parseInt(log.cost, 10) || 0,
      memo: log.memo || "",
      created_by: log.created_by || "관리자"
    };

    let cloudData = null;
    if (supabase) {
      const { data, error } = await supabase.from("maintenance_history").insert([record]).select().single();
      if (!error && data) cloudData = data;
    }

    const localData = await new Promise((resolve, reject) => {
      const explicitId = cloudData && cloudData.id ? cloudData.id : null;
      const sql = explicitId
        ? `INSERT OR REPLACE INTO maintenance_history (id, station_id, station_name, issue_date, action_date, action_type, category, cause_category, target_equipment, action_method, description, actor_type, worker_name, result_status, cost, memo, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO maintenance_history (station_id, station_name, issue_date, action_date, action_type, category, cause_category, target_equipment, action_method, description, actor_type, worker_name, result_status, cost, memo, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      const params = explicitId
        ? [explicitId, record.station_id, record.station_name, record.issue_date, record.action_date, record.action_type, record.category, record.cause_category, record.target_equipment, record.action_method, record.description, record.actor_type, record.worker_name, record.result_status, record.cost, record.memo, record.created_by]
        : [record.station_id, record.station_name, record.issue_date, record.action_date, record.action_type, record.category, record.cause_category, record.target_equipment, record.action_method, record.description, record.actor_type, record.worker_name, record.result_status, record.cost, record.memo, record.created_by];
      sqliteDb.run(sql, params, function(err) {
        if (err) return reject(err);
        resolve({ id: explicitId || this.lastID, ...record });
      });
    });
    return cloudData || localData;
  },

  async updateMaintenanceHistory(id, log) {
    const record = {
      station_id: parseInt(log.station_id, 10),
      station_name: log.station_name || "",
      issue_date: log.issue_date || log.action_date || "",
      action_date: log.action_date,
      action_type: log.action_type,
      category: log.category,
      cause_category: log.cause_category || "기타/일반",
      target_equipment: log.target_equipment,
      action_method: log.action_method || "",
      description: log.description,
      actor_type: log.actor_type,
      worker_name: log.worker_name,
      result_status: log.result_status,
      cost: parseInt(log.cost, 10) || 0,
      memo: log.memo || "",
      updated_at: new Date().toISOString()
    };

    let cloudData = null;
    if (supabase) {
      const { data, error } = await supabase.from("maintenance_history").update(record).eq("id", id).select().single();
      if (!error && data) cloudData = data;
    }

    const localData = await new Promise((resolve, reject) => {
      sqliteDb.run(`
        UPDATE maintenance_history 
        SET station_id = ?, station_name = ?, issue_date = ?, action_date = ?, action_type = ?, category = ?, cause_category = ?, target_equipment = ?, action_method = ?, description = ?, actor_type = ?, worker_name = ?, result_status = ?, cost = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [record.station_id, record.station_name, record.issue_date, record.action_date, record.action_type, record.category, record.cause_category, record.target_equipment, record.action_method, record.description, record.actor_type, record.worker_name, record.result_status, record.cost, record.memo, id], function(err) {
        if (err) return reject(err);
        resolve({ id, ...record });
      });
    });
    return cloudData || localData;
  },

  async deleteMaintenanceHistory(id) {
    if (supabase) {
      await supabase.from("maintenance_history").delete().eq("id", id);
    }
    return new Promise((resolve, reject) => {
      sqliteDb.run("DELETE FROM maintenance_history WHERE id = ?", [id], function(err) {
        if (err) return reject(err);
        resolve(true);
      });
    });
  },

  async batchCreateMaintenanceHistory(records) {
    if (!Array.isArray(records) || records.length === 0) return { count: 0 };
    if (supabase) {
      await supabase.from("maintenance_history").insert(records).catch(err => console.warn("Supabase batch insert warning:", err));
    }

    return new Promise((resolve, reject) => {
      sqliteDb.serialize(() => {
        const stmt = sqliteDb.prepare(`
          INSERT INTO maintenance_history (station_id, station_name, issue_date, action_date, action_type, category, target_equipment, description, actor_type, worker_name, result_status, cost, memo, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of records) {
          stmt.run(
            parseInt(r.station_id, 10),
            r.station_name || "",
            r.issue_date || r.action_date || new Date().toISOString().slice(0, 10),
            r.action_date || new Date().toISOString().slice(0, 10),
            r.action_type || "정기점검",
            r.category || "전원·안전",
            r.target_equipment || "",
            r.description || "",
            r.actor_type || "기술원(자체)",
            r.worker_name || "",
            r.result_status || "완료",
            parseInt(r.cost, 10) || 0,
            r.memo || "",
            r.created_by || "일괄가져오기"
          );
        }
        stmt.finalize((err) => {
          if (err) return reject(err);
          resolve({ count: records.length });
        });
      });
    });
  },

  // Activity Logs
  async getActivityLogs(options = {}) {
    const limit = options.limit || 200;
    if (supabase) {
      let query = supabase
        .from("activity_logs")
        .select("*")
        .not("action_type", "in", '("SYS_EMAIL_CONFIG","SYS_EMAIL_LOG","SYS_HOURLY_SNAPSHOT")')
        .order("id", { ascending: false })
        .limit(limit);
      if (options.username && options.username !== "all") query = query.eq("username", options.username);
      if (options.actionType && options.actionType !== "all") query = query.eq("action_type", options.actionType);
      const { data, error } = await query;
      if (!error && data) return data;
    }
    return new Promise((resolve, reject) => {
      let q = "SELECT * FROM activity_logs";
      let p = [];
      let conds = ["action_type NOT IN ('SYS_EMAIL_CONFIG','SYS_EMAIL_LOG','SYS_HOURLY_SNAPSHOT')"];
      if (options.username && options.username !== "all") { conds.push("username = ?"); p.push(options.username); }
      if (options.actionType && options.actionType !== "all") { conds.push("action_type = ?"); p.push(options.actionType); }
      if (conds.length > 0) q += " WHERE " + conds.join(" AND ");
      q += " ORDER BY id DESC LIMIT ?";
      p.push(limit);
      sqliteDb.all(q, p, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  async logActivity(user, actionType, targetName, details, ip = "") {
    if (!user) return;
    const username = user.username || "unknown";
    const name = user.name || "알수없음";
    const pos = user.position || "팀원";

    if (supabase) {
      supabase.from("activity_logs").insert([{
        username,
        name,
        position: pos,
        action_type: actionType,
        target_name: targetName || "",
        details: details || "",
        ip_address: ip
      }]).then(() => {}).catch(err => console.error("Supabase logActivity error:", err));
    }

    sqliteDb.run(
      "INSERT INTO activity_logs (username, name, position, action_type, target_name, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [username, name, pos, actionType, targetName || "", details || "", ip],
      (err) => {
        if (err) console.error("Failed to record local activity log:", err);
      }
    );
  },

  // -------------------------------------------------------------
  // Cloud-Persisted Email Config & Email Dispatch History
  // -------------------------------------------------------------
  async saveCloudEmailConfig(configObj) {
    if (!supabase || !configObj) return;
    try {
      const jsonStr = JSON.stringify(configObj);
      const { data: existing } = await supabase
        .from("activity_logs")
        .select("id")
        .eq("action_type", "SYS_EMAIL_CONFIG")
        .eq("target_name", "EMAIL_NOTIFICATION_CONFIG")
        .order("id", { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from("activity_logs")
          .update({ details: jsonStr, ip_address: new Date().toISOString() })
          .eq("id", existing[0].id);
      } else {
        await supabase.from("activity_logs").insert([{
          username: "system",
          name: "자동알림엔진",
          position: "시스템",
          action_type: "SYS_EMAIL_CONFIG",
          target_name: "EMAIL_NOTIFICATION_CONFIG",
          details: jsonStr,
          ip_address: new Date().toISOString()
        }]);
      }
    } catch (e) {
      console.warn("⚠️ [Supabase] Failed to save cloud email config:", e.message);
    }
  },

  async loadCloudEmailConfig() {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("details")
        .eq("action_type", "SYS_EMAIL_CONFIG")
        .eq("target_name", "EMAIL_NOTIFICATION_CONFIG")
        .order("id", { ascending: false })
        .limit(1);
      if (!error && data && data.length > 0 && data[0].details) {
        return JSON.parse(data[0].details);
      }
    } catch (e) {
      console.warn("⚠️ [Supabase] Failed to load cloud email config:", e.message);
    }
    return null;
  },

  async saveEmailNotificationLog(logItem) {
    if (!logItem || !logItem.id) return;
    const id = String(logItem.id);
    const timestamp = logItem.timestamp || new Date().toISOString();
    const stationName = logItem.stationName || "전국 관측소 정기 종합 리포트";
    const level = logItem.level || "NORMAL";
    const count = Number(logItem.count) || 0;
    const subject = logItem.subject || "";
    const recipients = logItem.recipients || "";
    const status = logItem.status || "SENT";
    const mode = logItem.mode || "BREVO";
    const errorMsg = logItem.error || "";
    const messageId = logItem.messageId || "";
    const openedAt = logItem.openedAt || "";

    // 1. Save to Local SQLite
    sqliteDb.run(
      `INSERT OR REPLACE INTO email_notification_logs
       (id, timestamp, station_name, level, count, subject, recipients, status, mode, error_msg, message_id, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, timestamp, stationName, level, count, subject, recipients, status, mode, errorMsg, messageId, openedAt],
      (err) => {
        if (err) console.warn("Failed to save local email notification log:", err.message);
      }
    );

    // 2. Save to Supabase Cloud DB so deploy/restart never wipes email logs
    if (supabase) {
      try {
        await supabase.from("activity_logs").insert([{
          username: "system",
          name: "자동알림엔진",
          position: "시스템",
          action_type: "SYS_EMAIL_LOG",
          target_name: messageId || id,
          details: JSON.stringify({
            id,
            timestamp,
            stationName,
            level,
            count,
            subject,
            recipients,
            status,
            mode,
            error: errorMsg,
            messageId,
            openedAt
          }),
          ip_address: status
        }]);
      } catch (e) {
        console.warn("⚠️ [Supabase] Failed to save cloud email log:", e.message);
      }
    }
  },

  async getEmailNotificationLogs(limit = 300) {
    const mergedMap = new Map();

    // 1. Load from Supabase Cloud DB
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("activity_logs")
          .select("details, created_at")
          .eq("action_type", "SYS_EMAIL_LOG")
          .order("id", { ascending: false })
          .limit(limit);
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            try {
              const parsed = JSON.parse(row.details);
              const key = parsed.messageId || parsed.id;
              if (key && !mergedMap.has(key)) {
                mergedMap.set(key, parsed);
              }
            } catch (_) {}
          }
        }
      } catch (e) {
        console.warn("⚠️ [Supabase] Failed to load cloud email logs:", e.message);
      }
    }

    // 2. Load from Local SQLite
    const localRows = await new Promise((resolve) => {
      sqliteDb.all(
        `SELECT * FROM email_notification_logs ORDER BY timestamp DESC LIMIT ?`,
        [limit],
        (err, rows) => resolve(err ? [] : (rows || []))
      );
    });

    for (const r of localRows) {
      const key = r.message_id || r.id;
      if (key && !mergedMap.has(key)) {
        mergedMap.set(key, {
          id: r.id,
          timestamp: r.timestamp,
          stationName: r.station_name,
          level: r.level,
          count: r.count,
          subject: r.subject,
          recipients: r.recipients,
          status: r.status,
          mode: r.mode,
          error: r.error_msg,
          messageId: r.message_id,
          openedAt: r.opened_at
        });
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  async getReconstructedSnapshotChangeEvents() {
    const allRows = await new Promise((resolve) => {
      sqliteDb.all(`SELECT * FROM quality_hourly_snapshots ORDER BY id ASC`, [], (err, rows) => {
        resolve(err ? [] : (rows || []));
      });
    });

    const slots = [];
    const slotMap = new Map();
    for (const r of allRows) {
      if (!slotMap.has(r.hourly_slot)) {
        const entry = { slot: r.hourly_slot, created_at: r.created_at, issueMap: new Map() };
        slotMap.set(r.hourly_slot, entry);
        slots.push(entry);
      }
      if (r.st_code !== "__EMPTY__") {
        const key = `${r.st_code || r.station_name}_${r.category || r.rule_id}`;
        slotMap.get(r.hourly_slot).issueMap.set(key, r);
      }
    }

    const changeEvents = [];
    for (let i = 0; i < slots.length; i++) {
      const curr = slots[i];
      const prev = i > 0 ? slots[i - 1] : null;
      const currIssues = Array.from(curr.issueMap.values());
      const prevIssues = prev ? Array.from(prev.issueMap.values()) : [];

      const prevKeys = new Map(prevIssues.map(x => [`${x.st_code || x.station_name}_${x.category || x.rule_id}`, x]));
      const currKeys = new Map(currIssues.map(x => [`${x.st_code || x.station_name}_${x.category || x.rule_id}`, x]));

      const newIssues = currIssues.filter(x => !prevKeys.has(`${x.st_code || x.station_name}_${x.category || x.rule_id}`));
      const resolvedIssues = prevIssues.filter(x => !currKeys.has(`${x.st_code || x.station_name}_${x.category || x.rule_id}`));

      const hasChanges = (i === 0) || newIssues.length > 0 || resolvedIssues.length > 0;
      if (!hasChanges) continue;

      const totalAbnormalCount = currIssues.length;
      const timeLabel = curr.slot;
      let subject = "";
      let level = "DIGEST";
      if (i === 0) {
        subject = `[관측품질 정각 기준현황] 1시간 이상 이상지점 총 ${totalAbnormalCount}건 (기준점 등록, ${timeLabel} 기준)`;
        level = "DIGEST";
      } else if (newIssues.length > 0 && resolvedIssues.length > 0) {
        subject = `[관측품질 변동알림] 🚨신규 ${newIssues.length}건 발생 / ✅${resolvedIssues.length}건 복구 (총 ${totalAbnormalCount}건 지속, ${timeLabel})`;
        level = "CRITICAL";
      } else if (newIssues.length > 0) {
        subject = `[관측품질 신규이상] 🚨${newIssues[0].station_name} 등 ${newIssues.length}개소 신규 감지 (총 ${totalAbnormalCount}건, ${timeLabel})`;
        level = "CRITICAL";
      } else if (resolvedIssues.length > 0 && totalAbnormalCount === 0) {
        subject = `[관측품질 전 지점 정상화] 🎉전국 223개 관측소 정상 수신 복구 확인 (${timeLabel} 기준)`;
        level = "RESOLVED";
      } else if (resolvedIssues.length > 0) {
        subject = `[관측품질 정상복구] ✅${resolvedIssues[0].station_name} 등 ${resolvedIssues.length}개소 복구 완료 (잔여 이상 ${totalAbnormalCount}건, ${timeLabel})`;
        level = "RESOLVED";
      }

      const newDesc = newIssues.map(n => `${n.station_name}(${n.category === "DATA_MISSING" ? "미수신" : "배터리"})`).join(", ");
      const resDesc = resolvedIssues.map(r => `${r.station_name}(${r.category === "DATA_MISSING" ? "미수신해소" : "배터리정상"})`).join(", ");
      const summaryDetail = [
        newDesc ? `신규: ${newDesc}` : "",
        resDesc ? `복구: ${resDesc}` : ""
      ].filter(Boolean).join(" / ");

      const isoTs = curr.created_at ? (curr.created_at.includes("T") ? curr.created_at : curr.created_at.replace(" ", "T") + "Z") : new Date().toISOString();

      changeEvents.push({
        id: `missed_snap_${curr.slot}`,
        slot: curr.slot,
        timestamp: isoTs,
        stationName: "전국 관측소 정기 종합 리포트",
        level,
        count: totalAbnormalCount,
        subject,
        summaryDetail,
        recipients: "미설정 (배포/리셋으로 초기화됨)",
        status: "MISSED_RESET",
        error: summaryDetail ? `[변동상세] ${summaryDetail}` : "수신처 초기화 상태에서 정각 변동 감지됨",
        mode: "SNAPSHOT_RECOVERED"
      });
    }

    return changeEvents;
  },

  // -------------------------------------------------------------
  // Quality Hourly Snapshots (Diff-based Email Alert & 30-Day Retention)
  // -------------------------------------------------------------
  async saveHourlySnapshot(hourlySlot, abnormalStations = []) {
    // 1. Also persist latest snapshot in Supabase so Render restarts keep the baseline diff
    if (supabase) {
      try {
        const payload = JSON.stringify({
          hourlySlot,
          issues: (abnormalStations || []).map(st => ({
            stCode: st.stCode || "",
            stationName: st.stationName || "",
            gaugeType: st.gaugeType || st.method || "ADVM",
            region: st.region || st.basin || "전국",
            ruleId: st.ruleId || "",
            category: st.category || "",
            continuousCount: st.continuousCount || 6,
            detail: st.detail || st.problem || "",
            problem: st.problem || st.detail || ""
          }))
        });
        const { data: existing } = await supabase
          .from("activity_logs")
          .select("id")
          .eq("action_type", "SYS_HOURLY_SNAPSHOT")
          .eq("target_name", "LATEST_HOURLY_SNAPSHOT")
          .order("id", { ascending: false })
          .limit(1);
        if (existing && existing.length > 0) {
          await supabase
            .from("activity_logs")
            .update({ details: payload, ip_address: hourlySlot })
            .eq("id", existing[0].id);
        } else {
          await supabase.from("activity_logs").insert([{
            username: "system",
            name: "자동알림엔진",
            position: "시스템",
            action_type: "SYS_HOURLY_SNAPSHOT",
            target_name: "LATEST_HOURLY_SNAPSHOT",
            details: payload,
            ip_address: hourlySlot
          }]);
        }
      } catch (e) {
        console.warn("⚠️ [Supabase] Failed to save cloud hourly snapshot:", e.message);
      }
    }

    return new Promise((resolve, reject) => {
      if (!Array.isArray(abnormalStations) || abnormalStations.length === 0) {
        sqliteDb.run(
          `INSERT INTO quality_hourly_snapshots 
           (hourly_slot, st_code, station_name, rule_id, category, continuous_count, problem_detail)
           VALUES (?, '__EMPTY__', '전국정상', 'NONE', 'NORMAL', 0, '전국 관측소 1시간 이상 고장 없음')`,
          [hourlySlot],
          (err) => {
            if (err) console.error("Error saving empty snapshot marker:", err);
            resolve();
          }
        );
        return;
      }

      sqliteDb.serialize(() => {
        const stmt = sqliteDb.prepare(`
          INSERT INTO quality_hourly_snapshots 
          (hourly_slot, st_code, station_name, gauge_type, region, rule_id, category, continuous_count, problem_detail)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const st of abnormalStations) {
          stmt.run([
            hourlySlot,
            st.stCode || "",
            st.stationName || "",
            st.gaugeType || st.method || "ADVM",
            st.region || st.basin || "전국",
            st.ruleId || "",
            st.category || "",
            st.continuousCount || 6,
            st.detail || st.problem || ""
          ]);
        }

        stmt.finalize((err) => {
          if (err) {
            console.error("Error finalizing hourly snapshots insert:", err);
            return reject(err);
          }
          resolve();
        });
      });
    });
  },

  async getLastHourlySnapshot() {
    // 1. Check Supabase Cloud Snapshot first (survives container restarts)
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("activity_logs")
          .select("details")
          .eq("action_type", "SYS_HOURLY_SNAPSHOT")
          .eq("target_name", "LATEST_HOURLY_SNAPSHOT")
          .order("id", { ascending: false })
          .limit(1);
        if (!error && data && data.length > 0 && data[0].details) {
          const parsed = JSON.parse(data[0].details);
          if (parsed && parsed.hourlySlot) {
            return {
              hourlySlot: parsed.hourlySlot,
              issues: Array.isArray(parsed.issues) ? parsed.issues : []
            };
          }
        }
      } catch (e) {
        console.warn("⚠️ [Supabase] Failed to read cloud hourly snapshot:", e.message);
      }
    }

    // 2. Fallback to Local SQLite
    return new Promise((resolve, reject) => {
      sqliteDb.get(
        `SELECT hourly_slot FROM quality_hourly_snapshots ORDER BY id DESC LIMIT 1`,
        [],
        (err, row) => {
          if (err) return reject(err);
          if (!row || !row.hourly_slot) {
            return resolve({ hourlySlot: null, issues: [] });
          }

          const slot = row.hourly_slot;
          sqliteDb.all(
            `SELECT * FROM quality_hourly_snapshots WHERE hourly_slot = ? AND st_code != '__EMPTY__'`,
            [slot],
            (err2, rows) => {
              if (err2) return reject(err2);
              resolve({
                hourlySlot: slot,
                issues: (rows || []).map(r => ({
                  stCode: r.st_code,
                  stationName: r.station_name,
                  gaugeType: r.gauge_type,
                  region: r.region,
                  ruleId: r.rule_id,
                  category: r.category,
                  continuousCount: r.continuous_count,
                  detail: r.problem_detail,
                  problem: r.problem_detail
                }))
              });
            }
          );
        }
      );
    });
  },

  async cleanupOldSnapshots(retentionDays = 30) {
    return new Promise((resolve) => {
      sqliteDb.run(
        `DELETE FROM quality_hourly_snapshots WHERE created_at < datetime('now', '-' || ? || ' days')`,
        [retentionDays],
        function(err) {
          if (err) {
            console.warn("⚠️ [DB] Snapshot retention cleanup error:", err.message);
          } else if (this.changes > 0) {
            console.log(`🧹 [DB] Cleaned up ${this.changes} quality snapshot records older than ${retentionDays} days.`);
          }
          resolve();
        }
      );
    });
  },

  // -------------------------------------------------------------
  // Monitoring Error Response Ledger (오류관리대장 & Rule_Codebook & 시설목록)
  // -------------------------------------------------------------
  _computeDurationDays(firstOccurDate, endDate, errorStatus) {
    if (!firstOccurDate) return null;
    try {
      const start = new Date(firstOccurDate + "T00:00:00");
      if (isNaN(start.getTime())) return null;
      if (endDate && String(endDate).trim() && String(endDate).trim() !== "-") {
        const end = new Date(String(endDate).trim() + "T00:00:00");
        if (!isNaN(end.getTime())) {
          return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
        }
      }
      if (errorStatus === "종료" || errorStatus === "참고") {
        return 0;
      }
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.max(0, Math.round((today - start) / (1000 * 60 * 60 * 24)));
    } catch (e) {
      return null;
    }
  },

  _classifyActorCategory(actionReq, memo) {
    const combined = `${actionReq || ""} ${memo || ""}`;
    if (/유지관리업체|업체|RNS|리버앤씨/i.test(combined)) return "용역사(RNS)";
    if (/수문정보|RVB/i.test(combined)) return "수문정보관리팀";
    if (/AI품질팀/i.test(combined)) return "AI품질팀";
    if (/담당팀|금강1팀|금강2팀|한강|낙동강|영산강|출장|현장 확인/i.test(combined)) return "내부출장직(담당팀)";
    if (/인프라팀|원격점검|전송시스템|수위 영점|선조치/i.test(combined)) return "인프라팀(자체)";
    return "기타/관망";
  },

  async getMonitoringMetadata() {
    const codebook = await new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM error_rule_codebook ORDER BY id ASC", [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
    const stationAssignments = await new Promise((resolve, reject) => {
      sqliteDb.all("SELECT * FROM station_assignments ORDER BY station_name ASC", [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
    return { codebook, stationAssignments };
  },

  async getMonitoringErrorLogs(filters = {}) {
    const allRows = await new Promise((resolve, reject) => {
      sqliteDb.all(
        `SELECT * FROM monitoring_error_logs
         ORDER BY 
           CASE WHEN error_status NOT IN ('종료', '참고') THEN 0 ELSE 1 END ASC,
           check_date DESC,
           id DESC`,
        [],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    // Enrich duration_days dynamically and compute global summary KPIs
    const summary = {
      total: allRows.length,
      unresolvedTotal: 0,
      unresolvedHigh: 0,
      byStatus: {
        "신규": 0,
        "원인확인": 0,
        "조치요청": 0,
        "조치중": 0,
        "정상화확인": 0,
        "종료": 0,
        "보류": 0,
        "참고": 0
      },
      byMethod: {
        "ADVM": 0,
        "EWSV": 0,
        "ADVM/EWSV": 0
      },
      byActor: {
        "용역사(RNS)": { total: 0, active: 0 },
        "내부출장직(담당팀)": { total: 0, active: 0 },
        "수문정보관리팀": { total: 0, active: 0 },
        "AI품질팀": { total: 0, active: 0 },
        "인프라팀(자체)": { total: 0, active: 0 },
        "기타/관망": { total: 0, active: 0 }
      },
      activeByStationCode: {}
    };

    const enriched = allRows.map(r => {
      const isUnresolved = r.error_status !== "종료" && r.error_status !== "참고";
      const calcDur = this._computeDurationDays(r.first_occur_date, r.end_date, r.error_status);
      const duration_days = (r.end_date || isUnresolved) ? calcDur : (r.duration_days !== null ? r.duration_days : calcDur);
      const actorCat = r.action_actor_category || this._classifyActorCategory(r.action_request, r.memo);

      if (summary.byStatus[r.error_status] !== undefined) {
        summary.byStatus[r.error_status]++;
      } else {
        summary.byStatus[r.error_status] = 1;
      }

      if (r.install_method && summary.byMethod[r.install_method] !== undefined) {
        summary.byMethod[r.install_method]++;
      }

      if (!summary.byActor[actorCat]) {
        summary.byActor[actorCat] = { total: 0, active: 0 };
      }
      summary.byActor[actorCat].total++;

      if (isUnresolved) {
        summary.unresolvedTotal++;
        if (r.priority === "높음") summary.unresolvedHigh++;
        summary.byActor[actorCat].active++;
        if (r.station_code && !summary.activeByStationCode[r.station_code]) {
          summary.activeByStationCode[r.station_code] = {
            id: r.id,
            error_code: r.error_code,
            error_name: r.error_name,
            error_status: r.error_status,
            priority: r.priority,
            action_request: r.action_request,
            action_actor_category: actorCat,
            first_occur_date: r.first_occur_date,
            check_date: r.check_date,
            duration_days,
            memo: r.memo
          };
        }
      }

      return {
        ...r,
        duration_days,
        action_actor_category: actorCat,
        is_unresolved: isUnresolved
      };
    });

    // Apply filters
    let filtered = enriched;

    if (filters.stationId && filters.stationId !== "all") {
      filtered = filtered.filter(r => String(r.station_id) === String(filters.stationId));
    }
    if (filters.stationCode && filters.stationCode !== "all") {
      filtered = filtered.filter(r => String(r.station_code) === String(filters.stationCode));
    }
    if (filters.region && filters.region !== "all") {
      filtered = filtered.filter(r => r.region && r.region.includes(filters.region));
    }
    if (filters.installMethod && filters.installMethod !== "all") {
      filtered = filtered.filter(r => r.install_method === filters.installMethod);
    }
    if (filters.errorStatus && filters.errorStatus !== "all") {
      if (filters.errorStatus === "UNRESOLVED") {
        filtered = filtered.filter(r => r.is_unresolved);
      } else if (filters.errorStatus === "UNRESOLVED_HIGH") {
        filtered = filtered.filter(r => r.is_unresolved && r.priority === "높음");
      } else {
        filtered = filtered.filter(r => r.error_status === filters.errorStatus);
      }
    }
    if (filters.priority && filters.priority !== "all") {
      filtered = filtered.filter(r => r.priority === filters.priority);
    }
    if (filters.actorCategory && filters.actorCategory !== "all") {
      filtered = filtered.filter(r => r.action_actor_category === filters.actorCategory);
    }
    if (filters.assignedTeam && filters.assignedTeam !== "all") {
      const teamFilterStr = String(filters.assignedTeam);
      if (teamFilterStr.includes("|")) {
        const [fBasin, fTeam] = teamFilterStr.split("|");
        filtered = filtered.filter(r => (r.region && r.region.includes(fBasin)) && String(r.assigned_team) === String(fTeam));
      } else {
        filtered = filtered.filter(r => String(r.assigned_team) === teamFilterStr);
      }
    }
    if (filters.startDate) {
      filtered = filtered.filter(r => (r.first_occur_date || r.check_date) >= filters.startDate);
    }
    if (filters.endDate) {
      filtered = filtered.filter(r => (r.first_occur_date || r.check_date) <= filters.endDate);
    }
    if (filters.keyword) {
      const kw = String(filters.keyword).trim().toLowerCase();
      if (kw) {
        filtered = filtered.filter(r =>
          (r.station_name || "").toLowerCase().includes(kw) ||
          (r.station_code || "").toLowerCase().includes(kw) ||
          (r.error_code || "").toLowerCase().includes(kw) ||
          (r.error_name || "").toLowerCase().includes(kw) ||
          (r.discoverer || "").toLowerCase().includes(kw) ||
          (r.assigned_manager || "").toLowerCase().includes(kw) ||
          (r.phenomenon || "").toLowerCase().includes(kw) ||
          (r.cause_basis || "").toLowerCase().includes(kw) ||
          (r.action_request || "").toLowerCase().includes(kw) ||
          (r.memo || "").toLowerCase().includes(kw)
        );
      }
    }

    const limit = filters.limit ? parseInt(filters.limit, 10) : 1000;
    return {
      summary,
      totalFiltered: filtered.length,
      data: filtered.slice(0, limit)
    };
  },

  async getStationMonitoringErrorLogs(stationId, stationCode, stationName) {
    const allRes = await this.getMonitoringErrorLogs({ limit: 2000 });
    const rows = allRes.data.filter(r => {
      if (stationCode && r.station_code && String(r.station_code) === String(stationCode)) return true;
      if (stationId && r.station_id && String(r.station_id) === String(stationId)) return true;
      if (stationName && r.station_name && (r.station_name === stationName || r.station_name.includes(stationName))) return true;
      return false;
    });
    const activeIssue = rows.find(r => r.is_unresolved) || null;
    return { rows, activeIssue };
  },

  async createMonitoringErrorLog(data) {
    const today = new Date().toISOString().slice(0, 10);
    const check_date = data.check_date || today;
    const first_occur_date = data.first_occur_date || check_date;
    const error_status = data.error_status || "조치요청";
    const end_date = error_status === "종료" ? (data.end_date || today) : (data.end_date || "");
    const duration_days = this._computeDurationDays(first_occur_date, end_date, error_status);
    const action_actor_category = data.action_actor_category || this._classifyActorCategory(data.action_request, data.memo);

    return new Promise((resolve, reject) => {
      sqliteDb.run(
        `INSERT INTO monitoring_error_logs
         (station_id, station_code, station_name, region, install_method, assigned_team, assigned_manager,
          check_date, first_occur_date, discoverer, error_code, error_name, error_status, priority,
          logger_status, sender_status, phenomenon, cause_basis, action_request, action_actor_category,
          actual_worker, end_date, duration_days, memo, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.station_id || null,
          String(data.station_code || "").trim(),
          String(data.station_name || "").trim(),
          String(data.region || "").trim(),
          String(data.install_method || "EWSV").trim(),
          String(data.assigned_team || "").trim(),
          String(data.assigned_manager || "").trim(),
          check_date,
          first_occur_date,
          String(data.discoverer || "미기록").trim(),
          String(data.error_code || "EWSV-R01").trim(),
          String(data.error_name || "자료 미수신").trim(),
          error_status,
          String(data.priority || "높음").trim(),
          "-",
          "-",
          String(data.phenomenon || "결측").trim(),
          String(data.cause_basis || "-").trim(),
          String(data.action_request || "-").trim(),
          action_actor_category,
          String(data.actual_worker || "").trim(),
          end_date,
          duration_days,
          String(data.memo || "").trim(),
          data.created_by || "관리자"
        ],
        function(err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, ...data, check_date, first_occur_date, end_date, duration_days, action_actor_category });
        }
      );
    });
  },

  async updateMonitoringErrorLog(id, data) {
    const existing = await new Promise((resolve, reject) => {
      sqliteDb.get("SELECT * FROM monitoring_error_logs WHERE id = ?", [id], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
    if (!existing) throw new Error("해당 오류관리대장 이력을 찾을 수 없습니다.");

    const today = new Date().toISOString().slice(0, 10);
    const merged = { ...existing, ...data };
    if (merged.error_status === "종료" && !merged.end_date) {
      merged.end_date = today;
    } else if (merged.error_status !== "종료" && data.error_status && data.error_status !== "종료" && data.clear_end_date) {
      merged.end_date = "";
    }
    const duration_days = this._computeDurationDays(merged.first_occur_date, merged.end_date, merged.error_status);
    const action_actor_category = data.action_actor_category || this._classifyActorCategory(merged.action_request, merged.memo);

    return new Promise((resolve, reject) => {
      sqliteDb.run(
        `UPDATE monitoring_error_logs SET
           station_id = ?, station_code = ?, station_name = ?, region = ?, install_method = ?,
           assigned_team = ?, assigned_manager = ?, check_date = ?, first_occur_date = ?,
           discoverer = ?, error_code = ?, error_name = ?, error_status = ?, priority = ?,
           phenomenon = ?, cause_basis = ?, action_request = ?, action_actor_category = ?,
           actual_worker = ?, end_date = ?, duration_days = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          merged.station_id || null,
          String(merged.station_code || "").trim(),
          String(merged.station_name || "").trim(),
          String(merged.region || "").trim(),
          String(merged.install_method || "").trim(),
          String(merged.assigned_team || "").trim(),
          String(merged.assigned_manager || "").trim(),
          String(merged.check_date || today).trim(),
          String(merged.first_occur_date || today).trim(),
          String(merged.discoverer || "미기록").trim(),
          String(merged.error_code || "").trim(),
          String(merged.error_name || "").trim(),
          String(merged.error_status || "조치요청").trim(),
          String(merged.priority || "높음").trim(),
          String(merged.phenomenon || "-").trim(),
          String(merged.cause_basis || "-").trim(),
          String(merged.action_request || "-").trim(),
          action_actor_category,
          String(merged.actual_worker || "").trim(),
          String(merged.end_date || "").trim(),
          duration_days,
          String(merged.memo || "").trim(),
          id
        ],
        function(err) {
          if (err) return reject(err);
          resolve({ ...merged, id, duration_days, action_actor_category });
        }
      );
    });
  },

  async upsertStationAssignment(data) {
    const code = String(data.station_code || "").trim();
    const name = String(data.station_name || "").trim();
    const region = String(data.region || "").trim();
    const method = String(data.install_method || "EWSV").trim();
    const team = String(data.assigned_team || "").trim();
    const manager = String(data.assigned_manager || "").trim();
    if (!code && !name) throw new Error("관측소 코드 또는 관측소명이 필요합니다.");

    return new Promise((resolve, reject) => {
      sqliteDb.serialize(() => {
        sqliteDb.run(
          `INSERT INTO station_assignments (station_code, station_name, region, install_method, assigned_team, assigned_manager, standard_name)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(station_code) DO UPDATE SET
             station_name = excluded.station_name,
             region = CASE WHEN excluded.region != '' THEN excluded.region ELSE station_assignments.region END,
             install_method = CASE WHEN excluded.install_method != '' THEN excluded.install_method ELSE station_assignments.install_method END,
             assigned_team = excluded.assigned_team,
             assigned_manager = excluded.assigned_manager`,
          [code, name, region, method, team, manager, name]
        );
        if (code) {
          sqliteDb.run(
            `UPDATE monitoring_error_logs SET region = CASE WHEN ? != '' THEN ? ELSE region END, assigned_team = ?, assigned_manager = ? WHERE station_code = ?`,
            [region, region, team, manager, code]
          );
        }
        if (name) {
          sqliteDb.run(
            `UPDATE monitoring_error_logs SET region = CASE WHEN ? != '' THEN ? ELSE region END, assigned_team = ?, assigned_manager = ? WHERE station_name = ?`,
            [region, region, team, manager, name],
            (err) => {
              if (err) return reject(err);
              resolve({ station_code: code, station_name: name, region, install_method: method, assigned_team: team, assigned_manager: manager });
            }
          );
        } else {
          resolve({ station_code: code, station_name: name, region, install_method: method, assigned_team: team, assigned_manager: manager });
        }
      });
    });
  },

  async bulkUpsertStationAssignments(records = []) {
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error("업로드할 지점 담당자 데이터가 없습니다.");
    }

    const cleaned = records
      .map(r => ({
        station_code: String(r.station_code || "").trim(),
        station_name: String(r.station_name || "").trim(),
        region: String(r.region || "").trim(),
        install_method: String(r.install_method || "EWSV").trim(),
        assigned_team: String(r.assigned_team || "").replace(/팀/g, "").trim(),
        assigned_manager: String(r.assigned_manager || "").trim()
      }))
      .filter(r => (r.station_code || r.station_name) && r.assigned_manager);

    if (cleaned.length === 0) {
      throw new Error("유효한 관측소 및 지점 담당자 행이 없습니다.");
    }

    return new Promise((resolve, reject) => {
      sqliteDb.serialize(() => {
        sqliteDb.run("BEGIN TRANSACTION");
        const upsertStmt = sqliteDb.prepare(`
          INSERT INTO station_assignments (station_code, station_name, region, install_method, assigned_team, assigned_manager, standard_name)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(station_code) DO UPDATE SET
            station_name = CASE WHEN excluded.station_name != '' THEN excluded.station_name ELSE station_assignments.station_name END,
            region = CASE WHEN excluded.region != '' THEN excluded.region ELSE station_assignments.region END,
            install_method = CASE WHEN excluded.install_method != '' THEN excluded.install_method ELSE station_assignments.install_method END,
            assigned_team = excluded.assigned_team,
            assigned_manager = excluded.assigned_manager
        `);
        const updateLogByCodeStmt = sqliteDb.prepare(`
          UPDATE monitoring_error_logs
          SET region = CASE WHEN ? != '' THEN ? ELSE region END,
              assigned_team = ?,
              assigned_manager = ?
          WHERE station_code = ?
        `);
        const updateLogByNameStmt = sqliteDb.prepare(`
          UPDATE monitoring_error_logs
          SET region = CASE WHEN ? != '' THEN ? ELSE region END,
              assigned_team = ?,
              assigned_manager = ?
          WHERE station_name = ?
        `);

        for (const item of cleaned) {
          const codeKey = item.station_code || item.station_name;
          upsertStmt.run([
            codeKey,
            item.station_name || codeKey,
            item.region,
            item.install_method,
            item.assigned_team,
            item.assigned_manager,
            item.station_name || codeKey
          ]);
          if (item.station_code) {
            updateLogByCodeStmt.run([item.region, item.region, item.assigned_team, item.assigned_manager, item.station_code]);
          }
          if (item.station_name) {
            updateLogByNameStmt.run([item.region, item.region, item.assigned_team, item.assigned_manager, item.station_name]);
          }
        }

        upsertStmt.finalize();
        updateLogByCodeStmt.finalize();
        updateLogByNameStmt.finalize();

        sqliteDb.run("COMMIT", (err) => {
          if (err) return reject(err);
          // Also sync seed file if present
          try {
            const seedPath = path.join(__dirname, "../data/monitoring_error_seed.json");
            if (fs.existsSync(seedPath)) {
              const seedData = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
              const map = new Map((seedData.stationAssignments || []).map(a => [String(a.station_code || a.station_name), a]));
              for (const c of cleaned) {
                const k = String(c.station_code || c.station_name);
                const prev = map.get(k) || {};
                map.set(k, {
                  ...prev,
                  station_code: c.station_code || prev.station_code || "",
                  station_name: c.station_name || prev.station_name || "",
                  region: c.region || prev.region || "한강",
                  install_method: c.install_method || prev.install_method || "EWSV",
                  assigned_team: c.assigned_team,
                  assigned_manager: c.assigned_manager
                });
              }
              seedData.stationAssignments = Array.from(map.values());
              fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2), "utf-8");
            }
          } catch (_) {}
          resolve({ count: cleaned.length });
        });
      });
    });
  },

  async deleteMonitoringErrorLog(id) {
    return new Promise((resolve, reject) => {
      sqliteDb.run("DELETE FROM monitoring_error_logs WHERE id = ?", [id], function(err) {
        if (err) return reject(err);
        resolve({ deleted: this.changes });
      });
    });
  }
};

function logActivity(user, actionType, targetName, details, ip = "") {
  return dbService.logActivity(user, actionType, targetName, details, ip);
}

module.exports = { db: sqliteDb, dbService, initDb, logActivity };
