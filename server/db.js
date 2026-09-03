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
  { u: "admin", p: "admin1234", name: "관리자 (총괄)", pos: "최고관리자", role: "admin", team: "수자원인프라팀" },
  { u: "kihs01", p: "kihs01", name: "윤영선", pos: "팀장", role: "member", team: "수자원인프라팀" },
  { u: "kihs02", p: "kihs02", name: "이동오", pos: "팀원", role: "member", team: "수자원인프라팀" },
  { u: "kihs03", p: "kihs03", name: "나형욱", pos: "팀원", role: "member", team: "수자원인프라팀" },
  { u: "kihs04", p: "kihs04", name: "박세찬", pos: "팀원", role: "member", team: "수자원인프라팀" }
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
        memo TEXT,
        lat REAL,
        lon REAL,
        lat_dms TEXT,
        lon_dms TEXT,
        maintenance_json TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
  });

  // B. Seed Supabase Cloud DB
  if (supabase) {
    try {
      // 1. Seed Users in Supabase
      const { data: existingUsers, error: uErr } = await supabase.from("users").select("username");
      if (!uErr) {
        const existingSet = new Set((existingUsers || []).map(u => u.username));
        for (const user of officialUsers) {
          if (!existingSet.has(user.u)) {
            const hash = bcrypt.hashSync(user.p, 10);
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
    if (supabase) {
      const { data, error } = await supabase.from("users").select("*").eq("username", username).maybeSingle();
      if (!error && data) return data;
    }
    return new Promise((resolve, reject) => {
      sqliteDb.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
        if (err) return reject(err);
        resolve(row);
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
      const { data, error } = await supabase.from("stations").update(updateFields).eq("id", id).select();
      if (!error) return data;
    }
    // Fallback SQLite update
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
