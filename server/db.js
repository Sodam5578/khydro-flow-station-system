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
  { u: "admin", p: "admin1234", name: "관리자 (총괄)", pos: "최고관리자", role: "admin", team: "수자원인프라팀", email: "" },
  { u: "kihs01", p: "kihs01", name: "윤영선", pos: "팀장", role: "member", team: "수자원인프라팀", email: "" },
  { u: "kihs02", p: "kihs02", name: "이동오", pos: "팀원", role: "member", team: "수자원인프라팀", email: "" },
  { u: "kihs03", p: "kihs03", name: "나형욱", pos: "팀원", role: "member", team: "수자원인프라팀", email: "" },
  { u: "kihs04", p: "kihs04", name: "박세찬", pos: "팀원", role: "member", team: "수자원인프라팀", email: "" }
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

    // Ensure issue_date column exists if table was previously created
    sqliteDb.run(`ALTER TABLE maintenance_history ADD COLUMN issue_date TEXT`, () => {});
  });

  // B. Seed Supabase Cloud DB
  if (supabase) {
    try {
      // 1. Seed Users in Supabase
      const { data: existingUsers, error: uErr } = await supabase.from("users").select("username, email");
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
              team: user.team,
              email: ""
            });
          }
        }
        console.log("✓ [Supabase] Official 5 accounts verified in cloud.");
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
        advm_count, ewsv_count, calib_2026, calib_count, calib_status, calib_date,
        solar_install, flood_alert, drought_alert, pollution_total,
        water_level_type, ref_water_level, mount_type, shelter_type,
        memo, lat, lon, lat_dms, lon_dms, maintenance_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

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
      if (!error && data) return data;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.run(`
        INSERT INTO schedules (title, station_id, station_name, schedule_type, start_date, end_date, assignee, attendees, status, description, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [s.title, String(s.station_id||""), s.station_name||"", s.schedule_type, s.start_date, s.end_date||s.start_date, s.assignee, s.attendees||"", s.status||"scheduled", s.description||"", s.created_by], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...s });
      });
    });
  },

  async updateSchedule(id, s) {
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
      if (!error && data) return data;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.run(`
        UPDATE schedules 
        SET title = ?, station_id = ?, station_name = ?, schedule_type = ?, start_date = ?, end_date = ?, assignee = ?, attendees = ?, status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [s.title, String(s.station_id||""), s.station_name||"", s.schedule_type, s.start_date, s.end_date||s.start_date, s.assignee, s.attendees||"", s.status||"scheduled", s.description||"", id], function(err) {
        if (err) return reject(err);
        resolve({ id, ...s });
      });
    });
  },

  async deleteSchedule(id) {
    if (supabase) {
      const { data, error } = await supabase.from("schedules").delete().eq("id", id);
      if (!error) return true;
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
      target_equipment: log.target_equipment || "",
      description: log.description || "",
      actor_type: log.actor_type || "기술원(자체)",
      worker_name: log.worker_name || "",
      result_status: log.result_status || "완료",
      cost: parseInt(log.cost, 10) || 0,
      memo: log.memo || "",
      created_by: log.created_by || "관리자"
    };

    if (supabase) {
      const { data, error } = await supabase.from("maintenance_history").insert([record]).select().single();
      if (!error && data) return data;
    }

    return new Promise((resolve, reject) => {
      sqliteDb.run(`
        INSERT INTO maintenance_history (station_id, station_name, issue_date, action_date, action_type, category, target_equipment, description, actor_type, worker_name, result_status, cost, memo, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [record.station_id, record.station_name, record.issue_date, record.action_date, record.action_type, record.category, record.target_equipment, record.description, record.actor_type, record.worker_name, record.result_status, record.cost, record.memo, record.created_by], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, ...record });
      });
    });
  },

  async updateMaintenanceHistory(id, log) {
    const record = {
      station_id: parseInt(log.station_id, 10),
      station_name: log.station_name || "",
      issue_date: log.issue_date || log.action_date || "",
      action_date: log.action_date,
      action_type: log.action_type,
      category: log.category,
      target_equipment: log.target_equipment,
      description: log.description,
      actor_type: log.actor_type,
      worker_name: log.worker_name,
      result_status: log.result_status,
      cost: parseInt(log.cost, 10) || 0,
      memo: log.memo || "",
      updated_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase.from("maintenance_history").update(record).eq("id", id).select().single();
      if (!error && data) return data;
    }

    return new Promise((resolve, reject) => {
      sqliteDb.run(`
        UPDATE maintenance_history 
        SET station_id = ?, station_name = ?, issue_date = ?, action_date = ?, action_type = ?, category = ?, target_equipment = ?, description = ?, actor_type = ?, worker_name = ?, result_status = ?, cost = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [record.station_id, record.station_name, record.issue_date, record.action_date, record.action_type, record.category, record.target_equipment, record.description, record.actor_type, record.worker_name, record.result_status, record.cost, record.memo, id], function(err) {
        if (err) return reject(err);
        resolve({ id, ...record });
      });
    });
  },

  async deleteMaintenanceHistory(id) {
    if (supabase) {
      const { data, error } = await supabase.from("maintenance_history").delete().eq("id", id);
      if (!error) return true;
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
      let query = supabase.from("activity_logs").select("*").order("id", { ascending: false }).limit(limit);
      if (options.username && options.username !== "all") query = query.eq("username", options.username);
      if (options.actionType && options.actionType !== "all") query = query.eq("action_type", options.actionType);
      const { data, error } = await query;
      if (!error && data) return data;
    }
    return new Promise((resolve, reject) => {
      let q = "SELECT * FROM activity_logs";
      let p = [];
      let conds = [];
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
  }
};

function logActivity(user, actionType, targetName, details, ip = "") {
  return dbService.logActivity(user, actionType, targetName, details, ip);
}

module.exports = { db: sqliteDb, dbService, initDb, logActivity };
